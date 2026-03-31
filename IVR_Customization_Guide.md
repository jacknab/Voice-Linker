# IVR Customization Guide

This guide explains where to find and change every caller-facing piece of text and audio in the phone system.

---

## How Prompts Work — Two Layers

Every prompt in the system works like this:

```
playPrompt(twiml, req, "filename.mp3", "Fallback text if no MP3 found")
```

1. **If `uploads/filename.mp3` exists** → the caller hears that audio file
2. **If the file does NOT exist** → the system reads the fallback text aloud using text-to-speech

This means you have two ways to change what a caller hears:
- **Quick change:** Edit the fallback text in `server/routes.ts` (takes effect immediately on server restart)
- **Professional change:** Record or generate an MP3, upload it to the `uploads/` folder via the Admin panel → Audio Gen tab

---

## The Main File to Edit

**All IVR call flow logic and prompt text lives in one file:**

```
server/routes.ts
```

This is a large file (~3,000 lines). Use your editor's search (`Ctrl+F` / `Cmd+F`) to find prompts by their filename or text.

---

## Changing the Welcome Greeting

This is the very first thing a caller hears when they call in.

**File:** `server/routes.ts`  
**Search for:** `system_greeting.mp3`  
**Line:** ~1230

```js
playPrompt(twiml, req, "system_greeting.mp3",
  "Welcome to Interactive Mail. Interactive Mail assumes no responsibility for personal meetings.");
```

**To change it to "Welcome to the Phone Booth"**, edit it to:

```js
playPrompt(twiml, req, "system_greeting.mp3",
  "Welcome to the Phone Booth. The Phone Booth assumes no responsibility for personal meetings.");
```

Then restart the server for the change to take effect. If you have a `system_greeting.mp3` file in the `uploads/` folder, that file will play instead of the text — so you'd need to either delete that file or regenerate it via Admin → Audio Gen.

---

## Quick Reference — Key Prompts by Section

### Entry (first thing callers hear)

| What to search for | What it controls |
|---|---|
| `system_greeting.mp3` | **Welcome message** — plays on every call |
| `motd.mp3` | Announcement / MOTD — plays after welcome if enabled in Admin |
| `no_caller_id.mp3` | "We could not identify your call. Goodbye." |
| `free_trial_offer.mp3` | Offer played to brand-new callers |

### Phone Booth / Profile Setup

| What to search for | What it controls |
|---|---|
| `phone_booth_welcome.mp3` | "Welcome to the live connector..." intro |
| `welcome_record_name.mp3` | Prompt to record name for first-timers |
| `name_retry.mp3` | "We didn't catch your name. Please try again." |
| `name_saved_record_greeting.mp3` | Prompt to record greeting after name |
| `greeting_error.mp3` | "That greeting was too short." |
| `profile_saved.mp3` | "Your greeting has been saved." |

### Main Menu

| What to search for | What it controls |
|---|---|
| `main_menu.mp3` | "Press 1 to listen to profiles. Press 2 to re-record..." |
| `access_expired.mp3` | "Your access has expired." |
| `invalid_choice.mp3` | "Invalid choice." |

### Browsing Profiles

| What to search for | What it controls |
|---|---|
| `profile_options.mp3` | "Press 1 to send a message. Press 2 to skip..." |
| `no_profiles.mp3` | "There are no profiles available right now." |
| `caller_blocked.mp3` | "Caller blocked. You will no longer hear this caller's profile." |
| `message_flagged.mp3` | "This message has been flagged for review. Thank you." |

### Messages

| What to search for | What it controls |
|---|---|
| `message_options.mp3` | Options menu after a new voice message plays |
| `record_message.mp3` | "Record your message after the tone." |
| `message_sent.mp3` | "Your message has been sent." |

### Memberships & Payment

| What to search for | What it controls |
|---|---|
| `info_menu.mp3` | "Press 1 for membership questions..." |
| `membership_how_it_works.mp3` | Full explanation of how membership works |
| `payment_success_30day.mp3` | "Payment successful! You now have 30 Day access..." |
| `payment_declined.mp3` | "Your card was declined." |

---

## Also Check: Admin Panel Prompt Text

In addition to `server/routes.ts`, the Admin panel's **Audio Gen** tab has a list of suggested scripts for each prompt. These are just suggestions shown in the UI — the actual text that plays is always what's in `server/routes.ts`.

**File:** `client/src/pages/Admin.tsx`  
**Search for:** `PROMPT_PRESETS`

This is an array of objects like:
```js
{ filename: "system_greeting.mp3", label: "System Greeting", text: "Welcome to Interactive Mail..." }
```

If you change the welcome text in `routes.ts`, update this array too so the suggested script in the Audio Gen tab stays in sync. It's not required, just keeps things tidy.

---

## How to Apply Changes

### Text-only change (fallback TTS)
1. Edit the text in `server/routes.ts`
2. If you have the `.mp3` file in `uploads/`, either delete it or regenerate it via Admin → Audio Gen
3. Restart the server: `sudo systemctl restart ivr-app`

### Audio file change
1. Record or generate the new MP3 (Admin → Audio Gen works well for this)
2. Make sure the filename exactly matches what's in `routes.ts`
3. The file will be used automatically on the next call — no restart needed

---

## Finding Any Prompt in the Code

Open `server/routes.ts` and search for the `.mp3` filename. Every prompt follows the same pattern:

```js
playPrompt(twiml, req, "filename.mp3", "The text Twilio will read if the file is missing");
```

The second argument (in quotes) is always the fallback text — change that string to change what callers hear.
