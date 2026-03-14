# VOICE_PROTOCOL — VPS Setup & Operations Guide

A voice-based social network that runs over real phone calls using Twilio. Callers record a profile, browse other users' profiles, and exchange voice messages — all through a touch-tone phone menu.

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [Prerequisites](#prerequisites)
3. [Server Setup](#server-setup)
4. [Database Setup](#database-setup)
5. [Environment Variables](#environment-variables)
6. [Building & Running](#building--running)
7. [Twilio Configuration](#twilio-configuration)
8. [Exposing Your Server to the Internet](#exposing-your-server-to-the-internet)
9. [Phone Menu Reference](#phone-menu-reference)
10. [API Endpoints](#api-endpoints)
11. [Database Schema](#database-schema)
12. [Process Management (Production)](#process-management-production)
13. [Nginx Reverse Proxy (Optional)](#nginx-reverse-proxy-optional)
14. [Troubleshooting](#troubleshooting)

---

## How It Works

1. You buy a Twilio phone number and point its webhook at your server.
2. When someone calls that number, Twilio sends a POST request to `POST /voice` on your server.
3. Your server responds with TwiML (XML instructions) telling Twilio what to say, record, or play.
4. Recordings are stored by Twilio and your server saves only the URL to the recording — no audio files are stored locally.
5. A web dashboard is served at the root URL (`/`) showing live stats (total users, profiles, messages).

---

## Prerequisites

- A Linux VPS (Ubuntu 22.04+ recommended)
- Node.js 20+
- PostgreSQL 14+
- A Twilio account with a purchased phone number
- A publicly accessible domain name or static IP (Twilio must be able to reach your server)

---

## Server Setup

### 1. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should print v20.x.x
```

### 2. Install PostgreSQL

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 3. Clone the Repository

```bash
git clone <your-repo-url> voice_protocol
cd voice_protocol
```

### 4. Install Dependencies

```bash
npm install
```

---

## Database Setup

### Create a Database and User

```bash
sudo -u postgres psql
```

Inside the psql prompt:

```sql
CREATE USER voice_user WITH PASSWORD 'choose_a_strong_password';
CREATE DATABASE voice_protocol OWNER voice_user;
GRANT ALL PRIVILEGES ON DATABASE voice_protocol TO voice_user;
\q
```

### Push the Schema

Once your `.env` file is configured (see next section), run:

```bash
npm run db:push
```

This creates all three tables (`users`, `profiles`, `messages`) automatically. You never need to write SQL migrations manually.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Required — PostgreSQL connection string
DATABASE_URL=postgres://voice_user:choose_a_strong_password@localhost:5432/voice_protocol

# Optional — defaults to 5000
PORT=5000

# Required in production
NODE_ENV=production
```

**Never commit `.env` to version control.**

### Loading `.env` at runtime

The app does not auto-load a `.env` file. Export the variables in your shell before running, or use a process manager like PM2 (see below) which has built-in `.env` support.

```bash
export $(cat .env | xargs)
```

---

## Building & Running

### Development (hot-reload, no build step)

```bash
NODE_ENV=development npx tsx server/index.ts
```

The server and frontend both run on port 5000 in development via Vite.

### Production Build

```bash
npm run build
```

This command:
1. Builds the React frontend with Vite → `dist/public/`
2. Bundles the Express server with esbuild → `dist/index.cjs`

### Production Start

```bash
NODE_ENV=production node dist/index.cjs
```

The server will serve the compiled frontend at `/` and all API/webhook routes on the same port.

---

## Twilio Configuration

### Step 1 — Get a Twilio Account

1. Sign up at [twilio.com](https://www.twilio.com)
2. Go to the **Phone Numbers** section and purchase a number with Voice capability

### Step 2 — Point the Webhook at Your Server

1. In the Twilio Console, navigate to **Phone Numbers → Manage → Active Numbers**
2. Click your number
3. Under **Voice & Fax → A Call Comes In**, set:
   - **Webhook**: `https://yourdomain.com/voice`
   - **HTTP Method**: `POST`
4. Click **Save**

That is the only webhook you need to configure. All other routes (`/voice/main-menu`, `/voice/save-profile`, etc.) are called internally by the server redirecting Twilio — Twilio does not need to know about them directly.

### Step 3 — Test the Connection

Call your Twilio number. If your server is running and reachable, you should hear the welcome prompt asking you to record a profile.

### Twilio Credentials (Optional)

The app does not currently validate Twilio request signatures. If you want to add that security layer in the future, you will need:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
```

These are available in the Twilio Console under **Account Info**.

---

## Exposing Your Server to the Internet

Twilio must be able to reach your server over a public URL. You have two options:

### Option A — Direct VPS with a Domain (Recommended for Production)

1. Point your domain's DNS A record to your VPS IP address
2. Use Nginx as a reverse proxy (see the Nginx section below)
3. Obtain a free TLS certificate with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Your webhook URL will be: `https://yourdomain.com/voice`

### Option B — Direct IP (No Domain)

You can use `http://YOUR_VPS_IP:5000/voice` as the Twilio webhook, but:
- Twilio strongly prefers HTTPS
- HTTP webhooks are not recommended for production

### Option C — Ngrok (For Local Testing Only)

```bash
ngrok http 5000
```

Use the generated `https://xxxx.ngrok.io/voice` URL as the Twilio webhook temporarily. Ngrok URLs change every restart on the free plan.

---

## Phone Menu Reference

### Entry Point — Any Inbound Call

```
Caller dials your Twilio number
    │
    ├─ First-time caller (no profile)
    │       └─ Prompt to record a 30-second profile
    │               └─ Profile saved → Main Menu
    │
    └─ Returning caller (has a profile)
            └─ Main Menu
```

### Main Menu

```
Press 1 → Browse Profiles
Press 2 → Re-record your profile (30 seconds)
(no input) → Loops back to Main Menu
```

### Browse Profiles

```
You have unread messages?
    YES → Play the message recording
          ├─ Press 1 → Reply (60 seconds) → message sent → Browse Profiles
          ├─ Press 2 → Hear the sender's profile
          │               ├─ Press 1 → Send a message to the sender
          │               ├─ Press 2 → Continue browsing
          │               └─ Press 9 → Main Menu
          ├─ Press 3 → Skip, continue browsing
          └─ Press 9 → Main Menu

    NO → Play a random other user's profile
          ├─ Press 1 → Send them a message (60 seconds)
          ├─ Press 2 → Play the next random profile
          └─ Press 9 → Main Menu
```

**Note:** Messages are marked as read when the caller presses 1, 3, or 9 from the message menu. If a caller hangs up mid-message without pressing anything, the message stays unread and will play again on the next call.

---

## API Endpoints

These are used by the web dashboard.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/stats` | Returns `{ users, profiles, messages }` counts |

All Twilio webhook endpoints are POST and return `text/xml` (TwiML):

| Method | Path | Triggered By |
|--------|------|-------------|
| `POST` | `/voice` | Twilio — inbound call |
| `POST` | `/voice/save-profile` | Twilio — after profile recording ends |
| `POST` | `/voice/main-menu` | Internal redirect |
| `POST` | `/voice/handle-main-menu` | Twilio — digit press in main menu |
| `POST` | `/voice/browse-profiles` | Internal redirect |
| `POST` | `/voice/handle-message-menu` | Twilio — digit press while reviewing a message |
| `POST` | `/voice/handle-sender-profile-menu` | Twilio — digit press after hearing sender profile |
| `POST` | `/voice/handle-profile-menu` | Twilio — digit press while browsing random profiles |
| `POST` | `/voice/save-message` | Twilio — after voice message recording ends |

---

## Database Schema

Three tables are created automatically by `npm run db:push`.

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key, auto-generated |
| `phone_number` | TEXT | Unique. Twilio sends this as the `From` field (E.164 format, e.g. `+12125550100`) |
| `created_at` | TIMESTAMP | Auto-set |

### `profiles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | One-to-one with `users` |
| `recording_url` | TEXT | Twilio-hosted URL to the audio file |
| `recording_duration` | INTEGER | Duration in seconds (may be null) |
| `created_at` | TIMESTAMP | Auto-set |

Recording a new profile overwrites the existing one (`upsert` on `user_id`).

### `messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `from_user_id` | UUID | Sender |
| `to_user_id` | UUID | Recipient |
| `recording_url` | TEXT | Twilio-hosted URL to the audio file |
| `is_read` | BOOLEAN | `false` until the recipient listens and acts on it |
| `created_at` | TIMESTAMP | Auto-set |

---

## Process Management (Production)

Use PM2 to keep the app running after you close your terminal and to auto-restart it on crashes.

### Install PM2

```bash
sudo npm install -g pm2
```

### Create an ecosystem file

Create `ecosystem.config.cjs` in the project root:

```js
module.exports = {
  apps: [
    {
      name: "voice_protocol",
      script: "./dist/index.cjs",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        DATABASE_URL: "postgres://voice_user:choose_a_strong_password@localhost:5432/voice_protocol"
      }
    }
  ]
};
```

### Start, Save, and Enable Auto-start

```bash
npm run build             # build first
pm2 start ecosystem.config.cjs
pm2 save                  # persist process list
pm2 startup               # prints a command — run that command to enable auto-start on reboot
```

### Useful PM2 Commands

```bash
pm2 status                # show running processes
pm2 logs voice_protocol   # stream logs
pm2 restart voice_protocol
pm2 stop voice_protocol
```

---

## Nginx Reverse Proxy (Optional)

If you want to serve the app on port 80/443 and use a domain name, set up Nginx as a reverse proxy.

### Install Nginx

```bash
sudo apt install nginx
```

### Create a Site Config

Create `/etc/nginx/sites-available/voice_protocol`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable and Reload

```bash
sudo ln -s /etc/nginx/sites-available/voice_protocol /etc/nginx/sites-enabled/
sudo nginx -t          # test config
sudo systemctl reload nginx
```

### Add HTTPS with Certbot

```bash
sudo certbot --nginx -d yourdomain.com
```

Certbot will automatically edit your Nginx config to handle HTTPS and redirect HTTP → HTTPS. Your Twilio webhook URL will then be `https://yourdomain.com/voice`.

---

## Troubleshooting

### "tsx: not found"
Run `npm install` — the `tsx` package is a dev dependency required to start the server in development mode.

### "DATABASE_URL must be set"
You have not exported your environment variables. Run `export $(cat .env | xargs)` or use PM2's `env` block.

### Twilio shows "Application Error" when calling
- Confirm your server is publicly reachable: `curl -X POST https://yourdomain.com/voice` should return XML
- Check PM2 logs: `pm2 logs voice_protocol`
- Verify the webhook URL in the Twilio console has no trailing slash and uses `POST`

### Schema changes not reflecting
Run `npm run db:push` after any changes to `shared/schema.ts`. You do not need to restart the server separately — `db:push` only updates the database structure.

### Twilio recordings not playing / 404 on recording URLs
Twilio recordings take a few seconds to become available after a call ends. If `RecordingUrl` is sometimes empty, Twilio may have sent the webhook before processing finished. You can add `.mp3` to the end of any Twilio recording URL to force audio playback in a browser: `https://api.twilio.com/.../<RecordingSid>.mp3`.

### Port already in use
```bash
sudo lsof -i :5000
kill -9 <PID>
```

Or change the `PORT` environment variable to a free port and update your Nginx proxy config accordingly.
