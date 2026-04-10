/**
 * Engagement Engine — Roger Mood Engine
 *
 * Roger is the one and only AI host character. His personality never changes —
 * but his MOOD does. Mood is computed from live behavioral flags and shifts
 * every 60–90 seconds (or immediately after a major caller event).
 *
 * Moods:
 *   normal    — warm, patient, gently nudging
 *   petty     — sassy, calling out behavior with deadpan humor
 *   activated — energized, hyped, celebrating engagement
 *   chaos     — game-show energy, unpredictable, playful
 *
 * Integration surface (all used from ivr-default.ts):
 *   initEngagementState    — call when a caller first enters browse-profiles
 *   trackSkip              — call on every profile skip (digit 2)
 *   trackMessageSent       — call after a message is saved
 *   trackActivity          — call on any other keypress (idle timer reset)
 *   getInterruption        — call before each profile play; returns prompt or null
 *   startBustedGame        — call when a game_invite prompt fires
 *   isGameTarget           — true when the current profile is the bust target
 *   markGameTargetPassed   — call when target profile was skipped without a bust
 *   processBust            — call when caller presses 8
 *   cleanupEngagementState — call on call hangup
 *   getEngagementState     — read-only inspection
 *   getActivePersonalityName — always returns "Roger"
 *   getRogerMood           — returns current mood for logging/inspection
 */

// ── Core types ────────────────────────────────────────────────────────────────

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

// ── Roger Mood Engine ─────────────────────────────────────────────────────────

/**
 * Roger's 4 moods — same character, different energy.
 *   normal    — relaxed, warm, gently encouraging
 *   petty     — sassy, calling out the caller's behavior with deadpan humor
 *   activated — energized, hyped, celebratory of engagement
 *   chaos     — game-show energy, playful chaos after the Busted game
 */
export type RogerMood = "normal" | "petty" | "activated" | "chaos";

// ── Fake Memory Flags ─────────────────────────────────────────────────────────

/**
 * Temporary session-based behavioral labels.
 * NOT real memory — only describes how the caller is behaving RIGHT NOW.
 * Flags can turn ON and OFF dynamically throughout the session.
 */
export interface FakeMemoryFlags {
  /** Skipped ≥8 profiles OR (session > 120s AND sent 0 messages) */
  picky: boolean;
  /** Sent 0 messages AND session > 60s */
  shy: boolean;
  /** Sent ≥2 messages */
  active: boolean;
  /** Session running > 240s */
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

// ── Prompt types ──────────────────────────────────────────────────────────────

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
    /**
     * Prompt only fires when Roger is in one of these moods.
     * Omit to allow in any mood.
     */
    requiredMoods?: RogerMood[];
    /**
     * Additional raw flag checks for fine-grained control.
     * All listed flags must be true.
     */
    requiredFlags?: (keyof FakeMemoryFlags)[];
    /** Any listed flag being true blocks this prompt. */
    forbiddenFlags?: (keyof FakeMemoryFlags)[];
  };
  lineText: string;
  followUpAction?: FollowUpAction;
  /** Seconds before this exact prompt can re-fire for the same caller. */
  cooldownSeconds: number;
}

// ── Session state ─────────────────────────────────────────────────────────────

export interface CallerEngagementState {
  callSid: string;
  userId: string;
  sessionStartMs: number;
  greetingsSkipped: number;
  messagesSent: number;
  lastActivityMs: number;
  lastInterruptionMs: number;
  /** promptId → expiry timestamp of its cooldown */
  promptCooldowns: Record<string, number>;
  /** IDs of the last 5 prompts used (variety enforcement) */
  recentPromptIds: string[];
  interruptionCount: number;
  /** No interruptions before this timestamp */
  globalCooldownUntil: number;

  // ── Fake Memory Flags ──────────────────────────────────────────────────────
  fakeMemoryFlags: FakeMemoryFlags;

  // ── Roger Mood Engine ──────────────────────────────────────────────────────
  rogerMood: RogerMood;
  lastMoodSwitchMs: number;
  /**
   * When true the next getInterruption() call forces a mood recalculation
   * regardless of the 60–90 s cooldown. Set by trackSkip/trackMessageSent.
   */
  forceMoodRecalc: boolean;

