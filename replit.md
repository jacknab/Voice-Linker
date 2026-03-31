# Voice Protocol — Automated Telephone Switchboard System

## Overview

A Twilio-powered voice party line where callers can record profiles, browse other callers' voice profiles, exchange voice messages, and purchase memberships via phone keypad IVR.

## Architecture

- **Frontend**: React + Vite + TailwindCSS + shadcn/ui (admin dashboard)
- **Backend**: Express (TypeScript) + Drizzle ORM + PostgreSQL
- **Voice**: Twilio TwiML IVR system
- **Payments**: Stripe (credit card collection over IVR)

## Key Files

- `server/routes.ts` — All TwiML voice routes and IVR logic
- `server/storage.ts` — Database access layer
- `server/simulator.ts` — Virtual caller simulator
- `server/stripeClient.ts` — Stripe SDK client (uses `STRIPE_SECRET_KEY`)
- `server/webhookHandlers.ts` — Stripe webhook handler
- `shared/schema.ts` — Drizzle ORM schema
- `scripts/seed-membership.ts` — Seeds Bronze/Silver/Gold products in Stripe
- `client/src/pages/` — Admin dashboard pages

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
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks |

## Stripe Integration

- **NOTE**: The Replit native Stripe integration was dismissed by the user. Stripe is connected via the `STRIPE_SECRET_KEY` env var in `.env`.
- Do NOT attempt to use the Replit Stripe connector (`ccfg_stripe_01K611P4YQR0SZM11XFRQJC44Y`) — use `STRIPE_SECRET_KEY` in `.env` instead.
- Membership products (Bronze/Silver/Gold) are seeded via `npx tsx scripts/seed-membership.ts`
- Stripe webhook endpoint: `POST /api/stripe/webhook` (registered before `express.json()`)

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

## Database Schema

- `users` — phone number, stripeCustomerId, membershipTier, remainingMinutes
- `profiles` — voice recording URLs (Twilio or local uploads)
- `messages` — voice messages between users
- `active_calls` — real-time tracking of callers on the line
- `blocked_users` — blockerId + blockedUserId pairs for live connect access control
- `regions` — regional phone markets; includes `linkedRegionId` (nullable UUID) for cross-region overflow

## Running

1. Copy `.env.example` to `.env` and fill in all credentials (see Environment Variables section above)
2. `npm run dev` — starts dev server on port 5000
3. `npm run db:push` — syncs database schema (reads `DATABASE_URL` from `.env`)
4. `npx tsx scripts/seed-membership.ts` — seeds Stripe Bronze/Silver/Gold products
