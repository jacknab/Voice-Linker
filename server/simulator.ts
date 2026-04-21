import { storage } from "./storage";
import { db } from "./db";
import { profiles, callers } from "@shared/schema";
import { and, eq, like, not } from "drizzle-orm";
import { log } from "./index";

export const VIRTUAL_PREFIX = "VIRTUAL-";

// Tracks ALL active virtual caller sessions (admin-uploaded + real-caller)
const activeSessions = new Set<string>();

// Concurrency cap for real-caller seed sessions
const MAX_REAL_CALLER_SEEDS = 10;
const MAX_ADMIN_SEEDS = 3;

// How many minutes between real-caller background scheduler checks
const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;


function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Returns true if at least one non-virtual active call exists
async function hasRealCallers(): Promise<boolean> {
  try {
    const rows = await db
      .select({ callSid: callers.callSid })
      .from(callers)
      .where(and(eq(callers.status, "active"), not(like(callers.callSid, `${VIRTUAL_PREFIX}%`))))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// Sleeps in POLL_INTERVAL chunks; resolves early if `stopWhen()` returns true.
// Returns true if stopWhen triggered, false if the full duration elapsed.
const POLL_INTERVAL_MS = 15_000;
async function sleepWatched(durationMs: number, stopWhen: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
    if (await stopWhen()) return true;
  }
  return false;
}

// Waits until at least one real caller is on the line (polls every POLL_INTERVAL_MS).
async function waitForRealCaller(sessionEndMs: number, userId: string): Promise<boolean> {
  while (activeSessions.has(userId) && Date.now() < sessionEndMs) {
    if (await hasRealCallers()) return true;
    const remaining = sessionEndMs - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
  return false;
}

// ─── Region assignment helpers ────────────────────────────────────────────────

async function pickRegionForSeed(): Promise<string | undefined> {
  const allRegions = await storage.getAllRegions().catch(() => []);
  const activeRegions = allRegions.filter(r => r.isActive);
  if (activeRegions.length === 0) return undefined;

  const assignable = activeRegions.filter(r => {
    if (!r.linkedRegionId) return true;
    return r.id < r.linkedRegionId;
  });

  const pool = assignable.length > 0 ? assignable : activeRegions;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ─── Admin seed session: small rotating subset with on/off cycling ────────────
async function runAdminSeedSession(userId: string): Promise<void> {
  const callSid = `${VIRTUAL_PREFIX}${userId}`;
  const sessionMinutes = randomBetween(20, 35);
  const sessionEnd = Date.now() + sessionMinutes * 60 * 1000;

  await storage.startSeedSession(userId, "admin_uploaded", new Date(sessionEnd)).catch(err =>
    log(`seed session record error userId=${userId}: ${err}`, "simulator"),
  );

  log(
    `admin seed session START userId=${userId} duration=${sessionMinutes}min`,
    "simulator",
  );

  while (activeSessions.has(userId) && Date.now() < sessionEnd) {
    const profile = await storage.getProfile(userId);
    if (!profile) {
      activeSessions.delete(userId);
      break;
    }

    // Gate: only go online when a real caller is present
    if (!(await hasRealCallers())) {
      log(`admin seed WAITING (no real callers) userId=${userId}`, "simulator");
      const found = await waitForRealCaller(sessionEnd, userId);
      if (!found) break; // session expired while waiting
    }

    const remainingMs = sessionEnd - Date.now();
    if (remainingMs <= 0) break;

    await storage.registerActiveCall(callSid, userId, undefined);
    log(`admin seed ON  userId=${userId}`, "simulator");

    // Stay online for up to activeDuration, but drop off immediately if real callers leave
    const activeDuration = Math.min(randomBetween(90, 240) * 1000, remainingMs);
    const noRealCallers = await sleepWatched(activeDuration, async () => !(await hasRealCallers()));

    if (!activeSessions.has(userId)) {
      await storage.removeActiveCall(callSid).catch(() => {});
      break;
    }

    await storage.removeActiveCall(callSid);
    if (noRealCallers) {
      log(`admin seed OFF (no real callers) userId=${userId}`, "simulator");
    } else {
      log(`admin seed OFF userId=${userId}`, "simulator");
    }

    const remainingAfterOff = sessionEnd - Date.now();
    if (remainingAfterOff <= 0) break;
    // If we went offline because callers left, skip the normal idle gap and wait for callers instead
    if (!noRealCallers) {
      await sleep(Math.min(randomBetween(60, 240) * 1000, remainingAfterOff));
    }
  }

  await storage.removeActiveCall(callSid).catch(() => {});
  await storage.endSeedSession(userId).catch(err =>
    log(`seed session end record error userId=${userId}: ${err}`, "simulator"),
  );

  activeSessions.delete(userId);
  log(`admin seed session END userId=${userId}`, "simulator");
}

// ─── Real-caller seed session: on/off cycling ────────────────────────────────
async function runSeedSession(
  userId: string,
  source: "real_caller",
  regionId?: string,
): Promise<void> {
  const callSid = `${VIRTUAL_PREFIX}${userId}`;
  const sessionMinutes = randomBetween(30, 45);
  const sessionEnd = Date.now() + sessionMinutes * 60 * 1000;

  await storage.startSeedSession(userId, source, new Date(sessionEnd)).catch(err =>
    log(`seed session record error userId=${userId}: ${err}`, "simulator"),
  );

  log(
    `seed session START userId=${userId} source=${source} duration=${sessionMinutes}min regionId=${regionId ?? "all"}`,
    "simulator",
  );

  while (activeSessions.has(userId) && Date.now() < sessionEnd) {
    const profile = await storage.getProfile(userId);
    if (!profile) {
      activeSessions.delete(userId);
      break;
    }

    // Gate: only go online when a real caller is present
    if (!(await hasRealCallers())) {
      log(`virtual caller WAITING (no real callers) userId=${userId}`, "simulator");
      const found = await waitForRealCaller(sessionEnd, userId);
      if (!found) break; // session expired while waiting
    }

    const remainingMs = sessionEnd - Date.now();
    if (remainingMs <= 0) break;

    await storage.registerActiveCall(callSid, userId, regionId);
    log(`virtual caller ON  userId=${userId} regionId=${regionId ?? "all"}`, "simulator");

    // Stay online for up to activeDuration, but drop off immediately if real callers leave
    const activeDuration = Math.min(randomBetween(60, 300) * 1000, remainingMs);
    const noRealCallers = await sleepWatched(activeDuration, async () => !(await hasRealCallers()));

    if (!activeSessions.has(userId)) {
      await storage.removeActiveCall(callSid).catch(() => {});
      break;
    }

    await storage.removeActiveCall(callSid);
    if (noRealCallers) {
      log(`virtual caller OFF (no real callers) userId=${userId}`, "simulator");
    } else {
      log(`virtual caller OFF userId=${userId}`, "simulator");
    }

    const remainingAfterOff = sessionEnd - Date.now();
    if (remainingAfterOff <= 0) break;
    // If we went offline because callers left, skip the normal idle gap and wait for callers instead
    if (!noRealCallers) {
      const inactiveDuration = randomBetween(30, 180) * 1000;
      await sleep(Math.min(inactiveDuration, remainingAfterOff));
    }
  }

  await storage.removeActiveCall(callSid).catch(() => {});
  await storage.endSeedSession(userId).catch(err =>
    log(`seed session end record error userId=${userId}: ${err}`, "simulator"),
  );

  activeSessions.delete(userId);
  log(`seed session END userId=${userId}`, "simulator");
}

// ─── Caller-triggered: start admin seed sessions on demand ────────────────────
// Called when a real caller hits the main menu.
// Each admin seed that isn't already in a session gets a fresh on/off session.
// Fire-and-forget — the IVR does not await this.
export async function triggerSeedActivity(): Promise<void> {
  try {
    const adminProfiles = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.isAdminUploaded, true));

    const activeAdminCount = adminProfiles.filter(({ userId }) => activeSessions.has(userId)).length;
    const slots = Math.max(0, Math.min(MAX_ADMIN_SEEDS, adminProfiles.length) - activeAdminCount);
    if (slots <= 0) return;

    const shuffledProfiles = [...adminProfiles].sort(() => Math.random() - 0.5);
    let started = 0;
    for (const { userId } of shuffledProfiles) {
      if (started >= slots) break;
      if (!activeSessions.has(userId)) {
        activeSessions.add(userId);
        runAdminSeedSession(userId).catch(err =>
          log(`admin seed session error userId=${userId}: ${err}`, "simulator"),
        );
        started++;
      }
    }

    if (started > 0) {
      log(`triggered ${started} admin seed session(s) on caller arrival (${activeAdminCount + started}/${Math.min(MAX_ADMIN_SEEDS, adminProfiles.length)} active)`, "simulator");
    }
  } catch (err) {
    log(`triggerSeedActivity error: ${err}`, "simulator");
  }
}

// ─── Real-caller background scheduler ────────────────────────────────────────
// Independently cycles non-admin seed profiles on a 15-minute heartbeat.
async function runRealCallerScheduler(): Promise<void> {
  await sleep(60 * 1000);

  while (true) {
    try {
      // Only count real-caller sessions toward the cap (admin sessions are
      // triggered separately and are not capped)
      const realCallerActive = await db
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.isAdminUploaded, false))
        .then(rows => rows.filter(r => activeSessions.has(r.userId)).length);

      const slots = MAX_REAL_CALLER_SEEDS - realCallerActive;

      if (slots > 0) {
        const eligible = await storage.getEligibleSeedProfiles(slots);

        for (const { userId } of eligible) {
          if (!activeSessions.has(userId)) {
            const seedRegionId = await pickRegionForSeed();
            activeSessions.add(userId);
            runSeedSession(userId, "real_caller", seedRegionId).catch(err =>
              log(`real caller seed error userId=${userId}: ${err}`, "simulator"),
            );
          }
        }

        if (eligible.length > 0) {
          log(
            `real caller scheduler: started ${eligible.length} session(s) (${realCallerActive + eligible.length}/${MAX_REAL_CALLER_SEEDS} active)`,
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
  await db
    .update(callers)
    .set({ status: "disconnected", lastPing: new Date() })
    .where(like(callers.callSid, `${VIRTUAL_PREFIX}%`));
}

export async function startSimulator(): Promise<void> {
  await clearVirtualEntries();

  // Close any seed sessions left open from a previous run
  const stale = await storage.getActiveSeedSessions().catch(() => []);
  for (const session of stale) {
    await storage.endSeedSession(session.userId).catch(() => {});
  }

  const adminProfiles = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.isAdminUploaded, true));

  log(
    `${adminProfiles.length} admin seed(s) loaded — will activate when a real caller hits the main menu`,
    "simulator",
  );

  // Start the background real-caller scheduler
  runRealCallerScheduler().catch(err =>
    log(`real caller scheduler fatal: ${err}`, "simulator"),
  );

  log("real caller scheduler started", "simulator");
}

// ─── External control ─────────────────────────────────────────────────────────

// Called when an admin uploads a new seeded profile.
// The profile will join the pool and be triggered on the next caller arrival.
export async function addVirtualCaller(userId: string, _regionId?: string): Promise<void> {
  log(`admin seed registered userId=${userId} — will activate on next caller`, "simulator");
}

// Called when an admin deletes a seeded profile
export function removeVirtualCaller(userId: string): void {
  activeSessions.delete(userId);
  const callSid = `${VIRTUAL_PREFIX}${userId}`;
  storage.removeActiveCall(callSid).catch(() => {});
  log(`removed virtual caller userId=${userId}`, "simulator");
}

// Returns the set of all currently-active session userIds
export function getActiveVirtualCallers(): Set<string> {
  return new Set(activeSessions);
}

// Returns which userIds are currently "live" (have an active VIRTUAL- entry)
export async function getLiveVirtualUserIds(): Promise<Set<string>> {
  const rows = await db
    .select({ userId: callers.userId })
    .from(callers)
    .where(and(like(callers.callSid, `${VIRTUAL_PREFIX}%`), eq(callers.status, "active")));

  return new Set(rows.map(r => r.userId));
}
