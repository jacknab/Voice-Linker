/**
 * Engagement Engine — Roger Audio Personality System
 *
 * Roger is the sole AI host. This is a flat, predictable execution pipeline:
 *
 *   1. DETECT STATE — evaluate inactivity, skip behavior, engagement signals
 *      via Attention Drain Score (0–10) and Mood (normal/petty/activated/chaos)
 *
 *   2. CHECK CONSTRAINTS — speech cooldown, max interruptions,
 *      and per-caller 24h no-repeat rule (excludedPromptIds)
 *
 *   3. SELECT PROMPT — match Roger ID from the prompt library
 *      by category priority, trigger conditions, and mood
 *
 *   4. EXECUTE — return prompt to IVR; caller logs roger_id + timestamp
 *
 * Attention Drain Score (0–10):
 *   +2 per skip | +3 per 30s idle | +2 per 30s with 0 messages
 *   -5 on message sent | -10 on game started | clamp 0–10
 *
 * Interrupt Gate (drain-adaptive cooldown):
 *   drain 0–2  → silent (no interrupt)
 *   drain 3–5  → 90s cooldown
 *   drain 6–7  → 60s cooldown
 *   drain 8–10 → 45s cooldown
 *
 * Mood Engine: normal → petty → activated → chaos (driven by behavior flags)
 * Engagement Streak (0–10): +2/message, +3/game, +1/60s active. Resets on idle > 90s.
 * Busted Game: inject AI voice, award bonus time on correct guess.
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

/** Roger's 4 moods — same character, different energy. */
export type RogerMood = "normal" | "petty" | "activated" | "chaos";


/** Temporary session-based behavioral labels. NOT persistent. */
export interface FakeMemoryFlags {
  picky: boolean;
  shy: boolean;
  active: boolean;
  engaged: boolean;
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
    /** Prompt only fires when Roger is in one of these moods. Omit = any mood. */
    requiredMoods?: RogerMood[];
    /** Fine-grained flag overrides. All listed flags must be true. */
    requiredFlags?: (keyof FakeMemoryFlags)[];
    forbiddenFlags?: (keyof FakeMemoryFlags)[];
    /** Attention drain gate — prompt only fires when score is in this range. */
    minAttentionDrain?: number;
    maxAttentionDrain?: number;
  };
  lineText: string;
  followUpAction?: FollowUpAction;
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
  promptCooldowns: Record<string, number>;
  recentPromptIds: string[];
  interruptionCount: number;
  globalCooldownUntil: number;

  // ── Attention Drain System ─────────────────────────────────────────────────
  /** Current drain score 0–10. Drives interrupt gating and prompt intensity. */
  attentionDrainScore: number;
  /** Timestamp of last drain recalculation (for time-based increments). */
  lastDrainUpdateMs: number;

  // ── Fake Memory Flags ──────────────────────────────────────────────────────
  fakeMemoryFlags: FakeMemoryFlags;

  // ── Roger Mood Engine ──────────────────────────────────────────────────────
  rogerMood: RogerMood;
  lastMoodSwitchMs: number;
  forceMoodRecalc: boolean;

  // ── Engagement Streak ──────────────────────────────────────────────────────
  /** 0–10. +2/message, +3/game, +1/60s active. Resets on idle > 90s. */
  engagementStreak: number;
  /** Timestamp of last streak time-based increment. */
  lastStreakTickMs: number;

  // ── Busted game ────────────────────────────────────────────────────────────
  gameStarted: boolean;
  gameCompleted: boolean;
  gameBustTargetUserId: string | null;
  gameBustTargetInjected: boolean;
  gameBustMissed: boolean;
  gameBustedCorrectly: boolean;
}

// ── Prompt Library (150+ Roger lines) ────────────────────────────────────────

