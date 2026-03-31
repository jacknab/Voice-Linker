import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import type { MembershipSettings } from "@shared/schema";
import express from "express";
import twilio from "twilio";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as mm from "music-metadata";
import { addVirtualCaller, removeVirtualCaller, getLiveVirtualUserIds } from "./simulator";
import { generateTTS, listVoices } from "./elevenlabs";
import { lookupZipCode } from "./zipLookup";

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

// ─── Membership Settings Cache ─────────────────────────────────────────────
// Settings are loaded from DB and cached for 60 seconds to avoid hitting
// the DB on every incoming call.

let _cachedSettings: MembershipSettings | null = null;
let _cacheExpiresAt = 0;

async function getMembershipSettingsCached(): Promise<MembershipSettings> {
  if (_cachedSettings && Date.now() < _cacheExpiresAt) return _cachedSettings;
  _cachedSettings = await storage.getMembershipSettings();
  _cacheExpiresAt = Date.now() + 60_000;
  return _cachedSettings;
}

function invalidateMembershipSettingsCache(): void {
  _cachedSettings = null;
  _cacheExpiresAt = 0;
}

function centsToLabel(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `${dollars} dollars` : `${dollars.toFixed(2)} dollars`;
}

type MembershipPackage = { name: string; label: string; minutes: number; priceCents: number; priceLabel: string };

async function getMembershipPackages(): Promise<Record<string, MembershipPackage>> {
  const s = await getMembershipSettingsCached();
  return {
    "1": { name: "plan1", label: `${s.plan1Minutes.toLocaleString()} Minute`, minutes: s.plan1Minutes, priceCents: s.plan1PriceCents, priceLabel: centsToLabel(s.plan1PriceCents) },
    "2": { name: "plan2", label: `${s.plan2Minutes.toLocaleString()} Minute`, minutes: s.plan2Minutes, priceCents: s.plan2PriceCents, priceLabel: centsToLabel(s.plan2PriceCents) },
    "3": { name: "plan3", label: `${s.plan3Minutes.toLocaleString()} Minute`, minutes: s.plan3Minutes, priceCents: s.plan3PriceCents, priceLabel: centsToLabel(s.plan3PriceCents) },
  };
}

// Hundreds word lookup for TTS fallback text
const HUNDREDS_WORDS: Record<number, string> = {
  100: "one hundred", 200: "two hundred", 300: "three hundred",
  400: "four hundred", 500: "five hundred", 600: "six hundred",
  700: "seven hundred", 800: "eight hundred", 900: "nine hundred",
};

