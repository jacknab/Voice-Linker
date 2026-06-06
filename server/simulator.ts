import { storage } from "./storage";
import { db } from "./db";
import { profiles, callers } from "@shared/schema";
import { and, eq, like, not } from "drizzle-orm";
import { log } from "./index";
import { injectNewCallerIntoAllQueues } from "./liveQueue";

export const VIRTUAL_PREFIX = "VIRTUAL-";

// Tracks ALL active virtual caller sessions (admin-uploaded + real-caller)
const activeSessions = new Set<string>();

// Concurrency cap for real-caller seed sessions
const MAX_REAL_CALLER_SEEDS = 10;

// How long each admin seed stays continuously online (30 minutes)
const ADMIN_SEED_ONLINE_MS = 30 * 60 * 1000;

// How often to check and top-up admin seeds to the dynamic target
const SEED_MAINTENANCE_INTERVAL_MS = 60 * 1000;

// How many minutes between real-caller background scheduler checks
const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;


function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns the target number of active admin seed profiles for the current
 * time window, based on Eastern Time.
 *
 *  5 am – 5 pm  (any day)              →  0 – 3   quiet / daytime
 *  Mon – Thu evenings / nights          →  2 – 5   moderate
 *  Fri – Sun prime time (5 pm → 4 am)  →  5 – 8   busy weekend nights
 *
 * Hours 0 – 3 are treated as belonging to the previous calendar day's night
 * so that e.g. 2 am Saturday still counts as Friday-night busy time.
 * Active seeds that exceed the new target are not force-stopped; they simply
 * run out their 30-minute sessions and are not replaced.
 */
function getTargetSeedCount(): number {
  const now = new Date();
  // Interpret current time in Eastern (covers both ET/ET-DST automatically)
  const et   = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = et.getHours();  // 0-23
  const day  = et.getDay();    // 0=Sun … 6=Sat

  // Quiet daytime window (5 am through 5 pm): 0–3 seeds
  if (hour >= 5 && hour < 17) return randomBetween(0, 3);

  // For hours 0–3 credit the night to the previous calendar day so that
  // "2 am Saturday" still belongs to Friday night, etc.
  const effectiveDay = hour < 4 ? (day + 6) % 7 : day;

  // Weekend prime time: Friday (5), Saturday (6), Sunday (0) evenings + nights
  if ([5, 6, 0].includes(effectiveDay)) return randomBetween(5, 8);

  // Mon–Thu evenings / late nights
  return randomBetween(2, 5);
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
const POLL_INTERVAL_MS = 15_000;
async function sleepWatched(durationMs: number, stopWhen: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
    if (await stopWhen()) return true;
  }
  return false;
}

// ─── Region assignment helpers ────────────────────────────────────────────────

// Builds an ordered list of region IDs for seed assignment. Regions are grouped
// into linked clusters (connected components via region_links). The list is
// interleaved across clusters so that consecutive assignments spread across the
// full linked group — no two adjacent slots belong to the same cluster.
// Within each cluster the order is randomised on every call.
//
// Example: clusters [{A,B}, {C}] → [A, C, B] or [B, C, A] etc.
// Assigning seeds S1→A, S2→C, S3→B guarantees no linked pair shares a profile.
async function buildBalancedRegionList(): Promise<string[]> {
  const allRegions = await storage.getAllRegions().catch(() => []);
  const activeRegions = allRegions.filter(r => r.isActive);
  if (activeRegions.length === 0) return [];

  // Build adjacency from the many-to-many region_links table
  const adjacency = new Map<string, Set<string>>();
  for (const r of activeRegions) adjacency.set(r.id, new Set());
  for (const r of activeRegions) {
    const linked = await storage.getLinkedRegions(r.id).catch(() => []);
    for (const lr of linked) {
      adjacency.get(r.id)?.add(lr.id);
      if (adjacency.has(lr.id)) adjacency.get(lr.id)!.add(r.id);
    }
  }

  // Find connected components (each is a cluster of mutually-linked regions)
  const visited = new Set<string>();
  const clusters: string[][] = [];
  for (const r of activeRegions) {
    if (visited.has(r.id)) continue;
    const cluster: string[] = [];
    const stack = [r.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      cluster.push(id);
      for (const nId of adjacency.get(id) ?? []) {
        if (!visited.has(nId)) stack.push(nId);
      }
    }
    // Shuffle within the cluster for even distribution
    clusters.push(cluster.sort(() => Math.random() - 0.5));
  }

  // Interleave across clusters: pick one region per cluster per round
  const result: string[] = [];
  const maxLen = clusters.reduce((m, c) => Math.max(m, c.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const cluster of clusters) {
      if (i < cluster.length) result.push(cluster[i]);
    }
  }
  return result;
}

