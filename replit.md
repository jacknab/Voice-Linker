# Phone Booth — Adult Voice-Line IVR Chat Service

## Overview

A Twilio-powered voice party line where callers can record profiles, browse other callers' voice profiles, exchange voice messages, and purchase memberships via phone keypad IVR or the web. The web layer supports account creation, phone number linking, and a full membership purchase flow (Stripe + PayPal).

## Architecture

- **Frontend**: React + Vite + TailwindCSS + shadcn/ui (admin dashboard, public membership page, web auth)
- **Backend**: Express (TypeScript) + Drizzle ORM + PostgreSQL
- **Voice**: Twilio TwiML IVR system
- **Payments**: Stripe (web checkout + IVR card entry) + PayPal Standard (web checkout via IPN)

## Key Files

- `server/routes.ts` — All TwiML voice routes, IVR logic, web API routes (auth, membership, Stripe, PayPal)
- `server/storage.ts` — Database access layer
- `server/simulator.ts` — Virtual caller simulator
- `server/stripeClient.ts` — Stripe SDK client (uses `STRIPE_SECRET_KEY`)
- `server/webhookHandlers.ts` — Stripe webhook handler (`checkout.session.completed`, `payment_intent.succeeded`)
- `shared/schema.ts` — Drizzle ORM schema
- `scripts/seed-membership.ts` — Seeds Bronze/Silver/Gold products in Stripe
- `client/src/pages/Landing.tsx` — Public-facing customer marketing page (`/` route)
- `client/src/pages/Home.tsx` — System status & Twilio setup page (`/setup` route)
- `client/src/pages/Admin.tsx` — Full admin dashboard (`/admin` route)
- `client/src/pages/Membership.tsx` — Public web membership purchase page (`/membership` route)
- `client/src/pages/MembershipSuccess.tsx` — Post-purchase confirmation page (`/membership/success` route)
- `client/src/pages/Dashboard.tsx` — Logged-in web user dashboard (link phone, view plan)
- `client/src/pages/FAQ.tsx` — Frequently asked questions, MM/MW aware (`/faq`)
- `client/src/pages/KeypadTips.tsx` — Interactive keypad reference guide, 4 screen modes (`/keypad-tips`)
- `client/src/pages/Support.tsx` — Customer support contacts + common topic links (`/support`)
- `client/src/pages/Cities.tsx` — Live regions list from `/api/regions` with dial buttons (`/cities`)
- `client/src/pages/SafetyTips.tsx` — Safety guidelines, MM/MW aware (`/safety-tips`)
- `client/src/pages/About.tsx` — About the service, MM/MW aware (`/about`)
- `client/src/pages/PrivacyPolicy.tsx` — Full privacy policy (`/privacy-policy`)
- `client/src/pages/Terms.tsx` — Full terms of use (`/terms`)
- `client/src/components/SiteLayout.tsx` — Shared nav, footer, page header, and helpers used by all content pages

## Voice Menu Structure

```
/voice (entry)
  └─ /voice/main-menu
       ├─ Press 1 → Browse Profiles
       ├─ Press 2 → Re-record Profile
       └─ Press 4 → Info / Prices / Membership
            └─ Press 1 → Membership Questions
                 ├─ Press 1 → How membership works
                 ├─ Press 2 → Pricing
                 └─ Press 3 → Purchase with credit card (IVR Stripe payment)
                      ├─ Select package (1=Bronze $9.99, 2=Silver $19.99, 3=Gold $29.99)
                      ├─ Enter 16-digit card number
                      ├─ Enter expiry (MMYY)
                      └─ Enter CVV → charges card via Stripe API
```

## Environment Variables (.env)

The project uses a `.env` file for all credentials. `dotenv` is loaded at the very top of `server/index.ts` and `drizzle.config.ts` so it applies everywhere (including `npm run db:push`).

`.env` is git-ignored. Copy `.env.example` to `.env` and fill in values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Long random string for session signing |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info |
| `TWILIO_PHONE_NUMBER` | Twilio Console → Phone Numbers |
| `ELEVENLABS_API_KEY` | ElevenLabs → Profile → API Key |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID (default: `21m00Tcm4TlvDq8ikWAM`) |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks signing secret |