export const PROMPT_LIBRARY: EngagementPrompt[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // BASE PROMPTS — any mood, triggered by behavior metrics
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── picky (base) ──────────────────────────────────────────────────────────
  { id: "picky_01", category: "picky", tone: "comedic",
    trigger: { minSkips: 8, maxMessagesSent: 0, minAttentionDrain: 3 },
    lineText: "Wow. Still browsing? You might officially be the most selective man on the line right now. Honestly... we love the standards.",
    cooldownSeconds: 240 },
  { id: "picky_02", category: "picky", tone: "teasing",
    trigger: { minSkips: 12, maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "You have skipped more guys today than a DJ skips bad tracks. What exactly are you looking for? Asking for a friend.",
    cooldownSeconds: 300 },
  { id: "picky_03", category: "picky", tone: "playful",
    trigger: { minSkips: 5, maxMessagesSent: 0, maxSessionSeconds: 180, minAttentionDrain: 3 },
    lineText: "Nobody catching your attention yet? That is okay. The right voice is out there. Keep listening.",
    cooldownSeconds: 180 },
  { id: "picky_04", category: "picky", tone: "comedic",
    trigger: { minSkips: 20, maxMessagesSent: 0, minAttentionDrain: 7 },
    lineText: "Twenty skips. You have set a new record. We are genuinely impressed. And also a little worried about you. Send someone a message.",
    followUpAction: "suggest_send_message", cooldownSeconds: 360 },
  { id: "picky_05", category: "picky", tone: "teasing",
    trigger: { minSkips: 10, maxMessagesSent: 0, minSessionSeconds: 120, minAttentionDrain: 4 },
    lineText: "You have been at this a while and nobody has caught your ear yet. Or... are you just nervous to reach out first?",
    cooldownSeconds: 260 },
  { id: "picky_06", category: "picky", tone: "playful",
    trigger: { minSkips: 30, maxMessagesSent: 0, minAttentionDrain: 8 },
    lineText: "Thirty skips. At this point you are just collecting experiences. Pick one. Any one. You can always send another message tomorrow.",
    followUpAction: "suggest_send_message", cooldownSeconds: 420 },

  // ─── flirty (base) ─────────────────────────────────────────────────────────
  { id: "flirty_01", category: "flirty", tone: "seductive",
    trigger: { minSkips: 3, maxMessagesSent: 0, maxSessionSeconds: 120, minAttentionDrain: 3 },
    lineText: "You are making me blush just watching you browse. Somebody out here really wants to hear from you right now.",
    cooldownSeconds: 200 },
  { id: "flirty_02", category: "flirty", tone: "playful",
    trigger: { minSkips: 5, maxMessagesSent: 0, minAttentionDrain: 3 },
    lineText: "Between you and me? Some of these guys have been waiting a long time for someone exactly like you to send them a message.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },
  { id: "flirty_03", category: "flirty", tone: "seductive",
    trigger: { minSkips: 7, maxMessagesSent: 0, minSessionSeconds: 90, minAttentionDrain: 4 },
    lineText: "Mmm. You clearly have taste. Not everyone holds out this long. The right voice is closer than you think.",
    cooldownSeconds: 260 },
  { id: "flirty_04", category: "flirty", tone: "teasing",
    trigger: { minSkips: 4, maxMessagesSent: 0, maxSessionSeconds: 90, minAttentionDrain: 3 },
    lineText: "A little picky right now, are we?? That is actually kind of attractive. Do not let it stop you from saying hello.",
    cooldownSeconds: 180 },

  // ─── dominant (base) ───────────────────────────────────────────────────────
  { id: "dominant_01", category: "dominant", tone: "commanding",
    trigger: { minSkips: 15, maxMessagesSent: 0, minAttentionDrain: 7 },
    lineText: "Stop. Take a breath. Pick one and send a message. You can absolutely do this.",
    cooldownSeconds: 300 },
  { id: "dominant_02", category: "dominant", tone: "commanding",
    trigger: { minSkips: 25, maxMessagesSent: 0, minAttentionDrain: 8 },
    lineText: "I am stepping in. The very next caller you hear — send him a message. No more skipping. You have earned this.",
    followUpAction: "suggest_send_message", cooldownSeconds: 400 },
  { id: "dominant_03", category: "dominant", tone: "commanding",
    trigger: { minSkips: 18, maxMessagesSent: 0, minSessionSeconds: 200, minAttentionDrain: 7 },
    lineText: "You have been in charge long enough. Now let someone else have a chance. Press 1 and send that message.",
    followUpAction: "suggest_send_message", cooldownSeconds: 350 },

  // ─── idle (base) ───────────────────────────────────────────────────────────
  { id: "idle_01", category: "idle", tone: "playful",
    trigger: { maxSkips: 2, minSessionSeconds: 50, minAttentionDrain: 3 },
    lineText: "Hey. Still there? The guys on the line are wondering about you.",
    cooldownSeconds: 120 },
  { id: "idle_02", category: "idle", tone: "comedic",
    trigger: { maxSkips: 1, minSessionSeconds: 65, minAttentionDrain: 4 },
    lineText: "Did you fall asleep? No judgment. But there is someone on this line who would love to hear from you right now.",
    cooldownSeconds: 160 },
  { id: "idle_03", category: "idle", tone: "playful",
    trigger: { maxSkips: 3, minSessionSeconds: 40, minAttentionDrain: 3 },
    lineText: "Take your time. No rush. The right person will be worth the wait.",
    cooldownSeconds: 100 },

  // ─── reengagement (base) ────────────────────────────────────────────────────
  { id: "reengagement_01", category: "reengagement", tone: "playful",
    trigger: { minSkips: 4, minSessionSeconds: 150, minAttentionDrain: 5 },
    lineText: "Hey, you have been here a while. Have you tried sending a message yet? It takes two seconds — and the reply might surprise you.",
    followUpAction: "suggest_send_message", cooldownSeconds: 210 },
  { id: "reengagement_02", category: "reengagement", tone: "teasing",
    trigger: { minSkips: 8, minSessionSeconds: 200, minAttentionDrain: 6 },
    lineText: "You are one of today's most dedicated callers. Do not let that go to waste — one message could change your whole session.",
    cooldownSeconds: 260 },
  { id: "reengagement_03", category: "reengagement", tone: "playful",
    trigger: { minSessionSeconds: 300, minSkips: 10, minAttentionDrain: 6 },
    lineText: "Five minutes in and still exploring. You clearly know what you want. Trust your gut and reach out to someone.",
    cooldownSeconds: 320 },
  { id: "reengagement_04", category: "reengagement", tone: "seductive",
    trigger: { minSessionSeconds: 240, minSkips: 6, minAttentionDrain: 5 },
    lineText: "You have put in the time. You deserve a real connection. Someone out here is waiting for exactly your energy.",
    cooldownSeconds: 280 },

  // ─── game_invite (base) ─────────────────────────────────────────────────────
  { id: "game_invite_01", category: "game_invite", tone: "playful",
    trigger: { minSessionSeconds: 180, minSkips: 5, requireNoGameStarted: true, minAttentionDrain: 7 },
    lineText: "Okay, I have a secret. We have hidden one of our AI voices among the real callers right now. Press 8 any time you think you have caught it. Get it right and we will give you a little gift.",
    followUpAction: "start_game", cooldownSeconds: 99999 },
  { id: "game_invite_02", category: "game_invite", tone: "comedic",
    trigger: { minSessionSeconds: 240, minSkips: 8, requireNoGameStarted: true, minAttentionDrain: 8 },
    lineText: "Pop quiz. Somewhere in the next few callers, there is an AI pretending to be a real guy. Think you can spot the faker? Press 8 when you think you found it. Get it right and win free time.",
    followUpAction: "start_game", cooldownSeconds: 99999 },
  { id: "game_invite_03", category: "game_invite", tone: "teasing",
    trigger: { minSessionSeconds: 300, minSkips: 12, requireNoGameStarted: true, minAttentionDrain: 8 },
    lineText: "Since you have been listening so carefully, here is a little challenge. One of the next voices is not quite human. Press 8 if you catch the AI. A reward is waiting for whoever figures it out.",
    followUpAction: "start_game", cooldownSeconds: 99999 },

  // ─── reward (base) ──────────────────────────────────────────────────────────
  { id: "reward_01", category: "reward", tone: "playful",
    trigger: { minMessagesSent: 1, minSessionSeconds: 60 },
    lineText: "Look at you — already making connections. That is exactly what this is all about.",
    cooldownSeconds: 300 },
  { id: "reward_02", category: "reward", tone: "seductive",
    trigger: { minMessagesSent: 2, minSessionSeconds: 120 },
    lineText: "Two messages already? You are absolutely on fire right now. Keep it up.",
    cooldownSeconds: 360 },
  { id: "reward_03", category: "reward", tone: "comedic",
    trigger: { minMessagesSent: 3, minSessionSeconds: 150 },
    lineText: "Three messages sent. You are the most active person on the line right now. Somebody is going to be very happy.",
    cooldownSeconds: 400 },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD: NORMAL — warm, patient, gently encouraging
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "normal_01", category: "idle", tone: "playful",
    trigger: { requiredMoods: ["normal"], maxSkips: 3, minAttentionDrain: 3 },
    lineText: "Take your time. I am not going anywhere. The right voice will catch your ear when you least expect it.",
    cooldownSeconds: 150 },
  { id: "normal_02", category: "flirty", tone: "playful",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 60, minAttentionDrain: 3 },
    lineText: "You seem like the type who listens more than he talks. Nothing wrong with that. But at some point you have to let someone know you are there.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },
  { id: "normal_03", category: "reengagement", tone: "seductive",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 90, minAttentionDrain: 4 },
    lineText: "It is the quiet ones that always have the most to say. Go ahead and reach out.",
    cooldownSeconds: 220 },
  { id: "normal_04", category: "flirty", tone: "playful",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 80, minAttentionDrain: 3 },
    lineText: "You have not sent anything yet. That is okay. But these guys want to hear from you — do not make them wait too long.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },
  { id: "normal_05", category: "idle", tone: "seductive",
    trigger: { requiredMoods: ["normal"], maxSkips: 2, minSessionSeconds: 60, minAttentionDrain: 3 },
    lineText: "Still with me? Good. Just keep listening. The right one might be next.",
    cooldownSeconds: 140 },
  { id: "normal_06", category: "reengagement", tone: "playful",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 120, minAttentionDrain: 4 },
    lineText: "Something tells me when you finally do reach out... it is going to be worth it.",
    followUpAction: "suggest_send_message", cooldownSeconds: 220 },
  { id: "normal_07", category: "idle", tone: "comedic",
    trigger: { requiredMoods: ["normal"], maxSkips: 4, minSessionSeconds: 45, minAttentionDrain: 3 },
    lineText: "You seem comfortable. That is a good sign. Now try being comfortable enough to say something.",
    followUpAction: "suggest_send_message", cooldownSeconds: 180 },
  { id: "normal_08", category: "flirty", tone: "seductive",
    trigger: { requiredMoods: ["normal"], minSkips: 2, maxSkips: 6, maxMessagesSent: 0, minAttentionDrain: 3 },
    lineText: "You have good taste. That much is obvious. Trust it and reach out to someone.",
    followUpAction: "suggest_send_message", cooldownSeconds: 180 },
  { id: "normal_09", category: "idle", tone: "playful",
    trigger: { requiredMoods: ["normal"], minSessionSeconds: 30, maxSkips: 1, minAttentionDrain: 3 },
    lineText: "You are listening carefully. I can tell. That is honestly the first step.",
    cooldownSeconds: 140 },
  { id: "normal_10", category: "reengagement", tone: "playful",
    trigger: { requiredMoods: ["normal"], minSessionSeconds: 150, minAttentionDrain: 5 },
    lineText: "You have been here long enough that this is clearly more than a quick browse. Make it count.",
    followUpAction: "suggest_send_message", cooldownSeconds: 240 },
  { id: "normal_11", category: "flirty", tone: "seductive",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 200, minAttentionDrain: 5 },
    lineText: "Patience like yours is rare. So is the connection waiting for you at the end of it. Keep going.",
    cooldownSeconds: 260 },
  { id: "normal_12", category: "idle", tone: "comedic",
    trigger: { requiredMoods: ["normal"], maxSkips: 2, minSessionSeconds: 100, minAttentionDrain: 4 },
    lineText: "You went quiet on me. I get it. Some nights you just want to listen. But a message costs nothing.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },
  { id: "normal_game_invite", category: "game_invite", tone: "seductive",
    trigger: { requiredMoods: ["normal"], minSessionSeconds: 120, requireNoGameStarted: true, minAttentionDrain: 7 },
    lineText: "I have a little secret for you. One of the voices coming up is not quite human. Press 8 if you figure out which one. Get it right and I will give you a reward.",
    followUpAction: "start_game", cooldownSeconds: 99999 },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD: PETTY — Roger is sassy, calling out picky/quiet behavior
  // Triggers when: picky flag (≥8 skips, or 2+ min with 0 messages)
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "petty_01", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "Damn. You are picky right now, huh??",
    cooldownSeconds: 200 },
  { id: "petty_02", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "Another one bites the dust. You sure know what you do NOT want. That is half the battle, I guess.",
    cooldownSeconds: 240 },
  { id: "petty_03", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "You have turned down more guys today than most people meet in a year. I respect it, honestly.",
    cooldownSeconds: 260 },
  { id: "petty_04", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 4 },
    lineText: "I am not judging. Actually... I might be judging a little. Just a little.",
    cooldownSeconds: 220 },
  { id: "petty_05", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 6 },
    lineText: "At this rate we are going to run out of guys before you run out of opinions. You might want to lower the bar just slightly.",
    followUpAction: "suggest_send_message", cooldownSeconds: 300 },
  { id: "petty_06", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minSessionSeconds: 120, minAttentionDrain: 6 },
    lineText: "You keep passing on these guys but you will not reach out to any of them either. I see exactly what is happening here.",
    followUpAction: "suggest_send_message", cooldownSeconds: 280 },
  { id: "petty_07", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 7 },
    lineText: "Okay at this point you are just being difficult.",
    cooldownSeconds: 200 },
  { id: "petty_08", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 6 },
    lineText: "You know what? Fine. Keep skipping. I will be here. All night if I have to.",
    cooldownSeconds: 220 },
  { id: "petty_09", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 7 },
    lineText: "You have ghosted more guys today than most apps see in a week.",
    cooldownSeconds: 240 },
  { id: "petty_10", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minSkips: 15, minAttentionDrain: 7 },
    lineText: "I am running out of new guys to show you. Not literally. But almost.",
    cooldownSeconds: 280 },
  { id: "petty_11", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minSessionSeconds: 180, minAttentionDrain: 8 },
    lineText: "Let us be real. You do not even know what you are looking for anymore.",
    followUpAction: "suggest_send_message", cooldownSeconds: 300 },
  { id: "petty_12", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 8 },
    lineText: "You are like a guy at a restaurant who reads the entire menu and then orders water.",
    followUpAction: "suggest_send_message", cooldownSeconds: 320 },
  { id: "petty_13", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 7 },
    lineText: "I genuinely admire the commitment to not connecting with anyone right now. Truly.",
    cooldownSeconds: 260 },
  { id: "petty_14", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minSkips: 20, minAttentionDrain: 9 },
    lineText: "New record. I am putting your skip count on the wall of fame.",
    cooldownSeconds: 340 },
  { id: "petty_15", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "Still shopping? You are very selective right now. I mean that as a compliment. Mostly.",
    cooldownSeconds: 220 },
  { id: "petty_16", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 6 },
    lineText: "You are not making this easy on these guys.",
    cooldownSeconds: 200 },
  { id: "petty_17", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minSessionSeconds: 150, minAttentionDrain: 6 },
    lineText: "At some point the right one slips right past you. Just saying.",
    followUpAction: "suggest_send_message", cooldownSeconds: 240 },
  // petty + shy combo
  { id: "petty_shy_01", category: "picky", tone: "seductive",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "You skip everyone… but you have not said a word. That is kind of fascinating.",
    cooldownSeconds: 260 },
  { id: "petty_shy_02", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "Picky and quiet. A dangerous combination.",
    cooldownSeconds: 240 },
  { id: "petty_shy_03", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0, minAttentionDrain: 6 },
    lineText: "Turning down guys left and right and you will not send one message. What exactly is the move here?",
    followUpAction: "suggest_send_message", cooldownSeconds: 280 },
  { id: "petty_shy_04", category: "dominant", tone: "commanding",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0, minSessionSeconds: 180, minAttentionDrain: 8 },
    lineText: "Okay. Listen to me. Picky AND quiet for this long? Pick one. Send a message. Right now.",
    followUpAction: "suggest_send_message", cooldownSeconds: 360 },
  { id: "petty_shy_05", category: "flirty", tone: "seductive",
    trigger: { requiredMoods: ["petty"], requiredFlags: ["shy"], maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "The thing about guys who are picky AND quiet is they always have the most interesting things to say once they finally open up.",
    cooldownSeconds: 260 },
  { id: "petty_flirty_01", category: "flirty", tone: "teasing",
    trigger: { requiredMoods: ["petty"], forbiddenFlags: ["shy"], maxMessagesSent: 0, minAttentionDrain: 4 },
    lineText: "High standards are attractive. Just make sure they do not become the reason you miss someone actually good.",
    cooldownSeconds: 220 },
  { id: "petty_dominant_01", category: "dominant", tone: "commanding",
    trigger: { requiredMoods: ["petty"], minSkips: 15, maxMessagesSent: 0, minAttentionDrain: 8 },
    lineText: "Enough. You have skipped enough guys. The very next one — give him a real chance.",
    cooldownSeconds: 300 },
  { id: "petty_dominant_02", category: "dominant", tone: "commanding",
    trigger: { requiredMoods: ["petty"], minSkips: 22, maxMessagesSent: 0, minAttentionDrain: 9 },
    lineText: "I am intervening. Send a message to the next guy who catches your ear. That is not a suggestion.",
    followUpAction: "suggest_send_message", cooldownSeconds: 360 },
  { id: "petty_game", category: "game_invite", tone: "teasing",
    trigger: { requiredMoods: ["petty"], minSkips: 10, requireNoGameStarted: true, minAttentionDrain: 8 },
    lineText: "Since you are apparently the world's toughest judge right now — let me give you a real challenge. One of the next voices is an AI. Press 8 when you catch it and win bonus time.",
    followUpAction: "start_game", cooldownSeconds: 99999 },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD: ACTIVATED — Roger is hyped, celebrating engagement
  // Triggers when: active (≥2 msgs) OR engaged (session > 4 min)
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "activated_01", category: "reward", tone: "playful",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2, minAttentionDrain: 3 },
    lineText: "Look at you. Already making moves right now. That is exactly the energy.",
    cooldownSeconds: 280 },
  { id: "activated_02", category: "reward", tone: "seductive",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2, minAttentionDrain: 3 },
    lineText: "You are out here actually doing it. Messages sent, connections made. This is what the line is for.",
    cooldownSeconds: 300 },
  { id: "activated_03", category: "reward", tone: "comedic",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 3, minAttentionDrain: 3 },
    lineText: "You came to play right now. I am not mad at it. Not even a little.",
    cooldownSeconds: 320 },
  { id: "activated_04", category: "reengagement", tone: "playful",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 240, maxMessagesSent: 1, minAttentionDrain: 5 },
    lineText: "You have been on here a while and you are still locked in. I respect the commitment. Keep going.",
    cooldownSeconds: 280 },
  { id: "activated_05", category: "reengagement", tone: "seductive",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 300, maxMessagesSent: 0, minAttentionDrain: 6 },
    lineText: "Long session. You have clearly got patience. Somebody on this line deserves to hear from you right now.",
    followUpAction: "suggest_send_message", cooldownSeconds: 300 },
  { id: "activated_06", category: "reward", tone: "teasing",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2, minSessionSeconds: 240, minAttentionDrain: 3 },
    lineText: "Long session AND messages sent. You are one of today's real ones.",
    cooldownSeconds: 380 },
  { id: "activated_07", category: "flirty", tone: "seductive",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 200, minAttentionDrain: 5 },
    lineText: "You have been here long enough. You know what you want. Trust that instinct and reach out to someone.",
    followUpAction: "suggest_send_message", cooldownSeconds: 260 },
  { id: "activated_08", category: "reward", tone: "playful",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2, minAttentionDrain: 3 },
    lineText: "You are doing better than half the guys on this line right now. And I mean that.",
    cooldownSeconds: 300 },
  { id: "activated_09", category: "reward", tone: "comedic",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2, minAttentionDrain: 3 },
    lineText: "Look at you going for it. Love to see it. Genuinely.",
    cooldownSeconds: 260 },
  { id: "activated_10", category: "reengagement", tone: "seductive",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 360, minAttentionDrain: 6 },
    lineText: "Six minutes in. You are invested. I can work with invested.",
    cooldownSeconds: 340 },
  { id: "activated_11", category: "reward", tone: "playful",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 4, minAttentionDrain: 3 },
    lineText: "Four messages? You are breaking records right now. Keep going.",
    cooldownSeconds: 380 },
  { id: "activated_12", category: "reward", tone: "seductive",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 2, minSessionSeconds: 300, minAttentionDrain: 3 },
    lineText: "You put in the time AND made moves. That combination usually works out well.",
    cooldownSeconds: 360 },
  { id: "activated_13", category: "flirty", tone: "teasing",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 180, maxMessagesSent: 1, minAttentionDrain: 5 },
    lineText: "You are clearly feeling it right now. One more message and you are officially on a streak.",
    followUpAction: "suggest_send_message", cooldownSeconds: 240 },
  { id: "activated_14", category: "reengagement", tone: "comedic",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 280, minAttentionDrain: 6 },
    lineText: "You have been on here longer than the average guy lasts on this line. Use that advantage.",
    cooldownSeconds: 300 },
  { id: "activated_game", category: "game_invite", tone: "playful",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 200, requireNoGameStarted: true, minAttentionDrain: 8 },
    lineText: "You have been on here long enough to earn a little game. One of the next guys is an AI pretending to be real. Press 8 if you spot him — get it right and win free time.",
    followUpAction: "start_game", cooldownSeconds: 99999 },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD: CHAOS — Roger is in game-show mode, post-game playful energy
  // Triggers when: gamePlayed flag is true
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "chaos_01", category: "reengagement", tone: "comedic",
    trigger: { requiredMoods: ["chaos"], minAttentionDrain: 5 },
    lineText: "Oh you played the game. You are a whole different type of caller on this call and I am absolutely here for it.",
    cooldownSeconds: 380 },
  { id: "chaos_02", category: "reengagement", tone: "playful",
    trigger: { requiredMoods: ["chaos"], minAttentionDrain: 4 },
    lineText: "After everything you have done on this call, I still do not know what to expect from you. And honestly? I love it.",
    cooldownSeconds: 360 },
  { id: "chaos_03", category: "flirty", tone: "teasing",
    trigger: { requiredMoods: ["chaos"], minAttentionDrain: 4 },
    lineText: "You played the Busted game. You are clearly here for the full experience. Let us keep it interesting.",
    cooldownSeconds: 340 },
  { id: "chaos_04", category: "reengagement", tone: "comedic",
    trigger: { requiredMoods: ["chaos"], maxMessagesSent: 0, minAttentionDrain: 7 },
    lineText: "You played the game AND you still have not messaged anyone. You are out here doing this your own way. I respect the chaos.",
    followUpAction: "suggest_send_message", cooldownSeconds: 400 },
  { id: "chaos_05", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["chaos"], minSkips: 10, maxMessagesSent: 0, minAttentionDrain: 7 },
    lineText: "You played the game AND you are still picky. You are absolutely having fun right now. Just admit it.",
    cooldownSeconds: 360 },
  { id: "chaos_06", category: "reward", tone: "playful",
    trigger: { requiredMoods: ["chaos"], minMessagesSent: 1, minAttentionDrain: 3 },
    lineText: "You played the game AND you sent a message. What are you going to do next? This has been quite the session.",
    cooldownSeconds: 400 },
  { id: "chaos_07", category: "reengagement", tone: "comedic",
    trigger: { requiredMoods: ["chaos"], minSessionSeconds: 300, minAttentionDrain: 5 },
    lineText: "Long session, played the game, still going. You are not leaving until something happens. I know the type.",
    cooldownSeconds: 380 },
  { id: "chaos_08", category: "flirty", tone: "playful",
    trigger: { requiredMoods: ["chaos"], minAttentionDrain: 4 },
    lineText: "After the game you are still browsing. You have committed to this evening in a way that I find very admirable.",
    cooldownSeconds: 360 },
  { id: "chaos_09", category: "reengagement", tone: "teasing",
    trigger: { requiredMoods: ["chaos"], maxMessagesSent: 0, minAttentionDrain: 8 },
    lineText: "You literally played a guessing game and still have not messaged anyone. I am equal parts confused and impressed.",
    followUpAction: "suggest_send_message", cooldownSeconds: 400 },
  { id: "chaos_10", category: "dominant", tone: "commanding",
    trigger: { requiredMoods: ["chaos"], maxMessagesSent: 0, minSessionSeconds: 300, minAttentionDrain: 9 },
    lineText: "Game played. Long session. Zero messages. Something has to give. Send someone a message right now.",
    followUpAction: "suggest_send_message", cooldownSeconds: 420 },

  // ═══════════════════════════════════════════════════════════════════════════
  // HIGH-DRAIN INTENSITY PROMPTS (drain 8–10) — strong lines across all moods
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "high_01", category: "dominant", tone: "commanding",
    trigger: { maxMessagesSent: 0, minSessionSeconds: 240, minAttentionDrain: 9 },
    lineText: "I am going to need you to make a move. Any move. The browsing phase is over.",
    followUpAction: "suggest_send_message", cooldownSeconds: 360 },
  { id: "high_02", category: "picky", tone: "comedic",
    trigger: { minSkips: 18, maxMessagesSent: 0, minAttentionDrain: 9 },
    lineText: "At this skip count you are not browsing anymore. You are just spinning.",
    followUpAction: "suggest_send_message", cooldownSeconds: 340 },
  { id: "high_03", category: "reengagement", tone: "teasing",
    trigger: { minSessionSeconds: 360, maxMessagesSent: 0, minAttentionDrain: 9 },
    lineText: "Six minutes. No messages. I am starting to think you just like the sound of my voice.",
    followUpAction: "suggest_send_message", cooldownSeconds: 380 },
  { id: "high_04", category: "dominant", tone: "commanding",
    trigger: { minSkips: 20, maxMessagesSent: 0, minAttentionDrain: 10 },
    lineText: "That is enough. No more skipping. Send a message right now. I am serious.",
    followUpAction: "suggest_send_message", cooldownSeconds: 400 },
  { id: "high_05", category: "picky", tone: "teasing",
    trigger: { minSkips: 16, maxMessagesSent: 0, minSessionSeconds: 240, minAttentionDrain: 9 },
    lineText: "Four minutes. Sixteen skips. I am starting to suspect you are looking for someone specific and not telling me.",
    followUpAction: "suggest_send_message", cooldownSeconds: 360 },
  { id: "high_06", category: "reengagement", tone: "comedic",
    trigger: { minSessionSeconds: 420, maxMessagesSent: 0, minAttentionDrain: 10 },
    lineText: "Seven minutes on the line and zero messages. You are committed to the browsing life and I will not stand for it any longer.",
    followUpAction: "suggest_send_message", cooldownSeconds: 400 },

  // ═══════════════════════════════════════════════════════════════════════════
  // LIGHT-DRAIN PROMPTS (drain 3–5) — subtle, non-intrusive
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "light_01", category: "idle", tone: "playful",
    trigger: { maxSkips: 5, minAttentionDrain: 3, maxAttentionDrain: 5 },
    lineText: "You are settling in. That is good. This is a comfortable place to browse.",
    cooldownSeconds: 120 },
  { id: "light_02", category: "flirty", tone: "seductive",
    trigger: { minSkips: 2, maxSkips: 6, minAttentionDrain: 3, maxAttentionDrain: 5 },
    lineText: "Take a good listen. The right voice has a way of stopping you mid-skip.",
    cooldownSeconds: 140 },
  { id: "light_03", category: "idle", tone: "comedic",
    trigger: { maxSkips: 3, minSessionSeconds: 30, minAttentionDrain: 3, maxAttentionDrain: 5 },
    lineText: "Still here. Good. I like the company.",
    cooldownSeconds: 120 },
  { id: "light_04", category: "flirty", tone: "playful",
    trigger: { minSkips: 1, maxSkips: 5, minAttentionDrain: 3, maxAttentionDrain: 5 },
    lineText: "Each skip is a choice. You know your taste better than you think.",
    cooldownSeconds: 130 },
  { id: "light_05", category: "idle", tone: "seductive",
    trigger: { maxSkips: 4, minSessionSeconds: 25, minAttentionDrain: 3, maxAttentionDrain: 5 },
    lineText: "No rush on my end. Stay as long as you need.",
    cooldownSeconds: 120 },
  { id: "light_06", category: "flirty", tone: "teasing",
    trigger: { minSkips: 3, maxSkips: 7, minAttentionDrain: 3, maxAttentionDrain: 5 },
    lineText: "A few skips in. Still hunting. That is the spirit.",
    cooldownSeconds: 130 },
  { id: "light_07", category: "idle", tone: "playful",
    trigger: { maxSkips: 2, minSessionSeconds: 40, minAttentionDrain: 3, maxAttentionDrain: 5 },
    lineText: "Sometimes it takes a minute to tune in. You are doing just fine.",
    cooldownSeconds: 120 },
  { id: "light_08", category: "reengagement", tone: "playful",
    trigger: { minSkips: 4, maxSkips: 8, minAttentionDrain: 3, maxAttentionDrain: 5 },
    lineText: "You are building up a picture of what you want. That is actually a smart way to browse.",
    cooldownSeconds: 160 },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIUM-DRAIN PROMPTS (drain 5–7) — playful callouts
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "medium_01", category: "picky", tone: "teasing",
    trigger: { minSkips: 7, maxMessagesSent: 0, minAttentionDrain: 5, maxAttentionDrain: 7 },
    lineText: "Seven skips and counting. Your standards are doing the heavy lifting right now.",
    cooldownSeconds: 200 },
  { id: "medium_02", category: "reengagement", tone: "playful",
    trigger: { minSessionSeconds: 120, maxMessagesSent: 0, minAttentionDrain: 5, maxAttentionDrain: 7 },
    lineText: "Two minutes in. Still nothing sent. You are warming up. That is fine. But eventually the warmup has to end.",
    followUpAction: "suggest_send_message", cooldownSeconds: 220 },
  { id: "medium_03", category: "idle", tone: "comedic",
    trigger: { maxSkips: 4, minSessionSeconds: 60, minAttentionDrain: 5, maxAttentionDrain: 7 },
    lineText: "You have been here a hot minute without doing much. Not judging. But also a little judging.",
    cooldownSeconds: 180 },
  { id: "medium_04", category: "flirty", tone: "seductive",
    trigger: { minSkips: 5, maxSkips: 12, minAttentionDrain: 5, maxAttentionDrain: 7 },
    lineText: "Whoever you are looking for — he is probably somewhere in this line. You just have to get to him.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },
  { id: "medium_05", category: "picky", tone: "comedic",
    trigger: { minSkips: 9, maxMessagesSent: 0, minAttentionDrain: 5, maxAttentionDrain: 7 },
    lineText: "Nine guys in the skip pile. You could start a whole rejected caller support group at this point.",
    cooldownSeconds: 240 },
  { id: "medium_06", category: "reengagement", tone: "teasing",
    trigger: { minSessionSeconds: 180, maxMessagesSent: 0, minAttentionDrain: 6, maxAttentionDrain: 7 },
    lineText: "Three minutes and no messages. The guys out there are starting to wonder if you are even real.",
    followUpAction: "suggest_send_message", cooldownSeconds: 240 },
  { id: "medium_07", category: "flirty", tone: "playful",
    trigger: { minSkips: 6, maxSkips: 14, minAttentionDrain: 5, maxAttentionDrain: 7 },
    lineText: "You know what they say — the right voice hits differently. You are close. Keep going.",
    cooldownSeconds: 200 },
  { id: "medium_08", category: "idle", tone: "teasing",
    trigger: { maxSkips: 5, minSessionSeconds: 80, minAttentionDrain: 5, maxAttentionDrain: 7 },
    lineText: "You are in a listening mood right now. Nothing wrong with that. But listening only gets you so far.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRA REWARD LINES
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "reward_extra_01", category: "reward", tone: "playful",
    trigger: { minMessagesSent: 1, minAttentionDrain: 3 },
    lineText: "You sent a message. That took about two seconds and it was absolutely the right call.",
    cooldownSeconds: 280 },
  { id: "reward_extra_02", category: "reward", tone: "seductive",
    trigger: { minMessagesSent: 2, minSessionSeconds: 90, minAttentionDrain: 3 },
    lineText: "Two messages in. You are officially the most interesting person on this line right now.",
    cooldownSeconds: 320 },
  { id: "reward_extra_03", category: "reward", tone: "comedic",
    trigger: { minMessagesSent: 1, minAttentionDrain: 3 },
    lineText: "There it is. First message out. That is how you do it.",
    cooldownSeconds: 260 },
  { id: "reward_extra_04", category: "reward", tone: "teasing",
    trigger: { minMessagesSent: 3, minSessionSeconds: 120, minAttentionDrain: 3 },
    lineText: "Three messages? You are not here to browse. You are here to connect. I see you.",
    cooldownSeconds: 360 },
  { id: "reward_extra_05", category: "reward", tone: "seductive",
    trigger: { minMessagesSent: 2, minAttentionDrain: 3 },
    lineText: "Every message you send is a chance at something real. You are playing this perfectly.",
    cooldownSeconds: 300 },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRA COMEDIC ROGER COMMENTARY
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "roger_01", category: "idle", tone: "comedic",
    trigger: { minSessionSeconds: 45, maxSkips: 2, minAttentionDrain: 3 },
    lineText: "Just so you know, Roger is watching. Not in a weird way. In a supportive way.",
    cooldownSeconds: 160 },
  { id: "roger_02", category: "picky", tone: "comedic",
    trigger: { minSkips: 6, maxMessagesSent: 0, minAttentionDrain: 4 },
    lineText: "You know how they say all the good ones are taken? They are not. They are right here on this line.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },
  { id: "roger_03", category: "flirty", tone: "comedic",
    trigger: { minSkips: 4, maxMessagesSent: 0, minAttentionDrain: 4 },
    lineText: "What if I told you the next profile is exactly your type? You'll never know unless you listen.",
    cooldownSeconds: 180 },
  { id: "roger_04", category: "idle", tone: "comedic",
    trigger: { maxSkips: 1, minSessionSeconds: 90, minAttentionDrain: 5 },
    lineText: "You have been very still. Which means either you are very relaxed or you are overthinking everything. Either way — say hello to someone.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },
  { id: "roger_05", category: "picky", tone: "comedic",
    trigger: { minSkips: 11, maxMessagesSent: 0, minAttentionDrain: 6 },
    lineText: "Eleven skips. I have started giving them all nicknames. Skip. Skipped. Also Skipped. Another Skip.",
    cooldownSeconds: 260 },
  { id: "roger_06", category: "reengagement", tone: "comedic",
    trigger: { minSessionSeconds: 200, maxMessagesSent: 0, minAttentionDrain: 6 },
    lineText: "You know what I have never heard anyone regret? Sending a message. Just something to think about.",
    followUpAction: "suggest_send_message", cooldownSeconds: 260 },
  { id: "roger_07", category: "flirty", tone: "comedic",
    trigger: { minSkips: 5, maxMessagesSent: 0, minAttentionDrain: 4 },
    lineText: "Somewhere on this line is a guy who would absolutely love to get a message from you. He just does not know it yet.",
    followUpAction: "suggest_send_message", cooldownSeconds: 200 },
  { id: "roger_08", category: "dominant", tone: "comedic",
    trigger: { minSkips: 14, maxMessagesSent: 0, minAttentionDrain: 7 },
    lineText: "At some point browsing stops being productive and starts being an avoidance strategy. You might be there. Send a message.",
    followUpAction: "suggest_send_message", cooldownSeconds: 300 },

  // ═══════════════════════════════════════════════════════════════════════════
  // ROGER SELF-INTRODUCTION — fires once early in the session so callers
  // learn his name. Two variants cover different entry points.
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "roger_selfintro_01", category: "idle", tone: "playful",
    trigger: { maxSkips: 4, maxSessionSeconds: 150, minAttentionDrain: 3 },
    lineText: "Hey — welcome to the line. I'm Roger, your host for tonight. Take your time browsing. I'll check in with you every now and then.",
    cooldownSeconds: 99999 },

  { id: "roger_selfintro_02", category: "idle", tone: "comedic",
    trigger: { minSkips: 2, maxSkips: 8, maxSessionSeconds: 240, minAttentionDrain: 3 },
    lineText: "Almost forgot to introduce myself. I'm Roger. I keep this whole thing running. Now — back to finding you someone worth talking to.",
    cooldownSeconds: 99999 },

  // ═══════════════════════════════════════════════════════════════════════════
  // ROGER NAMED CHECK-INS — Roger says his name mid-session.
  // Spread across moods and drain levels so he feels present throughout.
  // ═══════════════════════════════════════════════════════════════════════════

  // Normal mood
  { id: "roger_named_normal_01", category: "idle", tone: "playful",
    trigger: { requiredMoods: ["normal"], maxSkips: 3, minSessionSeconds: 90, minAttentionDrain: 3 },
    lineText: "Roger checking in. Still with me? Good. The right voice is still out there.",
    cooldownSeconds: 300 },

  { id: "roger_named_normal_02", category: "flirty", tone: "seductive",
    trigger: { requiredMoods: ["normal"], maxMessagesSent: 0, minSessionSeconds: 120, minAttentionDrain: 4 },
    lineText: "Roger here. You have been quietly listening for a while now. Somebody on this line would really like to hear from you.",
    followUpAction: "suggest_send_message", cooldownSeconds: 320 },

  // Petty mood
  { id: "roger_named_petty_01", category: "picky", tone: "teasing",
    trigger: { requiredMoods: ["petty"], maxMessagesSent: 0, minAttentionDrain: 5 },
    lineText: "Roger here. Still watching you pass on everyone. I'll be here when you're ready.",
    cooldownSeconds: 280 },

  { id: "roger_named_petty_02", category: "picky", tone: "comedic",
    trigger: { requiredMoods: ["petty"], minSkips: 10, maxMessagesSent: 0, minAttentionDrain: 6 },
    lineText: "Roger checking in. The skip count is impressive. Genuinely impressive. Have you considered just saying hello to someone?",
    followUpAction: "suggest_send_message", cooldownSeconds: 300 },

  // Activated mood
  { id: "roger_named_activated_01", category: "reward", tone: "playful",
    trigger: { requiredMoods: ["activated"], minMessagesSent: 1, minAttentionDrain: 3 },
    lineText: "Roger here. You are absolutely doing the right things on this line right now. Keep going.",
    cooldownSeconds: 320 },

  { id: "roger_named_activated_02", category: "reengagement", tone: "seductive",
    trigger: { requiredMoods: ["activated"], minSessionSeconds: 240, minAttentionDrain: 5 },
    lineText: "Roger checking in. Long session, real commitment. This is what the line is for.",
    cooldownSeconds: 340 },

  // Chaos mood (post-game)
  { id: "roger_named_chaos_01", category: "reengagement", tone: "comedic",
    trigger: { requiredMoods: ["chaos"], minAttentionDrain: 4 },
    lineText: "Roger here. You played the game and you are still going. I genuinely do not know what to expect from you anymore.",
    cooldownSeconds: 380 },

  // High drain — Roger gets assertive and uses his name
  { id: "roger_named_high_01", category: "dominant", tone: "commanding",
    trigger: { maxMessagesSent: 0, minSessionSeconds: 200, minAttentionDrain: 8 },
    lineText: "Roger speaking. I am going to need you to send someone a message. That is not a suggestion.",
    followUpAction: "suggest_send_message", cooldownSeconds: 360 },

  // First message sent — Roger acknowledges it by name
  { id: "roger_named_reward_01", category: "reward", tone: "playful",
    trigger: { minMessagesSent: 1, minAttentionDrain: 3 },
    lineText: "Roger here. You just sent a message. That is exactly what this line is all about.",
    cooldownSeconds: 280 },

];