  // ── Busted game ────────────────────────────────────────────────────────────
  gameStarted: boolean;
  gameCompleted: boolean;
  gameBustTargetUserId: string | null;
  gameBustTargetInjected: boolean;
  gameBustMissed: boolean;
  gameBustedCorrectly: boolean;
}

// ── Prompt Library ────────────────────────────────────────────────────────────

export const PROMPT_LIBRARY: EngagementPrompt[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // BASE PROMPTS — fire in any mood (no requiredMoods)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── picky ──────────────────────────────────────────────────────────────────
  {
    id: "picky_01",
    category: "picky",
    tone: "comedic",
    trigger: { minSkips: 8, maxMessagesSent: 0 },
    lineText: "Wow. Still browsing? You might officially be the most selective man on the line tonight. Honestly... we love the standards.",
    cooldownSeconds: 240,
  },
  {
    id: "picky_02",
    category: "picky",
    tone: "teasing",
    trigger: { minSkips: 12, maxMessagesSent: 0 },
    lineText: "You have skipped more guys tonight than a DJ skips bad tracks. What exactly are you looking for? Asking for a friend.",
    cooldownSeconds: 300,
  },
  {
    id: "picky_03",
    category: "picky",
    tone: "playful",
    trigger: { minSkips: 5, maxMessagesSent: 0, maxSessionSeconds: 180 },
    lineText: "Nobody catching your attention yet? That is okay. The right voice is out there. Keep listening.",
    cooldownSeconds: 180,
  },
  {
    id: "picky_04",
    category: "picky",
    tone: "comedic",
    trigger: { minSkips: 20, maxMessagesSent: 0 },
    lineText: "Twenty skips. You have set a new record. We are genuinely impressed. And also a little worried about you. Send someone a message.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 360,
  },
  {
    id: "picky_05",
    category: "picky",
    tone: "teasing",
    trigger: { minSkips: 10, maxMessagesSent: 0, minSessionSeconds: 120 },
    lineText: "You have been at this a while and nobody has caught your ear yet. Or... are you just nervous to reach out first?",
    cooldownSeconds: 260,
  },
  {
    id: "picky_06",
    category: "picky",
    tone: "playful",
    trigger: { minSkips: 30, maxMessagesSent: 0 },
    lineText: "Thirty skips. At this point you are just collecting experiences. Pick one. Any one. You can always send another message tomorrow.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 420,
  },

  // ─── flirty ─────────────────────────────────────────────────────────────────
  {
    id: "flirty_01",
    category: "flirty",
    tone: "seductive",
    trigger: { minSkips: 3, maxMessagesSent: 0, maxSessionSeconds: 120 },
    lineText: "You are making me blush just watching you browse. Somebody out here really wants to hear from you tonight.",
    cooldownSeconds: 200,
  },
  {
    id: "flirty_02",
    category: "flirty",
    tone: "playful",
    trigger: { minSkips: 5, maxMessagesSent: 0 },
    lineText: "Between you and me? Some of these guys have been waiting a long time for someone exactly like you to send them a message.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 200,
  },
  {
    id: "flirty_03",
    category: "flirty",
    tone: "seductive",
    trigger: { minSkips: 7, maxMessagesSent: 0, minSessionSeconds: 90 },
    lineText: "Mmm. You clearly have taste. Not everyone holds out this long. The right voice is closer than you think.",
    cooldownSeconds: 260,
  },
  {
    id: "flirty_04",
    category: "flirty",
    tone: "teasing",
    trigger: { minSkips: 4, maxMessagesSent: 0, maxSessionSeconds: 90 },
    lineText: "A little picky tonight, are we? That is actually kind of attractive. Do not let it stop you from saying hello.",
    cooldownSeconds: 180,
  },

  // ─── dominant ───────────────────────────────────────────────────────────────
  {
    id: "dominant_01",
    category: "dominant",
    tone: "commanding",
    trigger: { minSkips: 15, maxMessagesSent: 0 },
    lineText: "Stop. Take a breath. Pick one and send a message. You can absolutely do this.",
    cooldownSeconds: 300,
  },
  {
    id: "dominant_02",
    category: "dominant",
    tone: "commanding",
    trigger: { minSkips: 25, maxMessagesSent: 0 },
    lineText: "I am stepping in. The very next caller you hear — send him a message. No more skipping. You have earned this.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 400,
  },
  {
    id: "dominant_03",
    category: "dominant",
    tone: "commanding",
    trigger: { minSkips: 18, maxMessagesSent: 0, minSessionSeconds: 200 },
    lineText: "You have been in charge long enough. Now let someone else have a chance. Press 1 and send that message.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 350,
  },

  // ─── idle ───────────────────────────────────────────────────────────────────
  {
    id: "idle_01",
    category: "idle",
    tone: "playful",
    trigger: { maxSkips: 2, minSessionSeconds: 50 },
    lineText: "Hey. Still there? The guys on the line are wondering about you.",
    cooldownSeconds: 120,
  },
  {
    id: "idle_02",
    category: "idle",
    tone: "comedic",
    trigger: { maxSkips: 1, minSessionSeconds: 65 },
    lineText: "Did you fall asleep? No judgment. But there is someone on this line who would love to hear from you tonight.",
    cooldownSeconds: 160,
  },
  {
    id: "idle_03",
    category: "idle",
    tone: "playful",
    trigger: { maxSkips: 3, minSessionSeconds: 40 },
    lineText: "Take your time. No rush. The right person will be worth the wait.",
    cooldownSeconds: 100,
  },

  // ─── reengagement ───────────────────────────────────────────────────────────
  {
    id: "reengagement_01",
    category: "reengagement",
    tone: "playful",
    trigger: { minSkips: 4, minSessionSeconds: 150 },
    lineText: "Hey, you have been here a while. Have you tried sending a message yet? It takes two seconds — and the reply might surprise you.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 210,
  },
  {
    id: "reengagement_02",
    category: "reengagement",
    tone: "teasing",
    trigger: { minSkips: 8, minSessionSeconds: 200 },
    lineText: "You are one of tonight's most dedicated browsers. Do not let that go to waste — one message could change your whole evening.",
    cooldownSeconds: 260,
  },
  {
    id: "reengagement_03",
    category: "reengagement",
    tone: "playful",
    trigger: { minSessionSeconds: 300, minSkips: 10 },
    lineText: "Five minutes in and still exploring. You clearly know what you want. Trust your gut and reach out to someone.",
    cooldownSeconds: 320,
  },
  {
    id: "reengagement_04",
    category: "reengagement",
    tone: "seductive",
    trigger: { minSessionSeconds: 240, minSkips: 6 },
    lineText: "You have put in the time. You deserve a connection tonight. Someone out here is waiting for exactly your energy.",
    cooldownSeconds: 280,
  },

  // ─── game_invite ────────────────────────────────────────────────────────────
  {
    id: "game_invite_01",
    category: "game_invite",
    tone: "playful",
    trigger: { minSessionSeconds: 180, minSkips: 5, requireNoGameStarted: true },
    lineText: "Okay, I have a secret. We have hidden one of our AI voices among the real callers tonight. Press 8 any time you think you have caught it. Get it right and we will give you a little gift.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },
  {
    id: "game_invite_02",
    category: "game_invite",
    tone: "comedic",
    trigger: { minSessionSeconds: 240, minSkips: 8, requireNoGameStarted: true },
    lineText: "Pop quiz. Somewhere in the next few callers, there is an AI pretending to be a real guy. Think you can spot the faker? Press 8 when you think you found it. Get it right and win free time.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },
  {
    id: "game_invite_03",
    category: "game_invite",
    tone: "teasing",
    trigger: { minSessionSeconds: 300, minSkips: 12, requireNoGameStarted: true },
    lineText: "Since you have been listening so carefully, here is a little challenge. One of the next voices is not quite human. Press 8 if you catch the AI. A reward is waiting for whoever figures it out.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },

  // ─── reward ─────────────────────────────────────────────────────────────────
  {
    id: "reward_01",
    category: "reward",
    tone: "playful",
    trigger: { minMessagesSent: 1, minSessionSeconds: 60 },
    lineText: "Look at you — already making connections. That is exactly what this is all about.",
    cooldownSeconds: 300,
  },
  {
    id: "reward_02",
    category: "reward",
    tone: "seductive",
    trigger: { minMessagesSent: 2, minSessionSeconds: 120 },
    lineText: "Two messages already? You are absolutely on fire tonight. Keep it up.",
    cooldownSeconds: 360,
  },
  {
    id: "reward_03",
    category: "reward",
    tone: "comedic",
    trigger: { minMessagesSent: 3, minSessionSeconds: 150 },
    lineText: "Three messages sent. You are the most active person on the line right now. Somebody is going to be very happy tonight.",
    cooldownSeconds: 400,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD: PETTY — Roger is sassy, calling out picky/quiet behavior
  // Fires when: picky flag is true (≥8 skips or session>2min with 0 messages)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "petty_01",
    category: "picky",
    tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0 },
    lineText: "Damn. You are picky tonight, huh?",
    cooldownSeconds: 200,
  },
  {
    id: "petty_02",
    category: "picky",
    tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0 },
    lineText: "Another one bites the dust. You sure know what you do NOT want. That is half the battle, I guess.",
    cooldownSeconds: 240,
  },
  {
    id: "petty_03",
    category: "picky",
    tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0 },
    lineText: "You have turned down more guys tonight than most people meet in a year. I respect it, honestly.",
    cooldownSeconds: 260,
  },
  {
    id: "petty_04",
    category: "picky",
    tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0 },
    lineText: "I am not judging. Actually... I might be judging a little. Just a little.",
    cooldownSeconds: 220,
  },
  {
    id: "petty_05",
    category: "picky",
    tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0 },
    lineText: "At this rate we are going to run out of guys before you run out of opinions. You might want to lower the bar just slightly.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 300,
  },
  {
    id: "petty_06",
    category: "picky",
    tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minSessionSeconds: 120 },
    lineText: "You keep passing on these guys but you won't reach out to any of them either. I see exactly what is happening here.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 280,
  },
  // picky + shy combo (the two-flag special)
  {
    id: "petty_shy_01",
    category: "picky",
    tone: "seductive",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "You skip everyone… but you have not said a word. That is kind of fascinating.",
    cooldownSeconds: 260,
  },
  {
    id: "petty_shy_02",
    category: "picky",
    tone: "teasing",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "Picky and quiet. A dangerous combination.",
    cooldownSeconds: 240,
  },
  {
    id: "petty_shy_03",
    category: "picky",
    tone: "comedic",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "Turning down guys left and right and you won't send one message. What exactly is the move here?",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 280,
  },
  {
    id: "petty_shy_04",
    category: "dominant",
    tone: "commanding",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0, minSessionSeconds: 180 },
    lineText: "Okay. Listen to me. Picky AND quiet for this long? Pick one. Send a message. Right now.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 360,
  },
  {
    id: "petty_flirty_01",
    category: "flirty",
    tone: "teasing",
    trigger: { requiredMoods: ["petty"], forbiddenFlags: ["shy"], maxMessagesSent: 0 },
    lineText: "High standards are attractive. Just make sure they do not become the reason you miss someone actually good.",
    cooldownSeconds: 220,
  },
  {
    id: "petty_game_invite",
    category: "game_invite",
    tone: "teasing",
    trigger: { requiredMoods: ["petty"], minSkips: 10, requireNoGameStarted: true },
    lineText: "Since you are apparently the world's toughest judge tonight — let me give you a real challenge. One of the next voices is an AI. Press 8 when you catch it and win bonus time.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD: ACTIVATED — Roger is hyped, celebrating engagement
  // Fires when: active flag (≥2 messages) OR engaged flag (session > 4 min)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "activated_01",
    category: "reward",
    tone: "playful",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2 },
    lineText: "Look at you. Already making moves tonight. That is exactly the energy.",
    cooldownSeconds: 280,
  },
  {
    id: "activated_02",
    category: "reward",
    tone: "seductive",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2 },
    lineText: "You are out here actually doing it. Messages sent, connections made. This is what the line is for.",
    cooldownSeconds: 300,
  },
  {
    id: "activated_03",
    category: "reward",
    tone: "comedic",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 3 },
    lineText: "You came to play tonight. I am not mad at it. Not even a little.",
    cooldownSeconds: 320,
  },
  {
    id: "activated_04",
    category: "reengagement",
    tone: "playful",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 240, maxMessagesSent: 1 },
    lineText: "You have been on here a while and you are still locked in. I respect the commitment. Keep going.",
    cooldownSeconds: 280,
  },
  {
    id: "activated_05",
    category: "reengagement",
    tone: "seductive",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 300, maxMessagesSent: 0 },
    lineText: "Long session. You have clearly got patience. Somebody on this line deserves to hear from you tonight.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 300,
  },
  {
    id: "activated_06",
    category: "reward",
    tone: "teasing",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2, minSessionSeconds: 240 },
    lineText: "Long session AND messages sent. You are one of tonight's real ones.",
    cooldownSeconds: 380,
  },
  {
    id: "activated_07",
    category: "flirty",
    tone: "seductive",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 200 },
    lineText: "You have been here long enough. You know what you want. Trust that instinct and reach out to someone.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 260,
  },
  {
    id: "activated_game_invite",
    category: "game_invite",
    tone: "playful",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 200, requireNoGameStarted: true },
    lineText: "You have been on here long enough to earn a little game. One of the next guys is an AI pretending to be real. Press 8 if you spot him — get it right and win free time.",
    followUpAction: "start_game",
    cooldownSeconds: 99999,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD: CHAOS — Roger is in game-show mode, unpredictable, playful
  // Fires when: gamePlayed flag is true
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "chaos_01",
    category: "reengagement",
    tone: "comedic",
    trigger: { requiredMoods: ["chaos"] },
    lineText: "Oh you played the game. You are a whole different type of caller tonight and I am absolutely here for it.",
    cooldownSeconds: 380,
  },
  {
    id: "chaos_02",
    category: "reengagement",
    tone: "playful",
    trigger: { requiredMoods: ["chaos"] },
    lineText: "After everything you have done tonight, I still do not know what to expect from you. And honestly? I love it.",
    cooldownSeconds: 360,
  },
  {
    id: "chaos_03",
    category: "flirty",
    tone: "teasing",
    trigger: { requiredMoods: ["chaos"] },
    lineText: "You played the Busted game. You are clearly here for the full experience. Let's keep it interesting.",
    cooldownSeconds: 340,
  },
  {
    id: "chaos_04",
    category: "reengagement",
    tone: "comedic",
    trigger: { requiredMoods: ["chaos"], maxMessagesSent: 0 },
    lineText: "You played the game AND you still haven't messaged anyone. You are out here doing this your own way. I respect the chaos.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 400,
  },
  {
    id: "chaos_05",
    category: "picky",
    tone: "comedic",
    trigger: { requiredMoods: ["chaos"], minSkips: 10, maxMessagesSent: 0 },
    lineText: "You played the game AND you are still picky. You are absolutely having fun tonight. Just admit it.",
    cooldownSeconds: 360,
  },
  {
    id: "chaos_06",
    category: "reward",
    tone: "playful",
    trigger: { requiredMoods: ["chaos"], minMessagesSent: 1 },
    lineText: "You played the game, you sent a message... what are you going to do next? This has been quite the session.",
    cooldownSeconds: 400,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD: NORMAL — Roger is warm, patient, quietly encouraging
  // Fires in normal mood (default when no strong behavioral signal)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "normal_01",
    category: "idle",
    tone: "playful",
    trigger: { requiredMoods: ["normal"], maxSkips: 3 },
    lineText: "Take your time. I am not going anywhere. The right voice will catch your ear when you least expect it.",
    cooldownSeconds: 150,
  },
  {
    id: "normal_02",
    category: "flirty",
    tone: "playful",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 60 },
    lineText: "You seem like the type who listens more than you talk. Nothing wrong with that. But at some point you have to let someone know you are there.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 200,
  },
  {
    id: "normal_03",
    category: "reengagement",
    tone: "seductive",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 90 },
    lineText: "It is the quiet ones that always have the most to say. Do not hold back tonight.",
    cooldownSeconds: 220,
  },
  {
    id: "normal_04",
    category: "flirty",
    tone: "playful",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 80 },
    lineText: "You haven't sent anything yet. That is okay. But these guys want to hear from you — do not make them wait too long.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 200,
  },
  {
    id: "normal_05",
    category: "idle",
    tone: "seductive",
    trigger: { requiredMoods: ["normal"], maxSkips: 2, minSessionSeconds: 60 },
    lineText: "Still with me? Good. Just keep listening. The right one might be next.",
    cooldownSeconds: 140,
  },
  {
    id: "normal_06",
    category: "reengagement",
    tone: "playful",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 120 },
    lineText: "Something tells me when you finally do reach out... it is going to be worth it.",
    followUpAction: "suggest_send_message",
    cooldownSeconds: 220,
  },
  {
    id: "normal_game_invite",
    category: "game_invite",
    tone: "seductive",
    trigger: { requiredMoods: ["normal"], minSessionSeconds: 120, requireNoGameStarted: true },
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
export const BUST_REWARD_SECONDS = 300;
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

// ── Mood Engine ───────────────────────────────────────────────────────────────

/**
 * Derive the target mood from the caller's current behavioral flags.
 *
 * Priority: chaos > activated > petty > normal
 */
function computeTargetMood(flags: FakeMemoryFlags): RogerMood {
  if (flags.gamePlayed)              return "chaos";
  if (flags.active || flags.engaged) return "activated";
  if (flags.picky)                   return "petty";
  return "normal";
}

/**
 * Recalculate fake memory flags then update Roger's mood if:
 *   - forceMoodRecalc is set (major event), OR
 *   - the 60–90 second mood-switch cooldown has expired.
 *
 * This is called inside getInterruption() before prompt evaluation.
 * It is also triggered immediately (bypassing cooldown) by trackSkip,
 * trackMessageSent, and game events.
 */
function refreshMood(s: CallerEngagementState, force = false): void {
  const now = Date.now();
  const sessionSec = (now - s.sessionStartMs) / 1000;
  const skips = s.greetingsSkipped;
  const msgs  = s.messagesSent;

  // Update fake memory flags
  s.fakeMemoryFlags = {
    picky:     skips >= 8 || (sessionSec > 120 && msgs === 0),
    shy:       msgs === 0 && sessionSec > 60,
    active:    msgs >= 2,
    engaged:   sessionSec > 240,
    gamePlayed: s.gameStarted || s.gameCompleted,
  };

  // Respect the 60–90 s mood switch cooldown unless forced
  const minCooldown = 60_000 + Math.random() * 30_000;
  if (!force && !s.forceMoodRecalc && (now - s.lastMoodSwitchMs) < minCooldown) return;

  const target = computeTargetMood(s.fakeMemoryFlags);
  if (target !== s.rogerMood) {
    s.rogerMood = target;
    s.lastMoodSwitchMs = now;
    console.log(`[roger-mood] callSid=${s.callSid} mood→${target}`);
  }
  s.forceMoodRecalc = false;
}

// ── Internal state ────────────────────────────────────────────────────────────

const states = new Map<string, CallerEngagementState>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize engagement state for a new browsing session.
 */
export function initEngagementState(callSid: string, userId: string): void {
  if (states.has(callSid)) return;

  states.set(callSid, {
    callSid,
    userId,
    fakeMemoryFlags: { picky: false, shy: false, active: false, engaged: false, gamePlayed: false },
    rogerMood: "normal",
    lastMoodSwitchMs: 0,
    forceMoodRecalc: false,
    sessionStartMs: Date.now(),
    greetingsSkipped: 0,
    messagesSent: 0,
    lastActivityMs: Date.now(),
    lastInterruptionMs: 0,
    promptCooldowns: {},
    recentPromptIds: [],
    interruptionCount: 0,
    globalCooldownUntil: Date.now() + START_GRACE_MS,
    gameStarted: false,
    gameCompleted: false,
    gameBustTargetUserId: null,
    gameBustTargetInjected: false,
    gameBustMissed: false,
    gameBustedCorrectly: false,
  });
}

/** Roger is always the host. Returns "Roger". */
export function getActivePersonalityName(_callSid: string): string {
  return "Roger";
}

/** Returns Roger's current mood for logging or external inspection. */
export function getRogerMood(callSid: string): RogerMood {
  return states.get(callSid)?.rogerMood ?? "normal";
}

/** Call when the caller presses 2 (skip) on a profile. */
export function trackSkip(callSid: string): void {
  const s = states.get(callSid);
  if (!s) return;
  s.greetingsSkipped++;
  s.lastActivityMs  = Date.now();
  s.forceMoodRecalc = true;
}

/** Call after a voice message is successfully saved. */
export function trackMessageSent(callSid: string): void {
  const s = states.get(callSid);
  if (!s) return;
  s.messagesSent++;
  s.lastActivityMs  = Date.now();
  s.forceMoodRecalc = true;
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
 * SIDE EFFECT: If a prompt is returned its cooldowns are set immediately so
 * calling this function again won't return the same prompt for a while.
 */
export function getInterruption(callSid: string): EngagementPrompt | null {
  const s = states.get(callSid);
  if (!s) return null;

  const now = Date.now();
  if (now < s.globalCooldownUntil) return null;
  if (s.interruptionCount >= MAX_INTERRUPTIONS) return null;

  // Refresh flags and Roger's mood before evaluating
  refreshMood(s);

  const sessionSec = (now - s.sessionStartMs) / 1000;
  const mood       = s.rogerMood;
  const flags      = s.fakeMemoryFlags;

  const sorted = [...PROMPT_LIBRARY].sort(
    (a, b) => PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category),
  );

  for (const prompt of sorted) {
    // Per-prompt cooldown
    const cd = s.promptCooldowns[prompt.id];
    if (cd && now < cd) continue;

    // Avoid repeating the last 3 prompts (except game invites)
    if (
      prompt.category !== "game_invite" &&
      s.recentPromptIds.slice(-3).includes(prompt.id)
    ) continue;

    // Game-specific guards
    if (prompt.category === "game_invite" && (s.gameStarted || s.gameCompleted)) continue;
    if (prompt.trigger.requireNoGameStarted && s.gameStarted) continue;

    // Metric checks
    const t = prompt.trigger;
    if (t.minSkips          !== undefined && s.greetingsSkipped < t.minSkips)          continue;
    if (t.maxSkips          !== undefined && s.greetingsSkipped > t.maxSkips)          continue;
    if (t.minMessagesSent   !== undefined && s.messagesSent     < t.minMessagesSent)   continue;
    if (t.maxMessagesSent   !== undefined && s.messagesSent     > t.maxMessagesSent)   continue;
    if (t.minSessionSeconds !== undefined && sessionSec          < t.minSessionSeconds) continue;
    if (t.maxSessionSeconds !== undefined && sessionSec          > t.maxSessionSeconds) continue;

    // Mood check
    if (t.requiredMoods && t.requiredMoods.length > 0) {
      if (!t.requiredMoods.includes(mood)) continue;
    }

    // Additional flag checks (fine-grained overrides)
    if (t.requiredFlags && t.requiredFlags.length > 0) {
      if (!t.requiredFlags.every(f => flags[f])) continue;
    }
    if (t.forbiddenFlags && t.forbiddenFlags.length > 0) {
      if (t.forbiddenFlags.some(f => flags[f])) continue;
    }

    // ✓ Prompt matched — consume it
    s.promptCooldowns[prompt.id] = now + prompt.cooldownSeconds * 1000;
    s.recentPromptIds = [...s.recentPromptIds.slice(-4), prompt.id];
    s.lastInterruptionMs  = now;
    s.globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
    s.interruptionCount++;

    console.log(`[roger-mood] firing prompt="${prompt.id}" mood="${mood}" skips=${s.greetingsSkipped} msgs=${s.messagesSent}`);
    return prompt;
  }

  return null;
}

/**
 * Start the Busted game for this call session.
 */
export function startBustedGame(
  callSid: string,
  adminUserIds: string[],
): string | null {
  const s = states.get(callSid);
  if (!s || s.gameStarted || adminUserIds.length === 0) return null;
  const target = adminUserIds[Math.floor(Math.random() * adminUserIds.length)];
  s.gameStarted = true;
  s.gameBustTargetUserId = target;
  s.gameBustTargetInjected = false;
  // Force mood recalc so chaos mode kicks in immediately
  s.forceMoodRecalc = true;
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
 * Call when the bust target profile was played but the caller did NOT press 8.
 * Ends the game as a miss.
 */
export function markGameTargetPassed(callSid: string): void {
  const s = states.get(callSid);
  if (!s || !s.gameStarted || s.gameCompleted) return;
  s.gameCompleted = true;
  s.gameBustMissed = true;
}

/**
 * Process a bust attempt (digit 8).
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

  s.gameCompleted = true;
  s.gameBustMissed = true;
  return { result: "miss", bonusSeconds: 0 };
}
