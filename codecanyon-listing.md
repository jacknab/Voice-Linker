# CodeCanyon Marketplace Listing — Male Box / Phone Booth
## IVR Phone Chat Line Platform

---

## ITEM TITLE (Max 80 characters)

**Phone Booth – IVR Chat Line Platform with AI, Billing & Admin Panel**

---

## TAGLINE (Short Description)

A complete, production-ready phone chat line system powered by Twilio, ElevenLabs AI, and Stripe. Run your own gay or singles chat line with local numbers, smart billing, and a full web admin dashboard — out of the box.

---

## LONG DESCRIPTION

### What Is Phone Booth?

Phone Booth is a full-featured, white-label Interactive Voice Response (IVR) phone chat line platform. It gives you everything needed to launch and operate a live voice-based social network accessible from any telephone — smartphone, cell phone, or landline. No app required for callers.

The system is built around Twilio for telephony, ElevenLabs for AI-generated voice prompts, Stripe for payments, and a PostgreSQL database. It ships with a polished web admin dashboard, a public-facing SEO landing site, a member web portal, and a fully automated IVR call flow — all in one codebase.

Whether you're building a gay chat line, a singles party line, a dating-by-voice service, or a niche voice community, Phone Booth is the complete foundation.

---

### Core Features

#### IVR Phone System (Twilio-Powered)
- Fully automated IVR menu system navigated via touch-tone keypad
- Auto-identifies callers by incoming phone number and creates accounts instantly
- Callers record a personal voice greeting and a screen name on first call
- Browse other callers' greetings sorted by proximity (uses ZIP code lat/lon distance)
- Private 1-on-1 live connections — invite, accept, or decline with keypad
- Private voice mailbox — send and receive messages between callers
- Personal ads — callers record a longer ad accessible from their mailbox
- Membership card redemption by phone — enter a 5-digit card + 4-digit PIN to add time
- Cross-phone account access — callers can log in from any phone using their membership number
- MOTD (Message of the Day) — 4 independent announcement slots: Entry, Main Menu, Community Section, Post-Purchase
- Dual market modes: **MM (Men seeking Men)** and **MW (Men seeking Women)** — each with its own tailored IVR flow and prompts

#### Billing & Membership
- **Per-minute billing** — deducts time only while the caller is active on the line
- **Per-day billing** — flat daily deduction for active members (configurable)
- **Free trial** — automatically grants a configured number of free minutes to every first-time caller
- **Stripe integration** — full web-based credit card checkout for membership purchases
- **IVR Stripe payments** — callers can enter credit card details directly on their phone keypad using Twilio Pay
- **PayPal support** — web-based PayPal payments via IPN
- Three configurable membership plan tiers (name, minutes, price all set from admin)
- Free Mode — toggle the entire platform to free access on scheduled days

#### AI Engagement Engine
- **Roger (AI Host Personality)** — monitors caller behavior in real time. If a caller becomes idle or disengaged, Roger interrupts with a custom ElevenLabs-generated voice message — flirty, playful, or petty depending on the configured personality mode
- **The "Busted" Game** — an AI-voiced "imposter" is secretly injected into the caller's browsing queue. If the caller correctly identifies the AI voice, they win free bonus minutes. Drives engagement and keeps callers on the line longer
- **Four personality modes** — Roger, Dom, Chill, and Spicy — each with distinct voice scripts and tones
- **Attention Drain Score tracking** — scores each caller's engagement level and triggers AI actions at configurable thresholds

#### Auto-Moderation
- Automatic transcription of every recorded greeting and message (via Twilio Transcription and Groq/Whisper AI)
- Recordings containing phone numbers are automatically rejected before entering the system
- Low-quality or meaningless recordings (silence, noise) detected and flagged automatically
- Behavioral auto-restriction — callers who receive an unusually high number of blocks or reports are automatically flagged or restricted
- Full moderation queue in the admin panel — review, approve, or delete any recording with one click

