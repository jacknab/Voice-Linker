/**
 * Engagement Engine — ivr-default.ts integration module.
 *
 * Tracks per-call behavioral metrics and injects personality-driven voice
 * interruptions between profile plays. Completely decoupled from core call
 * flow — it only reads/writes its own in-memory state map and returns
 * structured decisions for the IVR to act on.
 *
 * Integration surface (all used from ivr-default.ts):
 *   initEngagementState   — call when a caller first enters browse-profiles
 *   trackSkip             — call on every profile skip (digit 2)
 *   trackMessageSent      — call after a message is saved
 *   trackActivity         — call on any other keypress (keeps idle timer reset)
 *   getInterruption       — call before each profile play; returns prompt or null
 *   startBustedGame       — call when a game_invite prompt fires
 *   isGameTarget          — returns true when the current profile is the bust target
 *   markGameTargetPassed  — call when target profile was skipped without a bust
 *   processBust           — call when caller presses 8
 *   cleanupEngagementState — call on call hangup
 *   getEngagementState    — for read-only inspection in ivr-default.ts
 */

// ── Personality types ─────────────────────────────────────────────────────────

export interface PersonalityContext {
  id: number | null;
  name: string;
  toneStyle: string;
  lines: Record<string, string[]>; // PromptCategory → custom voice lines
}

export interface PersonalitySessionConfig {
  /** How to assign a personality per session */
  mode: "rotate" | "lock_first" | "escalate";
  /** All active personalities sorted by sortOrder */
  personalities: PersonalityContext[];
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromptCategory =
  | "picky"
  | "idle"
  | "flirty"
  | "dominant"
  | "game_invite"
  | "reengagement"
  | "reward";

export type PromptTone =
  | "playful"
  | "teasing"
  | "seductive"
  | "commanding"
  | "comedic";

export type FollowUpAction = "start_game" | "suggest_send_message" | null;

export interface EngagementPrompt {
  id: string;
  category: PromptCategory;
  tone: PromptTone;
  trigger: {
    minSkips?: number;
    maxSkips?: number;
    minMessagesSent?: number;
    maxMessagesSent?: number;
    minSessionSeconds?: number;
    maxSessionSeconds?: number;
    requireNoGameStarted?: boolean;
  };
  lineText: string;
  followUpAction?: FollowUpAction;
  /** Seconds before this exact prompt can fire again for the same caller. */
  cooldownSeconds: number;
}

export interface CallerEngagementState {
  callSid: string;
  userId: string;
  sessionStartMs: number;
  greetingsSkipped: number;
  messagesSent: number;
  lastActivityMs: number;
  lastInterruptionMs: number;
  /** promptId → timestamp when its cooldown expires */
  promptCooldowns: Record<string, number>;
  /** IDs of the last 5 prompts used (for variety enforcement) */
  recentPromptIds: string[];
  interruptionCount: number;
  /** No interruptions before this timestamp — set after each interruption */
  globalCooldownUntil: number;

  // ── Personality ────────────────────────────────────────────────────────────
  /** All active personalities for this session (sorted) — used for escalate mode */
  sessionPersonalities: PersonalityContext[];
  personalityMode: "rotate" | "lock_first" | "escalate";
  /** Index into sessionPersonalities currently active */
  activePersonalityIndex: number;

