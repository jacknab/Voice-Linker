#!/usr/bin/env tsx

/**
 * System Cleanup Script
 *
 * Part 1 — Delete stale free-trial accounts:
 *   Removes phone user records where membershipTier = 'free_trial'
 *   and the account was created 40+ days ago. Also purges all
 *   associated data and unlinks any connected web accounts.
 *
 * Part 2 — Reset expired memberships:
 *   Nulls out membershipTier / remainingSeconds / membershipStartedAt
 *   for any user whose remainingSeconds has dropped to 0.
 *
 * Part 3 — Purge inactive mailboxes & personal ads (MM system):
 *   Deletes the mailbox and voice profile for any member who has not
 *   checked their mailbox in 21 days. Membership and user account
 *   are preserved — only the mailbox + profile are removed.
 *
 * Part 4 — Delete dormant paid-membership accounts:
 *   Fully deletes any user with a non-free-trial membership (with or
 *   without remaining minutes) who has not called in 61+ days.
 *   Removes everything: greeting, mailbox, messages, personal ads,
 *   call logs, blocks, promo redemptions, and unlinks web accounts.
 *
 * Usage:
 *   npx tsx scripts/cleanup.ts          → dry run (preview only, no DB writes)
 *   npx tsx scripts/cleanup.ts --run    → live run (commits changes)
 */

import { config } from "dotenv";
config();

import { db } from "../server/db";
import {
  users,
  profiles,
  messages,
  activeCalls,
  blockedUsers,
  promoRedemptions,
  seedSessions,
  moderationLogs,
  flaggedContent,
  webUsers,
  webUserAltPhones,
  membershipCards,
  mailboxes,
  callLogs,
} from "../shared/schema";
import {
  eq, lte, and, isNotNull, or, inArray, isNull, sql,
} from "drizzle-orm";

const DRY_RUN = !process.argv.includes("--run");
const STALE_FREE_TRIAL_DAYS  = 40;
const MAILBOX_INACTIVE_DAYS  = 21;
const DORMANT_ACCOUNT_DAYS   = 61;

// ─── helpers ──────────────────────────────────────────────────────────────────

function banner(msg: string) {
  console.log(`\n─── ${msg} ${"─".repeat(Math.max(0, 70 - msg.length))}`);
}

function indent(msg: string) {
  console.log(`  ${msg}`);
}

function rows(result: unknown): number {
  return (result as any).rowCount ?? 0;
}

// ─── Shared: fully delete users and all associated data ───────────────────────
//
// Handles both Part 1 and Part 4. Deletes in dependency order so no FK
// violations occur, then unlinks any web accounts tied to these phone numbers.
//
// Every table that references users (directly or by phone number) is covered:
//
//   active_calls          userId
//   seed_sessions         userId
//   moderation_logs       targetUserId
//   blocked_users         blockerId / blockedUserId  (both sides)
//   promo_redemptions     userId
//   messages              fromUserId / toUserId      (both sides)
//   flagged_content       contentId → profile/message ids  +  reportedByUserId
//   profiles              userId
//   call_logs             fromPhoneNumber
//   web_user_alt_phones   phoneNumber
//   membership_cards      phoneNumber  (cleared, not deleted — card still exists)
//   web_users             linkedPhoneNumber  (unlinked, not deleted)
//   users                 id           (mailboxes cascade via FK onDelete: "cascade")

interface UserStub {
  id: string;
  phoneNumber: string;
}

