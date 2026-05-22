# Live Connector — Technical Reference

A complete walkthrough of how the Male Box live one-on-one conference system works, from the moment a caller presses 3 to the moment both callers hang up.

---

## Table of Contents

1. [Overview](#overview)
2. [In-Memory State](#in-memory-state)
3. [The Full Call Flow](#the-full-call-flow)
   - [Step 1 — Initiator Presses 3](#step-1--initiator-presses-3)
   - [Step 2 — Eligibility Checks](#step-2--eligibility-checks)
   - [Step 3 — Record an Invite Message (ivr-default only)](#step-3--record-an-invite-message-ivr-default-only)
   - [Step 4 — The Ringing Wait Loop](#step-4--the-ringing-wait-loop)
   - [Step 5 — Invitee Notification](#step-5--invitee-notification)
   - [Step 6 — Invitee Accepts](#step-6--invitee-accepts)
   - [Step 7 — Both Callers Enter the Conference](#step-7--both-callers-enter-the-conference)
   - [Step 8 — Live Billing Runs](#step-8--live-billing-runs)
   - [Step 9 — Conference Ends](#step-9--conference-ends)
4. [Twilio Conference Setup](#twilio-conference-setup)
5. [Billing Engine](#billing-engine)
6. [Admin Monitoring](#admin-monitoring)
7. [IVR File Differences](#ivr-file-differences)
8. [Route Reference](#route-reference)

---

## Overview

The live connector is a real-time bridging feature. When Caller A ("initiator") finds a profile they want to connect with, they press **3**. The system creates a pending invite, holds Caller A in a ringing wait loop, and notifies Caller B ("invitee") the next time Caller B returns to the browse-profiles flow. When Caller B presses **1** to accept, both call legs are joined into a private two-person Twilio conference room. A per-tick billing timer runs throughout.

```
Caller A                          Server                         Caller B
   |                                 |                               |
   |-- presses 3 ------------------>|                               |
   |                          runs 6 checks                         |
   |<-- plays disclaimer ------------|                               |
   |<-- enters ringing wait loop ----|                               |
   |   (hears ring tone every 10s)   |                               |
   |                                 |<-- returns to browse-profiles--|
   |                          detects pending invite                 |
   |                                 |-- plays invite notification -->|
   |                                 |<-- presses 1 to accept --------|
   |                          sets invite status = "accepted"        |
   |                          Twilio REST: redirect Caller A --->    |
   |<-- redirected to join ----------|                               |
   |<-- joins conference room -------|-- joins conference room ------>|
   |        [private two-person Twilio conference]                   |
   |                          billing timer starts                   |
   |   (hangs up or time runs out)   |                               |
   |                          conference ends, billing stops         |
```

---

## In-Memory State

Both IVR files maintain two module-level Maps for the lifetime of the Node process.

### `pendingLiveInvites`

```ts
type LiveConnectInvite = {
  initiatorCallSid: string;         // Twilio CallSid of the initiator's call leg
  initiatorUserId: number;          // DB user ID of the initiator
  initiatorNameRecordingUrl: string | null;  // Pre-recorded name (plays to invitee)
  initiatorGreetingUrl: string;     // Profile greeting URL (plays to invitee)
  inviteMessageUrl?: string;        // 30-second custom invite recording (ivr-default)
  conferenceRoom: string;           // Unique room name: "live-<initiatorCallSid>"
  createdAt: number;                // Date.now() — used for 60-second expiry
  status: "pending" | "accepted" | "declined";
};

const pendingLiveInvites = new Map<number, LiveConnectInvite>();
//                                  ^ targetUserId (invitee)
```

The map is keyed by the **invitee's** user ID so the notification check is a fast O(1) lookup every time any caller enters the browse-profiles handler.

### `liveConnectionUserIds`

```ts
const liveConnectionUserIds = new Set<number>();
```

Tracks which users are currently inside an active conference. Used by the eligibility checks to reject new invite requests toward someone who is already live.

### `liveBillingSessions`

```ts
type LiveBillingSession = {
  initiatorCallSid: string;
  inviteeCallSid: string;
  initiatorUserId: number;
  inviteeUserId: number;
  room: string;
  intervalId: ReturnType<typeof setInterval>;
  initiatorWarned: boolean;   // true after the low-balance warning fires
  inviteeWarned: boolean;
  startedAt: number;          // Date.now() when billing started
};

const liveBillingSessions = new Map<string, LiveBillingSession>();
//                                   ^ conferenceRoom name
```

---

## The Full Call Flow

### Step 1 — Initiator Presses 3

While Caller A is in the **profile menu** (route `/voice/handle-profile-menu`), the IVR detects `digit === "3"`. The handler resolves:
- `profileUserId` — the user ID of the profile currently playing (passed as a query param)
- `callSid` — `req.body.CallSid` from the Twilio POST body
- `fromNumber` — `req.body.From`
- `user` — looked up or created via `getOrCreateUser(fromNumber)`

### Step 2 — Eligibility Checks

Six checks run in sequence. Any failure plays a prompt and redirects back to browse-profiles.

| # | Check | Rejection prompt |
|---|-------|-----------------|
| 1 | Initiator has ≥ 5 min remaining (skipped in free mode) | `live_connect_low_balance.mp3` |
| 2 | Target profile exists in DB | `live_connect_unavailable.mp3` |
| 2b | Target profile is not an admin-uploaded sample | `live_connect_admin_profile.mp3` |
| 3 | Target has an active non-virtual call in DB | `live_connect_left_line.mp3` |
| 4 | Target has ≥ 5 min remaining (skipped in free mode) | `live_connect_unavailable.mp3` |
| 5 | Target is not already in `liveConnectionUserIds` | `live_connect_busy.mp3` |
| 6 | Target has not blocked the initiator | `live_connect_unavailable.mp3` |

If all pass, execution continues to invite creation.

### Step 3 — Record an Invite Message (ivr-default only)

`ivr-default.ts` adds a personal touch: before going to the wait loop, the initiator is asked to leave a short message.

```
plays: live_connect_record_invite.mp3
       "After the tone, record a brief message for this caller.
        Press any key when you are finished. You have 30 seconds."

<Record maxLength="30" action="/voice/live-connect-record-invite-done?targetUserId=..." />
```

The action URL (`/voice/live-connect-record-invite-done`) receives the `RecordingUrl` from Twilio and stores it in the invite:

```ts
pendingLiveInvites.set(targetUserId, {
  initiatorCallSid: callSid,
  initiatorUserId: user.id,
  initiatorNameRecordingUrl: callerProfile?.nameRecordingUrl ?? null,
  initiatorGreetingUrl: callerProfile?.recordingUrl ?? "",
  inviteMessageUrl: req.body.RecordingUrl,   // ← the 30-second invite clip
  conferenceRoom: `live-${callSid}`,
  createdAt: Date.now(),
  status: "pending",
});
```

`ivr-no-mailbox.ts` skips the recording and creates the invite immediately, then plays a brief disclaimer before the wait loop.

### Step 4 — The Ringing Wait Loop

Route: `GET /voice/live-connect-wait`

The initiator's call is held here. The loop:

1. Checks whether the invite status has changed to `accepted` or `declined` (or expired)
2. If still `pending`, plays a 10-second ring tone audio file and **redirects back to itself**
3. Repeats up to **6 times** (60 seconds total)

```
Round 1–6 (status = "pending"):
  plays: live_ringing.mp3  (10-second ring tone)
  <Redirect>/voice/live-connect-wait?targetUserId=...&attempt=N</Redirect>

If status = "declined" or attempt > 6:
  plays: live_connect_no_answer.mp3
  <Redirect>/voice/browse-profiles</Redirect>

If status = "accepted":
  <Redirect>/voice/live-connect-join?room=live-<callSid></Redirect>
  (this branch is normally never hit because Twilio REST redirects first)
```

> **Important:** When the invitee accepts, the wait loop does **not** need to naturally poll around to the `accepted` branch. The server immediately calls the Twilio REST API to redirect the initiator's live call at that instant (see Step 6).

### Step 5 — Invitee Notification

Every time **any** caller enters the `/voice/browse-profiles` handler, the server checks:

```ts
const invite = pendingLiveInvites.get(user.id);
if (invite && invite.status === "pending" && !isExpired(invite)) {
  // Interrupt normal browse flow — play the invite notification
}
```

The notification sequence plays in order:

1. `live_connect_chime.mp3` — an attention-getting sound
2. Initiator's **name recording** (`invite.initiatorNameRecordingUrl`) — e.g. "Marcus"
3. `live_invite_wants_to_connect.mp3` — "wants to connect with you."
4. Initiator's **invite message** (`invite.inviteMessageUrl`, ivr-default only)
5. `live_invite_options.mp3` — the menu:

```
"To connect live with this caller press 1.
 To reply with a message press 2.
 To skip press 3.
 To hear the last message you sent them press 4.
 To block this caller press 7.
 To hear this caller's location press 8.
 To repeat these choices press 9."
```

This is served as a `<Gather>` block at route `/voice/live-connect-respond`.

### Step 6 — Invitee Accepts

Route: `POST /voice/live-connect-respond`

When the invitee presses **1**:

```ts
invite.status = "accepted";

// 1. Redirect the INITIATOR's live call immediately via Twilio REST API
const client = twilio(accountSid, authToken);
await client.calls(invite.initiatorCallSid).update({
  twiml: `<Response>
    <Redirect>/voice/live-connect-join?room=${invite.conferenceRoom}</Redirect>
  </Response>`
});

// 2. Send the INVITEE's call to the same join URL
const twiml = new VoiceResponse();
twiml.redirect(`/voice/live-connect-join?room=${invite.conferenceRoom}`);
res.type("text/xml").send(twiml.toString());
```

Both call legs are now heading to `/voice/live-connect-join` with the same `room` value.

If the invitee presses **2** (send a message), they're routed into the standard record-message flow, and the invite is cleaned up.

If the invitee presses **3** (skip) or **7** (block), the invite is deleted and they return to browsing. The initiator's wait loop detects `status !== "pending"` on the next poll and plays the no-answer prompt.

### Step 7 — Both Callers Enter the Conference

Route: `GET /voice/live-connect-join`

This route produces TwiML that places the caller into the Twilio conference:

```ts
const twiml = new VoiceResponse();
playPrompt(twiml, req, "live_connect_connecting.mp3",
  "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!");

const dial = twiml.dial({ callerId: req.body?.To });
dial.conference(room, {
  startConferenceOnEnter: true,
  endConferenceOnExit: true,       // room closes when first person leaves
  beep: false,
  maxParticipants: 2,
  record: "do-not-record",
});
```

Since **both** callers hit this route with `startConferenceOnEnter: true`, whichever arrives first simply waits (silently) for the second. The room activates as soon as both legs are in. Twilio never plays hold music because the "connecting" prompt finishes playing before the second leg arrives in practice.

After sending this TwiML, the server immediately starts the billing session:

```ts
await startLiveBilling({
  initiatorCallSid: invite.initiatorCallSid,
  inviteeCallSid: req.body.CallSid,  // the invitee's sid (from the join request)
  initiatorUserId: invite.initiatorUserId,
  inviteeUserId: user.id,
  room,
});
liveConnectionUserIds.add(invite.initiatorUserId);
liveConnectionUserIds.add(user.id);
pendingLiveInvites.delete(user.id);
```

### Step 8 — Live Billing Runs

`startLiveBilling` sets a `setInterval` that fires every `LIVE_TICK_MS` (5,000 ms by default):

```ts
const LIVE_TICK_MS = 5_000;
const LIVE_TICK_SECONDS = LIVE_TICK_MS / 1000;  // 5 seconds
const LIVE_LOW_BALANCE_SECONDS = 300;            // 5 minutes — warning threshold

setInterval(async () => {
  // Deduct 5 seconds from both users' remainingSeconds in the DB
  await storage.deductSeconds(session.initiatorUserId, LIVE_TICK_SECONDS);
  await storage.deductSeconds(session.inviteeUserId,   LIVE_TICK_SECONDS);

  const initiatorUser = await storage.getUserById(session.initiatorUserId);
  const inviteeUser   = await storage.getUserById(session.inviteeUserId);

  // Low-balance warning (fires once per caller)
  if (!session.initiatorWarned && (initiatorUser?.remainingSeconds ?? 0) < LIVE_LOW_BALANCE_SECONDS) {
    session.initiatorWarned = true;
    client.conferences(room).participants(session.initiatorCallSid).update({
      announceUrl: buildPromptUrl(req, "live_low_balance_warning.mp3"),
      announceMethod: "GET",
    });
  }
  // same for invitee...

  // Force-disconnect if either caller hits 0
  if ((initiatorUser?.remainingSeconds ?? 0) <= 0) {
    client.calls(session.initiatorCallSid).update({ status: "completed" });
    stopLiveBilling(room);
  }
  if ((inviteeUser?.remainingSeconds ?? 0) <= 0) {
    client.calls(session.inviteeCallSid).update({ status: "completed" });
    stopLiveBilling(room);
  }
}, LIVE_TICK_MS);
```

The low-balance announcement is injected **only** into the specific participant's audio stream using Twilio's `participants.update({ announceUrl })` — the other caller does not hear it.

### Step 9 — Conference Ends

The conference ends when:

- Either caller presses **pound** (the `<Conference>` noun does not have a pound-disconnect by default — the caller must hang up or the time runs out)
- Either caller hangs up (Twilio fires `endConferenceOnExit: true`, closing the room)
- The billing engine calls `client.calls(sid).update({ status: "completed" })` because a caller ran out of time

Twilio calls the `statusCallbackUrl` (if configured) when the conference ends. The server's `stopLiveBilling(room)` function:

```ts
function stopLiveBilling(room: string) {
  const session = liveBillingSessions.get(room);
  if (!session) return;
  clearInterval(session.intervalId);
  liveBillingSessions.delete(room);
  liveConnectionUserIds.delete(session.initiatorUserId);
  liveConnectionUserIds.delete(session.inviteeUserId);
  console.log(`[live-billing] stopped for room ${room}`);
}
```

After the conference ends, both callers' calls are completed by Twilio. The IVR does not redirect them back into the system automatically — they must call back.

---

## Twilio Conference Setup

The conference is created with these TwiML parameters:

| Parameter | Value | Effect |
|-----------|-------|--------|
| `startConferenceOnEnter` | `true` | Room activates as soon as the first leg joins |
| `endConferenceOnExit` | `true` | Room closes when **any** participant leaves (no lingering empty rooms) |
| `beep` | `false` | No join/leave tones |
| `maxParticipants` | `2` | Hard cap — no accidental third-party joins |
| `record` | `"do-not-record"` | Calls are not recorded |
| `waitUrl` | *(not set)* | Twilio's default hold music plays to the first joiner — suppressed in practice because the "Connecting you now" prompt plays first |

The room name is deterministic: **`live-<initiatorCallSid>`**, making each invite globally unique and traceable in Twilio logs.

---

## Billing Engine

| Constant | Value | Purpose |
|----------|-------|---------|
| `LIVE_TICK_MS` | 5,000 ms | How often seconds are deducted |
| `LIVE_TICK_SECONDS` | 5 | Seconds deducted per tick |
| `LIVE_LOW_BALANCE_SECONDS` | 300 | Warn at this many seconds remaining |

Both callers are billed at the same rate simultaneously. Neither caller can "donate" time to the other. If the initiator runs out, they are disconnected and the conference closes (because `endConferenceOnExit: true`), which also ends the invitee's session even if they had time left.

---

## Admin Monitoring

Route: `GET /api/admin/live-connections`

Returns a live snapshot of all active conferences. Each entry is enriched server-side with the phone number and current `remainingSeconds` from the DB:

```json
[
  {
    "room": "live-CA1234abcd...",
    "initiatorUserId": 42,
    "inviteeUserId": 77,
    "initiatorPhone": "+15551234567",
    "inviteePhone": "+15559876543",
    "initiatorRemainingSeconds": 847,
    "inviteeRemainingSeconds": 1203,
    "startedAt": 1718300000000,
    "elapsedSeconds": 120
  }
]
```

This feeds the **Live Conferences** real-time panel in the admin dashboard (`/backstage`), which auto-refreshes every 10 seconds.

---

## IVR File Differences

| Behavior | `ivr-default.ts` | `ivr-no-mailbox.ts` |
|----------|-----------------|---------------------|
| Invite recording step | Yes — 30-second clip | No — skipped |
| Invite message played to invitee | Yes (after name) | No |
| Disclaimer before wait loop | Implied in flow | Yes — plays `live_connect_disclaimer.mp3` |
| Otherwise identical | ✓ | ✓ |

---

## Route Reference

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/voice/handle-profile-menu` | Digit 3 triggers eligibility checks + invite creation |
| `POST` | `/voice/live-connect-record-invite-done` | Receives invite recording, stores URL, starts wait loop *(ivr-default only)* |
| `GET` | `/voice/live-connect-wait` | Ringing wait loop — polls invite status, max 6 rounds |
| `POST` | `/voice/live-connect-respond` | Invitee's keypress response (1=accept, 2=message, 3=skip, 7=block) |
| `GET` | `/voice/live-connect-join` | TwiML that places a caller into the Twilio conference |
| `GET` | `/api/admin/live-connections` | Admin API — live snapshot of active conferences |
