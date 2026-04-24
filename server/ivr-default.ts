import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import twilio from "twilio";
import path from "path";
import fs from "fs";
import { getVoiceIdForFolder } from "./elevenlabs";
import { lookupZipCode, reverseGeocodeNeighborhood } from "./zipLookup";
import { addVirtualCaller, removeVirtualCaller, getLiveVirtualUserIds, triggerSeedActivity } from "./simulator";
import { runFlagAutoChecks, runBlockAutoChecks, runTranscriptionAutoChecks, scheduleAutoModCheck } from "./autoModeration";
import { getMembershipSettingsCached, getSiteSettingsCached, getRawSiteSettingsCache } from "./settings-cache";
import * as engagementEngine from "./engagementEngine";
import type { MembershipSettings, MembershipCard } from "@shared/schema";
import { downloadRecording, twilioUrlToLocalPath, deleteLocalRecording } from "./downloadRecording";
import { transcribeLocalFile } from "./transcribeAudio";
import { locationToFilename, triggerLocationAudio, minutesToAnnouncementText, ROGER_PROMPTS } from "./audioAutogen";
import type { BrowseQueueItem, CallerBrowseState } from "./ivr-browse-state";
import { getBrowseState, setBrowseState, deleteBrowseState } from "./redis";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const VoiceResponse = twilio.twiml.VoiceResponse;