async function deleteUsersAndAllData(targets: UserStub[]): Promise<void> {
  if (targets.length === 0) return;

  const userIds   = targets.map(u => u.id);
  const phoneNums = targets.map(u => u.phoneNumber);

  // ── 1. Active calls ────────────────────────────────────────────────────────
  indent(`  Deleted active_calls            : ${rows(await db.delete(activeCalls).where(inArray(activeCalls.userId, userIds)))}`);

  // ── 2. Seed sessions ───────────────────────────────────────────────────────
  indent(`  Deleted seed_sessions           : ${rows(await db.delete(seedSessions).where(inArray(seedSessions.userId, userIds)))}`);

  // ── 3. Moderation logs ─────────────────────────────────────────────────────
  indent(`  Deleted moderation_logs         : ${rows(await db.delete(moderationLogs).where(inArray(moderationLogs.targetUserId, userIds)))}`);

  // ── 4. Block relationships — both sides ────────────────────────────────────
  const buA = rows(await db.delete(blockedUsers).where(inArray(blockedUsers.blockerId, userIds)));
  const buB = rows(await db.delete(blockedUsers).where(inArray(blockedUsers.blockedUserId, userIds)));
  indent(`  Deleted blocked_users           : ${buA + buB}`);

  // ── 5. Promo redemptions ───────────────────────────────────────────────────
  indent(`  Deleted promo_redemptions       : ${rows(await db.delete(promoRedemptions).where(inArray(promoRedemptions.userId, userIds)))}`);

  // ── 6. Collect profile + message IDs before deletion (needed for flagged_content)
  const userProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(inArray(profiles.userId, userIds));
  const profileIds = userProfiles.map(p => p.id);

  const userMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(or(inArray(messages.fromUserId, userIds), inArray(messages.toUserId, userIds)));
  const messageIds = userMessages.map(m => m.id);

  // ── 7. Flagged content — three vectors:
  //       a) reported by this user
  //       b) content IS this user's profile
  //       c) content IS a message sent/received by this user
  const contentIds = [...profileIds, ...messageIds];
  let fcCount = rows(await db.delete(flaggedContent).where(inArray(flaggedContent.reportedByUserId, userIds)));
  if (contentIds.length > 0) {
    fcCount += rows(await db.delete(flaggedContent).where(inArray(flaggedContent.contentId, contentIds)));
  }
  indent(`  Deleted flagged_content         : ${fcCount}`);

  // ── 8. Messages — both sides ───────────────────────────────────────────────
  const msgA = rows(await db.delete(messages).where(inArray(messages.fromUserId, userIds)));
  const msgB = rows(await db.delete(messages).where(inArray(messages.toUserId, userIds)));
  indent(`  Deleted messages                : ${msgA + msgB}`);

  // ── 9. Profiles (voice greeting / personal ad) ─────────────────────────────
  indent(`  Deleted profiles                : ${rows(await db.delete(profiles).where(inArray(profiles.userId, userIds)))}`);

  // ── 10. Call logs (by phone number — no FK, purely text match) ─────────────
  indent(`  Deleted call_logs               : ${rows(await db.delete(callLogs).where(inArray(callLogs.fromPhoneNumber, phoneNums)))}`);

  // ── 11. Alt phone entries that use these phone numbers ─────────────────────
  //        (another web user may have added this number as an alternate)
  indent(`  Deleted web_user_alt_phones     : ${rows(await db.delete(webUserAltPhones).where(inArray(webUserAltPhones.phoneNumber, phoneNums)))}`);

  // ── 12. Membership cards — clear the phone binding so the card reads as
  //         unactivated again rather than pointing at a deleted user.
  indent(`  Cleared membership_cards.phone  : ${rows(await db.update(membershipCards).set({ phoneNumber: null }).where(inArray(membershipCards.phoneNumber, phoneNums)))}`);

  // ── 13. Web accounts — unlink the phone number (web account itself stays)
  indent(`  Unlinked web_users              : ${rows(await db.update(webUsers).set({ linkedPhoneNumber: null, linkedMembershipNumber: null }).where(inArray(webUsers.linkedPhoneNumber, phoneNums)))}`);

  // ── 14. Delete users — mailboxes cascade automatically via FK onDelete: "cascade"
  indent(`  Deleted users (+mailboxes)      : ${rows(await db.delete(users).where(inArray(users.id, userIds)))}`);
}

// ─── Part 1: Delete stale free-trial accounts ─────────────────────────────────

async function cleanupStaleFreeTrialUsers(): Promise<number> {
  banner("Part 1: Delete stale free-trial accounts");

  const cutoff = new Date(Date.now() - STALE_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  indent(`Criteria : membershipTier = 'free_trial'  AND  createdAt ≤ ${cutoff.toISOString().slice(0, 10)}`);

  const staleUsers = await db
    .select({ id: users.id, phoneNumber: users.phoneNumber, remainingSeconds: users.remainingSeconds, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.membershipTier, "free_trial"), lte(users.createdAt, cutoff)));

  if (staleUsers.length === 0) {
    indent("Found 0 stale free-trial accounts — nothing to do.");
    return 0;
  }

  indent(`Found ${staleUsers.length} stale free-trial account(s):`);
  for (const u of staleUsers) {
    indent(`  • ${u.phoneNumber}  created=${u.createdAt?.toISOString().slice(0, 10)}  remaining=${u.remainingSeconds ?? 0}s`);
  }

  if (DRY_RUN) { indent("[DRY RUN] No changes written."); return staleUsers.length; }

  await deleteUsersAndAllData(staleUsers);
  indent(`✓ Removed ${staleUsers.length} stale free-trial account(s).`);
  return staleUsers.length;
}