  // ── Busted game ────────────────────────────────────────────────────────────
  gameStarted: boolean;
  gameCompleted: boolean;
  /** userId of the admin-uploaded profile chosen as the bust target */
  gameBustTargetUserId: string | null;
  /** True once the target profile has been injected into the browse queue */
  gameBustTargetInjected: boolean;
  /** True after the target profile was played and the caller didn't press 8 */
  gameBustMissed: boolean;
  gameBustedCorrectly: boolean;
}

// ── Prompt Library ────────────────────────────────────────────────────────────

export const PROMPT_LIBRARY: EngagementPrompt[] = [

  // ─── picky ──────────────────────────────────────────────────────────────────
  {
    id: "picky_01",
    category: "picky",
    tone: "comedic",
    trigger: { minSkips: 8, maxMessagesSent: 0 },
    lineText:
      "Wow. Still browsing? You might officially be the most selective man on the line tonight. Honestly... we love the standards.",
    cooldownSeconds: 240,
  },
  {
    id: "picky_02",
    category: "picky",
    tone: "teasing",
    trigger: { minSkips: 12, maxMessagesSent: 0 },
    lineText:
      "You have skipped more guys tonight than a DJ skips bad tracks. What exactly are you looking for? Asking for a friend.",
    cooldownSeconds: 300,
  },
  {
    id: "picky_03",
    category: "picky",
    tone: "playful",
    trigger: { minSkips: 5, maxMessagesSent: 0, maxSessionSeconds: 180 },
    lineText:
      "Nobody catching your attention yet? That's okay. The right voice is out there. Keep listening.",
    cooldownSeconds: 180,
  },
  {
    id: "picky_04",
    category: "picky",
    tone: "comedic",
    trigger: { minSkips: 20, maxMessagesSent: 0 },
    lineText:
      "Twenty skips. You have set a new record. We are genuinely impressed. And also a little worried about you. Send someone a message.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 360,
  },
  {
    id: "picky_05",
    category: "picky",
    tone: "teasing",
    trigger: { minSkips: 10, maxMessagesSent: 0, minSessionSeconds: 120 },
    lineText:
      "You have been at this a while and nobody has caught your ear yet. Or... are you just nervous to reach out first?",
    cooldownSeconds: 260,
  },
  {
    id: "picky_06",
    category: "picky",
    tone: "playful",
    trigger: { minSkips: 30, maxMessagesSent: 0 },
    lineText:
      "Thirty skips. Thirty. At this point you are just collecting experiences. Pick one. Any one. You can always send another message tomorrow.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 420,
  },

  // ─── flirty ─────────────────────────────────────────────────────────────────
  {
    id: "flirty_01",
    category: "flirty",
    tone: "seductive",
    trigger: { minSkips: 3, maxMessagesSent: 0, maxSessionSeconds: 120 },
    lineText:
      "You are making me blush just watching you browse. Somebody out here really wants to hear from you tonight.",
    cooldownSeconds: 200,
  },
  {
    id: "flirty_02",
    category: "flirty",
    tone: "playful",
    trigger: { minSkips: 5, maxMessagesSent: 0 },
    lineText:
      "Between you and me? Some of these guys have been waiting a long time for someone exactly like you to send them a message.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 200,
  },
  {
    id: "flirty_03",
    category: "flirty",
    tone: "seductive",
    trigger: { minSkips: 7, maxMessagesSent: 0, minSessionSeconds: 90 },
    lineText:
      "Mmm. You clearly have taste. Not everyone holds out this long. The right voice is closer than you think — I can feel it.",
    cooldownSeconds: 260,
  },
  {
    id: "flirty_04",
    category: "flirty",
    tone: "teasing",
    trigger: { minSkips: 4, maxMessagesSent: 0, maxSessionSeconds: 90 },
    lineText:
      "A little picky tonight, are we? That is actually kind of attractive. Don't let it stop you from saying hello.",
    cooldownSeconds: 180,
  },

  // ─── dominant ───────────────────────────────────────────────────────────────
  {
    id: "dominant_01",
    category: "dominant",
    tone: "commanding",
    trigger: { minSkips: 15, maxMessagesSent: 0 },
    lineText:
      "Stop. Take a breath. Pick one and send a message. You can absolutely do this.",
    cooldownSeconds: 300,
  },
  {
    id: "dominant_02",
    category: "dominant",
    tone: "commanding",
    trigger: { minSkips: 25, maxMessagesSent: 0 },
    lineText:
      "I am stepping in. The very next caller you hear — send him a message. No more skipping. You've earned this.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 400,
  },
  {
    id: "dominant_03",
    category: "dominant",
    tone: "commanding",
    trigger: { minSkips: 18, maxMessagesSent: 0, minSessionSeconds: 200 },
    lineText:
      "You have been in charge long enough. Now let someone else have a chance. Press 1 and send that message.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 350,
  },

  // ─── idle ───────────────────────────────────────────────────────────────────
  {
    id: "idle_01",
    category: "idle",
    tone: "playful",
    trigger: { maxSkips: 2, minSessionSeconds: 50 },
    lineText:
      "Hey. Still there? The guys on the line are wondering about you.",
    cooldownSeconds: 120,
  },
  {
    id: "idle_02",
    category: "idle",
    tone: "comedic",
    trigger: { maxSkips: 1, minSessionSeconds: 65 },
    lineText:
      "Did you fall asleep? No judgment. But there is someone on this line who would love to hear from you tonight.",
    cooldownSeconds: 160,
  },
  {
    id: "idle_03",
    category: "idle",
    tone: "playful",
    trigger: { maxSkips: 3, minSessionSeconds: 40 },
    lineText:
      "Take your time. No rush. The right person will be worth the wait.",
    cooldownSeconds: 100,
  },

  // ─── reengagement ───────────────────────────────────────────────────────────
  {
    id: "reengagement_01",
    category: "reengagement",
    tone: "playful",
    trigger: { minSkips: 4, minSessionSeconds: 150 },
    lineText:
      "Hey, you have been here a while. Have you tried sending a message yet? It takes two seconds — and the reply might surprise you.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 210,
  },
  {
    id: "reengagement_02",
    category: "reengagement",
    tone: "teasing",
    trigger: { minSkips: 8, minSessionSeconds: 200 },
    lineText:
      "You are one of tonight's most dedicated browsers. Do not let that go to waste — one message could change your whole evening.",
    cooldownSeconds: 260,
  },
  {
    id: "reengagement_03",
    category: "reengagement",
    tone: "playful",
    trigger: { minSessionSeconds: 300, minSkips: 10 },
    lineText:
      "Five minutes in and still exploring. You clearly know what you want. Trust your gut and reach out to someone.",
    cooldownSeconds: 320,
  },
  {
    id: "reengagement_04",
    category: "reengagement",
    tone: "seductive",
    trigger: { minSessionSeconds: 240, minSkips: 6 },
    lineText:
      "You have put in the time. You deserve a connection tonight. Someone out here is waiting for exactly your energy.",
    cooldownSeconds: 280,
  },

  // ─── game_invite ────────────────────────────────────────────────────────────
  // These fire at most once per session (cooldown = 99999s).
  // followUpAction 'start_game' triggers the Busted game setup in ivr-default.ts.
  {
    id: "game_invite_01",
    category: "game_invite",
    tone: "playful",
    trigger: { minSessionSeconds: 180, minSkips: 5, requireNoGameStarted: true },
    lineText:
      "Okay, I have a secret. We have hidden one of our AI voices among the real callers tonight. Press 8 any time you think you have caught it. Get it right and we will give you a little gift.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },
  {
    id: "game_invite_02",
    category: "game_invite",
    tone: "comedic",
    trigger: { minSessionSeconds: 240, minSkips: 8, requireNoGameStarted: true },
    lineText:
      "Pop quiz. Somewhere in the next few callers, there is an AI pretending to be a real guy. Think you can spot the faker? Press 8 when you think you found it. Get it right and win free time.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },
  {
    id: "game_invite_03",
    category: "game_invite",
    tone: "teasing",
    trigger: { minSessionSeconds: 300, minSkips: 12, requireNoGameStarted: true },
    lineText:
      "Since you have been listening so carefully, here is a little challenge. One of the next voices is not quite human. Press 8 if you catch the AI. A reward is waiting for whoever figures it out.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },

  // ─── reward ─────────────────────────────────────────────────────────────────
  {
    id: "reward_01",
    category: "reward",
    tone: "playful",
    trigger: { minMessagesSent: 1, minSessionSeconds: 60 },
    lineText:
      "Look at you — already making connections. That is exactly what this is all about.",
    cooldownSeconds: 300,
  },
  {
    id: "reward_02",
    category: "reward",
    tone: "seductive",
    trigger: { minMessagesSent: 2, minSessionSeconds: 120 },
    lineText:
      "Two messages already? You are absolutely on fire tonight. Keep it up.",
    cooldownSeconds: 360,
  },
  {
    id: "reward_03",
    category: "reward",
    tone: "comedic",
    trigger: { minMessagesSent: 3, minSessionSeconds: 150 },
    lineText:
      "Three messages sent. You are the most active person on the line right now. Somebody is going to be very happy tonight.",
    cooldownSeconds: 400,
  },
];

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum gap between any two interruptions (ms). */
const GLOBAL_COOLDOWN_MS = 50_000;
/** Grace period after the call starts before any interruption can fire (ms). */
const START_GRACE_MS = 60_000;
/** Maximum total interruptions per session. */
const MAX_INTERRUPTIONS = 8;
/** Bonus seconds awarded for a correct bust. */
export const BUST_REWARD_SECONDS = 300; // 5 minutes
/** Category priority for prompt selection (lower index = higher priority). */
const PRIORITY: PromptCategory[] = [
  "reward",
  "game_invite",
  "dominant",
  "picky",
  "flirty",
  "reengagement",
  "idle",
];

// ── Internal state ────────────────────────────────────────────────────────────

const states = new Map<string, CallerEngagementState>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize engagement state for a new browsing session.
 * personalityConfig is optional — if omitted a fallback "Roger" personality is used.
 */
export function initEngagementState(
  callSid: string,
  userId: string,
  personalityConfig?: PersonalitySessionConfig,
): void {
  if (states.has(callSid)) return; // Already initialized

  const fallback: PersonalityContext = {
    id: null,
    name: "Roger",
    toneStyle: "comedic",
    lines: {},
  };

  const personalities = personalityConfig?.personalities.length
    ? personalityConfig.personalities
    : [fallback];

  const mode = personalityConfig?.mode ?? "rotate";

  // Select initial personality based on mode
  let initialIndex = 0;
  if (mode === "rotate") {
    initialIndex = Math.floor(Math.random() * personalities.length);
  }
  // lock_first and escalate both start at index 0

  states.set(callSid, {
    callSid,
    userId,
    sessionStartMs: Date.now(),
    greetingsSkipped: 0,
    messagesSent: 0,
    lastActivityMs: Date.now(),
    lastInterruptionMs: 0,
    promptCooldowns: {},
    recentPromptIds: [],
    interruptionCount: 0,
    globalCooldownUntil: Date.now() + START_GRACE_MS,
    sessionPersonalities: personalities,
    personalityMode: mode,
    activePersonalityIndex: initialIndex,
    gameStarted: false,
    gameCompleted: false,
    gameBustTargetUserId: null,
    gameBustTargetInjected: false,
    gameBustMissed: false,
    gameBustedCorrectly: false,
  });
}

/** Returns the name of the currently active personality for this call session. */
export function getActivePersonalityName(callSid: string): string {
  const s = states.get(callSid);
  if (!s || s.sessionPersonalities.length === 0) return "Roger";
  return s.sessionPersonalities[s.activePersonalityIndex]?.name ?? "Roger";
}

/** Returns a random custom voice line for the given category from the active personality,
 *  or null if none are defined (caller should fall back to the default prompt library). */
function getPersonalityLine(s: CallerEngagementState, category: string): string | null {
  // Escalate: pick personality tier based on skip count
  if (s.personalityMode === "escalate" && s.sessionPersonalities.length > 1) {
    let tier = 0;
    if (s.greetingsSkipped >= 15) tier = Math.min(2, s.sessionPersonalities.length - 1);
    else if (s.greetingsSkipped >= 6) tier = Math.min(1, s.sessionPersonalities.length - 1);
    if (tier !== s.activePersonalityIndex) {
      s.activePersonalityIndex = tier;
    }
  }

  const personality = s.sessionPersonalities[s.activePersonalityIndex];
  if (!personality) return null;
  const lines = personality.lines[category];
  if (!lines || lines.length === 0) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

/** Call when the caller presses 2 (skip) on a profile. */
export function trackSkip(callSid: string): void {
  const s = states.get(callSid);
  if (!s) return;
  s.greetingsSkipped++;
  s.lastActivityMs = Date.now();
}

/** Call after a voice message is successfully saved. */
export function trackMessageSent(callSid: string): void {
  const s = states.get(callSid);
  if (!s) return;
  s.messagesSent++;
  s.lastActivityMs = Date.now();
}

/** Reset the idle timer on any keypress. */
export function trackActivity(callSid: string): void {
  const s = states.get(callSid);
  if (s) s.lastActivityMs = Date.now();
}

/** Read-only access to the current engagement state. */
export function getEngagementState(callSid: string): CallerEngagementState | undefined {
  return states.get(callSid);
}

/** Remove state on call hangup. */
export function cleanupEngagementState(callSid: string): void {
  states.delete(callSid);
}

/**
 * Evaluate whether an interruption should fire right now.
 *
 * Returns the best-matching prompt or null.
 * SIDE EFFECT: If a prompt is returned, its cooldowns are immediately set so
 * that calling this function again will not return the same prompt for a while.
 */
export function getInterruption(callSid: string): EngagementPrompt | null {
  const s = states.get(callSid);
  if (!s) return null;

  const now = Date.now();
  if (now < s.globalCooldownUntil) return null;
  if (s.interruptionCount >= MAX_INTERRUPTIONS) return null;

  const sessionSec = (now - s.sessionStartMs) / 1000;

  // Sort by priority category then iterate
  const sorted = [...PROMPT_LIBRARY].sort(
    (a, b) => PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category),
  );

  for (const prompt of sorted) {
    // Per-prompt cooldown
    const cd = s.promptCooldowns[prompt.id];
    if (cd && now < cd) continue;

    // Avoid repeating the last 3 prompts (except game invites — one per session)
    if (
      prompt.category !== "game_invite" &&
      s.recentPromptIds.slice(-3).includes(prompt.id)
    )
      continue;

    // Game-specific guards
    if (prompt.category === "game_invite" && (s.gameStarted || s.gameCompleted))
      continue;
    if (prompt.trigger.requireNoGameStarted && s.gameStarted) continue;

    // Trigger condition checks
    const t = prompt.trigger;
    if (t.minSkips !== undefined && s.greetingsSkipped < t.minSkips) continue;
    if (t.maxSkips !== undefined && s.greetingsSkipped > t.maxSkips) continue;
    if (t.minMessagesSent !== undefined && s.messagesSent < t.minMessagesSent) continue;
    if (t.maxMessagesSent !== undefined && s.messagesSent > t.maxMessagesSent) continue;
    if (t.minSessionSeconds !== undefined && sessionSec < t.minSessionSeconds) continue;
    if (t.maxSessionSeconds !== undefined && sessionSec > t.maxSessionSeconds) continue;

    // ✓ This prompt matches — consume it
    s.promptCooldowns[prompt.id] = now + prompt.cooldownSeconds * 1000;
    s.recentPromptIds = [...s.recentPromptIds.slice(-4), prompt.id];
    s.lastInterruptionMs = now;
    s.globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
    s.interruptionCount++;

    // Override lineText with personality-specific line if available
    const personalityLine = getPersonalityLine(s, prompt.category);
    if (personalityLine) {
      return { ...prompt, lineText: personalityLine };
    }

    return prompt;
  }

  return null;
}

/**
 * Start the Busted game for this call session.
 *
 * @param adminUserIds  userIds of admin-uploaded profiles currently available
 *                      (fetched by the caller from storage or browse queue)
 * @returns The chosen target userId, or null if unable to start
 */
export function startBustedGame(
  callSid: string,
  adminUserIds: string[],
): string | null {
  const s = states.get(callSid);
  if (!s || s.gameStarted || adminUserIds.length === 0) return null;
  const target =
    adminUserIds[Math.floor(Math.random() * adminUserIds.length)];
  s.gameStarted = true;
  s.gameBustTargetUserId = target;
  s.gameBustTargetInjected = false;
  return target;
}

/** Mark the target as injected into the browse queue. */
export function markGameTargetInjected(callSid: string): void {
  const s = states.get(callSid);
  if (s) s.gameBustTargetInjected = true;
}

/**
 * Returns true if the given profileUserId is the current bust target
 * and the game is still in progress.
 */
export function isGameTarget(callSid: string, profileUserId: string): boolean {
  const s = states.get(callSid);
  if (!s || !s.gameStarted || s.gameCompleted) return false;
  return s.gameBustTargetUserId === profileUserId;
}

/**
 * Call when the bust target profile was played but the caller did NOT press 8
 * (they pressed 1/2 to advance past it).  Ends the game as a miss.
 */
export function markGameTargetPassed(callSid: string): void {
  const s = states.get(callSid);
  if (!s || !s.gameStarted || s.gameCompleted) return;
  s.gameCompleted = true;
  s.gameBustMissed = true;
}

/**
 * Process a bust attempt (digit 8).
 *
 * @param callSid           the current call
 * @param currentProfileUserId  the profile the caller is currently listening to
 * @returns outcome and bonus seconds (0 unless win)
 */
export function processBust(
  callSid: string,
  currentProfileUserId: string,
): { result: "win" | "miss" | "no_game"; bonusSeconds: number } {
  const s = states.get(callSid);
  if (!s || !s.gameStarted || s.gameCompleted) {
    return { result: "no_game", bonusSeconds: 0 };
  }

  if (s.gameBustTargetUserId === currentProfileUserId) {
    s.gameCompleted = true;
    s.gameBustedCorrectly = true;
    return { result: "win", bonusSeconds: BUST_REWARD_SECONDS };
  }

  // Wrong profile — one chance only, game is over
  s.gameCompleted = true;
  s.gameBustMissed = true;
  return { result: "miss", bonusSeconds: 0 };
}
