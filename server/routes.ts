import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import express from "express";
import twilio from "twilio";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as mm from "music-metadata";
import { addVirtualCaller, removeVirtualCaller, getLiveVirtualUserIds } from "./simulator";

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname) || ".mp3";
      cb(null, `${unique}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "audio/mpeg" || file.mimetype === "audio/mp3" || file.originalname.endsWith(".mp3")) {
      cb(null, true);
    } else {
      cb(new Error("Only MP3 files are allowed"));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

const VoiceResponse = twilio.twiml.VoiceResponse;

// ─── Membership Packages ───────────────────────────────────────────────────
const FREE_TRIAL_MINUTES = 90; // Minutes granted to brand-new callers automatically

const MEMBERSHIP_PACKAGES: Record<string, { name: string; label: string; minutes: number; priceCents: number; priceLabel: string }> = {
  "1": { name: "30day",  label: "43,200 Minute", minutes: 43200, priceCents: 2500, priceLabel: "25 dollars" },
  "2": { name: "14day",  label: "20,160 Minute", minutes: 20160, priceCents: 1000, priceLabel: "10 dollars" },
  "3": { name: "24hour", label: "1,440 Minute",  minutes: 1440,  priceCents: 300,  priceLabel: "3 dollars" },
};

// Speak a number using the minimum set of recorded files:
//   0–19  → single file each  (num_0.mp3 … num_19.mp3)
//   20–99 → tens file + ones file if non-zero
//            e.g. 23 → num_20.mp3 + num_3.mp3
//            e.g. 40 → num_40.mp3 only
//   100   → num_100.mp3
//   >100  → TTS fallback (only occurs for large membership hour counts)
function playNumber(
  twiml: { say: (text: string) => void; play: (url: string) => void },
  req: Request,
  n: number
): void {
  if (n <= 19) {
    playPrompt(twiml, req, `num_${n}.mp3`, String(n));
  } else if (n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const ones = n % 10;
    playPrompt(twiml, req, `num_${tens}.mp3`, String(tens));
    if (ones > 0) {
      playPrompt(twiml, req, `num_${ones}.mp3`, String(ones));
    }
  } else if (n === 100) {
    playPrompt(twiml, req, "num_100.mp3", "one hundred");
  } else {
    twiml.say(String(n));
  }
}

// Play the time-remaining announcement by chaining phrase + number audio files.
function playTimeRemaining(
  twiml: { say: (text: string) => void; play: (url: string) => void },
  req: Request,
  totalMinutes: number
): void {
  if (totalMinutes >= 120) {
    // 2+ hours
    const hours = Math.floor(totalMinutes / 60);
    playPrompt(twiml, req, "phrase_you_have.mp3", "You have");
    playNumber(twiml, req, hours);
    playPrompt(twiml, req, "phrase_hours_of_pbtr.mp3", "hours of phone booth time remaining.");
  } else if (totalMinutes >= 60) {
    const mins = totalMinutes % 60;
    if (mins === 0) {
      // Exactly 1 hour
      playPrompt(twiml, req, "phrase_you_have.mp3", "You have");
      playNumber(twiml, req, 1);
      playPrompt(twiml, req, "phrase_hour_of_pbtr.mp3", "hour of phone booth time remaining.");
    } else {
      // 1 hour and X minutes (61–119 minutes)
      playPrompt(twiml, req, "phrase_you_have_1_hour_and.mp3", "You have 1 hour and");
      playNumber(twiml, req, mins);
      playPrompt(twiml, req, mins === 1 ? "phrase_minute_of_pbtr.mp3" : "phrase_minutes_of_pbtr.mp3",
        mins === 1 ? "minute remaining." : "minutes remaining.");
    }
  } else {
    // Under 60 minutes (1–59; 0 is already blocked at main-menu)
    playPrompt(twiml, req, "phrase_you_have.mp3", "You have");
    playNumber(twiml, req, totalMinutes);
    playPrompt(twiml, req, totalMinutes === 1 ? "phrase_minute_of_pbtr.mp3" : "phrase_minutes_of_pbtr.mp3",
      totalMinutes === 1 ? "minute remaining." : "minutes remaining.");
  }
}

// Play the active caller count announcement by chaining phrase + number audio files.
function playCallerCount(
  twiml: { say: (text: string) => void; play: (url: string) => void },
  req: Request,
  count: number
): void {
  const isSingular = count === 1;
  playPrompt(twiml, req, isSingular ? "phrase_there_is.mp3" : "phrase_there_are.mp3",
    isSingular ? "There is" : "There are");
  playNumber(twiml, req, count);
  playPrompt(twiml, req,
    isSingular ? "phrase_caller_on_the_line.mp3" : "phrase_callers_on_the_line.mp3",
    isSingular ? "guy on the line." : "guys on the line.");
}

// In-memory payment sessions keyed by Twilio CallSid
interface PaymentSession {
  packageName: string;
  packageLabel: string;
  packagePriceCents: number;
  priceLabel: string;
  isFirstPurchase?: boolean;
}
const paymentSessions = new Map<string, PaymentSession>();

// Temporary store for the name recording URL between the save-name and save-profile steps
const pendingNameRecordings = new Map<string, string>(); // CallSid → nameRecordingUrl

// Draft greeting recordings held in memory until the caller accepts them in REVIEW_GREETING
interface GreetingDraft {
  nameRecordingUrl?: string;
  greetingRecordingUrl: string;
  greetingDuration: number;
}
const pendingGreetingDrafts = new Map<string, GreetingDraft>(); // CallSid → draft

// Per-caller profile browsing state: each caller gets their own queue + position
interface CallerBrowseState {
  queue: { userId: string; recordingUrl: string; nameRecordingUrl?: string | null }[];
  index: number;
}
const callerBrowseState = new Map<string, CallerBrowseState>();

// Maps CallSid → regionId for the duration of a call
const callRegion = new Map<string, string>();

// Per-call flags — track whether time announcements have been made this session
const callTimeAnnounced = new Set<string>(); // already heard the "you have X hours/minutes" announcement
const callWarningShown  = new Set<string>(); // already heard the < 15-minute warning

// Phone booth session: tracks when a caller is actively listening (time being deducted)
interface PhoneBoothSession { enteredAt: Date; fromNumber: string; }
const phoneBoothSessions = new Map<string, PhoneBoothSession>(); // CallSid → session

// Build the base URL of this server from an incoming Twilio request
function baseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  return `${proto}://${host}`;
}