// ─── Part 2: Reset expired memberships ────────────────────────────────────────

async function resetExpiredMemberships(): Promise<number> {
  banner("Part 2: Reset expired memberships (0 seconds remaining)");
  indent("Criteria : membershipTier IS NOT NULL  AND  remainingSeconds ≤ 0");

  const expired = await db
    .select({ id: users.id, phoneNumber: users.phoneNumber, membershipTier: users.membershipTier, remainingSeconds: users.remainingSeconds })
    .from(users)
    .where(and(isNotNull(users.membershipTier), isNotNull(users.remainingSeconds), lte(users.remainingSeconds, 0)));

  if (expired.length === 0) {
    indent("Found 0 expired memberships — nothing to do.");
    return 0;
  }

  indent(`Found ${expired.length} expired membership(s):`);
  for (const u of expired) {
    indent(`  • ${u.phoneNumber}  tier=${u.membershipTier}  remaining=${u.remainingSeconds}s`);
  }

  if (DRY_RUN) { indent("[DRY RUN] No changes written."); return expired.length; }

  await db
    .update(users)
    .set({ membershipTier: null, remainingSeconds: null, membershipStartedAt: null })
    .where(inArray(users.id, expired.map(u => u.id)));

  indent(`✓ Reset membership for ${expired.length} user(s).`);
  return expired.length;
}

// ─── Part 3: Purge inactive mailboxes & personal ads (MM system) ───────────────
//
// User account + membership are preserved. Only the mailbox and profile
// (voice greeting / personal ad) are removed. Any flagged_content rows whose
// contentId pointed at those now-deleted profiles are also cleaned up.