// Picks a single random region for a seed, using region_links for link awareness.
async function pickRegionForSeed(): Promise<string | undefined> {
  const list = await buildBalancedRegionList();
  if (list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

// ─── Admin seed session: goes online immediately, stays for 30 minutes ────────
// No on/off cycling. Start time and end time are recorded via startSeedSession /
// endSeedSession so the admin panel can see the exact window each seed was live.
// regionId pins this seed to a specific region so linked regions see different
// profiles rather than the same seed appearing in every region simultaneously.
async function runAdminSeedSession(userId: string, regionId?: string): Promise<void> {
  const callSid = `${VIRTUAL_PREFIX}${userId}`;
  const sessionEnd = new Date(Date.now() + ADMIN_SEED_ONLINE_MS);

  await storage.startSeedSession(userId, "admin_uploaded", sessionEnd).catch(err =>
    log(`seed session record error userId=${userId}: ${err}`, "simulator"),
  );

  const profile = await storage.getProfile(userId).catch(() => null);
  if (!profile) {
    activeSessions.delete(userId);
    await storage.endSeedSession(userId).catch(() => {});
    return;
  }

  // Go online immediately — no gate on real callers being present.
  // regionId ensures this seed only appears in its assigned region; linked
  // regions receive their own distinct seeds from the maintenance loop.
  await storage.registerActiveCall(callSid, userId, regionId);
  const onlineAt = new Date().toISOString();
  log(`admin seed ONLINE userId=${userId} regionId=${regionId ?? "global"} from=${onlineAt} for=30min`, "simulator");

  // Inject this seed's profile at slot 2 in every active browse session for
  // the same region so callers already on the line hear "caller close to you".
  if (profile.recordingUrl) {
    const region = regionId ? await storage.getRegionById(regionId).catch(() => null) : null;
    injectNewCallerIntoAllQueues({
      userId,
      recordingUrl: profile.recordingUrl,
      nameRecordingUrl: profile.nameRecordingUrl ?? null,
      regionId: regionId ?? null,
      regionName: region?.name ?? null,
      isPreExisting: false,
      lat: null,
      lon: null,
    }, callSid).catch(err =>
      log(`admin seed inject error userId=${userId}: ${err}`, "simulator"),
    );
  }

  // Stay online for the full 30 minutes, then cleanly end the session.
  await sleep(ADMIN_SEED_ONLINE_MS);

  if (!activeSessions.has(userId)) {
    // Session was forcibly removed (e.g. admin deleted profile)
    await storage.removeActiveCall(callSid).catch(() => {});
    await storage.endSeedSession(userId).catch(() => {});
    return;
  }

  await storage.removeActiveCall(callSid).catch(() => {});
  await storage.endSeedSession(userId).catch(err =>
    log(`seed session end record error userId=${userId}: ${err}`, "simulator"),
  );

  activeSessions.delete(userId);
  log(`admin seed OFFLINE userId=${userId} (30-min session complete)`, "simulator");
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
      // Poll until a real caller arrives or session expires
      const deadline = sessionEnd;
      while (activeSessions.has(userId) && Date.now() < deadline) {
        if (await hasRealCallers()) break;
        await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
      }
      if (!activeSessions.has(userId) || Date.now() >= sessionEnd) break;
    }

    const remainingMs = sessionEnd - Date.now();
    if (remainingMs <= 0) break;

    await storage.registerActiveCall(callSid, userId, regionId);
    log(`virtual caller ON  userId=${userId} regionId=${regionId ?? "all"}`, "simulator");

    // Inject this seed's profile at slot 2 in every active browse session for
    // the same region so callers already on the line hear "caller close to you".
    if (profile.recordingUrl) {
      const region = regionId ? await storage.getRegionById(regionId).catch(() => null) : null;
      injectNewCallerIntoAllQueues({
        userId,
        recordingUrl: profile.recordingUrl,
        nameRecordingUrl: profile.nameRecordingUrl ?? null,
        regionId: regionId ?? null,
        regionName: region?.name ?? null,
        isPreExisting: false,
        lat: null,
        lon: null,
      }, callSid).catch(err =>
        log(`virtual caller inject error userId=${userId}: ${err}`, "simulator"),
      );
    }

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

// ─── Admin seed maintenance: tops up to the dynamic time-based target ─────────
// Runs every minute. Launches new 30-minute sessions for any idle admin seeds
// until the current getTargetSeedCount() value is reached.
async function maintainAdminSeeds(): Promise<void> {
  while (true) {
    try {
      const adminProfiles = await db
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.isAdminUploaded, true));

      if (adminProfiles.length === 0) {
        await sleep(SEED_MAINTENANCE_INTERVAL_MS);
        continue;
      }

      const activeCount  = adminProfiles.filter(({ userId }) => activeSessions.has(userId)).length;
      const target       = Math.min(getTargetSeedCount(), adminProfiles.length);
      const slots        = Math.max(0, target - activeCount);

      if (slots > 0) {
        // Build a balanced region list so seeds are spread across linked clusters.
        // Each idle seed gets the next region in the interleaved order, ensuring
        // no two seeds assigned in this batch share a linked-region pair.
        const regionList = await buildBalancedRegionList();
        let regionIdx = 0;

        const idle = adminProfiles.filter(({ userId }) => !activeSessions.has(userId));
        const shuffled = [...idle].sort(() => Math.random() - 0.5);
        let started = 0;
        for (const { userId } of shuffled) {
          if (started >= slots) break;
          if (!activeSessions.has(userId)) {
            const assignedRegion = regionList.length > 0
              ? regionList[regionIdx % regionList.length]
              : undefined;
            regionIdx++;
            activeSessions.add(userId);
            runAdminSeedSession(userId, assignedRegion).catch(err =>
              log(`admin seed session error userId=${userId}: ${err}`, "simulator"),
            );
            started++;
          }
        }
        if (started > 0) {
          log(
            `seed maintenance: started ${started} admin seed(s) (${activeCount + started}/${target} active, ${adminProfiles.length} total)`,
            "simulator",
          );
        }
      }
    } catch (err) {
      log(`seed maintenance error: ${err}`, "simulator");
    }

    await sleep(SEED_MAINTENANCE_INTERVAL_MS);
  }
}

