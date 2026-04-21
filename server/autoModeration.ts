/**
 * autoModeration.ts
 * Runs after every block and flag event. Applies 4 rules:
 *
 *  Rule 1 – Flag Threshold:    3+ unique callers flag same content → auto-flag (escalate)
 *  Rule 2 – Block Count:       3+ unique callers block same person within 24h → auto-flag profile
 *  Rule 4 – Repeat Flagging:   content removed before and flagged again → auto-remove + restrict
 *  Rule 5 – New Account Flag:  brand-new account (<10 min) gets flagged → auto-restrict
 *
 * Auto-remove threshold:  5+ unique flaggers → auto-remove content + restrict/ban user
 * Escalation:             1st auto-remove → restrict; 2nd → ban
 *
 * Recording Auto-Mod (runTranscriptionAutoChecks):
 *  - No/blank transcription → rejected as "unclear"
 *  - Too few meaningful words (< 6) → rejected as "unclear"
 *  - Repeated words (e.g. "hey hey hey") → rejected as "unclear"
 *  - Phone number detected in text → rejected as "phone_number"
 */

import { storage } from "./storage";

// Track URLs that have already been processed by the 65-second timer (prevents double-run)
const autoModTimerFired = new Set<string>();

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function autoRemoveContent(
  contentType: string,
  contentId: string,
  targetUserId: string,
  rule: string,
  reason: string,
) {
  // Mark all pending flags for this content as "removed"
  const items = await storage.getAllFlaggedItems();
  for (const item of items) {
    if (item.contentType === contentType && item.contentId === contentId && item.status === "pending") {
      await storage.resolveFlaggedItem(item.id, "removed");
    }
  }

  // Delete the profile recording if it's a profile flag
  if (contentType === "profile") {
    await storage.deleteProfileByUserId(targetUserId);
  }

  // Log the event
  await storage.logModerationEvent({
    targetUserId,
    eventType: "auto_remove",
    reason,
    triggeredByRule: rule,
    contentType,
    contentId,
  });

  console.log(`[automod] AUTO-REMOVE userId=${targetUserId} rule=${rule} reason="${reason}"`);

  // Escalate account status
  const priorRemovals = await storage.countAutoRemovesForUser(targetUserId);
  if (priorRemovals >= 2) {
    await banUser(targetUserId, rule, "Second content removal — automatic ban");
  } else {
    await restrictUser(targetUserId, rule, "Content removed by auto-moderation — access restricted");
  }
}

async function restrictUser(userId: string, rule: string, reason: string) {
  const user = await storage.getUserById(userId);
  if (!user || user.accountStatus !== "active") return;

  await storage.setUserAccountStatus(userId, "restricted");
  await storage.logModerationEvent({
    targetUserId: userId,
    eventType: "auto_restrict",
    reason,
    triggeredByRule: rule,
  });

  console.log(`[automod] AUTO-RESTRICT userId=${userId} rule=${rule} reason="${reason}"`);
}

async function banUser(userId: string, rule: string, reason: string) {
  const user = await storage.getUserById(userId);
  if (!user || user.accountStatus === "banned") return;

  await storage.setUserAccountStatus(userId, "banned");
  await storage.logModerationEvent({
    targetUserId: userId,
    eventType: "auto_ban",
    reason,
    triggeredByRule: rule,
  });

  console.log(`[automod] AUTO-BAN userId=${userId} rule=${rule} reason="${reason}"`);
}

// ─── Rule runners ─────────────────────────────────────────────────────────────

/**
 * Called after a flag is created.
 * Runs Rule 1 (threshold), Rule 4 (repeat), Rule 5 (new account).
 */