async function purgeInactiveMailboxes(): Promise<number> {
  banner("Part 3: Purge inactive mailboxes & personal ads (MM system)");

  const cutoff = new Date(Date.now() - MAILBOX_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
  indent(`Criteria : mailbox not checked in ${MAILBOX_INACTIVE_DAYS} days (lastCheckedAt, falling back to createdAt)`);
  indent(`Cutoff   : ${cutoff.toISOString().slice(0, 10)}`);

  const staleMailboxes = await db
    .select({ id: mailboxes.id, userId: mailboxes.userId, mailboxNumber: mailboxes.mailboxNumber, lastCheckedAt: mailboxes.lastCheckedAt, createdAt: mailboxes.createdAt })
    .from(mailboxes)
    .where(
      or(
        and(isNotNull(mailboxes.lastCheckedAt), lte(mailboxes.lastCheckedAt, cutoff)),
        and(isNull(mailboxes.lastCheckedAt),    lte(mailboxes.createdAt, cutoff)),
      ),
    );

  if (staleMailboxes.length === 0) {
    indent("Found 0 inactive mailboxes — nothing to do.");
    return 0;
  }

  indent(`Found ${staleMailboxes.length} inactive mailbox(es):`);
  for (const m of staleMailboxes) {
    const lastSeen = m.lastCheckedAt
      ? `last checked ${m.lastCheckedAt.toISOString().slice(0, 10)}`
      : `never checked, created ${m.createdAt?.toISOString().slice(0, 10)}`;
    indent(`  • mailbox #${m.mailboxNumber}  (${lastSeen})`);
  }

  if (DRY_RUN) { indent("[DRY RUN] No changes written."); return staleMailboxes.length; }

  const staleUserIds    = staleMailboxes.map(m => m.userId);
  const staleMailboxIds = staleMailboxes.map(m => m.id);

  // Collect profile IDs before deletion so we can clean flagged_content
  const userProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(inArray(profiles.userId, staleUserIds));
  const profileIds = userProfiles.map(p => p.id);

  // Delete flagged_content rows whose contentId points to these profiles
  if (profileIds.length > 0) {
    const fc = rows(await db.delete(flaggedContent).where(inArray(flaggedContent.contentId, profileIds)));
    indent(`  Deleted flagged_content         : ${fc}`);
  }

  // Delete profiles (personal ads / greetings)
  indent(`  Deleted profiles (personal ads) : ${rows(await db.delete(profiles).where(inArray(profiles.userId, staleUserIds)))}`);

  // Delete mailboxes
  indent(`  Deleted mailboxes               : ${rows(await db.delete(mailboxes).where(inArray(mailboxes.id, staleMailboxIds)))}`);

  indent(`✓ Purged ${staleMailboxes.length} inactive mailbox(es) and their personal ads.`);
  indent("  Note: member accounts and memberships are preserved.");
  return staleMailboxes.length;
}

// ─── Part 4: Delete dormant paid-membership accounts ─────────────────────────
//
// Targets: non-free-trial users whose most recent inbound call is older than
// 61 days, or who have never called at all. Deletes the full account and
// everything linked to it via deleteUsersAndAllData.

async function deleteDormantMembershipAccounts(): Promise<number> {
  banner("Part 4: Delete dormant paid-membership accounts");

  const cutoff = new Date(Date.now() - DORMANT_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);
  indent(`Criteria : non-free-trial membershipTier IS NOT NULL  AND  last call ≤ ${cutoff.toISOString().slice(0, 10)} (or never called)`);

  // LEFT JOIN so users who have never called also appear (last_call_at = null).
  const rows2 = await db.execute<{
    id: string;
    phone_number: string;
    membership_tier: string;
    remaining_seconds: number | null;
    last_call_at: Date | null;
  }>(sql`
    SELECT
      u.id,
      u.phone_number,
      u.membership_tier,
      u.remaining_seconds,
      MAX(cl.started_at) AS last_call_at
    FROM users u
    LEFT JOIN call_logs cl ON cl.from_phone_number = u.phone_number
    WHERE
      u.membership_tier IS NOT NULL
      AND u.membership_tier != 'free_trial'
    GROUP BY u.id
    HAVING
      MAX(cl.started_at) < ${cutoff}
      OR MAX(cl.started_at) IS NULL
  `);

  const dormant: { id: string; phone_number: string; membership_tier: string; remaining_seconds: number | null; last_call_at: Date | null }[] =
    (rows2 as any).rows ?? rows2;

  if (!dormant.length) {
    indent("Found 0 dormant accounts — nothing to do.");
    return 0;
  }

  indent(`Found ${dormant.length} dormant account(s):`);
  for (const u of dormant) {
    const lastCall = u.last_call_at ? new Date(u.last_call_at).toISOString().slice(0, 10) : "never";
    indent(`  • ${u.phone_number}  tier=${u.membership_tier}  remaining=${u.remaining_seconds ?? 0}s  last_call=${lastCall}`);
  }

  if (DRY_RUN) { indent("[DRY RUN] No changes written."); return dormant.length; }

  await deleteUsersAndAllData(
    dormant.map(u => ({ id: u.id, phoneNumber: u.phone_number })),
  );

  indent(`✓ Deleted ${dormant.length} dormant paid-membership account(s) and all linked data.`);
  return dormant.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log(`║  System Cleanup Script  ${DRY_RUN ? "— DRY RUN (no changes written)         " : "— LIVE RUN (changes committed to DB)  "}║`);
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  if (DRY_RUN) {
    console.log("\n  Pass --run to execute changes:  npx tsx scripts/cleanup.ts --run");
  } else {
    console.log("\n  ⚠️  LIVE MODE — database will be modified.");
  }

  try {
    const deleted1 = await cleanupStaleFreeTrialUsers();
    const reset    = await resetExpiredMemberships();
    const purged   = await purgeInactiveMailboxes();
    const deleted4 = await deleteDormantMembershipAccounts();

    banner("Summary");
    indent(`Stale free-trial accounts deleted : ${deleted1}${DRY_RUN ? " (dry run)" : ""}`);
    indent(`Expired memberships reset         : ${reset}${DRY_RUN ? " (dry run)" : ""}`);
    indent(`Inactive mailboxes purged         : ${purged}${DRY_RUN ? " (dry run)" : ""}`);
    indent(`Dormant paid accounts deleted     : ${deleted4}${DRY_RUN ? " (dry run)" : ""}`);
    console.log("\n  Done.\n");
  } catch (err) {
    console.error("\n❌ Cleanup failed:", err);
    process.exit(1);
  }

  process.exit(0);
}

main();
