#!/usr/bin/env tsx

/**
 * System Cleanup Script
 *
 * Part 1 — Delete stale free-trial accounts:
 *   Removes phone user records where membershipTier = 'free_trial'
 *   and the account was created 40+ days ago. Also purges all
 *   associated data (profile, messages, mailbox, etc.) and unlinks
 *   any web accounts that were connected to these phone numbers.
 *
 * Part 2 — Reset expired memberships:
 *   Nulls out membershipTier / remainingSeconds / membershipStartedAt
 *   for any user whose remainingSeconds has dropped to 0.
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
} from "../shared/schema";
import { eq, lte, and, isNotNull, or, inArray } from "drizzle-orm";

const DRY_RUN = !process.argv.includes("--run");
const STALE_FREE_TRIAL_DAYS = 40;

// ─── helpers ──────────────────────────────────────────────────────────────────

function banner(msg: string) {
  console.log(`\n─── ${msg} ${"─".repeat(Math.max(0, 70 - msg.length))}`);
}

function indent(msg: string) {
  console.log(`  ${msg}`);
}

// ─── Part 1: Delete stale free-trial accounts ─────────────────────────────────

async function cleanupStaleFreeTrialUsers(): Promise<number> {
  banner("Part 1: Delete stale free-trial accounts");

  const cutoff = new Date(Date.now() - STALE_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  indent(`Criteria : membershipTier = 'free_trial'  AND  createdAt ≤ ${cutoff.toISOString().slice(0, 10)}`);

  const staleUsers = await db
    .select({
      id: users.id,
      phoneNumber: users.phoneNumber,
      remainingSeconds: users.remainingSeconds,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        eq(users.membershipTier, "free_trial"),
        lte(users.createdAt, cutoff),
      ),
    );

  if (staleUsers.length === 0) {
    indent("Found 0 stale free-trial accounts — nothing to do.");
    return 0;
  }

  indent(`Found ${staleUsers.length} stale free-trial account(s):`);
  for (const u of staleUsers) {
    indent(
      `  • ${u.phoneNumber}  created=${u.createdAt?.toISOString().slice(0, 10)}  remaining=${u.remainingSeconds ?? 0}s`,
    );
  }

  if (DRY_RUN) {
    indent("[DRY RUN] No changes written.");
    return staleUsers.length;
  }

  const userIds    = staleUsers.map(u => u.id);
  const phoneNums  = staleUsers.map(u => u.phoneNumber);

  // 1. Active calls
  const ac = await db.delete(activeCalls).where(inArray(activeCalls.userId, userIds));
  indent(`  Deleted active_calls        : ${(ac as any).rowCount ?? "?"}`);

  // 2. Seed sessions
  const ss = await db.delete(seedSessions).where(inArray(seedSessions.userId, userIds));
  indent(`  Deleted seed_sessions       : ${(ss as any).rowCount ?? "?"}`);

  // 3. Moderation logs
  const ml = await db.delete(moderationLogs).where(inArray(moderationLogs.targetUserId, userIds));
  indent(`  Deleted moderation_logs     : ${(ml as any).rowCount ?? "?"}`);

  // 4. Block relationships (both sides)
  const buA = await db.delete(blockedUsers).where(inArray(blockedUsers.blockerId, userIds));
  const buB = await db.delete(blockedUsers).where(inArray(blockedUsers.blockedUserId, userIds));
  indent(`  Deleted blocked_users       : ${((buA as any).rowCount ?? 0) + ((buB as any).rowCount ?? 0)}`);

  // 5. Messages (sent and received)
  const msgA = await db.delete(messages).where(inArray(messages.fromUserId, userIds));
  const msgB = await db.delete(messages).where(inArray(messages.toUserId, userIds));
  indent(`  Deleted messages            : ${((msgA as any).rowCount ?? 0) + ((msgB as any).rowCount ?? 0)}`);

  // 6. Flagged content reported by these users
  const fc = await db.delete(flaggedContent).where(inArray(flaggedContent.reportedByUserId, userIds));
  indent(`  Deleted flagged_content     : ${(fc as any).rowCount ?? "?"}`);

  // 7. Promo redemptions
  const pr = await db.delete(promoRedemptions).where(inArray(promoRedemptions.userId, userIds));
  indent(`  Deleted promo_redemptions   : ${(pr as any).rowCount ?? "?"}`);

  // 8. Profiles
  const pf = await db.delete(profiles).where(inArray(profiles.userId, userIds));
  indent(`  Deleted profiles            : ${(pf as any).rowCount ?? "?"}`);

  // 9. Unlink web accounts that referenced these phone numbers
  const wu = await db
    .update(webUsers)
    .set({ linkedPhoneNumber: null, linkedMembershipNumber: null })
    .where(inArray(webUsers.linkedPhoneNumber, phoneNums));
  indent(`  Unlinked web_users          : ${(wu as any).rowCount ?? "?"}`);

  // 10. Delete users themselves (mailboxes cascade via FK)
  const du = await db.delete(users).where(inArray(users.id, userIds));
  indent(`  Deleted users               : ${(du as any).rowCount ?? "?"}`);

  indent(`✓ Removed ${staleUsers.length} stale free-trial account(s).`);
  return staleUsers.length;
}

// ─── Part 2: Reset expired memberships ────────────────────────────────────────

async function resetExpiredMemberships(): Promise<number> {
  banner("Part 2: Reset expired memberships (0 seconds remaining)");
  indent("Criteria : membershipTier IS NOT NULL  AND  remainingSeconds ≤ 0");

  const expired = await db
    .select({
      id: users.id,
      phoneNumber: users.phoneNumber,
      membershipTier: users.membershipTier,
      remainingSeconds: users.remainingSeconds,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.membershipTier),
        isNotNull(users.remainingSeconds),
        lte(users.remainingSeconds, 0),
      ),
    );

  if (expired.length === 0) {
    indent("Found 0 expired memberships — nothing to do.");
    return 0;
  }

  indent(`Found ${expired.length} expired membership(s):`);
  for (const u of expired) {
    indent(`  • ${u.phoneNumber}  tier=${u.membershipTier}  remaining=${u.remainingSeconds}s`);
  }

  if (DRY_RUN) {
    indent("[DRY RUN] No changes written.");
    return expired.length;
  }

  const expiredIds = expired.map(u => u.id);

  const result = await db
    .update(users)
    .set({
      membershipTier: null,
      remainingSeconds: null,
      membershipStartedAt: null,
    })
    .where(inArray(users.id, expiredIds));

  indent(`✓ Reset membership for ${(result as any).rowCount ?? expiredIds.length} user(s).`);
  return expiredIds.length;
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
    const deleted = await cleanupStaleFreeTrialUsers();
    const reset   = await resetExpiredMemberships();

    banner("Summary");
    indent(`Stale free-trial accounts deleted : ${deleted}${DRY_RUN ? " (dry run)" : ""}`);
    indent(`Expired memberships reset         : ${reset}${DRY_RUN ? " (dry run)" : ""}`);
    console.log("\n  Done.\n");
  } catch (err) {
    console.error("\n❌ Cleanup failed:", err);
    process.exit(1);
  }

  process.exit(0);
}

main();