// ── Constants ─────────────────────────────────────────────────────────────────

/** Grace period after the call starts before any interruption can fire (ms). */
const START_GRACE_MS = 60_000;
/** Maximum total interruptions per session. */
const MAX_INTERRUPTIONS = 8;
/** Bonus seconds awarded for a correct bust. */
export const BUST_REWARD_SECONDS = 300;
/** Idle time (ms) that resets the engagement streak. */
const STREAK_IDLE_RESET_MS = 90_000;
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

// ── Attention Drain Engine ────────────────────────────────────────────────────

/**
 * Recalculates the attention drain score and engagement streak based on elapsed time.
 * Called every time getInterruption() runs.
 *
 * Drain:
 *   +3 per 30s idle, +2 per 30s with 0 messages. Clamped 0–10.
 *
 * Streak:
 *   +1 per 60s while "active" (last activity < 30s ago). Resets on idle > 90s.
 */
function updateSessionMetrics(s: CallerEngagementState): void {
  const now = Date.now();
  const elapsedSinceLastUpdate = (now - s.lastDrainUpdateMs) / 1000;
  if (elapsedSinceLastUpdate < 15) return; // throttle

  const idleMs  = now - s.lastActivityMs;
  const idleSec = idleMs / 1000;

  // ── Engagement Streak: reset on sustained idle ────────────────────────────
  if (idleMs > STREAK_IDLE_RESET_MS && s.engagementStreak > 0) {
    s.engagementStreak = 0;
    console.log(`[roger-streak] callSid=${s.callSid} streak reset (idle ${Math.round(idleSec)}s)`);
  }

  // ── Drain + streak time-increments ────────────────────────────────────────
  const intervals30 = Math.max(0, Math.floor(elapsedSinceLastUpdate / 30));
  const intervals60 = Math.max(0, Math.floor(elapsedSinceLastUpdate / 60));

  if (intervals30 > 0) {
    let drainDelta = 0;
    if (idleSec > 30) drainDelta += 3 * intervals30;     // idle time → drain
    if (s.messagesSent === 0) drainDelta += 2 * intervals30; // no msgs → drain
    s.attentionDrainScore = Math.min(10, s.attentionDrainScore + drainDelta);
  }

  // +1 streak per 60s while actively browsing (not idle)
  if (intervals60 > 0 && idleMs < 30_000) {
    s.engagementStreak = Math.min(10, s.engagementStreak + intervals60);
    s.lastStreakTickMs = now;
  }

  s.lastDrainUpdateMs = now;
}

