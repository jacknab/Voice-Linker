# Groq Audio Transcription — Setup & Reference

## Overview

Male Box uses **Groq's free Whisper API** to automatically transcribe caller recordings (greetings, mailbox ads, and category ads) after they are saved to the server. The transcription text is then used by the auto-moderator to check for phone numbers, inappropriate content, and silent or low-quality recordings — without any human review needing to happen first.

### Why Groq instead of Twilio's transcription?

Previously the system used Twilio's built-in transcription feature (`transcribe: true` on the `.record()` call). This was removed for two reasons:

1. **It was already broken.** Recordings are now downloaded from Twilio to the local server immediately after they are created, then deleted from Twilio to eliminate storage costs. Twilio's transcription needs the recording to remain on their servers — so it silently failed every time.
2. **It cost money.** Twilio charges **$0.05 per minute** transcribed. Groq's Whisper tier is free.

---

## Getting a Groq API Key

1. Go to **[console.groq.com](https://console.groq.com)** and create a free account.
2. In the left sidebar, click **API Keys**.
3. Click **Create API Key**, give it a name (e.g., `malebox-transcription`), and copy the key — it starts with `gsk_`.
4. Add it to your project's `.env` file:

```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

5. Restart the server. The key is read at runtime — no code changes needed.

---

## Free Tier Limits

| Limit | Value |
|---|---|
| Audio seconds per day | **7,200 seconds (2 hours)** |
| Audio seconds per minute | 2,000 seconds |
| Requests per minute | 20 |
| Cost | **Free** |

At an average greeting length of 15–20 seconds, the free daily limit covers **360–480 new recordings per day**. For most operating phases this is more than sufficient. If the service grows beyond this, Groq's paid tier is available at a very low cost per minute.

---

## How It Works

### Step 1 — Recording is saved

When a caller finishes recording, Twilio posts the recording URL to one of three save endpoints:

| Endpoint | Recording type |
|---|---|
| `/voice/save-profile` | Caller greeting |
| `/voice/save-mailbox-greeting` | Mailbox personal ad |
| `/voice/save-category-ad` | Category browsing ad |

### Step 2 — File is downloaded from Twilio

`downloadRecording(twilioUrl)` downloads the MP3 from Twilio to the local `uploads/` directory, naming it by the recording SID (e.g., `uploads/RExxxxxxxxxxxxxxxx.mp3`). The Twilio copy is then deleted asynchronously.

### Step 3 — Silence pre-check (instant, no API call)

Before making any API call, `transcribeLocalFile()` checks the file size of the downloaded MP3.

```
File size < 5 KB  →  Recorded silence / nothing said
File size ≥ 5 KB  →  Proceed to Groq transcription
```

An MP3 of complete silence is typically under 2 KB. Even a very quiet 2–3 second clip is under 5 KB. This threshold reliably catches callers who stayed on the line but didn't speak.

**A silent recording returns `status: "silent"` with an empty string for the transcription text.** The auto-moderator treats this identically to a blank transcription — the recording is auto-rejected immediately.

### Step 4 — Groq Whisper API call

The downloaded MP3 is read into memory and sent to Groq via a single HTTP POST:

```
POST https://api.groq.com/openai/v1/audio/transcriptions
Authorization: Bearer <GROQ_API_KEY>
Content-Type: multipart/form-data

file        = <mp3 binary>
model       = whisper-large-v3-turbo
response_format = text
language    = en
```

The response is plain text — the raw transcription of what was said.

### Step 5 — Result stored in database

The transcription text and a `completed` or `failed` status are written to the database:

| Recording type | DB columns updated |
|---|---|
| Greeting | `profiles.transcription`, `profiles.transcription_status` |
| Mailbox ad / Category ad | `mailboxes.ad_transcription`, `mailboxes.ad_transcription_status` |

### Step 6 — Auto-moderator picks it up

A timer fires 65 seconds after the recording is saved (via `scheduleAutoModCheck`). By that point, Groq has typically completed transcription within a few seconds of the file being saved, so the text is already in the database waiting.

The auto-moderator runs three checks in order:

1. **Blank / empty transcription** — auto-rejects as "unclear" (catches silent recordings)
2. **Phone number detected** — auto-rejects as "phone_number" (regex scan)
3. **Low quality / repeated words** — auto-rejects as "unclear" (catches gibberish)

If all three checks pass, the recording is queued for **human review** in the Admin panel.

### Full flow diagram

```
Caller records greeting
        ↓
Twilio posts RecordingUrl to /voice/save-profile
        ↓
downloadRecording() → saves to uploads/RExxxxxx.mp3
        ↓
Twilio copy deleted (async, no storage cost)
        ↓
DB marked: transcription_status = "pending"
        ↓
transcribeLocalFile() fires async (non-blocking)
    ├── File < 5 KB?  →  status: "silent" → DB: text="", status="completed"
    ├── GROQ_API_KEY missing?  →  status: "failed"
    └── Groq API call → DB: text="<transcription>", status="completed"
        ↓
[65 seconds later] scheduleAutoModCheck fires
        ↓
runTranscriptionAutoChecks(recordingUrl, text)
    ├── Blank/empty  →  auto-reject
    ├── Phone number →  auto-reject
    ├── Low quality  →  auto-reject
    └── Passed all   →  queue for human review in Admin
```

---

## Graceful Degradation

The transcription runs completely in the background. If the Groq API is unavailable or the key is missing, the IVR call flow is **never affected** — the caller's recording is still saved and the auto-mod timer still fires. The only difference is that:

- If `GROQ_API_KEY` is not set: transcription is skipped, status stays `failed`, the recording goes straight to human review.
- If the Groq API returns an error: same as above.
- If the file is too small (silent): auto-rejected immediately without an API call.

---

## Console Log Reference

All transcription activity is logged with the `[transcribe]` prefix. You can monitor it in the server console:

| Log message | What it means |
|---|---|
| `[transcribe] Silent recording detected (N bytes): /uploads/RExx.mp3` | File size check caught a silent recording |
| `[transcribe] GROQ_API_KEY not set — transcription skipped` | Key is missing from `.env` |
| `[transcribe] Groq result for /uploads/RExx.mp3: "hello my name is..."` | Successful transcription (first 80 chars shown) |
| `[transcribe] Groq API error 429: ...` | Rate limit hit (7,200 seconds/day free tier exceeded) |
| `[transcribe] Groq API error 401: ...` | Invalid or expired API key |
| `[transcribe] Profile stored for userId=X: status=completed` | Result saved to DB successfully |
| `[transcribe] Mailbox ad stored for userId=X: status=completed` | Result saved to DB successfully |

---

## Source File

All transcription logic lives in a single file:

```
server/transcribeAudio.ts
```

**Exported function:**

```typescript
transcribeLocalFile(localPath: string): Promise<{
  text: string | null;
  status: "completed" | "failed" | "silent";
}>
```

- `localPath` — path to the local MP3 file (e.g., `/uploads/RExxxxxxxx.mp3`)
- Returns `status: "silent"` with `text: ""` for files under 5 KB
- Returns `status: "failed"` with `text: null` if the API call fails or the key is missing
- Returns `status: "completed"` with the transcription text on success

---

## Changing the Model

The model is hardcoded in `server/transcribeAudio.ts`:

```typescript
formData.append("model", "whisper-large-v3-turbo");
```

Groq currently supports these Whisper models:

| Model | Notes |
|---|---|
| `whisper-large-v3-turbo` | **Recommended.** Fast, accurate, lowest cost |
| `whisper-large-v3` | Highest accuracy, slower, higher token cost |
| `distil-whisper-large-v3-en` | English-only, fastest, least accurate |

`whisper-large-v3-turbo` is the right choice for phone-quality audio in English.

---

## Silence Threshold

The 5 KB silence threshold is defined at the top of `server/transcribeAudio.ts`:

```typescript
const MIN_FILE_BYTES = 5 * 1024; // < 5 KB = silence / no speech detected
```

This can be adjusted if you find recordings are being incorrectly flagged as silent (raise the threshold) or short silence recordings are slipping through (lower it). A typical 15-second greeting at Twilio's default 32 kbps MP3 encoding is approximately 60 KB — well above this threshold.
