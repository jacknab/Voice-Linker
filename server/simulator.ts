import { storage } from "./storage";
import { db } from "./db";
import { profiles, activeCalls } from "@shared/schema";
import { eq, like } from "drizzle-orm";
import { log } from "./index";

export const VIRTUAL_PREFIX = "VIRTUAL-";

// Tracks userIds that are currently running a seed session loop
const runningSimulations = new Set<string>();

// Tracks admin-uploaded userId loops so they can be stopped cleanly
const adminLoops = new Set<string>();

// Tracks the regionId each admin seed is assigned to (survives cooldowns)
const adminSeedRegions = new Map<string, string>();

// Concurrency cap for real-caller seed sessions (admin-uploaded run separately)
const MAX_REAL_CALLER_SEEDS = 10;

// How many minutes between real-caller scheduler checks
const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Region assignment helpers ────────────────────────────────────────────────

// Pick a region for a new seed.  For linked pairs (A ↔ B) we only assign to
// the region whose id is lexicographically smaller — this ensures each linked
// pair acts as a single "slot" so the same seed never appears in both halves.
async function pickRegionForSeed(): Promise<string | undefined> {
  const allRegions = await storage.getAllRegions().catch(() => []);
  const activeRegions = allRegions.filter(r => r.isActive);
  if (activeRegions.length === 0) return undefined;

  // For every linked pair (A ↔ B), keep only the lexicographically-smaller id
  // so we never accidentally double-assign to a linked pair.
  const assignable = activeRegions.filter(r => {
    if (!r.linkedRegionId) return true;
    return r.id < r.linkedRegionId;
  });

  const pool = assignable.length > 0 ? assignable : activeRegions;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ─── Core: bounded seed session ──────────────────────────────────────────────
// Runs one 30–45 min session for the given profile.
// Within the session the profile cycles on/off naturally.
// After the session ends the profile goes offline and the session is logged.
async function runSeedSession(
  userId: string,
  source: "admin_uploaded" | "real_caller",
  regionId?: string,
): Promise<void> {
  const callSid = `${VIRTUAL_PREFIX}${userId}`;
  const sessionMinutes = randomBetween(30, 45);
  const sessionDurationMs = sessionMinutes * 60 * 1000;
  const sessionEnd = Date.now() + sessionDurationMs;
  const scheduledEndAt = new Date(sessionEnd);

  // Record session start
  await storage.startSeedSession(userId, source, scheduledEndAt).catch(err =>
    log(`seed session record error userId=${userId}: ${err}`, "simulator"),
  );

  log(
    `seed session START userId=${userId} source=${source} duration=${sessionMinutes}min regionId=${regionId ?? "none"}`,
    "simulator",
  );

  while (runningSimulations.has(userId) && Date.now() < sessionEnd) {
    // Verify the profile still exists
    const profile = await storage.getProfile(userId);
    if (!profile) {
      runningSimulations.delete(userId);
      break;
    }

    // ── ACTIVE phase ────────────────────────────────────────────────────────
    const remainingMs = sessionEnd - Date.now();
    if (remainingMs <= 0) break;

    // Register with the assigned regionId so this seed only appears in ONE region
    await storage.registerActiveCall(callSid, userId, regionId);
    log(`virtual caller ON  userId=${userId} regionId=${regionId ?? "none"}`, "simulator");

    const activeDuration = Math.min(randomBetween(60, 300) * 1000, remainingMs);
    await sleep(activeDuration);

    if (!runningSimulations.has(userId)) break;

    // ── INACTIVE phase ───────────────────────────────────────────────────────
    await storage.removeActiveCall(callSid);
    log(`virtual caller OFF userId=${userId}`, "simulator");

    const inactiveDuration = randomBetween(30, 180) * 1000;
    const remainingAfterOff = sessionEnd - Date.now();
    if (remainingAfterOff <= 0) break;
    await sleep(Math.min(inactiveDuration, remainingAfterOff));
  }

  // Ensure caller is taken offline
  await storage.removeActiveCall(callSid).catch(() => {});

  // Record session end
  await storage.endSeedSession(userId).catch(err =>
    log(`seed session end record error userId=${userId}: ${err}`, "simulator"),
  );

  runningSimulations.delete(userId);
  log(`seed session END userId=${userId}`, "simulator");
}

// ─── Admin-uploaded: persistent loop with cooldowns between sessions ──────────
// Each admin-uploaded profile runs independently. After a session it waits
// 1–4 hours (random) before starting a new one so it is not on every day.
// The regionId is assigned once (stored in adminSeedRegions) and reused for
// every subsequent session so the profile always appears in the same region.
async function runAdminLoop(userId: string, regionId?: string): Promise<void> {
  // Stagger startups so they don't all go live at once
  const stagger = randomBetween(5, 120) * 1000;
  await sleep(stagger);

  // Persist the region assignment for this profile's lifetime
  if (regionId) adminSeedRegions.set(userId, regionId);

  while (adminLoops.has(userId)) {
    // Verify the profile still exists and is still admin-uploaded
    const profile = await storage.getProfile(userId);
    if (!profile || !profile.isAdminUploaded) {
      adminLoops.delete(userId);
      adminSeedRegions.delete(userId);
      break;
    }

    const assignedRegion = adminSeedRegions.get(userId);

    runningSimulations.add(userId);
    await runSeedSession(userId, "admin_uploaded", assignedRegion);

    if (!adminLoops.has(userId)) break;

    // Cooldown: 1–4 hours between sessions so the profile is not on all day
    const cooldownMs = randomBetween(60, 240) * 60 * 1000;
    log(
      `admin seed cooldown ${Math.round(cooldownMs / 60000)}min userId=${userId}`,
      "simulator",
    );
    await sleep(cooldownMs);
  }

  adminSeedRegions.delete(userId);
  log(`admin loop stopped userId=${userId}`, "simulator");
}

// ─── Real-caller scheduler ────────────────────────────────────────────────────
// Runs every SCHEDULER_INTERVAL_MS. Picks eligible real-caller profiles and
// starts a session for each available slot (up to MAX_REAL_CALLER_SEEDS).
async function runRealCallerScheduler(): Promise<void> {
  // Initial delay before first run so the server can fully start
  await sleep(60 * 1000);

  while (true) {
    try {
      // Count how many real-caller seeds are currently active
      const activeRealSeedCount = Array.from(runningSimulations).filter(
        uid => !adminLoops.has(uid),
      ).length;

      const slots = MAX_REAL_CALLER_SEEDS - activeRealSeedCount;

      if (slots > 0) {
        const eligible = await storage.getEligibleSeedProfiles(slots);

        for (const { userId } of eligible) {
          if (!runningSimulations.has(userId)) {
            // Assign this real-caller seed to a region, respecting linked-pair
            // constraints so it doesn't appear in both halves of a linked pair.
            const seedRegionId = await pickRegionForSeed();
            runningSimulations.add(userId);
            runSeedSession(userId, "real_caller", seedRegionId).catch(err =>
              log(`real caller seed error userId=${userId}: ${err}`, "simulator"),
            );
          }
        }

        if (eligible.length > 0) {
          log(
            `real caller scheduler: started ${eligible.length} session(s) (${activeRealSeedCount + eligible.length}/${MAX_REAL_CALLER_SEEDS} active)`,
            "simulator",
          );
        }
      }
    } catch (err) {
      log(`real caller scheduler error: ${err}`, "simulator");
    }

    await sleep(SCHEDULER_INTERVAL_MS);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function clearVirtualEntries(): Promise<void> {
  await db.delete(activeCalls).where(like(activeCalls.callSid, `${VIRTUAL_PREFIX}%`));
}

export async function startSimulator(): Promise<void> {
  await clearVirtualEntries();

  // Close any seed sessions left open from a previous run
  const stale = await storage.getActiveSeedSessions().catch(() => []);
  for (const session of stale) {
    await storage.endSeedSession(session.userId).catch(() => {});
  }

  // ── Assign regions to admin-uploaded profiles ────────────────────────────
  // Load all active regions and build an "assignable" pool that respects
  // linked pairs: for each pair (A ↔ B) only the lexicographically-smaller
  // id is kept, so every linked pair acts as a single slot.  This prevents
  // the same admin seed from appearing in both halves of a linked pair.
  const allRegions = await storage.getAllRegions().catch(() => []);
  const activeRegions = allRegions.filter(r => r.isActive);

  const assignableRegions = activeRegions.filter(r => {
    if (!r.linkedRegionId) return true;
    return r.id < r.linkedRegionId;
  });
  const distributionPool = assignableRegions.length > 0 ? assignableRegions : activeRegions;

  // Start persistent loops for all admin-uploaded profiles
  const adminProfiles = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.isAdminUploaded, true));

  for (let i = 0; i < adminProfiles.length; i++) {
    const { userId } = adminProfiles[i];
    if (adminLoops.has(userId)) continue;

    // Round-robin assignment across the assignable region pool
    const assignedRegionId = distributionPool.length > 0
      ? distributionPool[i % distributionPool.length].id
      : undefined;

    adminLoops.add(userId);
    runAdminLoop(userId, assignedRegionId).catch(err =>
      log(`admin loop error userId=${userId}: ${err}`, "simulator"),
    );
  }

  log(`started ${adminProfiles.length} admin-uploaded seed loop(s)`, "simulator");

  // Start the real-caller scheduler
  runRealCallerScheduler().catch(err =>
    log(`real caller scheduler fatal: ${err}`, "simulator"),
  );

  log("real caller scheduler started", "simulator");
}

// ─── External control ─────────────────────────────────────────────────────────

// Called when an admin uploads a new seeded profile.
// If no regionId is provided one is auto-picked respecting linked-pair rules.
export async function addVirtualCaller(userId: string, regionId?: string): Promise<void> {
  if (adminLoops.has(userId)) return;

  const assignedRegionId = regionId ?? await pickRegionForSeed();

  adminLoops.add(userId);
  runAdminLoop(userId, assignedRegionId).catch(err =>
    log(`admin loop error userId=${userId}: ${err}`, "simulator"),
  );
  log(`added admin virtual caller userId=${userId} regionId=${assignedRegionId ?? "none"}`, "simulator");
}

// Called when an admin deletes a seeded profile
export function removeVirtualCaller(userId: string): void {
  adminLoops.delete(userId);
  adminSeedRegions.delete(userId);
  runningSimulations.delete(userId);
  log(`removed virtual caller userId=${userId}`, "simulator");
}

// Returns the set of all currently-simulating userIds (admin + real-caller)
export function getActiveVirtualCallers(): Set<string> {
  return new Set(runningSimulations);
}

// Returns which userIds are currently "live" (have an active VIRTUAL- entry)
export async function getLiveVirtualUserIds(): Promise<Set<string>> {
  const rows = await db
    .select({ userId: activeCalls.userId })
    .from(activeCalls)
    .where(like(activeCalls.callSid, `${VIRTUAL_PREFIX}%`));

  return new Set(rows.map(r => r.userId));
}
