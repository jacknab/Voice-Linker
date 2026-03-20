import { storage } from "./storage";
import { db } from "./db";
import { profiles, activeCalls } from "@shared/schema";
import { eq, like } from "drizzle-orm";
import { log } from "./index";

export const VIRTUAL_PREFIX = "VIRTUAL-";

// Active simulation state
const runningSimulations = new Set<string>();

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Runs the lifecycle loop for a single virtual caller.
// Each profile independently cycles through inactive → active → inactive phases.
async function runVirtualCaller(userId: string): Promise<void> {
  const callSid = `${VIRTUAL_PREFIX}${userId}`;

  // Start in inactive phase with a random stagger so they don't all go live at once
  const initialDelay = randomBetween(5, 90) * 1000;
  await sleep(initialDelay);

  while (runningSimulations.has(userId)) {
    // Verify the profile still exists and is still admin-uploaded
    const profile = await storage.getProfile(userId);
    if (!profile || !profile.isAdminUploaded) {
      runningSimulations.delete(userId);
      break;
    }

    // ── ACTIVE PHASE ─────────────────────────────────────────────────────────
    await storage.registerActiveCall(callSid, userId);
    log(`virtual caller ON  userId=${userId}`, "simulator");

    // Stay active for 60s–5min
    const activeDuration = randomBetween(60, 300) * 1000;
    await sleep(activeDuration);

    if (!runningSimulations.has(userId)) break;

    // ── INACTIVE PHASE ────────────────────────────────────────────────────────
    await storage.removeActiveCall(callSid);
    log(`virtual caller OFF userId=${userId}`, "simulator");

    // Stay inactive for 30s–3min
    const inactiveDuration = randomBetween(30, 180) * 1000;
    await sleep(inactiveDuration);
  }

  // Clean up any leftover active entry when the loop exits
  await storage.removeActiveCall(callSid).catch(() => {});
  log(`virtual caller STOPPED userId=${userId}`, "simulator");
}

// Clean up any stale virtual entries left from a previous server run
async function clearVirtualEntries(): Promise<void> {
  await db.delete(activeCalls).where(like(activeCalls.callSid, `${VIRTUAL_PREFIX}%`));
}

// Start simulation for all existing admin-uploaded profiles
export async function startSimulator(): Promise<void> {
  await clearVirtualEntries();

  const adminProfiles = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.isAdminUploaded, true));

  for (const { userId } of adminProfiles) {
    if (!runningSimulations.has(userId)) {
      runningSimulations.add(userId);
      runVirtualCaller(userId).catch(err =>
        log(`virtual caller error userId=${userId}: ${err}`, "simulator")
      );
    }
  }

  log(`started ${adminProfiles.length} virtual caller(s)`, "simulator");
}

// Call this after an admin uploads a new profile
export function addVirtualCaller(userId: string): void {
  if (runningSimulations.has(userId)) return;
  runningSimulations.add(userId);
  runVirtualCaller(userId).catch(err =>
    log(`virtual caller error userId=${userId}: ${err}`, "simulator")
  );
  log(`added virtual caller userId=${userId}`, "simulator");
}

// Call this when a profile is deleted from the admin panel
export function removeVirtualCaller(userId: string): void {
  runningSimulations.delete(userId);
  // The loop will detect the deletion and clean up activeCalls itself
  log(`removed virtual caller userId=${userId}`, "simulator");
}

// Returns the set of currently active virtual caller userIds
export function getActiveVirtualCallers(): Set<string> {
  return new Set(runningSimulations);
}

// Returns which userIds are currently "live" (have an active virtual entry)
export async function getLiveVirtualUserIds(): Promise<Set<string>> {
  const rows = await db
    .select({ callSid: activeCalls.callSid, userId: activeCalls.userId })
    .from(activeCalls)
    .where(like(activeCalls.callSid, `${VIRTUAL_PREFIX}%`));

  return new Set(rows.map(r => r.userId));
}
