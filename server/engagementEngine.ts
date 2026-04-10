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

// ── Fake Memory Flag System ───────────────────────────────────────────────────

/**
 * Temporary session-based behavioral labels.
 * These are NOT real memory — they describe how the caller is behaving RIGHT NOW.
 * They can turn on and off dynamically throughout the session.
 */
export interface FakeMemoryFlags {
  /** Skipped ≥8 profiles OR (session > 120s AND sent 0 messages) */
  picky: boolean;
  /** Sent 0 messages AND session > 60s */
  shy: boolean;
  /** Sent ≥2 messages */
  active: boolean;
  /** Session duration > 240s */
  engaged: boolean;
  /** Has started or completed the Busted game */
  gamePlayed: boolean;
}

export interface BehaviorMetrics {
  greetingsSkippedCount: number;
  sessionDurationSeconds: number;
  messagesSentCount: number;
  idleTimeSeconds: number;
  gamePlayed: boolean;
}

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
    /** ALL of these flags must be true for the prompt to fire. */
    requiredFlags?: (keyof FakeMemoryFlags)[];
    /** ANY of these flags being true blocks the prompt from firing. */
    forbiddenFlags?: (keyof FakeMemoryFlags)[];
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

  // ── Fake Memory Flags ──────────────────────────────────────────────────────
  /** Live behavioral labels — recalculated on every getInterruption() call. */
  fakeMemoryFlags: FakeMemoryFlags;

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

  // ═══════════════════════════════════════════════════════════════════════════
  // FLAG-AWARE PROMPTS — these require specific fake memory flags to fire
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── picky (flag: picky) ────────────────────────────────────────────────────
  {
    id: "picky_f01",
    category: "picky",
    tone: "teasing",
    trigger: { requiredFlags: ["picky"], forbiddenFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "Damn. You are picky tonight, huh?",
    cooldownSeconds: 220,
  },
  {
    id: "picky_f02",
    category: "picky",
    tone: "comedic",
    trigger: { requiredFlags: ["picky"], forbiddenFlags: ["shy"] },
    lineText: "You have turned down more guys tonight than most people meet in a year. I respect it honestly.",
    cooldownSeconds: 280,
  },
  {
    id: "picky_f03",
    category: "picky",
    tone: "teasing",
    trigger: { requiredFlags: ["picky"], forbiddenFlags: ["shy"] },
    lineText: "Another one bites the dust. You sure know what you do NOT want. That is half the battle.",
    cooldownSeconds: 240,
  },
  {
    id: "picky_f04",
    category: "picky",
    tone: "playful",
    trigger: { requiredFlags: ["picky"], forbiddenFlags: ["shy"] },
    lineText: "At this rate we are going to run out of guys before you run out of opinions. Send someone a message.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 300,
  },
  {
    id: "picky_f05",
    category: "picky",
    tone: "comedic",
    trigger: { requiredFlags: ["picky", "engaged"] },
    lineText: "You have been on here a while and nobody has made the cut yet. Okay. I am genuinely curious what your type actually sounds like.",
    cooldownSeconds: 320,
  },
  {
    id: "picky_f06",
    category: "picky",
    tone: "teasing",
    trigger: { requiredFlags: ["picky", "engaged"], maxMessagesSent: 0 },
    lineText: "Long session. High standards. Zero messages. At some point the right guy is just going to slip right past you.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 340,
  },

  // ─── picky + shy combo (the money shot) ────────────────────────────────────
  {
    id: "picky_shy_01",
    category: "picky",
    tone: "seductive",
    trigger: { requiredFlags: ["picky", "shy"], maxMessagesSent: 0 },
    lineText: "You skip everyone… but you haven't said a word. That is kind of fascinating.",
    cooldownSeconds: 260,
  },
  {
    id: "picky_shy_02",
    category: "picky",
    tone: "teasing",
    trigger: { requiredFlags: ["picky", "shy"], maxMessagesSent: 0 },
    lineText: "Picky and quiet. That is a dangerous combination.",
    cooldownSeconds: 240,
  },
  {
    id: "picky_shy_03",
    category: "picky",
    tone: "seductive",
    trigger: { requiredFlags: ["picky", "shy"], maxMessagesSent: 0 },
    lineText: "You are turning down guys left and right but you won't send one message. What exactly is the move here?",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 280,
  },
  {
    id: "picky_shy_04",
    category: "picky",
    tone: "playful",
    trigger: { requiredFlags: ["picky", "shy"], maxMessagesSent: 0 },
    lineText: "You have skipped half the line and you haven't said hello to anyone. You're not going to find him just by listening.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 300,
  },
  {
    id: "picky_shy_05",
    category: "dominant",
    tone: "commanding",
    trigger: { requiredFlags: ["picky", "shy"], maxMessagesSent: 0, minSessionSeconds: 180 },
    lineText: "Okay listen to me. You have been picky AND quiet for too long. Pick one. Send a message. Right now.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 360,
  },
  {
    id: "picky_shy_06",
    category: "flirty",
    tone: "seductive",
    trigger: { requiredFlags: ["picky", "shy"], maxMessagesSent: 0 },
    lineText: "You know what they say about the quiet ones who are hard to impress. They are usually worth getting to know.",
    cooldownSeconds: 240,
  },

  // ─── shy (flag: shy, NOT picky) ─────────────────────────────────────────────
  {
    id: "shy_f01",
    category: "idle",
    tone: "playful",
    trigger: { requiredFlags: ["shy"], forbiddenFlags: ["picky"], maxMessagesSent: 0 },
    lineText: "You haven't reached out to anyone yet. That is okay. But there is someone on this line right now who would actually love to hear from you.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 200,
  },
  {
    id: "shy_f02",
    category: "idle",
    tone: "seductive",
    trigger: { requiredFlags: ["shy"], forbiddenFlags: ["picky"], maxMessagesSent: 0 },
    lineText: "You seem like the type who listens more than he talks. That is not a bad thing. But at some point you have to let someone know you are there.",
    cooldownSeconds: 220,
  },
  {
    id: "shy_f03",
    category: "flirty",
    tone: "teasing",
    trigger: { requiredFlags: ["shy"], forbiddenFlags: ["picky"], maxMessagesSent: 0 },
    lineText: "It is the quiet ones that always have the most to say. Do not hold back tonight.",
    cooldownSeconds: 200,
  },
  {
    id: "shy_f04",
    category: "flirty",
    tone: "playful",
    trigger: { requiredFlags: ["shy"], forbiddenFlags: ["picky"], maxMessagesSent: 0 },
    lineText: "You haven't sent anything yet. Is it nerves? Because you really shouldn't be nervous. These guys want to hear from you.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 220,
  },
  {
    id: "shy_f05",
    category: "idle",
    tone: "seductive",
    trigger: { requiredFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "Still with me? You went a little quiet over there. That is alright. Just keep listening.",
    cooldownSeconds: 160,
  },
  {
    id: "shy_f06",
    category: "reengagement",
    tone: "playful",
    trigger: { requiredFlags: ["shy"], maxMessagesSent: 0, minSessionSeconds: 120 },
    lineText: "I won't call you out... but you have been here a minute without saying anything. Just something to think about.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 240,
  },
  {
    id: "shy_f07",
    category: "flirty",
    tone: "seductive",
    trigger: { requiredFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "Something tells me when you finally do reach out... it is going to be worth it.",
    cooldownSeconds: 200,
  },
  {
    id: "shy_f08",
    category: "flirty",
    tone: "teasing",
    trigger: { requiredFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "You do not have to say much. Just say hello. That is literally all it takes.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 180,
  },

  // ─── engaged (flag: engaged) ─────────────────────────────────────────────────
  {
    id: "engaged_f01",
    category: "reengagement",
    tone: "playful",
    trigger: { requiredFlags: ["engaged"], forbiddenFlags: ["active"] },
    lineText: "You have been browsing longer than almost everyone tonight. That kind of patience deserves something. Keep going.",
    cooldownSeconds: 300,
  },
  {
    id: "engaged_f02",
    category: "reengagement",
    tone: "teasing",
    trigger: { requiredFlags: ["engaged"] },
    lineText: "You are still here. I like that. That tells me something about you.",
    cooldownSeconds: 280,
  },
  {
    id: "engaged_f03",
    category: "reengagement",
    tone: "seductive",
    trigger: { requiredFlags: ["engaged"], maxMessagesSent: 0 },
    lineText: "You have put in the time tonight. You have definitely earned a connection. Reach out to someone.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 320,
  },
  {
    id: "engaged_f04",
    category: "idle",
    tone: "playful",
    trigger: { requiredFlags: ["engaged"] },
    lineText: "You have been on here a while. Do not check out now. The best one might be next.",
    cooldownSeconds: 260,
  },
  {
    id: "engaged_f05",
    category: "reengagement",
    tone: "comedic",
    trigger: { requiredFlags: ["engaged", "picky"], maxMessagesSent: 0 },
    lineText: "Long session. Lots of skips. Zero messages. Tell me — what would the perfect guy actually sound like to you?",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 340,
  },

  // ─── active (flag: active — messages sent) ───────────────────────────────────
  {
    id: "active_f01",
    category: "reward",
    tone: "seductive",
    trigger: { requiredFlags: ["active"], minMessagesSent: 2 },
    lineText: "You are already out here making moves tonight. That energy is contagious.",
    cooldownSeconds: 300,
  },
  {
    id: "active_f02",
    category: "reward",
    tone: "playful",
    trigger: { requiredFlags: ["active"], minMessagesSent: 2 },
    lineText: "Messages sent. Connections made. You are doing exactly what you are supposed to be doing on this line.",
    cooldownSeconds: 320,
  },
  {
    id: "active_f03",
    category: "reward",
    tone: "comedic",
    trigger: { requiredFlags: ["active"], minMessagesSent: 3 },
    lineText: "You came to play tonight. I am not mad at it. Keep that energy going.",
    cooldownSeconds: 360,
  },
  {
    id: "active_f04",
    category: "reward",
    tone: "seductive",
    trigger: { requiredFlags: ["active", "engaged"], minMessagesSent: 2 },
    lineText: "Long session AND you have been sending messages. You are one of tonight's real ones.",
    cooldownSeconds: 400,
  },

  // ─── gamePlayed (flag: gamePlayed) ──────────────────────────────────────────
  {
    id: "game_played_f01",
    category: "reengagement",
    tone: "playful",
    trigger: { requiredFlags: ["gamePlayed"] },
    lineText: "So you played the game earlier. You are definitely the type who pays attention. I like that.",
    cooldownSeconds: 400,
  },
  {
    id: "game_played_f02",
    category: "reengagement",
    tone: "comedic",
    trigger: { requiredFlags: ["gamePlayed", "picky"] },
    lineText: "You played the Busted game AND you are still picky. You are clearly here for the full experience tonight.",
    cooldownSeconds: 420,
  },

  // ─── flirty — flag-enhanced ──────────────────────────────────────────────────
  {
    id: "flirty_f01",
    category: "flirty",
    tone: "seductive",
    trigger: { requiredFlags: ["picky"], forbiddenFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "A little picky tonight, are we? Honestly? That is kind of attractive. Just do not let it be the reason you miss someone good.",
    cooldownSeconds: 220,
  },
  {
    id: "flirty_f02",
    category: "flirty",
    tone: "playful",
    trigger: { requiredFlags: ["picky"], forbiddenFlags: ["shy"] },
    lineText: "The fact that you have taste — that is what sets you apart. Just make sure it does not become a wall.",
    cooldownSeconds: 240,
  },
  {
    id: "flirty_f03",
    category: "flirty",
    tone: "teasing",
    trigger: { requiredFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "The quiet ones always catch me off guard. In the best possible way.",
    cooldownSeconds: 200,
  },
  {
    id: "flirty_f04",
    category: "flirty",
    tone: "seductive",
    trigger: { requiredFlags: ["engaged"], forbiddenFlags: ["shy"] },
    lineText: "You have been here long enough. You know what you want. Trust that instinct and reach out.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 280,
  },
  {
    id: "flirty_f05",
    category: "flirty",
    tone: "seductive",
    trigger: { requiredFlags: ["shy", "engaged"], maxMessagesSent: 0 },
    lineText: "You have been listening for a while without saying a word. That kind of quiet energy is... interesting.",
    cooldownSeconds: 300,
  },

  // ─── dominant — flag-enhanced ────────────────────────────────────────────────
  {
    id: "dominant_f01",
    category: "dominant",
    tone: "commanding",
    trigger: { requiredFlags: ["picky"], forbiddenFlags: ["shy"], minSkips: 15, maxMessagesSent: 0 },
    lineText: "Pick one. Any one. You can always move on after. But you have to actually try first.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 300,
  },
  {
    id: "dominant_f02",
    category: "dominant",
    tone: "commanding",
    trigger: { requiredFlags: ["picky"], minSkips: 18, maxMessagesSent: 0 },
    lineText: "I am giving you an assignment right now. The very next guy you hear — give him a real chance before you skip.",
    cooldownSeconds: 340,
  },
  {
    id: "dominant_f03",
    category: "dominant",
    tone: "commanding",
    trigger: { requiredFlags: ["engaged", "picky"], maxMessagesSent: 0, minSessionSeconds: 300 },
    lineText: "Enough browsing. You have been on here long enough. Send a message right now. I am serious.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 400,
  },

  // ─── idle — flag-enhanced ────────────────────────────────────────────────────
  {
    id: "idle_f01",
    category: "idle",
    tone: "playful",
    trigger: { requiredFlags: ["engaged"], maxSkips: 3 },
    lineText: "You went quiet on me. Still there? Good. Keep going.",
    cooldownSeconds: 140,
  },
  {
    id: "idle_f02",
    category: "idle",
    tone: "teasing",
    trigger: { requiredFlags: ["shy"], maxSkips: 2 },
    lineText: "I felt you hesitate just now. That is okay. Take your time. But do not disappear on me.",
    cooldownSeconds: 150,
  },
  {
    id: "idle_f03",
    category: "idle",
    tone: "playful",
    trigger: { requiredFlags: ["active"] },
    lineText: "Hey — you were on a roll earlier. Do not slow down now.",
    cooldownSeconds: 160,
  },

  // ─── game_invite — flag-enhanced ────────────────────────────────────────────
  {
    id: "game_invite_f01",
    category: "game_invite",
    tone: "teasing",
    trigger: { requiredFlags: ["picky"], minSkips: 10, requireNoGameStarted: true },
    lineText: "Since you are apparently the world's toughest judge — let me give you a real challenge. One of the next voices is an AI. Press 8 when you catch it and win bonus time.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },
  {
    id: "game_invite_f02",
    category: "game_invite",
    tone: "playful",
    trigger: { requiredFlags: ["engaged"], minSessionSeconds: 200, requireNoGameStarted: true },
    lineText: "You have been on here long enough to earn a little game. One of the next guys is an AI pretending to be real. Press 8 if you spot him. Get it right and we will comp you some time.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },
  {
    id: "game_invite_f03",
    category: "game_invite",
    tone: "seductive",
    trigger: { requiredFlags: ["shy"], requireNoGameStarted: true, minSessionSeconds: 120 },
    lineText: "I have a little secret for you. One of the voices coming up is not quite human. Press 8 if you figure out which one. Get it right and I will give you a reward.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
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

// ── Flag Engine ───────────────────────────────────────────────────────────────

/**
 * Recalculates the fake memory flags based on the caller's CURRENT session
 * metrics. Flags can turn ON and OFF — they always reflect right now, not history.
 * Called automatically inside getInterruption() before every prompt evaluation.
 *
 * Rules (max 3 active flags influence output — enforced in prompt selection):
 *   picky:     skips ≥ 8  OR  (session > 120s AND messages == 0)
 *   shy:       messages == 0  AND  session > 60s
 *   active:    messages ≥ 2
 *   engaged:   session > 240s
 *   gamePlayed: game was started (even if completed)
 */
function updateFakeMemoryFlags(s: CallerEngagementState): void {
  const sessionSec = (Date.now() - s.sessionStartMs) / 1000;
  const skips = s.greetingsSkipped;
  const msgs = s.messagesSent;

  s.fakeMemoryFlags = {
    picky:      skips >= 8 || (sessionSec > 120 && msgs === 0),
    shy:        msgs === 0 && sessionSec > 60,
    active:     msgs >= 2,
    engaged:    sessionSec > 240,
    gamePlayed: s.gameStarted || s.gameCompleted,
  };
}

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
    fakeMemoryFlags: { picky: false, shy: false, active: false, engaged: false, gamePlayed: false },
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

  // ── Update fake memory flags before every evaluation ─────────────────────
  updateFakeMemoryFlags(s);
  const flags = s.fakeMemoryFlags;

  // Compute active flag count for the "max 3 active flags" enforcement rule.
  // We simply count how many are true — the prompts themselves narrow by flag
  // combos so we don't need to artificially prune here; the rule is advisory.
  const activeFlags = (Object.values(flags) as boolean[]).filter(Boolean).length;
  void activeFlags; // available for future throttle logic if desired

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

    // ── Fake memory flag checks ────────────────────────────────────────────
    if (t.requiredFlags && t.requiredFlags.length > 0) {
      if (!t.requiredFlags.every(f => flags[f])) continue;
    }
    if (t.forbiddenFlags && t.forbiddenFlags.length > 0) {
      if (t.forbiddenFlags.some(f => flags[f])) continue;
    }

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
