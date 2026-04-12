# Male Box Admin — Setup Guide

---

## Part 1: Update Your VPS Server

### Step 1 — Pull the latest code
SSH into your VPS and run:
```bash
git pull
npm install
```

### Step 2 — Generate your Admin Secret Key
Run this command on your VPS:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
You will get a long string of random characters. Copy it — you will need it in the next step and again on your desktop.

### Step 3 — Add the key to your environment
Open your `.env` file on the VPS and add this line:
```
ADMIN_SECRET_KEY=paste_your_generated_key_here
```

### Step 4 — Restart your server
```bash
pm2 restart all
```
(Or however you normally restart your server process.)

---

## Part 2: Set Up the Admin App on Your Desktop

### Step 1 — Clone the repository
```bash
git clone https://github.com/jacknab/<your-main-repo>.git
```

### Step 2 — Go into the admin folder
```bash
cd <your-main-repo>/malebox-admin
```

### Step 3 — Install dependencies
```bash
npm install
```

### Step 4 — Start the admin app
```bash
npm run dev
```

### Step 5 — Open the admin in your browser
Go to: **http://localhost:5173**

You will see a connection screen. Enter:
- **Production Server URL** — your VPS address, e.g. `https://yourdomain.com`
- **Admin Secret Key** — the key you generated in Part 1, Step 2

Click **Connect to Server**.

These settings are saved in your browser's local storage. You only need to enter them once.

---

## Future Updates

When you pull new code changes to your VPS:
```bash
git pull
npm install
pm2 restart all
```

When you want the latest admin app on your desktop:
```bash
git pull
```
Then `npm run dev` as usual. No reinstall needed unless packages changed.

---

## Security Notes

- The `/admin` route no longer exists on the public server — it returns 404 to anyone who visits it
- All admin API calls require the `X-Admin-Key` header — without it the server returns 403 Forbidden
- The secret key is stored only in your local browser — it never touches the internet except when sent over HTTPS to your own server
- Do not share or commit your `.env` file