// Extract Twilio recording SID from a recording URL
function getRecordingSid(url: string): string | null {
  const match = url.match(/Recordings\/([^\/\?.]+)/);
  return match ? match[1] : null;
}

// Play a pre-recorded prompt from uploads/ if the file exists, otherwise fall back to TTS.
// This lets you drop a clean-named .mp3 into uploads/ and it will be picked up instantly.
function playPrompt(
  node: { say: (text: string) => void; play: (url: string) => void },
  req: Request,
  filename: string,
  fallbackText: string
): void {
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    node.play(`${baseUrl(req)}/uploads/${filename}`);
  } else {
    node.say(fallbackText);
  }
}

// Build a URL pointing to our local audio proxy (or a full URL for local uploads)
function audioProxyUrl(recordingUrl: string, req: Request): string {
  // Local admin-uploaded file — just make it a full absolute URL
  if (recordingUrl.startsWith("/uploads/")) {
    return `${baseUrl(req)}${recordingUrl}`;
  }
  // Twilio-hosted recording — proxy through our audio endpoint
  const sid = getRecordingSid(recordingUrl);
  if (!sid) {
    console.warn("[audio] Could not extract SID from:", recordingUrl);
    return recordingUrl;
  }
  return `${baseUrl(req)}/audio/${sid}`;
}