/**
 * Returns the minimum gap (ms) between interruptions at this drain level.
 * Higher drain = shorter cooldown = Roger speaks more urgently.
 */
function drainCooldownMs(drain: number): number {
  if (drain >= 8) return 45_000;
  if (drain >= 6) return 60_000;
  if (drain >= 3) return 90_000;
  return Infinity; // drain < 3: no interrupts
}

// ── Mood Engine ───────────────────────────────────────────────────────────────

function computeTargetMood(flags: FakeMemoryFlags): RogerMood {
  if (flags.gamePlayed)              return "chaos";
  if (flags.active || flags.engaged) return "activated";
  if (flags.picky)                   return "petty";
  return "normal";
}

function refreshMood(s: CallerEngagementState, force = false): void {
  const now = Date.now();
  const sessionSec = (now - s.sessionStartMs) / 1000;
  const skips = s.greetingsSkipped;
  const msgs  = s.messagesSent;

  // Update fake memory flags
  s.fakeMemoryFlags = {
    picky:      skips >= 8 || (sessionSec > 120 && msgs === 0),
    shy:        msgs === 0 && sessionSec > 60,
    active:     msgs >= 2,
    engaged:    sessionSec > 240,
    gamePlayed: s.gameStarted || s.gameCompleted,
  };

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

export function initEngagementState(callSid: string, userId: string): void {
  if (states.has(callSid)) return;

  const now = Date.now();
  states.set(callSid, {
    callSid,
    userId,
    fakeMemoryFlags: { picky: false, shy: false, active: false, engaged: false, gamePlayed: false },
    rogerMood: "normal",
    lastMoodSwitchMs: 0,
    forceMoodRecalc: false,
    attentionDrainScore: 0,
    lastDrainUpdateMs: now,
    engagementStreak: 0,
    lastStreakTickMs: now,
    sessionStartMs: now,
    greetingsSkipped: 0,
    messagesSent: 0,
    lastActivityMs: now,
    lastInterruptionMs: 0,
    promptCooldowns: {},
    recentPromptIds: [],
    interruptionCount: 0,
    globalCooldownUntil: now + START_GRACE_MS,
    gameStarted: false,
    gameCompleted: false,
    gameBustTargetUserId: null,
    gameBustTargetInjected: false,
    gameBustMissed: false,
    gameBustedCorrectly: false,
  });
}

/** Roger is always the host. */
export function getActivePersonalityName(_callSid: string): string {
  return "Roger";
}

/** Returns Roger's current mood. */
export function getRogerMood(callSid: string): RogerMood {
  return states.get(callSid)?.rogerMood ?? "normal";
}

/** Returns the current attention drain score (0–10). */
export function getAttentionDrainScore(callSid: string): number {
  return states.get(callSid)?.attentionDrainScore ?? 0;
}

export function trackSkip(callSid: string): void {
  const s = states.get(callSid);
  if (!s) return;
  s.greetingsSkipped++;
  s.lastActivityMs = Date.now();
  // +2 per skip, clamped to 10
  s.attentionDrainScore = Math.min(10, s.attentionDrainScore + 2);
  s.forceMoodRecalc = true;
}

export function trackMessageSent(callSid: string): void {
  const s = states.get(callSid);
  if (!s) return;
  s.messagesSent++;
  s.lastActivityMs = Date.now();
  // Message sent reduces drain and boosts streak
  s.attentionDrainScore = Math.max(0, s.attentionDrainScore - 5);
  s.engagementStreak    = Math.min(10, s.engagementStreak + 2);
  s.forceMoodRecalc = true;
}

export function getEngagementStreak(callSid: string): number {
  return states.get(callSid)?.engagementStreak ?? 0;
}

export function trackActivity(callSid: string): void {
  const s = states.get(callSid);
  if (s) s.lastActivityMs = Date.now();
}

export function getEngagementState(callSid: string): CallerEngagementState | undefined {
  return states.get(callSid);
}

export function cleanupEngagementState(callSid: string): void {
  states.delete(callSid);
}

/**
 * Evaluate whether Roger should speak right now.
 *
 * Gating (replaces fixed global cooldown):
 *   drain < 3    → no interrupt
 *   drain 3–5    → 90s since last interrupt, light prompts (maxDrain 5)
 *   drain 6–7    → 60s since last interrupt
 *   drain 8–10   → 45s since last interrupt, all prompts
 *
 * @param excludedPromptIds - Prompt IDs heard by this caller in the last 24 h.
 *   These are skipped entirely so the caller never hears the same Roger line twice.
 *
 * Returns the best-matching prompt or null.
 */
export function getInterruption(callSid: string, excludedPromptIds: Set<string> = new Set()): EngagementPrompt | null {
  const s = states.get(callSid);
  if (!s) return null;

  const now = Date.now();
  if (now < s.globalCooldownUntil) return null;
  if (s.interruptionCount >= MAX_INTERRUPTIONS) return null;

  // Update drain, streak, and mood
  updateSessionMetrics(s);
  refreshMood(s);

  const drain = s.attentionDrainScore;

  // Drain gate — too low means Roger stays quiet
  if (drain < 3) return null;

  // Drain-adaptive cooldown since last interrupt
  const cooldownMs = drainCooldownMs(drain);
  const timeSinceLast = now - s.lastInterruptionMs;
  if (s.lastInterruptionMs > 0 && timeSinceLast < cooldownMs) return null;

  const sessionSec = (now - s.sessionStartMs) / 1000;
  const mood       = s.rogerMood;
  const flags      = s.fakeMemoryFlags;

  const sorted = [...PROMPT_LIBRARY].sort(
    (a, b) => PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category),
  );

  for (const prompt of sorted) {
    // Skip prompts this caller has already heard in the last 24 h
    if (excludedPromptIds.has(prompt.id)) continue;

    const cd = s.promptCooldowns[prompt.id];
    if (cd && now < cd) continue;

    if (
      prompt.category !== "game_invite" &&
      s.recentPromptIds.slice(-3).includes(prompt.id)
    ) continue;

    if (prompt.category === "game_invite" && (s.gameStarted || s.gameCompleted)) continue;
    if (prompt.trigger.requireNoGameStarted && s.gameStarted) continue;

    const t = prompt.trigger;
    if (t.minSkips          !== undefined && s.greetingsSkipped < t.minSkips)          continue;
    if (t.maxSkips          !== undefined && s.greetingsSkipped > t.maxSkips)          continue;
    if (t.minMessagesSent   !== undefined && s.messagesSent     < t.minMessagesSent)   continue;
    if (t.maxMessagesSent   !== undefined && s.messagesSent     > t.maxMessagesSent)   continue;
    if (t.minSessionSeconds !== undefined && sessionSec          < t.minSessionSeconds) continue;
    if (t.maxSessionSeconds !== undefined && sessionSec          > t.maxSessionSeconds) continue;

    // Attention drain range check
    if (t.minAttentionDrain !== undefined && drain < t.minAttentionDrain) continue;
    if (t.maxAttentionDrain !== undefined && drain > t.maxAttentionDrain) continue;

    // Mood check
    if (t.requiredMoods && t.requiredMoods.length > 0) {
      if (!t.requiredMoods.includes(mood)) continue;
    }

    // Flag checks
    if (t.requiredFlags && t.requiredFlags.length > 0) {
      if (!t.requiredFlags.every(f => flags[f])) continue;
    }
    if (t.forbiddenFlags && t.forbiddenFlags.length > 0) {
      if (t.forbiddenFlags.some(f => flags[f])) continue;
    }

    // ✓ Matched — consume
    s.promptCooldowns[prompt.id] = now + prompt.cooldownSeconds * 1000;
    s.recentPromptIds = [...s.recentPromptIds.slice(-4), prompt.id];
    s.lastInterruptionMs  = now;
    s.globalCooldownUntil = now + cooldownMs;
    s.interruptionCount++;

    console.log(`[roger] callSid=${callSid} prompt="${prompt.id}" mood="${mood}" drain=${drain} streak=${s.engagementStreak} skips=${s.greetingsSkipped} msgs=${s.messagesSent}`);
    return prompt;
  }

  return null;
}

