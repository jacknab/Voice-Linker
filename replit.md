# Phone Booth — Adult Voice-Line IVR Chat Service

## Overview

Phone Booth is a Twilio-powered voice chat service designed for adults, offering a platform for callers to create and browse voice profiles, exchange voice messages, and purchase memberships. The project aims to provide a robust, scalable, and engaging voice-based social experience, combining traditional IVR functionality with modern web-based account management and payment systems.

The service's core capabilities include:
- Interactive Voice Response (IVR) system for managing user profiles and interactions.
- Web-based interface for account creation, phone number linking, and membership purchases.
- Advanced moderation features to ensure a safe and respectful environment.
- Dynamic engagement engine to enhance caller experience and promote interaction.
- Seamless payment integration for both web and IVR channels.

The business vision is to capture a significant share of the adult voice chat market by offering a superior user experience, advanced features, and a reliable platform, fostering a vibrant community of callers.

## User Preferences

I prefer detailed explanations and a clean, modular code structure. I value clear communication regarding significant architectural decisions or changes. For development, I prefer an iterative approach where I can review and provide feedback on features as they are built. Please ask for confirmation before making major changes to the database schema or core IVR logic. I prefer that the agent does not make changes to the `.env` file directly, especially regarding sensitive credentials; instead, provide instructions for manual updates.

## System Architecture

The Phone Booth application is built with a modern, full-stack architecture:

-   **Frontend**: React with Vite for rapid development, styled using TailwindCSS and shadcn/ui for a consistent and responsive user interface. This includes an admin dashboard (`/backstage`), public membership pages, and web authentication flows.
-   **Backend**: Express.js with TypeScript for a robust and type-safe API layer, utilizing Drizzle ORM for database interactions.
-   **Voice System**: Twilio TwiML for managing the Interactive Voice Response (IVR) flows and call handling.
-   **Database**: PostgreSQL for persistent data storage, with schema managed via Drizzle ORM migrations.
-   **Real-time Features**: Redis is used for managing real-time caller states, such as the greeting queue (rolling buffer for profile browsing) and live connection invites, providing an in-memory fallback when Redis is unavailable.
-   **UI/UX Decisions**:
    -   Admin dashboard (`/backstage`) is a standalone React app built into `dist/admin`.
    -   Public web pages (landing, membership, FAQ, etc.) use a shared `SiteLayout.tsx` for consistent navigation and branding.
    -   Audio Generation tab in admin allows for managing and previewing system prompts, with per-folder text overrides for gender-specific prompts (MM/MW).
-   **Technical Implementations**:
    -   **Roger Mood + Attention Drain Engine**: An AI host character ("Roger") interjects between profile plays, dynamically adjusting its mood and prompt frequency based on caller engagement (attention drain score). It uses a library of 155+ prompts tagged with `requiredMoods`, `minAttentionDrain`, and `maxAttentionDrain`.
    -   **Live 1-on-1 Connect**: Allows callers to initiate direct connections with other active users, with pre-flight checks and a multi-step IVR flow.
    -   **Linked Regions**: Enables callers to overflow into nearby regions' caller pools after exhausting local profiles, enhancing profile discovery.
    -   **Membership PIN**: Members can set a 4-digit PIN for cross-phone access to their membership.
    -   **Membership Cards (IVR)**: Supports 5-digit membership card entry and linking to phone numbers for per-minute billing.
    -   **Auto-Moderation System**: Asynchronously processes flags, blocks, and recording transcriptions. It includes rules for flag thresholds, block counts, repeat flagging, new account flags, and automatic content removal.
    -   **Recording Auto-Moderation**: Transcribes all user recordings and checks for blank audio, phone numbers, and low quality/repeated words. Rejected recordings trigger specific IVR messages for re-recording.
    -   **Seeded Caller Simulator**: Admin-uploaded seed profiles activate as a rotating subset to simulate activity.

## External Dependencies

-   **Twilio**: Core voice platform for IVR and call management.
-   **Stripe**: Primary payment gateway for web and IVR membership purchases. Integrates via API keys and webhooks.
-   **PayPal Standard**: Alternative web payment method, integrated via hosted payment pages and IPN (Instant Payment Notification) for transaction verification.
-   **ElevenLabs**: Used for text-to-speech (TTS) audio generation for IVR prompts, with API key integration.
-   **PostgreSQL**: Relational database for all application data.
-   **Redis**: Used for caching real-time call states and engagement engine data, improving performance and responsiveness.