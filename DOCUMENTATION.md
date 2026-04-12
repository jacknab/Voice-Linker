# Male Box — Complete Developer & Operator Documentation

**Version:** 1.0  
**Platform:** Node.js / React / PostgreSQL / Twilio  
**License:** Commercial — Marketplace Sale

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Feature Summary](#3-feature-summary)
4. [Architecture Overview](#4-architecture-overview)
5. [Directory Structure](#5-directory-structure)
6. [Database Schema](#6-database-schema)
7. [Environment Variables](#7-environment-variables)
8. [Installation & First Run](#8-installation--first-run)
9. [IVR Voice System](#9-ivr-voice-system)
10. [Admin Panel Reference](#10-admin-panel-reference)
11. [Payment Systems](#11-payment-systems)
12. [Web Layer (Public Site)](#12-web-layer-public-site)
13. [Membership & Billing](#13-membership--billing)
14. [Live 1-on-1 Connect](#14-live-1-on-1-connect)
15. [Linked Regions (Cross-Region Overflow)](#15-linked-regions-cross-region-overflow)
16. [Regional Greeting Queue](#16-regional-greeting-queue)
17. [Membership PIN (Cross-Phone Access)](#17-membership-pin-cross-phone-access)
18. [Auto-Moderation System](#18-auto-moderation-system)
19. [SMS Marketing](#19-sms-marketing)
20. [Virtual Caller Simulator](#20-virtual-caller-simulator)
21. [Audio Generation (ElevenLabs TTS)](#21-audio-generation-elevenlabs-tts)
22. [Free Mode & Scheduled Free Days](#22-free-mode--scheduled-free-days)
23. [Announcements / MOTD](#23-announcements--motd)
24. [Promo Codes](#24-promo-codes)
25. [SEO & Public Pages](#25-seo--public-pages)
26. [API Reference](#26-api-reference)
27. [Deployment Guide](#27-deployment-guide)
28. [Customization Guide](#28-customization-guide)
29. [Security Notes](#29-security-notes)
30. [Frequently Asked Questions](#30-frequently-asked-questions)

---

## 1. Project Overview

**Male Box** is a complete, production-ready adult voice party-line platform. Callers dial a phone number, record a voice profile greeting, browse other callers' greetings, exchange private voice messages, and optionally connect live in a private two-way call — all navigated by a touch-tone (DTMF) keypad IVR.

The platform supports two site categories configurable from the admin panel:

| Mode | Description |
|---|---|
| **MM** | Men seeking Men (gay/bi market) |
| **MW** | Men seeking Women (straight market) |

The mode affects audio prompts, on-screen copy, and the gender-select step added to the MW IVR flow.

A full web layer sits alongside the phone system: a public marketing site, web-based membership purchase (Stripe + PayPal), a registered-user dashboard for linking phone numbers to accounts, and a secure admin dashboard for operating every aspect of the platform.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, shadcn/ui, Radix UI, Wouter (routing), TanStack Query v5, Recharts |
| Backend | Node.js, Express (TypeScript), tsx runtime |
| Database | PostgreSQL, Drizzle ORM, Drizzle Kit |
| Voice / IVR | Twilio (TwiML, REST API, Conference, Recordings, Transcriptions) |
| Payments | Stripe (Checkout Sessions + Webhooks + IVR card entry), PayPal Standard (IPN) |
| TTS | ElevenLabs API |
| SMS | Twilio SMS |
| Session | express-session + connect-pg-simple (PostgreSQL session store) |
| Auth | bcryptjs password hashing, express-session |
| Email | Nodemailer (password reset) |
| File Upload | Multer (local disk) |

---

## 3. Feature Summary

### Phone / IVR
- Caller identification by incoming phone number (auto-creates account on first call)
- Cross-phone access via 5-digit membership number + 4-digit PIN
- Record and re-record voice profile greeting (name + main greeting)
- Browse other callers' voice profiles with regional sorting
- Send and receive private voice messages (mailbox)
- Record and browse personal ads (mailbox feature, optional via `IVR_FILE`)
- Live 1-on-1 direct connect with invite/accept/decline flow
- Membership purchase by credit card through the phone keypad (IVR Stripe payment)
- Per-minute and per-day billing modes
- Free trial minutes for new callers
- Promotional code redemption via IVR keypad
- Announcement / Message-of-the-Day system (4 independent slots)

### Admin Dashboard
- Dashboard with live caller counts, active call list, platform stats
- Voice Profiles management (upload, delete, listen, transcription)
- Regions management (create, edit, link, deactivate)
- Callers management (search, view detail, credit/deduct minutes, ban/restrict/restore, PIN management)
- Messages management (listen, delete, relay)
- Flagged Content queue (approve or remove flagged profiles and messages)
- Membership settings (plan names, prices, minutes, billing mode, PayPal config)
- Membership Cards management (issue, note, delete)
- Phone Numbers stats (per-number call/caller analytics)
- Blocked Numbers management
- Promo Codes (create, deactivate, view redemptions)
- Zip Codes database (lat/lon, city, audio file)
- Announcements / MOTD (4 slots, each independently enabled)
- Analytics (funnel, peak hours, peak days, retention, MRR)
- Audit Log (every admin action is logged)
- Moderation Log (auto-mod event history)
- Phone Testing (simulate the full IVR flow from a browser)
- IVR Flow Map (visual diagram of the entire call tree)
- Audio Gen / TTS (generate or upload IVR audio files, per-category folders)
- SMS Marketing (2 monthly templates with scheduling and manual send)
- Website Settings (site name, phone, email, category)

### Web Layer
- Public marketing landing page (MM/MW aware)
- Membership purchase page with Stripe and PayPal
- Web user registration, login, password reset
- Linked phone number management (web account ↔ phone user)
- Post-purchase confirmation pages
- FAQ, Safety Tips, About, Support, Cities, Keypad Tips pages
- Privacy Policy and Terms of Use pages

### SMS Marketing
- Two monthly SMS templates configurable from the admin panel
- Each template assigned a send day (1–30), active toggle, and message body
- Circular 10-day spacing rule between both templates
- Send day permanently locked after first send (prevents schedule drift)
- Manual "Send Now" button for immediate dispatch
- Automated daily scheduler fires at 10:00 AM server time

---

## 4. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser / App                         │
│   React + Vite SPA (Admin, Public Site, Member Dashboard)    │
└───────────────────┬──────────────────────────────────────────┘
                    │ HTTP / JSON
┌───────────────────▼──────────────────────────────────────────┐
│                    Express Server (port 5000)                 │
│   routes.ts   authRoutes.ts   webhookHandlers.ts             │
│   server/settings-cache.ts  (60 s in-memory settings cache) │
│   server/storage.ts  (Drizzle ORM — all DB access)          │
│   server/simulator.ts  (virtual caller background loops)     │
└───────┬──────────────────┬───────────────────────────────────┘
        │ PostgreSQL        │ Twilio REST API
┌───────▼──────┐    ┌───────▼──────────────────────────────────┐
│  PostgreSQL  │    │  IVR Module (ivr-default.ts or custom)   │
│  (Drizzle)   │    │  TwiML routes: /voice/*                  │
└──────────────┘    │  ElevenLabs TTS fallbacks                │
                    │  Stripe IVR card charge                   │
                    └──────────────────────────────────────────┘
```

The IVR module is loaded dynamically at startup via the `IVR_FILE` environment variable. This makes it straightforward to swap the entire call script without touching the rest of the codebase.

---

## 5. Directory Structure

```
project-root/
├── client/                    # React frontend (Vite)
│   └── src/
│       ├── App.tsx            # Route definitions
│       ├── pages/
│       │   ├── Admin.tsx      # Full admin dashboard (single file, all tabs)
│       │   ├── Landing.tsx    # Public marketing page
│       │   ├── Membership.tsx # Web membership purchase
│       │   ├── Dashboard.tsx  # Web user dashboard
│       │   ├── FAQ.tsx
│       │   ├── Cities.tsx
│       │   ├── KeypadTips.tsx
│       │   ├── Support.tsx
│       │   ├── About.tsx
│       │   ├── SafetyTips.tsx
│       │   ├── PrivacyPolicy.tsx
│       │   ├── Terms.tsx
│       │   └── admin/
│       │       └── IvrFlowMap.tsx   # Visual IVR diagram
│       └── components/
│           ├── SiteLayout.tsx       # Nav, footer, shared layout
│           └── SecureAdminGuard.tsx # PIN-gated admin route wrapper
├── server/
│   ├── index.ts               # Entry point — Express init, scheduler boot
│   ├── routes.ts              # All non-IVR HTTP routes
│   ├── authRoutes.ts          # Web auth (register, login, reset password)
│   ├── ivr-default.ts         # Full IVR (with mailboxes)
│   ├── ivr-no-mailbox.ts      # IVR variant with mailboxes removed
│   ├── storage.ts             # DatabaseStorage class — all DB operations
│   ├── db.ts                  # Drizzle + PostgreSQL connection
│   ├── simulator.ts           # Virtual caller background loops
│   ├── autoModeration.ts      # Auto-mod rules engine
│   ├── elevenlabs.ts          # ElevenLabs API helpers
│   ├── settings-cache.ts      # 60 s settings cache
│   ├── stripeClient.ts        # Stripe SDK
│   ├── webhookHandlers.ts     # Stripe webhook handler
│   ├── ivrTester.ts           # Browser-side IVR simulator endpoint
│   ├── seoPageGenerator.ts    # Dynamic SEO page generation
│   ├── static.ts              # Static file serving helpers
│   ├── zipLookup.ts           # ZIP → lat/lon lookup
│   └── vite.ts                # Dev: Vite middleware integration
├── shared/
│   └── schema.ts              # Drizzle ORM schema + Zod insert schemas
├── scripts/
│   ├── seed-membership.ts     # Seeds Stripe Bronze/Silver/Gold products
│   └── init-database.ts       # Initializes DB schema (alias for db:push)
├── uploads/                   # IVR audio files served at /audio/*
│   ├── *.mp3                  # Shared (default) audio files
│   ├── mm/                    # MM-specific overrides
│   └── mw/                    # MW-specific overrides
├── .env.example               # Template for required environment variables
├── drizzle.config.ts          # Drizzle Kit config (reads DATABASE_URL)
├── vite.config.ts             # Vite build config
├── tailwind.config.ts         # Tailwind theme config
└── package.json
```

---

## 6. Database Schema

All tables are defined in `shared/schema.ts` using Drizzle ORM.

### `regions`
Defines each phone market (city/area).

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Auto-generated |
| name | text | Display name (e.g. "Boston") |
| slug | text UNIQUE | URL slug |
| stateAbbreviation | text | e.g. "MA" |
| phoneNumber | text | Twilio number for this region |
| timezone | text | e.g. "America/New_York" |
| maxCapacity | integer | Max concurrent callers (default 1000) |
| description | text | Optional description |
| isActive | boolean | Whether region accepts calls |
| linkedRegionId | UUID | Optional link to a nearby region for overflow |
| defaultZipCode | text | ZIP used for new callers without a known location |
| createdAt | timestamp | Row creation time |

### `region_links`
Many-to-many linking table for multi-region overflow chains.

| Column | Type | Description |
|---|---|---|
| regionId | UUID | Source region |
| linkedRegionId | UUID | Target region |

### `users`
One row per phone number (both real and virtual callers).

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Auto-generated |
| phoneNumber | text UNIQUE | E.164 or `VIRTUAL-<uuid>` for virtual callers |
| stripeCustomerId | text | Stripe Customer ID (web purchases) |
| membershipTier | text | e.g. "Bronze", "Silver", "Gold" |
| remainingSeconds | integer | Billing seconds remaining |
| zipCodeId | UUID | FK → zip_codes |
| membershipNumber | text UNIQUE | 5-digit member number |
| membershipPin | text | 4-digit PIN for cross-phone access |
| membershipStartedAt | timestamp | First activation (for per_day grace period) |
| accountStatus | text | `active` \| `restricted` \| `banned` |
| recordingRejectionReason | text | `null` \| `unclear` \| `phone_number` |
| recordingRejectionType | text | `null` \| `greeting` \| `personal_ad` |
| createdAt | timestamp | Row creation time |

### `profiles`
Voice greeting recordings.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Auto-generated |
| userId | UUID UNIQUE | FK → users |
| nameRecordingUrl | text | Recorded name audio URL |
| recordingUrl | text | Main greeting audio URL |
| recordingDuration | integer | Duration in seconds |
| isAdminUploaded | boolean | True for admin-uploaded "virtual" profiles |
| siteCategory | text | `MM` \| `MW` — category at upload time |
| gender | text | `male` \| `female` — MW profiles only |
| transcription | text | Auto-generated Twilio transcript text |
| transcriptionStatus | text | `null` \| `pending` \| `completed` \| `failed` |
| createdAt | timestamp | |

### `messages`
Private voice messages between callers.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | |
| fromUserId | UUID | Sender |
| toUserId | UUID | Recipient |
| recordingUrl | text | Audio URL |
| isRead | boolean | Whether recipient has listened |
| createdAt | timestamp | |

### `active_calls`
Real-time tracking of callers currently on the line (cleared on hangup).

| Column | Type | Description |
|---|---|---|
| callSid | text PK | Twilio Call SID |
| userId | UUID | FK → users |
| regionId | UUID | FK → regions |
| gender | text | `male` \| `female` (MW mode only) |
| joinedAt | timestamp | |

### `call_logs`
Persistent record of every inbound call (used for phone-number stats).

| Column | Type | Description |
|---|---|---|
| id | UUID PK | |
| callSid | text UNIQUE | |
| regionId | UUID | |
| toPhoneNumber | text | Twilio number that was dialed |
| fromPhoneNumber | text | Caller's originating number |
| durationSeconds | integer | Filled on call end |
| startedAt | timestamp | |
| completedAt | timestamp | |

### `blocked_users`
Blocks between callers (affects live-connect eligibility).

| Column | Type | Description |
|---|---|---|
| id | UUID PK | |
| blockerId | UUID | |
| blockedUserId | UUID | |
| createdAt | timestamp | Used for 24 h auto-mod window |

### `flagged_content`
Content flagged for admin review.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | |
| contentType | text | `profile` \| `message` |
| contentId | UUID | |
| reason | text | User-supplied or auto-mod reason |
| status | text | `pending` \| `approved` \| `removed` |
| reportedByUserId | UUID | Null = auto-flagged by system |
| createdAt | timestamp | |
| reviewedAt | timestamp | |

### `site_settings`
Singleton row for platform configuration (one row, id = "singleton").

| Column | Default | Description |
|---|---|---|
| siteName | "Male Box" | Displayed in nav/footer |
| fallbackPhoneNumber | "800-730-2508" | Shown when no region-specific number applies; also used as SMS sender |
| customerServiceEmail | null | Public support contact |
| customerServicePhone | null | Public support phone |
| siteCategory | "MM" | `MM` or `MW` |

### `membership_settings`
Singleton row for billing and plan configuration.

| Column | Default | Description |
|---|---|---|
| freeTrialMinutes | 90 | Minutes given to brand-new callers |
| plan1Name / plan2Name / plan3Name | "Premium" etc. | Plan display names |
| plan1Minutes / plan2Minutes / plan3Minutes | varies | Minutes per plan |
| plan1PriceCents / plan2PriceCents / plan3PriceCents | varies | Prices in cents |
| bonusPlanKey | null | Which plan (`plan1`/`plan2`/`plan3`) gives double minutes to first-time buyers |
| billingMode | "per_minute" | `per_minute` or `per_day` |
| motdEnabled / motdText | false | Entry announcement toggle + text |
| motdMainMenuEnabled / motdMainMenuText | false | Main menu MOTD |
| motdMaleBoxEnabled / motdMaleBoxText | false | Male Box (phone booth) MOTD |
| motdPostPurchaseEnabled / motdPostPurchaseText | false | Post-purchase MOTD |
| paypalEmail | null | PayPal Business email (blank = PayPal disabled) |
| paypalSandbox | false | Toggle sandbox vs production PayPal |
| freeMode | false | Bypass all billing/trial checks globally |
| freeModeScheduleDays | [] | Days of week (0–6) when free mode auto-activates |

### `system_prompt_overrides`
Custom text overrides for IVR audio prompt scripts.

| Column | Description |
|---|---|
| filename (PK) | Prompt filename key |
| customText | Admin-edited text |
| updatedAt | |

### `promo_codes`
Promotional codes redeemable for free minutes.

| Column | Description |
|---|---|
| id (UUID PK) | |
| code | Unique alphanumeric code |
| description | Internal notes |
| valueMinutes | Minutes awarded on redemption |
| maxUses | Optional cap (null = unlimited) |
| usedCount | Lifetime redemptions |
| expiresAt | Optional expiry timestamp |
| isActive | Enable/disable flag |
| createdAt | |

### `promo_redemptions`
Records each code use.

| Column | Description |
|---|---|
| id (UUID PK) | |
| promoCodeId | FK → promo_codes |
| userId | FK → users |
| secondsAwarded | Actual seconds credited |
| redeemedAt | |

### `audit_logs`
Append-only log of every admin action.

| Column | Description |
|---|---|
| id (UUID PK) | |
| action | e.g. `profile_deleted`, `caller_credited` |
| targetType | e.g. `profile`, `region`, `caller` |
| targetId | Entity UUID |
| targetLabel | Human-readable label (phone number, code, etc.) |
| detail | JSON string with additional context |
| performedBy | Always "admin" |
| createdAt | |

### `moderation_logs`
Auto-moderation event history.

| Column | Description |
|---|---|
| id (UUID PK) | |
| eventType | e.g. `auto_flag`, `auto_restrict`, `recording_rejected` |
| rule | Rule identifier that triggered the event |
| reason | Human-readable reason |
| targetUserId | FK → users |
| contentId | Optional FK to flagged content |
| createdAt | |

### `web_users`
Web-account registrations (separate from phone users).

| Column | Description |
|---|---|
| id (UUID PK) | |
| email | Unique email address |
| passwordHash | bcrypt hash |
| linkedPhoneNumber | E.164 phone, set in Dashboard |
| sessionId | Current session token |
| createdAt | |

### `web_user_alt_phones`
Alternative phone numbers on a web account.

### `mailboxes`
Personal mailbox / personal ad configuration per user.

### `membership_link_codes`
One-time codes for linking a phone to a web account.

### `membership_cards`
Issued membership cards (card number, status, notes).

### `seed_sessions`
Metadata for admin-uploaded virtual caller seed sessions.

### `sms_templates`
SMS marketing templates (always exactly 2 rows: id 1 and id 2).

| Column | Type | Description |
|---|---|---|
| id | integer PK | 1 or 2 |
| label | text | Internal label |
| message | text | SMS body text |
| sendDay | integer | Day of month to send (1–30), null = unset |
| isActive | boolean | Whether scheduler will send this template |
| lastSentAt | timestamp | When it was last dispatched |
| lastSentCount | integer | Number of recipients on last send |
| updatedAt | timestamp | |

### `zip_codes`
Lookup table mapping ZIP codes to coordinates and city names.

| Column | Description |
|---|---|
| id (UUID PK) | |
| code | 5-digit ZIP |
| latitude / longitude | Coordinates |
| city / state | Location name |
| neighborhood | Neighborhood label for regional routing |
| audioFile | Pre-generated neighborhood audio filename |
| createdAt | |

---

## 7. Environment Variables

Copy `.env.example` to `.env` and fill in every value before running.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user:pass@host/dbname?sslmode=require` |
| `SESSION_SECRET` | Yes | Long random string used to sign session cookies. Generate with `openssl rand -hex 64` |
| `TWILIO_ACCOUNT_SID` | Yes | From Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Yes | From Twilio Console → Account Info |
| `TWILIO_PHONE_NUMBER` | Yes | Your Twilio number in E.164 format (e.g. `+18007302508`) — used as fallback |
| `ELEVENLABS_API_KEY` | Yes | From ElevenLabs → Profile → API Key |
| `ELEVENLABS_VOICE_ID` | No | ElevenLabs voice ID. Default: `21m00Tcm4TlvDq8ikWAM` (Rachel) |
| `STRIPE_SECRET_KEY` | Yes | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe Dashboard → Webhooks → signing secret for your webhook endpoint |
| `ENABLE_MAILBOX` | No | Set to `false` to hide the Mailbox option from IVR. Default: `true` |
| `IVR_FILE` | No | Path (relative to `server/`) of the IVR module. Default: `./ivr-default`. Swap to `./ivr-no-mailbox` to remove mailbox menu globally |

> **PayPal** is configured from the admin panel (no env vars needed).

---

## 8. Installation & First Run

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ database
- Twilio account with at least one phone number
- ElevenLabs account
- Stripe account

### Steps

```bash
# 1. Clone / extract the project
cd male-box

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and fill in all values

# 4. Push database schema
npm run db:push

# 5. Seed Stripe membership products (run once)
npx tsx scripts/seed-membership.ts

# 6. Start the server (development)
npm run dev

# 7. Or build and start (production)
npm run build
npm start
```

The server listens on port **5000** by default.

### Configuring Twilio

1. In the Twilio Console, go to **Phone Numbers → Manage → Active Numbers**
2. For each phone number, set the **Voice webhook** to:
   ```
   https://yourdomain.com/voice
   ```
   with method **HTTP POST**
3. Set the **Status Callback** to:
   ```
   https://yourdomain.com/voice/status
   ```
   with method **HTTP POST**

### Configuring Stripe Webhooks

1. In the Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
3. Events to listen for: `checkout.session.completed`, `payment_intent.succeeded`
4. Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`

---

## 9. IVR Voice System

The entire phone call experience is driven by TwiML responses served from `server/ivr-default.ts` (or `ivr-no-mailbox.ts`). Every route responds with XML that instructs Twilio on what to say, what to record, and what keypad digits to accept.

### Call Entry Flow

```
Caller dials in
    └── POST /voice
        └── /voice/entry-check
            ├── Banned? → Play rejection message + hangup
            ├── Cross-phone auth? → /voice/membership-number-entry
            ├── New caller? → Create user, grant free trial
            └── /voice/main-menu
```

### Main Menu

| Key | Action |
|---|---|
| 1 | Browse Profiles (Male Box) |
| 2 | Re-record Profile |
| 3 | Mailbox / Personal Ads (if enabled) |
| 4 | Membership Info & Purchase |
| 5 | Redeem Promo Code |
| 8 | Manage Membership (listen to balance, set PIN) |

### Browse Profiles Flow

```
/voice/browse-profiles
    ├── Play greeting of next caller
    │     (name + greeting, or "New caller closest to you")
    ├── Key 1 → Next profile
    ├── Key 2 → Next profile (same as 1)
    ├── Key 3 → Request live connect with this caller
    ├── Key 4 → Send voice message to this caller
    ├── Key 7 → Flag this profile for review
    ├── Key 8 → Block this caller
    └── [End of queue] → Linked-region offer or start over
```

### Recording a Profile

1. Caller presses 2 (Re-record) from main menu
2. IVR asks them to say their name after the beep
3. IVR asks them to record their full greeting
4. Recording is saved to Twilio, URL stored in `profiles.recordingUrl`
5. Twilio transcribes the recording; auto-mod checks run on completion

### IVR Variants

Two IVR files are included:

| File | Description |
|---|---|
| `server/ivr-default.ts` | Full IVR with mailboxes, personal ads, all features |
| `server/ivr-no-mailbox.ts` | Same as above but with the mailbox/personal-ads menu option permanently removed |

Switch by setting `IVR_FILE=./ivr-no-mailbox` in `.env`.

### Complete TwiML Route List

| Route | Description |
|---|---|
| `/voice` | Call entry — identifies caller, starts session |
| `/voice/entry-check` | Bans, recording rejections, redirect to main menu |
| `/voice/main-menu` | Main keypad menu |
| `/voice/go-live` | Caller announces presence; counted as "on the line" |
| `/voice/browse-profiles` | Plays next profile in queue |
| `/voice/next-profile` | Advances profile queue |
| `/voice/skip-profile` | Skips current profile |
| `/voice/handle-flag` | Processes a flag report |
| `/voice/handle-block` | Processes a block action |
| `/voice/record-name` | Records caller's name |
| `/voice/save-name` | Saves name recording |
| `/voice/record-greeting` | Records greeting audio |
| `/voice/save-profile` | Saves full profile |
| `/voice/send-message` | Prompts to record a message |
| `/voice/save-message` | Saves the recorded message |
| `/voice/my-mailbox` | Mailbox main menu |
| `/voice/listen-messages` | Plays received messages |
| `/voice/record-mailbox-greeting` | Records personal ad |
| `/voice/save-mailbox-greeting` | Saves personal ad |
| `/voice/nearby-callers-offer` | Offers to switch to linked region |
| `/voice/handle-nearby-callers` | Handles linked-region choice |
| `/voice/live-connect-wait` | Holding loop for initiator waiting for answer |
| `/voice/handle-live-invite` | Plays invite to invitee |
| `/voice/live-connect-join` | Bridges both callers into Twilio Conference |
| `/voice/live-connect-complete` | Cleanup on conference end |
| `/voice/membership-info` | Reads balance and plan info |
| `/voice/membership-purchase` | IVR Stripe card payment flow |
| `/voice/membership-number-entry` | Cross-phone auth: enter member number |
| `/voice/membership-pin-entry` | Cross-phone auth: enter PIN |
| `/voice/set-pin` | PIN setup flow |
| `/voice/handle-set-pin` | First PIN entry handler |
| `/voice/handle-confirm-pin` | PIN confirmation handler |
| `/voice/redeem-promo` | Promo code keypad entry |
| `/voice/recording-rejected-unclear` | Rejection message + re-record prompt |
| `/voice/recording-rejected-phone-number` | Rejection message + re-record prompt |
| `/voice/transcription-callback` | Twilio transcription webhook |
| `/voice/status` | Twilio call status webhook (cleanup on hangup) |

---

## 10. Admin Panel Reference

Access the admin panel at `/admin`. The first visit prompts for a PIN (set in `server/authRoutes.ts` or as a session cookie).

### Dashboard Tab
- Live caller count (on the line right now)
- Total callers (registered phone numbers)
- Total profiles (recorded greetings)
- Total messages sent
- Active calls list with caller phone, region, join time, and remaining minutes

### Voice Profiles Tab
- List all profiles with playback, transcription, and category badge
- Upload new profile (audio file) — assigns to selected region and category
- Delete profile
- View auto-transcription text
- Filter by category (MM/MW/All)

### Regions Tab
- Create region (name, slug, phone number, timezone, capacity, linked region)
- Edit region (including changing the linked nearby region)
- Activate/deactivate region
- Region cards show caller count, linked region badge

### Callers Tab
- Search by phone number
- Caller detail view: plan, minutes, member number, PIN status, profile recording, messages, account status
- Credit/deduct minutes
- Ban, Restrict, or Restore account status
- Set or clear membership PIN
- View moderation history for this caller

### Messages Tab
- List all voice messages with from/to phones
- Listen to message audio
- Delete messages
- Relay a message (re-send to a different recipient)

### Flagged Content Tab
- Queue of profiles and messages flagged by callers or auto-mod
- Listen to audio
- Approve (keep) or Remove (delete from system)

### Memberships Tab
- Set plan 1/2/3 names, minutes, and prices
- Set billing mode (per_minute or per_day)
- Set free trial minutes
- Configure bonus double-minutes plan
- Toggle Free Mode and scheduled free days
- PayPal setup (business email, sandbox toggle, IPN URL display)

### Membership Cards Tab
- Issue numbered membership cards (for physical card programs)
- Add notes to cards
- Delete cards

### Phone Numbers Tab
- Per-number analytics: total calls, unique callers, duration by month/year
- Useful for billing Twilio numbers and auditing traffic

### Blocked Numbers Tab
- View and delete block relationships between callers

### Promo Codes Tab
- Create promo codes (value in minutes, optional expiry and max uses)
- Enable/disable codes
- View redemption history per code

### Zip Codes Tab
- Browse the ZIP code database
- Edit latitude, longitude, city, state, neighborhood
- Assign audio file to a ZIP for neighborhood announcements

### Announcements Tab
- Four independent MOTD slots:
  1. **Entry** — plays after the welcome/disclaimer
  2. **Main Menu** — plays at the top of the main menu
  3. **Male Box** — plays when entering the phone booth / browse section
  4. **Post-Purchase** — plays immediately after a successful membership purchase
- Each slot has an enable toggle and a text field (TTS-generated on the fly)

### Analytics Tab
- Funnel chart: total callers → with profile → with message → with membership
- Peak hours bar chart (calls by hour of day)
- Peak days bar chart (calls by day of week)
- Retention breakdown (one-time, occasional, regular)
- Revenue summary (count per plan, estimated MRR)

### Audit Log Tab
- Full, chronological log of every admin action with timestamp, action type, and target

### Moderation Log Tab
- All auto-moderation events: flag escalations, account restrictions, recording rejections

### Phone Testing Tab
- Full IVR simulator running in the browser
- Simulates a caller dialing in, navigating menus, and recording greettings
- Useful for QA without needing a real phone

### IVR Flow Map Tab
- Visual diagram of the complete call tree
- Shows all routes, decision branches, and connections

### Audio Gen Tab
See Section 21 (Audio Generation).

### SMS Marketing Tab
See Section 19 (SMS Marketing).

### Website Settings Tab
- Site name
- Fallback phone number (shown when no region-specific number applies; also used as the SMS sender)
- Customer service email
- Customer service phone
- Site category (MM / MW)

---

## 11. Payment Systems

### Stripe (Web Checkout)

Callers purchase membership from the web at `/membership`.

**Flow:**
1. User clicks "Pay with Card"
2. Frontend calls `POST /api/stripe/create-web-checkout` with `{ planKey, successUrl, cancelUrl }`
3. Backend creates a Stripe Checkout Session (hosted by Stripe) and returns the URL
4. User completes payment on Stripe's hosted page
5. Stripe sends webhook event `checkout.session.completed` to `/api/stripe/webhook`
6. `webhookHandlers.ts` verifies the signature, looks up the linked phone user, and calls `storage.updateUserMembership()`
7. User is redirected to `/membership/success?method=stripe&session_id=xxx`
8. Frontend verifies the session via `GET /api/stripe/verify-checkout/:sessionId`

**Initial Stripe Product Seed:**
```bash
npx tsx scripts/seed-membership.ts
```
This creates Bronze, Silver, and Gold Price objects in Stripe matching the plan settings in the database.

### Stripe (IVR Card Entry)

Callers can purchase membership by entering their credit card on the phone keypad.

**Flow (from main menu → Press 4):**
1. IVR reads plan names and prices
2. Caller selects a plan (press 1, 2, or 3)
3. IVR collects 16-digit card number via `<Gather numDigits="16">`
4. IVR collects expiry MMYY (4 digits)
5. IVR collects CVV (3 digits)
6. Server calls Stripe API to create a PaymentIntent and confirm with raw card data
7. On success: credits minutes, plays confirmation
8. On failure: plays error message, returns to menu

### PayPal Standard (Web)

An alternative payment path shown alongside the Stripe button when a PayPal Business email is configured in Admin → Memberships.

**Flow:**
1. User clicks "Pay with PayPal"
2. Frontend calls `POST /api/paypal/create-web-checkout` with `{ planKey }`
3. Server builds a PayPal Standard button URL encoding `webUserId|planKey|linkedPhone|planMinutes|planName` in base64 in the `custom` field
4. User pays on PayPal
5. PayPal sends IPN to `POST /api/paypal/ipn`
6. Server verifies IPN authenticity against `ipnpb.paypal.com` (or sandbox)
7. On `payment_status=Completed`, decodes `custom` field and credits minutes
8. User lands on `/membership/success?method=paypal` (activation follows async IPN delivery)

**IPN Configuration:**  
In your PayPal Business account → Account Settings → Notifications → Instant Payment Notifications, set the IPN URL to:
```
https://yourdomain.com/api/paypal/ipn
```

---

## 12. Web Layer (Public Site)

All pages are MM/MW-aware — copy and imagery adjust automatically based on the `siteCategory` setting.

| URL | Page | Description |
|---|---|---|
| `/` | Landing | Marketing homepage with call-to-action |
| `/membership` | Membership | Plan cards with Stripe and PayPal purchase buttons |
| `/membership/success` | Purchase Confirmation | Success page (Stripe instant / PayPal async) |
| `/register` | Register | Create web account |
| `/login` | Login | Web account login |
| `/forgot-password` | Forgot Password | Password reset request |
| `/reset-password` | Reset Password | Token-based password reset |
| `/dashboard` | Member Dashboard | Link phone number, view plan details |
| `/faq` | FAQ | Frequently asked questions |
| `/cities` | Cities | Live list of active regions with dial buttons |
| `/keypad-tips` | Keypad Tips | Interactive guide to IVR keypad commands |
| `/support` | Support | Customer support contacts and topic links |
| `/about` | About | About the service |
| `/safety-tips` | Safety Tips | Safety guidelines |
| `/privacy-policy` | Privacy Policy | Full privacy policy |
| `/terms` | Terms of Use | Full terms of use |
| `/admin` | Admin Dashboard | Operator control panel |
| `/setup` | Setup Page | Twilio config status and system health |

---

## 13. Membership & Billing

### Plans

Three fully configurable plans (plan1, plan2, plan3) set in Admin → Memberships:
- Name (e.g. "Gold", "Silver", "Bronze")
- Minutes (e.g. 1440 = 24 hours)
- Price in cents (e.g. 2999 = $29.99)

### Billing Modes

**Per-Minute:** Time is deducted from `remainingSeconds` during active calls. The IVR checks balance before browsing and during live connects.

**Per-Day:** Time is deducted in fixed increments (1 day = 1 plan unit) by a nightly cron job at 23:59 server time. A 24-hour grace period applies from the moment of first activation (`membershipStartedAt`).

### Free Trial

New callers receive `freeTrialMinutes` (default: 90) automatically on their first call. Configurable in Admin → Memberships.

### Bonus Double Minutes

Set `bonusPlanKey` to `plan1`, `plan2`, or `plan3` to give first-time buyers double the normal minutes for that plan.

### Free Mode

When **Free Mode** is enabled in Admin → Memberships:
- All billing and trial balance checks are bypassed
- Every caller has unlimited access
- Useful for promotional periods

**Scheduled Free Days:** Select days of the week (Sunday–Saturday) for automatic free mode activation. Free Mode (manual override) takes priority over the schedule.

---

## 14. Live 1-on-1 Connect

Callers browsing profiles can press **3** to request a private two-way voice call with the current profile's caller.

### Pre-flight Checks

All six conditions must pass for the invite to be sent:

1. Initiator has ≥ 5 minutes remaining (or free mode)
2. Target profile is a real caller (not admin-uploaded, not virtual)
3. Target is currently on the line (has an active call record)
4. Target has ≥ 5 minutes remaining (or free mode)
5. Target is not already bridged in another live connection
6. Target has not blocked the initiator

### Call Flow

**Initiator side:**
- Hears disclaimer audio (`live_connect_disclaimer.mp3`)
- Placed in waiting loop (`live_connect_wait`) — hears hold music (`live_connect_ringing.mp3`)
- After 15 seconds with no answer: hears failure message, returns to phone booth
- On acceptance: both callers are bridged into a Twilio Conference room

**Invitee side:**
- When they press 2 (next profile), the pending invite is checked first
- Hears chime (`live_connect_chime.mp3`) + invite announcement with the initiator's name
- Options:
  - Press 1 → Accept (join conference)
  - Press 2 → Decline (continues browsing)
  - Press 3 → Hear initiator's greeting first

**In conference:**
- Either caller can press `#` or hang up to exit
- Conference ends when either caller hangs up

### Audio Files (Optional — TTS Fallbacks Included)

| File | Description |
|---|---|
| `live_connect_disclaimer.mp3` | Brief respect reminder to initiator |
| `live_connect_chime.mp3` | Alert tone before invite announcement |
| `live_invite_options.mp3` | "Press 1 accept, Press 2 decline, Press 3 hear greeting" |
| `live_connect_ringing.mp3` | ~15 s hold music / ringing sound |
| `live_connect_connecting.mp3` | "Connecting you now… press pound to exit" |
| `live_connect_failed.mp3` | "Unable to connect. Returning to phone booth." |
| `live_connect_ended.mp3` | "Your live connection has ended." |
| `live_connect_busy.mp3` | "That caller is already connected with someone else." |
| `live_connect_left_line.mp3` | "That caller has left the line." |
| `live_connect_no_minutes.mp3` | "You need at least 5 minutes remaining…" |
| `live_invite_expired.mp3` | "That invitation has expired." |

---

## 15. Linked Regions (Cross-Region Overflow)

Regions can be linked together so callers overflow into a nearby region's pool after hearing all local callers.

### How It Works

1. Admin sets a **Linked Nearby Region** on each region (via Regions tab)
2. Caller hears their local region's profiles
3. When the last local profile plays and the queue wraps, instead of looping the IVR routes to `/voice/nearby-callers-offer`
4. The offer plays: *"You've heard all callers in your area. Press 1 to hear callers from [Linked Region]. Press 2 to start over."*
5. **Press 1:** Linked region's active profiles replace the queue; caller continues browsing seamlessly
6. **Press 2 / timeout:** Queue resets to local region, starts over
7. The offer is not repeated again for the same call session (`linkedRegionLoaded = true`)

### Regional New-Caller Alerts

When a new caller joins while someone is browsing:
- **Same region as the listener:** Plays `new_caller_closest_to_you.mp3`
- **Different region (linked):** Plays TTS: *"New caller from [City Name]"*

New callers are silently spliced into the queue at the listener's current position so the announcement plays naturally before the new greeting.

### Multi-Region Links

The `region_links` table supports a many-to-many chain. The dynamic linked-region offer menu generates numbered options (Press 1 for Boston, Press 2 for Providence, etc., up to 3 regions) with "start over" as the last digit.

### Audio Files

| File | Description |
|---|---|
| `nearby_callers_offer.mp3` | Intro text: "You have heard all the callers close to you." (Options are TTS-appended dynamically) |
| `nearby_callers_intro.mp3` | "Now playing callers from [Region Name]. Enjoy!" |
| `nearby_callers_none.mp3` | "No callers online in that area. Starting over." |

---

## 16. Regional Greeting Queue

This chapter describes exactly how the system selects, orders, and plays voice profile greetings to a caller who enters the browse section.

### Queue Built Once at Entry

When a caller enters the browse section for the first time in a call session, the system builds a personalized queue and stores it in memory (keyed by Twilio `CallSid`). It does not pick a random greeting on each step — the full list is assembled upfront, then played through sequentially.

**Queue build steps:**

1. Fetch all currently active profiles from the `active_calls` and `profiles` tables for the caller's region
2. Filter by gender in MW mode (callers only hear the opposite gender)
3. Remove any profiles from callers the listener has blocked, or who have blocked the listener
4. Include both real callers and virtual (simulator) callers — they appear identically
5. Order the entire list using `ORDER BY RANDOM()` at the database level, so every caller gets a unique shuffled sequence
6. Snapshot nearby linked-region user IDs for later new-caller detection

The resulting ordered list is stored in `CallerBrowseState` alongside a current `index`, a `hasWrapped` flag, and announcement throttle counters.

### Playback Advances Sequentially

Each time the caller finishes hearing a greeting (or presses a key to skip), the system increments the index:

```
state.index = (state.index + 1) % state.queue.length
```

When the index wraps back to 0 (all profiles have been heard once), `state.hasWrapped` is set to `true`. At that point, the system redirects to the linked-region overflow offer instead of looping indefinitely (see Section 15).

### What Plays for Each Greeting Slot

Each slot is delivered inside a Twilio `<Gather>` block so the caller can press a key at any point to skip or interact. The sequence within a single slot is:

| Step | Content | Condition |
|---|---|---|
| 1 | "New caller closest to you" or "New caller from [City]" | Random — see Origin Announcement Throttling below |
| 2 | Caller's recorded name | Only if `nameRecordingUrl` is set |
| 3 | Caller's main greeting recording | Always present (null profiles are filtered out before queue build) |
| 4 | Options prompt (`profile_options.mp3`) | Always plays — "Press 1 to send a message, Press 2 to connect live…" |

If a `<Play>` URL returns an error (e.g. a Twilio recording that was deleted), the audio proxy at `/audio/:sid` returns a 1-second silent WAV with HTTP 200 so the call is never dropped.

### Origin Announcement Throttling

To keep the browse experience natural, the "New caller closest to you" / "New caller from [City]" interjections are injected randomly rather than on a fixed schedule.

**Rules:**
- Maximum **5 injections per 25-greeting window**
- Injections are placed at **completely random positions** within the window — no fixed interval
- The probability for each slot is calculated as:

```
probability = remaining_budget / remaining_slots_in_window
```

For example: at the start of a window with budget 5 and 25 slots remaining, each slot has a 20% chance. If 2 fire early, by slot 15 the remaining probability adjusts so the budget is still likely consumed naturally by the end of the window.

- At the boundary of each 25-greeting window, the window budget resets to 5
- In `ivr-no-mailbox.ts`, the injection only fires for nearby callers (`profile.isNearby === true`); in `ivr-default.ts`, it fires for any profile, using the region comparison to choose "closest to you" vs. "from [City]"

**State fields tracked per session:**

| Field | Purpose |
|---|---|
| `greetingsPlayed` | Total greetings played in this browse session |
| `windowAnnouncementsUsed` | How many injections have fired in the current 25-greeting window |

### Live Injection of New Callers

The queue is a snapshot of who was active when the caller entered browse. New callers who join *after* the queue was built are detected in real time on each queue advance step.

**Detection:** The system compares the live `active_calls` table against `state.localUserIds` (the set of user IDs in the original snapshot). Any user ID present in the live table but not in the snapshot is considered "new."

**Handling:** For each newly detected caller:
- With 10% probability (`NEW_CALLER_ANNOUNCE_PROBABILITY = 0.1`): immediately interrupt the current position with a spoken "New caller closest to you" alert, then play their greeting next
- Otherwise: silently splice their profile into the queue at the current index so their greeting plays naturally in the upcoming sequence without an explicit announcement

**Linked-region new callers** (callers from linked nearby regions) are tracked separately in `state.announcedLinkedCallerIds` and use the same splice-or-announce logic.

### Multi-Region Expansion

Once `state.hasWrapped` is `true` (all local profiles heard), the caller is offered linked regions:

- The system reads from `region_links` to find available nearby regions
- Up to 3 regions are listed as numbered options ("Press 1 for Boston, Press 2 for Providence…")
- On selection, profiles from that region are loaded into the queue and playback continues
- "Press the last digit to start over" restarts the local queue from a fresh shuffle

Caller count announcements ("There are N callers on the line") always aggregate the local region plus all currently linked regions to show an accurate total.

---

## 17. Membership PIN (Cross-Phone Access)

Members can call in from **any phone** by entering their 5-digit member number and 4-digit PIN.

### Setting a PIN

1. Call from registered phone
2. Main Menu → Press 8 (Manage Membership)
3. Press 2 (Set/Change PIN)
4. Enter a 4-digit PIN
5. Confirm by entering the same PIN again

### Using Cross-Phone Access

1. Call in from any phone
2. IVR prompts: "Enter your 5-digit member number"
3. IVR prompts: "Enter your 4-digit PIN"
4. On match: session continues as that member's phone account
5. On failure: 3 attempts before hangup

### Admin PIN Management

From Callers tab → Caller Detail → Access PIN Management:
- View PIN status (masked as ••••)
- Set a specific PIN for the caller
- Clear the PIN (forces them to re-set via IVR)

---

## 18. Auto-Moderation System

The auto-moderation engine (`server/autoModeration.ts`) runs asynchronously after flag/block events and recording transcriptions.

### Flag & Block Rules

| Rule | Trigger | Action |
|---|---|---|
| Flag Threshold | 3+ distinct callers flag the same content | Auto-escalate to admin queue |
| Block Count | 3+ distinct callers block the same user within 24 h | Auto-flag their profile |
| Repeat Flagging | Content removed before, flagged again (2+ prior removals) | Auto-remove + restrict user |
| New Account Flag | Account flagged within 10 min of creation | Auto-restrict user |
| Auto-Remove Threshold | 5+ unique flaggers | Auto-remove content; 2nd auto-remove = ban |

### Recording Auto-Moderation (Transcription Checks)

Every greeting and personal ad recording is automatically transcribed by Twilio. Three checks run on every transcription:

**Check 1 — No Audio / Blank:**
- Transcription is null, empty, or whitespace only
- Rejection reason: `unclear`

**Check 2 — Phone Number Detected:**
- Standard formats: `303-430-2099`, `(303) 430-2099`, `303.430.2099`
- Compact: `3034302099`
- Filler-bridged: `303 uh 430 2099`
- Spoken digits: "three zero three four three zero two zero nine nine"
- False-positive protection: normal descriptions like "I'm 25, 6 foot 2" do NOT trigger
- Rejection reason: `phone_number`

**Check 3 — Low Quality / Repetition:**
- Fewer than 4 total words
- A non-common word repeats 3+ times (e.g. "hey hey hey")
- More than 80% of content words are the same single word
- Rejection reason: `unclear`

### On Rejection

1. Recording is deleted
2. `recordingRejectionReason` and `recordingRejectionType` set on the user record
3. Moderation event written to `moderation_logs`
4. Caller intercepted on next call-in and directed to re-record

### Rejection IVR Experience

**Unclear recording:**
> "You need to re-record your greeting because we can't understand it. Please speak clearly…"

**Phone number detected:**
> "Please do not include your phone number in your greeting or it will not be approved."

Both menus offer Press 1 to immediately re-record, which clears the rejection flag.

---

## 19. SMS Marketing

Two monthly SMS templates can be configured and scheduled from Admin → SMS Marketing.

### Templates

Each template has:
- **Label** — internal name (not sent to callers)
- **Message** — SMS body text (character count and segment count shown live)
- **Send Day** — day of month (1–30) to auto-send; blank = not scheduled
- **Active toggle** — must be ON for the scheduler to send automatically

### Scheduling Rules

1. Send days must be between 1 and 30
2. Both templates must have send days at least **10 days apart** on a circular 30-day calendar
   - Example: day 5 and day 25 are 20 days apart (valid)
   - Example: day 28 and day 2 are 4 days apart circularly (invalid)
3. Once a template has been sent at least once, its **send day is permanently locked** — the day cannot be changed after the first send

### Automated Scheduler

The scheduler fires daily at **10:00 AM server time**.

- Checks if any active template has a `sendDay` matching today's day-of-month
- Skips if the template was already sent today (same calendar date check)
- Sends to all real (non-virtual) phone numbers in the database
- Records `lastSentAt` and `lastSentCount` after each dispatch
- A 50 ms delay between sends keeps Twilio within rate limits

### Manual Send

Each template card in the admin panel has a **Send Now** button that immediately dispatches to all real phone numbers, regardless of the scheduled day. Useful for one-off campaigns or testing.

### SMS Sender Number

SMS messages are sent from the **fallback phone number** configured in Admin → Website Settings. Ensure this number has SMS capability enabled in your Twilio account.

### Recipients

Only real caller phone numbers are targeted — virtual callers (whose phone numbers start with `VIRTUAL-`) are always excluded.

---

## 20. Virtual Caller Simulator

The simulator (`server/simulator.ts`) creates fake callers that populate the browse queue, making the system feel active even when real caller volume is low.

### How It Works

- Admin uploads audio files in the **Voice Profiles tab** (selecting a region and category)
- Each upload creates a `VIRTUAL-<uuid>` user and a profile record
- The simulator runs background loops that move virtual callers in and out of the `active_calls` table on a random schedule
- Virtual callers appear in the queue just like real callers

### Virtual Caller Rules

- Virtual callers cannot be live-connected (pre-flight check blocks them)
- Virtual callers are excluded from SMS sends
- Virtual callers are not counted toward real-user analytics
- Admin can delete virtual caller sessions from the Voice Profiles tab

### Seed Sessions

Each batch of uploaded virtual profiles is tracked as a `seed_session`. The simulator reads seed sessions from the database and maintains the appropriate number of virtual callers "on the line" at all times.

---

## 21. Audio Generation (ElevenLabs TTS)

The Admin → Audio Gen tab provides a full TTS studio for generating the IVR audio files.

### Category Folder Selection

Before generating, choose a target folder:

| Folder | Path | Used When |
|---|---|---|
| Shared | `uploads/` | Default for both MM and MW |
| MM | `uploads/mm/` | Overrides shared when Site Category = MM |
| MW | `uploads/mw/` | Overrides shared when Site Category = MW |

The IVR automatically checks the category folder first and falls back to the shared folder.

### TTS Preview

Click the play button next to any text field to hear a live preview. The audio is generated and streamed to the browser — nothing is written to disk. Useful for audition before committing.

### Generate All

The **Generate All** button processes every system prompt in sequence:
1. Uses any custom text saved in Admin → Audio Gen (overrides default script text)
2. Generates and saves one file at a time
3. Shows a live progress bar
4. A **Cancel** button (shown during generation) stops after the current file completes

### Custom Audio File

Enter a filename (without `.mp3`) and custom text to generate a one-off file saved to the selected folder.

### System Prompts

System prompt scripts are editable in the Admin → Audio Gen tab. Edited text is saved to the `system_prompt_overrides` database table and used both for TTS generation and as live TTS fallbacks in the IVR.

---

## 22. Free Mode & Scheduled Free Days

### Free Mode (Manual)

Toggle in Admin → Memberships. When ON:
- All IVR balance checks are bypassed
- All callers have unlimited access
- No minutes are deducted
- Ideal for promotional events or testing

### Scheduled Free Days

Select one or more days of the week (Sunday through Saturday) in Admin → Memberships. On those days:
- Free mode activates automatically at midnight server time
- Deactivates at the end of the day
- Manual Free Mode override takes priority (forces free mode every day if ON)

---

## 23. Announcements / MOTD

Four independent announcement slots let operators broadcast messages to callers at key points in the call flow.

| Slot | Trigger Point |
|---|---|
| **Entry** | After welcome/disclaimer, before membership/main menu prompt |
| **Main Menu** | At the top of the main menu (after balance announcement) |
| **Male Box** | When caller enters the browse/phone booth section |
| **Post-Purchase** | Immediately after a successful membership purchase over the phone |

Each slot is independently toggled and has its own text field. Text is read via real-time ElevenLabs TTS when the announcement plays.

---

## 24. Promo Codes

Promotional codes give callers free minutes when redeemed via IVR or the web dashboard.

### Creating a Code

In Admin → Promo Codes:
- Enter a unique alphanumeric code
- Set the minute value
- Optionally set a maximum use count and expiry date
- Codes are active by default; deactivate to block redemption without deleting

### IVR Redemption

1. Caller at main menu → Press 5 (Redeem Promo Code)
2. IVR reads out the code character by character using keypad digits
3. Caller enters their code
4. System validates and credits minutes immediately

### Web Redemption

Logged-in web users with a linked phone can enter a promo code from the Dashboard.

---

## 25. SEO & Public Pages

The server includes `server/seoPageGenerator.ts` which generates region-specific SEO landing pages based on active region data. These pages target search queries like "gay chat line Boston" or "men chat line Providence."

The `SiteLayout.tsx` component provides:
- Consistent navigation header with links to Membership, FAQ, Cities, etc.
- Footer with legal links (Privacy Policy, Terms of Use)
- Dynamic page title and meta description per page
- Open Graph tags for social media sharing

---

## 26. API Reference

### Authentication

All `/api/admin/*` routes require an active admin session (set by the admin login PIN flow).

### Site Settings

| Method | Route | Description |
|---|---|---|
| GET | `/api/site-settings` | Fetch public site settings |
| PUT | `/api/admin/site-settings` | Update site settings |

### Regions

| Method | Route | Description |
|---|---|---|
| GET | `/api/regions` | All active regions (public) |
| GET | `/api/admin/regions` | All regions including inactive |
| POST | `/api/admin/regions` | Create region |
| PATCH | `/api/admin/regions/:id` | Update region |
| DELETE | `/api/admin/regions/:id` | Delete region |

### Users / Callers

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/callers` | Paginated caller list |
| GET | `/api/admin/callers/:id` | Caller detail |
| POST | `/api/admin/callers/:id/credit` | Add minutes |
| POST | `/api/admin/callers/:id/deduct` | Remove minutes |
| PATCH | `/api/admin/users/:id/account-status` | Set `active`/`restricted`/`banned` |
| PATCH | `/api/admin/callers/:id/pin` | Set or clear membership PIN |

### Profiles

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/profiles` | All profiles |
| DELETE | `/api/admin/profiles/:id` | Delete profile |
| POST | `/api/admin/profiles/upload` | Upload audio file as virtual profile |

### Messages

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/messages` | All messages |
| DELETE | `/api/admin/messages/:id` | Delete message |

### Memberships

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/membership-settings` | Fetch settings |
| PUT | `/api/admin/membership-settings` | Update settings |

### Stripe

| Method | Route | Description |
|---|---|---|
| POST | `/api/stripe/create-web-checkout` | Create Stripe Checkout Session |
| GET | `/api/stripe/verify-checkout/:sessionId` | Verify and apply a completed checkout |
| POST | `/api/stripe/webhook` | Stripe webhook receiver |

### PayPal

| Method | Route | Description |
|---|---|---|
| POST | `/api/paypal/create-web-checkout` | Build PayPal Standard URL |
| POST | `/api/paypal/ipn` | PayPal IPN receiver |

### Promo Codes

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/promo-codes` | List all codes |
| POST | `/api/admin/promo-codes` | Create code |
| PATCH | `/api/admin/promo-codes/:id` | Update code (toggle active, etc.) |
| DELETE | `/api/admin/promo-codes/:id` | Delete code |

### SMS Marketing

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/sms-templates` | Fetch both templates |
| PUT | `/api/admin/sms-templates/:id` | Update template (1 or 2) |
| POST | `/api/admin/sms-templates/:id/send-now` | Immediately dispatch template |

### Analytics & Logs

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/analytics` | Funnel, peak hours, revenue |
| GET | `/api/admin/audit-logs` | Last 300 admin actions |
| GET | `/api/admin/moderation-logs` | Auto-mod event history |
| GET | `/api/admin/phone-stats` | Per-number call stats by month/year |

### TTS / Audio

| Method | Route | Description |
|---|---|---|
| POST | `/api/admin/tts/preview` | Stream preview audio (not saved) |
| POST | `/api/admin/tts/generate` | Generate and save audio file |
| GET | `/api/admin/tts/prompts` | List all audio files |
| DELETE | `/api/admin/tts/prompts/:filename` | Delete audio file |

### IVR Tester

| Method | Route | Description |
|---|---|---|
| POST | `/api/ivr-tester/call` | Start a simulated IVR call session |
| POST | `/api/ivr-tester/keypress` | Send a keypress to a simulated session |

---

## 27. Deployment Guide

### Production Build

```bash
npm run build
npm start
```

The build compiles the Express backend to `dist/index.cjs` and the React frontend to `dist/public/`. The Express server serves the frontend statically in production.

### Environment

- Set `NODE_ENV=production`
- Use a strong, random `SESSION_SECRET`
- Use `DATABASE_URL` pointing to a managed PostgreSQL instance (e.g. Neon, Supabase, RDS)
- Point your domain to the server and configure TLS (HTTPS is required for Twilio webhooks and Stripe)

### Twilio Webhook URLs

After deploying, update each Twilio phone number:
- **Voice webhook:** `https://yourdomain.com/voice` (HTTP POST)
- **Status callback:** `https://yourdomain.com/voice/status` (HTTP POST)

### Stripe Webhook

Update the Stripe Dashboard webhook to point to:
```
https://yourdomain.com/api/stripe/webhook
```

### PayPal IPN

If using PayPal, set:
```
https://yourdomain.com/api/paypal/ipn
```

### Reverse Proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Process Management (PM2)

```bash
npm install -g pm2
pm run build
pm2 start dist/index.cjs --name male-box
pm2 save
pm2 startup
```

---

## 28. Customization Guide

### Changing the Site Name

Admin → Website Settings → Site Name

### Switching MM ↔ MW Mode

Admin → Website Settings → Site Category

This changes:
- IVR gender-select step (MW only)
- Audio file folder selection (`uploads/mm/` or `uploads/mw/`)
- Public page copy and imagery
- Profile category badges in admin

### Swapping the IVR Script

Set `IVR_FILE=./ivr-no-mailbox` in `.env` to permanently remove the mailbox/personal-ads menu option from the call flow.

To write a completely custom IVR, create a new file at `server/ivr-custom.ts` that exports:
```typescript
export function registerVoiceRoutes(app: Express): void {
  // your TwiML routes here
}
```
Then set `IVR_FILE=./ivr-custom`.

### Changing Membership Plans

Admin → Memberships → edit plan names, minutes, and prices. After changing prices, re-run:
```bash
npx tsx scripts/seed-membership.ts
```
to update the corresponding Stripe products/prices.

### Adjusting Free Trial Minutes

Admin → Memberships → Free Trial Minutes.

### Adding a New Region (Phone Market)

1. Admin → Regions → Create Region
2. Enter name, slug, phone number, timezone
3. In Twilio Console, purchase or assign a number
4. Set that number's Voice webhook to `https://yourdomain.com/voice`
5. Optionally link it to a nearby region for overflow

### Customizing IVR Audio

1. Open Admin → Audio Gen
2. Select the target category folder (Shared, MM, or MW)
3. Edit the prompt text for any system prompt
4. Click **Generate** or **Generate All**

Alternatively, upload your own pre-recorded MP3 files directly to `uploads/` (or `uploads/mm/` / `uploads/mw/`).

### Branding the Web UI

The public site uses TailwindCSS with a custom color palette defined in `client/src/index.css`. Edit the CSS custom properties in the `:root` block to change the primary brand color throughout the entire site.

---

## 29. Security Notes

| Topic | Status / Recommendation |
|---|---|
| Admin access | PIN-gated route with session cookie. Consider adding IP allowlist in production |
| Session secret | Must be a long (64+ character) random string. Never use the default value |
| Twilio request validation | Twilio signatures are validated on all `/voice/*` routes |
| Stripe webhook signature | Verified via `stripe.webhooks.constructEvent()` using `STRIPE_WEBHOOK_SECRET` |
| PayPal IPN verification | Verified against PayPal's IPN verification endpoint before processing |
| Password hashing | bcryptjs with default cost factor (10 rounds) |
| SQL injection | All queries use Drizzle ORM parameterized queries — no raw string interpolation in user paths |
| Recording transcription | Twilio transcription callbacks are accepted from any IP. Consider validating the `X-Twilio-Signature` header |
| IVR card data | Credit card digits are collected via Twilio `<Gather>` and never logged. Stripe Idempotency key prevents double-charges |
| In-memory idempotency | `processedCheckoutSessions` (Stripe) and `processedIpnTxns` (PayPal) are in-memory Sets and reset on server restart. For high-reliability production, consider persisting processed IDs to the database |
| Rate limiting | No rate limiting is applied to auth endpoints in the current codebase. Consider adding `express-rate-limit` to `/api/auth/*` routes |
| HTTPS | Required for Twilio webhooks and Stripe. Always deploy behind TLS |

---

## 30. Frequently Asked Questions

**Q: Can I run multiple regions from one deployment?**  
Yes. Create as many regions as needed in the admin panel, each with its own Twilio phone number. All regions share the same database and server.

**Q: What happens when a caller runs out of minutes?**  
In per-minute mode, they are removed from active calls and hear a "your time has expired" message. They can purchase more time by pressing 4 from the main menu or through the web at `/membership`.

**Q: Can I use my own voice recordings instead of ElevenLabs TTS?**  
Yes. Upload MP3 files directly to `uploads/` (or `uploads/mm/` / `uploads/mw/`). The system checks for the presence of a file before falling back to TTS generation.

**Q: How do I remove a virtual caller profile?**  
In Admin → Voice Profiles, find the profile (it will be marked as admin-uploaded), and click Delete.

**Q: Can callers call from different phones with the same account?**  
Yes, via the Membership PIN feature. They enter their 5-digit member number and 4-digit PIN from any phone.

**Q: How does the regional browse queue work?**  
Callers hear only profiles associated with the region they dialed into. After hearing all local profiles, the system can offer to play profiles from a linked nearby region.

**Q: How do I configure PayPal?**  
In Admin → Memberships, enter your PayPal Business email in the PayPal Setup card. Then configure IPN in your PayPal account settings pointing to `https://yourdomain.com/api/paypal/ipn`.

**Q: Why do SMS templates have a locked send day after the first send?**  
This prevents unintentional schedule drift. Once a template has been dispatched, locking the day ensures consistent monthly delivery at predictable intervals.

**Q: How do I test the IVR without a real phone?**  
Use Admin → Phone Testing. It simulates a full call session in the browser, including keypad input.

**Q: What is the IVR_FILE environment variable?**  
It controls which IVR script runs. `./ivr-default` is the full-featured script. `./ivr-no-mailbox` is identical except the Mailbox/Personal Ads option is permanently removed from the main menu. You can also write a completely custom IVR script and point this variable at it.

---

*End of Documentation*