export async function runFlagAutoChecks(
  contentType: string,
  contentId: string,
  targetUserId: string | null,
) {
  if (!targetUserId) return;

  try {
    const distinctFlaggers = await storage.countDistinctFlaggers(contentType, contentId);

    // ── Rule 1: Flag Threshold ──────────────────────────────────────────────
    if (distinctFlaggers === 3) {
      // Create an auto-flag to escalate to admin queue
      await storage.createFlaggedItem({
        contentType,
        contentId,
        reason: `Auto-flagged: ${distinctFlaggers} unique callers reported this content`,
        status: "pending",
        reportedByUserId: null,
      });
      await storage.logModerationEvent({
        targetUserId,
        eventType: "auto_flag",
        reason: `${distinctFlaggers} unique callers flagged the same content`,
        triggeredByRule: "threshold_flag",
        contentType,
        contentId,
      });
      console.log(`[automod] Rule 1 triggered for ${contentType}/${contentId}: ${distinctFlaggers} unique flaggers`);
    }

    // ── Auto-remove threshold: 5+ unique flaggers ───────────────────────────
    if (distinctFlaggers >= 5) {
      await autoRemoveContent(
        contentType,
        contentId,
        targetUserId,
        "threshold_remove",
        `${distinctFlaggers} unique callers reported this content — auto-removed`,
      );
      return; // no further checks needed after removal
    }

    // ── Rule 4: Repeat Flagging ─────────────────────────────────────────────
    const removeCycles = await storage.countFlagRemoveCycles(contentType, contentId);
    if (removeCycles >= 2) {
      await autoRemoveContent(
        contentType,
        contentId,
        targetUserId,
        "repeat_flag",
        `Content flagged, removed, and re-flagged ${removeCycles} times — auto-removed`,
      );
      return;
    }

    // ── Rule 5: New Account Fast-Flag ───────────────────────────────────────
    const user = await storage.getUserById(targetUserId);
    if (user && user.createdAt) {
      const ageMs = Date.now() - new Date(user.createdAt).getTime();
      if (ageMs < TEN_MINUTES) {
        await restrictUser(
          targetUserId,
          "new_account_flag",
          "New account flagged within 10 minutes of creation — auto-restricted",
        );
        await storage.logModerationEvent({
          targetUserId,
          eventType: "auto_flag",
          reason: "New account flagged within 10 minutes of creation",
          triggeredByRule: "new_account_flag",
          contentType,
          contentId,
        });
        console.log(`[automod] Rule 5 triggered: new account userId=${targetUserId} flagged within ${Math.round(ageMs / 1000)}s`);
      }
    }
  } catch (err) {
    console.error("[automod] runFlagAutoChecks error:", err);
  }
}

// ─── Phone-number detection helpers ──────────────────────────────────────────

const SPOKEN_DIGIT_MAP: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const SPOKEN_DIGIT_PATTERN = /\b(zero|one|two|three|four|five|six|seven|eight|nine|oh)\b/gi;

// Words that can appear between digit groups in a phone number (filler only, NOT general words)
const INLINE_FILLER = /^(uh+|um+|er+|uhh+|hmm+|and|dash|hyphen)$/i;

/**
 * Returns true if the transcribed text appears to contain a phone number.
 *
 * Strategy:
 *  1. Direct regex for formatted phone numbers (with -, ., (), spaces)
 *  2. Tokenise into "digit tokens" (numeric strings or spoken digit words) vs "other",
 *     sliding along and collecting digit tokens separated only by filler words.
 *     If a contiguous window sums to 7 or 10 digits, it's a phone number.
 *
 * Example caught: "303 uh 430 2099" → tokens [303][uh=filler][430][2099] → 10 digits
 * Not caught: "I'm 25 years old, 6 foot 3 and 180 pounds" → no 7-digit window
 */
