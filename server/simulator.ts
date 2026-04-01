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

// ─── Core: bounded seed session ──────────────────────────────────────────────
// Runs one 30–45 min session for the given profile.
// Within the session the profile cycles on/off naturally.
// After the session ends the profile goes offline and the session is logged.
async function runSeedSession(
  userId: string,
  source: "admin_uploaded" | "real_caller",
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
    `seed session START userId=${userId} source=${source} duration=${sessionMinutes}min`,
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

    await storage.registerActiveCall(callSid, userId);
    log(`virtual caller ON  userId=${userId}`, "simulator");

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
async function runAdminLoop(userId: string): Promise<void> {
  // Stagger startups so they don't all go live at once
  const stagger = randomBetween(5, 120) * 1000;
  await sleep(stagger);

  while (adminLoops.has(userId)) {
    // Verify the profile still exists and is still admin-uploaded
    const profile = await storage.getProfile(userId);
    if (!profile || !profile.isAdminUploaded) {
      adminLoops.delete(userId);
      break;
    }

    runningSimulations.add(userId);
    await runSeedSession(userId, "admin_uploaded");

    if (!adminLoops.has(userId)) break;

    // Cooldown: 1–4 hours between sessions so the profile is not on all day
    const cooldownMs = randomBetween(60, 240) * 60 * 1000;
    log(
      `admin seed cooldown ${Math.round(cooldownMs / 60000)}min userId=${userId}`,
      "simulator",
    );
    await sleep(cooldownMs);
  }

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
      const activeRealSeedCount = [...runningSimulations].filter(
        uid => !adminLoops.has(uid),
      ).length;

      const slots = MAX_REAL_CALLER_SEEDS - activeRealSeedCount;

      if (slots > 0) {
        const eligible = await storage.getEligibleSeedProfiles(slots);

        for (const { userId } of eligible) {
          if (!runningSimulations.has(userId)) {
            runningSimulations.add(userId);
            runSeedSession(userId, "real_caller").catch(err =>
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

  // Start persistent loops for all admin-uploaded profiles
  const adminProfiles = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.isAdminUploaded, true));

  for (const { userId } of adminProfiles) {
    if (!adminLoops.has(userId)) {
      adminLoops.add(userId);
      runAdminLoop(userId).catch(err =>
        log(`admin loop error userId=${userId}: ${err}`, "simulator"),
      );
    }
  }

  log(`started ${adminProfiles.length} admin-uploaded seed loop(s)`, "simulator");

  // Start the real-caller scheduler
  runRealCallerScheduler().catch(err =>
    log(`real caller scheduler fatal: ${err}`, "simulator"),
  );

  log("real caller scheduler started", "simulator");
}

// ─── External control ─────────────────────────────────────────────────────────

// Called when an admin uploads a new seeded profile
export function addVirtualCaller(userId: string): void {
  if (adminLoops.has(userId)) return;
  adminLoops.add(userId);
  runAdminLoop(userId).catch(err =>
    log(`admin loop error userId=${userId}: ${err}`, "simulator"),
  );
  log(`added admin virtual caller userId=${userId}`, "simulator");
}

// Called when an admin deletes a seeded profile
export function removeVirtualCaller(userId: string): void {
  adminLoops.delete(userId);
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