## Stripe Integration (Web)

- **NOTE**: The Replit native Stripe integration was dismissed by the user. Stripe is connected via the `STRIPE_SECRET_KEY` env var in `.env`.
- Do NOT attempt to use the Replit Stripe connector — use `STRIPE_SECRET_KEY` in `.env` instead.
- Web checkout: `POST /api/stripe/create-web-checkout` — creates a Stripe Checkout Session and returns the hosted URL
- Session verification: `GET /api/stripe/verify-checkout/:sessionId` — verifies session and applies plan credits to the linked phone user
- Webhook endpoint: `POST /api/stripe/webhook` — listens for `checkout.session.completed` and `payment_intent.succeeded`
- Stripe webhook URL to register: `https://<yourdomain>/api/stripe/webhook`
- IVR membership products (Bronze/Silver/Gold) are seeded via `npx tsx scripts/seed-membership.ts`
- In-memory idempotency guard: `processedCheckoutSessions` Set prevents double-crediting

## PayPal Integration (Web)

PayPal Standard is supported as an alternative payment method for web membership purchases. It is enabled by setting a PayPal business email in the Admin → Memberships tab.

### How it works

1. User clicks "Pay with PayPal" on `/membership`
2. Frontend calls `POST /api/paypal/create-web-checkout` with `{ planKey }`
3. Backend builds a PayPal Standard button URL (hosted payment page) encoding plan details in the `custom` field as base64: `webUserId|planKey|linkedPhone|planMinutes|planName`
4. User is redirected to PayPal to complete payment
5. PayPal sends an IPN POST to `POST /api/paypal/ipn`
6. Server verifies the IPN with PayPal's IPN validation endpoint (`ipnpb.paypal.com` or `ipnpb.sandbox.paypal.com`)
7. On `payment_status=Completed`, the custom field is decoded and credits are applied to the linked phone user via `storage.updateUserMembership`
8. User lands on `/membership/success?method=paypal` which shows a "Payment Received" confirmation (PayPal activation is async via IPN, not instant like Stripe)

### PayPal admin configuration

In Admin → Memberships tab, there is a "PayPal Setup" card with:
- **PayPal Business Email** — the email on the PayPal Business account (leave blank to disable PayPal on the purchase page)
- **Sandbox Mode toggle** — when ON, directs payments to `www.sandbox.paypal.com` and verifies IPNs against `ipnpb.sandbox.paypal.com`
- **IPN URL display** — copyable URL (`/api/paypal/ipn`) to configure in PayPal account settings

### PayPal IPN setup (in PayPal account)

1. Log in to PayPal Business account
2. Go to Account Settings → Notifications → Instant payment notifications
3. Enter the IPN URL: `https://<yourdomain>/api/paypal/ipn`
4. Set IPN messages to "Enabled"

### PayPal idempotency

In-memory Set `processedIpnTxns` prevents duplicate IPN deliveries from double-crediting the same transaction. This resets on server restart; for production persistence, consider storing processed `txn_id` values in the database.

## Web Membership Purchase Flow

The web layer provides a full self-service membership purchase flow for web users:

1. **Register / Log in** — web users authenticate at `/register` and `/login`; session stored in `req.session.webUserId`
2. **Link phone number** — user links their phone at `/dashboard`; required before purchasing (credits go to the phone-based `users` record)
3. **Choose plan** — `/membership` shows 3 dynamic plan cards (plan1/plan2/plan3 from `membershipSettings`)
   - "Pay with Card" button → Stripe Checkout
   - "Pay with PayPal" button → PayPal Standard (only shown when PayPal email is configured)
   - Un-authenticated or un-linked users see contextual warning banners instead of active buy buttons
4. **Post-purchase** — `/membership/success`
   - `?method=stripe&session_id=xxx` → verifies Stripe session and shows "Membership Activated!" with plan details
   - `?method=paypal` → shows "Payment Received!" with a note that activation follows via IPN (within minutes)