function describeIvrState(pathname: string): string {
  const path = pathname.toLowerCase();
  if (path === "/" || path === "/entry" || path.includes("entry-check")) return "Entering system";
  if (path.includes("gender-select")) return "Selecting caller type";
  if (path.includes("membership-card") || path.includes("membership-pin") || path.includes("membership-entry") || path.includes("membership-sign-in")) return "Entering membership credentials";
  if (path.includes("membership-purchase") || path.includes("purchase") || path.includes("payment") || path.includes("stripe")) return "Buying membership";
  if (path.includes("membership-center") || path.includes("manage-membership") || path.includes("set-pin")) return "Managing membership";
  if (path.includes("free-trial")) return "Hearing free trial offer";
  if (path.includes("closest-callers-info")) return "Learning closest caller matching";
  if (path.includes("phone-booth") || path.includes("greeting-setup") || path.includes("save-name") || path.includes("save-profile")) return "Recording profile greeting";
  if (path.includes("recording-rejected")) return "Fixing rejected recording";
  if (path.includes("main-menu") || path.includes("mw-main-menu")) return "At main menu";
  if (path.includes("browse-profiles") || path.includes("browse-category-ads") || path.includes("nearby-callers") || path.includes("category-ad-menu")) return "Browsing callers";
  if (path.includes("engagement-interrupt") || path.includes("roger")) return "Listening to Roger prompt";
  if (path.includes("voicemail-inbox") || path.includes("voicemail-saved")) return "Listening to voicemail";
  if (path.includes("voicemail") || path.includes("message")) return "Using voicemail";
  if (path.includes("mailbox-lookup")) return "Looking up mailbox";
  if (path.includes("mailbox-message") || path.includes("sender-menu")) return "Leaving mailbox message";
  if (path.includes("record-mailbox") || path.includes("record-category-ad") || path.includes("save-mailbox") || path.includes("save-category-ad")) return "Recording personal ad";
  if (path.includes("setup-mailbox")) return "Setting up mailbox";
  if (path.includes("my-mailbox") || path.includes("mailbox-menu") || path.includes("ad-category") || path.includes("category")) return "Using mailbox";
  if (path.includes("live-connect")) return "Live connect";
  if (path.includes("promo-code")) return "Entering promo code";
  if (path.includes("customer-service") || path.includes("cs-")) return "Customer service";
  if (path.includes("time-warning")) return "Low balance warning";
  if (path.includes("transcription-callback")) return "Processing transcription";
  return pathname.replace(/^\//, "").replace(/-/g, " ") || "In call";
}

function getRequestCallSid(req: Request): string | null {
  const raw = req.body?.CallSid ?? req.query?.CallSid ?? req.body?.callSid ?? req.query?.callSid;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}


function centsToLabel(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remaining = cents % 100;
  if (remaining === 0) return `${dollars} dollar${dollars !== 1 ? "s" : ""}`;
  return `${dollars} dollar${dollars !== 1 ? "s" : ""} and ${remaining} cent${remaining !== 1 ? "s" : ""}`;
}

function minutesToDurationLabel(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

type MembershipPackage = { name: string; displayName: string; label: string; minutes: number; priceCents: number; priceLabel: string };

async function getMembershipPackages(): Promise<Record<string, MembershipPackage>> {
  const s = await getMembershipSettingsCached();
  return {
    "2": { name: "plan1", displayName: s.plan1Name, label: minutesToDurationLabel(s.plan1Minutes), minutes: s.plan1Minutes, priceCents: s.plan1PriceCents, priceLabel: centsToLabel(s.plan1PriceCents) },
    "3": { name: "plan2", displayName: s.plan2Name, label: minutesToDurationLabel(s.plan2Minutes), minutes: s.plan2Minutes, priceCents: s.plan2PriceCents, priceLabel: centsToLabel(s.plan2PriceCents) },
    "4": { name: "plan3", displayName: s.plan3Name, label: minutesToDurationLabel(s.plan3Minutes), minutes: s.plan3Minutes, priceCents: s.plan3PriceCents, priceLabel: centsToLabel(s.plan3PriceCents) },
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

// Play the time-remaining announcement.
// Uses a single composite audio file (time_remaining_N.mp3) for natural, seamless playback.
// Falls back to TTS of the full sentence when the file hasn't been generated yet.
// Stitched phrase-file fallback is kept below for reference but is no longer the primary path.
function playTimeRemaining(
  twiml: { say: (text: string) => void; play: (url: string) => void },
  req: Request,
  totalMinutes: number
): void {
  const compositeFilename = `time_remaining_${totalMinutes}.mp3`;
  const fullSentence = minutesToAnnouncementText(totalMinutes);
  // playPrompt checks the category folder (mm/mw/mw_m) for the composite file.
  // If not found yet, the TTS fallback speaks the full sentence in one natural utterance.
  playPrompt(twiml, req, compositeFilename, fullSentence);
}

// Play the 24-hour pass expiry announcement using pre-recorded hourly audio files.
// Files are named backdoor_expires_22hr.mp3, backdoor_expires_1hr.mp3, etc.
// When less than 1 hour remains, switches to a minutes announcement.
// Falls back to TTS if the specific file hasn't been uploaded yet.
function playBackdoorHoursRemaining(
  twiml: { say: (text: string) => void; play: (url: string) => void },
  req: Request,
  hoursLeft: number  // raw (non-floored) hours remaining
): void {
  if (hoursLeft < 1) {
    // Less than 1 hour — announce in minutes instead
    const minutesLeft = Math.max(Math.ceil(hoursLeft * 60), 1);
    playPrompt(twiml, req, "backdoor_expires_soon.mp3",
      `Your backdoor access pass expires in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`);
  } else {
    const safeHours = Math.min(Math.floor(hoursLeft), 24);
    playPrompt(twiml, req, `backdoor_expires_${safeHours}hr.mp3`,
      `Your backdoor access pass expires in ${safeHours} hour${safeHours === 1 ? "" : "s"}.`);
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
  packageDisplayName: string;
  packageLabel: string;
  packageMinutes: number;
  packagePriceCents: number;
  priceLabel: string;
  isFirstPurchase?: boolean;
}
const paymentSessions = new Map<string, PaymentSession>();

// Results from completed payment sessions — consumed by /voice/payment-done
interface PaymentResult {
  success: boolean;
  packageLabel?: string;
  priceLabel?: string;
  totalMinutes?: number;
  bonusMinutes?: number;
  errorCode?: string;
}
const pendingPaymentResults = new Map<string, PaymentResult>();

// Temporary store for the name recording URL between the save-name and save-profile steps
const pendingNameRecordings = new Map<string, string>(); // CallSid → nameRecordingUrl

// Draft greeting recordings held in memory until the caller accepts them in REVIEW_GREETING
interface GreetingDraft {
  nameRecordingUrl?: string;
  greetingRecordingUrl: string;
  greetingDuration: number;
}
const pendingGreetingDrafts = new Map<string, GreetingDraft>(); // CallSid → draft

// Haversine great-circle distance between two lat/lon points, result in miles.
function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// BrowseQueueItem and CallerBrowseState are imported from ./ivr-browse-state

// Probability (0–1) that a newly-detected caller triggers an audible announcement.
// When the roll fails the caller is still silently queued so they are eventually heard,
// but no "new caller closest to you" / "new caller from [city]" interrupt fires.
// Keeping this below 1.0 prevents the prompt from feeling routine.
const NEW_CALLER_ANNOUNCE_PROBABILITY = 0.1;

// ─── Mailbox Category Browse State ─────────────────────────────────────────
interface CategoryBrowseState {
  category: string;
  queue: { userId: string; mailboxNumber: string; adRecordingUrl: string }[];
  index: number;
}
const categoryBrowseState = new Map<string, CategoryBrowseState>();
// callerProfileBrowseStates replaced by Redis-backed getBrowseState/setBrowseState/deleteBrowseState

// Feature flag — set ENABLE_MAILBOX=false in .env to hide mailboxes & personal ads from the IVR
const MAILBOX_ENABLED = process.env.ENABLE_MAILBOX !== "false";

// Category slug → human label map
const MAILBOX_CATEGORIES: Record<string, string> = {
  quick_hot_talk: "Quick and Hot Talk",
  bicurious: "Bicurious",
  kink: "Kink",
  total_tops: "Total Tops",
  strictly_bottoms: "Strictly Bottoms",
  trans: "Trans",
  cock_suckers: "Cock Suckers",
  hung_cocks: "Hung Cocks",
  uncut_cocks: "Uncut Cocks",
  twinks: "Twinks",
  bears: "Bears",
  daddys: "Daddys",
};

// Digit → category slug (page 1 and page 2)
const DIGIT_TO_CATEGORY_PAGE1: Record<string, string> = {
  "1": "quick_hot_talk",
  "2": "bicurious",
  "3": "kink",
  "4": "total_tops",
  "5": "strictly_bottoms",
  "6": "trans",
};
const DIGIT_TO_CATEGORY_PAGE2: Record<string, string> = {
  "1": "cock_suckers",
  "2": "hung_cocks",
  "3": "uncut_cocks",
  "4": "twinks",
  "5": "bears",
  "6": "daddys",
};
// Legacy alias so any existing code referencing DIGIT_TO_CATEGORY keeps working
const DIGIT_TO_CATEGORY: Record<string, string> = { ...DIGIT_TO_CATEGORY_PAGE1 };

// ─── Live 1-on-1 Connect State ─────────────────────────────────────────────
// Invite stored by targetUserId so the invitee can find it when they next browse
interface LiveConnectInvite {
  initiatorCallSid: string;
  initiatorUserId: string;
  initiatorNameRecordingUrl?: string | null;
  initiatorGreetingUrl: string;
  inviteMessageUrl?: string | null;   // brief recorded message Caller A records at invite time
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

// How long (ms) an invite stays valid.
// Covers: recording prompt (~5s) + 30s max recording + "Calling now" (~3s) + up to 60s ringing + buffer
const LIVE_INVITE_TTL_MS = 105_000;

// Per-call flags — track whether time announcements have been made this session
const callTimeAnnounced = new Set<string>(); // already heard the "you have X hours/minutes" announcement
const callWarningShown  = new Set<string>(); // already heard the < 15-minute warning

// Billing checkpoint: tracks the last sync time so elapsed seconds are deducted
// incrementally during IVR navigation (syncBilling), not only at call end.
// Billing is second-accurate — callers hear their balance in minutes (rounded down).
interface BillingCheckpoint { lastCheck: number; fromNumber: string; }
const billingCheckpoints = new Map<string, BillingCheckpoint>(); // CallSid → checkpoint

// Membership lookup override: when a caller enters a membership number from a different
// phone, this maps callSid → the membership holder's phone number for billing purposes.
const callMembershipOverride = new Map<string, string>(); // callSid → membership holder phone

// MW gender selection — tracks female callers so they can bypass membership checks and
// go directly to the male box. Women are always free on MW systems.
const femaleCallers = new Set<string>(); // CallSids identified as female

// Temporary store for a membership number mid-entry (between the 10-digit gather and account lookup)
const pendingMembershipEntries = new Map<string, string>(); // callSid → membership number

// Pending PIN authentication: caller entered a valid membership number from a different phone,
// awaiting 4-digit PIN to confirm identity.
const pendingPinAuth = new Map<string, string>(); // callSid → membership holder phone number

// Pending card PIN entry: caller entered a valid 5-digit card number and is awaiting PIN verification.
const pendingCardFirstUse = new Map<string, string>(); // callSid → card number

// Calling card override: tracks which card a caller is using for the duration of the call.
// Billing deducts directly from the card's value_seconds.
const callCardOverride = new Map<string, string>(); // callSid → cardId

// Pending new PIN setup: the caller is confirming a newly entered PIN
const pendingNewPinSetup = new Map<string, string>(); // callSid → first PIN entry (4 digits)

// Mailbox setup state — tracks multi-step setup progress per call
const mailboxSetupState = new Map<string, {
  dob?: string;
  bodyType?: string;
  ethnicity?: string;
  returnTo?: string; // "mailbox" | "record" | "listen"
  passcode1?: string;
}>();

// Body type labels for mailbox setup
const BODY_TYPE_LABELS: Record<string, string> = {
  slim: "Slim",
  average: "Average",
  athletic: "Athletic",
  large: "Large",
  big_and_tall: "Big and Tall",
};

// Ethnicity labels for mailbox setup
const ETHNICITY_LABELS: Record<string, string> = {
  prefer_not_to_say: "prefer not to identify",
  caucasian: "Caucasian",
  african_american: "African-American",
  asian: "Asian",
  latino: "Latino",
  middle_eastern: "Middle Eastern",
  aboriginal: "Aboriginal",
};

// Generate a unique random 5-digit membership card number.
// Rule: first digit is never 0 — range is 10000–99999.
async function generateUniqueCardNumber(): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const num = String(Math.floor(10000 + Math.random() * 90000)); // 10000–99999
    const taken = await storage.isMembershipCardNumberTaken(num);
    if (!taken) return num;
  }
  throw new Error("Unable to generate a unique membership card number after 100 attempts");
}

// Generate a random 4-digit PIN.
// Rule: first digit is never 0 — range is 1000–9999.
function generateCardPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000)); // 1000–9999
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
//
// Audio path lookup order:
//   MM systems:             uploads/mm/<file>    →  uploads/<file>  →  TTS (male voice, Twilio default)
//   MW systems (male):      uploads/mw/<file>    →  TTS (female voice, Polly.Joanna)
//   MW systems (female):    uploads/mw_m/<file>  →  uploads/mw/<file>  →  TTS (male voice, Polly.Matthew)
//              ↳ MW intentionally skips the shared uploads/ root so MM audio never bleeds in.
//              ↳ Female callers on MW use uploads/mw_m/ (male-voiced prompts), with uploads/mw/ as fallback.
//
// The admin Audio Manager exposes separate Shared / MM / MW / MW_M folders to match this logic.
function playPrompt(
  node: { say: (...args: any[]) => any; play: (url: string) => void },
  req: Request,
  filename: string,
  fallbackText: string
): void {
  const category = getRawSiteSettingsCache()?.siteCategory?.toLowerCase();
  const callSid = (req.body?.CallSid ?? req.query?.CallSid ?? "") as string;

  // For MW systems, female callers use the mw_m (male-voiced) folder.
  const isMWFemale = category === "mw" && femaleCallers.has(callSid);

  if (category) {
    // MW female → try mw_m first, then mw as fallback
    if (isMWFemale) {
      const mwmPath = path.join(UPLOADS_DIR, "mw_m", filename);
      if (fs.existsSync(mwmPath)) {
        node.play(`${baseUrl(req)}/uploads/mw_m/${filename}`);
        return;
      }
      // Fallback to mw/ folder (covers files not yet generated in mw_m)
      const mwPath = path.join(UPLOADS_DIR, "mw", filename);
      if (fs.existsSync(mwPath)) {
        node.play(`${baseUrl(req)}/uploads/mw/${filename}`);
        return;
      }
    } else {
      // MM or MW male → use the category folder directly
      const catPath = path.join(UPLOADS_DIR, category, filename);
      if (fs.existsSync(catPath)) {
        node.play(`${baseUrl(req)}/uploads/${category}/${filename}`);
        return;
      }
    }
  } else {
    // Cache not yet populated — scan all known category folders so audio files
    // are never silently skipped just because the cache hasn't been primed.
    for (const cat of ["mm", "mw", "mw_m"]) {
      const catPath = path.join(UPLOADS_DIR, cat, filename);
      if (fs.existsSync(catPath)) {
        node.play(`${baseUrl(req)}/uploads/${cat}/${filename}`);
        return;
      }
    }
  }

  // MW systems use a separate audio path — do not fall back to the shared uploads/ root.
  // Female callers fall back to Polly.Matthew (male voice); male callers to Polly.Joanna (female voice).
  if (category === "mw") {
    if (fallbackText) {
      if (isMWFemale) {
        node.say({ voice: "Polly.Matthew" }, fallbackText);
      } else {
        node.say({ voice: "Polly.Joanna" }, fallbackText);
      }
    }
    return;
  }

  // MM / unset — fall back to shared uploads/ root, then TTS with the default voice.
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
  recordingUrl: string | null | undefined,
  req: Request,
  fallbackText = ""
): void {
  if (!recordingUrl) {
    if (fallbackText) node.say(fallbackText);
    console.warn("[audio] safePlayRecording called with empty URL — skipping");
    return;
  }
  const isLocal = recordingUrl.startsWith("/uploads/");
  if (isLocal) {
    // Verify the local file exists before pointing Twilio at it.
    // A missing file causes Express to return a 404 HTML page which Twilio
    // plays as a brief static blip — far worse than a TTS fallback.
    const diskPath = path.join(process.cwd(), recordingUrl);
    if (!fs.existsSync(diskPath)) {
      if (fallbackText) node.say(fallbackText);
      console.warn(`[audio] Local file not found, using fallback: ${recordingUrl}`);
      return;
    }
    node.play(audioProxyUrl(recordingUrl, req));
  } else if (hasTwilioCredentials()) {
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

export async function registerVoiceRoutes(app: Express): Promise<void> {
  // Log all voice webhook requests
  app.use("/voice", (req: Request, _res: Response, next: NextFunction) => {
    console.log(`[voice] ${req.method} ${req.path} | From=${req.body?.From} CallSid=${req.body?.CallSid} Digits=${req.body?.Digits} CallStatus=${req.body?.CallStatus}`);
    const callSid = getRequestCallSid(req);
    if (callSid && req.path !== "/status") {
      storage.updateCallerIvrState(callSid, describeIvrState(req.path), `/voice${req.path === "/" ? "" : req.path}`)
        .catch(err => console.error("[voice] IVR state update failed:", err.message));
    }
    next();
  });

  // ─── Global key interceptor ────────────────────────────────────────────────
  // * → Membership Center  (from any single-digit menu)
  // # → Main Menu          (from any single-digit menu)
  // 0 → Announce time remaining, then return to the same menu
  // Skipped for routes that collect multi-digit input where these keys are not
  // used as standalone navigation keys.
  const GLOBAL_KEY_SKIP_ROUTES = new Set([
    "/handle-membership-entry",
    "/handle-membership-pin-entry",
    "/handle-membership-card-pin-entry",
    "/handle-set-pin",
    "/handle-confirm-pin",
    "/handle-promo-code",
    "/handle-zip-code",
    "/handle-setup-mailbox-dob",
    "/handle-setup-mailbox-create-passcode",
    "/handle-setup-mailbox-confirm-passcode",
    "/handle-mailbox-lookup",
    "/handle-membership-center",
  ]);

  // Press-0 menu handlers whose "menu URL" cannot be derived by simply stripping "handle-"
  // from the path. Each value is the full path to redirect back to after announcing time.
  const PRESS_ZERO_RETURN_OVERRIDES: Record<string, string> = {
    "/handle-mailbox-message": "/voice/my-mailbox",
    "/handle-mailbox-sender-menu": "/voice/my-mailbox",
    "/handle-mailbox-lookup-menu": "/voice/my-mailbox",
    "/handle-my-mailbox-options": "/voice/my-mailbox",
    "/handle-ad-category": "/voice/ad-category-menu",
    "/handle-category-ad-menu": "/voice/browse-category-ads",
    "/handle-nearby-callers": "/voice/nearby-callers-offer",
    "/handle-membership-gateway": "/voice/membership-entry",
    "/handle-message-menu": "/voice/browse-profiles",
    "/handle-profile-menu": "/voice/browse-profiles",
    "/handle-setup-mailbox-passcode-existing": "/voice/setup-mailbox-reveal",
  };

  app.use("/voice", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST" && req.path.startsWith("/handle-") && !GLOBAL_KEY_SKIP_ROUTES.has(req.path)) {
      const digit = req.body?.Digits as string;
      if (digit === "*") {
        const twiml = new VoiceResponse();
        twiml.redirect("/voice/membership-center");
        res.type("text/xml");
        return res.send(twiml.toString());
      }
      if (digit === "#") {
        const twiml = new VoiceResponse();
        twiml.redirect("/voice/main-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }
    }
    next();
  });

  // Press 0 from any single-digit menu → announce time remaining, then return.
  // Runs as a separate async middleware so we can look up the caller's user record.
  app.use("/voice", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.method !== "POST" || !req.path.startsWith("/handle-") || GLOBAL_KEY_SKIP_ROUTES.has(req.path)) {
        return next();
      }
      const digit = req.body?.Digits as string;
      if (digit !== "0") return next();

      const fromNumber = req.body?.From as string | undefined;
      let totalMinutes = 0;
      if (fromNumber) {
        try {
          const user = await getOrCreateUser(fromNumber);
          totalMinutes = Math.max(0, Math.floor((user.remainingSeconds ?? 0) / 60));
        } catch (err: any) {
          console.warn(`[press-0] User lookup failed for From=${fromNumber}: ${err?.message ?? err}`);
        }
      }

      // Determine return URL — prefer override, fall back to "strip handle-" pattern.
      let returnUrl = PRESS_ZERO_RETURN_OVERRIDES[req.path];
      if (!returnUrl) {
        const stripped = req.path.replace(/^\/handle-/, "/");
        returnUrl = `/voice${stripped}`;
      }
      // Preserve any original query string (e.g. ?returnTo=, ?mode=, ?page=).
      const queryStr = req.originalUrl.includes("?")
        ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
        : "";
      if (queryStr && !returnUrl.includes("?")) {
        returnUrl += queryStr;
      }

      console.log(`[press-0] From=${fromNumber} path=${req.path} → announcing ${totalMinutes} min, returning to ${returnUrl}`);

      const twiml = new VoiceResponse();
      playTimeRemaining(twiml, req, totalMinutes);
      twiml.redirect(returnUrl);
      res.type("text/xml");
      return res.send(twiml.toString());
    } catch (err: any) {
      console.error(`[press-0] middleware error: ${err?.message ?? err}`);
      return next();
    }
  });

  // --- Twilio Voice Webhooks ---

  async function getOrCreateUser(phoneNumber: string) {
    // Check if this number is an alternate number linked to a primary membership
    const primaryPhone = await storage.getPrimaryPhoneForAltNumber(phoneNumber);
    const effectivePhone = primaryPhone ?? phoneNumber;

    let user = await storage.getUserByPhone(effectivePhone);
    if (!user) {
      try {
        user = await storage.createUser({ phoneNumber: effectivePhone });
      } catch (err: any) {
        if (err?.code !== "23505") throw err;
        user = await storage.getUserByPhone(effectivePhone);
        if (!user) throw err;
      }
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

  // Returns true if free mode is currently active — either the manual "always on" flag is set,
  // or today's day-of-week (0=Sun … 6=Sat) is in the operator's scheduled days list.
  function isFreeModeActive(settings: { freeMode: boolean; freeModeScheduleDays: number[] | null }): boolean {
    if (settings.freeMode) return true;
    const today = new Date().getDay();
    return (settings.freeModeScheduleDays ?? []).includes(today);
  }

  // Deducts elapsed seconds since the last checkpoint directly from the account balance.
  // Billing is second-accurate: the caller sees their balance in minutes (rounded down),
  // but the backend drains the exact seconds used on every sync.
  // When a membership override is active, deducts from the membership holder's account.
  // In per_day mode no call-time deductions are made — billing is handled nightly.
  async function syncBilling(callSid: string): Promise<void> {
    const settings = await getMembershipSettingsCached();
    if (settings.billingMode === "per_day" || settings.billingMode === "per_24h" || isFreeModeActive(settings)) return;
    const checkpoint = billingCheckpoints.get(callSid);
    if (!checkpoint) return;
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - checkpoint.lastCheck) / 1000);
    if (elapsedSeconds <= 0) return;
    checkpoint.lastCheck = now;

    try {
      const cardId = callCardOverride.get(callSid);
      if (cardId) {
        await storage.deductCardSeconds(cardId, elapsedSeconds);
        console.log(`[billing] syncBilling: deducted ${elapsedSeconds}s from cardId=${cardId}`);
      } else {
        const overridePhone = callMembershipOverride.get(callSid);
        const billingPhone = overridePhone ?? checkpoint.fromNumber;
        const user = await storage.getOrCreateUser(billingPhone);
        await storage.deductSeconds(user.id, elapsedSeconds);
        console.log(`[billing] syncBilling: deducted ${elapsedSeconds}s from userId=${user.id}${overridePhone ? " (membership override)" : ""}`);
      }
    } catch (err) {
      console.error("[billing] syncBilling error:", err);
    }
  }

  // Runs a final billing sync to capture any remaining elapsed seconds, then clears
  // the checkpoint. No rounding up — callers are charged only for exact seconds used.
  // In per_day mode, clears the checkpoint without any deduction.
  async function finalizeCallBilling(callSid: string): Promise<void> {
    const { billingMode } = await getMembershipSettingsCached();
    if (billingMode === "per_day" || billingMode === "per_24h") {
      billingCheckpoints.delete(callSid);
      return;
    }
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
        // In per_day, per_24h, or free mode, calls are free — read balance without deducting.
        const liveSettings = await getMembershipSettingsCached();
        let initiatorUser: Awaited<ReturnType<typeof storage.deductSeconds>>;
        let inviteeUser: Awaited<ReturnType<typeof storage.deductSeconds>>;
        if (liveSettings.billingMode === "per_day" || liveSettings.billingMode === "per_24h" || isFreeModeActive(liveSettings)) {
          const [iu, vv] = await Promise.all([
            storage.getUserById(s.initiatorUserId),
            storage.getUserById(s.inviteeUserId),
          ]);
          if (!iu || !vv) return;
          initiatorUser = iu as typeof initiatorUser;
          inviteeUser = vv as typeof inviteeUser;
        } else {
          [initiatorUser, inviteeUser] = await Promise.all([
            storage.deductSeconds(s.initiatorUserId, tickSeconds),
            storage.deductSeconds(s.inviteeUserId, tickSeconds),
          ]);
        }

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

      // Finalize call log with Twilio-reported duration (must complete before removeActiveCall)
      const callDuration = parseInt(req.body?.CallDuration ?? "0", 10);
      if (!isNaN(callDuration)) {
        await storage.finalizeCallLog(callSid, callDuration).catch(() => {});
      }

      try {
        await storage.removeActiveCall(callSid);
        console.log(`[status] Removed ${callSid} from active calls`);
      } catch (err) {
        console.error(`[status] Error removing active call ${callSid}:`, err);
      }
      // Clean up per-call payment/session, name recording, greeting draft, time flags, membership override, gender selection, and engagement state
      engagementEngine.cleanupEngagementState(callSid);
      categoryBrowseState.delete(callSid);
      await deleteBrowseState(callSid);
      paymentSessions.delete(callSid);
      pendingNameRecordings.delete(callSid);
      pendingGreetingDrafts.delete(callSid);
      callTimeAnnounced.delete(callSid);
      callWarningShown.delete(callSid);
      callMembershipOverride.delete(callSid);
      callCardOverride.delete(callSid);
      pendingMembershipEntries.delete(callSid);
      pendingPinAuth.delete(callSid);
      pendingNewPinSetup.delete(callSid);
      pendingCardFirstUse.delete(callSid);
      femaleCallers.delete(callSid);

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
    const fromNumber = req.body?.From as string | undefined;
    const callSid    = req.body?.CallSid as string | undefined;
    const calledTo   = req.body?.To as string | null ?? null;

    if (!fromNumber || !callSid) {
      playPrompt(twiml, req, "no_caller_id.mp3", "We could not identify your call. Goodbye.");
      twiml.hangup();
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      await getSiteSettingsCached();
      storage.removeStaleActiveCalls(20).catch(() => {});
      storage.logCall(callSid, fromNumber, calledTo, null).catch(() => {});
      registerStatusCallback(callSid, req).catch(() => {});

      const user = await getOrCreateUser(fromNumber);
      await storage.removeActiveCallsByUser(user.id);
      await storage.registerActiveCall(callSid, user.id);
      const caller = await storage.getCallerByCallSid(callSid);
      console.log(`[voice] registered caller ${callSid} from ${fromNumber}`);

      if (!caller?.greetingPlayed) {
        playPrompt(twiml, req, "system_greeting.mp3",
          "Welcome to the Male Box. This service is for guys looking to connect with other local guys. No filters, no pressure — just real guys looking to connect.");
        playPrompt(twiml, req, "disclaimer.mp3",
          "The Male Box is for callers 18 and over. If that's not you, hang up now. We do not check out callers to this line, so please use common sense and caution before giving out your address or phone number.");
        await storage.markCallerGreetingPlayed(callSid);
      }
      twiml.redirect("/voice/entry");
    } catch (err) {
      console.error(`[voice] caller registration failed ${callSid}:`, err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b. Shared Entry Flow ────────────────────────────────────────────────
  // Reached from both /voice and /voice/:slug after the call is registered.
  // system_greeting + disclaimer have already played in /voice or /voice/:slug.
  // This route handles membership/account state and plays the Roger greeting.
  app.post("/voice/entry", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      // Load site settings so the raw cache is populated before any playPrompt call.
      // playPrompt uses getRawSiteSettingsCache() synchronously to pick the right audio folder.
      const entrySiteConf = await getSiteSettingsCached();

      // Play Announcement / MOTD if enabled
      const motdCfg = await getMembershipSettingsCached();
      if (motdCfg.motdEnabled && motdCfg.motdText) {
        playPrompt(twiml, req, "motd.mp3", motdCfg.motdText);
      }

      // MW systems prompt for gender before membership — women are always free.
      // MM systems: inline the full entry-check gates + Roger greeting here so
      // Roger plays in the same TwiML response as the disclaimer — zero wait.
      // Exception: free mode skips all gates and goes directly to phone-booth.
      if (entrySiteConf.siteCategory === "MW") {
        twiml.redirect("/voice/gender-select");
      } else if (isFreeModeActive(motdCfg)) {
        playPrompt(twiml, req, "free_mode_announcement.mp3",
          "Great news! All calls are completely free right now. No membership required. Enjoy unlimited time on the system. Connecting you now.");
        twiml.redirect("/voice/phone-booth");
      } else {
        // ── Inline entry-check (eliminates one Twilio round-trip) ───────────
        // Wrapped in its own try/catch: any DB/runtime error here falls back
        // to redirecting entry-check (old behaviour), never "An error occurred".
        const entryFrom = req.body?.From as string;
        const entrySid  = req.body?.CallSid as string;
        let inlineHandled = false;
        if (entryFrom && entrySid) {
          try {
            const entryUser = await getOrCreateUser(entryFrom);

            if (entryUser.accountStatus === "banned") {
              playPrompt(twiml, req, "caller_banned.mp3",
                "We're sorry, your access to this service has been suspended. If you believe this is an error, please contact customer support. Goodbye.");
              twiml.hangup();
              inlineHandled = true;
            } else if (entryUser.recordingRejectionReason && entryUser.recordingRejectionType === "greeting") {
              twiml.redirect(entryUser.recordingRejectionReason === "phone_number"
                ? "/voice/recording-rejected-phone-number"
                : "/voice/recording-rejected-unclear");
              inlineHandled = true;
            } else {
              const linkedCard = await storage.getMembershipCardByPhone(entryFrom);
              if (linkedCard && linkedCard.valueSeconds > 0) {
                callCardOverride.set(entrySid, linkedCard.id);
                if (!callTimeAnnounced.has(entrySid)) {
                  playTimeRemaining(twiml, req, Math.floor(linkedCard.valueSeconds / 60));
                  callTimeAnnounced.add(entrySid);
                }
                twiml.redirect("/voice/entry-check-card");
                inlineHandled = true;
              } else if (!entryUser.membershipTier) {
                // Brand new — inline Roger activates free trial
                await applyRogerGreetingInline(twiml, req, entryUser, entryFrom, entrySid, motdCfg);
                inlineHandled = true;
              } else if (motdCfg.billingMode === "per_24h" && entryUser.membershipTier !== "free_trial") {
                const purchasedAt = entryUser.membershipPurchasedAt;
                const hoursElapsed = purchasedAt ? (Date.now() - purchasedAt.getTime()) / 3_600_000 : 24;
                if (hoursElapsed >= 24) {
                  playPrompt(twiml, req, "access_expired.mp3", "Your backdoor access pass has expired.");
                  twiml.redirect("/voice/membership-purchase");
                } else {
                  await applyRogerGreetingInline(twiml, req, entryUser, entryFrom, entrySid, motdCfg);
                }
                inlineHandled = true;
              } else if ((entryUser.remainingSeconds ?? 0) <= 0) {
                playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
                twiml.redirect("/voice/membership-purchase");
                inlineHandled = true;
              } else {
                // Returning caller with time — Roger plays inline
                await applyRogerGreetingInline(twiml, req, entryUser, entryFrom, entrySid, motdCfg);
                inlineHandled = true;
              }
            }
          } catch (inlineErr) {
            console.error("[voice] /voice/entry inline check failed — falling back to entry-check redirect:", inlineErr);
            inlineHandled = false;
          }
        }
        if (!inlineHandled) {
          // Missing From/CallSid or inline check threw — fall back to the dedicated route
          twiml.redirect("/voice/entry-check");
        }
      }
    } catch (error) {
      console.error("[voice] /voice/entry error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b-i-MW. Gender Selection (MW systems only) ──────────────────────────
  // On MW systems, callers identify their gender before reaching the membership
  // check. Women are always free and go directly to the male box.
  app.post("/voice/gender-select", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      numDigits: 1,
      finishOnKey: "",
      action: "/voice/handle-gender-select",
      timeout: 10,
    });
    playPrompt(gather, req, "gender_select.mp3",
      "Guys, press one to talk to women. Women, press three to talk to guys.");
    // No input / timeout → loop back and ask again
    twiml.redirect("/voice/gender-select");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-gender-select", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = (req.body?.Digits as string) ?? "";
    const callSid = req.body?.CallSid as string;

    if (digit === "1") {
      // Male caller — proceed through the normal membership / free-trial flow
      console.log(`[voice] gender-select: male caller callSid=${callSid}`);
      storage.updateActiveCallGender(callSid, "male").catch(err =>
        console.error("[voice] gender-select: failed to set gender=male", err)
      );
      twiml.redirect("/voice/membership-entry");
    } else if (digit === "3") {
      // Female caller — always free on MW systems, go straight to the male box
      console.log(`[voice] gender-select: female caller callSid=${callSid} — bypassing membership`);
      femaleCallers.add(callSid);
      storage.updateActiveCallGender(callSid, "female").catch(err =>
        console.error("[voice] gender-select: failed to set gender=female", err)
      );
      twiml.redirect("/voice/phone-booth");
    } else {
      // Invalid input — ask again
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/gender-select");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b-i. Membership Gateway ──────────────────────────────────────────────
  // Asks caller if they have a membership. Press 1 to enter it, # to skip.
  // NOTE: When billing mode is 'per_day', membership number entry is disabled.
  // Authentication is handled purely by caller ID to prevent account sharing.
  app.post("/voice/membership-entry", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    try {
      const settings = await getMembershipSettingsCached();

      // Free Mode: play announcement and send caller directly to the main menu
      if (isFreeModeActive(settings)) {
        playPrompt(twiml, req, "free_mode_announcement.mp3",
          "Great news! All calls are completely free right now. No membership required. Enjoy unlimited time on the system. Connecting you now.");
        twiml.redirect("/voice/phone-booth");
        res.type("text/xml");
        res.send(twiml.toString());
        return;
      }

      if (settings.billingMode === "per_day") {
        // Per-day billing: skip membership number prompt entirely — caller ID is the sole authenticator
        twiml.redirect("/voice/entry-check");
        res.type("text/xml");
        res.send(twiml.toString());
        return;
      }

      // If the caller already has active membership time on file (linked calling card,
      // free trial with remaining minutes, or paid membership with remaining time),
      // skip the card-entry prompt and route them straight to entry-check.
      if (fromNumber) {
        const [linkedCard, existingUser] = await Promise.all([
          storage.getMembershipCardByPhone(fromNumber),
          storage.getUserByPhone(fromNumber),
        ]);

        const hasCardTime = !!(linkedCard && linkedCard.valueSeconds > 0);

        let hasUserTime = false;
        if (existingUser?.membershipTier) {
          if (settings.billingMode === "per_24h" && existingUser.membershipTier !== "free_trial") {
            const purchasedAt = existingUser.membershipPurchasedAt;
            hasUserTime = !!purchasedAt && (Date.now() - purchasedAt.getTime()) < 24 * 3_600_000;
          } else {
            hasUserTime = (existingUser.remainingSeconds ?? 0) > 0;
          }
        }

        if (hasCardTime || hasUserTime) {
          console.log(`[voice] membership-entry: ${fromNumber} has active access — skipping card prompt`);
          twiml.redirect("/voice/entry-check");
          res.type("text/xml");
          res.send(twiml.toString());
          return;
        }
      }
    } catch (err) {
      console.error("[voice] membership-entry billing mode check error:", err);
    }

    twiml.redirect("/voice/entry-check");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b-i-a. Handle Membership Gateway Choice (legacy route — kept for compatibility) ──
  app.post("/voice/handle-membership-gateway", async (req, res) => {
    const twiml = new VoiceResponse();
    twiml.redirect("/voice/entry-check");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1b-i-b. Membership Number Entry (legacy route — kept for compatibility) ───────────
  app.post("/voice/membership-number-entry", async (req, res) => {
    const twiml = new VoiceResponse();
    twiml.redirect("/voice/membership-entry");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Membership Center (global * shortcut) ────────────────────────────────
  // Callers arrive here by pressing * from any single-digit menu.
  // From here they can sign in with a membership card (press 1) or
  // return to the main menu (press #).
  app.post("/voice/membership-center", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-membership-center", timeout: 10 });
    playPrompt(gather, req, "membership_center.mp3",
      "Membership center. To sign in to your membership press 1. To return to the main menu press pound.");
    twiml.redirect("/voice/membership-center");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-membership-center", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    if (digit === "1") {
      twiml.redirect("/voice/membership-sign-in");
    } else if (digit === "#") {
      twiml.redirect("/voice/main-menu");
    } else {
      twiml.redirect("/voice/membership-center");
    }
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Membership Sign-In (card entry from membership center) ──────────────
  // Shows the card-number gather; on submission routes to handle-membership-entry.
  app.post("/voice/membership-sign-in", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      numDigits: 5,
      finishOnKey: "#",
      action: "/voice/handle-membership-entry",
      timeout: 15,
    });
    playPrompt(gather, req, "membership_entry_prompt.mp3",
      "Enter your membership card number now, or press pound to skip.");
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
            playPrompt(twiml, req, "link_phone_prefix.mp3", "Your phone number has been linked to your web account. Your membership number is:");
            for (const digit of membershipNumber.replace(/\D/g, "")) {
              twiml.say(digit);
            }
            playPrompt(twiml, req, "link_phone_portal.mp3", "You can now sign in to the web portal to manage your account.");
          } else {
            playPrompt(twiml, req, "link_phone_success.mp3", "Your phone number has been linked to your web account. You can now sign in to the web portal.");
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
      // 5-digit calling card number
      try {
        const card = await storage.getMembershipCardByNumber(digits);
        if (!card) {
          console.log(`[voice] Card not found: ${digits}`);
          playPrompt(twiml, req, "membership_invalid.mp3",
            "We could not find a card with that number. Please check your card and try again.");
          twiml.redirect("/voice/entry-check");
        } else if (card.phoneNumber && card.phoneNumber !== fromNumber) {
          console.log(`[voice] Card ${digits} already linked to ${card.phoneNumber}; rejected for ${fromNumber}`);
          playPrompt(twiml, req, "membership_invalid.mp3",
            "That membership card has already been activated on a different phone number.");
          twiml.redirect("/voice/entry-check");
        } else if (card.valueSeconds <= 0) {
          console.log(`[voice] Card ${digits} has no remaining time`);
          playPrompt(twiml, req, "access_expired.mp3",
            "That card has no remaining time. Please use a different card.");
          twiml.redirect("/voice/entry-check");
        } else if (card.pin) {
          // Card has a PIN — require it before granting access
          console.log(`[voice] Card ${digits} — PIN required`);
          pendingCardFirstUse.set(callSid, card.cardNumber);
          twiml.redirect("/voice/membership-card-pin-entry");
        } else {
          if (!card.phoneNumber) {
            await storage.linkCardToPhone(card.id, fromNumber);
          }
          console.log(`[voice] Card ${digits} — no PIN, granting access directly`);
          callCardOverride.set(callSid, card.id);
          const minutes = Math.floor(card.valueSeconds / 60);
          playTimeRemaining(twiml, req, minutes);
          callTimeAnnounced.add(callSid);
          twiml.redirect("/voice/entry-check-card");
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
        const siteConf = await getSiteSettingsCached();
        twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/mw-main-menu" : "/voice/main-menu");
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
      timeout: 30,
    });
    playPrompt(gather, req, "membership_pin_prompt.mp3", "Please enter your 4-digit PIN.");
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
        playPrompt(twiml, req, "pin_accepted.mp3", "PIN accepted. Welcome.");
        twiml.redirect("/voice/entry-check-override");
      } else {
        pendingPinAuth.delete(callSid);
        console.log(`[voice] PIN rejected for callSid=${callSid}`);
        playPrompt(twiml, req, "pin_incorrect.mp3", "Incorrect PIN. Please try again by calling from your registered phone number or entering your membership number again.");
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

  // ─── 1c-card-pin. First-Use Card PIN Entry ────────────────────────────────
  // Prompted after a caller enters a valid 5-digit card number for the very first time.
  // They must enter the card's 4-digit PIN to prove ownership before the card activates.
  app.post("/voice/membership-card-pin-entry", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;

    if (!pendingCardFirstUse.has(callSid)) {
      twiml.redirect("/voice/entry-check");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const gather = twiml.gather({
      numDigits: 4,
      finishOnKey: "",
      action: "/voice/handle-membership-card-pin-entry",
      timeout: 30,
      actionOnEmptyResult: true,
    });
    playPrompt(gather, req, "membership_pin_prompt.mp3", "Please enter your 4-digit PIN.");
    // No input / timeout → skip membership and continue
    twiml.redirect("/voice/entry-check");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-membership-card-pin-entry", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    const cardNumber = pendingCardFirstUse.get(callSid);
    if (!cardNumber) {
      twiml.redirect("/voice/entry-check");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      const card = await storage.getMembershipCardByNumber(cardNumber);
      if (card && card.phoneNumber && card.phoneNumber !== fromNumber) {
        pendingCardFirstUse.delete(callSid);
        console.log(`[voice] Card ${cardNumber} already linked to ${card.phoneNumber}; rejected for ${fromNumber}`);
        playPrompt(twiml, req, "membership_invalid.mp3",
          "That membership card has already been activated on a different phone number.");
        twiml.redirect("/voice/entry-check");
      } else if (card && card.pin && card.pin === digits) {
        pendingCardFirstUse.delete(callSid);
        if (!card.phoneNumber) {
          await storage.linkCardToPhone(card.id, fromNumber);
        }
        callCardOverride.set(callSid, card.id);
        const minutes = Math.floor(card.valueSeconds / 60);
        console.log(`[voice] Card ${cardNumber} PIN accepted for callSid=${callSid} phone=${fromNumber} — ${minutes} min remaining`);
        playPrompt(twiml, req, "membership_linked.mp3", "Membership card activated.");
        playTimeRemaining(twiml, req, minutes);
        callTimeAnnounced.add(callSid);
        twiml.redirect("/voice/entry-check-card");
      } else {
        pendingCardFirstUse.delete(callSid);
        console.log(`[voice] Card ${cardNumber} PIN rejected for callSid=${callSid}`);
        playPrompt(twiml, req, "membership_invalid.mp3",
          "Incorrect PIN. Please check your card and try again.");
        twiml.redirect("/voice/entry-check");
      }
    } catch (err) {
      console.error("[voice] Card PIN entry error:", err);
      pendingCardFirstUse.delete(callSid);
      twiml.redirect("/voice/entry-check");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1c-card. Entry Check (Calling Card) ─────────────────────────────────
  // Routes callers who authenticated via a calling card (callCardOverride) into the
  // main experience. Time was already announced in the PIN handler.
  app.post("/voice/entry-check-card", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;

    try {
      const cardId = callCardOverride.get(callSid);
      if (!cardId) {
        twiml.redirect("/voice/entry-check");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const card = await storage.getMembershipCardById(cardId);
      if (!card || card.valueSeconds <= 0) {
        playPrompt(twiml, req, "access_expired.mp3",
          "Your calling card has no remaining time. Please use a different card.");
        twiml.hangup();
      } else {
        const fromNumber = req.body?.From as string;
        if (fromNumber) {
          const user = await getOrCreateUser(fromNumber);
          await playRogerGreetingAudio(twiml, req, user, fromNumber, callSid);
        }
        if (!callTimeAnnounced.has(callSid)) {
          playTimeRemaining(twiml, req, Math.floor(card.valueSeconds / 60));
          callTimeAnnounced.add(callSid);
        }
        const siteConf = await getSiteSettingsCached();
        twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/mw-main-menu" : "/voice/main-menu");
      }
    } catch (error) {
      console.error("[voice] /voice/entry-check-card error:", error);
      twiml.redirect("/voice/entry-check");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1c. Entry Check ──────────────────────────────────────────────────────
  // Checks the caller's own account state and branches accordingly.
  // When the caller passes all gates, Roger's greeting is played inline in the
  // SAME HTTP response — no extra redirect round-trip to /voice/roger-greeting.

  /** Strip ElevenLabs emotion tags for plain-text Twilio fallback. */
  function stripEmotionTags(text: string): string {
    return text.replace(/\[[\w\s]+\]/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  /**
   * Pick the pre-generated Roger greeting variant for this caller.
   * Returns the filename (in uploads/ root) and a plain-text fallback.
   */
  function rogerGreetingVariant(
    isNewCaller: boolean,
    lastCallDate: Date | null,
    todayCallCount: number,
  ): { filename: string; fallback: string } {
    const find = (name: string) => {
      const p = ROGER_PROMPTS.find(r => r.filename === name);
      return { filename: name, fallback: p ? stripEmotionTags(p.text) : "" };
    };
    if (isNewCaller || !lastCallDate) return find("roger_welcome_new.mp3");
    // 3+ calls on the same calendar day (day ends at midnight server time)
    if (todayCallCount >= 3) return find("roger_welcome_frequent.mp3");
    const daysSince = Math.floor((Date.now() - lastCallDate.getTime()) / 86_400_000);
    if (daysSince < 1)   return find("roger_welcome_sameday.mp3");
    if (daysSince <= 3)  return find("roger_welcome_recent.mp3");
    if (daysSince <= 14) return find("roger_welcome_fewdays.mp3");
    if (daysSince <= 30) return find("roger_welcome_weeks.mp3");
    return find("roger_welcome_longtime.mp3");
  }

  async function playRogerGreetingAudio(
    twiml: InstanceType<typeof VoiceResponse>,
    req: Request,
    user: Awaited<ReturnType<typeof getOrCreateUser>>,
    fromNumber: string,
    callSid: string,
  ): Promise<void> {
    const isNewCaller = !user.membershipTier;
    const [lastCallDate, todayCallCount] = await Promise.all([
      storage.getLastCallTimestamp(fromNumber, callSid),
      storage.getTodayCallCount(fromNumber, callSid),
    ]);
    const { filename: rogerFile, fallback: rogerFallback } = rogerGreetingVariant(isNewCaller, lastCallDate, todayCallCount);
    const filepath = path.join(UPLOADS_DIR, rogerFile);

    if (fs.existsSync(filepath)) {
      twiml.play(`${baseUrl(req)}/uploads/${rogerFile}`);
    } else {
      console.warn(`[roger-greeting] Pre-generated file missing: ${rogerFile} — using TTS fallback`);
      twiml.say({ voice: "alice" }, rogerFallback);
    }
  }

  /**
   * Inline Roger greeting — appends Roger audio + time announcement to twiml
   * and adds the main-menu redirect. Reuses the already-fetched user and
   * membershipConf so we avoid redundant DB calls.
   */
  async function applyRogerGreetingInline(
    twiml: InstanceType<typeof VoiceResponse>,
    req: Request,
    user: Awaited<ReturnType<typeof getOrCreateUser>>,
    fromNumber: string,
    callSid: string,
    membershipConf: Awaited<ReturnType<typeof getMembershipSettingsCached>>,
  ): Promise<void> {
    const isNewCaller = !user.membershipTier;
    await playRogerGreetingAudio(twiml, req, user, fromNumber, callSid);

    const rogerFreeMode = isFreeModeActive(membershipConf);

    if (isNewCaller) {
      await storage.updateUserMembership(user.id, {
        membershipTier: "free_trial",
        remainingSeconds: membershipConf.freeTrialMinutes * 60,
      });
      await storage.getOrCreateMailbox(user.id);
      console.log(`[roger-greeting] Auto-activated free trial — ${membershipConf.freeTrialMinutes} min for userId=${user.id}`);
      if (!rogerFreeMode) {
        playTimeRemaining(twiml, req, membershipConf.freeTrialMinutes);
        playPrompt(twiml, req, "free_trial_terms.mp3",
          "Your free trial will expire in seven days and it must be used from this phone number.");
        callTimeAnnounced.add(callSid);
      }
    } else if (!rogerFreeMode && membershipConf.billingMode === "per_24h" && user.membershipTier !== "free_trial" && user.membershipPurchasedAt) {
      const hoursElapsed = (Date.now() - user.membershipPurchasedAt.getTime()) / 3_600_000;
      const hoursLeft = 24 - hoursElapsed;
      playBackdoorHoursRemaining(twiml, req, hoursLeft);
      callTimeAnnounced.add(callSid);
    } else if (!rogerFreeMode) {
      const remainingSeconds = user.remainingSeconds ?? 0;
      if (remainingSeconds > 0) {
        playTimeRemaining(twiml, req, Math.floor(remainingSeconds / 60));
        callTimeAnnounced.add(callSid);
      }
    }

    const siteConf = await getSiteSettingsCached();
    twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/mw-main-menu" : "/voice/main-menu");
  }

  app.post("/voice/entry-check", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const remainingSeconds = user.remainingSeconds ?? 0;

      // ── Moderation gate ─────────────────────────────────────────────────────
      if (user.accountStatus === "banned") {
        playPrompt(twiml, req, "caller_banned.mp3", "We're sorry, your access to this service has been suspended. If you believe this is an error, please contact customer support. Goodbye.");
        twiml.hangup();
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── Recording rejection gate (runs before free-mode to catch all callers) ─
      if (user.recordingRejectionReason && user.recordingRejectionType === "greeting") {
        const rejectionRoute = user.recordingRejectionReason === "phone_number"
          ? "/voice/recording-rejected-phone-number"
          : "/voice/recording-rejected-unclear";
        twiml.redirect(rejectionRoute);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── Free Mode: bypass all membership/trial/balance checks ───────────────
      const freeModeSettings = await getMembershipSettingsCached();
      if (isFreeModeActive(freeModeSettings)) {
        // Inline Roger greeting — no extra redirect hop
        await applyRogerGreetingInline(twiml, req, user, fromNumber, callSid, freeModeSettings);
      } else {
        const linkedCard = await storage.getMembershipCardByPhone(fromNumber);
        if (linkedCard && linkedCard.valueSeconds > 0) {
          callCardOverride.set(callSid, linkedCard.id);
          if (!callTimeAnnounced.has(callSid)) {
            playTimeRemaining(twiml, req, Math.floor(linkedCard.valueSeconds / 60));
            callTimeAnnounced.add(callSid);
          }
          twiml.redirect("/voice/entry-check-card");
        } else if (!user.membershipTier) {
          // Brand new — inline Roger greeting activates free trial
          await applyRogerGreetingInline(twiml, req, user, fromNumber, callSid, freeModeSettings);
        } else if (freeModeSettings.billingMode === "per_24h" && user.membershipTier !== "free_trial") {
          const purchasedAt = user.membershipPurchasedAt;
          const hoursElapsed = purchasedAt ? (Date.now() - purchasedAt.getTime()) / 3_600_000 : 24;
          if (hoursElapsed >= 24) {
            playPrompt(twiml, req, "access_expired.mp3", "Your backdoor access pass has expired.");
            twiml.redirect("/voice/membership-purchase");
          } else {
            // Inline Roger greeting — no extra redirect hop
            await applyRogerGreetingInline(twiml, req, user, fromNumber, callSid, freeModeSettings);
          }
        } else if (remainingSeconds <= 0) {
          playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
          twiml.redirect("/voice/membership-purchase");
        } else {
          // Returning caller with time — inline Roger greeting
          await applyRogerGreetingInline(twiml, req, user, fromNumber, callSid, freeModeSettings);
        }
      }
    } catch (error) {
      console.error("[voice] /voice/entry-check error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1c. Roger Greeting (standalone route — kept for backward compatibility) ──
  // Any path that still redirects here directly (e.g. external links, old Twilio
  // call-flows) will work. New internal paths use applyRogerGreetingInline above.
  app.post("/voice/roger-greeting", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const [user, membershipConf] = await Promise.all([
        getOrCreateUser(fromNumber),
        getMembershipSettingsCached(),
      ]);
      await applyRogerGreetingInline(twiml, req, user, fromNumber, callSid, membershipConf);
    } catch (error) {
      console.error("[voice] /voice/roger-greeting error:", error);
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 1d. Free Trial Offer (legacy — kept for direct URL references) ────────
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

        const siteConf = await getSiteSettingsCached();
        twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/mw-main-menu" : "/voice/main-menu");
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

  // ─── 1e. Male Box Welcome ──────────────────────────────────────────────
  // Common landing point after account-state handling.
  // Always plays the male box intro, then checks whether this caller has
  // already recorded a profile name. If not, kicks off the name-recording flow.
  app.post("/voice/phone-booth", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      // Determine site mode and caller gender for gender-aware prompts
      const boothSiteConf = await getSiteSettingsCached();
      const isMW = boothSiteConf.siteCategory === "MW";
      const isFemale = femaleCallers.has(callSid);

      // Play the male box welcome intro — gender-aware for MW systems
      if (isMW) {
        if (isFemale) {
          // Female caller on MW hears guys' greetings
          playPrompt(twiml, req, "phone_booth_welcome.mp3",
            "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign.");
        } else {
          // Male caller on MW hears women's greetings
          playPrompt(twiml, req, "phone_booth_welcome.mp3",
            "Welcome to the live connector. Greetings from all the local women here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign.");
        }
      } else {
        // MM — standard message
        playPrompt(twiml, req, "phone_booth_welcome.mp3",
          "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign.");
      }

      // Male Box MOTD
      try {
        const motdCfg = await getMembershipSettingsCached();
        if (motdCfg.motdMaleBoxEnabled && motdCfg.motdMaleBoxText) {
          playPrompt(twiml, req, "motd_phone_booth.mp3", motdCfg.motdMaleBoxText);
        }
      } catch (err) {
        console.error("[voice] phone-booth motd error:", err);
      }

      const user = await getOrCreateUser(fromNumber);
      const profile = await storage.getProfile(user.id);

      if (!profile) {
        // No profile yet — need to record their name first (gender-aware for MW)
        if (isMW && isFemale) {
          playPrompt(twiml, req, "welcome_record_name.mp3",
            "You need to record a greeting to introduce yourself to the guys first. Let's record the name you want to use. After the tone, record just your first name.");
        } else if (isMW) {
          playPrompt(twiml, req, "welcome_record_name.mp3",
            "You need to record a greeting to introduce yourself to the women first. Let's record the name you want to use. After the tone, record just your first name.");
        } else {
          playPrompt(twiml, req, "welcome_record_name.mp3",
            "You need to record a greeting to introduce yourself to the other guys first. Let's record the name you want to use. After the tone, record just your first name.");
        }
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

    // Test sessions (from the admin phone tester) have no real recording — bypass validation
    const isTestSession = callSid?.startsWith("TEST-");

    if (!isTestSession && (!nameRecordingUrl || nameDuration < 1)) {
      playPrompt(twiml, req, "name_retry.mp3", "We didn't catch your name. Please try again.");
      twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Download from Twilio to local server, then hold until the greeting is saved.
    // Test sessions use a placeholder path since there's no actual recording.
    const resolvedNameUrl = isTestSession && !nameRecordingUrl
      ? "/uploads/test-sim-name.mp3"
      : await downloadRecording(nameRecordingUrl);
    pendingNameRecordings.set(callSid, resolvedNameUrl);

    playPrompt(twiml, req, "name_saved_record_greeting.mp3", "Great. Now record your greeting for other callers. After the tone, press any key when done.");
    twiml.record({ maxLength: 60, playBeep: true, action: "/voice/save-profile" } as any);
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
      const rawRecordingUrl = req.body?.RecordingUrl;
      const recordingDuration = parseInt(req.body?.RecordingDuration) || 0;

      // Test sessions (from the admin phone tester) have no real recording — bypass validation
      const isTestSession = callSid?.startsWith("TEST-");

      if (!fromNumber || (!isTestSession && !rawRecordingUrl)) {
        throw new Error(`Missing fields: From=${fromNumber}, RecordingUrl=${rawRecordingUrl}`);
      }

      // Reject greetings shorter than 3 seconds — play error audio and re-prompt (not for test sessions)
      if (!isTestSession && recordingDuration < 3) {
        playPrompt(twiml, req, "greeting_error.mp3", "That greeting was too short. Please try again after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: "/voice/save-profile" } as any);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // Download greeting recording from Twilio to local server.
      // Test sessions use a placeholder path since there's no actual recording.
      const recordingUrl = isTestSession && !rawRecordingUrl
        ? "/uploads/test-sim-greeting.mp3"
        : await downloadRecording(rawRecordingUrl);

      // Consume any pending name recording from the prior step
      const nameRecordingUrl = pendingNameRecordings.get(callSid) ?? undefined;
      if (nameRecordingUrl) pendingNameRecordings.delete(callSid);

      // Save immediately to DB so playback works right away at the review screen
      const user = await getOrCreateUser(fromNumber);

      // Delete old local files if the caller is re-recording
      const existingProfile = await storage.getProfile(user.id);
      if (existingProfile) {
        deleteLocalRecording(existingProfile.recordingUrl);
        deleteLocalRecording(existingProfile.nameRecordingUrl);
      }

      await storage.upsertProfile({
        userId: user.id,
        nameRecordingUrl,
        recordingUrl,
        recordingDuration,
      });
      // Clear any previous recording rejection — this new recording will go through auto-mod again
      await storage.clearUserRecordingRejection(user.id);
      // Mark transcription as pending, then transcribe locally via Groq Whisper (async, non-blocking)
      const saved = await storage.getProfile(user.id);
      if (saved) {
        await storage.setProfileTranscriptionPending(saved.id);
        transcribeLocalFile(recordingUrl).then(async ({ text, status }) => {
          const storeStatus = status === "silent" ? "completed" : status;
          await storage.updateProfileTranscription(recordingUrl, text, storeStatus);
          console.log(`[transcribe] Profile stored for userId=${user.id}: status=${storeStatus}`);
        }).catch(err => console.error("[transcribe] save-profile error:", err));
      }
      console.log(`[voice] Profile saved immediately for userId=${user.id} (dur=${recordingDuration}s)`);

      // Schedule auto-mod + human review queue after 65 seconds
      scheduleAutoModCheck(recordingUrl, user.id, "greeting");

      // Automatically play back the greeting so the caller can hear it before the review menu.
      // Test sessions skip playback (no real audio file) and go straight to the review menu.
      if (!isTestSession) {
        playPrompt(twiml, req, "here_is_your_greeting.mp3", "Here is what your greeting sounds like.");
        safePlayRecording(twiml, recordingUrl, req, "");
      }
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

    // A real caller just arrived — kick off seed activity (fire and forget)
    triggerSeedActivity().catch(() => {});

    // MW systems have their own main menu — bounce there automatically so all
    // sub-routes that redirect to /voice/main-menu land in the right place.
    try {
      const siteConf = await getSiteSettingsCached();
      if (siteConf.siteCategory === "MW") {
        twiml.redirect("/voice/mw-main-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }
    } catch (_) { /* fall through to MM menu on error */ }

    try {
      const cardId = callCardOverride.get(callSid);
      let hasMembership: boolean;
      let remainingSeconds: number;

      let userTier: string | null = null;
      if (cardId) {
        const card = await storage.getMembershipCardById(cardId);
        hasMembership = true;
        remainingSeconds = card?.valueSeconds ?? 0;
      } else {
        const user = await getOrCreateUser(fromNumber);
        hasMembership = !!user.membershipTier;
        remainingSeconds = user.remainingSeconds ?? 0;
        userTier = user.membershipTier ?? null;
      }

      // ── Access expired ──────────────────────────────────────────────────
      if (hasMembership && remainingSeconds <= 0) {
        if (cardId) {
          playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
          playPrompt(twiml, req, "card_no_time.mp3", "Please use a different calling card.");
          twiml.hangup();
        } else if (userTier === "free_trial") {
          playPrompt(twiml, req, "free_trial_expired.mp3",
            "Your free trial has ended. We hope you enjoyed your time on the system. " +
            "To keep your access and join the community as a full member, press 1 when you hear the menu.");
          twiml.redirect("/voice/membership-purchase");
        } else {
          playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
          twiml.redirect("/voice/membership-purchase");
        }
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── Under-5-minute warning at main menu (shown once per call) ──────
      if (hasMembership && remainingSeconds < 300 && remainingSeconds > 0 && !callWarningShown.has(callSid)) {
        callWarningShown.add(callSid);
        twiml.redirect("/voice/time-warning");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── First-visit balance announcement ────────────────────────────────
      if (hasMembership && remainingSeconds > 0 && !callTimeAnnounced.has(callSid)) {
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
      "To enter the male box press 1. " +
      "To add time or purchase a membership press 2. " +
      (MAILBOX_ENABLED ? "For mailboxes and personal ads press 3. " : "") +
      "For information on membership prices press 4. " +
      "For your voicemail press 6. " +
      "To manage your membership press 8. " +
      "Press 0 for time remaining, or 9 to repeat these choices."
    );
    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4. Handle Main Menu ──────────────────────────────────────────────────
  app.post("/voice/handle-main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "1") {
      // Enter the male box (live connector)
      twiml.redirect("/voice/phone-booth");
    } else if (digit === "3" && MAILBOX_ENABLED) {
      // Mailboxes and personal ads
      twiml.redirect("/voice/mailbox-menu");
    } else if (digit === "2") {
      // Add time / purchase membership — show promo-code option first
      twiml.redirect("/voice/purchase-pre-menu");
    } else if (digit === "6") {
      // Voicemail
      twiml.redirect("/voice/voicemail");
    } else if (digit === "4") {
      // Information on membership prices
      twiml.redirect("/voice/info-menu");
    } else if (digit === "8") {
      // Manage membership
      twiml.redirect("/voice/manage-membership");
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

  // ─── Voicemail System ────────────────────────────────────────────────────────
  // Accessible from main menu (press 6). Functions like a cell-phone voicemail:
  // announces new + saved counts, lets caller listen, save, delete, or reply.

  app.post("/voice/voicemail", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const newCount  = await storage.getUnreadMessageCount(user.id);
      const savedCount = await storage.getSavedMessageCount(user.id);

      const vmSettings = await getMembershipSettingsCached();
      if (vmSettings.billingMode !== "per_day" && vmSettings.billingMode !== "per_24h" && !vmSettings.freeMode) {
        startBilling(callSid, fromNumber);
      }

      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-voicemail", timeout: 10 });

      if (newCount === 0 && savedCount === 0) {
        playPrompt(gather, req, "vm_no_new.mp3", "You have no new messages.");
      } else {
        if (newCount > 0) {
          gather.say(`You have ${newCount} new ${newCount === 1 ? "message" : "messages"}.`);
        } else {
          playPrompt(gather, req, "vm_no_new.mp3", "You have no new messages.");
        }
        if (savedCount > 0) {
          gather.say(`And ${savedCount} saved ${savedCount === 1 ? "message" : "messages"}.`);
        }
      }
      playPrompt(gather, req, "vm_options.mp3",
        "To listen to your messages press 1. To listen to saved messages press 2. To repeat this menu press 9. To return to the main menu press pound.");

      twiml.redirect("/voice/voicemail");
    } catch (err) {
      console.error("[voice] /voice/voicemail error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-voicemail", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;

    if (digit === "1") {
      twiml.redirect("/voice/voicemail-inbox");
    } else if (digit === "2") {
      twiml.redirect("/voice/voicemail-saved");
    } else if (digit === "9") {
      twiml.redirect("/voice/voicemail");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/voicemail");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Voicemail Inbox (new messages) ──────────────────────────────────────

  app.post("/voice/voicemail-inbox", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const user = await getOrCreateUser(fromNumber);

      const vmSettings = await getMembershipSettingsCached();
      if (vmSettings.billingMode !== "per_day" && vmSettings.billingMode !== "per_24h" && !vmSettings.freeMode) {
        startBilling(callSid, fromNumber);
      }

      const message = await storage.getUnreadMessage(user.id);

      if (!message) {
        playPrompt(twiml, req, "vm_end_of_new.mp3", "End of new messages.");
        twiml.redirect("/voice/voicemail");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const senderProfile = await storage.getProfile(message.fromUserId);
      const gather = twiml.gather({
        numDigits: 1,
        action: `/voice/handle-voicemail-inbox?msgId=${message.id}&senderId=${message.fromUserId}`,
        timeout: 10,
      });

      playPrompt(gather, req, "vm_new_message.mp3", "New message.");
      if (senderProfile?.nameRecordingUrl) {
        playPrompt(gather, req, "vm_message_from.mp3", "Message from");
        safePlayRecording(gather, senderProfile.nameRecordingUrl, req, "");
      }
      safePlayRecording(gather, message.recordingUrl, req, "Message audio is not available.");
      playPrompt(gather, req, "vm_new_options.mp3",
        "To replay this message press 1. To save this message press 2. To delete this message press 3. To reply press 4. To hear this caller's profile press 5. For the next message press 9. To return to the voicemail menu press 7. To hear how much time you have remaining press 0.");

      twiml.redirect("/voice/voicemail");
    } catch (err) {
      console.error("[voice] /voice/voicemail-inbox error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred.");
      twiml.redirect("/voice/voicemail");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-voicemail-inbox", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const callSid = req.body?.CallSid as string;
    const msgId   = req.query.msgId as string;
    const senderId = req.query.senderId as string;

    try {
      await syncBilling(callSid);

      if (digit === "1") {
        // Replay — message is still unread so next /voicemail-inbox call plays it again
        twiml.redirect("/voice/voicemail-inbox");
      } else if (digit === "2") {
        await storage.saveMessage(msgId);
        playPrompt(twiml, req, "vm_message_saved.mp3", "Message saved.");
        twiml.redirect("/voice/voicemail-inbox");
      } else if (digit === "3") {
        await storage.deleteMessage(msgId);
        playPrompt(twiml, req, "vm_message_deleted.mp3", "Message deleted.");
        twiml.redirect("/voice/voicemail-inbox");
      } else if (digit === "4") {
        await storage.markMessageRead(msgId);
        playPrompt(twiml, req, "vm_reply_prompt.mp3", "Record your reply after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}&returnTo=voicemail-inbox` });
      } else if (digit === "5") {
        await storage.markMessageRead(msgId);
        const senderProfile = await storage.getProfile(senderId);
        const profileGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-voicemail-inbox-profile?senderId=${senderId}`,
          timeout: 10,
        });
        if (senderProfile) {
          if (senderProfile.nameRecordingUrl) safePlayRecording(profileGather, senderProfile.nameRecordingUrl, req, "");
          safePlayRecording(profileGather, senderProfile.recordingUrl, req, "This caller's profile is not available.");
        } else {
          playPrompt(profileGather, req, "caller_no_profile.mp3", "This caller no longer has a profile.");
        }
        playPrompt(profileGather, req, "vm_send_or_return.mp3", "To send a message press 1. To return to your voicemail press 9.");
        twiml.redirect("/voice/voicemail-inbox");
      } else if (digit === "9") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/voicemail-inbox");
      } else if (digit === "7") {
        // Return to voicemail menu (was 0; 0 is now reserved for "announce time remaining")
        twiml.redirect("/voice/voicemail");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/voicemail-inbox");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-voicemail-inbox error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred.");
      twiml.redirect("/voice/voicemail");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-voicemail-inbox-profile", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const senderId = req.query.senderId as string;

    try {
      if (digit === "1") {
        playPrompt(twiml, req, "vm_reply_prompt.mp3", "Record your message after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}&returnTo=voicemail-inbox` });
      } else {
        twiml.redirect("/voice/voicemail-inbox");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-voicemail-inbox-profile error:", err);
      twiml.redirect("/voice/voicemail");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Voicemail Saved Messages ─────────────────────────────────────────────

  app.post("/voice/voicemail-saved", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;
    const afterId = req.query.afterId as string | undefined;

    try {
      const user = await getOrCreateUser(fromNumber);

      const vmSettings = await getMembershipSettingsCached();
      if (vmSettings.billingMode !== "per_day" && vmSettings.billingMode !== "per_24h" && !vmSettings.freeMode) {
        startBilling(callSid, fromNumber);
      }

      const savedMessages = await storage.getSavedMessages(user.id, afterId || undefined);
      const message = savedMessages[0];

      if (!message) {
        playPrompt(twiml, req, "vm_end_of_saved.mp3", "End of saved messages.");
        twiml.redirect("/voice/voicemail");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const senderProfile = await storage.getProfile(message.fromUserId);
      const gather = twiml.gather({
        numDigits: 1,
        action: `/voice/handle-voicemail-saved?msgId=${message.id}&senderId=${message.fromUserId}${afterId ? `&afterId=${afterId}` : ""}`,
        timeout: 10,
      });

      playPrompt(gather, req, "vm_saved_message.mp3", "Saved message.");
      if (senderProfile?.nameRecordingUrl) {
        playPrompt(gather, req, "vm_message_from.mp3", "Message from");
        safePlayRecording(gather, senderProfile.nameRecordingUrl, req, "");
      }
      safePlayRecording(gather, message.recordingUrl, req, "Message audio is not available.");
      playPrompt(gather, req, "vm_saved_options.mp3",
        "To replay this message press 1. To delete this message press 3. To reply press 4. To hear this caller's profile press 5. For the next message press 9. To return to the voicemail menu press 7. To hear how much time you have remaining press 0.");

      twiml.redirect("/voice/voicemail");
    } catch (err) {
      console.error("[voice] /voice/voicemail-saved error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred.");
      twiml.redirect("/voice/voicemail");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-voicemail-saved", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const callSid = req.body?.CallSid as string;
    const msgId   = req.query.msgId as string;
    const senderId = req.query.senderId as string;
    const afterId  = req.query.afterId as string | undefined;

    try {
      await syncBilling(callSid);

      if (digit === "1") {
        // Replay — go back to same position (same afterId cursor)
        twiml.redirect(`/voice/voicemail-saved${afterId ? `?afterId=${afterId}` : ""}`);
      } else if (digit === "3") {
        await storage.deleteMessage(msgId);
        playPrompt(twiml, req, "vm_message_deleted.mp3", "Message deleted.");
        // After delete, advance to the next message from the same position
        twiml.redirect(`/voice/voicemail-saved${afterId ? `?afterId=${afterId}` : ""}`);
      } else if (digit === "4") {
        playPrompt(twiml, req, "vm_reply_prompt.mp3", "Record your reply after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}&returnTo=voicemail-saved` });
      } else if (digit === "5") {
        const senderProfile = await storage.getProfile(senderId);
        const profileGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-voicemail-saved-profile?senderId=${senderId}${afterId ? `&afterId=${afterId}` : ""}`,
          timeout: 10,
        });
        if (senderProfile) {
          if (senderProfile.nameRecordingUrl) safePlayRecording(profileGather, senderProfile.nameRecordingUrl, req, "");
          safePlayRecording(profileGather, senderProfile.recordingUrl, req, "This caller's profile is not available.");
        } else {
          playPrompt(profileGather, req, "caller_no_profile.mp3", "This caller no longer has a profile.");
        }
        playPrompt(profileGather, req, "vm_send_or_return.mp3", "To send a message press 1. To return to your voicemail press 9.");
        twiml.redirect(`/voice/voicemail-saved${afterId ? `?afterId=${afterId}` : ""}`);
      } else if (digit === "9") {
        // Advance past the current message
        twiml.redirect(`/voice/voicemail-saved?afterId=${msgId}`);
      } else if (digit === "7") {
        // Return to voicemail menu (was 0; 0 is now reserved for "announce time remaining")
        twiml.redirect("/voice/voicemail");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect(`/voice/voicemail-saved${afterId ? `?afterId=${afterId}` : ""}`);
      }
    } catch (err) {
      console.error("[voice] /voice/handle-voicemail-saved error:", err);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred.");
      twiml.redirect("/voice/voicemail");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-voicemail-saved-profile", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const senderId = req.query.senderId as string;
    const afterId  = req.query.afterId as string | undefined;

    try {
      if (digit === "1") {
        playPrompt(twiml, req, "vm_reply_prompt.mp3", "Record your message after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}&returnTo=voicemail-saved` });
      } else {
        twiml.redirect(`/voice/voicemail-saved${afterId ? `?afterId=${afterId}` : ""}`);
      }
    } catch (err) {
      console.error("[voice] /voice/handle-voicemail-saved-profile error:", err);
      twiml.redirect("/voice/voicemail");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 3b. MW Main Menu ─────────────────────────────────────────────────────
  // MW-specific main menu (men/women line). Callers arrive here after gender
  // selection + membership check. Women land here too (always free on MW).
  app.post("/voice/mw-main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid   = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    try {
      const cardId = callCardOverride.get(callSid);
      let hasMembership: boolean;
      let remainingSeconds: number;

      let userTier: string | null = null;
      if (cardId) {
        const card = await storage.getMembershipCardById(cardId);
        hasMembership = true;
        remainingSeconds = card?.valueSeconds ?? 0;
      } else {
        const user = await getOrCreateUser(fromNumber);
        hasMembership = !!user.membershipTier;
        remainingSeconds = user.remainingSeconds ?? 0;
        userTier = user.membershipTier ?? null;
      }

      // Access expired
      if (hasMembership && remainingSeconds <= 0 && !femaleCallers.has(callSid)) {
        if (cardId) {
          playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
          playPrompt(twiml, req, "card_no_time.mp3", "Please use a different calling card.");
          twiml.hangup();
        } else if (userTier === "free_trial") {
          playPrompt(twiml, req, "free_trial_expired.mp3",
            "Your free trial has ended. We hope you enjoyed your time on the system. " +
            "To keep your access and join the community as a full member, press 1 when you hear the menu.");
          twiml.redirect("/voice/membership-purchase");
        } else {
          playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
          twiml.redirect("/voice/membership-purchase");
        }
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // Under-5-minute warning (once per call)
      if (hasMembership && remainingSeconds < 300 && remainingSeconds > 0 && !callWarningShown.has(callSid)) {
        callWarningShown.add(callSid);
        twiml.redirect("/voice/time-warning");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // First-visit balance announcement
      if (hasMembership && remainingSeconds > 0 && !callTimeAnnounced.has(callSid)) {
        callTimeAnnounced.add(callSid);
        playTimeRemaining(twiml, req, Math.floor(remainingSeconds / 60));
      }
    } catch (err) {
      console.error("[voice] mw-main-menu time check error:", err);
    }

    // MW Main Menu MOTD
    try {
      const motdCfg = await getMembershipSettingsCached();
      if (motdCfg.motdMainMenuEnabled && motdCfg.motdMainMenuText) {
        playPrompt(twiml, req, "motd_main_menu.mp3", motdCfg.motdMainMenuText);
      }
    } catch (err) {
      console.error("[voice] mw-main-menu motd error:", err);
    }

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-mw-main-menu" });
    playPrompt(gather, req, "mw_main_menu.mp3",
      "Main menu. " +
      "If you're ready to join the action press 1. " +
      "To buy membership time press 2. " +
      "For the men seeking men line press 5. " +
      "To manage your membership press 8. " +
      "Press 0 for time remaining, or 9 to repeat these choices."
    );
    twiml.redirect("/voice/mw-main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 3c. Handle MW Main Menu ──────────────────────────────────────────────
  app.post("/voice/handle-mw-main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;
    const callSid = req.body?.CallSid as string;

    if (digit === "1") {
      // Join the action — enter the male/female box (straight line)
      // Reset any MSM seeking flag so they browse opposite-gender profiles
      if (callSid) await storage.updateActiveCallSeeking(callSid, "").catch(() => {});
      twiml.redirect("/voice/phone-booth");
    } else if (digit === "5") {
      // Men Seeking Men section — set seeking flag and browse male profiles
      if (callSid) await storage.updateActiveCallSeeking(callSid, "msm").catch(() => {});
      twiml.redirect("/voice/browse-profiles");
    } else if (digit === "2") {
      // Buy membership time
      twiml.redirect("/voice/purchase-pre-menu");
    } else if (digit === "8") {
      // Manage membership
      twiml.redirect("/voice/manage-membership");
    } else if (digit === "9") {
      // Repeat — also clear MSM flag so repeating the menu resets state
      if (callSid) await storage.updateActiveCallSeeking(callSid, "").catch(() => {});
      twiml.redirect("/voice/mw-main-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/mw-main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a. Purchase Pre-Menu ────────────────────────────────────────────────
  // Plays promo code option then membership packages in one single prompt.
  // All minutes and prices come live from admin membership settings.
  // Digit 1 → promo code; 2 → only active plan; 9 → repeat; # → cancel.
  app.post("/voice/purchase-pre-menu", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const s = await getMembershipSettingsCached();

      // Build lines only for plans that are active (minutes and price > 0)
      const planLines: string[] = [];
      const planKeys: Array<[string, number, number]> = [
        ["2", s.plan1Minutes, s.plan1PriceCents],
        ["3", s.plan2Minutes, s.plan2PriceCents],
        ["4", s.plan3Minutes, s.plan3PriceCents],
      ];
      for (const [digit, minutes, priceCents] of planKeys) {
        if (minutes > 0 && priceCents > 0) {
          const duration = minutesToDurationLabel(minutes);
          const price = centsToLabel(priceCents);
          planLines.push(`To purchase ${duration} of access for ${price} press ${digit}.`);
        }
      }

      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-purchase-pre-menu" });
      const menuText =
        "If you have a promotional code press 1. " +
        planLines.join(" ") + " " +
        "To repeat these choices press 9. " +
        "To cancel press pound.";
      playPrompt(gather, req, "purchase_pre_menu.mp3", menuText);
    } catch (err) {
      console.error("[voice] /voice/purchase-pre-menu settings error:", err);
      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-purchase-pre-menu" });
      playPrompt(gather, req, "package_load_error.mp3", "We're having trouble loading package information. To return to the main menu press 9. To cancel press pound.");
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
    if (!MAILBOX_ENABLED) {
      twiml.redirect("/voice/main-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-mailbox-menu" });
    playPrompt(gather, req, "mailbox_menu.mp3",
      "To go to your mailbox press one. " +
      "To record a new mailbox ad press two. " +
      "To listen to ads from other guys press three. " +
      "To repeat these choices press nine. " +
      "To exit to the main menu press pound."
    );
    twiml.redirect("/voice/mailbox-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-mailbox-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const fromNumber = req.body?.From as string;

    try {
      if (digit === "1" || digit === "2" || digit === "3") {
        const returnTo = digit === "1" ? "mailbox" : digit === "2" ? "record" : "listen";
        const user = await getOrCreateUser(fromNumber);
        const mailbox = await storage.getMailboxByUserId(user.id);

        // If mailbox doesn't exist or setup is explicitly marked incomplete, run setup
        if (!mailbox || mailbox.setupComplete === false) {
          twiml.redirect(`/voice/setup-mailbox?returnTo=${returnTo}`);
        } else if (digit === "1") {
          twiml.redirect("/voice/my-mailbox");
        } else if (digit === "2") {
          twiml.redirect("/voice/ad-category-menu?mode=record");
        } else {
          twiml.redirect("/voice/ad-category-menu?mode=listen");
        }
      } else if (digit === "9") {
        twiml.redirect("/voice/mailbox-menu");
      } else if (digit === "#") {
        twiml.redirect("/voice/main-menu");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/mailbox-menu");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-mailbox-menu error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Step 1 — Intro + Date of Birth ───────────────────────
  app.post("/voice/setup-mailbox", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const returnTo = (req.query.returnTo as string) || "mailbox";

    // Initialise or reset setup state for this call
    mailboxSetupState.set(callSid, { returnTo });

    const gather = twiml.gather({ numDigits: 8, finishOnKey: "", action: "/voice/handle-setup-mailbox-dob", timeout: 20 });
    playPrompt(gather, req, "mailbox_setup_intro.mp3",
      "You need to first set up your mailbox. " +
      "To set up your mailbox we need to gather a couple of things from you which helps callers search for the perfect guy and help them find your ads. " +
      "First we need to know your date of birth. " +
      "Please enter your date of birth in this order: " +
      "two digits for the month, two digits for the day, and four digits for the year. " +
      "For example, for April 17 1976, enter zero four one seven one nine seven six."
    );
    twiml.redirect("/voice/mailbox-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle DOB ────────────────────────────────────────────
  app.post("/voice/handle-setup-mailbox-dob", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const digits = (req.body?.Digits as string) ?? "";
    const returnTo = (req.query.returnTo as string) || mailboxSetupState.get(callSid)?.returnTo || "mailbox";

    if (digits.length !== 8 || !/^\d{8}$/.test(digits)) {
      playPrompt(twiml, req, "mailbox_setup_dob_invalid.mp3", "We did not receive a valid date of birth. Please try again.");
      twiml.redirect(`/voice/setup-mailbox?returnTo=${returnTo}`);
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const mm = parseInt(digits.substring(0, 2), 10);
    const dd = parseInt(digits.substring(2, 4), 10);
    const yyyy = parseInt(digits.substring(4, 8), 10);

    // Basic date validity check
    const birthDate = new Date(yyyy, mm - 1, dd);
    if (
      isNaN(birthDate.getTime()) ||
      birthDate.getFullYear() !== yyyy ||
      birthDate.getMonth() !== mm - 1 ||
      birthDate.getDate() !== dd ||
      mm < 1 || mm > 12 ||
      dd < 1 || dd > 31
    ) {
      playPrompt(twiml, req, "mailbox_setup_dob_invalid.mp3", "We did not receive a valid date of birth. Please try again.");
      twiml.redirect(`/voice/setup-mailbox?returnTo=${returnTo}`);
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Age check — must be 18 or older
    const today = new Date();
    let age = today.getFullYear() - yyyy;
    const monthDiff = today.getMonth() - (mm - 1);
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dd)) age--;

    if (age < 18) {
      playPrompt(twiml, req, "mailbox_setup_underage.mp3",
        "We are sorry, but you must be 18 years of age or older to use this service. Goodbye."
      );
      twiml.hangup();
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Save DOB to setup state
    const state = mailboxSetupState.get(callSid) || { returnTo };
    state.dob = digits;
    mailboxSetupState.set(callSid, state);

    twiml.redirect(`/voice/setup-mailbox-bodytype?returnTo=${returnTo}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Step 2 — Body Type ───────────────────────────────────
  app.post("/voice/setup-mailbox-bodytype", async (req, res) => {
    const twiml = new VoiceResponse();
    const returnTo = (req.query.returnTo as string) || "mailbox";

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: `/voice/handle-setup-mailbox-bodytype?returnTo=${returnTo}` });
    playPrompt(gather, req, "mailbox_setup_bodytype.mp3",
      "Now please select your body type. " +
      "For Slim press one. " +
      "For Average press two. " +
      "For Athletic press three. " +
      "For Large press four. " +
      "For Big and Tall press five. " +
      "To repeat these choices press nine. " +
      "To exit press pound."
    );
    twiml.redirect(`/voice/setup-mailbox-bodytype?returnTo=${returnTo}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle Body Type ─────────────────────────────────────
  app.post("/voice/handle-setup-mailbox-bodytype", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const digit = req.body?.Digits as string;
    const returnTo = (req.query.returnTo as string) || "mailbox";

    const digitToBodyType: Record<string, string> = {
      "1": "slim", "2": "average", "3": "athletic", "4": "large", "5": "big_and_tall",
    };

    if (digitToBodyType[digit]) {
      const bodyType = digitToBodyType[digit];
      const state = mailboxSetupState.get(callSid) || { returnTo };
      state.bodyType = bodyType;
      mailboxSetupState.set(callSid, state);
      twiml.redirect(`/voice/setup-mailbox-ethnicity?returnTo=${returnTo}`);
    } else if (digit === "9") {
      twiml.redirect(`/voice/setup-mailbox-bodytype?returnTo=${returnTo}`);
    } else if (digit === "#") {
      mailboxSetupState.delete(callSid);
      playPrompt(twiml, req, "mailbox_setup_cancelled.mp3", "Mailbox setup cancelled.");
      twiml.redirect("/voice/mailbox-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect(`/voice/setup-mailbox-bodytype?returnTo=${returnTo}`);
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Step 3 — Ethnicity ───────────────────────────────────
  app.post("/voice/setup-mailbox-ethnicity", async (req, res) => {
    const twiml = new VoiceResponse();
    const returnTo = (req.query.returnTo as string) || "mailbox";

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: `/voice/handle-setup-mailbox-ethnicity?returnTo=${returnTo}` });
    playPrompt(gather, req, "mailbox_setup_ethnicity.mp3",
      "Now please tell us your ethnicity. " +
      "If you don't want to identify your ethnicity press one. " +
      "If you're Caucasian press two. " +
      "African-American press three. " +
      "Asian press four. " +
      "Latino press five. " +
      "Middle Eastern press six. " +
      "Aboriginal press seven. " +
      "To repeat these choices press nine. " +
      "To exit press pound."
    );
    twiml.redirect(`/voice/setup-mailbox-ethnicity?returnTo=${returnTo}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle Ethnicity ─────────────────────────────────────
  app.post("/voice/handle-setup-mailbox-ethnicity", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const digit = req.body?.Digits as string;
    const returnTo = (req.query.returnTo as string) || "mailbox";

    const digitToEthnicity: Record<string, string> = {
      "1": "prefer_not_to_say", "2": "caucasian", "3": "african_american",
      "4": "asian", "5": "latino", "6": "middle_eastern", "7": "aboriginal",
    };

    if (digitToEthnicity[digit]) {
      const ethnicity = digitToEthnicity[digit];
      const state = mailboxSetupState.get(callSid) || { returnTo };
      state.ethnicity = ethnicity;
      mailboxSetupState.set(callSid, state);
      twiml.redirect(`/voice/setup-mailbox-ethnicity-confirm?returnTo=${returnTo}`);
    } else if (digit === "9") {
      twiml.redirect(`/voice/setup-mailbox-ethnicity?returnTo=${returnTo}`);
    } else if (digit === "#") {
      mailboxSetupState.delete(callSid);
      playPrompt(twiml, req, "mailbox_setup_cancelled.mp3", "Mailbox setup cancelled.");
      twiml.redirect("/voice/mailbox-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect(`/voice/setup-mailbox-ethnicity?returnTo=${returnTo}`);
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Ethnicity Confirmation ────────────────────────────────
  app.post("/voice/setup-mailbox-ethnicity-confirm", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const returnTo = (req.query.returnTo as string) || "mailbox";
    const state = mailboxSetupState.get(callSid);
    const ethnicity = state?.ethnicity || "prefer_not_to_say";
    const ethnicityLabel = ETHNICITY_LABELS[ethnicity] || ethnicity;

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: `/voice/handle-setup-mailbox-ethnicity-confirm?returnTo=${returnTo}` });
    playPrompt(gather, req, "mailbox_setup_ethnicity_confirm.mp3",
      `You selected ${ethnicityLabel}. ` +
      "If this is correct press one. " +
      "To select your ethnicity press two. " +
      "If you don't want to identify your ethnicity press three."
    );
    twiml.redirect(`/voice/setup-mailbox-ethnicity?returnTo=${returnTo}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle Ethnicity Confirmation ────────────────────────
  app.post("/voice/handle-setup-mailbox-ethnicity-confirm", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const digit = req.body?.Digits as string;
    const returnTo = (req.query.returnTo as string) || "mailbox";

    if (digit === "1") {
      // Confirmed — proceed to ready-to-write menu
      twiml.redirect(`/voice/setup-mailbox-ready?returnTo=${returnTo}`);
    } else if (digit === "2") {
      // Re-select ethnicity
      twiml.redirect(`/voice/setup-mailbox-ethnicity?returnTo=${returnTo}`);
    } else if (digit === "3") {
      // Prefer not to identify — update state and proceed
      const state = mailboxSetupState.get(callSid) || { returnTo };
      state.ethnicity = "prefer_not_to_say";
      mailboxSetupState.set(callSid, state);
      twiml.redirect(`/voice/setup-mailbox-ready?returnTo=${returnTo}`);
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect(`/voice/setup-mailbox-ethnicity-confirm?returnTo=${returnTo}`);
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Step 4 — Ready to Write ──────────────────────────────
  app.post("/voice/setup-mailbox-ready", async (req, res) => {
    const twiml = new VoiceResponse();
    const returnTo = (req.query.returnTo as string) || "mailbox";

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: `/voice/handle-setup-mailbox-ready?returnTo=${returnTo}`, timeout: 30 });
    playPrompt(gather, req, "mailbox_setup_ready.mp3",
      "Please get something ready to write down your new mailbox number and passcode. " +
      "This is the only chance you will have to write them down. " +
      "And don't get them confused with your membership number — we issue separate numbers for memberships. " +
      "If you're ready to write down your mailbox number and passcode press one. " +
      "To pause the system while you get a pen and paper press two. " +
      "To repeat these choices press nine. " +
      "To cancel setting up your mailbox press the pound key."
    );
    twiml.redirect(`/voice/setup-mailbox-ready?returnTo=${returnTo}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle Ready to Write ────────────────────────────────
  app.post("/voice/handle-setup-mailbox-ready", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const digit = req.body?.Digits as string;
    const fromNumber = req.body?.From as string;
    const returnTo = (req.query.returnTo as string) || "mailbox";

    try {
      if (digit === "1") {
        // Ready — create the mailbox and reveal the number
        const user = await getOrCreateUser(fromNumber);
        const mailbox = await storage.createMailboxForSetup(user.id);
        const state = mailboxSetupState.get(callSid) || { returnTo };
        // Save profile fields collected so far
        await storage.updateMailboxProfile(user.id, {
          dateOfBirth: state.dob,
          bodyType: state.bodyType,
          ethnicity: state.ethnicity,
        });
        twiml.redirect(`/voice/setup-mailbox-reveal?returnTo=${returnTo}`);
      } else if (digit === "2") {
        // Pause — loop back with a short pause
        twiml.pause({ length: 5 });
        twiml.redirect(`/voice/setup-mailbox-ready?returnTo=${returnTo}`);
      } else if (digit === "9") {
        twiml.redirect(`/voice/setup-mailbox-ready?returnTo=${returnTo}`);
      } else if (digit === "#") {
        mailboxSetupState.delete(callSid);
        playPrompt(twiml, req, "mailbox_setup_cancelled.mp3", "Mailbox setup cancelled.");
        twiml.redirect("/voice/mailbox-menu");
      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect(`/voice/setup-mailbox-ready?returnTo=${returnTo}`);
      }
    } catch (err) {
      console.error("[voice] /voice/handle-setup-mailbox-ready error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Step 5 — Reveal Mailbox Number ───────────────────────
  app.post("/voice/setup-mailbox-reveal", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const returnTo = (req.query.returnTo as string) || "mailbox";

    try {
      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);

      if (!mailbox) {
        twiml.redirect("/voice/mailbox-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const numSpoken = mailbox.mailboxNumber.split("").join(", ");
      twiml.say(`Your mailbox number is ${numSpoken}. Again, your mailbox number is ${numSpoken}.`);

      if (user.membershipPin) {
        // Already has a passcode — tell them it's shared
        const gather = twiml.gather({ numDigits: 1, finishOnKey: "#", action: `/voice/handle-setup-mailbox-passcode-existing?returnTo=${returnTo}`, timeout: 15 });
        playPrompt(gather, req, "mailbox_setup_existing_passcode.mp3",
          "Your mailbox passcode is the same as your membership passcode. " +
          "If you do not remember your passcode and would like to create a new one, press pound."
        );
        // Timeout or any digit other than # → complete setup
        twiml.redirect(`/voice/setup-mailbox-complete?returnTo=${returnTo}`);
      } else {
        // No passcode yet — go to create passcode
        twiml.redirect(`/voice/setup-mailbox-create-passcode?returnTo=${returnTo}`);
      }
    } catch (err) {
      console.error("[voice] /voice/setup-mailbox-reveal error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle Existing Passcode Choice ─────────────────────
  app.post("/voice/handle-setup-mailbox-passcode-existing", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;
    const digit = req.body?.Digits as string;
    const returnTo = (req.query.returnTo as string) || "mailbox";

    try {
      if (digit === "#") {
        // Create a new passcode — clear existing PIN so setup flow works
        const user = await getOrCreateUser(fromNumber);
        await storage.updateUserMembership(user.id, { membershipPin: null });
        twiml.redirect(`/voice/setup-mailbox-create-passcode?returnTo=${returnTo}`);
      } else {
        // Keep existing passcode — mark setup complete
        const user = await getOrCreateUser(fromNumber);
        await storage.updateMailboxProfile(user.id, { setupComplete: true });
        mailboxSetupState.delete(callSid);
        twiml.redirect(`/voice/setup-mailbox-complete?returnTo=${returnTo}`);
      }
    } catch (err) {
      console.error("[voice] /voice/handle-setup-mailbox-passcode-existing error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Create Passcode ──────────────────────────────────────
  app.post("/voice/setup-mailbox-create-passcode", async (req, res) => {
    const twiml = new VoiceResponse();
    const returnTo = (req.query.returnTo as string) || "mailbox";

    const gather = twiml.gather({ numDigits: 4, finishOnKey: "", action: `/voice/handle-setup-mailbox-create-passcode?returnTo=${returnTo}`, timeout: 15 });
    playPrompt(gather, req, "mailbox_setup_create_passcode.mp3",
      "For security you need a passcode. " +
      "Please enter a four digit passcode now. " +
      "If you make a mistake press star to start over."
    );
    twiml.redirect(`/voice/setup-mailbox-create-passcode?returnTo=${returnTo}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle First Passcode Entry ──────────────────────────
  app.post("/voice/handle-setup-mailbox-create-passcode", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const digits = (req.body?.Digits as string) ?? "";
    const returnTo = (req.query.returnTo as string) || "mailbox";

    if (digits === "*" || digits.length !== 4 || !/^\d{4}$/.test(digits)) {
      playPrompt(twiml, req, "invalid_choice.mp3", "Please enter a four digit passcode.");
      twiml.redirect(`/voice/setup-mailbox-create-passcode?returnTo=${returnTo}`);
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Store first entry
    const state = mailboxSetupState.get(callSid) || { returnTo };
    state.passcode1 = digits;
    mailboxSetupState.set(callSid, state);

    // Ask to re-enter
    const gather = twiml.gather({ numDigits: 4, finishOnKey: "", action: `/voice/handle-setup-mailbox-confirm-passcode?returnTo=${returnTo}`, timeout: 15 });
    playPrompt(gather, req, "mailbox_setup_passcode_reenter.mp3", "Please re-enter your four digit passcode.");
    twiml.redirect(`/voice/setup-mailbox-create-passcode?returnTo=${returnTo}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle Passcode Confirmation ─────────────────────────
  app.post("/voice/handle-setup-mailbox-confirm-passcode", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;
    const digits = (req.body?.Digits as string) ?? "";
    const returnTo = (req.query.returnTo as string) || "mailbox";

    try {
      const state = mailboxSetupState.get(callSid);
      const passcode1 = state?.passcode1;

      if (!passcode1) {
        twiml.redirect(`/voice/setup-mailbox-create-passcode?returnTo=${returnTo}`);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      if (digits !== passcode1) {
        // Mismatch — clear stored passcode and retry
        if (state) { state.passcode1 = undefined; mailboxSetupState.set(callSid, state); }
        playPrompt(twiml, req, "mailbox_setup_passcode_mismatch.mp3",
          "Your passcode entries did not match. Please try again."
        );
        twiml.redirect(`/voice/setup-mailbox-create-passcode?returnTo=${returnTo}`);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // Passcodes match — save as membershipPin and mark setup complete
      const user = await getOrCreateUser(fromNumber);
      await storage.updateUserMembership(user.id, { membershipPin: digits });
      await storage.updateMailboxProfile(user.id, { setupComplete: true });
      mailboxSetupState.delete(callSid);

      twiml.redirect(`/voice/setup-mailbox-complete?returnTo=${returnTo}`);
    } catch (err) {
      console.error("[voice] /voice/handle-setup-mailbox-confirm-passcode error:", err);
      twiml.redirect("/voice/mailbox-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Complete Menu ────────────────────────────────────────
  app.post("/voice/setup-mailbox-complete", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-setup-mailbox-complete" });
    playPrompt(gather, req, "mailbox_setup_complete.mp3",
      "Your mailbox is now set up. " +
      "To begin recording a new ad press one. " +
      "To listen to ads from other guys press two. " +
      "To return to the main menu press pound."
    );
    twiml.redirect("/voice/mailbox-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Mailbox Setup: Handle Complete Menu ─────────────────────────────────
  app.post("/voice/handle-setup-mailbox-complete", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;

    if (digit === "1") {
      twiml.redirect("/voice/ad-category-menu?mode=record");
    } else if (digit === "2") {
      twiml.redirect("/voice/ad-category-menu?mode=listen");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/setup-mailbox-complete");
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

      // ── Personal-ad recording rejection gate ─────────────────────────────
      if (user.recordingRejectionReason && user.recordingRejectionType === "personal_ad") {
        const rejectionRoute = user.recordingRejectionReason === "phone_number"
          ? "/voice/recording-rejected-phone-number"
          : "/voice/recording-rejected-unclear";
        twiml.redirect(rejectionRoute);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const mailbox = await storage.getMailboxByUserId(user.id);

      // Stamp last-checked so the cleanup script knows the mailbox is still active
      await storage.touchMailboxLastChecked(user.id);

      const unreadMessage = await storage.getUnreadMessage(user.id);

      if (unreadMessage) {
        // In per-minute billing, start the deduction clock while the caller listens to messages.
        // In per-day, per_24h billing or free mode, time is not deducted per-call, so skip starting the billing checkpoint.
        const mailboxSettings = await getMembershipSettingsCached();
        if (mailboxSettings.billingMode !== "per_day" && mailboxSettings.billingMode !== "per_24h" && !mailboxSettings.freeMode) {
          startBilling(callSid, fromNumber);
        }
        const senderProfile = await storage.getProfile(unreadMessage.fromUserId);
        const msgGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-mailbox-message?msgId=${unreadMessage.id}&senderId=${unreadMessage.fromUserId}`,
          timeout: 10,
        });
        if (senderProfile?.nameRecordingUrl) {
          playPrompt(msgGather, req, "vm_new_message.mp3", "New message.");
          safePlayRecording(msgGather, senderProfile.nameRecordingUrl, req, "");
          playPrompt(msgGather, req, "has_sent_you_a_message.mp3", "has sent you a message.");
        } else {
          playPrompt(msgGather, req, "you_have_new_message.mp3", "You have a new message.");
        }
        safePlayRecording(msgGather, unreadMessage.recordingUrl, req, "Message audio is not available.");
        playPrompt(msgGather, req, "mailbox_message_options.mp3",
          "Press 1 to reply. Press 2 to hear the sender's ad. Press 3 to skip this message. Press 9 to return to the mailbox menu.");
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
          playPrompt(twiml, req, "mailbox_no_greeting.mp3", "You have not recorded a mailbox greeting yet.");
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
        playPrompt(gather, req, "mailbox_has_greeting.mp3",
          "You already have a mailbox greeting recorded. " +
          "Press 1 to record a new greeting. " +
          "Press 2 to hear your current greeting. " +
          "Press 9 to return to your mailbox."
        );
        twiml.redirect("/voice/my-mailbox");
      } else {
        playPrompt(twiml, req, "mailbox_record_greeting.mp3", "Record your mailbox greeting after the tone. Press any key when done.");
        twiml.record({ maxLength: 90, playBeep: true, action: "/voice/save-mailbox-greeting" } as any);
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
        playPrompt(twiml, req, "mailbox_record_greeting.mp3", "Record your mailbox greeting after the tone. Press any key when done.");
        twiml.record({ maxLength: 90, playBeep: true, action: "/voice/save-mailbox-greeting" } as any);
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
      const rawRecordingUrl = req.body?.RecordingUrl as string;
      const recordingDuration = parseInt(req.body?.RecordingDuration) || 0;

      if (!rawRecordingUrl || recordingDuration < 3) {
        playPrompt(twiml, req, "greeting_error.mp3", "That recording was too short. Please try again after the tone. Press any key when done.");
        twiml.record({ maxLength: 90, playBeep: true, action: "/voice/save-mailbox-greeting" } as any);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const recordingUrl = await downloadRecording(rawRecordingUrl);
      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);
      // Delete old local file if the caller is re-recording their mailbox greeting
      deleteLocalRecording(mailbox?.adRecordingUrl);
      // Keep the existing category if set, otherwise use a default
      const category = mailbox?.category || "quick_hot_talk";
      await storage.updateMailboxAd(user.id, category, recordingUrl, recordingDuration);
      // Clear any previous recording rejection — this new recording will go through auto-mod again
      await storage.clearUserRecordingRejection(user.id);
      // Mark transcription as pending, then transcribe locally via Groq Whisper (async, non-blocking)
      await storage.updateMailboxTranscription(recordingUrl, null, "pending");
      transcribeLocalFile(recordingUrl).then(async ({ text, status }) => {
        const storeStatus = status === "silent" ? "completed" : status;
        await storage.updateMailboxTranscription(recordingUrl, text, storeStatus);
        console.log(`[transcribe] Mailbox ad stored for userId=${user.id}: status=${storeStatus}`);
      }).catch(err => console.error("[transcribe] save-mailbox-greeting error:", err));

      // Schedule auto-mod + human review queue after 65 seconds
      scheduleAutoModCheck(recordingUrl, user.id, "personal_ad");

      playPrompt(twiml, req, "mailbox_greeting_saved.mp3", "Your mailbox greeting has been saved. Callers who enter your mailbox number will now hear this greeting.");
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
        playPrompt(twiml, req, "record_reply.mp3", "Record your reply after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}&returnTo=mailbox` });
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
          playPrompt(profileGather, req, "caller_no_mailbox_ad.mp3", "This caller no longer has a mailbox ad.");
        }
        playPrompt(profileGather, req, "mailbox_send_or_return.mp3", "Press 1 to send a message. Press 9 to return to your mailbox.");
        twiml.redirect("/voice/my-mailbox");
      } else if (digit === "3") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/my-mailbox");
      } else if (digit === "9") {
        // Exiting the mailbox messages area — in per-minute billing notify caller deductions have stopped.
        // In per-day, per_24h billing or free mode, time is not deducted per-call, so skip the announcement.
        const mailboxExitSettings = await getMembershipSettingsCached();
        if (mailboxExitSettings.billingMode !== "per_day" && mailboxExitSettings.billingMode !== "per_24h" && !mailboxExitSettings.freeMode) {
          playPrompt(twiml, req, "time_deduction_stop.mp3",
            "Time is no longer being deducted from your membership.");
        }
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
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}&returnTo=mailbox` });
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
  // page query param: "1" | "2"  (defaults to "1")
  app.post("/voice/ad-category-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const mode = (req.query.mode as string) || "listen";
    const page = (req.query.page as string) || "1";
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: `/voice/handle-ad-category?mode=${mode}&page=${page}` });

    if (page === "2") {
      playPrompt(gather, req, "ad_category_menu_p2.mp3",
        "More categories. " +
        "For Cock Suckers press one. " +
        "For Hung Cocks press two. " +
        "For Uncut Cocks press three. " +
        "For Twinks press four. " +
        "For Bears press five. " +
        "For Daddys press six. " +
        "To look up a specific mailbox press seven. " +
        "For definitions press nine. " +
        "To go back to the previous categories press pound."
      );
    } else {
      playPrompt(gather, req, "ad_category_menu.mp3",
        "Please select a category. " +
        "For Quick and Hot Talk press one. " +
        "For Bicurious press two. " +
        "For Kink press three. " +
        "For Total Tops press four. " +
        "For Strictly Bottoms press five. " +
        "For Trans press six. " +
        "To look up a specific mailbox press seven. " +
        "For more categories press eight. " +
        "For definitions press nine. " +
        "To return to the mailbox menu press pound."
      );
    }

    twiml.redirect(`/voice/ad-category-menu?mode=${mode}&page=${page}`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-ad-category", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const mode = (req.query.mode as string) || "listen";
    const page = (req.query.page as string) || "1";

    const categoryMap = page === "2" ? DIGIT_TO_CATEGORY_PAGE2 : DIGIT_TO_CATEGORY_PAGE1;
    const category = categoryMap[digit];

    if (category) {
      if (mode === "record") {
        twiml.redirect(`/voice/record-category-ad?category=${category}`);
      } else {
        twiml.redirect(`/voice/browse-category-ads?category=${category}`);
      }
    } else if (digit === "7") {
      twiml.redirect(`/voice/mailbox-lookup?mode=${mode}`);
    } else if (digit === "8" && page === "1") {
      // Page 2 of categories
      twiml.redirect(`/voice/ad-category-menu?mode=${mode}&page=2`);
    } else if (digit === "9") {
      twiml.redirect(`/voice/ad-category-definitions?mode=${mode}`);
    } else if (digit === "#") {
      if (page === "2") {
        twiml.redirect(`/voice/ad-category-menu?mode=${mode}&page=1`);
      } else {
        twiml.redirect("/voice/mailbox-menu");
      }
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect(`/voice/ad-category-menu?mode=${mode}&page=${page}`);
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
          queue: ads
            .filter(m => !!m.adRecordingUrl)
            .map(m => ({ userId: m.userId, mailboxNumber: m.mailboxNumber, adRecordingUrl: m.adRecordingUrl! })),
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
      playPrompt(adGather, req, "category_ad_options.mp3",
        "Press 1 to send a message to this guy. Press 2 to hear the next ad. Press 9 to return to the category menu. Press pound to return to the mailbox menu.");
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
        playPrompt(twiml, req, "record_message.mp3", "Record your message for this guy after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${toUserId}&returnTo=category&category=${category}` });
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
    const gather = twiml.gather({ numDigits: 5, finishOnKey: "#", action: `/voice/handle-mailbox-lookup?mode=${mode}`, timeout: 15 });
    playPrompt(gather, req, "mailbox_lookup.mp3",
      "Enter the five digit mailbox number you'd like to look up, followed by pound. Or press pound alone to return to the mailbox menu."
    );
    twiml.redirect(`/voice/mailbox-menu`);
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-mailbox-lookup", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = req.body?.Digits as string;
    const mode = (req.query.mode as string) || "listen";

    try {
      // Empty digits means caller pressed # alone — return to mailbox menu
      if (!digits || digits.length === 0) {
        twiml.redirect("/voice/mailbox-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      if (digits.length !== 5) {
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
        playPrompt(twiml, req, "record_message.mp3", "Record your message for this guy after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${toUserId}&returnTo=mailbox` });
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
      "Total Tops: guys who are exclusively tops and looking for a bottom. " +
      "Strictly Bottoms: guys who are exclusively bottoms and looking for a top. " +
      "Trans: trans men and women connecting with other callers. " +
      "Cock Suckers: guys who love giving oral and want to connect with like-minded men. " +
      "Hung Cocks: well-endowed guys and the men who want them. " +
      "Uncut Cocks: uncircumcised guys and the men who seek them out. " +
      "Twinks: younger slender guys and the men who are into them. " +
      "Bears: bigger, hairier guys and those who are into the bear scene. " +
      "Daddys: older, mature men and younger guys looking for that connection. " +
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
          `Record your ${categoryLabel} mailbox ad after the tone. Tell guys about yourself. Press any key when done.`
        );
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-category-ad?category=${category}` } as any);
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
          "Record your mailbox ad after the tone. Press any key when done."
        );
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-category-ad?category=${category}` } as any);
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
      const rawRecordingUrl = req.body?.RecordingUrl as string;
      const recordingDuration = parseInt(req.body?.RecordingDuration) || 0;
      const category = req.query.category as string;
      const categoryLabel = MAILBOX_CATEGORIES[category] || category;

      if (!rawRecordingUrl || recordingDuration < 3) {
        playPrompt(twiml, req, "greeting_error.mp3", "That recording was too short. Please try again after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-category-ad?category=${category}` } as any);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const recordingUrl = await downloadRecording(rawRecordingUrl);
      const user = await getOrCreateUser(fromNumber);
      // Delete old local file if the caller is re-recording their category ad
      const existingMailbox = await storage.getMailboxByUserId(user.id);
      deleteLocalRecording(existingMailbox?.adRecordingUrl);
      await storage.updateMailboxAd(user.id, category, recordingUrl, recordingDuration);
      // Clear any previous recording rejection — this new recording will go through auto-mod again
      await storage.clearUserRecordingRejection(user.id);
      // Mark transcription as pending, then transcribe locally via Groq Whisper (async, non-blocking)
      await storage.updateMailboxTranscription(recordingUrl, null, "pending");
      transcribeLocalFile(recordingUrl).then(async ({ text, status }) => {
        const storeStatus = status === "silent" ? "completed" : status;
        await storage.updateMailboxTranscription(recordingUrl, text, storeStatus);
        console.log(`[transcribe] Mailbox ad stored for userId=${user.id}: status=${storeStatus}`);
      }).catch(err => console.error("[transcribe] save-mailbox-greeting error:", err));

      // Schedule auto-mod + human review queue after 65 seconds
      scheduleAutoModCheck(recordingUrl, user.id, "personal_ad");

      playPrompt(twiml, req, "mailbox_ad_recorded_pending.mp3",
        "Thanks for recording your ad. Once it's approved, you'll be able to send messages to other mailboxes. " +
        "In the meantime you can browse other ads or visit the male box to check out who's on the line right now."
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

  // ─── Twilio Transcription Callback ───────────────────────────────────────
  // Twilio posts here asynchronously after transcribing a <Record> recording.
  app.post("/voice/transcription-callback", async (req, res) => {
    const status = (req.body?.TranscriptionStatus as string) || "";
    const text = (req.body?.TranscriptionText as string) || null;
    const twilioRecordingUrl = (req.body?.RecordingUrl as string) || "";
    // Twilio posts back the original Twilio URL; we store local paths — convert for DB lookup
    const recordingUrl = twilioUrlToLocalPath(twilioRecordingUrl) || twilioRecordingUrl;

    console.log(`[transcription] callback: status=${status} recordingUrl=${recordingUrl}`);

    if (!recordingUrl) {
      return res.sendStatus(200);
    }

    try {
      // Try to match to a profile first, then a mailbox
      await storage.updateProfileTranscription(recordingUrl, status === "completed" ? text : null, status === "completed" ? "completed" : "failed");
      await storage.updateMailboxTranscription(recordingUrl, status === "completed" ? text : null, status === "completed" ? "completed" : "failed");
      console.log(`[transcription] stored for recordingUrl=${recordingUrl} status=${status}`);

      // Auto-mod and human review queue are handled by the 65-second timer in save-profile
      // and save-mailbox-greeting (via scheduleAutoModCheck). The transcription callback
      // only needs to store the text so the timer can pick it up.
    } catch (err) {
      console.error("[transcription] callback error:", err);
    }

    res.sendStatus(200);
  });

  // ─── Auto-Mod Recording Rejection Menus ──────────────────────────────────
  // reject1 — played when the recording could not be understood (no audio,
  //           too few words, or repeated words like "hey hey hey boys").
  app.post("/voice/recording-rejected-unclear", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    try {
      const user = await storage.getUserByPhone(fromNumber);
      const typeLabel = user?.recordingRejectionType === "personal_ad" ? "personal ad" : "greeting";

      const gather = twiml.gather({
        numDigits: 1,
        finishOnKey: "",
        action: "/voice/handle-recording-rejected-unclear",
        timeout: 15,
      });
      gather.say(
        `You need to re-record your ${typeLabel} because we can't understand it. ` +
        `Please speak clearly into the phone so that everyone can hear what you have to say about yourself and what you're looking for. ` +
        `Be sure to turn down loud music or the television before you record. ` +
        `To re-record your ${typeLabel}, press 1.`
      );
      twiml.redirect("/voice/recording-rejected-unclear");
    } catch (err) {
      console.error("[voice] /voice/recording-rejected-unclear error:", err);
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-recording-rejected-unclear", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const digit = req.body?.Digits as string;

    try {
      if (digit === "1") {
        const user = await storage.getUserByPhone(fromNumber);
        const rejectionType = user?.recordingRejectionType;

        // Clear the rejection flag before sending to re-record
        if (user) await storage.clearUserRecordingRejection(user.id);

        if (rejectionType === "personal_ad") {
          twiml.redirect("/voice/record-mailbox-greeting");
        } else {
          // Greeting re-record: start at the name-recording step
          playPrompt(twiml, req, "welcome_record_name.mp3",
            "Say your first name only after the tone. You have 5 seconds."
          );
          twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
        }
      } else {
        twiml.redirect("/voice/recording-rejected-unclear");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-recording-rejected-unclear error:", err);
      twiml.redirect("/voice/recording-rejected-unclear");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // reject2 — played when the recording contains a phone number.
  app.post("/voice/recording-rejected-phone-number", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    try {
      const user = await storage.getUserByPhone(fromNumber);
      const typeLabel = user?.recordingRejectionType === "personal_ad" ? "personal ad" : "greeting";

      const gather = twiml.gather({
        numDigits: 1,
        finishOnKey: "",
        action: "/voice/handle-recording-rejected-phone-number",
        timeout: 15,
      });
      gather.say(
        `You need to re-record your ${typeLabel}. ` +
        `Please do not include your phone number in your ${typeLabel} or it will not be approved. ` +
        `To re-record your ${typeLabel}, press 1.`
      );
      twiml.redirect("/voice/recording-rejected-phone-number");
    } catch (err) {
      console.error("[voice] /voice/recording-rejected-phone-number error:", err);
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-recording-rejected-phone-number", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const digit = req.body?.Digits as string;

    try {
      if (digit === "1") {
        const user = await storage.getUserByPhone(fromNumber);
        const rejectionType = user?.recordingRejectionType;

        // Clear the rejection flag before sending to re-record
        if (user) await storage.clearUserRecordingRejection(user.id);

        if (rejectionType === "personal_ad") {
          twiml.redirect("/voice/record-mailbox-greeting");
        } else {
          // Greeting re-record
          playPrompt(twiml, req, "welcome_record_name.mp3",
            "Say your first name only after the tone. You have 5 seconds."
          );
          twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
        }
      } else {
        twiml.redirect("/voice/recording-rejected-phone-number");
      }
    } catch (err) {
      console.error("[voice] /voice/handle-recording-rejected-phone-number error:", err);
      twiml.redirect("/voice/recording-rejected-phone-number");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a3. Manage Membership ───────────────────────────────────────────────
  app.post("/voice/manage-membership", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    try {
      const siteConf = await getSiteSettingsCached();
      const isMW = siteConf.siteCategory === "MW";

      const user = await getOrCreateUser(fromNumber);
      const tier = user.membershipTier ?? "none";
      const tierMsg = tier === "free_trial" ? "You are on a free trial." : tier !== "none" ? "You have an active membership." : "You do not have an active membership.";

      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-manage-membership" });
      if (tier === "free_trial") {
        playPrompt(gather, req, "manage_tier_free_trial.mp3", "You are on a free trial.");
      } else if (tier !== "none") {
        playPrompt(gather, req, "manage_tier_active.mp3", "You have an active membership.");
      } else {
        playPrompt(gather, req, "manage_tier_none.mp3", "You do not have an active membership.");
      }
      if (isMW) {
        playPrompt(gather, req, "manage_menu_mw.mp3", "To purchase a membership press 1. To unblock all callers press 3. To return to the main menu press 9.");
      } else {
        if (user.membershipPin) {
          playPrompt(gather, req, "manage_pin_set.mp3", "You have a PIN set.");
        } else {
          playPrompt(gather, req, "manage_pin_not_set.mp3", "You do not have a PIN set.");
        }
        playPrompt(gather, req, "manage_menu_mm.mp3", "To purchase a membership press 1. To set or change your access PIN press 2. To unblock all callers press 3. To return to the main menu press 9.");
      }
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
    const fromNumber = req.body?.From as string;

    const siteConf = await getSiteSettingsCached();
    const isMW = siteConf.siteCategory === "MW";

    if (digit === "1") {
      twiml.redirect("/voice/purchase-pre-menu");
    } else if (digit === "2" && !isMW) {
      twiml.redirect("/voice/set-pin");
    } else if (digit === "3") {
      twiml.redirect("/voice/unblock-all-confirm");
    } else if (digit === "9") {
      twiml.redirect("/voice/main-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/manage-membership");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Unblock All Callers ───────────────────────────────────────────────────
  app.post("/voice/unblock-all-confirm", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-unblock-all-confirm", timeout: 10 });
    playPrompt(gather, req, "unblock_confirm.mp3", "To confirm you want to unblock all callers, press 1. Press any other key to cancel and return to the previous menu.");
    twiml.redirect("/voice/manage-membership");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-unblock-all-confirm", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;
    const fromNumber = req.body?.From as string;

    if (digit === "1") {
      try {
        const user = await storage.getUserByPhone(fromNumber);
        if (user) {
          await storage.unblockAllByUser(user.id);
          console.log(`[voice] unblock-all: userId=${user.id} phone=${fromNumber}`);
        }
        playPrompt(twiml, req, "unblock_done.mp3", "All callers are unblocked.");
      } catch (err) {
        console.error("[voice] unblock-all error:", err);
        playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again.");
      }
    } else {
      playPrompt(twiml, req, "cancelled_returning.mp3", "Cancelled. Returning to the previous menu.");
    }

    twiml.redirect("/voice/manage-membership");
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
    playPrompt(gather, req, "pin_enter_new.mp3", "Please enter your new 4-digit PIN.");
    twiml.redirect("/voice/manage-membership");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-set-pin", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const callSid = req.body?.CallSid as string;

    if (digits.length !== 4 || !/^\d{4}$/.test(digits)) {
      playPrompt(twiml, req, "pin_invalid.mp3", "Invalid PIN. Please enter exactly 4 digits.");
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
    playPrompt(gather, req, "pin_confirm.mp3", "Please enter your PIN again to confirm.");
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
      playPrompt(twiml, req, "pin_mismatch.mp3", "The PINs did not match. Please try again.");
      twiml.redirect("/voice/set-pin");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      const user = await storage.getUserByPhone(fromNumber);
      if (user) {
        await storage.updateUserMembership(user.id, { membershipPin: pendingPin });
        console.log(`[voice] PIN set for userId=${user.id} phone=${fromNumber}`);
        playPrompt(twiml, req, "pin_set_success.mp3", "Your PIN has been set successfully. You can now use your membership number and PIN to call in from any phone.");
      } else {
        playPrompt(twiml, req, "account_not_found.mp3", "Could not find your account. Please try again.");
      }
    } catch (err) {
      console.error("[voice] PIN save error:", err);
      playPrompt(twiml, req, "pin_save_error.mp3", "An error occurred saving your PIN. Please try again.");
    }

    twiml.redirect("/voice/manage-membership");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4a4. Customer Service — Automated Membership & Billing Receptionist ────
  // All responses use Amazon Polly Matthew voice (en-US Standard) via Twilio TTS.
  // Helper: speak with Matthew voice on any TwiML node (Response or Gather)
  function dSay(parent: any, text: string): void {
    parent.say({ voice: "Polly.Matthew" }, text);
  }

  // Format seconds into a natural spoken string: "3 hours and 12 minutes"
  function formatTime(seconds: number): string {
    if (seconds <= 0) return "no time remaining";
    const totalMins = Math.floor(seconds / 60);
    const hrs  = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs > 0 && mins > 0) return `${hrs} hour${hrs !== 1 ? "s" : ""} and ${mins} minute${mins !== 1 ? "s" : ""} remaining`;
    if (hrs > 0) return `${hrs} hour${hrs !== 1 ? "s" : ""} remaining`;
    return `${mins} minute${mins !== 1 ? "s" : ""} remaining`;
  }

  // Entry point — greet the caller with a live account snapshot then show the menu
  app.post("/voice/customer-service", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    let snapshot = "";
    try {
      const user  = await getOrCreateUser(fromNumber);
      const remaining = user.remainingSeconds ?? 0;
      const tier = user.membershipTier === "free_trial" ? "a free trial"
        : user.membershipTier ? "a paid membership"
        : "no active membership";
      const statusLabel = user.accountStatus === "banned" ? "suspended"
        : user.accountStatus === "restricted" ? "restricted"
        : "active";
      snapshot = `Your account is ${statusLabel}. You are on ${tier} with ${formatTime(remaining)}.`;
    } catch {
      snapshot = "I was unable to retrieve your account at this time.";
    }

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-customer-service", timeout: 10 });
    playPrompt(gather, req, "cs_menu_intro.mp3", "Customer service.");
    if (snapshot) dSay(gather, snapshot);
    playPrompt(gather, req, "cs_menu_options.mp3", "Press 1 for your full account details. Press 2 to add time to your account. Press 3 for billing information. Press 4 to leave a message for our billing team. Press pound to return to the main menu.");
    twiml.redirect("/voice/customer-service");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-customer-service", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit  = req.body?.Digits as string;
    if      (digit === "1") twiml.redirect("/voice/cs-account-status");
    else if (digit === "2") twiml.redirect("/voice/purchase-pre-menu");
    else if (digit === "3") twiml.redirect("/voice/cs-billing-info");
    else if (digit === "4") twiml.redirect("/voice/cs-leave-message");
    else if (digit === "#") twiml.redirect("/voice/main-menu");
    else                    twiml.redirect("/voice/customer-service");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Full account details screen ──────────────────────────────────────────
  app.post("/voice/cs-account-status", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    try {
      const user    = await getOrCreateUser(fromNumber);
      const profile = await storage.getProfile(user.id);
      const remaining = user.remainingSeconds ?? 0;
      const tier = user.membershipTier === "free_trial" ? "Free trial"
        : user.membershipTier ? "Paid membership"
        : "No active membership";
      const statusLabel = user.accountStatus === "banned" ? "suspended"
        : user.accountStatus === "restricted" ? "restricted"
        : "active and in good standing";
      const cardLine = user.membershipNumber
        ? `Your membership card number is: ${user.membershipNumber.split("").join(", ")}.`
        : "";
      const memberSince = user.createdAt
        ? `Member since ${user.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
        : "";

      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-cs-account-status", timeout: 10 });
      playPrompt(gather, req, "cs_account_title.mp3", "Account details.");
      playPrompt(gather, req, "cs_account_label_status.mp3", "Status:");
      dSay(gather, `${statusLabel}.`);
      playPrompt(gather, req, "cs_account_label_membership.mp3", "Membership type:");
      dSay(gather, `${tier}.`);
      playPrompt(gather, req, "cs_account_label_time.mp3", "Time remaining:");
      dSay(gather, `${formatTime(remaining)}.`);
      if (profile?.recordingUrl) {
        playPrompt(gather, req, "cs_account_greeting_yes.mp3", "You have a greeting recorded.");
      } else {
        playPrompt(gather, req, "cs_account_greeting_no.mp3", "You do not have a greeting recorded yet. You must record a greeting before other callers can hear you.");
      }
      if (cardLine) dSay(gather, cardLine);
      if (memberSince) dSay(gather, memberSince);
      playPrompt(gather, req, "cs_account_options.mp3", "Press 2 to add more time. Press 9 to return to customer service. Press pound for the main menu.");
    } catch {
      const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-cs-account-status", timeout: 10 });
      playPrompt(gather, req, "cs_account_error.mp3", "We were unable to retrieve your account information at this time. Press 9 to return to customer service. Press pound for the main menu.");
    }
    twiml.redirect("/voice/customer-service");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-cs-account-status", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit  = req.body?.Digits as string;
    if      (digit === "2") twiml.redirect("/voice/purchase-pre-menu");
    else if (digit === "#") twiml.redirect("/voice/main-menu");
    else                    twiml.redirect("/voice/customer-service");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Billing information screen ───────────────────────────────────────────
  app.post("/voice/cs-billing-info", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;

    let planContext = "";
    try {
      const [user, settings] = await Promise.all([
        getOrCreateUser(fromNumber),
        getMembershipSettingsCached(),
      ]);
      if (user.membershipTier === "free_trial") {
        planContext = `You are currently on a free trial which includes ${settings.freeTrialMinutes} minutes of access. `;
      } else if (user.membershipTier) {
        planContext = "You are currently on a paid membership. ";
      } else {
        planContext = "You do not currently have an active membership. ";
      }
    } catch {}

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-cs-billing-info", timeout: 10 });
    playPrompt(gather, req, "cs_billing_title.mp3", "Billing information.");
    if (planContext) dSay(gather, planContext);
    playPrompt(gather, req, "cs_billing_static.mp3", "Time is deducted from your membership while you are connected to the system. You can add more time at any time by pressing 2 from the main menu. If you were recently charged and your time has not been applied, please leave a message for our billing team and we will investigate promptly.");
    playPrompt(gather, req, "cs_billing_options.mp3", "Press 2 to add time now. Press 4 to leave a message for the billing team. Press 9 to return to customer service. Press pound for the main menu.");
    twiml.redirect("/voice/customer-service");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-cs-billing-info", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit  = req.body?.Digits as string;
    if      (digit === "2") twiml.redirect("/voice/purchase-pre-menu");
    else if (digit === "4") twiml.redirect("/voice/cs-leave-message");
    else if (digit === "#") twiml.redirect("/voice/main-menu");
    else                    twiml.redirect("/voice/customer-service");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Leave a voicemail for the billing team ───────────────────────────────
  app.post("/voice/cs-leave-message", async (req, res) => {
    const twiml = new VoiceResponse();
    playPrompt(twiml, req, "cs_leave_message_prompt.mp3", "Please describe your billing question or issue after the tone. Press any key when you are done.");
    twiml.record({
      action: "/voice/cs-save-message",
      finishOnKey: "any",
      maxLength: 180,
      timeout: 5,
    });
    twiml.redirect("/voice/customer-service");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/cs-save-message", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber  = req.body?.From as string;
    const rawRecordingUrl = req.body?.RecordingUrl as string;
    if (rawRecordingUrl && fromNumber) {
      try {
        const recordingUrl = await downloadRecording(rawRecordingUrl);
        await storage.createSupportTicket({ fromPhone: fromNumber, recordingUrl });
      } catch (err) {
        console.error("[cs] Failed to save support ticket:", err);
      }
    }
    playPrompt(twiml, req, "cs_message_received.mp3", "Your message has been received. Our billing team will review it and follow up with you as soon as possible. Thank you for calling.");
    twiml.redirect("/voice/customer-service");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 4b. Time Warning ─────────────────────────────────────────────────────
  // Played once per call when the caller has < 5 minutes of access remaining.
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
        "You have less than 5 minutes remaining in your free trial. " +
        "Stay connected by joining now. " +
        "You won't be interrupted by ads. " +
        "Access member only features like off-line messaging, connect live for one on one chat. " +
        "To join right now press 1. " +
        "To continue press pound."
      );
    } else {
      playPrompt(gather, req, "member_warning.mp3",
        "You have less than 5 minutes remaining in your membership. " +
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
    playPrompt(gather, req, "promo_code_prompt.mp3", "Enter your promotional code followed by the pound key. To cancel, press pound now.");
    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-promo-code", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const fromNumber = req.body?.From as string;

    if (!digits || digits === "*" || digits === "#") {
      playPrompt(twiml, req, "cancelled.mp3", "Cancelled.");
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
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
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
          playPrompt(twiml, req, "here_is_your_greeting.mp3", "Here is what your greeting sounds like.");
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
  // Press 1 = accept/keep, press 2 = re-record, press 3 = hear it back.
  app.post("/voice/review-greeting", async (req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-review-greeting" });
    playPrompt(gather, req, "review_greeting.mp3",
      "If you're happy with the way your greeting sounds, press 1. " +
      "To re-record, press 2. " +
      "To hear how your greeting sounds, press 3. " +
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
        // Accept — check if auto-moderation has already rejected this recording
        // (the transcription callback may have fired while the caller was reviewing)
        const acceptUser = await getOrCreateUser(fromNumber);
        if (acceptUser.recordingRejectionReason && acceptUser.recordingRejectionType === "greeting") {
          const rejectionRoute = acceptUser.recordingRejectionReason === "phone_number"
            ? "/voice/recording-rejected-phone-number"
            : "/voice/recording-rejected-unclear";
          twiml.redirect(rejectionRoute);
        } else {
          // Profile is already saved; confirm and continue
          playPrompt(twiml, req, "profile_saved.mp3", "Your greeting has been saved.");
          twiml.redirect("/voice/zip-code-prompt");
        }
      } else if (digit === "2") {
        // Re-record from scratch — restart name step
        playPrompt(twiml, req, "welcome_record_name.mp3",
          "Say your first name only after the tone. You have 5 seconds."
        );
        twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      } else if (digit === "3") {
        // Play back the saved greeting so the caller can hear it again
        const user = await getOrCreateUser(fromNumber);
        const profile = await storage.getProfile(user.id);
        if (profile?.recordingUrl) {
          playPrompt(twiml, req, "here_is_your_greeting.mp3", "Here is what your greeting sounds like.");
          safePlayRecording(twiml, profile.recordingUrl, req, "Your greeting is not available for playback right now.");
        } else {
          playPrompt(twiml, req, "no_greeting_found.mp3", "No recording found.");
        }
        twiml.redirect("/voice/review-greeting");
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
        // Trigger location audio generation in the background — caller does not wait
        if (geo) {
          (async () => {
            try {
              let loc: string | null = geoRaw?.neighborhood || geo.city || null;
              if (!loc && geo.latitude && geo.longitude) {
                loc = await reverseGeocodeNeighborhood(geo.latitude, geo.longitude);
              }
              if (loc) triggerLocationAudio(loc);
            } catch {}
          })();
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
  // male box session timer, then drops them into profile browsing.
  app.post("/voice/go-live", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const regionId = (await storage.getCallerByCallSid(callSid))?.regionId ?? undefined;

      // Restricted users cannot go live
      if (user.accountStatus === "restricted") {
        playPrompt(twiml, req, "account_restricted_live.mp3", "We're sorry, your account has been restricted and you are not able to go live at this time. You may still listen to profiles and use other features. Please contact customer support if you have questions.");
        twiml.redirect("/voice/main-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // Announce how many callers are currently on the line.
      // On MW systems, only count opposite-gender callers so the announcement is accurate.
      // Total = home region + all linked regions.
      const goLiveSiteConf = await getSiteSettingsCached();
      const goLiveCallerGender = goLiveSiteConf.siteCategory === "MW"
        ? (femaleCallers.has(callSid) ? "female" : "male")
        : null;
      const goLiveHomeCount = await storage.getActiveCallerCount(user.id, regionId, goLiveCallerGender);
      let goLiveTotal = goLiveHomeCount;
      if (regionId) {
        const goLiveLinkedRegions = await storage.getLinkedRegions(regionId).catch(() => [] as Awaited<ReturnType<typeof storage.getLinkedRegions>>);
        for (const lr of goLiveLinkedRegions) {
          goLiveTotal += await storage.getActiveCallerCount(user.id, lr.id, goLiveCallerGender).catch(() => 0);
        }
      }
      // Caller count is announced by browse-profiles at index 1 — do not duplicate here.

      // In per-minute billing, notify the caller that their time is now running.
      // In per-day, per_24h billing or free mode, time is not deducted per-call, so skip this announcement.
      const goLiveSettings = await getMembershipSettingsCached();
      if (goLiveSettings.billingMode !== "per_day" && goLiveSettings.billingMode !== "per_24h" && !goLiveSettings.freeMode) {
        playPrompt(twiml, req, "time_deduction_start.mp3",
          "Time is now being deducted from your membership.");
      }

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
      const callerRecord = await storage.getCallerByCallSid(callSid);
      const regionId = callerRecord?.regionId ?? undefined;

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

      // Determine caller gender for MW gender-filtering (null = MM, no filter)
      const browseSiteConf = await getSiteSettingsCached();
      let browseCallerGender: string | null = browseSiteConf.siteCategory === "MW"
        ? (femaleCallers.has(callSid) ? "female" : "male")
        : null;

      // MSM override — male MW caller pressed 5 to enter Men Seeking Men section.
      // Treat them identically to an MM caller: no gender filter, MM profile pool.
      let browseSiteCategory = browseSiteConf.siteCategory ?? "MM";
      try {
        if (callerRecord?.seeking === "msm") {
          browseCallerGender = null;
          browseSiteCategory = "MM";
        }
      } catch (_e) { /* non-fatal — fall through with defaults */ }
      const availableCount = await storage.getAvailableProfileCount(user.id, regionId, browseCallerGender, browseSiteCategory);
      console.log(`[voice] browse-profiles: userId=${user.id}, regionId=${regionId}, callerGender=${browseCallerGender}, availableProfiles=${availableCount}`);

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
          timeout: 20,
        });
        // 1. Chime
        playPrompt(inviteGather, req, "live_connect_chime.mp3", "");
        // 2. Caller's name recording
        if (pendingInvite.initiatorNameRecordingUrl) {
          safePlayRecording(inviteGather, pendingInvite.initiatorNameRecordingUrl, req, "");
        }
        // 3. "wants to connect with you."
        playPrompt(inviteGather, req, "live_invite_wants_to_connect.mp3", "wants to connect with you.");
        // 4. 1-second pause
        inviteGather.pause({ length: 1 });
        // 5. Play the custom invite message if recorded, otherwise fall back to stored greeting
        if (pendingInvite.inviteMessageUrl) {
          safePlayRecording(inviteGather, pendingInvite.inviteMessageUrl, req, "");
        } else if (pendingInvite.initiatorGreetingUrl) {
          safePlayRecording(inviteGather, pendingInvite.initiatorGreetingUrl, req, "");
        }
        // 6. Menu
        playPrompt(inviteGather, req, "live_invite_options.mp3",
          "To connect live with this caller press 1. To reply with a message press 2. " +
          "To skip press 3. To hear the last message you sent them press 4. " +
          "To block this caller press 7. To hear this caller's location press 8. " +
          "To repeat these choices press 9.");
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
          playPrompt(msgGather, req, "vm_new_message.mp3", "New message.");
          safePlayRecording(msgGather, senderProfile.nameRecordingUrl, req, "");
          playPrompt(msgGather, req, "has_sent_you_a_message.mp3", "has sent you a message.");
        } else {
          playPrompt(msgGather, req, "you_have_new_message.mp3", "You have a new message.");
        }
        safePlayRecording(msgGather, unreadMessage.recordingUrl, req, "Message audio is not available for playback.");
        playPrompt(msgGather, req, "message_options.mp3", "To connect live with this caller, press 1. To reply with a message, press 2. To skip this message, press 3. To hear the last message you sent them, press 4. To save this message, press 5. To block this caller, press 7. To hear this caller's greeting and location, press 8. To repeat this message and menu choices, press 9. To exit or change your greeting, press pound.");
        twiml.redirect("/voice/main-menu");
      } else {
        // ── Rolling buffer browsing ───────────────────────────────────────────
        // State persists across HTTP calls in Redis (keyed by callSid), with in-memory
        // fallback when Redis is unavailable. The buffer holds at most 3 profiles at a time;
        // seenUserIds tracks what this caller has already heard this cycle. When the buffer
        // drains after a fill, the cycle is complete and linked regions are offered (or reset).

        const afterUserId   = req.query?.afterUserId   as string | undefined;
        const targetUserId  = req.query?.targetUserId  as string | undefined;
        const retryCount    = parseInt((req.query?.browseRetry as string) ?? "0", 10);

        let state = await getBrowseState(callSid);

        if (!state) {
          // ── First visit: build initial state ─────────────────────────────────
          const allProfiles = await storage.getAllActiveProfilesWithGeo(user.id, regionId, browseCallerGender, browseSiteCategory);

          let callerRegionName: string | null = null;
          if (regionId) {
            const callerRegion = await storage.getRegionById(regionId);
            callerRegionName = callerRegion?.name ?? null;
          }

          const linkedRegions = regionId
            ? await storage.getLinkedRegions(regionId).catch(() => [] as Awaited<ReturnType<typeof storage.getLinkedRegions>>)
            : [];
          const linkedRegionSnapshots = await Promise.all(
            linkedRegions.map(async (r) => {
              const profiles = await storage.getAllActiveProfiles(user.id, r.id);
              return { regionId: r.id, regionName: r.name, knownUserIds: profiles.map(p => p.userId) };
            })
          );

          let initialQueue = allProfiles;
          let linkedRegionLoaded = false;
          if (initialQueue.length === 0 && linkedRegions.length > 0) {
            const linkedProfiles: (typeof allProfiles[number])[] = [];
            for (const lr of linkedRegions) {
              const lrProfiles = await storage.getAllActiveProfilesWithGeo(user.id, lr.id, browseCallerGender, browseSiteCategory);
              for (const p of lrProfiles) linkedProfiles.push(p);
            }
            if (linkedProfiles.length > 0) {
              initialQueue = linkedProfiles;
              linkedRegionLoaded = true;
              console.log(`[voice] browse-profiles: home region empty — loaded ${linkedProfiles.length} profile(s) from ${linkedRegions.length} linked region(s) for ${callSid}`);
            }
          }

          // ── Load session-level block cache (separate from seen/buffer logic) ──
          const initialBlockedIds = await storage.getBlockedUserIdSet(user.id);

          const initialBuffer: BrowseQueueItem[] = initialQueue
            .filter(p => !initialBlockedIds.has(p.userId))
            .slice(0, 3)
            .map(p => ({
              userId: p.userId,
              recordingUrl: p.recordingUrl,
              nameRecordingUrl: p.nameRecordingUrl,
              regionId: regionId ?? null,
              regionName: callerRegionName,
              isPreExisting: true,
              lat: p.lat ?? null,
              lon: p.lon ?? null,
            }));

          state = {
            queue: initialBuffer,
            seenUserIds: [],
            blockedUserIds: initialBlockedIds,
            lastPlayedProfile: null,
            previousLastPlayedProfile: null,
            callerRegionId: regionId ?? null,
            callerRegionName,
            callerCountAnnounced: false,
            index: 0,
            lastPlayedIndex: null,
            hasWrapped: false,
            linkedRegionLoaded,
            localUserIds: allProfiles.map(p => p.userId),
            announcedNewLocalIds: [],
            linkedRegionSnapshots,
            announcedLinkedCallerIds: [],
            greetingsPlayed: 0,
            windowAnnouncementsUsed: 0,
          };

          engagementEngine.initEngagementState(callSid, user.id);
          console.log(`[voice] browse-profiles: new session for ${callSid} — buffer=${state.queue.length} (region=${callerRegionName ?? "none"}, linkedRegions=${linkedRegions.length})`);
        } else {
          // ── Returning visit ───────────────────────────────────────────────────

          // Re-sync block cache from DB on every returning visit.
          // This is the ONLY mechanism that picks up new blocks pressed mid-session
          // (handle-profile-menu press-4 calls storage.blockUser then redirects here).
          // Block cache is completely separate from seenUserIds / buffer logic.
          state.blockedUserIds = await storage.getBlockedUserIdSet(user.id);

          // Immediately prune buffer against the updated block cache.
          // This handles the case where the caller blocked someone who was buffered.
          state.queue = state.queue.filter(p => !state!.blockedUserIds.has(p.userId));

          if (targetUserId) {
            // Press-5 go-back: re-inject the previous profile at the front of the buffer.
            // previousLastPlayedProfile holds the profile played before the current one.
            // Do NOT mark it as seen so it can replay cleanly.
            // Respect block cache — do not re-inject a profile the caller just blocked.
            const alreadyInBuffer = state.queue.some(p => p.userId === targetUserId);
            const profileToRestore = state.previousLastPlayedProfile?.userId === targetUserId
              ? state.previousLastPlayedProfile
              : state.lastPlayedProfile?.userId === targetUserId
                ? state.lastPlayedProfile
                : null;
            if (!alreadyInBuffer && profileToRestore && !state.blockedUserIds.has(targetUserId)) {
              state.queue.unshift(profileToRestore);
              if (state.queue.length > 3) state.queue.pop();
            }
          } else if (afterUserId) {
            // Normal advance (press-2 skip, block, etc.): mark as seen and remove from buffer.
            // Note: a blocked user's afterUserId is added to seenUserIds here too, which is
            // harmless — the block cache is the authoritative exclusion, seenUserIds is just
            // the cycle-duplicate filter.
            if (!state.seenUserIds.includes(afterUserId)) {
              state.seenUserIds.push(afterUserId);
            }
            state.queue = state.queue.filter(p => p.userId !== afterUserId);
          }
        }

        // ── Refill buffer to max 3 from DB (excluding seen + current buffer) ──
        const AI_ID = engagementEngine.BUST_GAME_AI_USER_ID;
        {
          const bufferIds  = new Set(state.queue.map(p => p.userId));
          const excluded   = new Set([...state.seenUserIds, ...bufferIds]);

          const fillFrom = async (rid: string | undefined, rName: string | null, rId: string | null) => {
            if (state!.queue.length >= 3) return;
            const avail = await storage.getAllActiveProfilesWithGeo(user.id, rid, browseCallerGender, browseSiteCategory);
            for (const p of avail) {
              // Block cache is the top-level pre-filter — checked before seen/buffer exclusions
              if (state!.blockedUserIds.has(p.userId)) continue;
              if (excluded.has(p.userId) || p.userId === AI_ID) continue;
              if (state!.queue.length >= 3) break;
              state!.queue.push({ userId: p.userId, recordingUrl: p.recordingUrl, nameRecordingUrl: p.nameRecordingUrl, regionId: rId, regionName: rName, isPreExisting: false, lat: p.lat ?? null, lon: p.lon ?? null });
              excluded.add(p.userId);
            }
          };

          if (!state.linkedRegionLoaded) {
            await fillFrom(state.callerRegionId ?? undefined, state.callerRegionName, state.callerRegionId);
          } else {
            for (const snap of state.linkedRegionSnapshots) {
              await fillFrom(snap.regionId, snap.regionName, snap.regionId);
              if (state.queue.length >= 3) break;
            }
          }
        }

        // ── Cycle-complete detection: buffer empty after fill ─────────────────
        if (state.queue.length === 0) {
          if (state.seenUserIds.length > 0 && !state.linkedRegionLoaded && state.callerRegionId) {
            // Offer linked regions before resetting
            const linkedRegions2 = await storage.getLinkedRegions(state.callerRegionId).catch(() => [] as Awaited<ReturnType<typeof storage.getLinkedRegions>>);
            if (linkedRegions2.length > 0) {
              const ids   = linkedRegions2.map(r => r.id).join(",");
              const names = linkedRegions2.map(r => r.name).join("||");
              await setBrowseState(callSid, state);
              twiml.redirect(`/voice/nearby-callers-offer?linkedRegionIds=${encodeURIComponent(ids)}&linkedRegionNames=${encodeURIComponent(names)}`);
              res.type("text/xml");
              return res.send(twiml.toString());
            }
          }

          // Reset cycle: clear seenUserIds and refill (block cache is NOT reset)
          if (state.seenUserIds.length > 0) {
            console.log(`[voice] browse-profiles: cycle complete for ${callSid} — resetting seenUserIds`);
            state.seenUserIds = [];
            const resetAvail = await storage.getAllActiveProfilesWithGeo(user.id, state.callerRegionId ?? undefined, browseCallerGender, browseSiteCategory);
            for (const p of resetAvail) {
              if (state.queue.length >= 3) break;
              // Block cache pre-filter: never re-introduce blocked users on cycle reset
              if (state.blockedUserIds.has(p.userId)) continue;
              state.queue.push({ userId: p.userId, recordingUrl: p.recordingUrl, nameRecordingUrl: p.nameRecordingUrl, regionId: state.callerRegionId, regionName: state.callerRegionName, isPreExisting: false, lat: p.lat ?? null, lon: p.lon ?? null });
            }
          }

          // Still empty — wait and retry
          if (state.queue.length === 0) {
            if (retryCount < 2) {
              await setBrowseState(callSid, state);
              twiml.pause({ length: 3 });
              twiml.redirect(`/voice/browse-profiles?browseRetry=${retryCount + 1}`);
            } else {
              playPrompt(twiml, req, "no_profiles.mp3", "No profiles are available right now. Please try again later.");
              twiml.redirect("/voice/main-menu");
            }
            res.type("text/xml");
            return res.send(twiml.toString());
          }
        }

        // ── Reconciliation: prune offline/blocked callers from buffer ─────────
        let currentLocalProfiles: Awaited<ReturnType<typeof storage.getAllActiveProfilesWithGeo>> = [];
        const reconActiveIds = new Set<string>();
        if (state.callerRegionId) {
          currentLocalProfiles = await storage.getAllActiveProfilesWithGeo(user.id, state.callerRegionId, browseCallerGender, browseSiteCategory);
          for (const p of currentLocalProfiles) reconActiveIds.add(p.userId);
        } else {
          const globalProfiles = await storage.getAllActiveProfilesWithGeo(user.id, undefined, browseCallerGender, browseSiteCategory);
          for (const p of globalProfiles) reconActiveIds.add(p.userId);
          currentLocalProfiles = globalProfiles;
        }

        const linkedSnapshotResults: Awaited<ReturnType<typeof storage.getAllActiveProfilesWithGeo>>[] = [];
        for (const snap of state.linkedRegionSnapshots) {
          const snapProfiles = await storage.getAllActiveProfilesWithGeo(user.id, snap.regionId, browseCallerGender, browseSiteCategory);
          linkedSnapshotResults.push(snapProfiles);
          for (const p of snapProfiles) reconActiveIds.add(p.userId);
        }

        {
          const queueBefore = state.queue.length;
          state.queue = state.queue.filter(p => reconActiveIds.has(p.userId) || p.userId === AI_ID);
          if (state.queue.length < queueBefore) {
            console.log(`[voice] browse-profiles: reconciled — pruned ${queueBefore - state.queue.length} offline/blocked from buffer, remaining=${state.queue.length} for ${callSid}`);
          }
        }

        // ── New caller alerts: home region ("close to you") + linked regions ("from [city]") ──
        // Block cache pre-filter: never alert on a blocked user, regardless of when they joined.
        if (state.callerRegionId) {
          const knownLocalIds = new Set([...state.localUserIds, ...state.announcedNewLocalIds]);
          const newLocalCaller = currentLocalProfiles.find(p => !knownLocalIds.has(p.userId) && !state!.blockedUserIds.has(p.userId));

          if (newLocalCaller) {
            state.announcedNewLocalIds.push(newLocalCaller.userId);

            // Distance check: if both sides have zip lat/lon and are within 1 mile,
            // always interrupt with "closest to you" — skip the random probability gate.
            const newCallerLat = newLocalCaller.lat;
            const newCallerLon = newLocalCaller.lon;
            const withinOneMile =
              callerLat != null && callerLon != null &&
              newCallerLat != null && newCallerLon != null &&
              haversineDistanceMiles(callerLat, callerLon, newCallerLat, newCallerLon) <= 1.0;

            const announceLocal = withinOneMile || Math.random() < NEW_CALLER_ANNOUNCE_PROBABILITY;

            if (!state.linkedRegionLoaded) {
              if (announceLocal) {
                console.log(`[voice] browse-profiles: announcing new home-region caller userId=${newLocalCaller.userId} to ${callSid}${withinOneMile ? " (proximity ≤1 mile)" : ""}`);
                const alertGather = twiml.gather({
                  numDigits: 1,
                  action: `/voice/handle-profile-menu?profileUserId=${newLocalCaller.userId}`,
                  timeout: 10,
                });
                playPrompt(alertGather, req, "new_caller_closest_to_you.mp3", "New caller closest to you.");
                if (newLocalCaller.nameRecordingUrl) {
                  safePlayRecording(alertGather, newLocalCaller.nameRecordingUrl, req, "");
                }
                safePlayRecording(alertGather, newLocalCaller.recordingUrl, req, "This profile's greeting is not available.");
                playPrompt(alertGather, req, "profile_options.mp3", "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu.");
                twiml.redirect("/voice/browse-profiles");
                await setBrowseState(callSid, state);
                res.type("text/xml");
                return res.send(twiml.toString());
              } else {
                console.log(`[voice] browse-profiles: silently queuing new home-region caller userId=${newLocalCaller.userId} for ${callSid} (random skip)`);
                state.queue.splice(0, 0, {
                  userId: newLocalCaller.userId,
                  recordingUrl: newLocalCaller.recordingUrl,
                  nameRecordingUrl: newLocalCaller.nameRecordingUrl,
                  regionId: null,
                  regionName: null,
                  lat: newCallerLat ?? null,
                  lon: newCallerLon ?? null,
                });
                if (state.queue.length > 3) state.queue.pop();
              }
            } else {
              console.log(`[voice] browse-profiles: ${announceLocal ? "announcing" : "silently queuing"} home-region caller userId=${newLocalCaller.userId} in linked-region queue for ${callSid}`);
              state.queue.splice(0, 0, {
                userId: newLocalCaller.userId,
                recordingUrl: newLocalCaller.recordingUrl,
                nameRecordingUrl: newLocalCaller.nameRecordingUrl,
                regionId: announceLocal ? state.callerRegionId : null,
                regionName: announceLocal ? state.callerRegionName : null,
                lat: newCallerLat ?? null,
                lon: newCallerLon ?? null,
              });
              if (state.queue.length > 3) state.queue.pop();
            }
          }
        }

        for (let snapIdx = 0; snapIdx < state.linkedRegionSnapshots.length; snapIdx++) {
          const snapshot = state.linkedRegionSnapshots[snapIdx];
          const currentLinkedProfiles = linkedSnapshotResults[snapIdx];
          const knownLinkedIds = new Set([...snapshot.knownUserIds, ...state.announcedLinkedCallerIds]);
          // Block cache pre-filter: skip blocked users in linked-region alerts too
          const newLinkedCaller = currentLinkedProfiles.find(p => !knownLinkedIds.has(p.userId) && !state!.blockedUserIds.has(p.userId));

          if (newLinkedCaller) {
            state.announcedLinkedCallerIds.push(newLinkedCaller.userId);
            const announceLinked = Math.random() < NEW_CALLER_ANNOUNCE_PROBABILITY;

            if (announceLinked) {
              console.log(`[voice] browse-profiles: announcing new linked-region caller from ${snapshot.regionName} userId=${newLinkedCaller.userId} to ${callSid}`);
              const alertGather = twiml.gather({
                numDigits: 1,
                action: `/voice/handle-profile-menu?profileUserId=${newLinkedCaller.userId}`,
                timeout: 10,
              });
              const linkedRegionRecord = await storage.getRegionById(snapshot.regionId).catch(() => null);
              const linkedSlug = linkedRegionRecord?.slug ?? snapshot.regionName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
              const linkedCityFile = `city_${linkedSlug.replace(/[^a-z0-9_\-]/g, "_")}.mp3`;
              const linkedCityFilePath = path.join(UPLOADS_DIR, linkedCityFile);
              if (fs.existsSync(linkedCityFilePath)) {
                alertGather.play(`${baseUrl(req)}/uploads/${linkedCityFile}`);
              } else {
                alertGather.say(`New caller from ${snapshot.regionName}.`);
              }
              if (newLinkedCaller.nameRecordingUrl) {
                safePlayRecording(alertGather, newLinkedCaller.nameRecordingUrl, req, "");
              }
              safePlayRecording(alertGather, newLinkedCaller.recordingUrl, req, "This profile's greeting is not available.");
              playPrompt(alertGather, req, "profile_options.mp3", "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu.");
              twiml.redirect("/voice/browse-profiles");
              await setBrowseState(callSid, state);
              res.type("text/xml");
              return res.send(twiml.toString());
            } else {
              console.log(`[voice] browse-profiles: silently queuing new linked-region caller from ${snapshot.regionName} userId=${newLinkedCaller.userId} for ${callSid} (random skip)`);
              state.queue.splice(0, 0, {
                userId: newLinkedCaller.userId,
                recordingUrl: newLinkedCaller.recordingUrl,
                nameRecordingUrl: newLinkedCaller.nameRecordingUrl,
                regionId: null,
                regionName: null,
              });
              if (state.queue.length > 3) state.queue.pop();
            }
          }
        }

        // ── Engagement Engine interrupt check ─────────────────────────────────
        let excludedRogerIds = new Set<string>();
        try {
          excludedRogerIds = await storage.getExcludedRogerPromptIds(fromNumber, engagementEngine.PROMPT_LIBRARY.length);
        } catch (err) {
          console.error("[engagement] failed to fetch roger prompt history:", err);
        }

        const engInterruption = engagementEngine.getInterruption(callSid, excludedRogerIds);
        if (engInterruption) {
          const encodedText = encodeURIComponent(engInterruption.lineText);
          const followUp    = encodeURIComponent(engInterruption.followUpAction ?? "");
          const pid         = encodeURIComponent(engInterruption.id);
          console.log(`[engagement] Interrupting browse with prompt=${engInterruption.id}, followUp=${engInterruption.followUpAction ?? "none"}`);
          await setBrowseState(callSid, state);
          twiml.redirect(`/voice/engagement-interrupt?text=${encodedText}&followUp=${followUp}&pid=${pid}`);
          res.type("text/xml");
          return res.send(twiml.toString());
        }

        // ── Bust Game: inject AI imposter into buffer ─────────────────────────
        const engState = engagementEngine.getEngagementState(callSid);
        if (engState?.gameStarted && engState.gameBustTargetUserId === AI_ID && !engState.gameBustTargetInjected) {
          const greetingIndex = 1 + Math.floor(Math.random() * engagementEngine.GAME_AI_GREETING_COUNT);
          const greetingFile  = `game_greeting_${greetingIndex}.mp3`;
          const greetingPath  = path.join(UPLOADS_DIR, greetingFile);
          if (fs.existsSync(greetingPath)) {
            const offset   = 1 + Math.floor(Math.random() * Math.max(1, Math.min(state.queue.length, 2)));
            const insertAt = Math.min(offset, state.queue.length);
            state.queue.splice(insertAt, 0, {
              userId: AI_ID,
              recordingUrl: `/uploads/${greetingFile}`,
              nameRecordingUrl: null,
              regionId: state.callerRegionId,
              regionName: null,
            });
            if (state.queue.length > 3) state.queue.pop();
            engagementEngine.markGameTargetInjected(callSid);
            console.log(`[engagement] Injected AI imposter (${greetingFile}) at buffer[${insertAt}]`);
          } else {
            console.warn(`[engagement] Game greeting file not found: ${greetingFile} — re-trying on next browse cycle`);
          }
        }

        // ── Final empty guard ─────────────────────────────────────────────────
        if (state.queue.length === 0) {
          if (retryCount < 2) {
            await setBrowseState(callSid, state);
            twiml.pause({ length: 3 });
            twiml.redirect(`/voice/browse-profiles?browseRetry=${retryCount + 1}`);
          } else {
            playPrompt(twiml, req, "no_profiles.mp3", "No profiles are available right now. Please try again later.");
            twiml.redirect("/voice/main-menu");
          }
          res.type("text/xml");
          return res.send(twiml.toString());
        }

        // ── Playback ──────────────────────────────────────────────────────────
        const profile = state.queue[0];

        // Safety guard: if this profile is in the block cache, skip it immediately.
        // Uses O(1) cache lookup — no DB query needed.
        if (state.blockedUserIds.has(profile.userId)) {
          state.queue.shift();
          // Do NOT add to seenUserIds — the block cache is the authoritative exclusion layer.
          await setBrowseState(callSid, state);
          twiml.redirect("/voice/browse-profiles");
          res.type("text/xml");
          return res.send(twiml.toString());
        }

        // Capture previous profile for press-5 go-back BEFORE updating lastPlayedProfile.
        const prevLastProfile = state.lastPlayedProfile;
        state.previousLastPlayedProfile = state.lastPlayedProfile;
        state.lastPlayedProfile = profile;

        // Announce caller count exactly once per session — right before the first profile.
        if (!state.callerCountAnnounced) {
          state.callerCountAnnounced = true;
          const homeCount = await storage.getActiveCallerCount(user.id, state.callerRegionId ?? undefined, browseCallerGender);
          let regionalTotal = homeCount;
          for (const snap of state.linkedRegionSnapshots) {
            regionalTotal += await storage.getActiveCallerCount(user.id, snap.regionId, browseCallerGender);
          }
          console.log(`[voice] browse-profiles: announcing caller count: ${regionalTotal} (home=${homeCount}, linkedRegions=${state.linkedRegionSnapshots.length})`);
          playCallerCount(twiml, req, regionalTotal);
        }

        // Nest <Play> inside <Gather> — pressing 2 during the greeting skips to the next one.
        const profileGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-profile-menu?profileUserId=${profile.userId}&previousProfileUserId=${prevLastProfile?.userId ?? ""}`,
          timeout: 10,
        });

        // ── Origin announcement: "closest to you" or "from [city]" ──────────────
        // Proximity check (deterministic, bypasses budget): if both listener and
        // profile have zip lat/lon AND are within 1 mile → always play closest-to-you.
        const profileLat = profile.lat ?? null;
        const profileLon = profile.lon ?? null;
        const proximityClose =
          callerLat != null && callerLon != null &&
          profileLat != null && profileLon != null &&
          haversineDistanceMiles(callerLat, callerLon, profileLat, profileLon) <= 1.0;

        if (proximityClose) {
          playPrompt(profileGather, req, "new_caller_closest_to_you.mp3", "Caller closest to you.");
          console.log(`[voice] browse-profiles: proximity ≤1 mile — playing closest-to-you for profile userId=${profile.userId} to ${callSid}`);
        } else {
          // Probabilistic budget for non-proximity origin announcements:
          // max 5 injections per 25-greeting window.
          const WINDOW_SIZE = 25;
          const MAX_PER_WINDOW = 5;
          const posInWindow = state.greetingsPlayed % WINDOW_SIZE;
          if (posInWindow === 0 && state.greetingsPlayed > 0) state.windowAnnouncementsUsed = 0;
          const remainingInWindow = WINDOW_SIZE - posInWindow;
          const remainingBudget   = MAX_PER_WINDOW - state.windowAnnouncementsUsed;
          const announceProbability = !profile.isPreExisting && remainingBudget > 0 ? remainingBudget / remainingInWindow : 0;
          const shouldAnnounceOrigin = Math.random() < announceProbability;

          if (shouldAnnounceOrigin) {
            if (!profile.regionId || profile.regionId === state.callerRegionId) {
              playPrompt(profileGather, req, "new_caller_closest_to_you.mp3", "New caller closest to you.");
            } else if (profile.regionName) {
              profileGather.say(`New caller from ${profile.regionName}.`);
            }
            state.windowAnnouncementsUsed++;
          }
        }

        state.greetingsPlayed++;

        if (profile.nameRecordingUrl) {
          safePlayRecording(profileGather, profile.nameRecordingUrl, req, "");
        }
        safePlayRecording(profileGather, profile.recordingUrl, req, "This profile's greeting is not available.");
        playPrompt(profileGather, req, "profile_options.mp3", "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu.");

        console.log(`[voice] Playing profile userId=${profile.userId} (buffer=${state.queue.length}, seen=${state.seenUserIds.length})`);

        // Persist state before redirecting
        await setBrowseState(callSid, state);
        twiml.redirect(`/voice/connector-timeout?profileUserId=${encodeURIComponent(profile.userId)}&previousProfileUserId=${encodeURIComponent(prevLastProfile?.userId ?? "")}&attempt=1`);
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
  // Played when a caller exhausts their region's local queue.
  // Builds a dynamic per-region menu (up to 3 linked regions + a start-over option).
  app.post("/voice/nearby-callers-offer", async (req, res) => {
    const twiml = new VoiceResponse();
    try {
      const linkedRegionIds = ((req.query.linkedRegionIds as string) || "").split(",").filter(Boolean);
      // Names are || separated to avoid conflicts with commas in city names
      const linkedRegionNames = ((req.query.linkedRegionNames as string) || "").split("||").map(n => n.trim()).filter(Boolean);

      if (linkedRegionIds.length === 0) {
        twiml.redirect("/voice/browse-profiles");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // Cap at 3 linked regions (max supported)
      const regions = linkedRegionIds.slice(0, 3).map((id, i) => ({
        id,
        name: linkedRegionNames[i] || `Area ${i + 1}`,
        digit: String(i + 1),
      }));
      const startOverDigit = String(regions.length + 1);

      const encodedIds = encodeURIComponent(regions.map(r => r.id).join(","));
      const encodedNames = encodeURIComponent(regions.map(r => r.name).join("||"));
      const gather = twiml.gather({
        numDigits: 1,
        action: `/voice/handle-nearby-callers?linkedRegionIds=${encodedIds}&linkedRegionNames=${encodedNames}`,
        timeout: 12,
      });

      // Static intro audio (can be overridden with ElevenLabs recording)
      playPrompt(gather, req, "nearby_callers_offer.mp3", "You have heard all the callers close to you.");

      // Dynamic per-region options — use TTS so the menu always reads correctly.
      // (City audio files now contain "new caller from {city}" for the live announcement.)
      for (const r of regions) {
        gather.say(`Press ${r.digit} to hear callers from ${r.name}.`);
      }
      gather.say(`Press ${startOverDigit} to start over from the beginning.`);

      // Timeout with no digit → fall through to handle-nearby-callers (treated as start-over)
      twiml.redirect(`/voice/handle-nearby-callers?linkedRegionIds=${encodedIds}&linkedRegionNames=${encodedNames}`);
    } catch (err) {
      console.error("[voice] /voice/nearby-callers-offer error:", err);
      twiml.redirect("/voice/browse-profiles");
    }
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 6b. Handle Nearby Callers Choice ────────────────────────────────────
  // digit 1–3 → load that specific linked region's profiles
  // digit = regions.length + 1  (or no input / timeout) → start over from local queue
  app.post("/voice/handle-nearby-callers", async (req, res) => {
    const twiml = new VoiceResponse();
    try {
      const digit = req.body?.Digits as string | undefined;
      const linkedRegionIds = ((req.query.linkedRegionIds as string) || "").split(",").filter(Boolean);
      const linkedRegionNames = ((req.query.linkedRegionNames as string) || "").split("||").map(n => n.trim()).filter(Boolean);
      const fromNumber = req.body?.From as string;

      // Determine if caller chose a specific linked region (digit 1, 2, or 3)
      // Any digit beyond the number of linked regions (or no digit) = start-over
      const chosenIndex = digit ? parseInt(digit, 10) - 1 : -1;
      const chosenRegionId = chosenIndex >= 0 && chosenIndex < linkedRegionIds.length
        ? linkedRegionIds[chosenIndex]
        : null;
      const chosenRegionName = chosenIndex >= 0 && chosenIndex < linkedRegionNames.length
        ? linkedRegionNames[chosenIndex]
        : null;

      if (chosenRegionId) {
        const user = await getOrCreateUser(fromNumber);
        const linkedProfiles = await storage.getAllActiveProfiles(user.id, chosenRegionId);

        if (linkedProfiles.length > 0) {
          console.log(`[voice] handle-nearby-callers: loaded ${linkedProfiles.length} profiles from "${chosenRegionName}" (regionId=${chosenRegionId})`);
          twiml.say(`Now playing callers from ${chosenRegionName}.`);
        } else {
          playPrompt(twiml, req, "nearby_callers_none.mp3",
            `There are no callers online in ${chosenRegionName ?? "that area"} right now. Starting your area over.`);
        }
        twiml.redirect("/voice/browse-profiles");
      } else {
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
  const MSG_MENU_PROMPT = "To connect live with this caller, press 1. To reply with a message, press 2. To skip this message, press 3. To hear the last message you sent them, press 4. To save this message, press 5. To block this caller, press 7. To hear this caller's greeting and location, press 8. To repeat this message and menu choices, press 9. To exit or change your greeting, press pound.";

  app.post("/voice/handle-message-menu", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const digit = req.body?.Digits;
      const msgId = req.query.msgId as string;
      const senderId = req.query.senderId as string;
      const fromNumber = req.body?.From as string;
      const callSid = req.body?.CallSid as string;

      if (digit === "1") {
        // ── Connect live with the message sender ─────────────────────────────
        console.log(`[live-connect] Press 1 (message menu, default) — from=${fromNumber} callSid=${callSid} senderId=${senderId}`);
        if (!fromNumber || !senderId || !callSid) {
          console.warn(`[live-connect] REJECT (msg-menu missing-params): fromNumber=${!!fromNumber} senderId=${!!senderId} callSid=${!!callSid}`);
          playPrompt(twiml, req, "error_generic.mp3", "Sorry, we could not start a live connection. Returning to profiles.");
          twiml.redirect("/voice/browse-profiles");
        } else {
          const user = await getOrCreateUser(fromNumber);
          const liveConnectSettings = await getMembershipSettingsCached();
          const liveConnectFreeMode = liveConnectSettings.freeMode === true;
          if (!liveConnectFreeMode && (user.remainingSeconds ?? 0) < 300) {
            console.warn(`[live-connect] REJECT (msg-menu initiator-low-time): userId=${user.id} remainingSeconds=${user.remainingSeconds ?? 0}`);
            playPrompt(twiml, req, "live_connect_no_minutes.mp3", "You need at least 5 minutes remaining on your membership to connect live. Please add more time and try again.");
            twiml.redirect("/voice/browse-profiles");
          } else {
            const targetProfile = await storage.getProfile(senderId);
            if (!targetProfile) {
              console.warn(`[live-connect] REJECT (msg-menu no-target-profile): senderId=${senderId}`);
              playPrompt(twiml, req, "live_connect_unavailable.mp3", "That caller's profile is not available for a live connection.");
              twiml.redirect("/voice/browse-profiles");
            } else if (targetProfile.isAdminUploaded) {
              console.warn(`[live-connect] REJECT (msg-menu admin-uploaded-profile): senderId=${senderId}`);
              playPrompt(twiml, req, "live_connect_admin_profile.mp3", "This is a sample profile and cannot accept a live connection. Please choose another caller.");
              twiml.redirect("/voice/browse-profiles");
            } else {
              const targetActiveCall = await storage.getActiveCallByUserId(senderId);
              if (!targetActiveCall) {
                console.warn(`[live-connect] REJECT (msg-menu target-not-on-line): senderId=${senderId}`);
                playPrompt(twiml, req, "live_connect_left_line.mp3", "Sorry, that caller is no longer on the line.");
                twiml.redirect("/voice/browse-profiles");
              } else if (targetActiveCall.callSid.startsWith("VIRTUAL-")) {
                console.warn(`[live-connect] REJECT (msg-menu target-is-virtual): senderId=${senderId} callSid=${targetActiveCall.callSid}`);
                playPrompt(twiml, req, "live_connect_left_line.mp3", "Sorry, that caller is not currently reachable for a live connection.");
                twiml.redirect("/voice/browse-profiles");
              } else {
                const targetUser = await storage.getUserById(senderId);
                if (!liveConnectFreeMode && (!targetUser || (targetUser.remainingSeconds ?? 0) < 300)) {
                  console.warn(`[live-connect] REJECT (msg-menu target-low-time): senderId=${senderId} remainingSeconds=${targetUser?.remainingSeconds ?? 0}`);
                  playPrompt(twiml, req, "live_connect_unavailable.mp3", "That caller does not have enough time remaining for a live connection.");
                  twiml.redirect("/voice/browse-profiles");
                } else if (liveConnectionUserIds.has(senderId)) {
                  console.warn(`[live-connect] REJECT (msg-menu target-already-in-live): senderId=${senderId}`);
                  playPrompt(twiml, req, "live_connect_busy.mp3", "That caller is already connected with someone else. Please try again later.");
                  twiml.redirect("/voice/browse-profiles");
                } else {
                  const isBlocked = await storage.isUserBlocked(senderId, user.id);
                  if (isBlocked) {
                    console.warn(`[live-connect] REJECT (msg-menu initiator-blocked): senderId=${senderId} initiatorUserId=${user.id}`);
                    playPrompt(twiml, req, "live_connect_unavailable.mp3", "That caller is not available for a live connection.");
                    twiml.redirect("/voice/browse-profiles");
                  } else {
                    console.log(`[live-connect] ALL CHECKS PASSED (msg-menu, default) — creating invite from userId=${user.id} → senderId=${senderId}`);
                    await storage.markMessageRead(msgId);
                    const callerProfile = await storage.getProfile(user.id);
                    const conferenceRoom = `live-${callSid}`;
                    pendingLiveInvites.set(senderId, {
                      initiatorCallSid: callSid,
                      initiatorUserId: user.id,
                      initiatorNameRecordingUrl: callerProfile?.nameRecordingUrl ?? null,
                      initiatorGreetingUrl: callerProfile?.recordingUrl ?? "",
                      conferenceRoom,
                      createdAt: Date.now(),
                      status: "pending",
                    });
                    console.log(`[live-connect] Message menu invite: userId=${user.id} → senderId=${senderId}, room=${conferenceRoom}`);
                    playPrompt(twiml, req, "live_connect_disclaimer.mp3", "Please be respectful and kind. You are about to request a live one on one connection.");
                    twiml.redirect(`/voice/live-connect-wait?targetUserId=${encodeURIComponent(senderId)}`);
                  }
                }
              }
            }
          }
        }
      } else if (digit === "2") {
        // ── Reply with a message ──────────────────────────────────────────────
        await storage.markMessageRead(msgId);
        playPrompt(twiml, req, "record_reply.mp3", "Record your reply after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}` });
      } else if (digit === "3") {
        // ── Skip this message ─────────────────────────────────────────────────
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "4") {
        // ── Hear the last message you sent them ───────────────────────────────
        if (fromNumber && senderId) {
          const user = await getOrCreateUser(fromNumber);
          const lastSent = await storage.getLastSentMessageToUser(user.id, senderId);
          const replayGather = twiml.gather({
            numDigits: 1,
            action: `/voice/handle-message-menu?msgId=${msgId}&senderId=${senderId}`,
            timeout: 10,
          });
          if (lastSent?.recordingUrl) {
            playPrompt(replayGather, req, "replay_last_message.mp3", "Here is the last message you sent this caller.");
            safePlayRecording(replayGather, lastSent.recordingUrl, req, "");
          } else {
            playPrompt(replayGather, req, "no_message_sent.mp3", "You have not sent this caller a message yet.");
          }
          playPrompt(replayGather, req, "message_options.mp3", MSG_MENU_PROMPT);
          twiml.redirect("/voice/browse-profiles");
        } else {
          twiml.redirect("/voice/browse-profiles");
        }
      } else if (digit === "5") {
        // ── Save this message (mark read, stays in mailbox) ───────────────────
        await storage.markMessageRead(msgId);
        playPrompt(twiml, req, "message_saved.mp3", "Message saved.");
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "7") {
        // ── Block the message sender ──────────────────────────────────────────
        if (fromNumber && senderId) {
          const user = await getOrCreateUser(fromNumber);
          // Mark ALL unread messages from this sender as read so they don't surface again
          await storage.markAllMessagesReadFromSender(senderId, user.id);
          await storage.blockUser(user.id, senderId);
          console.log(`[voice] handle-message-menu: userId=${user.id} blocked senderId=${senderId}`);
          runBlockAutoChecks(senderId).catch(console.error);
        }
        playPrompt(twiml, req, "caller_blocked.mp3", "Caller blocked. You will no longer hear this caller's profile.");
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "8") {
        // ── Hear this caller's greeting and location ──────────────────────────
        const senderProfile = await storage.getProfile(senderId);
        const senderActiveCall = await storage.getActiveCallByUserId(senderId);
        const greetingGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-message-menu?msgId=${msgId}&senderId=${senderId}`,
          timeout: 10,
        });
        if (senderProfile?.recordingUrl) {
          if (senderProfile.nameRecordingUrl) {
            safePlayRecording(greetingGather, senderProfile.nameRecordingUrl, req, "");
          }
          safePlayRecording(greetingGather, senderProfile.recordingUrl, req, "This caller's greeting is not available.");
        } else {
          playPrompt(greetingGather, req, "greeting_not_available.mp3", "This caller's greeting is not available.");
        }
        if (senderActiveCall?.regionId) {
          const region = await storage.getRegionById(senderActiveCall.regionId);
          if (region) {
            greetingGather.say(`This caller is from ${region.name}.`);
          } else {
            playPrompt(greetingGather, req, "location_not_available.mp3", "This caller's location is not available.");
          }
        } else {
          playPrompt(greetingGather, req, "location_not_available.mp3", "This caller's location is not available.");
        }
        playPrompt(greetingGather, req, "message_options.mp3", MSG_MENU_PROMPT);
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "9") {
        // ── Repeat — leave message unread, return to browse (will re-present) ─
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "#") {
        // ── Exit / change greeting ────────────────────────────────────────────
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
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}` });
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
        const callSid1 = req.body?.CallSid as string;
        if (profileUserId === engagementEngine.BUST_GAME_AI_USER_ID) {
          // Caller tried to message the AI imposter — not possible, game over
          engagementEngine.markGameTargetPassed(callSid1);
          playPrompt(twiml, req, "cant_message_ai.mp3", "You can't message an AI. Nice try though. Back to browsing.");
          twiml.redirect("/voice/browse-profiles");
        } else {
          // If the game target was played and caller chose to message instead of bust, end the game
          if (profileUserId && engagementEngine.isGameTarget(callSid1, profileUserId)) {
            engagementEngine.markGameTargetPassed(callSid1);
          }
          playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone. Press any key when done.");
          twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${profileUserId}` });
        }
      } else if (digit === "2") {
        const callSid2 = req.body?.CallSid as string;
        engagementEngine.trackSkip(callSid2);
        // If the caller skipped the game target without pressing 8, the game is over
        if (profileUserId && engagementEngine.isGameTarget(callSid2, profileUserId)) {
          engagementEngine.markGameTargetPassed(callSid2);
        }
        twiml.redirect(`/voice/browse-profiles?afterUserId=${encodeURIComponent(profileUserId)}`);
      } else if (digit === "3") {
        // ── Live 1-on-1 Connect ─────────────────────────────────────────────
        const fromNumber = req.body?.From as string;
        const callSid = req.body?.CallSid as string;

        console.log(`[live-connect] Press 3 (profile menu, default) — from=${fromNumber} callSid=${callSid} profileUserId=${profileUserId}`);

        if (!fromNumber || !profileUserId || !callSid) {
          console.warn(`[live-connect] REJECT (missing-params): fromNumber=${!!fromNumber} profileUserId=${!!profileUserId} callSid=${!!callSid}`);
          playPrompt(twiml, req, "error_generic.mp3", "Sorry, we could not start a live connection. Returning to profiles.");
          twiml.redirect("/voice/browse-profiles");
        } else {
          const user = await getOrCreateUser(fromNumber);
          const liveConnectSettings = await getMembershipSettingsCached();
          const liveConnectFreeMode = liveConnectSettings.freeMode === true;

          // 1. Check initiator has ≥ 5 minutes (300 seconds) remaining — skipped in free mode
          if (!liveConnectFreeMode && (user.remainingSeconds ?? 0) < 300) {
            console.warn(`[live-connect] REJECT (initiator-low-time): userId=${user.id} remainingSeconds=${user.remainingSeconds ?? 0}`);
            playPrompt(twiml, req, "live_connect_no_minutes.mp3",
              "You need at least 5 minutes remaining on your membership to connect live. Please add more time and try again.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 2. Get target profile — admin-uploaded profiles cannot do live connects
          const targetProfile = await storage.getProfile(profileUserId);
          if (!targetProfile) {
            console.warn(`[live-connect] REJECT (no-target-profile): profileUserId=${profileUserId}`);
            playPrompt(twiml, req, "live_connect_unavailable.mp3",
              "That caller's profile is not available for a live connection.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }
          if (targetProfile.isAdminUploaded) {
            console.warn(`[live-connect] REJECT (admin-uploaded-profile): profileUserId=${profileUserId}`);
            playPrompt(twiml, req, "live_connect_admin_profile.mp3",
              "This is a sample profile and cannot accept a live connection. Please choose another caller.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 3. Check target is still on the line (non-virtual active call)
          const targetActiveCall = await storage.getActiveCallByUserId(profileUserId);
          if (!targetActiveCall) {
            console.warn(`[live-connect] REJECT (target-not-on-line): profileUserId=${profileUserId}`);
            playPrompt(twiml, req, "live_connect_left_line.mp3",
              "Sorry, that caller is no longer on the line.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }
          if (targetActiveCall.callSid.startsWith("VIRTUAL-")) {
            console.warn(`[live-connect] REJECT (target-is-virtual): profileUserId=${profileUserId} callSid=${targetActiveCall.callSid}`);
            playPrompt(twiml, req, "live_connect_left_line.mp3",
              "Sorry, that caller is not currently reachable for a live connection.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 4. Check target has ≥ 5 minutes (300 seconds) remaining — skipped in free mode
          const targetUser = await storage.getUserById(profileUserId);
          if (!liveConnectFreeMode && (!targetUser || (targetUser.remainingSeconds ?? 0) < 300)) {
            console.warn(`[live-connect] REJECT (target-low-time): profileUserId=${profileUserId} remainingSeconds=${targetUser?.remainingSeconds ?? 0}`);
            playPrompt(twiml, req, "live_connect_unavailable.mp3",
              "That caller does not have enough time remaining for a live connection.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 5. Check target is not already in a live connection
          if (liveConnectionUserIds.has(profileUserId)) {
            console.warn(`[live-connect] REJECT (target-already-in-live): profileUserId=${profileUserId}`);
            playPrompt(twiml, req, "live_connect_busy.mp3",
              "That caller is already connected with someone else. Please try again later.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // 6. Check target has not blocked initiator
          const isBlocked = await storage.isUserBlocked(profileUserId, user.id);
          if (isBlocked) {
            console.warn(`[live-connect] REJECT (initiator-blocked): profileUserId=${profileUserId} initiatorUserId=${user.id}`);
            playPrompt(twiml, req, "live_connect_unavailable.mp3",
              "That caller is not available for a live connection.");
            twiml.redirect("/voice/browse-profiles");
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // All checks passed — prompt initiator to record a brief invite message.
          // The invite is created once the recording is complete.
          console.log(`[live-connect] ALL CHECKS PASSED (default): userId=${user.id} → targetUserId=${profileUserId}. Prompting for invite message recording.`);
          playPrompt(twiml, req, "live_connect_record_invite.mp3",
            "After the tone, record a brief message for this caller. Press any key when you are finished. You have 30 seconds.");
          twiml.record({
            maxLength: 30,
            playBeep: true,
            finishOnKey: "0123456789*#",
            action: `/voice/live-connect-record-invite-done?targetUserId=${encodeURIComponent(profileUserId)}`,
          });
        }
      } else if (digit === "4") {
        // ── Block this caller ───────────────────────────────────────────────
        const fromNumber = req.body?.From as string;
        if (fromNumber && profileUserId) {
          const user = await getOrCreateUser(fromNumber);
          await storage.blockUser(user.id, profileUserId);
          console.log(`[voice] handle-profile-menu: userId=${user.id} blocked profileUserId=${profileUserId}`);
          runBlockAutoChecks(profileUserId).catch(console.error);
        }
        playPrompt(twiml, req, "caller_blocked.mp3", "Caller blocked. You will no longer hear this caller's profile.");
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "5") {
        // ── Play previous profile ───────────────────────────────────────────
        const previousProfileUserId = req.query.previousProfileUserId as string | undefined;
        const callSid = req.body?.CallSid as string | undefined;
        const browseState = callSid ? await getBrowseState(callSid) : null;
        const resolvedPreviousProfileUserId =
          previousProfileUserId ||
          browseState?.previousLastPlayedProfile?.userId ||
          null;
        if (resolvedPreviousProfileUserId) {
          twiml.redirect(`/voice/browse-profiles?targetUserId=${encodeURIComponent(resolvedPreviousProfileUserId)}`);
        } else {
          playPrompt(twiml, req, "invalid_choice.mp3", "There is no previous greeting yet.");
          twiml.redirect("/voice/browse-profiles");
        }
      } else if (digit === "6") {
        // ── Hear this caller's location ─────────────────────────────────────
        if (profileUserId) {
          const callSid = req.body?.CallSid as string;
          const [targetUser, targetProfile] = await Promise.all([
            storage.getUserById(profileUserId),
            storage.getProfile(profileUserId),
          ]);

          let zipEntry = targetUser?.zipCodeId
            ? await storage.getZipEntryById(targetUser.zipCodeId)
            : null;

          // For seeded (admin-uploaded) profiles, fall back to the caller's
          // region default zip code so the location sounds local.
          if (!zipEntry && targetProfile?.isAdminUploaded && callSid) {
            const regionId = (await storage.getCallerByCallSid(callSid))?.regionId;
            if (regionId) {
              const region = await storage.getRegionById(regionId);
              if (region?.defaultZipCode) {
                zipEntry = await storage.getZipEntryByCode(region.defaultZipCode) ?? null;
              }
            }
          }

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
            playPrompt(locationGather, req, locationToFilename(location),
              `This caller is located in ${location}. To send them a message, press 1.`);
          } else {
            playPrompt(locationGather, req, "location_not_available_send.mp3", "This caller's location is not available. To send them a message, press 1.");
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
          runFlagAutoChecks("profile", profileUserId, profileUserId).catch(console.error);
        }
        playPrompt(twiml, req, "profile_flagged.mp3", "This profile has been flagged for review. Thank you.");
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "8") {
        // ── Busted Game bust attempt (one chance only) ───────────────────────
        const callSid8 = req.body?.CallSid as string;
        const bustResult = engagementEngine.processBust(callSid8, profileUserId ?? "");
        if (bustResult.result === "win") {
          // Award bonus time — amount depends on billing mode
          const bustSettings = await getMembershipSettingsCached();
          const bonusSeconds = bustSettings.billingMode === "per_day" ? 3600 : 900;
          const fromNumber8 = req.body?.From as string;
          if (fromNumber8) {
            const winUser = await getOrCreateUser(fromNumber8);
            await storage.adjustUserCredits(winUser.id, bonusSeconds);
            console.log(`[engagement] Bust WIN: userId=${winUser.id} +${bonusSeconds}s (billingMode=${bustSettings.billingMode})`);
          }
          const bonusLabel = bustSettings.billingMode === "per_day"
            ? "one hour of bonus time"
            : "fifteen bonus minutes";
          const winHost = engagementEngine.getActivePersonalityName(callSid8);
          twiml.say(`${winHost} here. You got it! That was our A I voice. ${bonusLabel} has been added to your account. Nice ear.`);
          twiml.redirect("/voice/browse-profiles");
        } else if (bustResult.result === "miss") {
          const missHost = engagementEngine.getActivePersonalityName(callSid8);
          twiml.say(`${missHost} here. Oh, that one was real! You had one shot and missed it. Better luck next time. Back to browsing.`);
          twiml.redirect("/voice/browse-profiles");
        } else {
          // No active game — treat as invalid choice
          playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
          twiml.redirect("/voice/browse-profiles");
        }
      } else if (digit === "9") {
        // Exiting the male box — in per-minute billing notify caller deductions have stopped.
        // In per-day, per_24h billing or free mode, time is not deducted per-call, so skip the announcement.
        const boothExitSettings = await getMembershipSettingsCached();
        if (boothExitSettings.billingMode !== "per_day" && boothExitSettings.billingMode !== "per_24h" && !boothExitSettings.freeMode) {
          playPrompt(twiml, req, "time_deduction_stop.mp3",
            "Time is no longer being deducted from your membership.");
        }
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

  // ─── Connector Idle Timeout ──────────────────────────────────────────────
  // Fires when a caller makes no selection after a greeting + options prompt.
  // attempt=1 → repeat the menu once more
  // attempt=2 → play goodbye message and disconnect
  app.post("/voice/connector-timeout", async (req, res) => {
    const twiml = new VoiceResponse();
    const profileUserId = (req.query.profileUserId as string) || "";
    const previousProfileUserId = (req.query.previousProfileUserId as string) || "";
    const attempt = parseInt((req.query.attempt as string) || "1", 10);

    try {
      const fromNumber = req.body?.From as string | undefined;
      if (fromNumber && profileUserId) {
        const user = await getOrCreateUser(fromNumber);
        if (await storage.isUserBlocked(user.id, profileUserId)) {
          twiml.redirect("/voice/browse-profiles");
          res.type("text/xml");
          return res.send(twiml.toString());
        }
      }

      if (attempt >= 2) {
        playPrompt(twiml, req, "connector_idle_goodbye.mp3",
          "You're apparently having issues right now, or have fallen asleep. Sweet dreams.");
        twiml.hangup();
      } else {
        const repeatGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-profile-menu?profileUserId=${encodeURIComponent(profileUserId)}&previousProfileUserId=${encodeURIComponent(previousProfileUserId)}`,
          timeout: 10,
        });
        playPrompt(repeatGather, req, "profile_options.mp3",
          "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu.");
        twiml.redirect(`/voice/connector-timeout?profileUserId=${encodeURIComponent(profileUserId)}&previousProfileUserId=${encodeURIComponent(previousProfileUserId)}&attempt=2`);
      }
    } catch (error) {
      console.error("[voice] /voice/connector-timeout error:", error);
      twiml.redirect("/voice/browse-profiles");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Engagement Engine Interrupt ─────────────────────────────────────────
  // Plays a personality-driven voice line between profile plays, then optionally
  // starts the Busted game before redirecting back to browse-profiles.
  app.post("/voice/engagement-interrupt", async (req, res) => {
    const twiml = new VoiceResponse();
    try {
      const callSid = req.body?.CallSid as string;
      const rawText = req.query.text as string;
      const followUp = (req.query.followUp as string) ?? "";
      const promptId = req.query.pid as string ?? "";
      const promptText = rawText ? decodeURIComponent(rawText) : "";

      if (promptText) {
        // Use pre-generated Roger audio file if it exists, otherwise fall back to twiml.say
        const rogerAudioFile = promptId ? path.join(UPLOADS_DIR, `roger_${promptId}.mp3`) : null;
        if (rogerAudioFile && fs.existsSync(rogerAudioFile)) {
          twiml.play(`${baseUrl(req)}/uploads/roger_${promptId}.mp3`);
          console.log(`[engagement-interrupt] Playing Roger audio file: roger_${promptId}.mp3`);
        } else {
          const hostName = callSid ? engagementEngine.getActivePersonalityName(callSid) : "Roger";
          twiml.say({ voice: "alice" }, `${hostName} here. ${promptText}`);
        }

        // Record this prompt in per-caller history so Roger never repeats within 24 h
        const fromNumber = req.body?.From as string;
        if (promptId && fromNumber) {
          storage.recordRogerPromptPlay(fromNumber, promptId).catch(err =>
            console.error("[roger-history] failed to record prompt play:", err),
          );
        }
      }

      if (followUp === "start_game" && callSid) {
        try {
          const targetUserId = engagementEngine.startBustedGame(callSid);
          if (targetUserId) {
            console.log(`[engagement] Busted game started for callSid=${callSid}, AI imposter will be injected at a random queue position`);
          }
        } catch (err) {
          console.error("[engagement] engagement-interrupt: failed to start game:", err);
        }
      }

      twiml.redirect("/voice/browse-profiles");
    } catch (error) {
      console.error("[voice] /voice/engagement-interrupt error:", error);
      twiml.redirect("/voice/browse-profiles");
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
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${profileUserId}` });
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

  // ─── 8a-pre. Live Connect: Receive Invite Recording, Create Invite ──────────
  // Caller A lands here after Twilio records their brief invite message.
  // We create the pending invite then redirect into the ringing wait loop.
  app.post("/voice/live-connect-record-invite-done", async (req, res) => {
    const twiml = new VoiceResponse();
    const targetUserId = req.query.targetUserId as string;
    const fromNumber   = req.body?.From     as string;
    const callSid      = req.body?.CallSid  as string;
    const recordingUrl = req.body?.RecordingUrl as string | undefined;

    try {
      if (!targetUserId || !fromNumber || !callSid) {
        playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to profiles.");
        twiml.redirect("/voice/browse-profiles");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const user          = await getOrCreateUser(fromNumber);
      const callerProfile = await storage.getProfile(user.id);
      const conferenceRoom = `live-${callSid}`;

      pendingLiveInvites.set(targetUserId, {
        initiatorCallSid:          callSid,
        initiatorUserId:           user.id,
        initiatorNameRecordingUrl: callerProfile?.nameRecordingUrl ?? null,
        initiatorGreetingUrl:      callerProfile?.recordingUrl ?? "",
        inviteMessageUrl:          recordingUrl ?? null,
        conferenceRoom,
        createdAt: Date.now(),
        status:    "pending",
      });

      console.log(`[live-connect] Invite created with message: userId=${user.id} → targetUserId=${targetUserId}, room=${conferenceRoom}, hasMessage=${!!recordingUrl}`);

      // Announce the call then enter the ringing wait loop
      twiml.redirect(`/voice/live-connect-wait?targetUserId=${encodeURIComponent(targetUserId)}`);
    } catch (error) {
      console.error("[live-connect] record-invite-done error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to profiles.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 8a. Live Connect: Initiator Wait Loop ────────────────────────────────
  // Caller A lands here after creating the invite. Announces the call then
  // loops a 10-second ringing clip for up to 60 seconds (6 iterations).
  // If B accepts mid-ring the Twilio REST API redirects A's call to
  // /voice/live-connect-join, interrupting the audio.
  app.post("/voice/live-connect-wait", async (req, res) => {
    const twiml = new VoiceResponse();
    const targetUserId = req.query.targetUserId as string;
    // `ringCount` tracks how many 10-second ringing clips have already played (0 = first visit)
    const ringCount = parseInt((req.query.ringCount as string) ?? "0", 10) || 0;
    const MAX_RING_LOOPS = 6; // 6 × 10 s = 60 seconds maximum

    try {
      const invite = pendingLiveInvites.get(targetUserId);

      if (!invite) {
        // Invite was cleaned up (timed out or already handled)
        playPrompt(twiml, req, "live_connect_failed.mp3",
          "We were unable to connect your call. Returning you to the male box.");
        twiml.redirect("/voice/browse-profiles");
      } else if (invite.status === "accepted") {
        // B accepted — bridge the conference
        playPrompt(twiml, req, "live_connect_connecting.mp3",
          "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!");
        const dial = twiml.dial({ action: `/voice/live-connect-complete?role=initiator&targetUserId=${encodeURIComponent(targetUserId)}&initiatorUserId=${encodeURIComponent(invite.initiatorUserId)}&room=${encodeURIComponent(invite.conferenceRoom)}` });
        (dial.conference as any)(invite.conferenceRoom, {
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
          beep: false,
        });
      } else if (invite.status === "declined") {
        // B explicitly declined
        pendingLiveInvites.delete(targetUserId);
        playPrompt(twiml, req, "live_connect_declined.mp3",
          "The caller has declined your invitation. Returning to profiles.");
        twiml.redirect("/voice/browse-profiles");
      } else if (ringCount >= MAX_RING_LOOPS || Date.now() - invite.createdAt > LIVE_INVITE_TTL_MS) {
        // Ringing timed out without an answer
        pendingLiveInvites.delete(targetUserId);
        playPrompt(twiml, req, "live_connect_no_answer.mp3",
          "The caller did not answer. Returning to profiles.");
        twiml.redirect("/voice/browse-profiles");
      } else {
        // Still pending — on the first loop announce the call, then ring
        if (ringCount === 0) {
          const targetProfile = await storage.getProfile(targetUserId).catch(() => null);
          playPrompt(twiml, req, "calling.mp3", "Calling");
          if (targetProfile?.nameRecordingUrl) {
            safePlayRecording(twiml, targetProfile.nameRecordingUrl, req, "");
          }
          playPrompt(twiml, req, "now.mp3", "now.");
        }
        // Play the ringing clip if it exists; always guarantee a 10-second pause so the
        // wait loop does not race through instantly when the audio file is missing.
        const cat = getRawSiteSettingsCache()?.siteCategory?.toLowerCase() ?? "mm";
        const ringFileCat  = path.join(UPLOADS_DIR, cat, "live_connect_ringing.mp3");
        const ringFileRoot = path.join(UPLOADS_DIR, "live_connect_ringing.mp3");
        if (fs.existsSync(ringFileCat)) {
          twiml.play(`${baseUrl(req)}/uploads/${cat}/live_connect_ringing.mp3`);
        } else if (fs.existsSync(ringFileRoot)) {
          twiml.play(`${baseUrl(req)}/uploads/live_connect_ringing.mp3`);
        } else {
          // No ringing audio uploaded yet — wait 10 seconds via <Pause> so Twilio can
          // interrupt this leg via REST API when Caller B accepts.
          twiml.pause({ length: 10 });
        }
        // Loop back and increment the counter
        twiml.redirect(`/voice/live-connect-wait?targetUserId=${encodeURIComponent(targetUserId)}&ringCount=${ringCount + 1}`);
      }
    } catch (error) {
      console.error("[live-connect] live-connect-wait error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the male box.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 8b. Live Connect: Invitee Response ───────────────────────────────────
  // Caller B sees the invite and responds here.
  // digit 1 → connect live (accept)
  // digit 2 → reply with a message (decline + record)
  // digit 3 → skip (decline, return to browse)
  // digit 4 → hear last message you sent them, then re-show invite
  // digit 7 → block the initiator
  // digit 8 → hear initiator's location, then re-show invite
  // digit 9 → repeat (re-show the full invite sequence)
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
        // ── Accept / Connect live ────────────────────────────────────────────
        invite.status = "accepted";
        liveConnectionUserIds.add(user.id);
        liveConnectionUserIds.add(invite.initiatorUserId);
        liveConnectionCallSidMap.set(callSid, user.id);
        liveConnectionCallSidMap.set(invite.initiatorCallSid, invite.initiatorUserId);

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (accountSid && authToken) {
          try {
            const client = twilio(accountSid, authToken);
            const joinUrl = `${baseUrl(req)}/voice/live-connect-join?room=${encodeURIComponent(room)}&targetUserId=${encodeURIComponent(user.id)}&initiatorUserId=${encodeURIComponent(invite.initiatorUserId)}`;
            await client.calls(invite.initiatorCallSid).update({ url: joinUrl, method: "POST" });
            console.log(`[live-connect] Redirected initiator ${invite.initiatorCallSid} to conference ${room}`);
            startLiveBilling(
              room,
              invite.initiatorCallSid, callSid,
              invite.initiatorUserId, user.id,
              baseUrl(req),
            );
          } catch (err) {
            console.error("[live-connect] Failed to redirect initiator via REST API:", err);
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

        playPrompt(twiml, req, "live_connect_connecting.mp3",
          "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!");
        const dial = twiml.dial({ action: `/voice/live-connect-complete?role=invitee&targetUserId=${encodeURIComponent(user.id)}&initiatorUserId=${encodeURIComponent(invite.initiatorUserId)}&room=${encodeURIComponent(room)}` });
        (dial.conference as any)(room, {
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
          beep: false,
          maxParticipants: 2,
        });

      } else if (digit === "2") {
        // ── Reply with a message ─────────────────────────────────────────────
        invite.status = "declined";
        pendingLiveInvites.delete(user.id);
        console.log(`[live-connect] Invite declined (reply chosen) by userId=${user.id}`);
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${encodeURIComponent(initiatorUserId)}&returnTo=browse-profiles` });

      } else if (digit === "3") {
        // ── Skip (decline) ───────────────────────────────────────────────────
        invite.status = "declined";
        pendingLiveInvites.delete(user.id);
        console.log(`[live-connect] Invite skipped by userId=${user.id}`);
        twiml.redirect("/voice/browse-profiles");

      } else if (digit === "4") {
        // ── Hear last message you sent them ──────────────────────────────────
        const lastMsg = await storage.getLastSentMessageToUser(user.id, initiatorUserId);
        const replayGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-live-invite?initiatorUserId=${encodeURIComponent(initiatorUserId)}&room=${encodeURIComponent(room)}`,
          timeout: 20,
        });
        if (lastMsg?.recordingUrl) {
          playPrompt(replayGather, req, "last_message_sent.mp3", "Last message you sent this caller.");
          replayGather.pause({ length: 1 });
          safePlayRecording(replayGather, lastMsg.recordingUrl, req, "");
        } else {
          playPrompt(replayGather, req, "no_messages_yet.mp3", "You have not sent this caller any messages.");
        }
        playPrompt(replayGather, req, "live_invite_options.mp3",
          "To connect live with this caller press 1. To reply with a message press 2. " +
          "To skip press 3. To hear the last message you sent them press 4. " +
          "To block this caller press 7. To hear this caller's location press 8. " +
          "To repeat these choices press 9.");
        twiml.redirect("/voice/browse-profiles");

      } else if (digit === "7") {
        // ── Block the invite initiator ───────────────────────────────────────
        invite.status = "declined";
        pendingLiveInvites.delete(user.id);
        await storage.markAllMessagesReadFromSender(initiatorUserId, user.id);
        await storage.blockUser(user.id, initiatorUserId);
        console.log(`[live-connect] handle-live-invite: userId=${user.id} blocked initiatorUserId=${initiatorUserId}`);
        runBlockAutoChecks(initiatorUserId).catch(console.error);
        playPrompt(twiml, req, "caller_blocked.mp3", "Caller blocked. You will no longer hear this caller's profile.");
        twiml.redirect("/voice/browse-profiles");

      } else if (digit === "8") {
        // ── Hear this caller's location ──────────────────────────────────────
        const initiatorUser = await storage.getUserById(initiatorUserId);
        let location: string | null = null;
        if (initiatorUser?.zipCodeId) {
          const zipEntry = await storage.getZipEntryById(initiatorUser.zipCodeId);
          if (zipEntry?.latitude != null && zipEntry?.longitude != null) {
            location = await reverseGeocodeNeighborhood(zipEntry.latitude, zipEntry.longitude);
          }
          if (!location) location = zipEntry?.neighborhood || zipEntry?.city || null;
        }
        const locationGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-live-invite?initiatorUserId=${encodeURIComponent(initiatorUserId)}&room=${encodeURIComponent(room)}`,
          timeout: 20,
        });
        if (location) {
          playPrompt(locationGather, req, locationToFilename(location),
            `This caller is located in ${location}.`);
        } else {
          playPrompt(locationGather, req, "location_not_available.mp3", "This caller's location is not available.");
        }
        playPrompt(locationGather, req, "live_invite_options.mp3",
          "To connect live with this caller press 1. To reply with a message press 2. " +
          "To skip press 3. To hear the last message you sent them press 4. " +
          "To block this caller press 7. To hear this caller's location press 8. " +
          "To repeat these choices press 9.");
        twiml.redirect("/voice/browse-profiles");

      } else if (digit === "9") {
        // ── Repeat — send back to browse-profiles which re-shows the invite ──
        twiml.redirect("/voice/browse-profiles");

      } else {
        playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[live-connect] handle-live-invite error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the male box.");
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
        maxParticipants: 2,
      });
    } catch (error) {
      console.error("[live-connect] live-connect-join error:", error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the male box.");
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
      "Your live connection has ended. Returning you to the male box.");
    twiml.redirect("/voice/browse-profiles");

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 8e. Live Connect: Low Balance Warning (per-participant) ─────────────
  // Twilio calls this via announceUrl on the specific participant's conference leg.
  // Only that participant hears it — the other caller is unaffected.
  app.post("/voice/live-low-balance-warning", (_req, res) => {
    const twiml = new VoiceResponse();
    playPrompt(twiml, _req, "live_time_warning.mp3", "Warning: you have less than 5 minutes remaining. Please note your live connection will end when your time expires.");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 9a. Review Message (play back + confirm before sending) ─────────────
  // Keyed by CallSid so each active call has its own pending recording.
  const pendingMessages = new Map<string, {
    recordingUrl: string; toUserId: string; returnTo: string; category: string;
  }>();

  function cancelReturnPath(returnTo: string, category: string): string {
    if (returnTo === "mailbox") return "/voice/my-mailbox";
    if (returnTo === "voicemail-inbox") return "/voice/voicemail-inbox";
    if (returnTo === "voicemail-saved") return "/voice/voicemail-saved";
    if (returnTo === "category" && category) return `/voice/browse-category-ads?category=${category}`;
    return "/voice/browse-profiles";
  }

  async function advanceBrowseQueueAfterMessage(callSid: string, toUserId: string, returnTo: string): Promise<void> {
    if (!callSid || !toUserId) return;
    const state = await getBrowseState(callSid);
    if (!state) return;
    if (!state.seenUserIds.includes(toUserId)) {
      state.seenUserIds.push(toUserId);
    }
    state.queue = state.queue.filter(p => p.userId !== toUserId);
    await setBrowseState(callSid, state);
    console.log(`[voice] advanceBrowseQueueAfterMessage: advanced past userId=${toUserId} for callSid=${callSid}`);
  }

  app.post("/voice/review-message", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const rawRecordingUrl = req.body?.RecordingUrl as string;
    const duration = parseInt(req.body?.RecordingDuration || "0", 10);
    const toUserId = req.query.toUserId as string;
    const returnTo = (req.query.returnTo as string) || "";
    const category = (req.query.category as string) || "";

    try {
      if (!rawRecordingUrl || duration === 0) {
        playPrompt(twiml, req, "no_recording.mp3", "No recording was detected.");
        twiml.redirect(cancelReturnPath(returnTo, category));
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const recordingUrl = await downloadRecording(rawRecordingUrl);
      pendingMessages.set(callSid, { recordingUrl, toUserId, returnTo, category });

      const gather = twiml.gather({
        numDigits: 1,
        action: `/voice/handle-review-message`,
        timeout: 10,
      });
      playPrompt(gather, req, "review_your_message.mp3", "Here is your recorded message.");
      gather.pause({ length: 2 });
      safePlayRecording(gather, recordingUrl, req, "");
      playPrompt(gather, req, "send_or_cancel.mp3", "Press 1 to send. Press 2 to cancel.");
      // No input → cancel
      twiml.redirect(cancelReturnPath(returnTo, category));
    } catch (err) {
      console.error("[voice] /voice/review-message error:", err);
      twiml.redirect(cancelReturnPath(returnTo, category));
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-review-message", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits as string;
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;

    const pending = pendingMessages.get(callSid);
    if (!pending) {
      playPrompt(twiml, req, "error_generic.mp3", "Your session has expired. Returning to main menu.");
      twiml.redirect("/voice/main-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const { recordingUrl, toUserId, returnTo, category } = pending;

    try {
      if (digit === "1") {
        // Send the message
        pendingMessages.delete(callSid);
        const user = await getOrCreateUser(fromNumber);
        if (returnTo === "mailbox" || returnTo === "category" || returnTo === "voicemail-inbox" || returnTo === "voicemail-saved") {
          await syncBilling(callSid);
        }
        // Block check: if the recipient has blocked this caller, silently discard the message
        const recipientBlockedSender = toUserId ? await storage.isUserBlocked(toUserId, user.id) : false;
        if (recipientBlockedSender) {
          console.log(`[voice] handle-review-message: message discarded — toUserId=${toUserId} has blocked userId=${user.id}`);
          await advanceBrowseQueueAfterMessage(callSid, toUserId, returnTo);
          engagementEngine.trackMessageSent(callSid);
          // Play neutral "message sent" so the blocked caller doesn't know they're blocked
          playPrompt(twiml, req, "message_sent.mp3", "Your message has been sent. Returning to profiles.");
          twiml.redirect(cancelReturnPath(returnTo, category));
          res.type("text/xml");
          return res.send(twiml.toString());
        }
        const sentMessage = await storage.createMessage({ fromUserId: user.id, toUserId, recordingUrl });
        await advanceBrowseQueueAfterMessage(callSid, toUserId, returnTo);
        engagementEngine.trackMessageSent(callSid);
        // Queue sent message for human admin review
        storage.createFlaggedItem({
          contentType: "message",
          contentId: String(sentMessage.id),
          reason: "New voice message — pending human review",
          status: "pending",
          reportedByUserId: null,
        }).catch((err) => console.error("[voice] flaggedItem (message) creation error:", err));
        if (returnTo === "mailbox") {
          playPrompt(twiml, req, "message_sent.mp3", "Your message has been sent. Returning to your mailbox.");
          twiml.redirect("/voice/my-mailbox");
        } else if (returnTo === "voicemail-inbox") {
          playPrompt(twiml, req, "message_sent.mp3", "Your reply has been sent.");
          twiml.redirect("/voice/voicemail-inbox");
        } else if (returnTo === "voicemail-saved") {
          playPrompt(twiml, req, "message_sent.mp3", "Your reply has been sent.");
          twiml.redirect("/voice/voicemail-saved");
        } else if (returnTo === "category" && category) {
          playPrompt(twiml, req, "message_sent.mp3", "Your message has been sent. Returning to ads.");
          twiml.redirect(`/voice/browse-category-ads?category=${category}`);
        } else {
          playPrompt(twiml, req, "message_sent.mp3", "Your message has been sent. Returning to profiles.");
          twiml.redirect("/voice/browse-profiles");
        }
      } else if (digit === "2") {
        // Cancel — discard recording and return
        pendingMessages.delete(callSid);
        playPrompt(twiml, req, "message_cancelled.mp3", "Message cancelled.");
        twiml.redirect(cancelReturnPath(returnTo, category));
      } else {
        // Invalid — re-prompt
        const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-review-message", timeout: 10 });
        playPrompt(gather, req, "send_or_cancel.mp3", "Press 1 to send. Press 2 to cancel.");
        twiml.redirect(cancelReturnPath(returnTo, category));
      }
    } catch (err) {
      console.error("[voice] /voice/handle-review-message error:", err);
      pendingMessages.delete(callSid);
      twiml.redirect(cancelReturnPath(returnTo, category));
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 9b. Save Message (legacy direct path — kept for safety) ─────────────
  app.post("/voice/save-message", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From;
      const callSid = req.body?.CallSid as string;
      const rawRecordingUrl = req.body?.RecordingUrl;
      const toUserId = req.query.toUserId as string;

      if (!fromNumber || !rawRecordingUrl || !toUserId) {
        throw new Error(`Missing fields: From=${fromNumber}, RecordingUrl=${rawRecordingUrl}, toUserId=${toUserId}`);
      }

      const recordingUrl = await downloadRecording(rawRecordingUrl);
      const returnTo = req.query.returnTo as string;
      const category = req.query.category as string;
      const user = await getOrCreateUser(fromNumber);

      // Mailbox reply: billing is per-minute on the recording time.
      // syncBilling captures the time elapsed during the recording (reply to ad).
      if (returnTo === "mailbox" || returnTo === "category") {
        await syncBilling(callSid);
      }

      await storage.createMessage({ fromUserId: user.id, toUserId, recordingUrl });
      await advanceBrowseQueueAfterMessage(callSid, toUserId, returnTo);
      engagementEngine.trackMessageSent(callSid);
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
    playPrompt(gather, req, "info_menu_v2.mp3", "Information, prices, and membership. Press 1 for membership questions. To learn how the Male Box knows which callers are closest to you, press 2. Press 9 to return to the main menu.");
    twiml.redirect("/voice/info-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-info-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "1") {
      twiml.redirect("/voice/membership-questions");
    } else if (digit === "2") {
      twiml.redirect("/voice/closest-callers-info");
    } else if (digit === "9") {
      twiml.redirect("/voice/main-menu");
    } else {
      playPrompt(twiml, req, "invalid_choice.mp3", "Invalid choice.");
      twiml.redirect("/voice/info-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/closest-callers-info", async (req, res) => {
    const twiml = new VoiceResponse();
    playPrompt(twiml, req, "closest_callers_info.mp3",
      "Here is how the Male Box finds callers closest to you. " +
      "If we have your ZIP code, we use it to play nearby callers first when they are available. " +
      "Your exact location is never announced, and other callers do not get your phone number or private information. " +
      "If no nearby callers are available, you will still hear other active callers so the line keeps moving."
    );
    twiml.redirect("/voice/info-menu");
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
      "We offer three membership options: a day pass, a 14 day membership, and a 30 day membership. " +
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
      "A day pass is 3 dollars and expires 24 hours after purchase, regardless of how much you use the line. " +
      "A 14 day membership is 10 dollars. " +
      "A 30 day membership is 25 dollars. " +
      "To purchase, press 3 from the membership menu."
    );
    twiml.redirect("/voice/membership-questions");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 14. Membership Purchase ──────────────────────────────────────────────
  // Pass-through to purchase-pre-menu, which dynamically reads package prices
  // from admin settings. The old hardcoded audio file is no longer used.
  app.post("/voice/membership-purchase", (req, res) => {
    const twiml = new VoiceResponse();
    twiml.redirect("/voice/purchase-pre-menu");
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
      packageDisplayName: pkg.displayName,
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
    const settings = await getMembershipSettingsCached();
    const billingMode = settings.billingMode;

    let dynamicPart: string;
    if (billingMode === 'per_24h') {
      const planName = session.packageDisplayName;
      dynamicPart = session.isFirstPurchase
        ? `the ${planName} package — plus a bonus ${planName} pass for your first purchase, for ${session.priceLabel}.`
        : `the ${planName} package for ${session.priceLabel}.`;
    } else if (billingMode === 'per_day') {
      const days = Math.round(mins / 1440);
      dynamicPart = session.isFirstPurchase
        ? `${session.packageLabel} — plus ${session.packageLabel} bonus for your first purchase, giving you ${days * 2} day${days * 2 !== 1 ? 's' : ''} total, for ${session.priceLabel}.`
        : `${session.packageLabel} for ${session.priceLabel}.`;
    } else {
      dynamicPart = session.isFirstPurchase
        ? `${mins.toLocaleString()} minutes — plus ${mins.toLocaleString()} bonus minutes for your first purchase, giving you ${(mins * 2).toLocaleString()} minutes total, for ${session.priceLabel}.`
        : `${mins.toLocaleString()} minutes for ${session.priceLabel}.`;
    }

    const gather = twiml.gather({ numDigits: 1, finishOnKey: "", action: "/voice/handle-confirm-package" });
    if (session.isFirstPurchase) {
      playPrompt(gather, req, "package_confirm_bonus_prefix.mp3", "Great choice! You selected");
    } else {
      playPrompt(gather, req, "package_confirm_prefix.mp3", "You selected");
    }
    gather.say(dynamicPart);
    playPrompt(gather, req, "package_confirm_suffix.mp3", "If this is correct press one. To select a different package press two.");
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
    playPrompt(gather, req, "payment_intro.mp3",
      "Your purchase, plus any applicable fees and taxes, will appear on your credit card statement as Toby Media. " +
      "When entering your card information: to correct an incorrect number, press star to delete the last digit entered. " +
      "To start over, press the star key twice. " +
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

  // ─── Run Payment (REST API approach) ──────────────────────────────────────
  // Uses the Twilio Payments REST API instead of <Pay> TwiML so we get real
  // error codes if the account/connector is misconfigured.
  app.post("/voice/run-payment", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;

    try {
      const session = paymentSessions.get(callSid);
      if (!session) {
        console.warn(`[voice] run-payment: no session found for callSid=${callSid}`);
        playPrompt(twiml, req, "payment_session_expired.mp3", "Your session has expired. Please start again.");
        twiml.redirect("/voice/purchase-pre-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const connectorName = process.env.TWILIO_PAY_CONNECTOR;
      if (!process.env.STRIPE_SECRET_KEY || !connectorName) {
        console.error(`[voice] run-payment: payment not configured — STRIPE_SECRET_KEY=${!!process.env.STRIPE_SECRET_KEY} TWILIO_PAY_CONNECTOR=${!!connectorName}`);
        playPrompt(twiml, req, "payment_failed.mp3",
          "Our payment system is not currently configured. Please contact customer support to complete your purchase.");
        twiml.redirect("/voice/main-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const chargeAmount = (session.packagePriceCents / 100).toFixed(2);
      console.log(`[voice] run-payment: launching <Pay> connector=${connectorName} amount=$${chargeAmount} callSid=${callSid}`);

      // Now that Pay is enabled, use <Pay> TwiML — it handles all prompting automatically.
      const pay = twiml.pay({
        action: `${baseUrl(req)}/voice/handle-payment-complete`,
        statusCallback: `${baseUrl(req)}/voice/payment-status`,
        chargeAmount,
        currency: "usd",
        description: `${session.packageLabel} Membership - VOICE PROTOCOL`,
        paymentConnector: connectorName,
        securityCode: true,
        timeout: 30,
        maxAttempts: 2,
      } as any) as any;

      playPrompt(pay.prompt({ ["for"]: "cardNumber" }), req, "collect_card_number.mp3",
        "Please enter your 16-digit card number, then press pound.");
      playPrompt(pay.prompt({ ["for"]: "expirationDate" }), req, "collect_card_expiry.mp3",
        "Enter your expiration date, then press pound. Enter the 2-digit month followed by the last 2 digits of the year.");
      playPrompt(pay.prompt({ ["for"]: "securityCode" }), req, "collect_security_code.mp3",
        "Enter your 3 or 4 digit security code, then press pound.");

    } catch (err: any) {
      const errStatus = err.status ?? "?";
      const errCode = err.code ?? "?";
      const errMsg = err.message ?? "unknown";
      console.error(`[voice] run-payment: REST API FAILED status=${errStatus} code=${errCode} message=${errMsg}`);
      paymentSessions.delete(callSid);
      playPrompt(twiml, req, "payment_failed.mp3",
        "We encountered an error processing your payment. Please try again or contact customer support.");
      twiml.redirect("/voice/main-menu");
    }

    const twimlStr = twiml.toString();
    console.log(`[voice] run-payment: TwiML sent → ${twimlStr}`);
    res.type("text/xml");
    res.send(twimlStr);
  });

  // ─── Pay Status Callback ───────────────────────────────────────────────────
  // Twilio POSTs here for every payment field captured and for the final result.
  app.post("/voice/payment-status", async (req, res) => {
    console.log(`[voice] payment-status: ${JSON.stringify(req.body)}`);

    const callSid    = req.body?.CallSid as string;
    const status     = (req.body?.Result ?? req.body?.Status ?? "") as string;
    const errorCode  = req.body?.ErrorCode as string | undefined;
    const fromNumber = req.body?.From as string;
    const base       = baseUrl(req);

    const FINAL = [
      "payment-connector-success",
      "payment-connector-error",
      "payment-timeout",
      "payment-card-decline-limit-reached",
      "success",
      "failed",
    ];

    if (!FINAL.includes(status)) {
      // Mid-session capture event — nothing to do yet
      return res.sendStatus(204);
    }

    const session = paymentSessions.get(callSid);
    paymentSessions.delete(callSid);

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken  = process.env.TWILIO_AUTH_TOKEN!;
    const client     = twilio(accountSid, authToken);

    if ((status === "payment-connector-success" || status === "success") && session) {
      try {
        const user = await getOrCreateUser(fromNumber);
        const packages = await getMembershipPackages();
        const pkg = Object.values(packages).find(p => p.name === session.packageName);
        const baseMinutes = pkg?.minutes ?? (await getMembershipSettingsCached()).plan3Minutes;
        const bonusMinutes = session.isFirstPurchase ? baseMinutes : 0;
        const totalMinutes = baseMinutes + bonusMinutes;
        const totalSeconds = totalMinutes * 60;

        const membershipUpdate: Parameters<typeof storage.updateUserMembership>[1] = {
          membershipTier: session.packageName,
          remainingSeconds: totalSeconds,
        };

        if (!user.membershipNumber) {
          const membershipNumber = await generateUniqueCardNumber();
          membershipUpdate.membershipNumber = membershipNumber;
          const card = await storage.createMembershipCard(membershipNumber, generateCardPin(), 0, "Issued on purchase");
          await storage.linkCardToPhone(card.id, fromNumber);
          console.log(`[voice] payment-status: issued card ${membershipNumber} to ${fromNumber}`);
        }

        await storage.updateUserMembership(user.id, membershipUpdate);
        await storage.getOrCreateMailbox(user.id);

        pendingPaymentResults.set(callSid, {
          success: true,
          packageLabel: session.packageLabel,
          priceLabel: session.priceLabel,
          totalMinutes,
          bonusMinutes,
        });
        console.log(`[voice] payment-status: membership activated for ${fromNumber}`);
      } catch (err) {
        console.error("[voice] payment-status: membership activation error:", err);
        pendingPaymentResults.set(callSid, { success: false, errorCode: "activation" });
      }
    } else {
      console.warn(`[voice] payment-status: payment not successful status=${status} errorCode=${errorCode ?? "—"}`);
      pendingPaymentResults.set(callSid, { success: false, errorCode });
    }

    // Redirect the live call to the result TwiML
    try {
      await client.calls(callSid).update({
        url: `${base}/voice/payment-done`,
        method: "POST",
      } as any);
    } catch (err: any) {
      console.error(`[voice] payment-status: failed to redirect call: ${err.message}`);
    }

    res.sendStatus(204);
  });

  // ─── Payment Done ──────────────────────────────────────────────────────────
  // Twilio calls here (via REST redirect) after payment completes.
  app.post("/voice/payment-done", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;

    const result = pendingPaymentResults.get(callSid);
    pendingPaymentResults.delete(callSid);

    if (result?.success) {
      playPrompt(twiml, req, "payment_success_prefix.mp3", "Payment successful! You now have");
      twiml.say(`${result.packageLabel} of access. Your card has been charged ${result.priceLabel}.`);
      if (result.bonusMinutes && result.bonusMinutes > 0 && result.totalMinutes) {
        playPrompt(twiml, req, "payment_success_bonus.mp3",
          `Plus your first purchase bonus doubles your time — enjoy ${minutesToDurationLabel(result.totalMinutes)} total!`
        );
      }
      playPrompt(twiml, req, "payment_success_suffix.mp3", "Thank you for joining. Returning to the main menu.");
      try {
        const motdCfg = await getMembershipSettingsCached();
        if (motdCfg.motdPostPurchaseEnabled && motdCfg.motdPostPurchaseText) {
          playPrompt(twiml, req, "motd_post_purchase.mp3", motdCfg.motdPostPurchaseText);
        }
      } catch (err) {
        console.error("[voice] payment-done: motd error:", err);
      }
    } else {
      const errCode = result?.errorCode;
      if (errCode === "22001") {
        playPrompt(twiml, req, "payment_declined.mp3", "Your card was declined. Please check your details and try again later.");
      } else if (errCode === "activation") {
        playPrompt(twiml, req, "payment_activation_error.mp3", "Your payment was received but there was an error activating your membership. Please contact support.");
      } else {
        playPrompt(twiml, req, "payment_failed.mp3", "We were unable to process your payment at this time. Please contact customer support.");
      }
    }

    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── Payment Timeout ───────────────────────────────────────────────────────
  // Called if the 120-second <Pause> in run-payment expires with no result.
  app.post("/voice/payment-timeout", (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    paymentSessions.delete(callSid);
    pendingPaymentResults.delete(callSid);
    console.warn(`[voice] payment-timeout: callSid=${callSid}`);
    playPrompt(twiml, req, "payment_failed.mp3", "Your payment session timed out. Please try again.");
    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 15. Payment Result Handler (legacy fallback) ─────────────────────────
  // Kept as a fallback — primary path now goes through payment-status → payment-done
  app.post("/voice/handle-payment-complete", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const result = (req.body?.Result as string) || "";
    const fromNumber = req.body?.From as string;
    const errorCode = req.body?.ErrorCode as string;
    const paymentError = req.body?.PaymentError as string | undefined;

    // Log all Twilio Pay response fields to aid debugging
    console.log(`[voice] handle-payment-complete: callSid=${callSid} Result=${result} ErrorCode=${errorCode ?? "—"} PaymentError=${paymentError ?? "—"} From=${fromNumber}`);

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
          const card = await storage.createMembershipCard(membershipNumber, generateCardPin(), 0, "Issued on purchase");
          await storage.linkCardToPhone(card.id, fromNumber);
          console.log(`[voice] Issued membership card ${membershipNumber} to ${fromNumber} on purchase`);
        }

        await storage.updateUserMembership(user.id, membershipUpdate);
        await storage.getOrCreateMailbox(user.id);

        // Split payment success into static audio parts + inline TTS for dynamic values
        // Static prefix → TTS (package + price) → optional bonus audio → static suffix
        playPrompt(twiml, req, "payment_success_prefix.mp3", "Payment successful! You now have");
        twiml.say(`${session.packageLabel} of access. Your card has been charged ${session.priceLabel}.`);
        if (bonusMinutes > 0) {
          playPrompt(twiml, req, "payment_success_bonus.mp3",
            `Plus your first purchase bonus doubles your time — enjoy ${minutesToDurationLabel(totalMinutes)} total!`
          );
        }
        playPrompt(twiml, req, "payment_success_suffix.mp3", "Thank you for joining. Returning to the main menu.");

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
      console.warn(`[voice] payment not successful — CallSid=${callSid} Result=${result} ErrorCode=${errorCode ?? "—"} PaymentError=${paymentError ?? "—"}`);
      if (result === "failed" || result === "call-interrupted") {
        // "failed" = Pay connector misconfigured or Twilio couldn't reach the connector
        // "call-interrupted" = caller hung up during card entry
        playPrompt(twiml, req, "payment_failed.mp3",
          "We were unable to process your payment at this time. Please contact customer support.");
      } else if (errorCode === "22001") {
        // Card explicitly declined by the payment processor
        playPrompt(twiml, req, "payment_declined.mp3", "Your card was declined. Please check your details and try again later.");
      } else {
        // Generic processing error (errorCode 22002 etc.)
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

      storage.removeStaleActiveCalls(20).catch(() => {});
      storage.logCall(callSid, fromNumber, region.phoneNumber, region.id).catch(() => {});
      registerStatusCallback(callSid, req).catch(() => {});

      const regionId = region.id;
      const user = await getOrCreateUser(fromNumber);
      await storage.removeActiveCallsByUser(user.id);
      await storage.registerActiveCall(callSid, user.id, regionId);
      const caller = await storage.getCallerByCallSid(callSid);
      console.log(`[voice] [${slug}] registered caller ${callSid} from ${fromNumber}`);

      if (!caller?.greetingPlayed) {
        playPrompt(twiml, req, "system_greeting.mp3",
          "Welcome to the Male Box. This service is for guys looking to connect with other local guys. No filters, no pressure — just real guys looking to connect.");
        playPrompt(twiml, req, "disclaimer.mp3",
          "The Male Box is for callers 18 and over. If that's not you, hang up now. We do not check out callers to this line, so please use common sense and caution before giving out your address or phone number.");
        await storage.markCallerGreetingPlayed(callSid);
      }
      // Hand off to the shared entry flow (account state detection + Roger greeting)
      twiml.redirect("/voice/entry");
    } catch (error) {
      console.error(`[voice] /voice/${slug} error:`, error);
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

}
