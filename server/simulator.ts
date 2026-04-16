import { storage } from "./storage";
import { db } from "./db";
import { profiles, activeCalls } from "@shared/schema";
import { eq, like } from "drizzle-orm";
import { log } from "./index";

export const VIRTUAL_PREFIX = "VIRTUAL-";

// Tracks userIds that are currently running a real-caller seed session loop
const runningSimulations = new Set<string>();

// Concurrency cap for real-caller seed sessions (admin-uploaded are always-on)
const MAX_REAL_CALLER_SEEDS = 10;

// How many minutes between real-caller scheduler checks
const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Admin seeds: permanently online, visible in all regions ─────────────────
// Admin-uploaded profiles are registered as always-on virtual callers with no
// region restriction (regionId = null) so they appear in every region and are
// never hidden by on/off cycling or inter-session cooldowns.

async function registerAdminSeedOnline(userId: string): Promise<void> {
  const callSid = `${VIRTUAL_PREFIX}${userId}`;
  await storage.registerActiveCall(callSid, userId, undefined);
  log(`admin seed online userId=${userId}`, "simulator");
}

async function unregisterAdminSeedOnline(userId: string): Promise<void> {
  const callSid = `${VIRTUAL_PREFIX}${userId}`;
  await storage.removeActiveCall(callSid).catch(() => {});
  log(`admin seed offline userId=${userId}`, "simulator");
}

// ─── Region assignment helpers (real-caller seeds only) ──────────────────────

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

// ─── Core: bounded real-caller seed session ───────────────────────────────────
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

  await storage.startSeedSession(userId, source, scheduledEndAt).catch(err =>
    log(`seed session record error userId=${userId}: ${err}`, "simulator"),
  );

  log(
    `seed session START userId=${userId} source=${source} duration=${sessionMinutes}min regionId=${regionId ?? "none"}`,
    "simulator",
  );

  while (runningSimulations.has(userId) && Date.now() < sessionEnd) {
    const profile = await storage.getProfile(userId);
    if (!profile) {
      runningSimulations.delete(userId);
      break;
    }

    const remainingMs = sessionEnd - Date.now();
    if (remainingMs <= 0) break;

    await storage.registerActiveCall(callSid, userId, regionId);
    log(`virtual caller ON  userId=${userId} regionId=${regionId ?? "none"}`, "simulator");

    const activeDuration = Math.min(randomBetween(60, 300) * 1000, remainingMs);
    await sleep(activeDuration);

    if (!runningSimulations.has(userId)) break;

    await storage.removeActiveCall(callSid);
    log(`virtual caller OFF userId=${userId}`, "simulator");

    const inactiveDuration = randomBetween(30, 180) * 1000;
    const remainingAfterOff = sessionEnd - Date.now();
    if (remainingAfterOff <= 0) break;
    await sleep(Math.min(inactiveDuration, remainingAfterOff));
  }

  await storage.removeActiveCall(callSid).catch(() => {});

  await storage.endSeedSession(userId).catch(err =>
    log(`seed session end record error userId=${userId}: ${err}`, "simulator"),
  );

  runningSimulations.delete(userId);
  log(`seed session END userId=${userId}`, "simulator");
}

// ─── Real-caller scheduler ────────────────────────────────────────────────────
async function runRealCallerScheduler(): Promise<void> {
  await sleep(60 * 1000);

  while (true) {
    try {
      const activeRealSeedCount = runningSimulations.size;
      const slots = MAX_REAL_CALLER_SEEDS - activeRealSeedCount;

      if (slots > 0) {
        const eligible = await storage.getEligibleSeedProfiles(slots);

        for (const { userId } of eligible) {
          if (!runningSimulations.has(userId)) {
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

  // Register all admin-uploaded profiles as permanently-online seeds with
  // no region restriction so they appear in every region immediately.
  const adminProfiles = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.isAdminUploaded, true));

  for (const { userId } of adminProfiles) {
    await registerAdminSeedOnline(userId).catch(err =>
      log(`admin seed online error userId=${userId}: ${err}`, "simulator"),
    );
  }

  log(`registered ${adminProfiles.length} admin-uploaded seed(s) as permanently online`, "simulator");

  // Start the real-caller scheduler
  runRealCallerScheduler().catch(err =>
    log(`real caller scheduler fatal: ${err}`, "simulator"),
  );

  log("real caller scheduler started", "simulator");
}

// ─── External control ─────────────────────────────────────────────────────────

// Called when an admin uploads a new seeded profile.
// Registers it immediately as permanently online with no region restriction.
export async function addVirtualCaller(userId: string, _regionId?: string): Promise<void> {
  await registerAdminSeedOnline(userId).catch(err =>
    log(`addVirtualCaller error userId=${userId}: ${err}`, "simulator"),
  );
  log(`added admin virtual caller userId=${userId} (all regions)`, "simulator");
}

// Called when an admin deletes a seeded profile
export function removeVirtualCaller(userId: string): void {
  runningSimulations.delete(userId);
  unregisterAdminSeedOnline(userId).catch(() => {});
  log(`removed virtual caller userId=${userId}`, "simulator");
}

// Returns the set of all currently-simulating userIds (real-caller seeds only)
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