export function containsPhoneNumber(text: string): boolean {
  if (!text) return false;

  // ── 1. Common formatted patterns ──────────────────────────────────────────
  // 10-digit: 303-430-2099 / (303) 430-2099 / 303.430.2099 / 3034302099
  if (/\(?\d{3}\)?[\s.\-]{0,2}\d{3}[\s.\-]{0,2}\d{4}/.test(text)) return true;
  // 7-digit: 430-2099 / 4302099
  if (/\b\d{3}[\s.\-]\d{4}\b/.test(text)) return true;
  // 10 consecutive digits anywhere (after stripping punctuation)
  if (/\b\d{10}\b/.test(text.replace(/[\s\-().]/g, " "))) return true;

  // ── 2. Tokenise and slide for spoken/spaced digit sequences ───────────────
  // Replace spoken digit words with digit characters in a clone
  const normalised = text.replace(SPOKEN_DIGIT_PATTERN, (m) => SPOKEN_DIGIT_MAP[m.toLowerCase()] ?? m);

  // Split into tokens (words and numbers)
  const tokens = normalised.trim().split(/\s+/);

  let digitBuffer = "";
  let gapCount = 0;         // consecutive non-digit, non-filler tokens seen since last digit token
  const MAX_GAP = 0;        // only filler words (uh, um, and, dash) can bridge digit groups; any real word resets

  for (const token of tokens) {
    // Check if this token is purely digits
    const digitsOnly = token.replace(/[^0-9]/g, "");
    const isDigitToken = digitsOnly.length > 0 && digitsOnly.length === token.length;
    const isFillerToken = INLINE_FILLER.test(token);

    if (isDigitToken) {
      digitBuffer += digitsOnly;
      gapCount = 0;
    } else if (isFillerToken && digitBuffer.length > 0) {
      // Filler between digit groups — keep the buffer alive
      gapCount = 0;
    } else {
      // Non-digit, non-filler word — close the current window
      if (digitBuffer.length >= 7) return true;
      // Only reset if we've seen more than MAX_GAP breaking words in a row
      gapCount++;
      if (gapCount > MAX_GAP) {
        digitBuffer = "";
        gapCount = 0;
      }
    }
  }

  // Check whatever's left in the buffer
  if (digitBuffer.length >= 7) return true;

  return false;
}

// ─── Repeated-word / low-quality detection ────────────────────────────────────

/**
 * Words excluded from the repetition check because they appear naturally
 * multiple times in normal speech ("I'm looking... and I'm into... and I'm...").
 * NOTE: greeting words like "hey" and "hello" are intentionally NOT in this list
 * so that "hey hey hey boys" is still caught by the repetition check.
 */
const STOP_WORDS = new Set([
  "i", "im", "a", "an", "the", "and", "or", "but", "if", "for", "in", "on",
  "at", "to", "is", "are", "was", "were", "be", "been", "being", "have",
  "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "my", "me", "you", "your", "we", "they", "their", "this",
  "that", "what", "who", "how", "so", "as", "with", "from", "about",
  "just", "get", "go", "come", "know", "want", "good", "can", "looking",
  "of", "not", "it", "its", "up", "out", "he", "she", "by", "into",
  "more", "some", "any", "than", "then", "also", "too", "very",
  "here", "there", "when", "where", "which", "all", "other", "new",
  "no", "yeah", "yes", "ok", "okay", "hi", "hello", "well", "um", "uh", "oh",
  "us", "am", "really", "like", "love", "enjoy", "need", "feel",
  "think", "see", "try", "give", "take", "make", "let", "put", "say",
]);

/**
 * Returns true if the recording appears to be low-quality or meaningless:
 *  - Fewer than 4 words total
 *  - All content (non-filler) words are the same word repeated 3+ times
 *    (e.g. "hey hey hey boys" — "hey" x3 in 4 words)
 *  - Content words are 80%+ the same single word
 *
 * Common words ("I'm", "and", "like", etc.) are excluded from the repetition
 * analysis so natural speech doesn't get flagged.
 */
export function isLowQualityTranscription(text: string): boolean {
  if (!text || text.trim().length === 0) return true;

  const words = text.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter(Boolean);

  // Too few words total — clearly not a real greeting
  if (words.length < 4) return true;

  // Filter out stop words to get meaningful "content" words
  const contentWords = words.filter(w => !STOP_WORDS.has(w));

  // If nothing is left after filtering, it's just filler noise
  if (contentWords.length === 0) return true;

  // Count frequency of each content word
  const freq: Record<string, number> = {};
  for (const w of contentWords) {
    freq[w] = (freq[w] ?? 0) + 1;
  }

  const maxCount = Math.max(...Object.values(freq));

  // A non-stop word repeated 3+ times in the content is a red flag
  // e.g. "hey hey hey boys" → contentWords=["hey","hey","hey","boys"], maxCount=3
  if (maxCount >= 3) return true;

  // More than 80% of content words are the same single word
  if (contentWords.length >= 3 && maxCount / contentWords.length > 0.8) return true;

  return false;
}