export function startBustedGame(callSid: string, adminUserIds: string[]): string | null {
  const s = states.get(callSid);
  if (!s || s.gameStarted || adminUserIds.length === 0) return null;
  const target = adminUserIds[Math.floor(Math.random() * adminUserIds.length)];
  s.gameStarted = true;
  s.gameBustTargetUserId = target;
  s.gameBustTargetInjected = false;
  // Game start reduces drain significantly and boosts streak
  s.attentionDrainScore = Math.max(0, s.attentionDrainScore - 10);
  s.engagementStreak    = Math.min(10, s.engagementStreak + 3);
  s.forceMoodRecalc = true;
  return target;
}

export function markGameTargetInjected(callSid: string): void {
  const s = states.get(callSid);
  if (s) s.gameBustTargetInjected = true;
}

export function isGameTarget(callSid: string, profileUserId: string): boolean {
  const s = states.get(callSid);
  if (!s || !s.gameStarted || s.gameCompleted) return false;
  return s.gameBustTargetUserId === profileUserId;
}

export function markGameTargetPassed(callSid: string): void {
  const s = states.get(callSid);
  if (!s || !s.gameStarted || s.gameCompleted) return;
  s.gameCompleted = true;
  s.gameBustMissed = true;
}

export function processBust(
  callSid: string,
  currentProfileUserId: string,
): { result: "win" | "miss" | "no_game"; bonusSeconds: number } {
  const s = states.get(callSid);
  if (!s || !s.gameStarted || s.gameCompleted) return { result: "no_game", bonusSeconds: 0 };

  if (s.gameBustTargetUserId === currentProfileUserId) {
    s.gameCompleted = true;
    s.gameBustedCorrectly = true;
    return { result: "win", bonusSeconds: BUST_REWARD_SECONDS };
  }

  s.gameCompleted = true;
  s.gameBustMissed = true;
  return { result: "miss", bonusSeconds: 0 };
}

