import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import authRouter from "./authRoutes";
import { api } from "@shared/routes";
import type { MembershipSettings, SiteSettings } from "@shared/schema";
import express from "express";
import twilio from "twilio";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as mm from "music-metadata";
import { addVirtualCaller, removeVirtualCaller, getLiveVirtualUserIds } from "./simulator";
import { generateTTS, listVoices } from "./elevenlabs";
import { lookupZipCode, reverseGeocodeNeighborhood } from "./zipLookup";

// Ensure uploads directory and category subdirectories exist
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
for (const cat of ["mm", "mw"]) {
  const catDir = path.join(UPLOADS_DIR, cat);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
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

// ─── Site Settings Cache ───────────────────────────────────────────────────
// Mirrors the membership settings cache pattern, used by playPrompt and IVR routes.

let _cachedSiteSettings: SiteSettings | null = null;
let _siteSettingsCacheExpiresAt = 0;

async function getSiteSettingsCached(): Promise<SiteSettings> {
  if (_cachedSiteSettings && Date.now() < _siteSettingsCacheExpiresAt) return _cachedSiteSettings;
  _cachedSiteSettings = await storage.getSiteSettings();
  _siteSettingsCacheExpiresAt = Date.now() + 60_000;
  return _cachedSiteSettings;
}

function invalidateSiteSettingsCache(): void {
  _cachedSiteSettings = null;
  _siteSettingsCacheExpiresAt = 0;
}

function centsToLabel(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `${dollars} dollars` : `${dollars.toFixed(2)} dollars`;
}

type MembershipPackage = { name: string; label: string; minutes: number; priceCents: number; priceLabel: string };

async function getMembershipPackages(): Promise<Record<string, MembershipPackage>> {
  const s = await getMembershipSettingsCached();
  return {
    "2": { name: "plan1", label: `${s.plan1Minutes.toLocaleString()} Minute`, minutes: s.plan1Minutes, priceCents: s.plan1PriceCents, priceLabel: centsToLabel(s.plan1PriceCents) },
    "3": { name: "plan2", label: `${s.plan2Minutes.toLocaleString()} Minute`, minutes: s.plan2Minutes, priceCents: s.plan2PriceCents, priceLabel: centsToLabel(s.plan2PriceCents) },
    "4": { name: "plan3", label: `${s.plan3Minutes.toLocaleString()} Minute`, minutes: s.plan3Minutes, priceCents: s.plan3PriceCents, priceLabel: centsToLabel(s.plan3PriceCents) },
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
  packageMinutes: number;
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
  lastPlayedIndex: number | null; // index of the most-recently played profile (for Press 5 "go back")
  hasWrapped: boolean;        // true after the queue index cycled back to 0
  linkedRegionLoaded: boolean; // true once the linked-region offer has been made (or skipped)
  localUserIds: string[];      // user IDs from the original local-region queue snapshot
  announcedNewLocalIds: string[]; // new local callers already announced during linked browsing
}
const callerBrowseState = new Map<string, CallerBrowseState>();

// Remove a specific userId from the browse queue for a given call session
function removeFromBrowseQueue(callSid: string, userId: string): void {
  const state = callerBrowseState.get(callSid);
  if (!state) return;
  const removedIdx = state.queue.findIndex(p => p.userId === userId);
  if (removedIdx === -1) return;
  state.queue.splice(removedIdx, 1);
  // Keep the index pointing at the next unplayed entry
  if (state.index > removedIdx) state.index = Math.max(0, state.index - 1);
  if (state.index >= state.queue.length) state.index = 0;
  console.log(`[voice] removeFromBrowseQueue: removed userId=${userId} from queue for callSid=${callSid}, remaining=${state.queue.length}`);
}

// Maps CallSid → regionId for the duration of a call
const callRegion = new Map<string, string>();

// ─── Mailbox Category Browse State ─────────────────────────────────────────
interface CategoryBrowseState {
  category: string;
  queue: { userId: string; mailboxNumber: string; adRecordingUrl: string }[];
  index: number;
}
const categoryBrowseState = new Map<string, CategoryBrowseState>();

// Category slug → human label map
const MAILBOX_CATEGORIES: Record<string, string> = {
  quick_hot_talk: "Quick and Hot Talk",
  bicurious: "Bicurious",
  kink: "Kink",
  total_top_strictly_bottoms: "Total Top and Strictly Bottoms",
  trans: "Trans",
};

// Digit → category slug
const DIGIT_TO_CATEGORY: Record<string, string> = {
  "1": "quick_hot_talk",
  "2": "bicurious",
  "3": "kink",
  "4": "total_top_strictly_bottoms",
  "5": "trans",
};

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
// accumulatedSeconds holds sub-minute remainder so billing rounds up per minute only at finalize.
interface BillingCheckpoint { lastCheck: number; fromNumber: string; accumulatedSeconds: number; }
const billingCheckpoints = new Map<string, BillingCheckpoint>(); // CallSid → checkpoint

// Membership lookup override: when a caller enters a membership number from a different
// phone, this maps callSid → the membership holder's phone number for billing purposes.
const callMembershipOverride = new Map<string, string>(); // callSid → membership holder phone

// Temporary store for a membership number mid-entry (between the 10-digit gather and account lookup)
const pendingMembershipEntries = new Map<string, string>(); // callSid → membership number

// Pending PIN authentication: caller entered a valid membership number from a different phone,
// awaiting 4-digit PIN to confirm identity.
const pendingPinAuth = new Map<string, string>(); // callSid → membership holder phone number

// Pending new PIN setup: the caller is confirming a newly entered PIN
const pendingNewPinSetup = new Map<string, string>(); // callSid → first PIN entry (4 digits)

// Generate a unique random 5-digit membership card number
async function generateUniqueCardNumber(): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const num = String(Math.floor(10000 + Math.random() * 90000));
    const taken = await storage.isMembershipCardNumberTaken(num);
    if (!taken) return num;
  }
  throw new Error("Unable to generate a unique membership card number after 100 attempts");
}

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
// Automatically checks the site category subfolder (uploads/mm/ or uploads/mw/) first,
// then falls back to the shared uploads/ root, then falls back to TTS.
function playPrompt(
  node: { say: (text: string) => void; play: (url: string) => void },
  req: Request,
  filename: string,
  fallbackText: string
): void {
  // Check the active site category subfolder first
  const category = _cachedSiteSettings?.siteCategory?.toLowerCase();
  if (category) {
    const catPath = path.join(UPLOADS_DIR, category, filename);
    if (fs.existsSync(catPath)) {
      node.play(`${baseUrl(req)}/uploads/${category}/${filename}`);
      return;
    }
  }
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

  // Prime the site settings cache so playPrompt can use category-specific audio on first call
  getSiteSettingsCached().catch(() => {});

  // ── Auth routes ───────────────────────────────────────────────────────────
  app.use(authRouter);

  // ── Admin auth middleware ─────────────────────────────────────────────────
  // REMOVED: No authentication required for admin access

  // ── Audit log helper ──────────────────────────────────────────────────────
  function logAudit(
    action: string,
    opts?: { targetType?: string; targetId?: string; targetLabel?: string; detail?: Record<string, unknown> }
  ): void {
    storage.logAuditEvent(action, opts).catch(err =>
      console.error("[audit] Failed to write audit log:", err)
    );
  }

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

  // --- Local number lookup via IP geolocation ---
  app.get("/api/local-number", async (req, res) => {
    function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371;
      const toRad = (v: number) => (v * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    try {
      const forwarded = req.headers["x-forwarded-for"] as string | undefined;
      const rawIp =
        forwarded?.split(",")[0]?.trim() ||
        (req.headers["x-real-ip"] as string | undefined) ||
        req.socket.remoteAddress ||
        "";
      const ip = rawIp.replace(/^::ffff:/, "");

      const isPrivate =
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip === "" ||
        /^10\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
        /^192\.168\./.test(ip);

      let geoCity: string | null = null;
      let geoState: string | null = null;
      let geoLat: number | null = null;
      let geoLon: number | null = null;

      if (!isPrivate) {
        try {
          const geoRes = await fetch(
            `http://ip-api.com/json/${ip}?fields=status,city,regionName,lat,lon`
          );
          if (geoRes.ok) {
            const geo = await geoRes.json() as {
              status: string;
              city?: string;
              regionName?: string;
              lat?: number;
              lon?: number;
            };
            if (geo.status === "success") {
              geoCity = geo.city || null;
              geoState = geo.regionName || null;
              geoLat = geo.lat ?? null;
              geoLon = geo.lon ?? null;
            }
          }
        } catch (geoErr) {
          console.warn("[local-number] IP geolocation failed:", geoErr);
        }
      }

      const allRegions = await storage.getAllRegions();
      const activeRegions = allRegions.filter((r) => r.isActive);

      if (activeRegions.length === 0) {
        return res.json({ city: geoCity, state: geoState, phoneNumber: null, regionName: null, regionId: null, activeCalls: 0 });
      }

      // If we have coordinates, find the closest region by its defaultZipCode
      if (geoLat !== null && geoLon !== null) {
        let closestRegion = null;
        let closestDist = Infinity;

        for (const region of activeRegions) {
          if (!region.defaultZipCode) continue;
          const zipEntry = await storage.getZipEntryByCode(region.defaultZipCode);
          if (!zipEntry?.latitude || !zipEntry?.longitude) continue;
          const dist = haversineKm(geoLat!, geoLon!, zipEntry.latitude, zipEntry.longitude);
          if (dist < closestDist) {
            closestDist = dist;
            closestRegion = region;
          }
        }

        if (closestRegion) {
          const regionStats = await storage.getRegionStats(closestRegion.id);
          return res.json({
            city: geoCity,
            state: geoState,
            phoneNumber: closestRegion.phoneNumber,
            regionName: closestRegion.name,
            regionId: closestRegion.id,
            activeCalls: regionStats.activeCalls,
          });
        }
      }

      // Fallback: just return the first active region's number
      const fallbackRegion = activeRegions[0];
      const fallbackStats = await storage.getRegionStats(fallbackRegion.id);
      return res.json({
        city: geoCity,
        state: geoState,
        phoneNumber: fallbackRegion.phoneNumber,
        regionName: fallbackRegion.name,
        regionId: fallbackRegion.id,
        activeCalls: fallbackStats.activeCalls,
      });
    } catch (err) {
      console.error("[local-number] error:", err);
      return res.json({ city: null, state: null, phoneNumber: null, regionName: null });
    }
  });

  // --- Admin: List all profiles ---
  app.get("/api/admin/profiles", async (_req, res) => {
    try {
      const data = await storage.getAdminUploadedProfilesWithUsers();
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

      logAudit("profile_uploaded", { targetType: "profile", targetId: profile.id, targetLabel: user.phoneNumber });
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
      logAudit("profile_deleted", { targetType: "profile", targetId: id, targetLabel: target?.phoneNumber });
      res.status(204).send();
    } catch (e) {
      console.error("[admin] Failed to delete profile:", e);
      res.status(500).json({ message: "Failed to delete profile" });
    }
  });

  // --- Admin: All messages inbox ---
  app.get("/api/admin/messages", async (_req, res) => {
    try {
      const msgs = await storage.getAllMessagesAdmin();
      res.json(msgs);
    } catch (e) {
      console.error("[admin] /api/admin/messages GET error:", e);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // --- Admin: Blocked numbers list ---
  app.get("/api/admin/blocked", async (_req, res) => {
    try {
      const list = await storage.getAdminBlockedList();
      res.json(list);
    } catch (e) {
      console.error("[admin] /api/admin/blocked GET error:", e);
      res.status(500).json({ message: "Failed to fetch blocked list" });
    }
  });

  app.delete("/api/admin/blocked/:id", async (req, res) => {
    try {
      await storage.adminUnblockById(req.params.id);
      logAudit("user_unblocked", { targetType: "blocked", targetId: req.params.id });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] /api/admin/blocked DELETE error:", e);
      res.status(500).json({ message: "Failed to unblock" });
    }
  });

  // --- Admin: Flagged content queue ---
  app.get("/api/admin/flagged", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const items = await storage.getAllFlaggedItems(status);
      res.json(items);
    } catch (e) {
      console.error("[admin] /api/admin/flagged GET error:", e);
      res.status(500).json({ message: "Failed to fetch flagged content" });
    }
  });

  app.post("/api/admin/flagged", async (req, res) => {
    try {
      const { contentType, contentId, reason, reportedByUserId } = req.body as {
        contentType: string; contentId: string; reason: string; reportedByUserId?: string;
      };
      if (!contentType || !contentId || !reason) return res.status(400).json({ message: "contentType, contentId, and reason are required" });
      const item = await storage.createFlaggedItem({ contentType, contentId, reason, reportedByUserId: reportedByUserId ?? null, status: "pending" });
      logAudit("content_flagged", { targetType: "flagged", targetId: item.id, targetLabel: contentType });
      res.status(201).json(item);
    } catch (e) {
      console.error("[admin] /api/admin/flagged POST error:", e);
      res.status(500).json({ message: "Failed to create flag" });
    }
  });

  app.patch("/api/admin/flagged/:id", async (req, res) => {
    try {
      const { status } = req.body as { status: string };
      if (!["approved", "removed"].includes(status)) return res.status(400).json({ message: "status must be 'approved' or 'removed'" });
      await storage.resolveFlaggedItem(req.params.id, status);
      logAudit("flagged_resolved", { targetType: "flagged", targetId: req.params.id, detail: { status } });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] /api/admin/flagged PATCH error:", e);
      res.status(500).json({ message: "Failed to resolve flag" });
    }
  });

  app.delete("/api/admin/flagged/:id", async (req, res) => {
    try {
      await storage.deleteFlaggedItem(req.params.id);
      logAudit("flagged_deleted", { targetType: "flagged", targetId: req.params.id });
      res.status(204).send();
    } catch (e) {
      console.error("[admin] /api/admin/flagged DELETE error:", e);
      res.status(500).json({ message: "Failed to delete flag" });
    }
  });

  // --- Admin: Caller directory ---
  app.get("/api/admin/callers", async (_req, res) => {
    try {
      const callers = await storage.getAllCallersWithDetails();
      res.json(callers);
    } catch (e) {
      console.error("[admin] /api/admin/callers GET error:", e);
      res.status(500).json({ message: "Failed to fetch callers" });
    }
  });

  // --- Admin: Caller detail ---
  app.get("/api/admin/callers/:id", async (req, res) => {
    try {
      const detail = await storage.getCallerDetailById(req.params.id);
      if (!detail) return res.status(404).json({ message: "Caller not found" });
      res.json(detail);
    } catch (e) {
      console.error("[admin] /api/admin/callers/:id GET error:", e);
      res.status(500).json({ message: "Failed to fetch caller detail" });
    }
  });

  // --- Admin: Adjust caller credits ---
  app.patch("/api/admin/callers/:id/credits", async (req, res) => {
    try {
      const { deltaSeconds } = req.body as { deltaSeconds: number };
      if (typeof deltaSeconds !== "number") return res.status(400).json({ message: "deltaSeconds must be a number" });
      const user = await storage.adjustUserCredits(req.params.id, deltaSeconds);
      logAudit("caller_credited", { targetType: "caller", targetId: req.params.id, targetLabel: user.phoneNumber, detail: { deltaSeconds } });
      res.json(user);
    } catch (e) {
      console.error("[admin] /api/admin/callers/:id/credits PATCH error:", e);
      res.status(500).json({ message: "Failed to adjust credits" });
    }
  });

  // --- Admin: Block a user (from admin, on behalf of the system) ---
  app.post("/api/admin/callers/:id/block/:targetId", async (req, res) => {
    try {
      await storage.adminBlockByUserIds(req.params.id, req.params.targetId);
      logAudit("caller_blocked", { targetType: "caller", targetId: req.params.id, detail: { blockedUserId: req.params.targetId } });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] /api/admin/callers block POST error:", e);
      res.status(500).json({ message: "Failed to create block" });
    }
  });

  // --- Admin: Unblock a user ---
  app.delete("/api/admin/callers/:id/block/:targetId", async (req, res) => {
    try {
      await storage.adminUnblockByUserIds(req.params.id, req.params.targetId);
      logAudit("caller_unblocked", { targetType: "caller", targetId: req.params.id, detail: { unblockedUserId: req.params.targetId } });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] /api/admin/callers unblock DELETE error:", e);
      res.status(500).json({ message: "Failed to remove block" });
    }
  });

  // --- Admin: Set or clear a caller's membership PIN ---
  app.patch("/api/admin/callers/:id/pin", async (req, res) => {
    try {
      const { pin } = req.body as { pin: string | null };
      if (pin !== null && (typeof pin !== "string" || !/^\d{4}$/.test(pin))) {
        return res.status(400).json({ message: "PIN must be exactly 4 digits or null to clear" });
      }
      const user = await storage.updateUserMembership(req.params.id, { membershipPin: pin ?? null });
      logAudit(pin ? "caller_pin_set" : "caller_pin_cleared", { targetType: "caller", targetId: req.params.id, targetLabel: user.phoneNumber });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] /api/admin/callers/:id/pin PATCH error:", e);
      res.status(500).json({ message: "Failed to update PIN" });
    }
  });

  // --- Admin: Zip Code Neighborhoods ---
  app.get("/api/admin/zip-codes", async (_req, res) => {
    try {
      const entries = await storage.getAllZipCodes();
      res.json(entries);
    } catch (e) {
      console.error("[admin] /api/admin/zip-codes GET error:", e);
      res.status(500).json({ message: "Failed to fetch zip codes" });
    }
  });

  app.post("/api/admin/zip-codes", async (req, res) => {
    try {
      const { code, neighborhood, latitude, longitude } = req.body;
      if (!/^\d{5}$/.test(code) || !neighborhood?.trim()) {
        return res.status(400).json({ message: "Valid 5-digit zip code and neighborhood name are required" });
      }
      const lat = latitude !== undefined && latitude !== "" ? parseFloat(latitude) : undefined;
      const lon = longitude !== undefined && longitude !== "" ? parseFloat(longitude) : undefined;
      const entry = await storage.upsertAdminZipEntry(code.trim(), neighborhood.trim(), lat, lon);
      logAudit("zip_code_created", { targetType: "zip_code", targetId: entry.id, targetLabel: code });
      res.json(entry);
    } catch (e) {
      console.error("[admin] /api/admin/zip-codes POST error:", e);
      res.status(500).json({ message: "Failed to save zip code" });
    }
  });

  app.patch("/api/admin/zip-codes/:id", async (req, res) => {
    try {
      const { neighborhood, latitude, longitude } = req.body;
      if (!neighborhood?.trim()) {
        return res.status(400).json({ message: "Neighborhood name is required" });
      }
      const lat = latitude !== undefined && latitude !== "" ? parseFloat(latitude) : undefined;
      const lon = longitude !== undefined && longitude !== "" ? parseFloat(longitude) : undefined;
      const entry = await storage.updateZipEntry(req.params.id, neighborhood.trim(), lat, lon);
      logAudit("zip_code_updated", { targetType: "zip_code", targetId: req.params.id, detail: { neighborhood, latitude: lat, longitude: lon } });
      res.json(entry);
    } catch (e) {
      console.error("[admin] /api/admin/zip-codes PATCH error:", e);
      res.status(500).json({ message: "Failed to update zip code" });
    }
  });

  app.delete("/api/admin/zip-codes/:id", async (req, res) => {
    try {
      await storage.deleteZipEntry(req.params.id);
      logAudit("zip_code_deleted", { targetType: "zip_code", targetId: req.params.id });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] /api/admin/zip-codes DELETE error:", e);
      res.status(500).json({ message: "Failed to delete zip code" });
    }
  });

  // --- Admin: Promo Codes ---
  app.get("/api/admin/promo-codes", async (_req, res) => {
    try {
      const codes = await storage.getAllPromoCodes();
      res.json(codes);
    } catch (e) {
      console.error("[admin] promo-codes GET error:", e);
      res.status(500).json({ message: "Failed to fetch promo codes" });
    }
  });

  app.post("/api/admin/promo-codes", async (req, res) => {
    try {
      const { code, description, valueMinutes, maxUses, expiresAt, isActive } = req.body;
      if (!code?.trim() || !valueMinutes || isNaN(Number(valueMinutes)) || Number(valueMinutes) < 1) {
        return res.status(400).json({ message: "Code and valueMinutes (≥1) are required" });
      }
      const created = await storage.createPromoCode({
        code: String(code).toUpperCase().trim(),
        description: description?.trim() || null,
        valueMinutes: Math.floor(Number(valueMinutes)),
        maxUses: maxUses ? Math.floor(Number(maxUses)) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive !== false,
      });
      logAudit("promo_code_created", { targetType: "promo_code", targetId: created.id, targetLabel: created.code, detail: { valueMinutes: created.valueMinutes } });
      res.json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ message: "That promo code already exists" });
      console.error("[admin] promo-codes POST error:", e);
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });

  app.patch("/api/admin/promo-codes/:id", async (req, res) => {
    try {
      const { description, valueMinutes, maxUses, expiresAt, isActive } = req.body;
      const data: Record<string, unknown> = {};
      if (description !== undefined) data.description = description?.trim() || null;
      if (valueMinutes !== undefined) data.valueMinutes = Math.floor(Number(valueMinutes));
      if (maxUses !== undefined) data.maxUses = maxUses ? Math.floor(Number(maxUses)) : null;
      if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (isActive !== undefined) data.isActive = Boolean(isActive);
      const updated = await storage.updatePromoCode(req.params.id, data as any);
      logAudit("promo_code_updated", { targetType: "promo_code", targetId: req.params.id, targetLabel: updated.code });
      res.json(updated);
    } catch (e) {
      console.error("[admin] promo-codes PATCH error:", e);
      res.status(500).json({ message: "Failed to update promo code" });
    }
  });

  app.delete("/api/admin/promo-codes/:id", async (req, res) => {
    try {
      await storage.deletePromoCode(req.params.id);
      logAudit("promo_code_deleted", { targetType: "promo_code", targetId: req.params.id });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] promo-codes DELETE error:", e);
      res.status(500).json({ message: "Failed to delete promo code" });
    }
  });

  app.get("/api/admin/promo-codes/:id/redemptions", async (req, res) => {
    try {
      const redemptions = await storage.getPromoRedemptions(req.params.id);
      res.json(redemptions);
    } catch (e) {
      console.error("[admin] promo-codes redemptions GET error:", e);
      res.status(500).json({ message: "Failed to fetch redemptions" });
    }
  });

  // --- Admin: Mailbox stats ---
  app.get("/api/admin/mailbox-stats", async (_req, res) => {
    try {
      const data = await storage.getMailboxStats();
      res.json(data);
    } catch (e) {
      console.error("[admin] /api/admin/mailbox-stats error:", e);
      res.status(500).json({ message: "Failed to fetch mailbox stats" });
    }
  });

  // --- Admin: Phone number stats ---
  app.get("/api/admin/audit-logs", async (_req, res) => {
    try {
      const logs = await storage.getAuditLogs(300);
      res.json(logs);
    } catch (e) {
      console.error("[admin] /api/admin/audit-logs error:", e);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/admin/analytics", async (_req, res) => {
    try {
      const data = await storage.getAnalytics();
      res.json(data);
    } catch (e) {
      console.error("[admin] /api/admin/analytics error:", e);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/admin/phone-stats", async (req, res) => {
    try {
      const now = new Date();
      const year  = parseInt((req.query.year  as string) || String(now.getFullYear()), 10);
      const month = parseInt((req.query.month as string) || String(now.getMonth() + 1), 10);
      const stats = await storage.getPhoneNumberStats(year, month);
      res.json(stats);
    } catch (e) {
      console.error("[admin] /api/admin/phone-stats error:", e);
      res.status(500).json({ message: "Failed to fetch phone stats" });
    }
  });

  // ─── Admin: Membership Cards ──────────────────────────────────────────────

  app.get("/api/admin/cards", async (_req, res) => {
    try {
      const cards = await storage.getAllMembershipCards();
      res.json(cards);
    } catch (e) {
      console.error("[admin] /api/admin/cards GET error:", e);
      res.status(500).json({ message: "Failed to fetch membership cards" });
    }
  });

  app.post("/api/admin/cards", async (req, res) => {
    try {
      const { seconds, notes } = req.body as { seconds?: number; notes?: string };
      if (!seconds || isNaN(Number(seconds)) || Number(seconds) < 1) {
        return res.status(400).json({ message: "A membership plan (seconds) is required" });
      }
      const valueSeconds = Math.floor(Number(seconds));
      const cardNumber = await generateUniqueCardNumber();
      const card = await storage.createMembershipCard(cardNumber, valueSeconds, notes ?? undefined);
      res.status(201).json(card);
    } catch (e) {
      console.error("[admin] /api/admin/cards POST error:", e);
      res.status(500).json({ message: "Failed to create membership card" });
    }
  });

  app.patch("/api/admin/cards/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body as { notes?: string };
      await storage.updateMembershipCardNotes(id, notes ?? "");
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] /api/admin/cards PATCH error:", e);
      res.status(500).json({ message: "Failed to update membership card" });
    }
  });

  app.delete("/api/admin/cards/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteMembershipCard(id);
      res.json({ success: true });
    } catch (e) {
      console.error("[admin] /api/admin/cards DELETE error:", e);
      res.status(500).json({ message: "Failed to delete membership card" });
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
      const files: { filename: string; url: string; size: number; folder: string }[] = [];

      // Shared files (root uploads/)
      for (const f of fs.readdirSync(UPLOADS_DIR)) {
        const full = path.join(UPLOADS_DIR, f);
        if (f.endsWith(".mp3") && fs.statSync(full).isFile()) {
          files.push({ filename: f, url: `/uploads/${f}`, size: fs.statSync(full).size, folder: "shared" });
        }
      }

      // Category subfolders (mm/ and mw/)
      for (const cat of ["mm", "mw"]) {
        const catDir = path.join(UPLOADS_DIR, cat);
        if (fs.existsSync(catDir) && fs.statSync(catDir).isDirectory()) {
          for (const f of fs.readdirSync(catDir)) {
            const full = path.join(catDir, f);
            if (f.endsWith(".mp3") && fs.statSync(full).isFile()) {
              files.push({ filename: f, url: `/uploads/${cat}/${f}`, size: fs.statSync(full).size, folder: cat });
            }
          }
        }
      }

      res.json(files);
    } catch (e) {
      res.status(500).json({ message: "Failed to list prompts" });
    }
  });

  // Generate a TTS audio file via ElevenLabs — supports optional 'folder' param (mm/mw/undefined=shared)
  app.post("/api/admin/tts/generate", async (req, res) => {
    try {
      const { text, filename, folder } = req.body as { text?: string; filename?: string; folder?: string };
      if (!text?.trim()) return res.status(400).json({ message: "text is required" });
      if (!filename?.trim()) return res.status(400).json({ message: "filename is required" });

      const validFolders = ["mm", "mw"];
      const targetFolder = folder && validFolders.includes(folder.toLowerCase()) ? folder.toLowerCase() : null;

      // Enforce .mp3 extension and sanitize
      const safe = filename.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/\.mp3$/i, "") + ".mp3";
      await generateTTS(text.trim(), safe, targetFolder ?? undefined);
      const fileLabel = targetFolder ? `${targetFolder}/${safe}` : safe;
      logAudit("audio_generated", { targetType: "audio", targetLabel: fileLabel });
      res.json({
        filename: safe,
        url: targetFolder ? `/uploads/${targetFolder}/${safe}` : `/uploads/${safe}`,
        folder: targetFolder ?? "shared",
      });
    } catch (e: any) {
      console.error("[admin/tts] generation failed:", e);
      res.status(500).json({ message: e?.message ?? "TTS generation failed" });
    }
  });

  // Delete a prompt file from uploads/ — supports ?folder=mm or ?folder=mw for category files
  app.delete("/api/admin/tts/prompts/:filename", (req, res) => {
    try {
      const { filename } = req.params;
      const folder = req.query.folder as string | undefined;

      if (!filename.endsWith(".mp3")) return res.status(400).json({ message: "Invalid filename" });

      const validFolders = ["mm", "mw"];
      const targetFolder = folder && validFolders.includes(folder.toLowerCase()) ? folder.toLowerCase() : null;

      const filePath = targetFolder
        ? path.join(UPLOADS_DIR, targetFolder, filename)
        : path.join(UPLOADS_DIR, filename);

      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      fs.unlinkSync(filePath);
      const fileLabel = targetFolder ? `${targetFolder}/${filename}` : filename;
      logAudit("audio_deleted", { targetType: "audio", targetLabel: fileLabel });
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

  // ─── Site Settings (public read, admin write) ─────────────────────────────

  app.get("/api/site-settings", async (_req, res) => {
    try {
      const settings = await storage.getSiteSettings();
      res.json(settings);
    } catch (e) {
      console.error("[site-settings] Failed to get site settings:", e);
      res.status(500).json({ message: "Failed to fetch site settings" });
    }
  });

  app.get("/api/admin/site-settings", async (_req, res) => {
    try {
      const settings = await storage.getSiteSettings();
      res.json(settings);
    } catch (e) {
      console.error("[admin] Failed to get site settings:", e);
      res.status(500).json({ message: "Failed to fetch site settings" });
    }
  });

  app.put("/api/admin/site-settings", async (req, res) => {
    try {
      const { siteName, fallbackPhoneNumber, customerServiceEmail, customerServicePhone, siteCategory } = req.body;
      const data: Record<string, string | null> = {};
      if (siteName !== undefined) data.siteName = String(siteName).trim() || "Phone Booth";
      if (fallbackPhoneNumber !== undefined) data.fallbackPhoneNumber = String(fallbackPhoneNumber).trim() || "800-730-2508";
      if (customerServiceEmail !== undefined) data.customerServiceEmail = customerServiceEmail ? String(customerServiceEmail).trim() : null;
      if (customerServicePhone !== undefined) data.customerServicePhone = customerServicePhone ? String(customerServicePhone).trim() : null;
      if (siteCategory !== undefined) data.siteCategory = siteCategory === "MW" ? "MW" : "MM";
      const updated = await storage.updateSiteSettings(data);
      invalidateSiteSettingsCache();
      logAudit("site_settings_updated", { targetType: "settings", detail: data as Record<string, unknown> });
      res.json(updated);
    } catch (e) {
      console.error("[admin] Failed to update site settings:", e);
      res.status(500).json({ message: "Failed to update site settings" });
    }
  });

  app.get("/api/membership-settings", async (_req, res) => {
    try {
      const settings = await storage.getMembershipSettings();
      res.json(settings);
    } catch (e) {
      console.error("[membership-settings] Failed:", e);
      res.status(500).json({ message: "Failed to fetch membership settings" });
    }
  });

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
        billingMode,
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
      if (billingMode !== undefined) data.billingMode = billingMode === "per_day" ? "per_day" : "per_minute";

      const updated = await storage.updateMembershipSettings(data);
      invalidateMembershipSettingsCache();
      logAudit("membership_settings_updated", { targetType: "settings", detail: data as Record<string, unknown> });
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
      logAudit("region_created", { targetType: "region", targetId: region.id, targetLabel: region.name });
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
      logAudit("region_updated", { targetType: "region", targetId: id, targetLabel: region.name });
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
      logAudit("region_deleted", { targetType: "region", targetId: id });
      res.status(204).send();
    } catch (e) {
      console.error("[regions] Failed to delete region:", e);
      res.status(500).json({ message: "Failed to delete region" });
    }
  });

  // --- Twilio Voice Webhooks ---

  async function getOrCreateUser(phoneNumber: string) {
    // Check if this number is an alternate number linked to a primary membership
    const primaryPhone = await storage.getPrimaryPhoneForAltNumber(phoneNumber);
    const effectivePhone = primaryPhone ?? phoneNumber;

    let user = await storage.getUserByPhone(effectivePhone);
    if (!user) {
      user = await storage.createUser({ phoneNumber: effectivePhone });
    }
    return user;
  }

  // Starts billing for a call. Safe to call multiple times — only initialises once.
  function startBilling(callSid: string, fromNumber: string): void {
    if (!billingCheckpoints.has(callSid)) {
      billingCheckpoints.set(callSid, { lastCheck: Date.now(), fromNumber, accumulatedSeconds: 0 });
      console.log(`[billing] Started for callSid=${callSid}`);
    }
  }

  // Accumulates elapsed seconds since the last checkpoint and deducts whole minutes.
  // Billing is per-minute: partial minutes are held in the accumulator and only
  // charged as full minutes — the leftover is rounded up at finalizeCallBilling.
  // When a membership override is active, deducts from the membership holder's account.
  async function syncBilling(callSid: string): Promise<void> {
    const checkpoint = billingCheckpoints.get(callSid);
    if (!checkpoint) return;
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - checkpoint.lastCheck) / 1000);
    if (elapsedSeconds <= 0) return;
    checkpoint.lastCheck = now;
    checkpoint.accumulatedSeconds += elapsedSeconds;

    // Deduct only whole minutes — keep the remainder in the accumulator
    const minutesToDeduct = Math.floor(checkpoint.accumulatedSeconds / 60);
    if (minutesToDeduct <= 0) return;
    const secondsToDeduct = minutesToDeduct * 60;
    checkpoint.accumulatedSeconds -= secondsToDeduct;

    try {
      const overridePhone = callMembershipOverride.get(callSid);
      const billingPhone = overridePhone ?? checkpoint.fromNumber;
      const user = await storage.getOrCreateUser(billingPhone);
      await storage.deductSeconds(user.id, secondsToDeduct);
      console.log(`[billing] syncBilling: deducted ${secondsToDeduct}s (${minutesToDeduct} min) from userId=${user.id}${overridePhone ? " (membership override)" : ""}`);
    } catch (err) {
      console.error("[billing] syncBilling error:", err);
    }
  }

  // Runs a final sync, then rounds up any remaining partial minute to a full minute.
  // This ensures that even a 20-second call costs 1 full minute (per-minute billing).
  async function finalizeCallBilling(callSid: string): Promise<void> {
    await syncBilling(callSid);
    const checkpoint = billingCheckpoints.get(callSid);
    if (checkpoint && checkpoint.accumulatedSeconds > 0) {
      // Partial minute remaining — charge a full minute (round up)
      try {
        const overridePhone = callMembershipOverride.get(callSid);
        const billingPhone = overridePhone ?? checkpoint.fromNumber;
        const user = await storage.getOrCreateUser(billingPhone);
        await storage.deductSeconds(user.id, 60);
        console.log(`[billing] finalizeCallBilling: rounded up ${checkpoint.accumulatedSeconds}s remainder to 1 min for userId=${user.id}`);
      } catch (err) {
        console.error("[billing] finalizeCallBilling roundup error:", err);
      }
    }
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
    for (const [room, session] of Array.from(liveBillingSessions.entries())) {
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

      // Finalize call log with Twilio-reported duration
      const callDuration = parseInt(req.body?.CallDuration ?? "0", 10);
      if (!isNaN(callDuration)) {
        storage.finalizeCallLog(callSid, callDuration).catch(() => {});
      }

      try {
        await storage.removeActiveCall(callSid);
        console.log(`[status] Removed ${callSid} from active calls`);
      } catch (err) {
        console.error(`[status] Error removing active call ${callSid}:`, err);
      }
      // Clean up per-caller browse queue, payment session, name recording, greeting draft, time flags, region mapping, and membership override
      callerBrowseState.delete(callSid);
      categoryBrowseState.delete(callSid);
      paymentSessions.delete(callSid);
      pendingNameRecordings.delete(callSid);
      pendingGreetingDrafts.delete(callSid);
      callTimeAnnounced.delete(callSid);
      callWarningShown.delete(callSid);
      callRegion.delete(callSid);
      callMembershipOverride.delete(callSid);
      pendingMembershipEntries.delete(callSid);
      pendingPinAuth.delete(callSid);
      pendingNewPinSetup.delete(callSid);

      // Clean up any live connect invite that this caller initiated
      for (const [targetUserId, invite] of Array.from(pendingLiveInvites.entries())) {
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
      await storage.removeStaleActiveCalls(20);
      const user = await getOrCreateUser(fromNumber);
      // Remove any lingering active call rows for this user (e.g. status callback was missed)
      await storage.removeActiveCallsByUser(user.id);
      await storage.registerActiveCall(callSid, user.id);
      storage.logCall(callSid, fromNumber, req.body?.To || null, null).catch(() => {});
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
  // Plays the system greeting + disclaimer, then prompts for membership number entry.
  app.post("/voice/entry", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      playPrompt(twiml, req, "system_greeting.mp3",
        "Welcome to the Phone Booth. this service assumes no responsibility for personal meetings.");

      playPrompt(twiml, req, "disclaimer.mp3", "");

      // Play Announcement / MOTD if enabled
      const motdCfg = await getMembershipSettingsCached();
      if (motdCfg.motdEnabled && motdCfg.motdText) {
        playPrompt(twiml, req, "motd.mp3", motdCfg.motdText);
      }

      // Prompt caller for optional membership number entry
      twiml.redirect("/voice/membership-entry");
    } catch (error) {
      console.error("[voice] /voice/entry error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b-i. Membership Gateway ──────────────────────────────────────────────
  // Asks caller if they have a membership. Press 1 to enter it, # to skip.
  app.post("/voice/membership-entry", async (req, res) => {
    const twiml = new VoiceResponse();

    const gather = twiml.gather({
      numDigits: 1,
      finishOnKey: "",
      action: "/voice/handle-membership-gateway",
      timeout: 5,
    });
    playPrompt(gather, req, "membership_entry_prompt.mp3",
      "If you have a membership press 1 now. Otherwise press the pound key.");
    // No input / timeout → skip membership and continue
    twiml.redirect("/voice/entry-check");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b-i-a. Handle Membership Gateway Choice ──────────────────────────────
  app.post("/voice/handle-membership-gateway", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = (req.body?.Digits as string) ?? "";

    if (digit === "1") {
      twiml.redirect("/voice/membership-number-entry");
    } else {
      // # or anything else → skip membership
      twiml.redirect("/voice/entry-check");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b-i-b. Membership Number Entry ───────────────────────────────────────
  // Collects the 5-digit membership number; auto-fires after the 5th digit.
  app.post("/voice/membership-number-entry", async (req, res) => {
    const twiml = new VoiceResponse();

    const gather = twiml.gather({
      numDigits: 5,
      finishOnKey: "#",
      action: "/voice/handle-membership-entry",
      timeout: 10,
    });
    gather.say("Please enter your 5-digit membership number.");
    // No input / timeout → skip membership and continue
    twiml.redirect("/voice/entry-check");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b-ii. Handle Membership Number Entry ─────────────────────────────────
  app.post("/voice/handle-membership-entry", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    if (digits.length === 3) {
      // 3-digit web account link code — verify caller's phone and link to web account
      try {
        const linkCode = await storage.getActiveMembershipLinkCode(digits);
        if (linkCode) {
          // Look up existing phone user — only carry over membership number if they have one (purchased)
          const phoneUser = await storage.getUserByPhone(fromNumber);
          const membershipNumber = phoneUser?.membershipNumber ?? undefined;

          await storage.linkWebUserPhone(linkCode.webUserId, fromNumber, membershipNumber);
          await storage.consumeMembershipLinkCode(linkCode.id);
          console.log(`[voice] Web link code ${digits} matched — linked ${fromNumber}${membershipNumber ? ` (membership ${membershipNumber})` : " (no membership yet)"} to webUserId=${linkCode.webUserId}`);

          if (membershipNumber) {
            // Read the membership number digit-by-digit
            twiml.say("Your phone number has been linked to your web account. Your membership number is:");
            for (const digit of membershipNumber.replace(/\D/g, "")) {
              twiml.say(digit);
            }
            twiml.say("You can now sign in to the web portal to manage your account.");
          } else {
            twiml.say("Your phone number has been linked to your web account. You can now sign in to the web portal.");
          }
        } else {
          console.log(`[voice] Web link code ${digits} invalid or expired`);
          playPrompt(twiml, req, "link_code_invalid.mp3",
            "That code is invalid or has expired. Please generate a new code from your web account and try again.");
        }
      } catch (err) {
        console.error("[voice] Web link code error:", err);
      }
      twiml.redirect("/voice/entry-check");
    } else if (digits.length === 5) {
      // 5-digit membership card number
      try {
        const card = await storage.getMembershipCardByNumber(digits);
        if (!card) {
          console.log(`[voice] Card not found: ${digits}`);
          playPrompt(twiml, req, "membership_invalid.mp3",
            "We could not find a membership card with that number. Please check your card and try again.");
          twiml.redirect("/voice/entry-check");
        } else if (!card.phoneNumber) {
          // First use — link this caller's phone to the card
          await storage.linkCardToPhone(card.id, fromNumber);
          // Ensure a users record exists for this phone and set the card's number as their membership
          let phoneUser = await storage.getUserByPhone(fromNumber);
          if (!phoneUser) {
            phoneUser = await storage.getOrCreateUser(fromNumber);
          }
          await storage.updateUserMembership(phoneUser.id, { membershipNumber: card.cardNumber });
          console.log(`[voice] Card ${digits} first use — linked to ${fromNumber}`);
          playPrompt(twiml, req, "membership_linked.mp3",
            "Your membership card has been activated and linked to this phone number. Welcome.");
          twiml.redirect("/voice/entry-check");
        } else if (card.phoneNumber === fromNumber) {
          // Returning member using their card number
          console.log(`[voice] Card ${digits} recognized for ${fromNumber}`);
          playPrompt(twiml, req, "membership_linked.mp3", "Your membership has been verified. Welcome.");
          twiml.redirect("/voice/entry-check");
        } else {
          // Card already linked to a different phone — require PIN if one is set
          let cardUser = await storage.getUserByPhone(card.phoneNumber);
          if (cardUser?.membershipPin) {
            console.log(`[voice] Card ${digits} on different phone — PIN required`);
            pendingPinAuth.set(callSid, card.phoneNumber);
            twiml.redirect("/voice/membership-pin-entry");
          } else {
            console.log(`[voice] Card ${digits} already claimed by a different number (no PIN set)`);
            playPrompt(twiml, req, "membership_invalid.mp3",
              "This card is already registered to a different phone number. To call from any phone, please set a 4-digit PIN by calling from your registered phone first.");
            twiml.redirect("/voice/entry-check");
          }
        }
      } catch (err) {
        console.error("[voice] Card lookup error:", err);
        twiml.redirect("/voice/entry-check");
      }
    } else if (digits.length === 10) {
      // Legacy 10-digit membership number — require PIN if calling from a different phone
      try {
        const memberUser = await storage.getUserByMembershipNumber(digits);
        if (memberUser) {
          if (memberUser.phoneNumber === fromNumber) {
            // Calling from their own registered phone — no PIN needed
            callMembershipOverride.set(callSid, memberUser.phoneNumber);
            console.log(`[voice] Membership linked (own phone): callSid=${callSid} → userId=${memberUser.id}`);
            playPrompt(twiml, req, "membership_linked.mp3", "Your membership has been verified. Welcome.");
            twiml.redirect("/voice/entry-check-override");
          } else if (memberUser.membershipPin) {
            // Different phone with PIN set — redirect to PIN entry
            console.log(`[voice] Membership ${digits} on different phone — PIN required`);
            pendingPinAuth.set(callSid, memberUser.phoneNumber);
            twiml.redirect("/voice/membership-pin-entry");
          } else {
            // Different phone, no PIN set
            console.log(`[voice] Membership ${digits} on different phone — no PIN set`);
            playPrompt(twiml, req, "membership_invalid.mp3",
              "We found your membership, but you are calling from a different phone. To call from any phone, please set a 4-digit PIN by calling from your registered phone first.");
            twiml.redirect("/voice/entry-check");
          }
        } else {
          console.log(`[voice] Membership lookup failed: membershipNumber=${digits}`);
          playPrompt(twiml, req, "membership_invalid.mp3",
            "We could not find a membership with that number. Please try calling from your registered phone number.");
          twiml.redirect("/voice/entry-check");
        }
      } catch (err) {
        console.error("[voice] Membership lookup error:", err);
        twiml.redirect("/voice/entry-check");
      }
    } else {
      // Pressed # (empty digits) or partial/invalid input — continue without membership
      twiml.redirect("/voice/entry-check");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1c-alt. Entry Check with Override ────────────────────────────────────
  // Used after a successful membership link — checks the MEMBERSHIP account's state.
  app.post("/voice/entry-check-override", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    try {
      const overridePhone = callMembershipOverride.get(callSid);
      const user = overridePhone
        ? await storage.getOrCreateUser(overridePhone)
        : await getOrCreateUser(fromNumber);

      const remainingSeconds = user.remainingSeconds ?? 0;

      if (!user.membershipTier) {
        twiml.redirect("/voice/free-trial-offer");
      } else if (remainingSeconds <= 0) {
        playPrompt(twiml, req, "access_expired.mp3", "Your membership time has expired.");
        twiml.redirect("/voice/membership-purchase");
      } else {
        playTimeRemaining(twiml, req, Math.floor(remainingSeconds / 60));
        callTimeAnnounced.add(callSid);
        // MW systems bypass the main menu and go straight into the phone booth
        const siteConf = await getSiteSettingsCached();
        twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/phone-booth" : "/voice/main-menu");
      }
    } catch (error) {
      console.error("[voice] /voice/entry-check-override error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1c-pin. Membership PIN Entry ─────────────────────────────────────────
  // Prompted after a caller enters a valid membership number from a different phone.
  // They must enter their 4-digit PIN to gain access.
  app.post("/voice/membership-pin-entry", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;

    if (!pendingPinAuth.has(callSid)) {
      twiml.redirect("/voice/entry-check");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const gather = twiml.gather({
      numDigits: 4,
      finishOnKey: "",
      action: "/voice/handle-membership-pin-entry",
      timeout: 10,
    });
    gather.say("Please enter your 4-digit PIN.");
    twiml.redirect("/voice/entry-check");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-membership-pin-entry", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const callSid = req.body?.CallSid as string;

    const memberPhone = pendingPinAuth.get(callSid);
    if (!memberPhone) {
      twiml.redirect("/voice/entry-check");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      const memberUser = await storage.getUserByPhone(memberPhone);
      if (memberUser && memberUser.membershipPin && memberUser.membershipPin === digits) {
        pendingPinAuth.delete(callSid);
        callMembershipOverride.set(callSid, memberPhone);
        console.log(`[voice] PIN accepted for membership on callSid=${callSid} → phone=${memberPhone}`);
        twiml.say("PIN accepted. Welcome.");
        twiml.redirect("/voice/entry-check-override");
      } else {
        pendingPinAuth.delete(callSid);
        console.log(`[voice] PIN rejected for callSid=${callSid}`);
        twiml.say("Incorrect PIN. Please try again by calling from your registered phone number or entering your membership number again.");
        twiml.redirect("/voice/entry-check");
      }
    } catch (err) {
      console.error("[voice] PIN auth error:", err);
      pendingPinAuth.delete(callSid);
      twiml.redirect("/voice/entry-check");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1c. Entry Check ──────────────────────────────────────────────────────
  // Checks the caller's own account state and branches accordingly.
  app.post("/voice/entry-check", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
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
        // Has time — announce remaining time to all callers at entry
        playTimeRemaining(twiml, req, Math.floor(remainingSeconds / 60));
        callTimeAnnounced.add(callSid); // prevent main-menu from repeating it
        // MW systems bypass the main menu and go straight into the phone booth
        const siteConf = await getSiteSettingsCached();
        twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/phone-booth" : "/voice/main-menu");
      }
    } catch (error) {
      console.error("[voice] /voice/entry-check error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1c. Free Trial Offer ─────────────────────────────────────────────────
  // Shown to brand-new callers who have no account yet.
  // Press 1 = activate trial now. Press # = save for later (routed to main menu). Anything else = hangup.
  app.post("/voice/free-trial-offer", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-free-trial-offer", timeout: 15 });
    playPrompt(gather, req, "free_trial_offer.mp3",
      "We would like to offer you a free trial. To get your free trial now press 1. To get your free trial later press the pound key.");
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
      // Accept — activate free trial now
      try {
        const freeTrialMinutes = (await getMembershipSettingsCached()).freeTrialMinutes;
        const freeTrialSeconds = freeTrialMinutes * 60;
        const user = await getOrCreateUser(fromNumber);
        await storage.updateUserMembership(user.id, {
          membershipTier: "free_trial",
          remainingSeconds: freeTrialSeconds,
        });
        await storage.getOrCreateMailbox(user.id);
        console.log(`[voice] Free trial accepted — granted ${freeTrialMinutes} min (${freeTrialSeconds}s) to userId=${user.id}`);

        // Announce the trial minutes, then play the terms
        playTimeRemaining(twiml, req, freeTrialMinutes);
        playPrompt(twiml, req, "free_trial_terms.mp3",
          "Your free trial will expire in seven days and it must be used from this phone number.");
        callTimeAnnounced.add(callSid);

        // MW systems bypass the main menu and go straight into the phone booth
        const siteConf = await getSiteSettingsCached();
        twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/phone-booth" : "/voice/main-menu");
      } catch (error) {
        console.error("[voice] handle-free-trial-offer error:", error);
        playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
        twiml.hangup();
      }
    } else if (digit === "#") {
      // Save for later — let them browse without activating the trial
      twiml.redirect("/voice/main-menu");
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

      // Phone Booth MOTD
      try {
        const motdCfg = await getMembershipSettingsCached();
        if (motdCfg.motdPhoneBoothEnabled && motdCfg.motdPhoneBoothText) {
          playPrompt(twiml, req, "motd_phone_booth.mp3", motdCfg.motdPhoneBoothText);
        }
      } catch (err) {
        console.error("[voice] phone-booth motd error:", err);
      }

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
  // Second step (or standalone re-record). Saves the greeting immediately to
  // the database so playback works right away, then sends to the review screen.
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

      // Save immediately to DB so playback works right away at the review screen
      const user = await getOrCreateUser(fromNumber);
      await storage.upsertProfile({
        userId: user.id,
        nameRecordingUrl,
        recordingUrl,
        recordingDuration,
      });
      console.log(`[voice] Profile saved immediately for userId=${user.id} (dur=${recordingDuration}s)`);

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

    // ── Main Menu MOTD ───────────────────────────────────────────────────────
    try {
      const motdCfg = await getMembershipSettingsCached();
      if (motdCfg.motdMainMenuEnabled && motdCfg.motdMainMenuText) {
        playPrompt(twiml, req, "motd_main_menu.mp3", motdCfg.motdMainMenuText);
      }
    } catch (err) {
      console.error("[voice] main-menu motd error:", err);
    }

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-main-menu" });
    playPrompt(gather, req, "main_menu.mp3",
      "Main menu. " +
      "To enter the phone booth press star. " +
      "For mailboxes and personal ads press 1. " +
      "To add time or purchase a membership press 2. " +
      "For information on membership prices press 4. " +
      "To manage your membership press 8. " +
      "For customer service press 0. " +
      "To repeat these choices press 9."
    );
    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4. Handle Main Menu ──────────────────────────────────────────────────
  app.post("/voice/handle-main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "*") {
      // Enter the phone booth (live connector)
      twiml.redirect("/voice/phone-booth");
    } else if (digit === "1") {
      // Mailboxes and personal ads
      twiml.redirect("/voice/mailbox-menu");
    } else if (digit === "2") {
      // Add time / purchase membership — show promo-code option first
      twiml.redirect("/voice/purchase-pre-menu");
    } else if (digit === "4") {
      // Information on membership prices
      twiml.redirect("/voice/info-menu");
    } else if (digit === "8") {
      // Manage membership
      twiml.redirect("/voice/manage-membership");
    } else if (digit === "0") {
      // Customer service
      twiml.redirect("/voice/customer-service");
    } else if (digit === "9") {
      // Repeat main menu
      twiml.redirect("/voice/main-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a. Purchase Pre-Menu ────────────────────────────────────────────────
  // Plays promo code option then membership packages in one single prompt.
  // All minutes and prices come live from admin membership settings.
  // Digit 1 → promo code; 2/3/4 → package selection; 9 → repeat; # → cancel.
  app.post("/voice/purchase-pre-menu", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const s = await getMembershipSettingsCached();

      const p1Min = s.plan1Minutes;
      const p1Price = centsToLabel(s.plan1PriceCents);
      const p2Min = s.plan2Minutes;
      const p2Price = centsToLabel(s.plan2PriceCents);
      const p3Min = s.plan3Minutes;
      const p3Price = centsToLabel(s.plan3PriceCents);
      const bonusIsP2 = s.bonusPlanKey === "plan2";

      // Build plan 2 (middle) description — include bonus text if it's the bonus plan
      let plan2Line: string;
      if (bonusIsP2) {
        plan2Line =
          `For only ${p2Price} you'll get ${p2Min} minutes, and if it's your first purchase ` +
          `you'll get an extra ${p2Min} minutes absolutely free — ` +
          `that's ${p2Min * 2} minutes for only ${p2Price}, so to buy press 3.`;
      } else {
        plan2Line = `To buy ${p2Min} minutes for ${p2Price} press 3.`;
      }

      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-purchase-pre-menu" });
      gather.say(
        "If you have a promotional code press 1. " +
        `To buy ${p1Min} minutes for ${p1Price} press 2. ` +
        plan2Line + " " +
        `Or if you just need a little more time to close the deal or grab some digits, ` +
        `our lowest price package is what you need, so to buy ${p3Min} minutes for ${p3Price} press 4. ` +
        "To repeat these choices press 9. " +
        "To cancel press pound."
      );
    } catch (err) {
      console.error("[voice] /voice/purchase-pre-menu settings error:", err);
      // Fallback gather with no package details — just let them navigate away
      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-purchase-pre-menu" });
      gather.say("We're having trouble loading package information. To return to the main menu press 9. To cancel press pound.");
    }

    twiml.redirect("/voice/purchase-pre-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-purchase-pre-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;

    if (digit === "1") {
      // Caller has a promo code
      twiml.redirect("/voice/promo-code");
    } else if (digit === "9") {
      // Repeat the menu
      twiml.redirect("/voice/purchase-pre-menu");
    } else if (digit === "#") {
      // Cancel — return to main menu
      playPrompt(twiml, req, "package_cancelled.mp3", "Cancelled. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
    } else if (["2", "3", "4"].includes(digit)) {
      // Package selection — pass digit via query string (redirect won't carry Digits body)
      twiml.redirect(`/voice/handle-package-selection?Digits=${encodeURIComponent(digit)}`);
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/purchase-pre-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a2. Mailbox Menu ────────────────────────────────────────────────────
  app.post("/voice/mailbox-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-mailbox-menu" });
    playPrompt(gather, req, "mailbox_menu.mp3",
      "To go to your mailbox press one. " +
      "To record a new mailbox ad press two. " +
      "To listen to ads from other guys press three. " +
      "To repeat these choices press nine. " +
      "For the phone booth press star. " +
      "To go to the main menu press pound."
    );
    twiml.redirect("/voice/mailbox-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-mailbox-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;

    if (digit === "1") {
      twiml.redirect("/voice/my-mailbox");
    } else if (digit === "2") {
      twiml.redirect("/voice/ad-category-menu?mode=record");
    } else if (digit === "3") {
      twiml.redirect("/voice/ad-category-menu?mode=listen");
    } else if (digit === "9") {
      twiml.redirect("/voice/mailbox-menu");
    } else if (digit === "*") {
      twiml.redirect("/voice/phone-booth");
    } else if (digit === "#") {
      twiml.redirect("/voice/main-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a3. My Mailbox — check unread messages ─────────────────────────────
  app.post("/voice/my-mailbox", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);
      const unreadMessage = await storage.getUnreadMessage(user.id);

      if (unreadMessage) {
        // Time is deducted when listening to mailbox responses — start billing now
        startBilling(callSid, fromNumber);
        const senderProfile = await storage.getProfile(unreadMessage.fromUserId);
        const msgGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-mailbox-message?msgId=${unreadMessage.id}&senderId=${unreadMessage.fromUserId}`,
          timeout: 10,
        });
        if (senderProfile?.nameRecordingUrl) {
          msgGather.say("New message.");
          safePlayRecording(msgGather, senderProfile.nameRecordingUrl, req, "");
          msgGather.say("has sent you a message.");
        } else {
          msgGather.say("You have a new message.");
        }
        safePlayRecording(msgGather, unreadMessage.recordingUrl, req, "Message audio is not available.");
        msgGather.say(
          "Press 1 to reply. " +
          "Press 2 to hear the sender's ad. " +
          "Press 3 to skip this message. " +
          "Press 9 to return to the mailbox menu."
        );
        twiml.redirect("/voice/my-mailbox");
      } else {
        // No unread messages — show mailbox management menu
        const mailboxLabel = mailbox
          ? `Mailbox number ${mailbox.mailboxNumber.split("").join(", ")}. `
          : "";
        const hasGreeting = !!mailbox?.adRecordingUrl;
        const gather = twiml.gather({
          numDigits: 1,
          finishOnKey: "",
          action: "/voice/handle-my-mailbox-options",
          timeout: 10,
        });
        gather.say(
          `${mailboxLabel}Your mailbox has no new messages. ` +
          (hasGreeting
            ? "Press 1 to re-record your mailbox greeting. Press 2 to hear your current greeting. "
            : "Press 1 to record your mailbox greeting. ") +
          "Press 9 to return to the mailbox menu."
        );
        twiml.redirect("/voice/mailbox-menu");
      }
    } catch (err) {
      console.error("[voice] /voice/my-mailbox error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the mailbox menu.");
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Handle My Mailbox Options (empty state menu) ────────────────────────
  app.post("/voice/handle-my-mailbox-options", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const fromNumber = req.body?.From as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);

      if (digit === "1") {
        twiml.redirect("/voice/record-mailbox-greeting");
      } else if (digit === "2") {
        if (mailbox?.adRecordingUrl) {
          safePlayRecording(twiml, mailbox.adRecordingUrl, req, "Your greeting is not available for playback.");
        } else {
          twiml.say("You have not recorded a mailbox greeting yet.");
        }
        twiml.redirect("/voice/my-mailbox");
      } else if (digit === "9") {
        twiml.redirect("/voice/mailbox-menu");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/my-mailbox");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-my-mailbox-options error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Record Mailbox Greeting (from within My Mailbox) ────────────────────
  app.post("/voice/record-mailbox-greeting", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);

      if (mailbox?.adRecordingUrl) {
        // Already has a greeting — offer to re-record or hear it
        const gather = twiml.gather({
          numDigits: 1,
          finishOnKey: "",
          action: "/voice/handle-record-mailbox-greeting",
          timeout: 10,
        });
        gather.say(
          "You already have a mailbox greeting recorded. " +
          "Press 1 to record a new greeting. " +
          "Press 2 to hear your current greeting. " +
          "Press 9 to return to your mailbox."
        );
        twiml.redirect("/voice/my-mailbox");
      } else {
        twiml.say("Record your mailbox greeting after the tone. Press pound when finished.");
        twiml.record({ maxLength: 90, playBeep: true, finishOnKey: "#", action: "/voice/save-mailbox-greeting" });
      }
    } catch (err) {
      console.error("[voice] /voice/record-mailbox-greeting error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Handle Record Mailbox Greeting Menu ─────────────────────────────────
  app.post("/voice/handle-record-mailbox-greeting", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const fromNumber = req.body?.From as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);

      if (digit === "1") {
        twiml.say("Record your mailbox greeting after the tone. Press pound when finished.");
        twiml.record({ maxLength: 90, playBeep: true, finishOnKey: "#", action: "/voice/save-mailbox-greeting" });
      } else if (digit === "2") {
        if (mailbox?.adRecordingUrl) {
          safePlayRecording(twiml, mailbox.adRecordingUrl, req, "Your greeting is not available for playback.");
        }
        twiml.redirect("/voice/record-mailbox-greeting");
      } else if (digit === "9") {
        twiml.redirect("/voice/my-mailbox");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/record-mailbox-greeting");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-record-mailbox-greeting error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Save Mailbox Greeting ────────────────────────────────────────────────
  app.post("/voice/save-mailbox-greeting", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From as string;
      const recordingUrl = req.body?.RecordingUrl as string;
      const recordingDuration = parseInt(req.body?.RecordingDuration) || 0;

      if (!recordingUrl || recordingDuration < 3) {
        playPrompt(twiml, req, "greeting_error.mp3", "That recording was too short. Please try again after the tone.");
        twiml.record({ maxLength: 90, playBeep: true, finishOnKey: "#", action: "/voice/save-mailbox-greeting" });
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);
      // Keep the existing category if set, otherwise use a default
      const category = mailbox?.category || "quick_hot_talk";
      await storage.updateMailboxAd(user.id, category, recordingUrl, recordingDuration);

      twiml.say("Your mailbox greeting has been saved. Callers who enter your mailbox number will now hear this greeting.");
      twiml.redirect("/voice/my-mailbox");
    } catch (err) {
      console.error("[voice] /voice/save-mailbox-greeting error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred saving your greeting. Returning to the mailbox menu.");
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Handle input after a mailbox message plays ───────────────────────────
  app.post("/voice/handle-mailbox-message", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const callSid = req.body?.CallSid as string;
      // Sync billing for the time spent listening to the mailbox message
      await syncBilling(callSid);

      const digit = req.body?.Digits as string;
      const msgId = req.query.msgId as string;
      const senderId = req.query.senderId as string;

      if (digit === "1") {
        await storage.markMessageRead(msgId);
        playPrompt(twiml, req, "record_reply.mp3", "Record your reply after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${senderId}&returnTo=mailbox` });
      } else if (digit === "2") {
        await storage.markMessageRead(msgId);
        const senderProfile = await storage.getProfile(senderId);
        const profileGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-mailbox-sender-menu?senderId=${senderId}`,
          timeout: 10,
        });
        if (senderProfile) {
          if (senderProfile.nameRecordingUrl) {
            safePlayRecording(profileGather, senderProfile.nameRecordingUrl, req, "");
          }
          safePlayRecording(profileGather, senderProfile.recordingUrl, req, "This caller's ad is not available.");
        } else {
          profileGather.say("This caller no longer has a mailbox ad.");
        }
        profileGather.say("Press 1 to send a message. Press 9 to return to your mailbox.");
        twiml.redirect("/voice/my-mailbox");
      } else if (digit === "3") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/my-mailbox");
      } else if (digit === "9") {
        twiml.redirect("/voice/mailbox-menu");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/my-mailbox");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-mailbox-message error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the mailbox menu.");
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Handle input after hearing sender's ad from the mailbox ─────────────
  app.post("/voice/handle-mailbox-sender-menu", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const digit = req.body?.Digits as string;
      const senderId = req.query.senderId as string;

      if (digit === "1") {
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${senderId}&returnTo=mailbox` });
      } else {
        twiml.redirect("/voice/my-mailbox");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-mailbox-sender-menu error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a4. Ad Category Menu (shared for listen & record modes) ────────────
  // mode query param: "listen" | "record"
  app.post("/voice/ad-category-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const mode = (req.query.mode as string) || "listen";
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: `/voice/handle-ad-category?mode=${mode}` });
    playPrompt(gather, req, "ad_category_menu.mp3",
      "Please select the category. " +
      "For Quick and Hot Talk press one. " +
      "For Bicurious press two. " +
      "For Kink press three. " +
      "For Total Top and Strictly Bottoms press four. " +
      "For Trans press five. " +
      "To look up a specific mailbox press six. " +
      "For definitions of these categories press eight. " +
      "To return to the mailbox menu press pound."
    );
    twiml.redirect(`/voice/ad-category-menu?mode=${mode}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-ad-category", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const mode = (req.query.mode as string) || "listen";
    const category = DIGIT_TO_CATEGORY[digit];

    if (category) {
      if (mode === "record") {
        twiml.redirect(`/voice/record-category-ad?category=${category}`);
      } else {
        twiml.redirect(`/voice/browse-category-ads?category=${category}`);
      }
    } else if (digit === "6") {
      twiml.redirect(`/voice/mailbox-lookup?mode=${mode}`);
    } else if (digit === "8") {
      twiml.redirect(`/voice/ad-category-definitions?mode=${mode}`);
    } else if (digit === "#") {
      twiml.redirect("/voice/mailbox-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect(`/voice/ad-category-menu?mode=${mode}`);
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a5. Browse Category Ads (listen mode) ───────────────────────────────
  app.post("/voice/browse-category-ads", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;
    const category = req.query.category as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const categoryLabel = MAILBOX_CATEGORIES[category] || category;

      // Build or reuse the queue for this call + category
      let state = categoryBrowseState.get(callSid);
      if (!state || state.category !== category) {
        const ads = await storage.getMailboxesByCategory(category, user.id);
        // Shuffle for variety
        for (let i = ads.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ads[i], ads[j]] = [ads[j], ads[i]];
        }
        state = {
          category,
          queue: ads.map(m => ({ userId: m.userId, mailboxNumber: m.mailboxNumber, adRecordingUrl: m.adRecordingUrl! })),
          index: 0,
        };
        categoryBrowseState.set(callSid, state);
        console.log(`[voice] browse-category-ads: category=${category}, ${state.queue.length} ads for callSid=${callSid}`);
      }

      if (state.queue.length === 0) {
        playPrompt(twiml, req, "no_ads_category.mp3",
          `No ads available in the ${categoryLabel} category yet. Try another category.`
        );
        twiml.redirect("/voice/ad-category-menu?mode=listen");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      if (state.index >= state.queue.length) {
        playPrompt(twiml, req, "ads_end_of_list.mp3",
          `You have heard all the ads in ${categoryLabel}. Returning to categories.`
        );
        categoryBrowseState.delete(callSid);
        twiml.redirect("/voice/ad-category-menu?mode=listen");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const ad = state.queue[state.index];
      state.index++;

      const adGather = twiml.gather({
        numDigits: 1,
        action: `/voice/handle-category-ad-menu?toUserId=${ad.userId}&mailboxNumber=${ad.mailboxNumber}&category=${category}`,
        timeout: 10,
      });
      adGather.say(`Mailbox ${ad.mailboxNumber.split("").join(", ")}.`);
      safePlayRecording(adGather, ad.adRecordingUrl, req, "This ad is not available.");
      adGather.say(
        "Press 1 to send a message to this guy. " +
        "Press 2 to hear the next ad. " +
        "Press 9 to return to the category menu. " +
        "Press pound to return to the mailbox menu."
      );
      twiml.redirect(`/voice/browse-category-ads?category=${category}`);
    } catch (err) {
      console.error("[voice] /voice/browse-category-ads error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the mailbox menu.");
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-category-ad-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const toUserId = req.query.toUserId as string;
    const mailboxNumber = req.query.mailboxNumber as string;
    const category = req.query.category as string;

    try {
      if (digit === "1") {
        playPrompt(twiml, req, "record_message.mp3", "Record your message for this guy after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${toUserId}&returnTo=category&category=${category}` });
      } else if (digit === "2") {
        twiml.redirect(`/voice/browse-category-ads?category=${category}`);
      } else if (digit === "9") {
        twiml.redirect("/voice/ad-category-menu?mode=listen");
      } else if (digit === "#") {
        twiml.redirect("/voice/mailbox-menu");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect(`/voice/browse-category-ads?category=${category}`);
      }
    } catch (err) {
      console.error("[voice] /voice/handle-category-ad-menu error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a6. Mailbox Lookup (look up a specific mailbox by number) ───────────
  app.post("/voice/mailbox-lookup", async (req, res) => {
    const twiml = new VoiceResponse();
    const mode = (req.query.mode as string) || "listen";
    const gather = twiml.gather({ numDigits: 5, action: `/voice/handle-mailbox-lookup?mode=${mode}`, timeout: 15 });
    playPrompt(gather, req, "mailbox_lookup.mp3",
      "Enter the five digit mailbox number you'd like to look up, followed by pound."
    );
    twiml.redirect(`/voice/ad-category-menu?mode=${mode}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-mailbox-lookup", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = req.body?.Digits as string;
    const mode = (req.query.mode as string) || "listen";

    try {
      if (!digits || digits.length !== 5) {
        playPrompt(twiml, req, "invalid_choice.mp3", "Please enter a five digit mailbox number.");
        twiml.redirect(`/voice/mailbox-lookup?mode=${mode}`);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const mailbox = await storage.getMailboxByNumber(digits);
      if (!mailbox) {
        playPrompt(twiml, req, "mailbox_not_found.mp3", `Mailbox ${digits.split("").join(", ")} was not found.`);
        twiml.redirect(`/voice/mailbox-lookup?mode=${mode}`);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      if (!mailbox.adRecordingUrl) {
        playPrompt(twiml, req, "mailbox_no_ad.mp3",
          `Mailbox ${digits.split("").join(", ")} has not recorded an ad yet.`
        );
        twiml.redirect(`/voice/ad-category-menu?mode=${mode}`);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const adGather = twiml.gather({
        numDigits: 1,
        action: `/voice/handle-mailbox-lookup-menu?toUserId=${mailbox.userId}&mailboxNumber=${digits}&mode=${mode}`,
        timeout: 10,
      });
      adGather.say(`Mailbox ${digits.split("").join(", ")}.`);
      safePlayRecording(adGather, mailbox.adRecordingUrl, req, "This ad is not available.");
      adGather.say(
        "Press 1 to send a message to this guy. " +
        "Press 9 to look up another mailbox. " +
        "Press pound to return to the mailbox menu."
      );
      twiml.redirect(`/voice/ad-category-menu?mode=${mode}`);
    } catch (err) {
      console.error("[voice] /voice/handle-mailbox-lookup error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred.");
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-mailbox-lookup-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const toUserId = req.query.toUserId as string;
    const mode = (req.query.mode as string) || "listen";

    try {
      if (digit === "1") {
        playPrompt(twiml, req, "record_message.mp3", "Record your message for this guy after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${toUserId}&returnTo=mailbox` });
      } else if (digit === "9") {
        twiml.redirect(`/voice/mailbox-lookup?mode=${mode}`);
      } else if (digit === "#") {
        twiml.redirect("/voice/mailbox-menu");
      } else {
        twiml.redirect(`/voice/ad-category-menu?mode=${mode}`);
      }
    } catch (err) {
      console.error("[voice] /voice/handle-mailbox-lookup-menu error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a7. Category Definitions ────────────────────────────────────────────
  app.post("/voice/ad-category-definitions", async (req, res) => {
    const twiml = new VoiceResponse();
    const mode = (req.query.mode as string) || "listen";
    playPrompt(twiml, req, "ad_category_definitions.mp3",
      "Quick and Hot Talk: guys looking for fast, explicit, no-strings chat. " +
      "Bicurious: men exploring attraction to other men for the first time or occasionally. " +
      "Kink: callers into fetishes, role play, or specific kinks. " +
      "Total Top and Strictly Bottoms: guys who define themselves by a specific role. " +
      "Trans: trans men and women connecting with other callers. " +
      "Returning to the category menu."
    );
    twiml.redirect(`/voice/ad-category-menu?mode=${mode}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a8. Record Category Ad ─────────────────────────────────────────────
  app.post("/voice/record-category-ad", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const category = req.query.category as string;
    const categoryLabel = MAILBOX_CATEGORIES[category] || category;

    try {
      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);

      if (mailbox?.adRecordingUrl && mailbox.category === category) {
        // Already has an ad in this category — offer to re-record or hear it
        const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: `/voice/handle-record-category-ad?category=${category}` });
        playPrompt(gather, req, "mailbox_ad_existing.mp3",
          `You already have an ad in the ${categoryLabel} category. ` +
          "Press 1 to record a new one. " +
          "Press 2 to hear your current ad. " +
          "Press 9 to return to the category menu."
        );
        twiml.redirect(`/voice/record-category-ad?category=${category}`);
      } else {
        playPrompt(twiml, req, "mailbox_ad_record.mp3",
          `Record your ${categoryLabel} mailbox ad after the tone. Tell guys about yourself. Press pound when finished.`
        );
        twiml.record({ maxLength: 60, playBeep: true, finishOnKey: "#", action: `/voice/save-category-ad?category=${category}` });
      }
    } catch (err) {
      console.error("[voice] /voice/record-category-ad error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the mailbox menu.");
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-record-category-ad", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const fromNumber = req.body?.From as string;
    const category = req.query.category as string;

    try {
      if (digit === "1") {
        playPrompt(twiml, req, "mailbox_ad_record.mp3",
          "Record your mailbox ad after the tone. Press pound when finished."
        );
        twiml.record({ maxLength: 60, playBeep: true, finishOnKey: "#", action: `/voice/save-category-ad?category=${category}` });
      } else if (digit === "2") {
        const user = await getOrCreateUser(fromNumber);
        const mailbox = await storage.getMailboxByUserId(user.id);
        if (mailbox?.adRecordingUrl) {
          safePlayRecording(twiml, mailbox.adRecordingUrl, req, "Your ad is not available for playback.");
        } else {
          playPrompt(twiml, req, "no_greeting_found.mp3", "No ad found.");
        }
        twiml.redirect(`/voice/record-category-ad?category=${category}`);
      } else if (digit === "9") {
        twiml.redirect("/voice/ad-category-menu?mode=record");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect(`/voice/record-category-ad?category=${category}`);
      }
    } catch (err) {
      console.error("[voice] /voice/handle-record-category-ad error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a9. Save Category Ad ────────────────────────────────────────────────
  app.post("/voice/save-category-ad", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From as string;
      const recordingUrl = req.body?.RecordingUrl as string;
      const recordingDuration = parseInt(req.body?.RecordingDuration) || 0;
      const category = req.query.category as string;
      const categoryLabel = MAILBOX_CATEGORIES[category] || category;

      if (!recordingUrl || recordingDuration < 3) {
        playPrompt(twiml, req, "greeting_error.mp3", "That recording was too short. Please try again after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, finishOnKey: "#", action: `/voice/save-category-ad?category=${category}` });
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const user = await getOrCreateUser(fromNumber);
      await storage.updateMailboxAd(user.id, category, recordingUrl, recordingDuration);

      playPrompt(twiml, req, "mailbox_ad_saved.mp3",
        `Your ${categoryLabel} mailbox ad has been saved. Other guys can now find your ad.`
      );
      twiml.redirect("/voice/mailbox-menu");
    } catch (err) {
      console.error("[voice] /voice/save-category-ad error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred saving your ad. Returning to the mailbox menu.");
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a3. Manage Membership ───────────────────────────────────────────────
  app.post("/voice/manage-membership", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const remainingSeconds = user.remainingSeconds ?? 0;
      const minutes = Math.floor(remainingSeconds / 60);
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      let timeMsg = "";
      if (hours > 0 && mins > 0) {
        timeMsg = `You have ${hours} hour${hours !== 1 ? "s" : ""} and ${mins} minute${mins !== 1 ? "s" : ""} remaining.`;
      } else if (hours > 0) {
        timeMsg = `You have ${hours} hour${hours !== 1 ? "s" : ""} remaining.`;
      } else {
        timeMsg = `You have ${minutes} minute${minutes !== 1 ? "s" : ""} remaining.`;
      }

      const tier = user.membershipTier ?? "none";
      const tierMsg = tier === "free_trial" ? "You are on a free trial." : tier !== "none" ? `Your membership type is ${tier}.` : "You do not have an active membership.";

      const pinStatus = user.membershipPin ? "You have a PIN set." : "You do not have a PIN set.";
      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-manage-membership" });
      gather.say(`${tierMsg} ${timeMsg} ${pinStatus} Press 1 to add time or purchase a new membership. Press 2 to set or change your access PIN. Press 9 to return to the main menu.`);
      twiml.redirect("/voice/manage-membership");
    } catch (error) {
      console.error("[voice] /voice/manage-membership error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-manage-membership", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "1") {
      twiml.redirect("/voice/purchase-pre-menu");
    } else if (digit === "2") {
      twiml.redirect("/voice/set-pin");
    } else if (digit === "9") {
      twiml.redirect("/voice/main-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/manage-membership");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Set / Change PIN ─────────────────────────────────────────────────────
  // Members calling from their registered phone can set or change their 4-digit PIN.
  app.post("/voice/set-pin", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      numDigits: 4,
      finishOnKey: "",
      action: "/voice/handle-set-pin",
      timeout: 10,
    });
    gather.say("Please enter your new 4-digit PIN.");
    twiml.redirect("/voice/manage-membership");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-set-pin", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const callSid = req.body?.CallSid as string;

    if (digits.length !== 4 || !/^\d{4}$/.test(digits)) {
      twiml.say("Invalid PIN. Please enter exactly 4 digits.");
      twiml.redirect("/voice/set-pin");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    pendingNewPinSetup.set(callSid, digits);
    const gather = twiml.gather({
      numDigits: 4,
      finishOnKey: "",
      action: "/voice/handle-confirm-pin",
      timeout: 10,
    });
    gather.say("Please enter your PIN again to confirm.");
    twiml.redirect("/voice/manage-membership");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-confirm-pin", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    const pendingPin = pendingNewPinSetup.get(callSid);
    pendingNewPinSetup.delete(callSid);

    if (!pendingPin) {
      twiml.redirect("/voice/manage-membership");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    if (digits !== pendingPin) {
      twiml.say("The PINs did not match. Please try again.");
      twiml.redirect("/voice/set-pin");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      const user = await storage.getUserByPhone(fromNumber);
      if (user) {
        await storage.updateUserMembership(user.id, { membershipPin: pendingPin });
        console.log(`[voice] PIN set for userId=${user.id} phone=${fromNumber}`);
        twiml.say("Your PIN has been set successfully. You can now use your membership number and PIN to call in from any phone.");
      } else {
        twiml.say("Could not find your account. Please try again.");
      }
    } catch (err) {
      console.error("[voice] PIN save error:", err);
      twiml.say("An error occurred saving your PIN. Please try again.");
    }

    twiml.redirect("/voice/manage-membership");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a4. Customer Service ────────────────────────────────────────────────
  app.post("/voice/customer-service", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-customer-service" });
    gather.say("Customer service. For billing or account questions, please visit our website or call us during business hours. Press 9 to return to the main menu.");
    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-customer-service", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "9") {
      twiml.redirect("/voice/main-menu");
    } else {
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

  // ─── 4c. Promo Code Entry ──────────────────────────────────────────────────
  app.post("/voice/promo-code", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 10, action: "/voice/handle-promo-code", finishOnKey: "#", timeout: 15 });
    gather.say("Enter your promotional code followed by the pound key. Press star to cancel.");
    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-promo-code", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const fromNumber = req.body?.From as string;

    if (!digits || digits === "*") {
      twiml.say("Cancelled.");
      twiml.redirect("/voice/main-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      const user = await getOrCreateUser(fromNumber);
      const result = await storage.redeemPromoCode(digits, user.id);
      if ("error" in result) {
        twiml.say(result.error + " Returning to the main menu.");
      } else {
        const minutes = Math.floor(result.secondsAwarded / 60);
        twiml.say(`Success! ${minutes} minute${minutes === 1 ? "" : "s"} have been added to your account. Enjoy your time on the line.`);
      }
    } catch (err) {
      console.error("[voice] handle-promo-code error:", err);
      twiml.say("An error occurred. Please try again later.");
    }

    twiml.redirect("/voice/main-menu");
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

    try {
      if (digit === "1") {
        // Play back the saved profile (already written to DB in save-profile)
        const user = await getOrCreateUser(fromNumber);
        const profile = await storage.getProfile(user.id);
        if (profile?.nameRecordingUrl) {
          safePlayRecording(twiml, profile.nameRecordingUrl, req, "");
        }
        if (profile?.recordingUrl) {
          safePlayRecording(twiml, profile.recordingUrl, req, "Your greeting is not available for playback right now.");
        } else {
          playPrompt(twiml, req, "no_greeting_found.mp3", "No recording found.");
        }
        twiml.redirect("/voice/review-greeting");
      } else if (digit === "2") {
        // Re-record from scratch — restart name step
        playPrompt(twiml, req, "welcome_record_name.mp3",
          "Say your first name only after the tone. You have 5 seconds."
        );
        twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      } else if (digit === "3") {
        // Accept — profile is already saved; confirm and continue
        playPrompt(twiml, req, "profile_saved.mp3", "Your greeting has been saved.");
        twiml.redirect("/voice/zip-code-prompt");
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

      // Start the billing checkpoint — use the membership override account if linked
      const billingPhone = callMembershipOverride.get(callSid) ?? fromNumber;
      startBilling(callSid, billingPhone);

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
        playPrompt(inviteGather, req, "live_invite_options.mp3", "To accept, press 1. To decline and hear the next caller's greeting, press 2. To hear this caller's greeting, press 3. To block this caller, press 4.");
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
        playPrompt(msgGather, req, "message_options.mp3", "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles. Press 4 to block this caller. Press 7 to flag this message for review. Press 9 to return to the main menu.");
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
            lastPlayedIndex: null,
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
              playPrompt(alertGather, req, "profile_options.mp3", "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu.");
              twiml.redirect("/voice/browse-profiles");
              res.type("text/xml");
              return res.send(twiml.toString());
            }
          }

          const profile = state.queue[state.index];
          const prevIndex = state.index;

          // Advance index, wrapping at end of queue — track first wrap
          state.lastPlayedIndex = prevIndex;
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
          playPrompt(profileGather, req, "profile_options.mp3", "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu.");
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
      } else if (digit === "4") {
        // ── Block the message sender ─────────────────────────────────────────
        const fromNumber = req.body?.From as string;
        const callSid = req.body?.CallSid as string;
        if (fromNumber && senderId) {
          const user = await getOrCreateUser(fromNumber);
          await storage.markMessageRead(msgId);
          await storage.blockUser(user.id, senderId);
          removeFromBrowseQueue(callSid, senderId);
          console.log(`[voice] handle-message-menu: userId=${user.id} blocked senderId=${senderId}`);
        }
        playPrompt(twiml, req, "caller_blocked.mp3", "Caller blocked. You will no longer hear this caller's profile.");
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "7") {
        // ── Flag this message for review ─────────────────────────────────────
        const fromNumber = req.body?.From as string;
        if (fromNumber && msgId) {
          const user = await getOrCreateUser(fromNumber);
          await storage.markMessageRead(msgId);
          await storage.createFlaggedItem({
            contentType: "message",
            contentId: msgId,
            reason: "Reported by caller via IVR",
            status: "pending",
            reportedByUserId: user.id,
          });
          console.log(`[voice] handle-message-menu: userId=${user.id} flagged msgId=${msgId}`);
        }
        playPrompt(twiml, req, "message_flagged.mp3", "This message has been flagged for review. Thank you.");
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
      } else if (digit === "4") {
        // ── Block this caller ───────────────────────────────────────────────
        const fromNumber = req.body?.From as string;
        const callSid = req.body?.CallSid as string;
        if (fromNumber && profileUserId) {
          const user = await getOrCreateUser(fromNumber);
          await storage.blockUser(user.id, profileUserId);
          removeFromBrowseQueue(callSid, profileUserId);
          console.log(`[voice] handle-profile-menu: userId=${user.id} blocked profileUserId=${profileUserId}`);
        }
        playPrompt(twiml, req, "caller_blocked.mp3", "Caller blocked. You will no longer hear this caller's profile.");
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "5") {
        // ── Play previous profile ───────────────────────────────────────────
        const callSid = req.body?.CallSid as string;
        const state = callerBrowseState.get(callSid);
        if (state && state.lastPlayedIndex !== null && state.lastPlayedIndex > 0) {
          state.index = state.lastPlayedIndex - 1;
          console.log(`[voice] handle-profile-menu: press 5 → rewinding to index ${state.index} for callSid=${callSid}`);
          twiml.redirect("/voice/browse-profiles");
        } else {
          playPrompt(twiml, req, "no_previous_profile.mp3", "There is no previous profile. Continuing to the next.");
          twiml.redirect("/voice/browse-profiles");
        }
      } else if (digit === "6") {
        // ── Hear this caller's location ─────────────────────────────────────
        if (profileUserId) {
          const targetUser = await storage.getUserById(profileUserId);
          const zipEntry = targetUser?.zipCodeId
            ? await storage.getZipEntryById(targetUser.zipCodeId)
            : null;

          // Prefer a live reverse-geocode from lat/lon; fall back to stored fields
          let location: string | null = null;
          if (zipEntry?.latitude != null && zipEntry?.longitude != null) {
            location = await reverseGeocodeNeighborhood(zipEntry.latitude, zipEntry.longitude);
          }
          if (!location) {
            location = zipEntry?.neighborhood || zipEntry?.city || null;
          }

          const locationGather = twiml.gather({
            numDigits: 1,
            action: `/voice/handle-location-menu?profileUserId=${profileUserId}`,
            timeout: 10,
          });
          if (location) {
            locationGather.say(`This caller is located in: ${location}. To send them a message, press 1.`);
          } else {
            locationGather.say("This caller's location is not available. To send them a message, press 1.");
          }
          twiml.redirect("/voice/browse-profiles");
        } else {
          twiml.redirect("/voice/browse-profiles");
        }
      } else if (digit === "7") {
        // ── Flag this profile for review ────────────────────────────────────
        const fromNumber = req.body?.From as string;
        if (fromNumber && profileUserId) {
          const user = await getOrCreateUser(fromNumber);
          await storage.createFlaggedItem({
            contentType: "profile",
            contentId: profileUserId,
            reason: "Reported by caller via IVR",
            status: "pending",
            reportedByUserId: user.id,
          });
          console.log(`[voice] handle-profile-menu: userId=${user.id} flagged profileUserId=${profileUserId}`);
        }
        playPrompt(twiml, req, "profile_flagged.mp3", "This profile has been flagged for review. Thank you.");
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

  // ─── 8a-pre. Location Menu (after Press 6 on profile menu) ──────────────
  app.post("/voice/handle-location-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;
    const profileUserId = req.query.profileUserId as string;

    try {
      if (digit === "1" && profileUserId) {
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${profileUserId}` });
      } else {
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[voice] /voice/handle-location-menu error:", error);
      twiml.redirect("/voice/browse-profiles");
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
          "To accept, press 1. To decline and hear the next caller's greeting, press 2. To hear this caller's greeting again, press 3. To block this caller, press 4.");
        twiml.redirect("/voice/browse-profiles");

      } else if (digit === "4") {
        // ── Block the invite initiator ───────────────────────────────────────
        invite.status = "declined";
        pendingLiveInvites.delete(user.id);
        await storage.blockUser(user.id, initiatorUserId);
        removeFromBrowseQueue(callSid, initiatorUserId);
        console.log(`[live-connect] handle-live-invite: userId=${user.id} blocked initiatorUserId=${initiatorUserId}`);
        playPrompt(twiml, req, "caller_blocked.mp3", "Caller blocked. You will no longer hear this caller's profile.");
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
      const callSid = req.body?.CallSid as string;
      const recordingUrl = req.body?.RecordingUrl;
      const toUserId = req.query.toUserId as string;

      if (!fromNumber || !recordingUrl || !toUserId) {
        throw new Error(`Missing fields: From=${fromNumber}, RecordingUrl=${recordingUrl}, toUserId=${toUserId}`);
      }

      const returnTo = req.query.returnTo as string;
      const category = req.query.category as string;
      const user = await getOrCreateUser(fromNumber);

      // Mailbox reply: billing is per-minute on the recording time.
      // syncBilling captures the time elapsed during the recording (reply to ad).
      if (returnTo === "mailbox" || returnTo === "category") {
        await syncBilling(callSid);
      }

      await storage.createMessage({ fromUserId: user.id, toUserId, recordingUrl });
      if (returnTo === "mailbox") {
        playPrompt(twiml, req, "message_sent.mp3", "Your message has been sent. Returning to your mailbox.");
        twiml.redirect("/voice/my-mailbox");
      } else if (returnTo === "category" && category) {
        playPrompt(twiml, req, "message_sent.mp3", "Your message has been sent. Returning to ads.");
        twiml.redirect(`/voice/browse-category-ads?category=${category}`);
      } else {
        playPrompt(twiml, req, "message_sent.mp3", "Your message has been sent. Returning to profiles.");
        twiml.redirect("/voice/browse-profiles");
      }
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
    // Digit may come from a Twilio gather (body) or from a redirect query string
    const digit = (req.body?.Digits ?? req.query?.Digits) as string;
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    // Press # to cancel
    if (digit === "#") {
      playPrompt(twiml, req, "package_cancelled.mp3", "Cancelled. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Press 9 to repeat the package menu
    if (digit === "9") {
      twiml.redirect("/voice/purchase-pre-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const packages = await getMembershipPackages();
    const pkg = packages[digit];
    if (!pkg) {
      playPrompt(twiml, req, "package_invalid.mp3", "Invalid selection.");
      twiml.redirect("/voice/purchase-pre-menu");
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
      packageMinutes: pkg.minutes,
      packagePriceCents: pkg.priceCents,
      priceLabel: pkg.priceLabel,
      isFirstPurchase,
    });

    // Route to confirmation step — caller must confirm before PIN / payment
    twiml.redirect("/voice/confirm-package");

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Confirm Package Selection ─────────────────────────────────────────────
  // Reads back the selected package and asks the caller to confirm.
  app.post("/voice/confirm-package", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const session = paymentSessions.get(callSid);

    if (!session) {
      playPrompt(twiml, req, "payment_session_expired.mp3", "Your session has expired. Please start again.");
      twiml.redirect("/voice/purchase-pre-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const mins = session.packageMinutes;
    const minutesLabel = session.isFirstPurchase
      ? `${mins} minutes — plus ${mins} bonus minutes for your first purchase, giving you ${mins * 2} minutes total`
      : `${mins} minutes`;

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-confirm-package" });
    gather.say(
      `You selected ${minutesLabel} for ${session.priceLabel}. ` +
      `If this is correct press 1. ` +
      `To select a different package press 2.`
    );
    twiml.redirect("/voice/confirm-package");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-confirm-package", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    if (digit === "1") {
      // Confirmed — go straight to payment disclaimer
      twiml.redirect("/voice/payment-intro");
    } else if (digit === "2") {
      // Go back and pick a different package
      paymentSessions.delete(callSid);
      twiml.redirect("/voice/purchase-pre-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/confirm-package");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Payment Intro ─────────────────────────────────────────────────────────
  // Plays the billing disclosure then asks caller to press 1 to begin card entry.
  app.post("/voice/payment-intro", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-payment-intro" });
    gather.say(
      "Your purchase, plus any applicable fees and taxes, will appear on your credit card statement as Toby Media. " +
      "If you're ready to enter your credit card information press 1."
    );
    twiml.redirect("/voice/payment-intro");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-payment-intro", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;

    if (digit === "1") {
      twiml.redirect("/voice/run-payment");
    } else {
      twiml.redirect("/voice/payment-intro");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Run Payment ───────────────────────────────────────────────────────────
  // Plays the payment intro and launches the Twilio <Pay> verb.
  app.post("/voice/run-payment", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;

    const session = paymentSessions.get(callSid);
    if (!session) {
      playPrompt(twiml, req, "payment_session_expired.mp3", "Your session has expired. Please start again.");
      twiml.redirect("/voice/purchase-pre-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const connectorName = process.env.TWILIO_PAY_CONNECTOR || "stripe";
    const chargeAmount = (session.packagePriceCents / 100).toFixed(2);

    twiml.pay({
      action: `${baseUrl(req)}/voice/handle-payment-complete`,
      chargeAmount,
      currency: "usd",
      description: `${session.packageLabel} Membership — VOICE PROTOCOL`,
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

        // Build the membership update — assign membership number on first purchase
        const membershipUpdate: Parameters<typeof storage.updateUserMembership>[1] = {
          membershipTier: session.packageName,
          remainingSeconds: totalSeconds,
        };
        let issuedCardNumber: string | null = null;
        if (!user.membershipNumber) {
          const membershipNumber = await generateUniqueCardNumber();
          membershipUpdate.membershipNumber = membershipNumber;
          issuedCardNumber = membershipNumber;
          // Create a card record and immediately link it to this phone
          const card = await storage.createMembershipCard(membershipNumber, 0, "Issued on purchase");
          await storage.linkCardToPhone(card.id, fromNumber);
          console.log(`[voice] Issued membership card ${membershipNumber} to ${fromNumber} on purchase`);
        }

        await storage.updateUserMembership(user.id, membershipUpdate);
        await storage.getOrCreateMailbox(user.id);

        const bonusMsg = bonusMinutes > 0
          ? ` Plus your first purchase bonus doubles your minutes — enjoy ${totalMinutes.toLocaleString()} minutes total!`
          : "";
        const cardMsg = issuedCardNumber
          ? ` Your new membership card number is: ${issuedCardNumber.split("").join(", ")}. Please save this number — you can use it to access your membership from any phone.`
          : "";
        const successText =
          `Payment successful! You now have ${session.packageLabel} access. ` +
          `Your card has been charged ${session.priceLabel}.${bonusMsg}${cardMsg} ` +
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

        // Post-Purchase MOTD
        try {
          const motdCfg = await getMembershipSettingsCached();
          if (motdCfg.motdPostPurchaseEnabled && motdCfg.motdPostPurchaseText) {
            playPrompt(twiml, req, "motd_post_purchase.mp3", motdCfg.motdPostPurchaseText);
          }
        } catch (err) {
          console.error("[voice] post-purchase motd error:", err);
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
      await storage.removeStaleActiveCalls(20);

      const user = await getOrCreateUser(fromNumber);

      // Remove any lingering active call rows for this user (e.g. status callback was missed)
      await storage.removeActiveCallsByUser(user.id);

      // Register call as active — scoped to this region
      await storage.registerActiveCall(callSid, user.id, region.id);
      storage.logCall(callSid, fromNumber, region.phoneNumber, region.id).catch(() => {});
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