// Register Twilio status callback so we know when this call ends.
// Called once when a call first arrives so Twilio will POST to /voice/status on hangup.
async function registerStatusCallback(callSid: string, req: Request): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.warn("[status] Twilio credentials missing — cannot register status callback");
    return;
  }
  const client = twilio(accountSid, authToken);
  const statusCallbackUrl = `${baseUrl(req)}/voice/status`;
  try {
    await client.calls(callSid).update({
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed", "failed", "busy", "no-answer", "canceled"],
    });
    console.log(`[status] Registered status callback for ${callSid} → ${statusCallbackUrl}`);
  } catch (err) {
    // Non-fatal — the call still works; we just might miss the hangup event
    console.error(`[status] Failed to register status callback for ${callSid}:`, err);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(express.urlencoded({ extended: true }));

  // Log all voice webhook requests
  app.use("/voice", (req: Request, _res: Response, next: NextFunction) => {
    console.log(`[voice] ${req.method} ${req.path} | From=${req.body?.From} CallSid=${req.body?.CallSid} Digits=${req.body?.Digits} CallStatus=${req.body?.CallStatus}`);
    next();
  });

  // --- Audio Proxy ---
  app.get("/audio/:sid", async (req, res) => {
    const { sid } = req.params;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    console.log(`[audio] Proxy request for SID=${sid}`);

    if (!accountSid || !authToken) {
      console.error("[audio] Twilio credentials not set");
      return res.status(503).send("Audio credentials not configured");
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`;
    const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    try {
      const upstream = await fetch(twilioUrl, { headers: { Authorization: authHeader } });
      console.log(`[audio] Twilio responded ${upstream.status} for SID=${sid}`);

      if (!upstream.ok) {
        return res.status(upstream.status).send("Failed to fetch recording from Twilio");
      }

      res.setHeader("Content-Type", "audio/mpeg");
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);

      const { Readable } = await import("stream");
      const readable = Readable.fromWeb(upstream.body as any);
      readable.pipe(res);
    } catch (error) {
      console.error("[audio] Error proxying recording:", error);
      res.status(500).send("Error fetching audio");
    }
  });

  // --- Serve uploaded MP3 files ---
  app.use("/uploads", express.static(UPLOADS_DIR));

  // --- API Routes ---
  app.get(api.stats.get.path, async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // --- Admin: List all profiles ---
  app.get("/api/admin/profiles", async (_req, res) => {
    try {
      const data = await storage.getAllProfilesWithUsers();
      res.json(data);
    } catch (e) {
      console.error("[admin] Failed to list profiles:", e);
      res.status(500).json({ message: "Failed to fetch profiles" });
    }
  });

  // --- Admin: Upload MP3 to create/replace a caller's profile greeting ---
  app.post("/api/admin/profiles/upload", upload.single("audio"), async (req, res) => {
    try {
      const phoneNumber = (req.body?.phoneNumber as string)?.trim();
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "MP3 file is required" });
      }

      // Auto-detect duration from the uploaded MP3
      let recordingDuration: number | null = null;
      try {
        const metadata = await mm.parseFile(req.file.path);
        const durationSec = metadata.format.duration;
        if (durationSec != null) {
          recordingDuration = Math.round(durationSec);
        }
      } catch (metaErr) {
        console.warn("[admin] Could not read MP3 duration:", metaErr);
      }

      const user = await storage.getOrCreateUser(phoneNumber);
      const recordingUrl = `/uploads/${req.file.filename}`;
      const profile = await storage.upsertProfile({
        userId: user.id,
        recordingUrl,
        recordingDuration,
        isAdminUploaded: true,
      });

      // Register this profile with the virtual caller simulator
      addVirtualCaller(user.id);

      res.json({ profile, phoneNumber: user.phoneNumber });
    } catch (e) {
      console.error("[admin] Failed to upload profile:", e);
      res.status(500).json({ message: "Failed to upload profile" });
    }
  });

  // --- Admin: Delete a profile ---
  app.delete("/api/admin/profiles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // Look up the profile before deleting so we can stop its simulation
      const allProfiles = await storage.getAllProfilesWithUsers();
      const target = allProfiles.find(p => p.id === id);
      if (target) removeVirtualCaller(target.userId);
      await storage.deleteProfile(id);
      res.status(204).send();
    } catch (e) {
      console.error("[admin] Failed to delete profile:", e);
      res.status(500).json({ message: "Failed to delete profile" });
    }
  });

  // --- Admin: Simulator status ---
  app.get("/api/admin/simulator/live", async (_req, res) => {
    try {
      const liveIds = await getLiveVirtualUserIds();
      res.json({ liveUserIds: Array.from(liveIds) });
    } catch (e) {
      res.status(500).json({ message: "Failed to get simulator status" });
    }
  });

  // ─── Admin: Region CRUD ────────────────────────────────────────────────────

  app.get("/api/regions", async (_req, res) => {
    try {
      const all = await storage.getAllRegions();
      const withStats = await Promise.all(
        all.map(async (r) => {
          const stats = await storage.getRegionStats(r.id);
          return { ...r, ...stats };
        })
      );
      res.json(withStats);
    } catch (e) {
      console.error("[regions] Failed to list regions:", e);
      res.status(500).json({ message: "Failed to fetch regions" });
    }
  });

  app.post("/api/regions", async (req, res) => {
    try {
      const { name, slug, phoneNumber, timezone, maxCapacity, description, isActive } = req.body;
      if (!name || !slug || !phoneNumber) {
        return res.status(400).json({ message: "name, slug, and phoneNumber are required" });
      }
      const region = await storage.createRegion({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        phoneNumber: phoneNumber.trim(),
        timezone: timezone?.trim() || "America/New_York",
        maxCapacity: maxCapacity ? parseInt(maxCapacity) : 1000,
        description: description?.trim() || null,
        isActive: isActive !== false,
      });
      res.status(201).json(region);
    } catch (e: any) {
      console.error("[regions] Failed to create region:", e);
      if (e?.message?.includes("unique")) {
        return res.status(409).json({ message: "A region with that slug already exists" });
      }
      res.status(500).json({ message: "Failed to create region" });
    }
  });

  app.put("/api/regions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, slug, phoneNumber, timezone, maxCapacity, description, isActive } = req.body;
      const region = await storage.updateRegion(id, {
        ...(name !== undefined && { name: name.trim() }),
        ...(slug !== undefined && { slug: slug.trim().toLowerCase() }),
        ...(phoneNumber !== undefined && { phoneNumber: phoneNumber.trim() }),
        ...(timezone !== undefined && { timezone: timezone.trim() }),
        ...(maxCapacity !== undefined && { maxCapacity: parseInt(maxCapacity) }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      });
      res.json(region);
    } catch (e: any) {
      console.error("[regions] Failed to update region:", e);
      res.status(500).json({ message: "Failed to update region" });
    }
  });

  app.delete("/api/regions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteRegion(id);
      res.status(204).send();
    } catch (e) {
      console.error("[regions] Failed to delete region:", e);
      res.status(500).json({ message: "Failed to delete region" });
    }
  });

  // --- Twilio Voice Webhooks ---

  async function getOrCreateUser(phoneNumber: string) {
    let user = await storage.getUserByPhone(phoneNumber);
    if (!user) {
      user = await storage.createUser({ phoneNumber });
    }
    return user;
  }

  // Deducts accumulated phone booth time from the caller's balance.
  // Removes the session from phoneBoothSessions and writes to DB.
  // Returns the number of minutes deducted (0 if no active session).
  async function deductPhoneBoothTime(callSid: string): Promise<number> {
    const session = phoneBoothSessions.get(callSid);
    if (!session) return 0;
    phoneBoothSessions.delete(callSid);
    const elapsed = Math.max(1, Math.ceil((Date.now() - session.enteredAt.getTime()) / 60_000));
    try {
      const user = await storage.getOrCreateUser(session.fromNumber);
      await storage.deductMinutes(user.id, elapsed);
      console.log(`[voice] Phone booth: deducted ${elapsed} min from userId=${user.id}`);
    } catch (err) {
      console.error("[voice] Failed to deduct phone booth time:", err);
    }
    return elapsed;
  }

  // ─── Call Status Callback ──────────────────────────────────────────────────
  // Twilio POSTs here when a call ends (completed/failed/canceled/etc.)
  // This is how we remove callers from the active party line in real time.
  app.post("/voice/status", async (req, res) => {
    const callSid = req.body?.CallSid;
    const callStatus = req.body?.CallStatus;
    console.log(`[status] Call ${callSid} → ${callStatus}`);

    const terminalStatuses = ["completed", "failed", "busy", "no-answer", "canceled"];
    if (callSid && terminalStatuses.includes(callStatus)) {
      // If the call ended while the caller was in the phone booth, deduct their remaining session time
      if (phoneBoothSessions.has(callSid)) {
        await deductPhoneBoothTime(callSid);
      }

      try {
        await storage.removeActiveCall(callSid);
        console.log(`[status] Removed ${callSid} from active calls`);
      } catch (err) {
        console.error(`[status] Error removing active call ${callSid}:`, err);
      }
      // Clean up per-caller browse queue, payment session, name recording, greeting draft, time flags, and region mapping
      callerBrowseState.delete(callSid);
      paymentSessions.delete(callSid);
      pendingNameRecordings.delete(callSid);
      pendingGreetingDrafts.delete(callSid);
      callTimeAnnounced.delete(callSid);
      callWarningShown.delete(callSid);
      callRegion.delete(callSid);
    }

    // Twilio expects a 2xx response; no TwiML needed for status callbacks
    res.status(204).send();
  });

  // ─── 1. Initial Webhook: POST /voice ──────────────────────────────────────
  app.post("/voice", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From;
    const callSid = req.body?.CallSid;

    if (!fromNumber || !callSid) {
      playPrompt(twiml, req, "no_caller_id.mp3", "We could not identify your call. Goodbye.");
      twiml.hangup();
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      // Clean up any stale calls (safety valve for missed status callbacks)
      await storage.removeStaleActiveCalls(90);

      let user = await getOrCreateUser(fromNumber);

      // Grant a free trial to brand-new callers who have no membership yet
      if (!user.membershipTier) {
        user = await storage.updateUserMembership(user.id, {
          membershipTier: "free_trial",
          remainingMinutes: FREE_TRIAL_MINUTES,
        });
        console.log(`[voice] Granted ${FREE_TRIAL_MINUTES}-minute free trial to userId=${user.id}`);
      }

      // Mark this caller as active on the party line
      await storage.registerActiveCall(callSid, user.id);
      console.log(`[voice] Registered active call ${callSid} for userId=${user.id}`);

      // Register the hangup callback so we remove them when they disconnect
      registerStatusCallback(callSid, req).catch(() => {});

      const profile = await storage.getProfile(user.id);
      if (!profile) {
        playPrompt(twiml, req, "welcome_record_name.mp3", "Welcome! Before using the system you must create a short voice profile. First, say your first name only after the tone. You have 5 seconds.");
        twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      } else {
        twiml.redirect("/voice/greeting-setup");
      }
    } catch (error) {
      console.error("[voice] /voice error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 2a. Save Name Recording ──────────────────────────────────────────────
  // First step of profile creation: record the caller's first name (≤5 seconds).
  // Stores the name recording in memory then prompts for the greeting.
  app.post("/voice/save-name", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const nameRecordingUrl = req.body?.RecordingUrl as string;
    const nameDuration = parseInt(req.body?.RecordingDuration) || 0;

    if (!nameRecordingUrl || nameDuration < 1) {
      playPrompt(twiml, req, "name_retry.mp3", "We didn't catch your name. Please try again.");
      twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Hold the name recording until the greeting is saved
    pendingNameRecordings.set(callSid, nameRecordingUrl);

    playPrompt(twiml, req, "name_saved_record_greeting.mp3", "Great. Now record your greeting for other callers. After the tone, you have 60 seconds.");
    twiml.record({ maxLength: 60, playBeep: true, action: "/voice/save-profile" });
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 2b. Save Profile Greeting ────────────────────────────────────────────
  // Second step (or standalone re-record). Saves the greeting and, if present,
  // links the name recording captured just before it.
  app.post("/voice/save-profile", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From;
      const callSid = req.body?.CallSid as string;
      const recordingUrl = req.body?.RecordingUrl;
      const recordingDuration = parseInt(req.body?.RecordingDuration) || 0;

      if (!fromNumber || !recordingUrl) {
        throw new Error(`Missing fields: From=${fromNumber}, RecordingUrl=${recordingUrl}`);
      }

      // Reject greetings shorter than 3 seconds — play error audio and re-prompt
      if (recordingDuration < 3) {
        playPrompt(twiml, req, "greeting_error.mp3", "That greeting was too short. Please try again after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: "/voice/save-profile" });
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // Consume any pending name recording from the prior step
      const nameRecordingUrl = pendingNameRecordings.get(callSid) ?? undefined;
      if (nameRecordingUrl) pendingNameRecordings.delete(callSid);

      // Store as draft — only written to DB once the caller accepts in REVIEW_GREETING
      pendingGreetingDrafts.set(callSid, { nameRecordingUrl, greetingRecordingUrl: recordingUrl, greetingDuration: recordingDuration });
      twiml.redirect("/voice/review-greeting");
    } catch (error) {
      console.error("[voice] /voice/save-profile error:", error);
      playPrompt(twiml, req, "profile_save_error.mp3", "We could not save your profile. Please try again.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 3. Main Menu ─────────────────────────────────────────────────────────
  app.post("/voice/main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid  = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const remaining = user.remainingMinutes ?? 0;

      // ── Access expired ──────────────────────────────────────────────────
      if (user.membershipTier && remaining <= 0) {
        playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
        twiml.redirect("/voice/membership-purchase");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── 15-minute warning at main menu (shown once per call) ────────────
      if (user.membershipTier && remaining < 15 && remaining > 0 && !callWarningShown.has(callSid)) {
        callWarningShown.add(callSid);
        twiml.redirect("/voice/time-warning");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── First-visit balance announcement ────────────────────────────────
      if (user.membershipTier && remaining > 0 && !callTimeAnnounced.has(callSid)) {
        callTimeAnnounced.add(callSid);
        playTimeRemaining(twiml, req, remaining);
      }
    } catch (err) {
      console.error("[voice] main-menu time check error:", err);
    }

    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-main-menu" });
    playPrompt(gather, req, "main_menu.mp3", "Welcome to the voice line. Press 1 to listen to profiles. Press 2 to re-record your profile. Press 4 for information, prices, and membership.");
    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4. Handle Main Menu ──────────────────────────────────────────────────
  app.post("/voice/handle-main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "1") {
      twiml.redirect("/voice/browse-profiles");
    } else if (digit === "2") {
      playPrompt(twiml, req, "rerecord_name.mp3", "Let's re-record your profile. First, say your first name only after the tone. You have 5 seconds.");
      twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
    } else if (digit === "4") {
      twiml.redirect("/voice/info-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4b. Time Warning ─────────────────────────────────────────────────────
  // Played once per call when the caller has < 15 minutes of access remaining.
  app.post("/voice/time-warning", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    let isFreeTrialCaller = false;
    try {
      const user = await getOrCreateUser(fromNumber);
      isFreeTrialCaller = user.membershipTier === "free_trial";
    } catch (err) {
      console.error("[voice] time-warning user lookup error:", err);
    }

    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-time-warning", finishOnKey: "#" });
    if (isFreeTrialCaller) {
      playPrompt(gather, req, "trial_warning.mp3",
        "You have less than 15 minutes remaining in your free trial. " +
        "Stay connected by joining now. " +
        "You won't be interrupted by ads. " +
        "Access member only features like off-line messaging, connect live for one on one chat. " +
        "To join right now press 1. " +
        "To continue press pound."
      );
    } else {
      playPrompt(gather, req, "member_warning.mp3",
        "You have less than 15 minutes remaining in your membership. " +
        "To renew now press 1. " +
        "To continue press pound."
      );
    }

    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-time-warning", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;

    if (digit === "1") {
      twiml.redirect("/voice/membership-purchase");
    } else {
      // # or anything else → continue into the system
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 5. Greeting Setup ────────────────────────────────────────────────────
  // Gate shown to RETURNING callers before entering the live system.
  // First-time callers skip this and go straight to the record-name flow.
  app.post("/voice/greeting-setup", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-greeting-setup", finishOnKey: "#" });
    playPrompt(gather, req, "greeting_setup.mp3",
      "Your last greeting you recorded is still available. " +
      "To use it again, press 1. " +
      "To record a new greeting, press 2. " +
      "To hear your greeting, press 3. " +
      "To repeat these choices, press 9. " +
      "To continue, press pound."
    );
    twiml.redirect("/voice/greeting-setup");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-greeting-setup", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    // digit "" means the caller pressed # (finishOnKey) with no preceding digit → treat as "use existing"
    if (digit === "1" || digit === "" || !digit) {
      // USE_EXISTING_GREETING: fast-path, no prompt, straight to main menu
      twiml.redirect("/voice/main-menu");
    } else if (digit === "2") {
      // CREATE_NEW_GREETING: kick off the record-name flow
      playPrompt(twiml, req, "welcome_record_name.mp3",
        "Say your first name only after the tone. You have 5 seconds."
      );
      twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
    } else if (digit === "3") {
      // HEAR existing greeting then loop back
      try {
        const user = await getOrCreateUser(fromNumber);
        const profile = await storage.getProfile(user.id);
        if (profile?.recordingUrl) {
          if (profile.nameRecordingUrl) {
            twiml.play(audioProxyUrl(profile.nameRecordingUrl, req));
          }
          twiml.play(audioProxyUrl(profile.recordingUrl, req));
        } else {
          playPrompt(twiml, req, "no_greeting_found.mp3", "No greeting found.");
        }
      } catch (err) {
        console.error("[voice] handle-greeting-setup hear error:", err);
        playPrompt(twiml, req, "error_generic.mp3", "Could not retrieve your greeting.");
      }
      twiml.redirect("/voice/greeting-setup");
    } else {
      // 9 or anything else → repeat
      twiml.redirect("/voice/greeting-setup");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 5b. Review Greeting ──────────────────────────────────────────────────
  // Presented after recording a new greeting (first-time or re-record).
  // The draft is held in pendingGreetingDrafts until the caller presses 3 to accept.
  app.post("/voice/review-greeting", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-review-greeting" });
    playPrompt(gather, req, "review_greeting.mp3",
      "To hear your greeting, press 1. " +
      "To re-record, press 2. " +
      "To accept and continue, press 3. " +
      "To repeat these choices, press 9."
    );
    twiml.redirect("/voice/review-greeting");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-review-greeting", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    const draft = pendingGreetingDrafts.get(callSid);

    try {
      if (digit === "1") {
        // Play back the draft recording(s) then return to review menu
        if (draft?.nameRecordingUrl) {
          twiml.play(audioProxyUrl(draft.nameRecordingUrl, req));
        }
        if (draft?.greetingRecordingUrl) {
          twiml.play(audioProxyUrl(draft.greetingRecordingUrl, req));
        } else {
          playPrompt(twiml, req, "no_greeting_found.mp3", "No recording found.");
        }
        twiml.redirect("/voice/review-greeting");
      } else if (digit === "2") {
        // Re-record from scratch — discard draft and restart name step
        pendingGreetingDrafts.delete(callSid);
        playPrompt(twiml, req, "welcome_record_name.mp3",
          "Say your first name only after the tone. You have 5 seconds."
        );
        twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      } else if (digit === "3") {
        // Accept — write draft to DB and proceed to main menu
        if (!draft) {
          playPrompt(twiml, req, "session_expired_greeting.mp3", "Your session has expired. Please re-record your greeting.");
          playPrompt(twiml, req, "welcome_record_name.mp3",
            "Say your first name only after the tone. You have 5 seconds."
          );
          twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
        } else {
          const user = await getOrCreateUser(fromNumber);
          await storage.upsertProfile({
            userId: user.id,
            nameRecordingUrl: draft.nameRecordingUrl,
            recordingUrl: draft.greetingRecordingUrl,
            recordingDuration: draft.greetingDuration,
          });
          pendingGreetingDrafts.delete(callSid);
          playPrompt(twiml, req, "profile_saved.mp3", "Your greeting has been saved.");
          twiml.redirect("/voice/main-menu");
        }
      } else {
        // 9 or anything else → repeat review menu
        twiml.redirect("/voice/review-greeting");
      }
    } catch (error) {
      console.error("[voice] /voice/handle-review-greeting error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 6. Browse Profiles ───────────────────────────────────────────────────
  // Only shows profiles of callers currently active on the party line.
  app.post("/voice/browse-profiles", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From;
      if (!fromNumber) throw new Error("Missing From field in browse-profiles");

      const user = await getOrCreateUser(fromNumber);
      const callSid = req.body?.CallSid as string;
      const regionId = callRegion.get(callSid);

      // Count available profiles: active callers + admin-uploaded greetings (region-scoped)
      const availableCount = await storage.getAvailableProfileCount(user.id, regionId);
      // Caller count is system-wide (no region filter) so virtual callers with no region are included
      const activeCallerCount = await storage.getActiveCallerCount(user.id);
      console.log(`[voice] browse-profiles: userId=${user.id}, regionId=${regionId}, activeOtherCallers=${activeCallerCount}, availableProfiles=${availableCount}`);

      if (availableCount === 0) {
        playPrompt(twiml, req, "no_profiles.mp3", "There are no profiles available right now. Please call back later.");
        twiml.redirect("/voice/main-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }


      // Check for unread messages first
      const unreadMessage = await storage.getUnreadMessage(user.id);

      if (unreadMessage) {
        // Fetch sender's profile to get their name recording
        const senderProfile = await storage.getProfile(unreadMessage.fromUserId);

        // Nest <Play> + name announcement inside <Gather>
        const msgGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-message-menu?msgId=${unreadMessage.id}&senderId=${unreadMessage.fromUserId}`,
          timeout: 10,
        });
        if (senderProfile?.nameRecordingUrl) {
          msgGather.say("New message.");
          msgGather.play(audioProxyUrl(senderProfile.nameRecordingUrl, req));
          msgGather.say("has sent you a message.");
        } else {
          msgGather.say("You have a new message.");
        }
        msgGather.play(audioProxyUrl(unreadMessage.recordingUrl, req));
        playPrompt(msgGather, req, "message_options.mp3", "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles. Press 9 to return to the main menu.");
        twiml.redirect("/voice/main-menu");
      } else {
        // Build the queue once per caller, then advance position on each visit
        let state = callerBrowseState.get(callSid);
        if (!state) {
          const allProfiles = await storage.getAllActiveProfiles(user.id, regionId);
          state = { queue: allProfiles.map(p => ({ userId: p.userId, recordingUrl: p.recordingUrl, nameRecordingUrl: p.nameRecordingUrl })), index: 0 };
          callerBrowseState.set(callSid, state);
          console.log(`[voice] browse-profiles: built queue of ${state.queue.length} profiles for ${callSid}`);
        }

        if (state.queue.length === 0) {
          playPrompt(twiml, req, "no_profiles.mp3", "No profiles are available right now. Please try again later.");
          twiml.redirect("/voice/main-menu");
        } else {
          const profile = state.queue[state.index];

          // Advance index, wrapping at end of queue
          state.index = (state.index + 1) % state.queue.length;

          const playUrl = audioProxyUrl(profile.recordingUrl, req);
          console.log(`[voice] Playing profile userId=${profile.userId} (position ${state.index}/${state.queue.length}) url=${playUrl}`);

          // Announce caller count only at the very start of the queue
          if (state.index === 1) {
            playCallerCount(twiml, req, activeCallerCount);
          }

          // Nest <Play> inside <Gather> — pressing 2 during the greeting skips to the next one
          const profileGather = twiml.gather({
            numDigits: 1,
            action: `/voice/handle-profile-menu?profileUserId=${profile.userId}`,
            timeout: 10,
          });
          profileGather.play(playUrl);
          playPrompt(profileGather, req, "profile_options.mp3", "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 9 to return to main menu.");
          twiml.redirect("/voice/main-menu");
        }
      }
    } catch (error) {
      console.error("[voice] /voice/browse-profiles error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred while browsing. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
    }

    const xml = twiml.toString();
    console.log(`[voice] browse-profiles TwiML:\n${xml}`);
    res.type("text/xml");
    res.send(xml);
  });

  // ─── 6. Handle Message Menu ───────────────────────────────────────────────
  app.post("/voice/handle-message-menu", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const digit = req.body?.Digits;
      const msgId = req.query.msgId as string;
      const senderId = req.query.senderId as string;

      if (digit === "1") {
        await storage.markMessageRead(msgId);
        playPrompt(twiml, req, "record_reply.mp3", "Record your reply after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${senderId}` });
      } else if (digit === "2") {
        const senderProfile = await storage.getProfile(senderId);
        const senderGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-sender-profile-menu?senderId=${senderId}&msgId=${msgId}`,
          timeout: 10,
        });
        if (senderProfile) {
          // Nested inside gather so pressing 2 during playback skips immediately
          senderGather.play(audioProxyUrl(senderProfile.recordingUrl, req));
        } else {
          senderGather.say("This caller no longer has a profile.");
        }
        senderGather.say("Press 1 to send a message. Press 2 to continue browsing. Press 9 for main menu.");
        twiml.redirect("/voice/main-menu");
      } else if (digit === "3") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "9") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/main-menu");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[voice] /voice/handle-message-menu error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 7. Handle Sender Profile Menu ───────────────────────────────────────
  app.post("/voice/handle-sender-profile-menu", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const digit = req.body?.Digits;
      const senderId = req.query.senderId as string;
      const msgId = req.query.msgId as string;

      if (digit === "1") {
        await storage.markMessageRead(msgId);
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${senderId}` });
      } else if (digit === "2") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "9") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/main-menu");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[voice] /voice/handle-sender-profile-menu error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 8. Handle Profile Menu ───────────────────────────────────────────────
  app.post("/voice/handle-profile-menu", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const digit = req.body?.Digits;
      const profileUserId = req.query.profileUserId as string;

      if (digit === "1") {
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${profileUserId}` });
      } else if (digit === "2") {
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "9") {
        twiml.redirect("/voice/main-menu");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[voice] /voice/handle-profile-menu error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 9. Save Message ──────────────────────────────────────────────────────
  app.post("/voice/save-message", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From;
      const recordingUrl = req.body?.RecordingUrl;
      const toUserId = req.query.toUserId as string;

      if (!fromNumber || !recordingUrl || !toUserId) {
        throw new Error(`Missing fields: From=${fromNumber}, RecordingUrl=${recordingUrl}, toUserId=${toUserId}`);
      }

      const user = await getOrCreateUser(fromNumber);
      await storage.createMessage({ fromUserId: user.id, toUserId, recordingUrl });
      playPrompt(twiml, req, "message_sent.mp3", "Your message has been sent. Returning to profiles.");
      twiml.redirect("/voice/browse-profiles");
    } catch (error) {
      console.error("[voice] /voice/save-message error:", error);
      playPrompt(twiml, req, "message_send_error.mp3", "Failed to send your message. Returning to profiles.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 10. Info Menu ────────────────────────────────────────────────────────
  app.post("/voice/info-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-info-menu" });
    playPrompt(gather, req, "info_menu.mp3", "Information, prices, and membership. Press 1 for membership questions. Press 9 to return to the main menu.");
    twiml.redirect("/voice/info-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-info-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "1") {
      twiml.redirect("/voice/membership-questions");
    } else if (digit === "9") {
      twiml.redirect("/voice/main-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/info-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 11. Membership Questions ─────────────────────────────────────────────
  app.post("/voice/membership-questions", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-membership-questions" });
    playPrompt(gather, req, "membership_questions.mp3", "Membership questions. Press 1 to learn how membership works. Press 2 to hear our pricing. Press 3 to purchase a membership with a credit card. Press 9 to return to the main menu.");
    twiml.redirect("/voice/membership-questions");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-membership-questions", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "1") {
      twiml.redirect("/voice/membership-how-it-works");
    } else if (digit === "2") {
      twiml.redirect("/voice/membership-pricing");
    } else if (digit === "3") {
      twiml.redirect("/voice/membership-purchase");
    } else if (digit === "9") {
      twiml.redirect("/voice/main-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/membership-questions");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 12. How Membership Works ─────────────────────────────────────────────
  app.post("/voice/membership-how-it-works", async (req, res) => {
    const twiml = new VoiceResponse();
    playPrompt(twiml, req, "membership_how_it_works.mp3",
      "Here is how membership works. " +
      "As a member, you get full access to the voice line community. " +
      "Members can browse unlimited caller profiles, send and receive voice messages, and enjoy priority access to new features. " +
      "We offer three membership options: a 24 hour pass, a 14 day membership, and a 30 day membership. " +
      "Your remaining time is tracked in hours. When you have less than 60 minutes left, the system will tell you in minutes. " +
      "Choose the option that works best for you."
    );
    twiml.redirect("/voice/membership-questions");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 13. Membership Pricing ───────────────────────────────────────────────
  app.post("/voice/membership-pricing", async (req, res) => {
    const twiml = new VoiceResponse();
    playPrompt(twiml, req, "membership_pricing.mp3",
      "Here are our membership prices. " +
      "A 24 hour pass is 3 dollars. " +
      "A 14 day membership is 10 dollars. " +
      "A 30 day membership is 25 dollars. " +
      "To purchase, press 3 from the membership menu."
    );
    twiml.redirect("/voice/membership-questions");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 14. Membership Purchase ──────────────────────────────────────────────
  app.post("/voice/membership-purchase", async (req, res) => {
    const twiml = new VoiceResponse();
    const audioUrl = `${baseUrl(req)}/uploads/membership_packages_1774058642428.mp3`;
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-package-selection", finishOnKey: "" });
    gather.play(audioUrl);
    twiml.redirect("/voice/membership-purchase");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-package-selection", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    // Press # to cancel
    if (digit === "#") {
      playPrompt(twiml, req, "package_cancelled.mp3", "Cancelled. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Press 9 to repeat
    if (digit === "9") {
      twiml.redirect("/voice/membership-purchase");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const pkg = MEMBERSHIP_PACKAGES[digit];
    if (!pkg) {
      playPrompt(twiml, req, "package_invalid.mp3", "Invalid selection.");
      twiml.redirect("/voice/membership-purchase");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Detect first purchase for the 14-day package bonus
    let isFirstPurchase = false;
    if (pkg.name === "14day") {
      try {
        const user = await getOrCreateUser(fromNumber);
        isFirstPurchase = !user.membershipTier;
      } catch {
        isFirstPurchase = false;
      }
    }

    paymentSessions.set(callSid, {
      packageName: pkg.name,
      packageLabel: pkg.label,
      packagePriceCents: pkg.priceCents,
      priceLabel: pkg.priceLabel,
      isFirstPurchase,
    });

    if (pkg.name === "14day" && isFirstPurchase) {
      playPrompt(twiml, req, "package_confirm_14day_bonus.mp3", `Great choice! You selected 14 days access for ${pkg.priceLabel}, including your free 7-day first purchase bonus.`);
    } else if (pkg.name === "30day") {
      playPrompt(twiml, req, "package_confirm_30day.mp3", `You selected ${pkg.label} access for ${pkg.priceLabel}.`);
    } else if (pkg.name === "14day") {
      playPrompt(twiml, req, "package_confirm_14day.mp3", `You selected ${pkg.label} access for ${pkg.priceLabel}.`);
    } else if (pkg.name === "24hour") {
      playPrompt(twiml, req, "package_confirm_24hour.mp3", `You selected ${pkg.label} access for ${pkg.priceLabel}.`);
    } else {
      twiml.say(`You selected ${pkg.label} access for ${pkg.priceLabel}.`);
    }
    twiml.play(`${baseUrl(req)}/uploads/payment_intro_1774066491415.mp3`);

    // ── Twilio <Pay> verb: PCI-compliant card collection ────────────────────
    // Twilio collects card number, expiry, and CVV directly in its own
    // secure environment — raw card data never reaches this server.
    // Requires a Pay Connector (Stripe) configured in your Twilio Console
    // under Account › Payments › Manage Pay Connectors.
    // Set TWILIO_PAY_CONNECTOR env var to the unique name of that connector
    // (default: "stripe").
    const connectorName = process.env.TWILIO_PAY_CONNECTOR || "stripe";
    const chargeAmount = (pkg.priceCents / 100).toFixed(2);

    twiml.pay({
      action: `${baseUrl(req)}/voice/handle-payment-complete`,
      chargeAmount,
      currency: "usd",
      description: `${pkg.label} Membership — VOICE PROTOCOL`,
      paymentConnector: connectorName,
      postalCode: false,
      securityCode: true,
      timeout: 30,
      maxAttempts: 2,
    } as any);

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 15. Payment Result Handler ───────────────────────────────────────────
  // Twilio posts here after <Pay> completes — with a token, never raw card data
  app.post("/voice/handle-payment-complete", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const result = (req.body?.Result as string) || "";
    const fromNumber = req.body?.From as string;
    const errorCode = req.body?.ErrorCode as string;

    const session = paymentSessions.get(callSid);
    paymentSessions.delete(callSid);

    if (!session) {
      playPrompt(twiml, req, "payment_session_expired.mp3", "Your session has expired. Please try again.");
      twiml.redirect("/voice/main-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    if (result === "success") {
      try {
        const user = await getOrCreateUser(fromNumber);
        const pkg = Object.values(MEMBERSHIP_PACKAGES).find(p => p.name === session.packageName);
        const minutes = pkg?.minutes ?? 1440;
        const bonusMinutes = (session.packageName === "14day" && session.isFirstPurchase) ? minutes : 0;
        const totalMinutes = minutes + bonusMinutes;
        await storage.updateUserMembership(user.id, {
          membershipTier: session.packageName,
          remainingMinutes: totalMinutes,
        });

        const bonusMsg = bonusMinutes > 0
          ? ` Plus your bonus ${bonusMinutes} minutes have been added — enjoy ${totalMinutes} minutes total!`
          : "";
        const successText =
          `Payment successful! You now have ${session.packageLabel} access. ` +
          `Your card has been charged ${session.priceLabel}.${bonusMsg} ` +
          "Thank you for joining. Returning to the main menu.";
        if (session.packageName === "30day") {
          playPrompt(twiml, req, "payment_success_30day.mp3", successText);
        } else if (session.packageName === "14day" && bonusMinutes > 0) {
          playPrompt(twiml, req, "payment_success_14day_bonus.mp3", successText);
        } else if (session.packageName === "14day") {
          playPrompt(twiml, req, "payment_success_14day.mp3", successText);
        } else if (session.packageName === "24hour") {
          playPrompt(twiml, req, "payment_success_24hour.mp3", successText);
        } else {
          twiml.say(successText);
        }
      } catch (err) {
        console.error("[voice] membership activation error after payment:", err);
        playPrompt(twiml, req, "payment_activation_error.mp3", "Your payment was received but there was an error activating your membership. Please contact support.");
      }
    } else {
      console.warn(`[voice] payment failed — CallSid=${callSid} ErrorCode=${errorCode}`);
      // Error code 22001 = card declined; 22002 = processing failure
      if (errorCode === "22001") {
        playPrompt(twiml, req, "payment_declined.mp3", "Your card was declined. Please check your details and try again later.");
      } else {
        playPrompt(twiml, req, "payment_failed.mp3", "Your payment could not be completed at this time. Please try again later.");
      }
    }

    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Regional Entry: POST /voice/:slug ────────────────────────────────────
  // Each region gets its own Twilio webhook URL, e.g. /voice/denver
  // This must be defined AFTER all specific /voice/xxx routes so it only
  // catches unmatched slugs (e.g. region names, not "status", "main-menu", etc.)
  app.post("/voice/:slug", async (req, res) => {
    const twiml = new VoiceResponse();
    const { slug } = req.params;
    const fromNumber = req.body?.From;
    const callSid = req.body?.CallSid;

    if (!fromNumber || !callSid) {
      playPrompt(twiml, req, "no_caller_id.mp3", "We could not identify your call. Goodbye.");
      twiml.hangup();
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      const region = await storage.getRegionBySlug(slug);

      if (!region) {
        playPrompt(twiml, req, "region_not_active.mp3", "This phone number is not currently active. Please try again later.");
        twiml.hangup();
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      if (!region.isActive) {
        playPrompt(twiml, req, "region_unavailable.mp3", "This market is temporarily unavailable. Please try again later.");
        twiml.hangup();
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // Tag this call with its region for the duration of the session
      callRegion.set(callSid, region.id);

      // Clean up any stale calls
      await storage.removeStaleActiveCalls(90);

      let user = await getOrCreateUser(fromNumber);

      // Grant a free trial to brand-new callers who have no membership yet
      if (!user.membershipTier) {
        user = await storage.updateUserMembership(user.id, {
          membershipTier: "free_trial",
          remainingMinutes: FREE_TRIAL_MINUTES,
        });
        console.log(`[voice] [${region.slug}] Granted ${FREE_TRIAL_MINUTES}-minute free trial to userId=${user.id}`);
      }

      // Register call as active — scoped to this region
      await storage.registerActiveCall(callSid, user.id, region.id);
      console.log(`[voice] [${region.slug}] Registered active call ${callSid} for userId=${user.id}`);

      registerStatusCallback(callSid, req).catch(() => {});

      const profile = await storage.getProfile(user.id);
      if (!profile) {
        playPrompt(twiml, req, "welcome_record_name.mp3", "Welcome! Before using the system you must create a short voice profile. First, say your first name only after the tone. You have 5 seconds.");
        twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      } else {
        twiml.redirect("/voice/greeting-setup");
      }
    } catch (error) {
      console.error(`[voice] /voice/${slug} error:`, error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  return httpServer;
}
