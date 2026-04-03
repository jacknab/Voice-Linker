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
 */

import { storage } from "./storage";

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