// ─── Caller-triggered: also top up admin seeds on demand ──────────────────────
// Called when a real caller hits the main menu — starts any idle admin seeds
// beyond what the maintenance loop might have already started.
export async function triggerSeedActivity(): Promise<void> {
  try {
    const adminProfiles = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.isAdminUploaded, true));

    const activeCount = adminProfiles.filter(({ userId }) => activeSessions.has(userId)).length;
    const target      = Math.min(getTargetSeedCount(), adminProfiles.length);
    const slots       = Math.max(0, target - activeCount);
    if (slots <= 0) return;

    const regionList = await buildBalancedRegionList();
    let regionIdx = 0;

    const idle      = adminProfiles.filter(({ userId }) => !activeSessions.has(userId));
    const shuffled  = [...idle].sort(() => Math.random() - 0.5);
    let started = 0;
    for (const { userId } of shuffled) {
      if (started >= slots) break;
      if (!activeSessions.has(userId)) {
        const assignedRegion = regionList.length > 0
          ? regionList[regionIdx % regionList.length]
          : undefined;
        regionIdx++;
        activeSessions.add(userId);
        runAdminSeedSession(userId, assignedRegion).catch(err =>
          log(`admin seed session error userId=${userId}: ${err}`, "simulator"),
        );
        started++;
      }
    }

    if (started > 0) {
      log(
        `caller triggered ${started} admin seed(s) (${activeCount + started}/${target} active)`,
        "simulator",
      );
    }
  } catch (err) {
    log(`triggerSeedActivity error: ${err}`, "simulator");
  }
}

// ─── Real-caller background scheduler ────────────────────────────────────────
async function runRealCallerScheduler(): Promise<void> {
  await sleep(60 * 1000);

  while (true) {
    try {
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
    `${adminProfiles.length} admin seed(s) loaded — dynamic target (0–3 day / 2–5 weeknight / 5–8 weekend prime time)`,
    "simulator",
  );

  // Start continuous admin seed maintenance (re-evaluates target every minute)
  maintainAdminSeeds().catch(err =>
    log(`seed maintenance fatal: ${err}`, "simulator"),
  );

  // Start the background real-caller scheduler
  runRealCallerScheduler().catch(err =>
    log(`real caller scheduler fatal: ${err}`, "simulator"),
  );

  log("seed maintenance and real caller scheduler started", "simulator");
}

// ─── External control ─────────────────────────────────────────────────────────

// Called when an admin uploads a new seeded profile.
// The maintenance loop will pick it up within SEED_MAINTENANCE_INTERVAL_MS.
export async function addVirtualCaller(userId: string, _regionId?: string): Promise<void> {
  log(`admin seed registered userId=${userId} — will activate on next maintenance cycle`, "simulator");
  // Eagerly start a session so it goes online immediately (no need to wait for next cycle).
  // Assign a region from the balanced list so this seed doesn't appear in all linked regions.
  if (!activeSessions.has(userId)) {
    const regionList = await buildBalancedRegionList().catch(() => [] as string[]);
    const assignedRegion = regionList.length > 0
      ? regionList[Math.floor(Math.random() * regionList.length)]
      : undefined;
    activeSessions.add(userId);
    runAdminSeedSession(userId, assignedRegion).catch(err =>
      log(`admin seed session error userId=${userId}: ${err}`, "simulator"),
    );
    log(`admin seed STARTED immediately on upload userId=${userId} regionId=${assignedRegion ?? "global"}`, "simulator");
  }
}

// Called when an admin deletes a seeded profile
export function removeVirtualCaller(userId: string): void {
  activeSessions.delete(userId);
  const callSid = `${VIRTUAL_PREFIX}${userId}`;
  storage.removeActiveCall(callSid).catch(() => {});
  storage.endSeedSession(userId).catch(() => {});
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
