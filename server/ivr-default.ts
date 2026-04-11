import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import twilio from "twilio";
import path from "path";
import fs from "fs";
import { generateTTS, getVoiceIdForFolder } from "./elevenlabs";
import { lookupZipCode, reverseGeocodeNeighborhood } from "./zipLookup";
import { addVirtualCaller, removeVirtualCaller, getLiveVirtualUserIds } from "./simulator";
import { runFlagAutoChecks, runBlockAutoChecks, runTranscriptionAutoChecks } from "./autoModeration";
import { getMembershipSettingsCached, getSiteSettingsCached, getRawSiteSettingsCache } from "./settings-cache";
import * as engagementEngine from "./engagementEngine";
import type { MembershipSettings, MembershipCard } from "@shared/schema";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const VoiceResponse = twilio.twiml.VoiceResponse;


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

type MembershipPackage = { name: string; label: string; minutes: number; priceCents: number; priceLabel: string };

async function getMembershipPackages(): Promise<Record<string, MembershipPackage>> {
  const s = await getMembershipSettingsCached();
  return {
    "2": { name: "plan1", label: minutesToDurationLabel(s.plan1Minutes), minutes: s.plan1Minutes, priceCents: s.plan1PriceCents, priceLabel: centsToLabel(s.plan1PriceCents) },
    "3": { name: "plan2", label: minutesToDurationLabel(s.plan2Minutes), minutes: s.plan2Minutes, priceCents: s.plan2PriceCents, priceLabel: centsToLabel(s.plan2PriceCents) },
    "4": { name: "plan3", label: minutesToDurationLabel(s.plan3Minutes), minutes: s.plan3Minutes, priceCents: s.plan3PriceCents, priceLabel: centsToLabel(s.plan3PriceCents) },
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
  // Always announce in minutes — the system is per-minute based.
  playPrompt(twiml, req, "phrase_you_have.mp3", "You have");
  playNumber(twiml, req, totalMinutes);
  playPrompt(twiml, req, totalMinutes === 1 ? "phrase_minute_of_pbtr.mp3" : "phrase_minutes_of_pbtr.mp3",
    totalMinutes === 1 ? "minute remaining." : "minutes remaining.");
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
  queue: { userId: string; recordingUrl: string; nameRecordingUrl?: string | null; regionId?: string | null; regionName?: string | null }[];
  index: number;
  lastPlayedIndex: number | null; // index of the most-recently played profile (for Press 5 "go back")
  hasWrapped: boolean;        // true after the queue index cycled back to 0
  linkedRegionLoaded: boolean; // true once the caller accepted a linked-region queue
  callerRegionId: string | null;   // the region the listening caller dialed into
  callerRegionName: string | null; // human-readable name of that region
  localUserIds: string[];      // user IDs from the original local-region queue snapshot
  announcedNewLocalIds: string[]; // new local (home region) callers already announced or queued
  // Multi-region linking support
  linkedRegionSnapshots: { regionId: string; regionName: string; knownUserIds: string[] }[];
  announcedLinkedCallerIds: string[]; // user IDs announced as "new caller from [city]"
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
// Billing deducts directly from the card's value_seconds; no phone linkage occurs.
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
//   MM systems: uploads/mm/<file>  →  uploads/<file>  →  TTS (male voice, Twilio default)
//   MW systems: uploads/mw/<file>  →  TTS (female voice, Polly.Joanna)
//              ↳ MW intentionally skips the shared uploads/ root so MM audio never bleeds in.
//
// The admin Audio Manager exposes separate Shared / MM / MW folders to match this logic.
function playPrompt(
  node: { say: (...args: any[]) => any; play: (url: string) => void },
  req: Request,
  filename: string,
  fallbackText: string
): void {
  const category = getRawSiteSettingsCache()?.siteCategory?.toLowerCase();

  // Check the category-specific subfolder first (uploads/mm/ or uploads/mw/)
  if (category) {
    const catPath = path.join(UPLOADS_DIR, category, filename);
    if (fs.existsSync(catPath)) {
      node.play(`${baseUrl(req)}/uploads/${category}/${filename}`);
      return;
    }
  }

  // MW systems use a separate audio path — do not fall back to the shared uploads/ root.
  // If no MW-specific file was found above, fall back to TTS with a female voice.
  if (category === "mw") {
    if (fallbackText) node.say({ voice: "Polly.Joanna" }, fallbackText);
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

export async function registerVoiceRoutes(app: Express): Promise<void> {
  // Log all voice webhook requests
  app.use("/voice", (req: Request, _res: Response, next: NextFunction) => {
    console.log(`[voice] ${req.method} ${req.path} | From=${req.body?.From} CallSid=${req.body?.CallSid} Digits=${req.body?.Digits} CallStatus=${req.body?.CallStatus}`);
    next();
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
    if (settings.billingMode === "per_day" || isFreeModeActive(settings)) return;
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
    if (billingMode === "per_day") {
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
        // In per_day mode or free mode, calls are free — read balance without deducting.
        const liveSettings = await getMembershipSettingsCached();
        let initiatorUser: Awaited<ReturnType<typeof storage.deductSeconds>>;
        let inviteeUser: Awaited<ReturnType<typeof storage.deductSeconds>>;
        if (liveSettings.billingMode === "per_day" || isFreeModeActive(liveSettings)) {
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
      // Clean up per-caller browse queue, payment session, name recording, greeting draft, time flags, region mapping, membership override, gender selection, and engagement state
      callerBrowseState.delete(callSid);
      engagementEngine.cleanupEngagementState(callSid);
      categoryBrowseState.delete(callSid);
      paymentSessions.delete(callSid);
      pendingNameRecordings.delete(callSid);
      pendingGreetingDrafts.delete(callSid);
      callTimeAnnounced.delete(callSid);
      callWarningShown.delete(callSid);
      callRegion.delete(callSid);
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
        "Welcome to the Male Box. this service assumes no responsibility for personal meetings.");

      playPrompt(twiml, req, "disclaimer.mp3", "");

      // Play Announcement / MOTD if enabled
      const motdCfg = await getMembershipSettingsCached();
      if (motdCfg.motdEnabled && motdCfg.motdText) {
        playPrompt(twiml, req, "motd.mp3", motdCfg.motdText);
      }

      // MW systems prompt for gender before membership — women are always free.
      // MM systems go straight to optional membership number entry.
      const entrySiteConf = await getSiteSettingsCached();
      if (entrySiteConf.siteCategory === "MW") {
        twiml.redirect("/voice/gender-select");
      } else {
        twiml.redirect("/voice/membership-entry");
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
      "Guys, press one to talk to women. Women, press two to talk to guys.");
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
    } else if (digit === "2") {
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
    } catch (err) {
      console.error("[voice] membership-entry billing mode check error:", err);
    }

    const gather = twiml.gather({
      numDigits: 5,
      finishOnKey: "#",
      action: "/voice/handle-membership-entry",
      timeout: 10,
    });
    playPrompt(gather, req, "membership_entry_prompt.mp3",
      "If you have a membership card, enter your card number now. Otherwise press the pound key.");
    // No input / timeout → skip membership and continue
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
      // 5-digit calling card number — always require PIN, never link to caller's phone
      try {
        const card = await storage.getMembershipCardByNumber(digits);
        if (!card) {
          console.log(`[voice] Card not found: ${digits}`);
          playPrompt(twiml, req, "membership_invalid.mp3",
            "We could not find a card with that number. Please check your card and try again.");
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
          // No PIN set on card — grant access directly (announce time, no phone link)
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
      timeout: 10,
    });
    gather.say("Please enter your 4-digit PIN.");
    // No input / timeout → skip membership and continue
    twiml.redirect("/voice/entry-check");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-membership-card-pin-entry", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) ?? "";
    const callSid = req.body?.CallSid as string;

    const cardNumber = pendingCardFirstUse.get(callSid);
    if (!cardNumber) {
      twiml.redirect("/voice/entry-check");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      const card = await storage.getMembershipCardByNumber(cardNumber);
      if (card && card.pin && card.pin === digits) {
        pendingCardFirstUse.delete(callSid);
        // PIN correct — grant calling card access without linking to caller's phone
        callCardOverride.set(callSid, card.id);
        const minutes = Math.floor(card.valueSeconds / 60);
        console.log(`[voice] Card ${cardNumber} PIN accepted for callSid=${callSid} — ${minutes} min remaining, no phone link`);
        playPrompt(twiml, req, "membership_linked.mp3", "Card accepted.");
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
  app.post("/voice/entry-check", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From as string;
    const callSid = req.body?.CallSid as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      const remainingSeconds = user.remainingSeconds ?? 0;

      // ── Moderation gate ─────────────────────────────────────────────────────
      if (user.accountStatus === "banned") {
        twiml.say("We're sorry, your access to this service has been suspended. If you believe this is an error, please contact customer support. Goodbye.");
        twiml.hangup();
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      // ── Recording rejection gate (runs before free-mode to catch all callers) ─
      // If the auto-moderator rejected a greeting, intercept regardless of billing mode
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
        const siteConf = await getSiteSettingsCached();
        twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/mw-main-menu" : "/voice/main-menu");
      } else if (!user.membershipTier) {
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
        const siteConf = await getSiteSettingsCached();
        twiml.redirect(siteConf.siteCategory === "MW" ? "/voice/mw-main-menu" : "/voice/main-menu");
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

    if (!nameRecordingUrl || nameDuration < 1) {
      playPrompt(twiml, req, "name_retry.mp3", "We didn't catch your name. Please try again.");
      twiml.record({ maxLength: 5, playBeep: true, action: "/voice/save-name" });
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // Hold the name recording until the greeting is saved
    pendingNameRecordings.set(callSid, nameRecordingUrl);

    playPrompt(twiml, req, "name_saved_record_greeting.mp3", "Great. Now record your greeting for other callers. After the tone, press any key when done.");
    twiml.record({ maxLength: 60, playBeep: true, action: "/voice/save-profile", transcribe: true, transcribeCallback: `${baseUrl(req)}/voice/transcription-callback` } as any);
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
        playPrompt(twiml, req, "greeting_error.mp3", "That greeting was too short. Please try again after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: "/voice/save-profile", transcribe: true, transcribeCallback: `${baseUrl(req)}/voice/transcription-callback` } as any);
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
      // Clear any previous recording rejection — this new recording will go through auto-mod again
      await storage.clearUserRecordingRejection(user.id);
      // Mark transcription as pending — Twilio will POST the result to /voice/transcription-callback
      const saved = await storage.getProfile(user.id);
      if (saved) await storage.setProfileTranscriptionPending(saved.id);
      console.log(`[voice] Profile saved immediately for userId=${user.id} (dur=${recordingDuration}s)`);

      // Automatically play back the greeting so the caller can hear it before the review menu.
      // This also gives the transcription callback time to come back before they press 3 to accept.
      twiml.say("Here is what your greeting sounds like.");
      safePlayRecording(twiml, recordingUrl, req, "");
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

      if (cardId) {
        const card = await storage.getMembershipCardById(cardId);
        hasMembership = true;
        remainingSeconds = card?.valueSeconds ?? 0;
      } else {
        const user = await getOrCreateUser(fromNumber);
        hasMembership = !!user.membershipTier;
        remainingSeconds = user.remainingSeconds ?? 0;
      }

      // ── Access expired ──────────────────────────────────────────────────
      if (hasMembership && remainingSeconds <= 0) {
        playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
        if (cardId) {
          twiml.say("Please use a different calling card.");
          twiml.hangup();
        } else {
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
      "To enter the male box press star. " +
      (MAILBOX_ENABLED ? "For mailboxes and personal ads press 1. " : "") +
      "To add time or purchase a membership press 2. " +
      "For information on membership prices press 3. " +
      "To manage your membership press 4. " +
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
      // Enter the male box (live connector)
      twiml.redirect("/voice/phone-booth");
    } else if (digit === "1" && MAILBOX_ENABLED) {
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

      if (cardId) {
        const card = await storage.getMembershipCardById(cardId);
        hasMembership = true;
        remainingSeconds = card?.valueSeconds ?? 0;
      } else {
        const user = await getOrCreateUser(fromNumber);
        hasMembership = !!user.membershipTier;
        remainingSeconds = user.remainingSeconds ?? 0;
      }

      // Access expired
      if (hasMembership && remainingSeconds <= 0 && !femaleCallers.has(callSid)) {
        playPrompt(twiml, req, "access_expired.mp3", "Your access has expired.");
        if (cardId) {
          twiml.say("Please use a different calling card.");
          twiml.hangup();
        } else {
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
      "To manage your membership press 8. " +
      "For customer service press 0. " +
      "To repeat these choices press 9."
    );
    twiml.redirect("/voice/mw-main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 3c. Handle MW Main Menu ──────────────────────────────────────────────
  app.post("/voice/handle-mw-main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "1") {
      // Join the action — enter the male box
      twiml.redirect("/voice/phone-booth");
    } else if (digit === "2") {
      // Buy membership time
      twiml.redirect("/voice/purchase-pre-menu");
    } else if (digit === "8") {
      // Manage membership
      twiml.redirect("/voice/manage-membership");
    } else if (digit === "0") {
      // Customer service
      twiml.redirect("/voice/customer-service");
    } else if (digit === "9") {
      // Repeat
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
      gather.say(
        "If you have a promotional code press 1. " +
        planLines.join(" ") + " " +
        "To repeat these choices press 9. " +
        "To cancel press pound."
      );
    } catch (err) {
      console.error("[voice] /voice/purchase-pre-menu settings error:", err);
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
      "For customer service press zero. " +
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
      } else if (digit === "0") {
        twiml.redirect("/voice/customer-service");
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
      "To enter the male box press star. " +
      "To cancel creating your mailbox press pound."
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
    } else if (digit === "*") {
      twiml.redirect("/voice/phone-booth");
    } else if (digit === "#") {
      twiml.redirect("/voice/mailbox-menu");
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
        // In per-day billing or free mode, time is not deducted per-call, so skip starting the billing checkpoint.
        const mailboxSettings = await getMembershipSettingsCached();
        if (mailboxSettings.billingMode !== "per_day" && !mailboxSettings.freeMode) {
          startBilling(callSid, fromNumber);
        }
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
        twiml.say("Record your mailbox greeting after the tone. Press any key when done.");
        twiml.record({ maxLength: 90, playBeep: true, action: "/voice/save-mailbox-greeting", transcribe: true, transcribeCallback: `${baseUrl(req)}/voice/transcription-callback` } as any);
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
        twiml.say("Record your mailbox greeting after the tone. Press any key when done.");
        twiml.record({ maxLength: 90, playBeep: true, action: "/voice/save-mailbox-greeting", transcribe: true, transcribeCallback: `${baseUrl(req)}/voice/transcription-callback` } as any);
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
        playPrompt(twiml, req, "greeting_error.mp3", "That recording was too short. Please try again after the tone. Press any key when done.");
        twiml.record({ maxLength: 90, playBeep: true, action: "/voice/save-mailbox-greeting", transcribe: true, transcribeCallback: `${baseUrl(req)}/voice/transcription-callback` } as any);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const user = await getOrCreateUser(fromNumber);
      const mailbox = await storage.getMailboxByUserId(user.id);
      // Keep the existing category if set, otherwise use a default
      const category = mailbox?.category || "quick_hot_talk";
      await storage.updateMailboxAd(user.id, category, recordingUrl, recordingDuration);
      // Clear any previous recording rejection — this new recording will go through auto-mod again
      await storage.clearUserRecordingRejection(user.id);
      // Mark transcription as pending — Twilio will POST the result to /voice/transcription-callback
      await storage.updateMailboxTranscription(recordingUrl, null, "pending");

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
          profileGather.say("This caller no longer has a mailbox ad.");
        }
        profileGather.say("Press 1 to send a message. Press 9 to return to your mailbox.");
        twiml.redirect("/voice/my-mailbox");
      } else if (digit === "3") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/my-mailbox");
      } else if (digit === "9") {
        // Exiting the mailbox messages area — in per-minute billing notify caller deductions have stopped.
        // In per-day billing or free mode, time is not deducted per-call, so skip the announcement.
        const mailboxExitSettings = await getMembershipSettingsCached();
        if (mailboxExitSettings.billingMode !== "per_day" && !mailboxExitSettings.freeMode) {
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
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-category-ad?category=${category}`, transcribe: true, transcribeCallback: `${baseUrl(req)}/voice/transcription-callback` } as any);
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
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-category-ad?category=${category}`, transcribe: true, transcribeCallback: `${baseUrl(req)}/voice/transcription-callback` } as any);
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
        playPrompt(twiml, req, "greeting_error.mp3", "That recording was too short. Please try again after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-category-ad?category=${category}`, transcribe: true, transcribeCallback: `${baseUrl(req)}/voice/transcription-callback` } as any);
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const user = await getOrCreateUser(fromNumber);
      await storage.updateMailboxAd(user.id, category, recordingUrl, recordingDuration);
      // Clear any previous recording rejection — this new recording will go through auto-mod again
      await storage.clearUserRecordingRejection(user.id);
      // Mark transcription as pending — Twilio will POST the result to /voice/transcription-callback
      await storage.updateMailboxTranscription(recordingUrl, null, "pending");

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
    const recordingUrl = (req.body?.RecordingUrl as string) || "";

    console.log(`[transcription] callback: status=${status} recordingUrl=${recordingUrl}`);

    if (!recordingUrl) {
      return res.sendStatus(200);
    }

    try {
      // Try to match to a profile first, then a mailbox
      await storage.updateProfileTranscription(recordingUrl, status === "completed" ? text : null, status === "completed" ? "completed" : "failed");
      await storage.updateMailboxTranscription(recordingUrl, status === "completed" ? text : null, status === "completed" ? "completed" : "failed");
      console.log(`[transcription] stored for recordingUrl=${recordingUrl} status=${status}`);

      // Run auto-moderation checks on completed transcriptions
      if (status === "completed") {
        runTranscriptionAutoChecks(recordingUrl, text).catch((err) =>
          console.error("[transcription] auto-mod error:", err)
        );
      }
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
      if (isMW) {
        gather.say(`${tierMsg} Press 1 to purchase a membership. Press 9 to return to the main menu.`);
      } else {
        const pinStatus = user.membershipPin ? "You have a PIN set." : "You do not have a PIN set.";
        gather.say(`${tierMsg} ${pinStatus} Press 1 to purchase a membership. Press 2 to set or change your access PIN. Press 9 to return to the main menu.`);
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
          twiml.redirect("/voice/go-live");
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
      const regionId = callRegion.get(callSid);

      // Restricted users cannot go live
      if (user.accountStatus === "restricted") {
        twiml.say("We're sorry, your account has been restricted and you are not able to go live at this time. You may still listen to profiles and use other features. Please contact customer support if you have questions.");
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
        const goLiveLinkedRegions = await storage.getLinkedRegions(regionId);
        for (const lr of goLiveLinkedRegions) {
          goLiveTotal += await storage.getActiveCallerCount(user.id, lr.id, goLiveCallerGender);
        }
      }
      playCallerCount(twiml, req, goLiveTotal);

      // In per-minute billing, notify the caller that their time is now running.
      // In per-day billing or free mode, time is not deducted per-call, so skip this announcement.
      const goLiveSettings = await getMembershipSettingsCached();
      if (goLiveSettings.billingMode !== "per_day" && !goLiveSettings.freeMode) {
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

      // Determine caller gender for MW gender-filtering (null = MM, no filter)
      const browseSiteConf = await getSiteSettingsCached();
      const browseCallerGender = browseSiteConf.siteCategory === "MW"
        ? (femaleCallers.has(callSid) ? "female" : "male")
        : null;

      // Count available profiles: active callers + admin-uploaded greetings (region-scoped)
      // On MW systems, only count opposite-gender profiles scoped to the MW siteCategory
      const browseSiteCategory = browseSiteConf.siteCategory ?? "MM";
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
          const allProfiles = await storage.getAllActiveProfiles(user.id, regionId, browseCallerGender, browseSiteCategory);

          // Look up the caller's region name for announcements ("new caller closest to you" vs "new caller from [city]")
          let callerRegionName: string | null = null;
          if (regionId) {
            const callerRegion = await storage.getRegionById(regionId);
            callerRegionName = callerRegion?.name ?? null;
          }

          // Snapshot each linked region so we can detect new callers joining them later
          const linkedRegions = regionId ? await storage.getLinkedRegions(regionId) : [];
          const linkedRegionSnapshots = await Promise.all(
            linkedRegions.map(async (r) => {
              const profiles = await storage.getAllActiveProfiles(user.id, r.id);
              return { regionId: r.id, regionName: r.name, knownUserIds: profiles.map(p => p.userId) };
            })
          );
          state = {
            queue: allProfiles.map(p => ({
              userId: p.userId,
              recordingUrl: p.recordingUrl,
              nameRecordingUrl: p.nameRecordingUrl,
              regionId: regionId ?? null,
              regionName: callerRegionName,
            })),
            index: 0,
            lastPlayedIndex: null,
            hasWrapped: false,
            linkedRegionLoaded: false,
            callerRegionId: regionId ?? null,
            callerRegionName: callerRegionName,
            localUserIds: allProfiles.map(p => p.userId),
            announcedNewLocalIds: [],
            linkedRegionSnapshots,
            announcedLinkedCallerIds: [],
          };
          // Only cache the state if the queue is non-empty.
          // If empty (seeds may be in an inactive phase), skip caching so the
          // next browse-profiles visit rebuilds from the live activeCalls table.
          if (state.queue.length > 0) {
            callerBrowseState.set(callSid, state);
          }

          // ── Initialize Roger Mood Engine for this session ────────────────────
          engagementEngine.initEngagementState(callSid, user.id);
          console.log(`[voice] browse-profiles: built queue of ${state.queue.length} profiles for ${callSid} (region=${callerRegionName ?? "none"}, ${linkedRegions.length} linked regions)`);
        }

        const retryCount = parseInt((req.query?.browseRetry as string) ?? "0", 10);
        if (state.queue.length === 0) {
          if (retryCount < 2) {
            // Seeds may be temporarily in their inactive phase — wait a moment and retry
            twiml.pause({ length: 3 });
            twiml.redirect(`/voice/browse-profiles?browseRetry=${retryCount + 1}`);
          } else {
            playPrompt(twiml, req, "no_profiles.mp3", "No profiles are available right now. Please try again later.");
            twiml.redirect("/voice/main-menu");
          }
        } else {
          // ── Linked-region offer: queue has looped at least once ──────────────
          if (state.hasWrapped && !state.linkedRegionLoaded && regionId) {
            const linkedRegions = await storage.getLinkedRegions(regionId);
            if (linkedRegions.length > 0) {
              state.hasWrapped = false; // clear so we don't re-trigger until next full loop
              const ids = linkedRegions.map(r => r.id).join(",");
              const names = linkedRegions.map(r => r.name).join("||");
              twiml.redirect(`/voice/nearby-callers-offer?linkedRegionIds=${encodeURIComponent(ids)}&linkedRegionNames=${encodeURIComponent(names)}`);
              res.type("text/xml");
              return res.send(twiml.toString());
            } else {
              state.linkedRegionLoaded = true; // no linked regions — stop checking
            }
          }

          // ── New caller alerts: home region ("close to you") + linked regions ("from [city]") ──
          // Check for new callers in the home region first
          if (regionId) {
            const knownLocalIds = new Set([...state.localUserIds, ...state.announcedNewLocalIds]);
            const currentLocalProfiles = await storage.getAllActiveProfiles(user.id, regionId);
            const newLocalCaller = currentLocalProfiles.find(p => !knownLocalIds.has(p.userId));

            if (newLocalCaller) {
              state.announcedNewLocalIds.push(newLocalCaller.userId);

              if (!state.linkedRegionLoaded) {
                // ── Home-region browsing: interrupt immediately ────────────────
                console.log(`[voice] browse-profiles: announcing new home-region caller userId=${newLocalCaller.userId} to ${callSid}`);
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
              } else {
                // ── Linked-region browsing: splice into queue as the next item ─
                // The playback logic will see regionId === callerRegionId and play
                // "new caller closest to you" before their greeting automatically.
                console.log(`[voice] browse-profiles: queuing home-region caller userId=${newLocalCaller.userId} as next in linked-region queue for ${callSid}`);
                state.queue.splice(state.index, 0, {
                  userId: newLocalCaller.userId,
                  recordingUrl: newLocalCaller.recordingUrl,
                  nameRecordingUrl: newLocalCaller.nameRecordingUrl,
                  regionId: state.callerRegionId,
                  regionName: state.callerRegionName,
                });
                // Fall through — the current browse-profiles iteration will play this entry next
              }
            }
          }

          // Check for new callers in each linked region ("new caller from [city]")
          for (const snapshot of state.linkedRegionSnapshots) {
            const knownLinkedIds = new Set([...snapshot.knownUserIds, ...state.announcedLinkedCallerIds]);
            const currentLinkedProfiles = await storage.getAllActiveProfiles(user.id, snapshot.regionId);
            const newLinkedCaller = currentLinkedProfiles.find(p => !knownLinkedIds.has(p.userId));

            if (newLinkedCaller) {
              state.announcedLinkedCallerIds.push(newLinkedCaller.userId);
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
              res.type("text/xml");
              return res.send(twiml.toString());
            }
          }

          // ── Engagement Engine interrupt check ────────────────────────────────
          // Fetch prompts this caller has already heard in the last 24 h so the
          // engine can skip them and Roger always sounds fresh.
          let excludedRogerIds = new Set<string>();
          try {
            excludedRogerIds = await storage.getExcludedRogerPromptIds(
              fromNumber,
              engagementEngine.PROMPT_LIBRARY.length,
            );
          } catch (err) {
            console.error("[engagement] failed to fetch roger prompt history:", err);
          }

          const engInterruption = engagementEngine.getInterruption(callSid, excludedRogerIds);
          if (engInterruption) {
            const encodedText = encodeURIComponent(engInterruption.lineText);
            const followUp = encodeURIComponent(engInterruption.followUpAction ?? "");
            const pid = encodeURIComponent(engInterruption.id);
            console.log(`[engagement] Interrupting browse with prompt=${engInterruption.id}, followUp=${engInterruption.followUpAction ?? "none"}`);
            twiml.redirect(`/voice/engagement-interrupt?text=${encodedText}&followUp=${followUp}&pid=${pid}`);
            res.type("text/xml");
            return res.send(twiml.toString());
          }

          // ── Busted Game: inject target profile once after game starts ────────
          const engState = engagementEngine.getEngagementState(callSid);
          if (engState?.gameStarted && engState.gameBustTargetUserId && !engState.gameBustTargetInjected) {
            const gameTargetProfile = await storage.getProfile(engState.gameBustTargetUserId);
            if (gameTargetProfile?.recordingUrl) {
              const insertAt = Math.min(state.index + 1, state.queue.length);
              state.queue.splice(insertAt, 0, {
                userId: engState.gameBustTargetUserId,
                recordingUrl: gameTargetProfile.recordingUrl,
                nameRecordingUrl: gameTargetProfile.nameRecordingUrl ?? null,
                regionId: regionId ?? null,
                regionName: null,
              });
              engagementEngine.markGameTargetInjected(callSid);
              console.log(`[engagement] Injected game target userId=${engState.gameBustTargetUserId} at queue[${insertAt}] (queue len now ${state.queue.length})`);
            }
          }

          const profile = state.queue[state.index];
          const prevIndex = state.index;

          // Advance index, wrapping at end of queue — track first wrap
          state.lastPlayedIndex = prevIndex;
          state.index = (state.index + 1) % state.queue.length;
          if (state.index === 0 && prevIndex > 0) state.hasWrapped = true;

          console.log(`[voice] Playing profile userId=${profile.userId} (position ${state.index}/${state.queue.length})`);

          // Announce caller count only at the very start of the queue.
          // Count home region + all linked regions so the total is accurate.
          if (state.index === 1) {
            const homeCount = await storage.getActiveCallerCount(user.id, regionId ?? undefined, browseCallerGender);
            let regionalTotal = homeCount;
            for (const snap of state.linkedRegionSnapshots) {
              regionalTotal += await storage.getActiveCallerCount(user.id, snap.regionId, browseCallerGender);
            }
            console.log(`[voice] browse-profiles: announcing caller count: ${regionalTotal} (home=${homeCount}, linkedRegions=${state.linkedRegionSnapshots.length})`);
            playCallerCount(twiml, req, regionalTotal);
          }

          // Nest <Play> inside <Gather> — pressing 2 during the greeting skips to the next one
          const profileGather = twiml.gather({
            numDigits: 1,
            action: `/voice/handle-profile-menu?profileUserId=${profile.userId}`,
            timeout: 10,
          });
          // Announce caller origin: same-region → "closest to you", linked-region → "from [city]"
          if (!profile.regionId || profile.regionId === state.callerRegionId) {
            playPrompt(profileGather, req, "new_caller_closest_to_you.mp3", "New caller closest to you.");
          } else if (profile.regionName) {
            profileGather.say(`New caller from ${profile.regionName}.`);
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
      const callSid = req.body?.CallSid as string;
      const fromNumber = req.body?.From as string;

      const state = callerBrowseState.get(callSid);

      // Determine if caller chose a specific linked region (digit 1, 2, or 3)
      // Any digit beyond the number of linked regions (or no digit) = start-over
      const chosenIndex = digit ? parseInt(digit, 10) - 1 : -1;
      const chosenRegionId = chosenIndex >= 0 && chosenIndex < linkedRegionIds.length
        ? linkedRegionIds[chosenIndex]
        : null;
      const chosenRegionName = chosenIndex >= 0 && chosenIndex < linkedRegionNames.length
        ? linkedRegionNames[chosenIndex]
        : null;

      if (chosenRegionId && state) {
        // Load profiles from the chosen linked region only
        const user = await getOrCreateUser(fromNumber);
        const linkedProfiles = await storage.getAllActiveProfiles(user.id, chosenRegionId);

        if (linkedProfiles.length > 0) {
          // Replace the queue with the chosen region's profiles, each tagged with that region
          state.queue = linkedProfiles.map(p => ({
            userId: p.userId,
            recordingUrl: p.recordingUrl,
            nameRecordingUrl: p.nameRecordingUrl,
            regionId: chosenRegionId,
            regionName: chosenRegionName,
          }));
          state.index = 0;
          state.hasWrapped = false;
          state.linkedRegionLoaded = true;
          console.log(`[voice] handle-nearby-callers: loaded ${linkedProfiles.length} profiles from "${chosenRegionName}" (regionId=${chosenRegionId})`);
          // Announce the chosen city by name via TTS (region-specific — can't use a static prompt)
          twiml.say(`Now playing callers from ${chosenRegionName}.`);
        } else {
          // No callers online in that region — restart local queue
          state.index = 0;
          state.linkedRegionLoaded = true;
          state.hasWrapped = false;
          playPrompt(twiml, req, "nearby_callers_none.mp3",
            `There are no callers online in ${chosenRegionName ?? "that area"} right now. Starting your area over.`);
        }
        twiml.redirect("/voice/browse-profiles");
      } else {
        // Start-over digit, timeout, or unrecognised input → restart local queue from beginning
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
        playPrompt(twiml, req, "record_reply.mp3", "Record your reply after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${senderId}` });
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
          runBlockAutoChecks(senderId).catch(console.error);
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
          runFlagAutoChecks("message", msgId, senderId).catch(console.error);
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
        // If the game target was played and the caller chose to message instead of bust, end the game
        if (profileUserId) {
          const callSid1 = req.body?.CallSid as string;
          if (engagementEngine.isGameTarget(callSid1, profileUserId)) {
            engagementEngine.markGameTargetPassed(callSid1);
          }
        }
        playPrompt(twiml, req, "record_message.mp3", "Record your message after the tone. Press any key when done.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/review-message?toUserId=${profileUserId}` });
      } else if (digit === "2") {
        const callSid2 = req.body?.CallSid as string;
        engagementEngine.trackSkip(callSid2);
        // If the caller skipped the game target without pressing 8, the game is over
        if (profileUserId && engagementEngine.isGameTarget(callSid2, profileUserId)) {
          engagementEngine.markGameTargetPassed(callSid2);
        }
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
          runBlockAutoChecks(profileUserId).catch(console.error);
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
            const regionId = callRegion.get(callSid);
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
        // In per-day billing or free mode, time is not deducted per-call, so skip the announcement.
        const boothExitSettings = await getMembershipSettingsCached();
        if (boothExitSettings.billingMode !== "per_day" && !boothExitSettings.freeMode) {
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
        // Gather admin-uploaded profiles to choose a bust target from
        try {
          const adminProfiles = await storage.getAdminUploadedProfiles();
          const adminUserIds = adminProfiles
            .filter(p => p.recordingUrl)
            .map(p => p.userId);
          const targetUserId = engagementEngine.startBustedGame(callSid, adminUserIds);
          if (targetUserId) {
            console.log(`[engagement] Busted game started for callSid=${callSid}, target=${targetUserId}`);
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
          "We were unable to connect your call. Returning you to the male box.");
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
          "We were unable to connect your call. Returning you to the male box.");
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
      playPrompt(twiml, req, "error_generic.mp3", "An error occurred. Returning to the male box.");
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
        runBlockAutoChecks(initiatorUserId).catch(console.error);
        playPrompt(twiml, req, "caller_blocked.mp3", "Caller blocked. You will no longer hear this caller's profile.");
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
        exitKeys: "#",
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
    twiml.say("Warning: you have less than 5 minutes remaining. Please note your live connection will end when your time expires.");
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
    if (returnTo === "category" && category) return `/voice/browse-category-ads?category=${category}`;
    return "/voice/browse-profiles";
  }

  app.post("/voice/review-message", async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body?.CallSid as string;
    const recordingUrl = req.body?.RecordingUrl as string;
    const duration = parseInt(req.body?.RecordingDuration || "0", 10);
    const toUserId = req.query.toUserId as string;
    const returnTo = (req.query.returnTo as string) || "";
    const category = (req.query.category as string) || "";

    try {
      if (!recordingUrl || duration === 0) {
        playPrompt(twiml, req, "no_recording.mp3", "No recording was detected.");
        twiml.redirect(cancelReturnPath(returnTo, category));
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      pendingMessages.set(callSid, { recordingUrl, toUserId, returnTo, category });

      const gather = twiml.gather({
        numDigits: 1,
        action: `/voice/handle-review-message`,
        timeout: 10,
      });
      playPrompt(gather, req, "review_your_message.mp3", "Here is your recorded message.");
      safePlayRecording(gather, recordingUrl, req, "");
      gather.say("Press 1 to send. Press 2 to cancel.");
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
      } else if (digit === "2") {
        // Cancel — discard recording and return
        pendingMessages.delete(callSid);
        playPrompt(twiml, req, "message_cancelled.mp3", "Message cancelled.");
        twiml.redirect(cancelReturnPath(returnTo, category));
      } else {
        // Invalid — re-prompt
        const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-review-message", timeout: 10 });
        gather.say("Press 1 to send. Press 2 to cancel.");
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
    const dynamicPart = session.isFirstPurchase
      ? `${mins.toLocaleString()} minutes — plus ${mins.toLocaleString()} bonus minutes for your first purchase, giving you ${(mins * 2).toLocaleString()} minutes total, for ${session.priceLabel}.`
      : `${mins.toLocaleString()} minutes for ${session.priceLabel}.`;

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
    gather.say(
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

    // Pre-flight: ensure Stripe is configured before launching <Pay>.
    // Without STRIPE_SECRET_KEY the connector cannot process the charge.
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("[voice] run-payment: STRIPE_SECRET_KEY is not set — cannot process payment");
      playPrompt(twiml, req, "payment_failed.mp3",
        "Our payment system is not currently configured. Please contact customer support to complete your purchase.");
      twiml.redirect("/voice/main-menu");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const connectorName = process.env.TWILIO_PAY_CONNECTOR || "stripe";
    const chargeAmount = (session.packagePriceCents / 100).toFixed(2);

    console.log(`[voice] run-payment: launching <Pay> connector=${connectorName} amount=$${chargeAmount} callSid=${callSid}`);

    const pay = twiml.pay({
      action: `${baseUrl(req)}/voice/handle-payment-complete`,
      chargeAmount,
      currency: "usd",
      description: `${session.packageLabel} Membership — VOICE PROTOCOL`,
      paymentConnector: connectorName,
      postalCode: false,
      securityCode: true,
      timeout: 30,
      maxAttempts: 2,
    } as any) as any;

    // Custom prompts for each payment field — tell callers to press pound when done
    pay.prompt({ ["for"]: "cardNumber" })
      .say("Please enter your 16-digit card number, then press pound.");

    pay.prompt({ ["for"]: "expirationDate" })
      .say(
        "Enter your expiration date, then press pound. " +
        "Enter the 2-digit month, followed by the year. " +
        "If your card shows a 4-digit year, enter only the last 2 digits. " +
        "For example, for February 2027 enter 0 2 2 7, then press pound."
      );

    pay.prompt({ ["for"]: "securityCode" })
      .say("Enter your 3 or 4 digit security code, then press pound.");

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

}