## Live 1-on-1 Connect Feature

When browsing profiles, callers can press **3** to request a live direct connection.

**Pre-flight checks (all must pass):**
1. Initiator has ≥ 5 minutes remaining
2. Target profile is not admin-uploaded or a virtual caller
3. Target is still on the line (has an active, non-virtual call)
4. Target has ≥ 5 minutes remaining
5. Target is not already in a live connection with someone else
6. Target has not blocked the initiator

**Call flow:**
- Initiator: plays disclaimer → `live-connect-wait` loop → "Calling [name] now" → plays `live_connect_ringing.mp3` (15s) → timeout if no answer
- Invitee: when they press 2 (next profile), sees the invite instead → chime + "This caller [name] would like to connect live" → press 1 accept / 2 decline / 3 hear greeting
- On accept: Twilio REST API redirects initiator mid-ring to join Twilio conference room; both hear "Connecting you now…"; either can press # or hang up to exit
- On timeout/decline: initiator hears failure message and returns to phone booth

**In-memory state (routes.ts):**
- `pendingLiveInvites` — targetUserId → invite (TTL 30s)
- `liveConnectionUserIds` — Set of userIds currently bridged
- `liveConnectionCallSidMap` — callSid → userId for hangup cleanup

**New routes:** `/voice/live-connect-wait`, `/voice/handle-live-invite`, `/voice/live-connect-join`, `/voice/live-connect-complete`

**Audio files to upload (optional, falls back to TTS):**
- `live_connect_disclaimer.mp3` — Brief respect reminder to initiator
- `live_connect_chime.mp3` — Alert chime played before invite announcement
- `live_invite_options.mp3` — "To accept press 1, to decline press 2, to hear greeting press 3"
- `live_connect_ringing.mp3` — ~15 second ringing/hold music
- `live_connect_connecting.mp3` — "Connecting you now... press pound to exit. Enjoy!"
- `live_connect_failed.mp3` — "Unable to connect. Returning to phone booth."
- `live_connect_ended.mp3` — "Your live connection has ended."
- `live_connect_unavailable.mp3` — Generic "not available" message
- `live_connect_busy.mp3` — "That caller is already connected with someone else."
- `live_connect_left_line.mp3` — "That caller has left the line."
- `live_connect_no_minutes.mp3` — "You need at least 5 minutes remaining..."
- `live_invite_expired.mp3` — "That invitation has expired."

## Linked Regions Feature

Regions can be linked together so callers overflow into a nearby region's caller pool once they've heard everyone in their own.