#### Admin Panel
- Real-time dashboard — live active caller count, calls in progress, and platform statistics
- Caller management — search by phone number, view call history, credit or deduct minutes, ban, restrict, or reset PINs
- Region management — create regions with custom phone numbers, link regions for overflow routing
- Audio manager — generate IVR prompts via ElevenLabs TTS, or upload manual MP3 overrides per category (MM/MW)
- Promo code system — create codes for bonus minutes with usage limits and expiry dates
- SMS marketing — schedule and send bulk SMS campaigns to your caller database by day-of-month
- Membership card generator — issue physical or digital membership cards with card number and PIN
- Content moderation queue — listen to and approve or delete voice recordings before they go live
- IVR flow diagram — a visual map of the full IVR decision tree for reference and onboarding
- IVR simulator — test the entire phone call experience in your browser without using a real phone
- Analytics — funnel stats, peak hour breakdowns, caller retention data
- Full audit log — every admin action is recorded with timestamp and user

#### Virtual Caller Simulator
- Populates the caller pool with virtual profiles so the system feels active from day one
- Upload seed MP3 audio files for virtual callers via the admin panel
- Simulates realistic caller behavior — joins browsing queue, accepts invitations, goes offline
- Fully configurable — set how many virtual callers are online at any time

#### SEO Web Layer
- Server-side rendered (SSR) landing page with IP-based geolocation
- Every visitor automatically sees the local phone number for their nearest region
- Automatic generation of SEO-optimized regional pages (e.g., `/regions/denver`) for every active region
- Programmatic sitemap and robots.txt generation
- Rich structured data — WebSite, Organization, Service, HowTo, FAQPage schema markup
- Open Graph and Twitter Card tags for social sharing
- Member web portal — register, link phone number, view balance, purchase membership online

---

### Technology Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 5, TypeScript |
| Frontend | React 18, Vite, Tailwind CSS, Radix UI |
| Database | PostgreSQL, Drizzle ORM |
| Telephony | Twilio (Voice, TwiML, SMS, Recordings, Pay) |
| AI Voice | ElevenLabs (TTS, multiple voice models) |
| AI Transcription | Groq Whisper / Twilio Transcription |
| Payments | Stripe (web + IVR), PayPal |
| Authentication | Passport.js, express-session, bcryptjs |
| Geolocation | ipinfo.io, zippopotam.us, OpenStreetMap Nominatim |
| Email | Nodemailer |
| Process Manager | PM2 (production) |

---

### Requirements

**You will need accounts with the following services to operate the platform:**

- **Twilio account** — for phone number(s), call routing, and SMS. Twilio usage is billed based on calls and SMS volume.
- **ElevenLabs account** — for AI voice generation. A paid ElevenLabs plan is recommended for production use.
- **Stripe account** — for processing web and IVR payments.
- **A server running Node.js 20+** — a VPS (e.g., Vultr, DigitalOcean, Linode) with at least 1 GB RAM is recommended.
- **PostgreSQL database** — can be self-hosted on the same server or a managed service.

**Optional but recommended:**
- ipinfo.io API token (free tier available) — for accurate IP geolocation
- Groq API key — for faster/more accurate voice transcription
- PayPal account — if you want to offer PayPal payments

---

### What's Included

- Full source code (TypeScript — server, client, and admin)
- Database schema with automated migrations
- Admin web panel (separate React app)
- Member-facing web portal
- Production build scripts
- PM2 ecosystem config for process management
- Systemd service file for Linux server auto-start
- Setup and deployment scripts

---

### Use Cases

- Gay chat line / gay party line platform
- Singles party line / dating-by-voice service
- Niche voice community for any adult market
- White-label chat line operator platform
- Resellable telephony SaaS

---

### Tags / Keywords

phone chat line, IVR system, Twilio, party line, gay chat line, singles chat line, voice chat, ElevenLabs, Stripe payments, PHP alternative, adult chat line, Node.js, TypeScript, React, admin dashboard, SMS marketing, voice platform, chat line software, phone dating, membership site

---

### Support

- Documentation provided in the included README
- Support provided via CodeCanyon comments for 6 months from purchase
- Updates included — new features and bug fixes pushed regularly

---

### Version History

**v1.0.0 — Initial Release**
- Full IVR call flow (MM and MW modes)
- Twilio voice, recording, and SMS integration
- ElevenLabs AI voice generation
- Roger AI engagement engine with Busted game
- Per-minute and per-day billing modes
- Stripe web and IVR payments
- PayPal web payments
- Auto-moderation with transcription analysis
- Admin dashboard with full caller and region management
- Virtual caller simulator with seed audio upload
- SSR landing page with IP geolocation
- Automatic SEO regional page generation
- SMS marketing scheduler
- IVR simulator and flow diagram
- Promo code system
- Membership card generator
- Full audit logging