// ─── Main transcription auto-check ───────────────────────────────────────────

/**
 * Called from the transcription callback after storing the transcription.
 * Checks the recording for policy violations and, if found:
 *   1. Removes the recording from the system
 *   2. Sets a rejection flag on the user record
 *   3. Logs a moderation event
 *
 * @param recordingUrl  The Twilio recording URL (used to look up which record was transcribed)
 * @param text          The transcription text (null if transcription failed)
 */
export async function runTranscriptionAutoChecks(
  recordingUrl: string,
  text: string | null,
): Promise<void> {
  try {
    // Try to find the associated user via profile first, then mailbox
    let user = await storage.getUserByProfileRecordingUrl(recordingUrl);
    let recordingType: "greeting" | "personal_ad" = "greeting";

    if (!user) {
      user = await storage.getUserByMailboxAdRecordingUrl(recordingUrl);
      recordingType = "personal_ad";
    }

    if (!user) {
      console.log(`[automod-transcription] No user found for recordingUrl=${recordingUrl} — skipping`);
      return;
    }

    const userId = user.id;
    const typeLabel = recordingType === "greeting" ? "greeting" : "personal ad";

    // ── Check 1: No transcription or blank ─────────────────────────────────
    if (!text || text.trim().length === 0) {
      console.log(`[automod-transcription] REJECT userId=${userId} type=${recordingType} reason=no_transcription`);
      await rejectRecording(userId, recordingType, "unclear", `Auto-rejected: no transcription text for ${typeLabel}`);
      return;
    }

    // ── Check 2: Phone number detected ─────────────────────────────────────
    if (containsPhoneNumber(text)) {
      console.log(`[automod-transcription] REJECT userId=${userId} type=${recordingType} reason=phone_number text="${text}"`);
      await rejectRecording(userId, recordingType, "phone_number", `Auto-rejected: phone number detected in ${typeLabel} transcription`);
      return;
    }

    // ── Check 3: Low quality / repeated words ──────────────────────────────
    if (isLowQualityTranscription(text)) {
      console.log(`[automod-transcription] REJECT userId=${userId} type=${recordingType} reason=low_quality text="${text}"`);
      await rejectRecording(userId, recordingType, "unclear", `Auto-rejected: low-quality or repeated-word ${typeLabel} transcription`);
      return;
    }

    console.log(`[automod-transcription] PASSED userId=${userId} type=${recordingType} text="${text}"`);
  } catch (err) {
    console.error("[automod-transcription] runTranscriptionAutoChecks error:", err);
  }
}

async function rejectRecording(
  userId: string,
  recordingType: "greeting" | "personal_ad",
  reason: "unclear" | "phone_number",
  logReason: string,
): Promise<void> {
  // Remove the recording from the system
  if (recordingType === "greeting") {
    await storage.deleteProfileByUserId(userId);
  } else {
    await storage.clearMailboxAdByUserId(userId);
  }

  // Set rejection flag on user so the IVR can intercept next call
  await storage.setUserRecordingRejection(userId, reason, recordingType);

  // Log moderation event
  await storage.logModerationEvent({
    targetUserId: userId,
    eventType: "auto_remove",
    reason: logReason,
    triggeredByRule: `recording_${reason}`,
    contentType: recordingType,
    contentId: userId,
  });
}

/**
 * Called after a block is created.
 * Runs Rule 2 (block count within 24h).
 */
