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

## Database Schema

- `users` — phone number, stripeCustomerId, membershipTier
- `profiles` — voice recording URLs (Twilio or local uploads)
- `messages` — voice messages between users
- `active_calls` — real-time tracking of callers on the line

## Running

- Dev: `npm run dev` (port 5000)
- DB push: `npm run db:push`
- Seed Stripe products: `npx tsx scripts/seed-membership.ts`