// ─── ElevenLabs v3 Emotion-Tagged Texts ──────────────────────────────────────
// Prompts listed here will be generated using the `eleven_v3` model with
// emotion audio-tags instead of plain delivery.  The emotion text is ONLY used
// for pre-generation; the plain lineText remains the IVR TTS fallback.
export const ROGER_V3_TEXTS: Record<string, string> = {
  // BASE — PICKY
  picky_01: "[chuckles] Wow. Still browsing? You might officially be the most selective man on the line right now. [playfully] Honestly... we love the standards.",
  picky_02: "[sarcastically] You have skipped more guys today than a DJ skips bad tracks. [curious] What exactly are you looking for? [quietly] Asking for a friend.",
  picky_04: "[laughs] Twenty skips. You have set a new record. We are genuinely impressed. [sighs] And also a little worried about you. Send someone a message.",
  picky_05: "[curious] You have been at this a while and nobody has caught your ear yet. [mischievously] Or... are you just nervous to reach out first?",

  // BASE — FLIRTY
  flirty_01: "[softly] You are making me blush just watching you browse. [warmly] Somebody out here really wants to hear from you right now.",
  flirty_02: "[whispers] Between you and me? Some of these guys have been waiting a long time for someone exactly like you to send them a message.",
  flirty_03: "[mischievously] Mmm. You clearly have taste. Not everyone holds out this long. [whispers] The right voice is closer than you think.",
  flirty_04: "[playfully] A little picky right now, are we?? [warmly] That is actually kind of attractive. Do not let it stop you from saying hello.",

  // BASE — DOMINANT
  dominant_01: "[firmly] Stop. Take a breath. Pick one and send a message. [encouraging] You can absolutely do this.",
  dominant_02: "[sighs] I am stepping in. [firmly] The very next caller you hear — send him a message. No more skipping. You have earned this.",
  dominant_03: "[commanding] You have been in charge long enough. Now let someone else have a chance. Press 1 and send that message.",

  // BASE — IDLE
  idle_01: "[quietly] Hey. Still there? [curious] The guys on the line are wondering about you.",
  idle_02: "[laughs softly] Did you fall asleep? No judgment. But there is someone on this line who would love to hear from you right now.",

  // BASE — REENGAGEMENT
  reengagement_01: "[warmly] Hey, you have been here a while. [encouraging] Have you tried sending a message yet? It takes two seconds — and the reply might surprise you.",
  reengagement_02: "[playfully] You are one of today's most dedicated callers. [encouraging] Do not let that go to waste — one message could change your whole session.",
  reengagement_04: "[warmly] You have put in the time. You deserve a real connection. [softly] Someone out here is waiting for exactly your energy.",

  // BASE — REWARD
  reward_01: "[warmly] Look at you — already making connections. [cheerfully] That is exactly what this is all about.",
  reward_02: "[excited] Two messages already? You are absolutely on fire right now. Keep it up.",
  reward_03: "[cheerfully] Three messages sent. You are the most active person on the line right now. [warmly] Somebody is going to be very happy.",

  // NORMAL MOOD
  normal_01: "[warmly] Take your time. I am not going anywhere. [quietly] The right voice will catch your ear when you least expect it.",
  normal_03: "[softly] It is the quiet ones that always have the most to say. [encouraging] Go ahead and reach out.",
  normal_05: "[quietly] Still with me? Good. [warmly] Just keep listening. The right one might be next.",
  normal_11: "[softly] Patience like yours is rare. [warmly] So is the connection waiting for you at the end of it. Keep going.",
  normal_12: "[sighs] You went quiet on me. I get it. [warmly] Some nights you just want to listen. But a message costs nothing.",

  // PETTY MOOD
  petty_01: "[sighs][sarcastically] Damn. You are picky right now, huh??",
  petty_02: "[chuckles][deadpan] Another one bites the dust. [sarcastically] You sure know what you do NOT want. That is half the battle, I guess.",
  petty_03: "[laughs] You have turned down more guys today than most people meet in a year. [deadpan] I respect it, honestly.",
  petty_04: "[flatly] I am not judging. [laughs] Actually... I might be judging a little. Just a little.",
  petty_05: "[sarcastically] At this rate we are going to run out of guys before you run out of opinions. [sighs] You might want to lower the bar just slightly.",
  petty_06: "[sighs] You keep passing on these guys but you will not reach out to any of them either. [deadpan] I see exactly what is happening here.",
  petty_07: "[deadpan] Okay at this point... you are just being difficult.",
  petty_08: "[sarcastically] You know what? Fine. Keep skipping. [flatly] I will be here. All night if I have to.",
  petty_09: "[laughs] You have ghosted more guys today than most apps see in a week.",
  petty_10: "[sighs] I am running out of new guys to show you. [deadpan] Not literally. But almost.",
  petty_11: "[deadpan] Let us be real. [sighs] You do not even know what you are looking for anymore.",

  // ROGER CUSTOM
  roger_04: "[sighs] You have been very still. [curious] Which means either you are very relaxed or you are overthinking everything. [warmly] Either way — say hello to someone.",
  roger_05: "[chuckles] Eleven skips. [deadpan] I have started giving them all nicknames. Skip. Skipped. Also Skipped. Another Skip.",
  roger_06: "[warmly] You know what I have never heard anyone regret? [playfully] Sending a message. Just something to think about.",
  roger_07: "[mischievously] Somewhere on this line is a guy who would absolutely love to get a message from you. [whispers] He just does not know it yet.",
};
