# Male Box — Admin Console

A standalone local admin application for managing the Male Box IVR platform.
Runs entirely on your local machine — never exposed to the internet.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## First-time configuration

On first launch you'll see a connection screen. Enter:

1. **Production Server URL** — e.g. `https://your-app.replit.app`
2. **Admin Secret Key** — must match the `ADMIN_SECRET_KEY` environment variable set on your server

These are saved in your browser's local storage. Click **Connect to Server**.

## Server requirement

Your production server must have `ADMIN_SECRET_KEY` set as an environment variable.
All `/api/admin/*` requests from this app include that key as a header.
Requests without the correct key receive a `403 Forbidden` response.

To generate a strong key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Security model

- This app runs only on your local machine — it has no public URL
- The `/admin` route has been removed from the public-facing server
- All admin API calls are authenticated via the `X-Admin-Key` header
- The secret key is stored only in your browser's local storage

## Switching servers

Click **DISCONNECT** in the top bar to enter a different server URL or secret key.