export async function runBlockAutoChecks(blockedUserId: string) {
  try {
    // ── Rule 2: Block Count within 24h ─────────────────────────────────────
    const distinctBlockers = await storage.countDistinctBlockersInWindow(blockedUserId, TWENTY_FOUR_HOURS);

    if (distinctBlockers >= 3) {
      // Find the blocked user's profile and flag it
      const user = await storage.getUserById(blockedUserId);
      if (!user) return;

      // Check if we've already auto-flagged for this reason today to avoid spam
      const existing = await storage.getModerationLogs({ targetUserId: blockedUserId, limit: 10 });
      const alreadyFlaggedToday = existing.some(e => {
        if (e.triggeredByRule !== "block_count") return false;
        const age = Date.now() - new Date(e.createdAt!).getTime();
        return age < TWENTY_FOUR_HOURS;
      });

      if (!alreadyFlaggedToday) {
        // Auto-flag the profile
        await storage.createFlaggedItem({
          contentType: "profile",
          contentId: blockedUserId,
          reason: `Auto-flagged: ${distinctBlockers} unique callers blocked this person within 24 hours`,
          status: "pending",
          reportedByUserId: null,
        });
        await storage.logModerationEvent({
          targetUserId: blockedUserId,
          eventType: "auto_flag",
          reason: `${distinctBlockers} unique callers blocked this person within 24 hours`,
          triggeredByRule: "block_count",
          contentType: "profile",
          contentId: blockedUserId,
        });
        console.log(`[automod] Rule 2 triggered: ${distinctBlockers} unique blockers for userId=${blockedUserId} in 24h`);

        // If 5+ blockers in 24h, escalate to ban
        if (distinctBlockers >= 5) {
          await banUser(blockedUserId, "block_count", `${distinctBlockers} unique callers blocked within 24 hours`);
        }
      }
    }
  } catch (err) {
    console.error("[automod] runBlockAutoChecks error:", err);
  }
}

// ─── Scheduled auto-mod timer (65 seconds after recording save) ──────────────
/**
 * Schedules a 65-second fallback auto-mod check for a newly saved greeting.
 * Only monitors greetings — personal ads and other recordings are not checked.
 *
 * The primary check runs immediately after transcription completes (triggered
 * from the transcription callback in save-profile). This timer is a safety net:
 * if transcription never arrives after 65 seconds, the greeting is rejected as
 * unclear (blank/silent recording assumed).
 *
 * Guards against double-processing via autoModTimerFired set.
 */
export function scheduleAutoModCheck(
  recordingUrl: string,
  userId: string,
  recordingType: "greeting" | "personal_ad",
): void {
  // Only monitor greetings — personal ads are not auto-moderated
  if (recordingType !== "greeting") return;

  setTimeout(async () => {
    if (autoModTimerFired.has(recordingUrl)) {
      console.log(`[automod-timer] Already processed recordingUrl=${recordingUrl} — skipping`);
      return;
    }
    autoModTimerFired.add(recordingUrl);
    // Auto-clean the set after 1 hour to avoid unbounded memory growth
    setTimeout(() => autoModTimerFired.delete(recordingUrl), 3_600_000);

    try {
      // Check if the greeting still exists in the DB
      const user = await storage.getUserByProfileRecordingUrl(recordingUrl);
      if (!user) {
        console.log(`[automod-timer] Profile already removed for recordingUrl=${recordingUrl} — skipping`);
        return;
      }

      const profile = await storage.getProfile(user.id);
      const transcriptionText = profile?.transcription ?? null;

      if (transcriptionText !== null) {
        // Transcription arrived — the callback-triggered check should have already
        // handled this, but run it again as a safety net (the set guard above
        // prevents the timer from re-running if the callback already fired it).
        console.log(`[automod-timer] Fallback text check for recordingUrl=${recordingUrl}`);
        await runTranscriptionAutoChecks(recordingUrl, transcriptionText);
      } else {
        // No transcription after 65s — treat as blank/unclear and reject
        console.log(`[automod-timer] No transcription after 65s for recordingUrl=${recordingUrl} — rejecting as unclear`);
        await rejectRecording(userId, "greeting", "unclear", "Auto-rejected: no transcription available after 65 seconds (blank or silent recording)");
      }
    } catch (err) {
      console.error("[automod-timer] scheduleAutoModCheck error:", err);
    }
  }, 65_000);
}

