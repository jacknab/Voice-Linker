# Male Box Admin Console — Setup Guide

The admin console is a standalone desktop web app that runs locally on your Windows machine and connects to the live phone system server. It never needs to be deployed or hosted — it runs only on your computer.

---

## Required Software

### Node.js

Node.js is required to run the admin console. Without it, `admin_setup.bat` will fail immediately.

1. Go to **[nodejs.org](https://nodejs.org)**
2. Click the **LTS** download button (Long Term Support — the stable version recommended for most users)
3. Run the installer and follow the prompts — all default options are fine
4. **Restart your terminal** after installation so the new commands are recognized

**Verify it installed correctly** — open PowerShell or Command Prompt and run:
```
node --version
```
You should see a version number like `v20.x.x`. If you get "not recognized", restart your terminal or reinstall Node.js.

---

## Other Requirements

- The `malebox-admin/` folder must be present on your machine (copy it from the project).

---

## Step 1 — First Time Setup

> Run this once only. It installs all required dependencies.

Open **PowerShell** in the `malebox-admin` folder and run:

```
.\admin_setup.bat
```

> **Important — PowerShell vs Command Prompt:**
> If you are using **PowerShell** (the default terminal on Windows 11), you must prefix `.bat` files with `.\` — otherwise PowerShell will say the command is "not recognized."
>
> - Correct in PowerShell: `.\admin_setup.bat`
> - Correct in Command Prompt (cmd): `admin_setup.bat`
>
> If you see an error like *"The term 'admin_setup.bat' is not recognized..."*, this is the cause. Add `.\` in front and run it again.

The script runs `npm install` to download all dependencies. When it says **Setup complete!** you are ready.

---

## Step 2 — Start the Admin Panel

Each time you want to use the admin console, run:

```
.\admin_start.bat
```

This starts a local development server and opens the admin console in your browser automatically. Keep the terminal window open while you are using it — closing the window stops the server.

---

## Step 3 — Connect to Your Server

The first time you open the admin console you will see a connection screen asking for two things:

### Production Server URL

This is the public URL of your deployed phone system server — the `.replit.app` address (or custom domain). Example:

```
https://your-app.replit.app
```

Do not include a trailing slash.

### Admin Secret Key

This is a shared secret that proves to the server that the admin console is authorized to make changes. The server checks every incoming admin request against this key.

#### Generating the Key

The key is just a long random string. Generate one on Windows using any of the following methods:

**PowerShell (no extra software needed):**
```powershell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

**Node.js (if installed):**
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output — that is your key. Make it at least 16 characters (the longer the better).

#### Adding the Key to the Server

The same key must be set as an environment variable on the server side. In the project's `.env` file on Replit, add:

```
ADMIN_SECRET_KEY=your-generated-key-here
```

Without this the server will log a warning and the admin API will be **unprotected**. Always set it before sharing access.

#### How the Key is Stored on Your Machine

When you click **Connect to Server**, the URL and key are saved to your **browser's localStorage** — a small database that browsers use to store site data locally. They persist across restarts so you only have to enter them once. No `.env` file is needed on the Windows side.

To disconnect or change servers, click the **DISCONNECT** button in the top bar of the admin console.

---

## How to Open the `malebox-admin` Folder in PowerShell

1. Open **File Explorer** and navigate to the `malebox-admin` folder.
2. Click the address bar at the top, type `powershell`, and press Enter.

PowerShell opens directly in that folder — no `cd` commands needed.

Alternatively, from an existing PowerShell window:

```
cd C:\path\to\malebox-admin
.\admin_start.bat
```

---

## Quick Reference

| Task | Command (PowerShell) | Command (cmd) |
|---|---|---|
| First time setup | `.\admin_setup.bat` | `admin_setup.bat` |
| Start admin panel | `.\admin_start.bat` | `admin_start.bat` |

---

## Troubleshooting

**"admin_start.bat is not recognized as the name of a cmdlet..."**
You are in PowerShell. Add `.\` in front: `.\admin_start.bat`

**"Setup failed. Make sure Node.js is installed."**
Download and install Node.js from [nodejs.org](https://nodejs.org), then run `.\admin_setup.bat` again.

**Admin console loads but shows no data / connection errors**
- Check that the Production Server URL is correct and includes `https://`
- Check that the `ADMIN_SECRET_KEY` in the server `.env` matches what you entered on the connection screen
- Make sure the server is running (check the Replit workflow is active)

**Want to connect to a different server**
Click **DISCONNECT** in the admin console top bar. The connection screen will reappear and you can enter new settings.
