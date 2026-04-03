# Phone Booth — VPS Setup & Operations Guide

This guide covers everything needed to deploy Phone Booth on a fresh Ubuntu VPS using the included `setup.sh` automation script.

---

## Table of Contents

1. [Before You Begin — Prerequisites](#1-before-you-begin--prerequisites)
2. [Running setup.sh — The Interactive Menu](#2-running-setupsh--the-interactive-menu)
3. [What Each Step Does](#3-what-each-step-does)
4. [After Setup — Fill in Your API Keys](#4-after-setup--fill-in-your-api-keys)
5. [Twilio Configuration](#5-twilio-configuration)
6. [Obtaining an SSL Certificate](#6-obtaining-an-ssl-certificate)
7. [Day-to-Day Operations](#7-day-to-day-operations)
8. [Troubleshooting](#8-troubleshooting)
9. [Database Maintenance](#9-database-maintenance)

---

## 1. Before You Begin — Prerequisites

### Server Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 20.04 | Ubuntu 22.04 or 24.04 |
| RAM | 1 GB | 2 GB+ |
| Disk | 10 GB | 20 GB+ |
| CPU | 1 vCPU | 2 vCPU |

> **Note:** The script automatically creates a 2 GB swap file on servers with less than 512 MB of swap, which prevents out-of-memory errors during the build.

### DNS

Before running the script, your domain's **A record** must already point to your server's IP address. SSL certificate issuance (Step 6) will fail if DNS is not propagated.

```
yourdomain.com     A    YOUR_VPS_IP
www.yourdomain.com A    YOUR_VPS_IP
```

### Accounts You Will Need

| Service | Purpose | Where to sign up |
|---|---|---|
| **Twilio** | Phone numbers + voice calls | twilio.com |
| **ElevenLabs** | Text-to-speech audio generation | elevenlabs.io |
| **Stripe** | Membership payments | stripe.com |

### Upload the Project to Your Server

If you purchased this system as a zip file, copy it to your server first:

```bash
# On your local machine — copy the project folder to the server
scp -r phonebooth/ youruser@YOUR_VPS_IP:~/phonebooth

# Then SSH in
ssh youruser@YOUR_VPS_IP
cd ~/phonebooth
```

Alternatively, if deploying from git:

```bash
git clone <your-repo-url> ~/phonebooth
cd ~/phonebooth
```

---

## 2. Running setup.sh — The Interactive Menu

### Basic Usage (Recommended)

```bash
bash setup.sh
```

You will be prompted for your domain name, then the setup menu appears:

```
  ╔══════════════════════════════════════════════════════════╗
  ║          Phone Booth  –  VPS Setup Menu                 ║
  ╠══════════════════════════════════════════════════════════╣
  ║                                                          ║
  ║   Domain : yourdomain.com                                ║
  ║                                                          ║
  ║   1)  Full Setup  (run all steps from the beginning)     ║
  ║                                                          ║
  ║   ── Resume / re-run from a specific step ──             ║
  ║   2)  Step  1  –  Swap space                            ║
  ║   3)  Step  2  –  System packages & Node.js             ║
  ║   4)  Step  3  –  Firewall  (UFW + fail2ban)            ║
  ║   5)  Step  4  –  npm install                           ║
  ║   6)  Step  5  –  PostgreSQL database & user            ║
  ║   7)  Step  6  –  .env configuration                    ║
  ║   8)  Step  7  –  Uploads directory                     ║
  ║   9)  Step  8  –  Database schema + admin account       ║
  ║  10)  Step  9  –  Production build                      ║
  ║  11)  Step 10  –  systemd service + Nginx + SSL         ║
  ║                                                          ║
  ║   0)  Exit                                               ║
  ╚══════════════════════════════════════════════════════════╝
```

**For a first-time install:** choose **1 — Full Setup**. The script runs all 10 steps sequentially and prints a summary when finished.

**If a step fails:** fix the underlying issue (see [Troubleshooting](#8-troubleshooting)), then re-run `bash setup.sh` and choose the matching step number to resume from that point. Steps that already completed are skipped automatically — no work is repeated unnecessarily.

After each run the script asks `Return to menu? [Y/n]` so you can immediately pick another step without restarting.

---

### Domain as an Argument

Pass the domain directly to skip the initial prompt:

```bash
bash setup.sh yourdomain.com
```

### Fully Unattended (No Prompts at All)

Use the `--yes` flag to run all steps automatically — useful for scripted or CI-based deployments:

```bash
bash setup.sh yourdomain.com --yes
```

---

### Re-running the Script Is Always Safe

Every step checks whether the work is already done before acting:

- Packages that are already installed are skipped
- A database that already exists is kept — its data is never dropped
- An existing `.env` is updated in-place, with API keys preserved
- The swap file is only created if swap is below 512 MB
- Firewall rules are added without resetting existing rules

You can safely re-run the full setup or any individual step at any time.

---

## 3. What Each Step Does

### Step 1 — Swap Space

Creates a 2 GB swap file if the server has less than 512 MB of swap. This prevents the `npm install` and production build from being killed by the OS on low-memory servers. Sets `vm.swappiness=10` for server-appropriate behaviour. The swap file is made permanent via `/etc/fstab`.

### Step 2 — System Packages & Node.js

Installs and verifies all required system software:

| Package | Purpose |
|---|---|
| **Node.js 20.x LTS** | Runs the application server |
| **PostgreSQL** | Database server; auto-detects installed version |
| **Nginx** | Reverse proxy — handles HTTPS and forwards requests to the app |
| **Certbot** | Obtains and auto-renews Let's Encrypt SSL certificates |
| **build-essential** | C/C++ compiler needed by some npm native modules |
| **curl, wget, git, openssl** | General-purpose utilities |

Also configures PostgreSQL:
- Detects the version-specific systemd service name (`postgresql@16-main`, etc.)
- Waits until the database is accepting connections before continuing
- Patches `pg_hba.conf` to allow TCP password authentication on `127.0.0.1` (required for the app to connect)

### Step 3 — Firewall

Configures **UFW** (Uncomplicated Firewall):

- Allows **SSH (port 22)** — this is added *before* enabling the firewall so you cannot be locked out
- Allows **HTTP (port 80)** and **HTTPS (port 443)** for Nginx
- Blocks all other inbound traffic

Configures **fail2ban** to automatically ban IP addresses that fail SSH authentication 5 times within 10 minutes. The ban duration is 1 hour.

Enables **unattended-upgrades** so the OS automatically applies security patches.

### Step 4 — npm install

Removes any existing `node_modules` and does a clean `npm install`. Runs after `build-essential` is confirmed present so native packages (e.g. `bcrypt`) compile correctly.

### Step 5 — PostgreSQL Database & User

- Creates the `phonebooth_user` database role if it does not exist
- Syncs the role's password with the value in `.env` (or the newly generated password)
- Creates the `phonebooth_db` database if it does not exist — existing data is never dropped on re-runs
- Grants full privileges on the database and public schema

### Step 6 — .env Configuration

Creates `.env` in the project root if it does not exist, or updates only the database and app settings if it does. Your API keys (Twilio, ElevenLabs, Stripe) are never overwritten.

Sets `chmod 600` on `.env` so only the app owner can read the credentials.

The generated file includes placeholder lines for every required key — see [Section 4](#4-after-setup--fill-in-your-api-keys).

### Step 7 — Uploads Directory

Creates `uploads/`, `uploads/mm/`, and `uploads/mw/` if they do not exist. These directories store ElevenLabs-generated MP3 audio files used by the IVR phone system. The app crashes silently on first audio generation if these are missing.

### Step 8 — Database Schema

Runs `npx drizzle-kit push --force` to create or update all database tables to match the current schema.

### Step 9 — Production Build

Runs `npm run build`, which:

1. Compiles the React frontend with Vite → `dist/public/`
2. Bundles the Express server with esbuild → `dist/index.cjs`

### Step 10 — systemd Service + Nginx + SSL

**systemd service:**

- Writes `/etc/systemd/system/phonebooth.service`
- Sets `LimitNOFILE=65536` (needed for many concurrent call connections)
- Enables the service to start automatically on reboot
- Starts the service immediately

**Nginx:**

- Writes a full production Nginx config with:
  - HTTP → HTTPS redirect
  - TLS 1.2/1.3 with strong cipher suites
  - HSTS, X-Frame-Options, X-Content-Type-Options headers
  - Separate location blocks for `/voice/`, `/api/`, `/uploads/`, and `/` (React SPA)
  - Appropriate timeouts for Twilio webhooks (15 s) and API calls (30 s)
  - Gzip compression and `server_tokens off`
- Auto-detects the Let's Encrypt certificate path for your domain
- If no certificate is found yet, prints instructions and skips SSL configuration — re-run Step 10 after obtaining the certificate

---

## 4. After Setup — Fill in Your API Keys

Open `.env` with a text editor:

```bash
nano ~/phonebooth/.env
```

Fill in every blank value:

```env
# ─── Twilio ──────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+12125550100

# ─── ElevenLabs ──────────────────────────────────────────────────────────────
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# ─── Stripe ──────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
```

Save the file, then restart the service:

```bash
sudo systemctl restart phonebooth
```

Where to find each key:

| Key | Location |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info |
| `TWILIO_PHONE_NUMBER` | Twilio Console → Phone Numbers → Active Numbers |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile → API Key |
| `ELEVENLABS_VOICE_ID` | elevenlabs.io → Voices → click a voice → copy Voice ID |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → signing secret |

---

## 5. Twilio Configuration

### Point Your Twilio Number at the Server

1. Log in to [console.twilio.com](https://console.twilio.com)
2. Go to **Phone Numbers → Manage → Active Numbers**
3. Click your phone number
4. Under **Voice & Fax → A Call Comes In**, set:
   - **Webhook**: `https://yourdomain.com/voice`
   - **HTTP Method**: `POST`
5. Click **Save**

That is the only webhook Twilio needs. All other routes (`/voice/main-menu`, `/voice/save-profile`, etc.) are called by the server internally.

### Register the Stripe Webhook

1. In the Stripe Dashboard go to **Developers → Webhooks → Add endpoint**
2. Set the URL to: `https://yourdomain.com/api/stripe/webhook`
3. Select events: `checkout.session.completed` and `payment_intent.succeeded`
4. Copy the **Signing Secret** into `STRIPE_WEBHOOK_SECRET` in `.env`

---

## 6. Obtaining an SSL Certificate

If Step 10 skipped Nginx SSL because no certificate was found, obtain one now:

```bash
sudo certbot certonly --nginx \
    -d yourdomain.com \
    -d www.yourdomain.com \
    --non-interactive \
    --agree-tos \
    -m admin@yourdomain.com
```

Then re-run the Nginx step:

```bash
bash setup.sh yourdomain.com
# Choose: 11) Step 10 – systemd service + Nginx + SSL
```

Certificates auto-renew via the `certbot.timer` systemd unit (enabled by the script). Check renewal status with:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## 7. Day-to-Day Operations

### Service Management

```bash
# View live logs
sudo journalctl -u phonebooth -f

# Restart the app (required after editing .env)
sudo systemctl restart phonebooth

# Stop / start
sudo systemctl stop phonebooth
sudo systemctl start phonebooth

# Check service status
sudo systemctl status phonebooth
```

### Nginx

```bash
# View error log
sudo tail -f /var/log/nginx/phonebooth_error.log

# View access log
sudo tail -f /var/log/nginx/phonebooth_access.log

# Test config before reloading
sudo nginx -t

# Reload (no downtime)
sudo systemctl reload nginx
```

### Firewall

```bash
# View current rules
sudo ufw status verbose

# View blocked IPs (fail2ban)
sudo fail2ban-client status sshd

# Unban an IP
sudo fail2ban-client set sshd unbanip 1.2.3.4
```

### Updating the App

After pulling new code or making changes:

```bash
cd ~/phonebooth
bash setup.sh yourdomain.com
# Choose: 10) Step 9 – Production build
# Then:  11) Step 10 – systemd service + Nginx + SSL
```

Or run steps 9–10 from the command line in one go:

```bash
npm run build && sudo systemctl restart phonebooth
```

---

## 8. Troubleshooting

### App Fails to Start

```bash
sudo journalctl -u phonebooth -n 50 --no-pager
```

Common causes:

| Error | Fix |
|---|---|
| `DATABASE_URL must be set` | `.env` file is missing or not readable — check `ls -la .env` |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL is not running — `sudo systemctl start postgresql` |
| `password authentication failed` | DB password in `.env` doesn't match the Postgres role — re-run Step 5 |
| `EADDRINUSE :5050` | Another process is using port 5050 — `sudo lsof -i :5050` |
| `Cannot find module` | `dist/` is missing — run Step 9 (build) |

### Twilio Shows "Application Error" on Calls

1. Confirm the app is running: `sudo systemctl status phonebooth`
2. Test the webhook endpoint directly:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST https://yourdomain.com/voice
   ```
   Should return `200`.
3. Check Nginx is forwarding correctly: `sudo tail -20 /var/log/nginx/phonebooth_error.log`
4. Verify the webhook URL in Twilio has no trailing slash and uses `POST`

### Nginx Returns 502 Bad Gateway

The app is not running or is crashed. Check:

```bash
sudo systemctl status phonebooth
sudo journalctl -u phonebooth -n 30 --no-pager
```

### SSL Certificate Error in Browser

```bash
sudo certbot certificates           # list all certs and expiry dates
sudo certbot renew --dry-run        # test renewal
sudo nginx -t && sudo systemctl reload nginx
```

### npm install Fails with Out-of-Memory

The server ran out of RAM. Re-run Step 1 to create a swap file, then re-run Step 4.

### Port Already in Use

```bash
sudo lsof -i :5050
sudo kill -9 <PID>
```

### Database Schema Out of Date

After any app update that changes the database schema:

```bash
cd ~/phonebooth
npx drizzle-kit push --force
sudo systemctl restart phonebooth
```

---

## 9. Database Maintenance

### Automated Cleanup Script

Run periodically to remove stale free-trial accounts, reset expired memberships, and purge dormant data. Always do a dry run first.

```bash
# Dry run — previews removals, no changes made
npx tsx scripts/cleanup.ts

# Live run — applies all deletions
npx tsx scripts/cleanup.ts --run
```

### Schedule Weekly Cleanup via Cron

```bash
crontab -e
```

Add this line (adjust the path to your install directory):

```
0 2 * * 0 cd /home/youruser/phonebooth && npx tsx scripts/cleanup.ts --run >> /var/log/phonebooth-cleanup.log 2>&1
```

### Manual Database Access

```bash
# Connect as the app user
psql postgresql://phonebooth_user@127.0.0.1/phonebooth_db

# Or connect as the postgres superuser
sudo -u postgres psql -d phonebooth_db
```

### Backup

```bash
sudo -u postgres pg_dump phonebooth_db > ~/phonebooth_backup_$(date +%Y%m%d).sql
```

### Restore

```bash
sudo -u postgres psql phonebooth_db < ~/phonebooth_backup_20240101.sql
```

---

## Admin Panel

Once the app is running, access the admin panel at:

```
https://yourdomain.com/admin
```
