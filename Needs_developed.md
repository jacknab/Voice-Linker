# Admin Dashboard — Features Needing Development

## Already Built
- Dashboard stats (live calls, users, profiles, messages)
- Voice Profiles management
- Regions management
- Memberships / pricing tiers
- Audio Gen (TTS for system prompts)
- Phone Numbers (call stats by number/month)
- Messages *(placeholder — no functionality yet)*
- Phone Testing *(placeholder — no functionality yet)*

---

## Caller Management

- **User Directory** — Browse all callers with phone number, join date, membership tier, credit balance, and profile status. Searchable and sortable.
- **Caller Detail View** — Individual caller page showing full call history, messages sent/received, payment history, and admin notes.
- **Manual Credit Adjustment** — Add or remove credits from a caller's account directly from the admin.
- **Block / Unblock from Profile** — One-click block or unblock a number from within the caller detail view. (Blocked users table exists in the database but has no admin UI.)

---

## Moderation

- **Blocked Numbers Tab** — View, search, and unblock the full list of currently blocked callers.
- **Flagged Content Queue** — Messages or profiles that have been reported or auto-flagged for review, with approve/remove actions.

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

## Operational

- **Audit Log** — A record of all admin actions: who changed what setting, when, and what the previous value was.
- **Phone Testing** — Walk through the full IVR call flow from inside the admin panel without needing a real phone. (Currently a placeholder.)
- **Multi-Admin Accounts with Roles** — Support for multiple staff logins with role-based access (e.g., super admin vs. read-only viewer).
