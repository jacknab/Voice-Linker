/**
 * Live Queue — slot-based real-time profile queue for the live connector.
 *
 * Slot layout:
 *   0   → caller is currently hearing this profile
 *   1   → priority slot: new messages and live-connect invitations
 *   2   → buffer slot
 *   3   → new callers entering the system get injected here
 *   4+  → deeper buffer
 *
 * After any action (message / skip / connect live / block) the slot-0 item is
 * marked heard and shifted off; everything above slides down by one.
 *
 * Real-time updates: when a caller hangs up their profile is immediately removed
 * from every other active caller's queue via removeProfileFromAllQueues().
 */

import { getBrowseState, setBrowseState } from "./redis";
import { getActiveCallSids } from "./ws";
import type { BrowseQueueItem } from "./ivr-browse-state";

// ── Slot constants ─────────────────────────────────────────────────────────────
export const SLOT_CURRENT    = 0;   // always playing
export const SLOT_PRIORITY   = 1;   // messages / live-connect invitations
export const SLOT_NEW_CALLER = 3;   // new callers entering the live connector

// ── Core helpers ───────────────────────────────────────────────────────────────

/**
 * Inject a profile item at a specific slot index in a caller's queue.
 * Deduplicates by userId (existing entry removed before insertion).
 * If slot > queue.length the item is appended at the end.
 */
export async function injectProfileAtSlot(
  callSid: string,
  profile: BrowseQueueItem,
  slot: number,
): Promise<boolean> {
  const state = await getBrowseState(callSid);
  if (!state) return false;

  // Remove any existing entry for this user (dedup)
  state.queue = state.queue.filter(p => p.userId !== profile.userId);

  // Insert at the requested slot (capped at the current length)
  const insertAt = Math.min(slot, state.queue.length);
  state.queue.splice(insertAt, 0, profile);

  await setBrowseState(callSid, state);
  return true;
}

/**
 * Remove a specific userId from a single caller's queue.
 * No-op if the userId is not present.
 */
export async function removeProfileFromQueue(
  callSid: string,
  userId: string,
): Promise<void> {
  const state = await getBrowseState(callSid);
  if (!state) return;

  const before = state.queue.length;
  state.queue = state.queue.filter(p => p.userId !== userId);
  if (state.queue.length !== before) {
    await setBrowseState(callSid, state);
  }
}

/**
 * Remove a departed caller's profile from ALL currently-active browse sessions.
 * Called from the /voice/status webhook as soon as a call ends so every other
 * caller's queue updates in real-time (like a chat-room user leaving).
 */
export async function removeProfileFromAllQueues(departedUserId: string): Promise<void> {
  const activeSids = getActiveCallSids();
  await Promise.all(activeSids.map(sid => removeProfileFromQueue(sid, departedUserId)));
}

/**
 * When a new caller enters the live connector for the first time, inject their
 * profile at SLOT_NEW_CALLER (3) in every other active browse session.
 * Only injects into sessions in the same region (or no region filter when the
 * state's callerRegionId is null).
 *
 * @param profile        The new caller's BrowseQueueItem to inject.
 * @param incomingCallSid  The new caller's own CallSid (excluded from injection).
 */
export async function injectNewCallerIntoAllQueues(
  profile: BrowseQueueItem,
  incomingCallSid: string,
): Promise<void> {
  const activeSids = getActiveCallSids().filter(sid => sid !== incomingCallSid);
  if (activeSids.length === 0) return;

  await Promise.all(
    activeSids.map(async (sid) => {
      const state = await getBrowseState(sid);
      if (!state) return;

      // Region filter: only inject into sessions that share a region with the
      // new caller, or into sessions with no region set.
      const sameRegion =
        !state.callerRegionId ||
        !profile.regionId ||
        state.callerRegionId === profile.regionId;

      if (!sameRegion) return;

      // Don't inject if the caller is already somewhere in the queue
      if (state.queue.some(p => p.userId === profile.userId)) return;

      const insertAt = Math.min(SLOT_NEW_CALLER, state.queue.length);
      state.queue.splice(insertAt, 0, { ...profile, isPreExisting: false });
      await setBrowseState(sid, state);
    }),
  );
}