// Speak a number using the minimum set of recorded files:
//   0–19    → single file each  (num_0.mp3 … num_19.mp3)
//   20–99   → tens file + ones file if non-zero
//              e.g. 23 → num_20.mp3 + num_3.mp3
//              e.g. 40 → num_40.mp3 only
//   100–999 → hundreds file + tens/ones as above
//              e.g. 336 → num_300.mp3 + num_30.mp3 + num_6.mp3
//              e.g. 720 → num_700.mp3 + num_20.mp3
//   1000+   → TTS fallback (not reachable with current membership values)
function playNumber(
  twiml: { say: (text: string) => void; play: (url: string) => void },
  req: Request,
  n: number
): void {
  if (n >= 1000) {
    twiml.say(String(n));
    return;
  }
  if (n >= 100) {
    const hundreds = Math.floor(n / 100) * 100;
    playPrompt(twiml, req, `num_${hundreds}.mp3`, HUNDREDS_WORDS[hundreds] ?? String(hundreds));
    n = n % 100;
    if (n === 0) return;
  }
  if (n <= 19) {
    playPrompt(twiml, req, `num_${n}.mp3`, String(n));
  } else {
    const tens = Math.floor(n / 10) * 10;
    const ones = n % 10;
    playPrompt(twiml, req, `num_${tens}.mp3`, String(tens));
    if (ones > 0) {
      playPrompt(twiml, req, `num_${ones}.mp3`, String(ones));
    }
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
  queue: { userId: string; recordingUrl: string; nameRecordingUrl?: string | null; isNearby?: boolean }[];
  index: number;
  hasWrapped: boolean;        // true after the queue index cycled back to 0
  linkedRegionLoaded: boolean; // true once the linked-region offer has been made (or skipped)
  localUserIds: string[];      // user IDs from the original local-region queue snapshot
  announcedNewLocalIds: string[]; // new local callers already announced during linked browsing
}
const callerBrowseState = new Map<string, CallerBrowseState>();

// Maps CallSid → regionId for the duration of a call
const callRegion = new Map<string, string>();

// ─── Live 1-on-1 Connect State ─────────────────────────────────────────────
// Invite stored by targetUserId so the invitee can find it when they next browse
interface LiveConnectInvite {
  initiatorCallSid: string;
  initiatorUserId: string;
  initiatorNameRecordingUrl?: string | null;
  initiatorGreetingUrl: string;
  conferenceRoom: string;
  createdAt: number;
  status: "pending" | "accepted" | "declined";
}
const pendingLiveInvites = new Map<string, LiveConnectInvite>(); // targetUserId → invite

// Track which userIds are currently bridged in a live connection
const liveConnectionUserIds = new Set<string>();
// callSid → userId so we can clean up on hangup
const liveConnectionCallSidMap = new Map<string, string>();

// Live billing: real-time per-second tracking while two callers are connected
interface LiveBillingSession {
  intervalId: NodeJS.Timeout;
  initiatorCallSid: string;
  inviteeCallSid: string;
  initiatorUserId: string;
  inviteeUserId: string;
  room: string;
  storedBaseUrl: string;
  initiatorWarned: boolean;
  inviteeWarned: boolean;
}
const liveBillingSessions = new Map<string, LiveBillingSession>(); // room → session

const LIVE_TICK_MS = 5_000;             // deduct every 5 seconds
const LIVE_LOW_BALANCE_SECONDS = 300;   // warn at < 5 minutes remaining

// How long (ms) an invite stays valid. Covers: disclaimer (~3s) + "Calling now" (~3s) + ringing (~15s) + buffer
const LIVE_INVITE_TTL_MS = 30_000;

// Per-call flags — track whether time announcements have been made this session
const callTimeAnnounced = new Set<string>(); // already heard the "you have X hours/minutes" announcement
const callWarningShown  = new Set<string>(); // already heard the < 15-minute warning

// Billing checkpoint: tracks the last sync time so seconds are deducted incrementally
// during IVR navigation (syncBilling), not just at call end.
interface BillingCheckpoint { lastCheck: number; fromNumber: string; }
const billingCheckpoints = new Map<string, BillingCheckpoint>(); // CallSid → checkpoint

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

// Returns true if Twilio credentials are configured for audio proxy
function hasTwilioCredentials(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

// Play a user-recorded audio clip safely:
// - Local /uploads/ files are always served directly
// - Twilio-hosted recordings require credentials; if missing, speak fallbackText via TTS instead
function safePlayRecording(
  node: { say: (text: string) => void; play: (url: string) => void },
  recordingUrl: string,
  req: Request,
  fallbackText = ""
): void {
  const isLocal = recordingUrl.startsWith("/uploads/");
  if (isLocal || hasTwilioCredentials()) {
    node.play(audioProxyUrl(recordingUrl, req));
  } else {
    if (fallbackText) node.say(fallbackText);
    console.warn("[audio] Skipping Twilio recording playback — credentials not configured");
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

  // ─── Admin: ElevenLabs TTS ────────────────────────────────────────────────

  // List all prompt files currently in uploads/ with their TTS-friendly name
  app.get("/api/admin/tts/prompts", (_req, res) => {
    try {
      const files = fs.readdirSync(UPLOADS_DIR)
        .filter(f => f.endsWith(".mp3"))
        .map(f => ({
          filename: f,
          url: `/uploads/${f}`,
          size: fs.statSync(path.join(UPLOADS_DIR, f)).size,
        }));
      res.json(files);
    } catch (e) {
      res.status(500).json({ message: "Failed to list prompts" });
    }
  });

  // Generate a TTS audio file via ElevenLabs and save it to uploads/
  app.post("/api/admin/tts/generate", async (req, res) => {
    try {
      const { text, filename } = req.body as { text?: string; filename?: string };
      if (!text?.trim()) return res.status(400).json({ message: "text is required" });
      if (!filename?.trim()) return res.status(400).json({ message: "filename is required" });

      // Enforce .mp3 extension and sanitize
      const safe = filename.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/\.mp3$/i, "") + ".mp3";
      await generateTTS(text.trim(), safe);
      res.json({ filename: safe, url: `/uploads/${safe}` });
    } catch (e: any) {
      console.error("[admin/tts] generation failed:", e);
      res.status(500).json({ message: e?.message ?? "TTS generation failed" });
    }
  });

  // Delete a prompt file from uploads/
  app.delete("/api/admin/tts/prompts/:filename", (req, res) => {
    try {
      const { filename } = req.params;
      if (!filename.endsWith(".mp3")) return res.status(400).json({ message: "Invalid filename" });
      const filePath = path.join(UPLOADS_DIR, filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      fs.unlinkSync(filePath);
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ message: "Failed to delete file" });
    }
  });

  // Fetch available ElevenLabs voices
  app.get("/api/admin/tts/voices", async (_req, res) => {
    try {
      const voices = await listVoices();
      res.json(voices);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to fetch voices" });
    }
  });

  // Return current voice ID setting
  app.get("/api/admin/tts/settings", (_req, res) => {
    res.json({ voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" });
  });

  // ─── Admin: Membership Settings ───────────────────────────────────────────

  app.get("/api/admin/membership-settings", async (_req, res) => {
    try {
      const settings = await storage.getMembershipSettings();
      res.json(settings);
    } catch (e) {
      console.error("[admin] Failed to get membership settings:", e);
      res.status(500).json({ message: "Failed to fetch membership settings" });
    }
  });

  app.put("/api/admin/membership-settings", async (req, res) => {
    try {
      const {
        freeTrialMinutes,
        plan1Name, plan1Minutes, plan1PriceCents,
        plan2Name, plan2Minutes, plan2PriceCents,
        plan3Name, plan3Minutes, plan3PriceCents,
        bonusPlanKey,
      } = req.body;

      const data: Record<string, number | string | null> = {};
      if (freeTrialMinutes !== undefined) data.freeTrialMinutes = parseInt(freeTrialMinutes);
      if (plan1Name !== undefined) data.plan1Name = String(plan1Name).trim();
      if (plan1Minutes !== undefined) data.plan1Minutes = parseInt(plan1Minutes);
      if (plan1PriceCents !== undefined) data.plan1PriceCents = parseInt(plan1PriceCents);
      if (plan2Name !== undefined) data.plan2Name = String(plan2Name).trim();
      if (plan2Minutes !== undefined) data.plan2Minutes = parseInt(plan2Minutes);
      if (plan2PriceCents !== undefined) data.plan2PriceCents = parseInt(plan2PriceCents);
      if (plan3Name !== undefined) data.plan3Name = String(plan3Name).trim();
      if (plan3Minutes !== undefined) data.plan3Minutes = parseInt(plan3Minutes);
      if (plan3PriceCents !== undefined) data.plan3PriceCents = parseInt(plan3PriceCents);
      if (bonusPlanKey !== undefined) data.bonusPlanKey = bonusPlanKey || null;

      const updated = await storage.updateMembershipSettings(data);
      invalidateMembershipSettingsCache();
      res.json(updated);
    } catch (e) {
      console.error("[admin] Failed to update membership settings:", e);
      res.status(500).json({ message: "Failed to update membership settings" });
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
      const { name, slug, phoneNumber, timezone, maxCapacity, description, isActive, linkedRegionId, defaultZipCode } = req.body;
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
        linkedRegionId: linkedRegionId || null,
        defaultZipCode: defaultZipCode?.trim() || null,
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
      const { name, slug, phoneNumber, timezone, maxCapacity, description, isActive, linkedRegionId, defaultZipCode } = req.body;
      const region = await storage.updateRegion(id, {
        ...(name !== undefined && { name: name.trim() }),
        ...(slug !== undefined && { slug: slug.trim().toLowerCase() }),
        ...(phoneNumber !== undefined && { phoneNumber: phoneNumber.trim() }),
        ...(timezone !== undefined && { timezone: timezone.trim() }),
        ...(maxCapacity !== undefined && { maxCapacity: parseInt(maxCapacity) }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
        ...("linkedRegionId" in req.body && { linkedRegionId: linkedRegionId || null }),
        ...("defaultZipCode" in req.body && { defaultZipCode: defaultZipCode?.trim() || null }),
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

  // Starts billing for a call. Safe to call multiple times — only initialises once.
  function startBilling(callSid: string, fromNumber: string): void {
    if (!billingCheckpoints.has(callSid)) {
      billingCheckpoints.set(callSid, { lastCheck: Date.now(), fromNumber });
      console.log(`[billing] Started for callSid=${callSid}`);
    }
  }

  // Deducts seconds elapsed since the last billing checkpoint.
  // Called before each greeting/navigation step for accurate incremental billing.
  async function syncBilling(callSid: string): Promise<void> {
    const checkpoint = billingCheckpoints.get(callSid);
    if (!checkpoint) return;
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - checkpoint.lastCheck) / 1000);
    if (elapsedSeconds <= 0) return;
    checkpoint.lastCheck = now;
    try {
      const user = await storage.getOrCreateUser(checkpoint.fromNumber);
      await storage.deductSeconds(user.id, elapsedSeconds);
      console.log(`[billing] syncBilling: deducted ${elapsedSeconds}s from userId=${user.id}`);
    } catch (err) {
      console.error("[billing] syncBilling error:", err);
    }
  }

  // Runs a final sync and clears the billing checkpoint when a call ends.
  async function finalizeCallBilling(callSid: string): Promise<void> {
    await syncBilling(callSid);
    billingCheckpoints.delete(callSid);
  }

  // ─── Live Billing Helpers ─────────────────────────────────────────────────

  // Resets IVR billing checkpoints to now for both call legs.
  // Prevents syncBilling from accumulating time gaps during a live call.
  function resetLiveBillingCheckpoints(initiatorCallSid: string, inviteeCallSid: string): void {
    const now = Date.now();
    const ic = billingCheckpoints.get(initiatorCallSid);
    if (ic) ic.lastCheck = now;
    const vc = billingCheckpoints.get(inviteeCallSid);
    if (vc) vc.lastCheck = now;
  }

  // Resolves a Twilio conference SID from its friendly name.
  async function getConferenceSid(client: ReturnType<typeof twilio>, room: string): Promise<string | null> {
    try {
      const list = await client.conferences.list({ friendlyName: room, status: "in-progress", limit: 1 });
      return list[0]?.sid ?? null;
    } catch {
      return null;
    }
  }

  // Stops the live billing interval and resets billing checkpoints.
  function stopLiveBilling(room: string): void {
    const session = liveBillingSessions.get(room);
    if (!session) return;
    clearInterval(session.intervalId);
    resetLiveBillingCheckpoints(session.initiatorCallSid, session.inviteeCallSid);
    liveBillingSessions.delete(room);
    console.log(`[live-billing] Stopped for room=${room}`);
  }

  // Stops live billing for any session that contains this callSid (for unexpected hangups).
  function stopLiveBillingByCallSid(callSid: string): void {
    for (const [room, session] of liveBillingSessions.entries()) {
      if (session.initiatorCallSid === callSid || session.inviteeCallSid === callSid) {
        stopLiveBilling(room);
        return;
      }
    }
  }

  // Starts a real-time billing interval for two callers in a live conference.
  // Ticks every LIVE_TICK_MS, deducts seconds from both callers, plays per-participant
  // low-balance warnings, and auto-disconnects a caller when their balance hits zero.
  function startLiveBilling(
    room: string,
    initiatorCallSid: string, inviteeCallSid: string,
    initiatorUserId: string, inviteeUserId: string,
    storedBaseUrl: string,
  ): void {
    if (liveBillingSessions.has(room)) return;

    // Reset IVR checkpoints so syncBilling won't double-deduct during this live call
    resetLiveBillingCheckpoints(initiatorCallSid, inviteeCallSid);

    const session: LiveBillingSession = {
      intervalId: null as unknown as NodeJS.Timeout,
      initiatorCallSid, inviteeCallSid,
      initiatorUserId, inviteeUserId,
      room, storedBaseUrl,
      initiatorWarned: false, inviteeWarned: false,
    };

    session.intervalId = setInterval(async () => {
      try {
        const s = liveBillingSessions.get(room);
        if (!s) return;

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!accountSid || !authToken) return;
        const client = twilio(accountSid, authToken);

        const tickSeconds = LIVE_TICK_MS / 1000;
        const [initiatorUser, inviteeUser] = await Promise.all([
          storage.deductSeconds(s.initiatorUserId, tickSeconds),
          storage.deductSeconds(s.inviteeUserId, tickSeconds),
        ]);

        const initiatorRemaining = initiatorUser.remainingSeconds ?? 0;
        const inviteeRemaining = inviteeUser.remainingSeconds ?? 0;
        console.log(`[live-billing] room=${room} initiator=${initiatorRemaining}s invitee=${inviteeRemaining}s`);

        const warningUrl = `${s.storedBaseUrl}/voice/live-low-balance-warning`;

        // Play low-balance warning to the specific participant only
        if (!s.initiatorWarned && initiatorRemaining > 0 && initiatorRemaining < LIVE_LOW_BALANCE_SECONDS) {
          s.initiatorWarned = true;
          const conferenceSid = await getConferenceSid(client, room);
          if (conferenceSid) {
            await client.conferences(conferenceSid)
              .participants(s.initiatorCallSid)
              .update({ announceUrl: warningUrl, announceMethod: "POST" } as any)
              .catch(e => console.error("[live-billing] Warning announce error (initiator):", e));
            console.log(`[live-billing] Low-balance warning → initiator callSid=${s.initiatorCallSid}`);
          }
        }
        if (!s.inviteeWarned && inviteeRemaining > 0 && inviteeRemaining < LIVE_LOW_BALANCE_SECONDS) {
          s.inviteeWarned = true;
          const conferenceSid = await getConferenceSid(client, room);
          if (conferenceSid) {
            await client.conferences(conferenceSid)
              .participants(s.inviteeCallSid)
              .update({ announceUrl: warningUrl, announceMethod: "POST" } as any)
              .catch(e => console.error("[live-billing] Warning announce error (invitee):", e));
            console.log(`[live-billing] Low-balance warning → invitee callSid=${s.inviteeCallSid}`);
          }
        }

        // Auto-disconnect whichever caller ran out of time
        if (initiatorRemaining <= 0) {
          console.log(`[live-billing] Initiator userId=${s.initiatorUserId} out of time — ending call`);
          stopLiveBilling(room);
          client.calls(s.initiatorCallSid).update({ status: "completed" })
            .catch(e => console.error("[live-billing] End-call error (initiator):", e));
          return;
        }
        if (inviteeRemaining <= 0) {
          console.log(`[live-billing] Invitee userId=${s.inviteeUserId} out of time — ending call`);
          stopLiveBilling(room);
          client.calls(s.inviteeCallSid).update({ status: "completed" })
            .catch(e => console.error("[live-billing] End-call error (invitee):", e));
          return;
        }
      } catch (err) {
        console.error("[live-billing] Tick error:", err);
      }
    }, LIVE_TICK_MS);

    liveBillingSessions.set(room, session);
    console.log(`[live-billing] Started for room=${room}, tick every ${LIVE_TICK_MS / 1000}s`);
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
      // Final billing sync — deducts any remaining elapsed seconds and clears the checkpoint
      if (billingCheckpoints.has(callSid)) {
        await finalizeCallBilling(callSid);
      }

      // Stop live billing if this call was in an active conference (handles unexpected hangups)
      stopLiveBillingByCallSid(callSid);

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

      // Clean up any live connect invite that this caller initiated
      for (const [targetUserId, invite] of pendingLiveInvites.entries()) {
        if (invite.initiatorCallSid === callSid) {
          pendingLiveInvites.delete(targetUserId);
          console.log(`[live-connect] Cleaned up dangling invite for targetUserId=${targetUserId} (initiator hung up)`);
        }
      }
      // Clean up live connection tracking for this callSid
      const liveUserId = liveConnectionCallSidMap.get(callSid);
      if (liveUserId) {
        liveConnectionUserIds.delete(liveUserId);
        liveConnectionCallSidMap.delete(callSid);
        console.log(`[live-connect] Removed userId=${liveUserId} from live connections (call ended)`);
      }
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
      await storage.removeStaleActiveCalls(90);
      const user = await getOrCreateUser(fromNumber);
      await storage.registerActiveCall(callSid, user.id);
      console.log(`[voice] Registered active call ${callSid} for userId=${user.id}`);
      registerStatusCallback(callSid, req).catch(() => {});
      twiml.redirect("/voice/entry");
    } catch (error) {
      console.error("[voice] /voice error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b. Shared Entry Flow ────────────────────────────────────────────────
  // Reached from both /voice and /voice/:slug after the call is registered.
  // Always plays the system greeting then branches on account state.
  app.post("/voice/entry", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      playPrompt(twiml, req, "system_greeting.mp3",
        "Welcome to Interactive Mail. Interactive Mail assumes no responsibility for personal meetings.");

      const user = await getOrCreateUser(fromNumber);
      const remainingSeconds = user.remainingSeconds ?? 0;

      if (!user.membershipTier) {
        // Brand new — never had an account, offer the free trial
        twiml.redirect("/voice/free-trial-offer");
      } else if (remainingSeconds <= 0) {
        // Access fully expired
        playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
        twiml.redirect("/voice/membership-purchase");
      } else {
        // Has time — announce remaining time for free trial callers here at entry
        if (user.membershipTier === "free_trial") {
          playTimeRemaining(twiml, req, Math.floor(remainingSeconds / 60));
          callTimeAnnounced.add(callSid); // prevent main-menu from repeating it
        }
        // Hand off to the phone booth (plays welcome intro, then handles profile check)
        twiml.redirect("/voice/phone-booth");
      }
    } catch (error) {
      console.error("[voice] /voice/entry error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1c. Free Trial Offer ─────────────────────────────────────────────────
  // Shown to brand-new callers who have no account yet.
  // They press 1 to accept the free trial; no response hangs up politely.
  app.post("/voice/free-trial-offer", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-free-trial-offer", timeout: 15 });
    playPrompt(gather, req, "free_trial_offer.mp3",
      "We'd like to offer you a free trial so you can check out the system and start meeting new people. To get your free trial now, press 1.");
    playPrompt(twiml, req, "goodbye.mp3", "Thank you for calling. Goodbye.");
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1d. Handle Free Trial Offer Response ─────────────────────────────────
  app.post("/voice/handle-free-trial-offer", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    if (digit === "1") {
      try {
        const freeTrialMinutes = (await getMembershipSettingsCached()).freeTrialMinutes;
        const freeTrialSeconds = freeTrialMinutes * 60;
        const user = await getOrCreateUser(fromNumber);
        await storage.updateUserMembership(user.id, {
          membershipTier: "free_trial",
          remainingSeconds: freeTrialSeconds,
        });
        console.log(`[voice] Free trial accepted — granted ${freeTrialMinutes} min (${freeTrialSeconds}s) to userId=${user.id}`);

        // Announce the trial minutes, then play the terms
        playTimeRemaining(twiml, req, freeTrialMinutes);
        playPrompt(twiml, req, "free_trial_terms.mp3",
          "Your free trial will expire in seven days and it must be used from this phone number.");
        callTimeAnnounced.add(callSid);

        // Hand off to the phone booth (plays welcome intro, then handles profile check)
        twiml.redirect("/voice/phone-booth");
      } catch (error) {
        console.error("[voice] handle-free-trial-offer error:", error);
        playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
        twiml.hangup();
      }
    } else {
      playPrompt(twiml, req, "goodbye.mp3", "Thank you for calling. Goodbye.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1e. Phone Booth Welcome ──────────────────────────────────────────────
  // Common landing point after account-state handling.
  // Always plays the phone booth intro, then checks whether this caller has
  // already recorded a profile name. If not, kicks off the name-recording flow.
  app.post("/voice/phone-booth", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    try {
      // Play the phone booth welcome intro every time
      playPrompt(twiml, req, "phone_booth_welcome.mp3",
        "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign.");

      const user = await getOrCreateUser(fromNumber);
      const profile = await storage.getProfile(user.id);

      if (!profile) {
        // No profile yet — need to record their name first
        playPrompt(twiml, req, "welcome_record_name.mp3",
          "You need to record a greeting to introduce yourself to the other guys first. Let's record the name you want to use. After the tone, record just your first name.");
        twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      } else {
        twiml.redirect("/voice/greeting-setup");
      }
    } catch (error) {
      console.error("[voice] /voice/phone-booth error:", error);
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

    playPrompt(twiml, req, "name_saved_record_greeting.mp3", "Great. Now record your greeting for other callers. After the tone, record at least 8 seconds. Press pound when you are finished.");
    twiml.record({ maxLength: 60, playBeep: true, finishOnKey: "#", action: "/voice/save-profile" });
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
      const remainingSeconds = user.remainingSeconds ?? 0;

      // ── Access expired ──────────────────────────────────────────────────
      if (user.membershipTier && remainingSeconds <= 0) {
        playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
        twiml.redirect("/voice/membership-purchase");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── Under-5-minute warning at main menu (shown once per call) ──────
      if (user.membershipTier && remainingSeconds < 300 && remainingSeconds > 0 && !callWarningShown.has(callSid)) {
        callWarningShown.add(callSid);
        twiml.redirect("/voice/time-warning");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── First-visit balance announcement ────────────────────────────────
      if (user.membershipTier && remainingSeconds > 0 && !callTimeAnnounced.has(callSid)) {
        callTimeAnnounced.add(callSid);
        playTimeRemaining(twiml, req, Math.floor(remainingSeconds / 60));
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
      // USE_EXISTING_GREETING: fast-path into the live system
      twiml.redirect("/voice/go-live");
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
            safePlayRecording(twiml, profile.nameRecordingUrl, req, "");
          }
          safePlayRecording(twiml, profile.recordingUrl, req, "Your greeting recording is not available for playback at this time.");
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
          safePlayRecording(twiml, draft.nameRecordingUrl, req, "");
        }
        if (draft?.greetingRecordingUrl) {
          safePlayRecording(twiml, draft.greetingRecordingUrl, req, "Your greeting recording is not available for playback at this time.");
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
        // Accept — write draft to DB then ask optional zip code before main menu
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
          twiml.redirect("/voice/zip-code-prompt");
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

  // ─── 5b. Zip Code Prompt (optional, after profile is saved) ─────────────────
  app.post("/voice/zip-code-prompt", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      numDigits: 5,
      finishOnKey: "#",
      action: "/voice/handle-zip-code",
      timeout: 15,
    });
    playPrompt(gather, req, "zip_code_prompt.mp3",
      "Optional: enter your 5-digit zip code and we'll play callers closest to you first. Press pound to skip."
    );
    // If no input (timeout), go straight into the live system
    twiml.redirect("/voice/go-live");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-zip-code", async (req, res) => {
    const twiml = new VoiceResponse();
    try {
      const fromNumber = req.body?.From as string;
      const digits = (req.body?.Digits as string) ?? "";

      // Only save if exactly 5 numeric digits were entered
      if (/^\d{5}$/.test(digits)) {
        const user = await getOrCreateUser(fromNumber);
        const geoRaw = await lookupZipCode(digits);
        const geo = geoRaw
          ? { latitude: parseFloat(geoRaw.latitude), longitude: parseFloat(geoRaw.longitude), city: geoRaw.city, state: geoRaw.state, neighborhood: geoRaw.neighborhood }
          : undefined;
        const zipEntry = await storage.getOrCreateZipEntry(digits, geo);
        await storage.setUserZipCode(user.id, zipEntry.id);
        if (geo) {
          console.log(`[voice] zip saved: userId=${user.id}, zip=${digits}, city=${geo.city}, state=${geo.state}, lat=${geo.latitude}, lon=${geo.longitude}, zipEntryId=${zipEntry.id}`);
        } else {
          console.log(`[voice] zip saved: userId=${user.id}, zip=${digits}, zipEntryId=${zipEntry.id} (no geo data found)`);
        }
        playPrompt(twiml, req, "zip_code_saved.mp3", "Got it. We'll use your zip code to show you nearby callers.");
      }
      // Anything else (empty = pressed #, partial, invalid) → silently skip
    } catch (err) {
      console.error("[voice] /voice/handle-zip-code error:", err);
    }
    twiml.redirect("/voice/go-live");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 5c. Go Live ──────────────────────────────────────────────────────────
  // Entry point into the live browsing system. Announces how many callers are
  // on the line, notifies the caller that time is being deducted, starts the
  // phone booth session timer, then drops them into profile browsing.
  app.post("/voice/go-live", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const regionId = callRegion.get(callSid);

      // Announce how many callers are currently on the line
      const activeCallerCount = await storage.getActiveCallerCount(user.id, regionId);
      playCallerCount(twiml, req, activeCallerCount);

      // Notify the caller that their membership time is now running
      playPrompt(twiml, req, "time_deduction_start.mp3",
        "Time is now being deducted from your membership.");

      // Start the billing checkpoint (only if not already running this call)
      startBilling(callSid, fromNumber);

      twiml.redirect("/voice/browse-profiles");
    } catch (error) {
      console.error("[voice] /voice/go-live error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
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

      const callSid = req.body?.CallSid as string;

      // Sync billing before playing the next greeting — deducts elapsed seconds since last check
      await syncBilling(callSid);

      const user = await getOrCreateUser(fromNumber);
      const regionId = callRegion.get(callSid);

      // Resolve caller's location for proximity sorting
      const callerZip = user.zipCodeId ? await storage.getZipEntryById(user.zipCodeId) : null;
      let callerLat = callerZip?.latitude ?? null;
      let callerLon = callerZip?.longitude ?? null;

      // If the caller has no zip, fall back to the region's default zip code
      if (callerLat == null && regionId) {
        const region = await storage.getRegionById(regionId);
        if (region?.defaultZipCode) {
          let regionZip = await storage.getZipEntryByCode(region.defaultZipCode);
          if (!regionZip) {
            const geoRaw = await lookupZipCode(region.defaultZipCode);
            const geo = geoRaw ? { latitude: parseFloat(geoRaw.latitude), longitude: parseFloat(geoRaw.longitude), city: geoRaw.city, state: geoRaw.state, neighborhood: geoRaw.neighborhood } : undefined;
            regionZip = await storage.getOrCreateZipEntry(region.defaultZipCode, geo);
          }
          callerLat = regionZip.latitude ?? null;
          callerLon = regionZip.longitude ?? null;
          console.log(`[voice] browse-profiles: using region default zip ${region.defaultZipCode} for proximity sort (userId=${user.id})`);
        }
      }

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


      // ── Check for a pending live connect invite first (time-sensitive) ──────
      const pendingInvite = pendingLiveInvites.get(user.id);
      if (pendingInvite && pendingInvite.status === "pending" && Date.now() - pendingInvite.createdAt < LIVE_INVITE_TTL_MS) {
        const inviteGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-live-invite?initiatorUserId=${pendingInvite.initiatorUserId}&room=${encodeURIComponent(pendingInvite.conferenceRoom)}`,
          timeout: 15,
        });
        playPrompt(inviteGather, req, "live_connect_chime.mp3", "");
        inviteGather.say("This caller");
        if (pendingInvite.initiatorNameRecordingUrl) {
          safePlayRecording(inviteGather, pendingInvite.initiatorNameRecordingUrl, req, "");
        }
        inviteGather.say("would like to connect live with you.");
        playPrompt(inviteGather, req, "live_invite_options.mp3", "To accept, press 1. To decline and hear the next caller's greeting, press 2. To hear this caller's greeting, press 3.");
        twiml.redirect("/voice/browse-profiles");
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
          safePlayRecording(msgGather, senderProfile.nameRecordingUrl, req, "");
          msgGather.say("has sent you a message.");
        } else {
          msgGather.say("You have a new message.");
        }
        safePlayRecording(msgGather, unreadMessage.recordingUrl, req, "Message audio is not available for playback.");
        playPrompt(msgGather, req, "message_options.mp3", "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles. Press 9 to return to the main menu.");
        twiml.redirect("/voice/main-menu");
      } else {
        // Build the queue once per caller, then advance position on each visit
        let state = callerBrowseState.get(callSid);
        if (!state) {
          const allProfiles = await storage.getAllActiveProfiles(user.id, regionId);
          const nearbySet = new Set<string>(
            callerLat != null && callerLon != null
              ? await storage.getNearbyProfileUserIds(user.id, regionId, callerLat, callerLon, 80)
              : []
          );
          state = {
            queue: allProfiles.map(p => ({
              userId: p.userId,
              recordingUrl: p.recordingUrl,
              nameRecordingUrl: p.nameRecordingUrl,
              isNearby: nearbySet.has(p.userId),
            })),
            index: 0,
            hasWrapped: false,
            linkedRegionLoaded: false,
            localUserIds: allProfiles.map(p => p.userId),
            announcedNewLocalIds: [],
          };
          callerBrowseState.set(callSid, state);
          console.log(`[voice] browse-profiles: built queue of ${state.queue.length} profiles for ${callSid} (${nearbySet.size} nearby)`);
        }

        if (state.queue.length === 0) {
          playPrompt(twiml, req, "no_profiles.mp3", "No profiles are available right now. Please try again later.");
          twiml.redirect("/voice/main-menu");
        } else {
          // ── Linked-region offer: queue has looped at least once ──────────────
          if (state.hasWrapped && !state.linkedRegionLoaded && regionId) {
            const currentRegion = await storage.getRegionById(regionId);
            if (currentRegion?.linkedRegionId) {
              state.hasWrapped = false; // clear so we don't re-trigger until next full loop
              twiml.redirect(`/voice/nearby-callers-offer?linkedRegionId=${currentRegion.linkedRegionId}`);
              res.type("text/xml");
              return res.send(twiml.toString());
            } else {
              state.linkedRegionLoaded = true; // no linked region — stop checking
            }
          }

          // ── New local caller alert (only when browsing linked region) ────────
          // If the caller is currently listening to profiles from a nearby region,
          // intercept the next press-2 to announce any callers who have joined
          // their HOME region since they left it.
          if (state.linkedRegionLoaded && regionId) {
            const knownIds = new Set([...state.localUserIds, ...state.announcedNewLocalIds]);
            const currentLocalProfiles = await storage.getAllActiveProfiles(user.id, regionId);
            const newLocalCaller = currentLocalProfiles.find(p => !knownIds.has(p.userId));

            if (newLocalCaller) {
              state.announcedNewLocalIds.push(newLocalCaller.userId);
              console.log(`[voice] browse-profiles: announcing new local caller userId=${newLocalCaller.userId} to linked-region browser ${callSid}`);

              const alertGather = twiml.gather({
                numDigits: 1,
                action: `/voice/handle-profile-menu?profileUserId=${newLocalCaller.userId}`,
                timeout: 10,
              });
              playPrompt(alertGather, req, "new_caller_close_to_you.mp3", "New caller close to you.");
              if (newLocalCaller.nameRecordingUrl) {
                safePlayRecording(alertGather, newLocalCaller.nameRecordingUrl, req, "");
              }
              safePlayRecording(alertGather, newLocalCaller.recordingUrl, req, "This profile's greeting is not available.");
              playPrompt(alertGather, req, "profile_options.mp3", "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 9 to return to main menu.");
              twiml.redirect("/voice/browse-profiles");
              res.type("text/xml");
              return res.send(twiml.toString());
            }
          }

          const profile = state.queue[state.index];
          const prevIndex = state.index;

          // Advance index, wrapping at end of queue — track first wrap
          state.index = (state.index + 1) % state.queue.length;
          if (state.index === 0 && prevIndex > 0) state.hasWrapped = true;

          console.log(`[voice] Playing profile userId=${profile.userId} (position ${state.index}/${state.queue.length})`);

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
          if (profile.isNearby) {
            playPrompt(profileGather, req, "new_caller_closest_to_you.mp3", "New caller closest to you.");
          }
          if (profile.nameRecordingUrl) {
            safePlayRecording(profileGather, profile.nameRecordingUrl, req, "");
          }
          safePlayRecording(profileGather, profile.recordingUrl, req, "This profile's greeting is not available.");
          playPrompt(profileGather, req, "profile_options.mp3", "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 9 to return to main menu.");
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

  // ─── 6a. Nearby Callers Offer ─────────────────────────────────────────────
  // Played when a caller exhausts their region's queue — offers the linked region
  app.post("/voice/nearby-callers-offer", async (req, res) => {
    const twiml = new VoiceResponse();
    try {
      const linkedRegionId = req.query.linkedRegionId as string;
      const linkedRegion = linkedRegionId ? await storage.getRegionById(linkedRegionId) : null;

      if (!linkedRegion) {
        twiml.redirect("/voice/browse-profiles");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const gather = twiml.gather({
        numDigits: 1,
        action: `/voice/handle-nearby-callers?linkedRegionId=${linkedRegionId}`,
        timeout: 12,
      });
      playPrompt(gather, req, "nearby_callers_offer.mp3",
        `You've heard all the callers in your area. Press 1 to hear callers close to you from ${linkedRegion.name}. Press 2 to start over from the beginning.`);
      // Timeout falls through to handle-nearby-callers without a digit (treated as "start over")
      twiml.redirect(`/voice/handle-nearby-callers?linkedRegionId=${linkedRegionId}`);
    } catch (err) {
      console.error("[voice] /voice/nearby-callers-offer error:", err);
      twiml.redirect("/voice/browse-profiles");
    }
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 6b. Handle Nearby Callers Choice ────────────────────────────────────
  app.post("/voice/handle-nearby-callers", async (req, res) => {
    const twiml = new VoiceResponse();
    try {
      const digit = req.body?.Digits;
      const linkedRegionId = req.query.linkedRegionId as string;
      const callSid = req.body?.CallSid as string;
      const fromNumber = req.body?.From as string;

      const state = callerBrowseState.get(callSid);

      if (digit === "1" && state && linkedRegionId) {
        // Load profiles from the linked region
        const user = await getOrCreateUser(fromNumber);
        const callerZip = user.zipCodeId ? await storage.getZipEntryById(user.zipCodeId) : null;
        const callerLat = callerZip?.latitude ?? null;
        const callerLon = callerZip?.longitude ?? null;
        const linkedProfiles = await storage.getAllActiveProfiles(user.id, linkedRegionId);
        const linkedNearbySet = new Set<string>(
          callerLat != null && callerLon != null
            ? await storage.getNearbyProfileUserIds(user.id, linkedRegionId, callerLat, callerLon, 80)
            : []
        );
        const linkedRegion = await storage.getRegionById(linkedRegionId);

        if (linkedProfiles.length > 0) {
          // Replace the queue with linked region profiles only
          state.queue = linkedProfiles.map(p => ({ userId: p.userId, recordingUrl: p.recordingUrl, nameRecordingUrl: p.nameRecordingUrl, isNearby: linkedNearbySet.has(p.userId) }));
          state.index = 0;
          state.hasWrapped = false;
          state.linkedRegionLoaded = true;
          console.log(`[voice] handle-nearby-callers: loaded ${linkedProfiles.length} profiles from linked region ${linkedRegionId}`);
          playPrompt(twiml, req, "nearby_callers_intro.mp3",
            `Now playing callers from ${linkedRegion?.name ?? "a nearby area"}. Enjoy!`);
        } else {
          // No callers online in linked region — restart local queue
          if (state) {
            state.index = 0;
            state.linkedRegionLoaded = true;
            state.hasWrapped = false;
          }
          playPrompt(twiml, req, "nearby_callers_none.mp3",
            "There are no callers online in that area right now. Starting your area over.");
        }
        twiml.redirect("/voice/browse-profiles");
      } else {
        // Digit 2, timeout, or any other input → restart local region from beginning
        if (state) {
          state.index = 0;
          state.linkedRegionLoaded = true; // don't offer again this session
          state.hasWrapped = false;
        }
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-nearby-callers error:", err);
      twiml.redirect("/voice/browse-profiles");
    }
    res.type("text/xml");
    res.send(twiml.toString());
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
          if (senderProfile.nameRecordingUrl) {
            safePlayRecording(senderGather, senderProfile.nameRecordingUrl, req, "");
          }
          safePlayRecording(senderGather, senderProfile.recordingUrl, req, "This profile's greeting is not available.");
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
      } else if (digit === "3") {
        // ── Live 1-on-1 Connect ─────────────────────────────────────────────
        const fromNumber = req.body?.From as string;
        const callSid = req.body?.CallSid as string;

        if (!fromNumber || !profileUserId || !callSid) {
          playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to profiles.");
          twiml.redirect("/voice/browse-profiles");
        } else {
          const user = await getOrCreateUser(fromNumber);

          // 1. Check initiator has ≥ 5 minutes (300 seconds) remaining
          if ((user.remainingSeconds ?? 0) < 300) {
            playPrompt(twiml, req, "live_connect_no_minutes.mp3",
              "You need at least 5 minutes remaining on your membership to connect live. Please add more time and try again.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 2. Get target profile — admin-uploaded profiles cannot do live connects
          const targetProfile = await storage.getProfile(profileUserId);
          if (!targetProfile || targetProfile.isAdminUploaded) {
            playPrompt(twiml, req, "live_connect_unavailable.mp3",
              "This caller is not available for a live connection.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 3. Check target is still on the line (non-virtual active call)
          const targetActiveCall = await storage.getActiveCallByUserId(profileUserId);
          if (!targetActiveCall || targetActiveCall.callSid.startsWith("VIRTUAL-")) {
            playPrompt(twiml, req, "live_connect_left_line.mp3",
              "Sorry, that caller has left the line.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 4. Check target has ≥ 5 minutes (300 seconds) remaining
          const targetUser = await storage.getUserById(profileUserId);
          if (!targetUser || (targetUser.remainingSeconds ?? 0) < 300) {
            playPrompt(twiml, req, "live_connect_unavailable.mp3",
              "That caller does not have enough time remaining for a live connection.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 5. Check target is not already in a live connection
          if (liveConnectionUserIds.has(profileUserId)) {
            playPrompt(twiml, req, "live_connect_busy.mp3",
              "That caller is already connected with someone else. Please try again later.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 6. Check target has not blocked initiator
          const isBlocked = await storage.isUserBlocked(profileUserId, user.id);
          if (isBlocked) {
            playPrompt(twiml, req, "live_connect_unavailable.mp3",
              "That caller is not available for a live connection.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // All checks passed — create the invite
          const callerProfile = await storage.getProfile(user.id);
          const conferenceRoom = `live-${callSid}`;
          pendingLiveInvites.set(profileUserId, {
            initiatorCallSid: callSid,
            initiatorUserId: user.id,
            initiatorNameRecordingUrl: callerProfile?.nameRecordingUrl ?? null,
            initiatorGreetingUrl: callerProfile?.recordingUrl ?? "",
            conferenceRoom,
            createdAt: Date.now(),
            status: "pending",
          });
          console.log(`[live-connect] Invite created: userId=${user.id} → targetUserId=${profileUserId}, room=${conferenceRoom}`);

          // Play brief disclaimer then start the wait loop
          playPrompt(twiml, req, "live_connect_disclaimer.mp3",
            "Please be respectful and kind. You are about to request a live one on one connection.");
          twiml.redirect(`/voice/live-connect-wait?targetUserId=${encodeURIComponent(profileUserId)}`);
        }
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

  // ─── 8a. Live Connect: Initiator Wait Loop ────────────────────────────────
  // Caller A lands here after creating the invite. Plays "Calling [name] now…"
  // and a 15-second ringing tone. If B accepts mid-ring the Twilio REST API
  // redirects A's call to /voice/live-connect-join, interrupting the audio.
  // If B hasn't accepted by the time the ring finishes, we declare timeout.
  app.post("/voice/live-connect-wait", async (req, res) => {
    const twiml = new VoiceResponse();
    const targetUserId = req.query.targetUserId as string;
    const waited = req.query.waited as string | undefined;

    try {
      const invite = pendingLiveInvites.get(targetUserId);

      if (!invite) {
        // Invite was cleaned up (timed out or already handled)
        playPrompt(twiml, req, "live_connect_failed.mp3",
          "We were unable to connect your call. Returning you to the phone booth.");
        twiml.redirect("/voice/browse-profiles");
      } else if (invite.status === "accepted") {
        // B accepted (possibly right as ringing finished — race condition handled here)
        playPrompt(twiml, req, "live_connect_connecting.mp3",
          "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!");
        const dial = twiml.dial({ action: `/voice/live-connect-complete?role=initiator&targetUserId=${encodeURIComponent(targetUserId)}&initiatorUserId=${encodeURIComponent(invite.initiatorUserId)}&room=${encodeURIComponent(invite.conferenceRoom)}` });
        (dial.conference as any)(invite.conferenceRoom, {
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
          beep: false,
          exitKeys: "#",
        });
      } else if (invite.status === "declined" || waited || Date.now() - invite.createdAt > LIVE_INVITE_TTL_MS) {
        // Timed out or explicitly declined
        pendingLiveInvites.delete(targetUserId);
        playPrompt(twiml, req, "live_connect_failed.mp3",
          "We were unable to connect your call. Returning you to the phone booth.");
        twiml.redirect("/voice/browse-profiles");
      } else {
        // Still pending — first visit: announce + ring
        const targetProfile = await storage.getProfile(targetUserId).catch(() => null);
        twiml.say("Calling");
        if (targetProfile?.nameRecordingUrl) {
          safePlayRecording(twiml, targetProfile.nameRecordingUrl, req, "");
        }
        twiml.say("now.");
        playPrompt(twiml, req, "live_connect_ringing.mp3", "");
        // After ringing, check status (handles case where B accepts at the last second)
        twiml.redirect(`/voice/live-connect-wait?targetUserId=${encodeURIComponent(targetUserId)}&waited=1`);
      }
    } catch (error) {
      console.error("[live-connect] live-connect-wait error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the phone booth.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 8b. Live Connect: Invitee Response ───────────────────────────────────
  // Caller B sees the invite and responds here.
  // digit 1 → accept (REST API redirects A to conference, B joins conference)
  // digit 2 → decline → return to browse-profiles
  // digit 3 → hear initiator's greeting, then re-show invite menu
  app.post("/voice/handle-live-invite", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;
    const initiatorUserId = req.query.initiatorUserId as string;
    const room = req.query.room as string;
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const invite = pendingLiveInvites.get(user.id);

      // Guard: invite must still be valid
      if (!invite || invite.status !== "pending" || Date.now() - invite.createdAt > LIVE_INVITE_TTL_MS) {
        pendingLiveInvites.delete(user.id);
        playPrompt(twiml, req, "live_invite_expired.mp3",
          "That live connection invitation has expired. Returning to profiles.");
        twiml.redirect("/voice/browse-profiles");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      if (digit === "1") {
        // ── Accept ──────────────────────────────────────────────────────────
        invite.status = "accepted";
        liveConnectionUserIds.add(user.id);
        liveConnectionUserIds.add(invite.initiatorUserId);
        liveConnectionCallSidMap.set(callSid, user.id);
        liveConnectionCallSidMap.set(invite.initiatorCallSid, invite.initiatorUserId);

        // Redirect initiator's live call to join the conference room
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (accountSid && authToken) {
          try {
            const client = twilio(accountSid, authToken);
            const joinUrl = `${baseUrl(req)}/voice/live-connect-join?room=${encodeURIComponent(room)}&targetUserId=${encodeURIComponent(user.id)}&initiatorUserId=${encodeURIComponent(invite.initiatorUserId)}`;
            await client.calls(invite.initiatorCallSid).update({ url: joinUrl, method: "POST" });
            console.log(`[live-connect] Redirected initiator ${invite.initiatorCallSid} to conference ${room}`);

            // Start real-time billing interval now that both legs are headed to the conference
            startLiveBilling(
              room,
              invite.initiatorCallSid, callSid,
              invite.initiatorUserId, user.id,
              baseUrl(req),
            );
          } catch (err) {
            console.error("[live-connect] Failed to redirect initiator via REST API:", err);
            // Undo tracking on failure
            invite.status = "declined";
            liveConnectionUserIds.delete(user.id);
            liveConnectionUserIds.delete(invite.initiatorUserId);
            liveConnectionCallSidMap.delete(callSid);
            liveConnectionCallSidMap.delete(invite.initiatorCallSid);
            pendingLiveInvites.delete(user.id);
            playPrompt(twiml, req, "live_connect_failed.mp3",
              "We were unable to connect your call. Please try again later.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }
        }

        // B joins the conference (waits briefly for A to arrive)
        playPrompt(twiml, req, "live_connect_connecting.mp3",
          "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!");
        const dial = twiml.dial({ action: `/voice/live-connect-complete?role=invitee&targetUserId=${encodeURIComponent(user.id)}&initiatorUserId=${encodeURIComponent(invite.initiatorUserId)}&room=${encodeURIComponent(room)}` });
        (dial.conference as any)(room, {
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
          beep: false,
          exitKeys: "#",
          maxParticipants: 2,
        });

      } else if (digit === "2") {
        // ── Decline ─────────────────────────────────────────────────────────
        invite.status = "declined";
        pendingLiveInvites.delete(user.id);
        console.log(`[live-connect] Invite declined by userId=${user.id}`);
        twiml.redirect("/voice/browse-profiles");

      } else if (digit === "3") {
        // ── Hear initiator's greeting ────────────────────────────────────────
        const initiatorProfile = await storage.getProfile(initiatorUserId);
        const greetingGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-live-invite?initiatorUserId=${encodeURIComponent(initiatorUserId)}&room=${encodeURIComponent(room)}`,
          timeout: 15,
        });
        if (initiatorProfile?.nameRecordingUrl) {
          safePlayRecording(greetingGather, initiatorProfile.nameRecordingUrl, req, "");
        }
        if (initiatorProfile?.recordingUrl) {
          safePlayRecording(greetingGather, initiatorProfile.recordingUrl, req, "This caller's greeting is not available.");
        } else {
          greetingGather.say("This caller's greeting is not available.");
        }
        playPrompt(greetingGather, req, "live_invite_options.mp3",
          "To accept, press 1. To decline and hear the next caller's greeting, press 2. To hear this caller's greeting again, press 3.");
        twiml.redirect("/voice/browse-profiles");

      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[live-connect] handle-live-invite error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the phone booth.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 8c. Live Connect: Join Conference ────────────────────────────────────
  // Called via Twilio REST API redirect when B accepts, sending A directly here.
  // Also used as the endpoint that A lands on if B accepted just as ringing ended.
  app.post("/voice/live-connect-join", async (req, res) => {
    const twiml = new VoiceResponse();
    const room = req.query.room as string;
    const targetUserId = req.query.targetUserId as string;
    const initiatorUserId = req.query.initiatorUserId as string;

    try {
      playPrompt(twiml, req, "live_connect_connecting.mp3",
        "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!");
      const dial = twiml.dial({ action: `/voice/live-connect-complete?role=initiator&targetUserId=${encodeURIComponent(targetUserId)}&initiatorUserId=${encodeURIComponent(initiatorUserId)}&room=${encodeURIComponent(room)}` });
      (dial.conference as any)(room, {
        startConferenceOnEnter: true,
        endConferenceOnExit: true,
        beep: false,
        exitKeys: "#",
        maxParticipants: 2,
      });
    } catch (error) {
      console.error("[live-connect] live-connect-join error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the phone booth.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 8d. Live Connect: Post-Conference Cleanup ────────────────────────────
  // Called by <Dial action="..."> after the conference ends for either participant.
  app.post("/voice/live-connect-complete", async (req, res) => {
    const twiml = new VoiceResponse();
    const targetUserId = req.query.targetUserId as string;
    const initiatorUserId = req.query.initiatorUserId as string;
    const room = req.query.room as string;
    const callSid = req.body?.CallSid as string;

    // Stop live billing interval (safe to call multiple times — only acts once)
    if (room) stopLiveBilling(room);

    // Clean up live connection tracking
    if (targetUserId) liveConnectionUserIds.delete(targetUserId);
    if (initiatorUserId) liveConnectionUserIds.delete(initiatorUserId);
    if (callSid) liveConnectionCallSidMap.delete(callSid);
    if (targetUserId) pendingLiveInvites.delete(targetUserId);

    console.log(`[live-connect] Connection ended — targetUserId=${targetUserId}, initiatorUserId=${initiatorUserId}`);

    playPrompt(twiml, req, "live_connect_ended.mp3",
      "Your live connection has ended. Returning you to the phone booth.");
    twiml.redirect("/voice/browse-profiles");

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 8e. Live Connect: Low Balance Warning (per-participant) ─────────────
  // Twilio calls this via announceUrl on the specific participant's conference leg.
  // Only that participant hears it — the other caller is unaffected.
  app.post("/voice/live-low-balance-warning", (_req, res) => {
    const twiml = new VoiceResponse();
    twiml.say("Warning: you have less than 5 minutes remaining. Please note your live connection will end when your time expires.");
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

    const packages = await getMembershipPackages();
    const pkg = packages[digit];
    if (!pkg) {
      playPrompt(twiml, req, "package_invalid.mp3", "Invalid selection.");
      twiml.redirect("/voice/membership-purchase");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Detect first-time buyer for the bonus plan
    const settings = await getMembershipSettingsCached();
    let isFirstPurchase = false;
    if (settings.bonusPlanKey === pkg.name) {
      try {
        const user = await getOrCreateUser(fromNumber);
        isFirstPurchase = !user.membershipTier || user.membershipTier === "free_trial";
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

    if (isFirstPurchase) {
      playPrompt(twiml, req, "package_confirm_14day_bonus.mp3", `Great choice! You selected ${pkg.label} access for ${pkg.priceLabel}, including your free first purchase bonus — double the minutes!`);
    } else if (pkg.name === "plan1") {
      playPrompt(twiml, req, "package_confirm_30day.mp3", `You selected ${pkg.label} access for ${pkg.priceLabel}.`);
    } else if (pkg.name === "plan2") {
      playPrompt(twiml, req, "package_confirm_14day.mp3", `You selected ${pkg.label} access for ${pkg.priceLabel}.`);
    } else if (pkg.name === "plan3") {
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
        const packages = await getMembershipPackages();
        const pkg = Object.values(packages).find(p => p.name === session.packageName);
        const baseMinutes = pkg?.minutes ?? (await getMembershipSettingsCached()).plan3Minutes;
        const bonusMinutes = session.isFirstPurchase ? baseMinutes : 0;
        const totalMinutes = baseMinutes + bonusMinutes;
        const totalSeconds = totalMinutes * 60;

        await storage.updateUserMembership(user.id, {
          membershipTier: session.packageName,
          remainingSeconds: totalSeconds,
        });

        const bonusMsg = bonusMinutes > 0
          ? ` Plus your first purchase bonus doubles your minutes — enjoy ${totalMinutes.toLocaleString()} minutes total!`
          : "";
        const successText =
          `Payment successful! You now have ${session.packageLabel} access. ` +
          `Your card has been charged ${session.priceLabel}.${bonusMsg} ` +
          "Thank you for joining. Returning to the main menu.";

        if (session.isFirstPurchase) {
          playPrompt(twiml, req, "payment_success_14day_bonus.mp3", successText);
        } else if (session.packageName === "plan1") {
          playPrompt(twiml, req, "payment_success_30day.mp3", successText);
        } else if (session.packageName === "plan2") {
          playPrompt(twiml, req, "payment_success_14day.mp3", successText);
        } else if (session.packageName === "plan3") {
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

      const user = await getOrCreateUser(fromNumber);

      // Register call as active — scoped to this region
      await storage.registerActiveCall(callSid, user.id, region.id);
      console.log(`[voice] [${region.slug}] Registered active call ${callSid} for userId=${user.id}`);

      registerStatusCallback(callSid, req).catch(() => {});

      // Hand off to the shared entry flow (system greeting + account state detection)
      twiml.redirect("/voice/entry");
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
