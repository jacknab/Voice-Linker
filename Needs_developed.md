# Admin Dashboard — Features Needing Development

## Already Built
- Dashboard stats (live calls, users, profiles, messages)
- Voice Profiles management
- Regions management
- Memberships / pricing tiers
- Audio Gen (TTS for system prompts)
- Phone Numbers (call stats by number/month)
- Blocked Numbers (view, search, and unblock all caller blocks)
- Messages *(placeholder — no functionality yet)*
- Phone Testing *(placeholder — no functionality yet)*
- **Caller Management** — User directory (searchable/sortable), caller detail view (call history, messages, profile status), manual credit adjustment (add/remove minutes), block/unblock from caller detail view.

---

## Moderation

- **Blocked Numbers Tab** — View, search, and unblock the full list of currently blocked callers.
- **Flagged Content Queue** — Messages or profiles that have been reported or auto-flagged for review, with approve/remove actions. ✅ COMPLETE

---

## Message Monitoring

- **Message Inbox** — Browse all voice messages exchanged between callers. Playable audio with sender, recipient, and timestamp. (Currently a placeholder tab with no data.)

---

## Analytics & Reporting

- **Revenue Report** — Daily, weekly, and monthly earnings broken down by membership tier and per-minute billing charges.
- **Conversion Funnel** — Of all callers: how many recorded a profile → how many sent a message → how many purchased a membership.
- **Peak Usage Chart** — Call volume by hour of day and day of week to identify busy periods.
- **Retention Report** — Repeat callers vs. one-time callers over a given time period.

---

## System Configuration

- **Announcement / MOTD** — A message read to every caller at login. Used for rotating promotions, maintenance notices, or featured profiles.
- **Promo Codes** — Time-limited free trial minutes or discounted memberships redeemable via phone keypad entry.

---

## IVR Phone System

- **Caller Block Option (IVR)** — Within the phone system, give a caller the ability to block another caller directly via keypad (e.g., after listening to a profile or message, press a key to block that user so they can no longer message or interact with the blocking caller).
- **Flag Greeting / Message for Review (IVR)** — Within the phone system, give a caller the ability to flag another caller's recorded greeting (profile) or a received voice message for admin review, via keypad. Flagged items should flow into the existing Flagged Content Queue in the admin panel.

---

## Operational

- **Audit Log** — A record of all admin actions: who changed what setting, when, and what the previous value was.
- **Phone Testing** — Walk through the full IVR call flow from inside the admin panel without needing a real phone. (Currently a placeholder.)
- **Multi-Admin Accounts with Roles** — Support for multiple staff logins with role-based access (e.g., super admin vs. read-only viewer).
