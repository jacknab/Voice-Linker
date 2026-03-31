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

## Stripe Integration

- **NOTE**: The Replit native Stripe integration was dismissed by the user. Stripe is connected via the `STRIPE_SECRET_KEY` environment secret directly.
- Do NOT attempt to use the Replit Stripe connector (`ccfg_stripe_01K611P4YQR0SZM11XFRQJC44Y`) — use `STRIPE_SECRET_KEY` secret instead.
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

## Database Schema

- `users` — phone number, stripeCustomerId, membershipTier, remainingMinutes
- `profiles` — voice recording URLs (Twilio or local uploads)
- `messages` — voice messages between users
- `active_calls` — real-time tracking of callers on the line
- `blocked_users` — blockerId + blockedUserId pairs for live connect access control

## Running

- Dev: `npm run dev` (port 5000)
- DB push: `npm run db:push`
- Seed Stripe products: `npx tsx scripts/seed-membership.ts`