**How it works:**
- Each region has an optional `linkedRegionId` (another region's UUID)
- The caller's queue is built from their local region profiles only
- After they hear the last profile and the queue wraps back to the beginning (`hasWrapped = true`), instead of looping the system redirects to `/voice/nearby-callers-offer`
- The offer plays: "You've heard all the callers in your area. Press 1 to hear callers from [Linked Region Name]. Press 2 to start over."
- **Press 1**: The linked region's currently-active profiles are fetched and replace the queue; the caller continues browsing seamlessly
- **Press 2 / timeout**: Queue resets to index 0, local region restarts
- Once the offer has been made (`linkedRegionLoaded = true`), it is not triggered again for the rest of the call session

**Admin UI (Regions tab):**
- Edit/create region dialog has a "Linked Nearby Region" dropdown listing all other regions with their phone numbers
- Region cards show an amber "Linked: [Region Name]" badge when a link is configured

**IVR routes:** `/voice/nearby-callers-offer`, `/voice/handle-nearby-callers`

**Audio files (optional, TTS fallbacks included):**
- `nearby_callers_offer.mp3` — "You've heard all callers in your area. Press 1 for nearby, Press 2 to restart."
- `nearby_callers_intro.mp3` — "Now playing callers from [Region Name]. Enjoy!"
- `nearby_callers_none.mp3` — "No callers online in that area. Starting over."

## Membership PIN (Cross-Phone Access)

Members can set a 4-digit PIN that allows them to call in from **any phone** by entering their membership number + PIN.

**How it works:**
- Members on their registered phone can set/change their PIN via IVR: Main Menu → Press 8 (Manage Membership) → Press 2 (Set/Change PIN)
- The IVR asks for a new 4-digit PIN, then asks them to confirm by entering it again
- Once set, they can call from any phone, enter their membership number (5-digit card or 10-digit number), and then their 4-digit PIN to authenticate
- If no PIN is set, callers must use their registered phone number

**Admin controls:**
- Caller detail view shows whether a PIN is set (masked as ••••)
- Admin can set a specific PIN or clear it using the "Access PIN Management" panel in the caller detail view
- PIN API: `PATCH /api/admin/callers/:id/pin` with `{ pin: "1234" }` or `{ pin: null }` to clear

**In-memory state (routes.ts):**
- `pendingPinAuth` — callSid → membership holder phone (awaiting PIN entry)
- `pendingNewPinSetup` — callSid → first PIN entry (awaiting confirmation)

**IVR routes:** `/voice/membership-pin-entry`, `/voice/handle-membership-pin-entry`, `/voice/set-pin`, `/voice/handle-set-pin`, `/voice/handle-confirm-pin`

## Auto-Moderation System

**Service:** `server/autoModeration.ts` — runs asynchronously after every flag and block event.

**Rules implemented:**
- **Rule 1 — Flag Threshold:** 3+ distinct callers flag the same content → auto-escalate to admin queue (auto-flag)
- **Rule 2 — Block Count:** 3+ distinct callers block the same person within 24 hours → auto-flag their profile
- **Rule 4 — Repeat Flagging:** Content removed before and flagged again (2+ prior removals) → auto-remove + restrict
- **Rule 5 — New Account Flag:** Account flagged within 10 minutes of creation → auto-restrict
- **Auto-remove Threshold:** 5+ unique flaggers → auto-remove content; restricted user gets banned on 2nd auto-remove

**Account status enforcement in IVR:**
- `banned` → rejected at `/voice/entry-check` with hangup
- `restricted` → blocked from going live at `/voice/go-live`; can still browse

**Admin panel additions:**
- **Callers tab:** Status badge column (Active/Restricted/Banned); Restrict/Ban/Restore buttons in caller detail view
- **Moderation Log tab:** Full event history with timestamp, phone, event type, rule triggered, content type, reason

**Admin API routes:**
- `PATCH /api/admin/users/:id/account-status` — set `active`, `restricted`, or `banned`
- `GET /api/admin/moderation-logs?targetUserId=&limit=` — fetch moderation event history

## Database Schema

- `users` — phone number, stripeCustomerId, membershipTier, remainingSeconds, membershipPin (4-digit), `accountStatus` (active/restricted/banned), membershipStartedAt
- `webUsers` — web account (email, passwordHash, linkedPhoneNumber, sessionId)
- `membershipSettings` — dynamic plan config (plan1/plan2/plan3 names, minutes, prices), billingMode, Stripe keys, `paypalEmail`, `paypalSandbox`
- `moderation_logs` — auto-moderation event log (event type, rule, reason, target user, content ref)
- `profiles` — voice recording URLs (Twilio or local uploads)
- `messages` — voice messages between users
- `active_calls` — real-time tracking of callers on the line
- `blocked_users` — blockerId + blockedUserId pairs for live connect access control; includes `created_at` for 24h window queries
- `regions` — regional phone markets; includes `linkedRegionId` (nullable UUID) for cross-region overflow
- `promoCodes` — promotional codes for discounts or free access
- `callLogs` — per-call log records for reporting and stats

## Running

1. Copy `.env.example` to `.env` and fill in all credentials (see Environment Variables section above)
2. `npm run dev` — starts dev server on port 5000
3. `npm run db:push` — syncs database schema (reads `DATABASE_URL` from `.env`)
4. `npx tsx scripts/seed-membership.ts` — seeds Stripe Bronze/Silver/Gold products
