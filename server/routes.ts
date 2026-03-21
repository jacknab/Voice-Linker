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
const MEMBERSHIP_PACKAGES: Record<string, { name: string; label: string; priceCents: number; priceLabel: string }> = {
  "1": { name: "30day",  label: "30 Day",   priceCents: 2500, priceLabel: "25 dollars" },
  "2": { name: "14day",  label: "14 Day",   priceCents: 1000, priceLabel: "10 dollars" },
  "3": { name: "24hour", label: "24 Hour",  priceCents: 300,  priceLabel: "3 dollars" },
};

// In-memory payment sessions keyed by Twilio CallSid
interface PaymentSession {
  packageName: string;
  packageLabel: string;
  packagePriceCents: number;
  priceLabel: string;
  isFirstPurchase?: boolean;
  cardNumber?: string;
  expMonth?: number;
  expYear?: number;
  cvv?: string;
}
const paymentSessions = new Map<string, PaymentSession>();

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

  // --- Twilio Voice Webhooks ---

  async function getOrCreateUser(phoneNumber: string) {
    let user = await storage.getUserByPhone(phoneNumber);
    if (!user) {
      user = await storage.createUser({ phoneNumber });
    }
    return user;
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
      try {
        await storage.removeActiveCall(callSid);
        console.log(`[status] Removed ${callSid} from active calls`);
      } catch (err) {
        console.error(`[status] Error removing active call ${callSid}:`, err);
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
      twiml.say("We could not identify your call. Goodbye.");
      twiml.hangup();
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      // Clean up any stale calls (safety valve for missed status callbacks)
      await storage.removeStaleActiveCalls(90);

      const user = await getOrCreateUser(fromNumber);

      // Mark this caller as active on the party line
      await storage.registerActiveCall(callSid, user.id);
      console.log(`[voice] Registered active call ${callSid} for userId=${user.id}`);

      // Register the hangup callback so we remove them when they disconnect
      registerStatusCallback(callSid, req).catch(() => {});

      const profile = await storage.getProfile(user.id);
      if (!profile) {
        twiml.say("Welcome! Before using the system you must record a short personal profile.");
        twiml.say("After the tone, record your profile. You have 30 seconds.");
        twiml.record({ maxLength: 30, playBeep: true, action: "/voice/save-profile" });
      } else {
        twiml.redirect("/voice/main-menu");
      }
    } catch (error) {
      console.error("[voice] /voice error:", error);
      twiml.say("An error occurred. Please try again later.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 2. Save Profile ──────────────────────────────────────────────────────
  app.post("/voice/save-profile", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From;
      const recordingUrl = req.body?.RecordingUrl;
      const recordingDuration = parseInt(req.body?.RecordingDuration) || null;

      if (!fromNumber || !recordingUrl) {
        throw new Error(`Missing fields: From=${fromNumber}, RecordingUrl=${recordingUrl}`);
      }

      const user = await getOrCreateUser(fromNumber);
      await storage.upsertProfile({ userId: user.id, recordingUrl, recordingDuration });

      twiml.say("Your profile has been saved.");
      twiml.redirect("/voice/main-menu");
    } catch (error) {
      console.error("[voice] /voice/save-profile error:", error);
      twiml.say("We could not save your profile. Please try again.");
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 3. Main Menu ─────────────────────────────────────────────────────────
  app.post("/voice/main-menu", async (_req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-main-menu" });
    gather.say("Welcome to the voice line.");
    gather.say("Press 1 to listen to profiles.");
    gather.say("Press 2 to re-record your profile.");
    gather.say("Press 4 for information, prices, and membership.");
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
      twiml.say("After the tone, record your new profile. You have 30 seconds.");
      twiml.record({ maxLength: 30, playBeep: true, action: "/voice/save-profile" });
    } else if (digit === "4") {
      twiml.redirect("/voice/info-menu");
    } else {
      twiml.say("Invalid choice.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 5. Browse Profiles ───────────────────────────────────────────────────
  // Only shows profiles of callers currently active on the party line.
  app.post("/voice/browse-profiles", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From;
      if (!fromNumber) throw new Error("Missing From field in browse-profiles");

      const user = await getOrCreateUser(fromNumber);

      // Count available profiles: active callers + admin-uploaded greetings
      const availableCount = await storage.getAvailableProfileCount(user.id);
      const activeCallerCount = await storage.getActiveCallerCount(user.id);
      console.log(`[voice] browse-profiles: userId=${user.id}, activeOtherCallers=${activeCallerCount}, availableProfiles=${availableCount}`);

      if (availableCount === 0) {
        twiml.say("There are no profiles available right now. Please call back later.");
        twiml.redirect("/voice/main-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }


      // Check for unread messages first
      const unreadMessage = await storage.getUnreadMessage(user.id);

      if (unreadMessage) {
        twiml.say("You have a new message.");

        // Nest <Play> inside <Gather> so pressing a digit during playback skips immediately
        const msgGather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-message-menu?msgId=${unreadMessage.id}&senderId=${unreadMessage.fromUserId}`,
          timeout: 10,
        });
        msgGather.play(audioProxyUrl(unreadMessage.recordingUrl, req));
        msgGather.say("Press 1 to reply to this message.");
        msgGather.say("Press 2 to hear the sender's profile.");
        msgGather.say("Press 3 to continue browsing profiles.");
        msgGather.say("Press 9 to return to the main menu.");
        twiml.redirect("/voice/main-menu");
      } else {
        // Play a random profile (active caller OR admin-uploaded greeting)
        const randomProfile = await storage.getRandomActiveProfile(user.id);

        if (randomProfile) {
          const playUrl = audioProxyUrl(randomProfile.recordingUrl, req);
          console.log(`[voice] Playing profile userId=${randomProfile.userId} url=${playUrl}`);

          // Announce how many callers are currently on the line
          const callerWord = activeCallerCount === 1 ? "caller" : "callers";
          twiml.say(`There ${activeCallerCount === 1 ? "is" : "are"} ${activeCallerCount} ${callerWord} on the line.`);

          // Nest <Play> inside <Gather> — pressing 2 during the greeting skips to the next one
          const profileGather = twiml.gather({
            numDigits: 1,
            action: `/voice/handle-profile-menu?profileUserId=${randomProfile.userId}`,
            timeout: 10,
          });
          profileGather.play(playUrl);
          profileGather.say("Press 1 to send this caller a message.");
          profileGather.say("Press 2 to skip to the next profile.");
          profileGather.say("Press 9 to return to main menu.");
          twiml.redirect("/voice/main-menu");
        } else {
          twiml.say("No profiles are available right now. Please try again later.");
          twiml.redirect("/voice/main-menu");
        }
      }
    } catch (error) {
      console.error("[voice] /voice/browse-profiles error:", error);
      twiml.say("An error occurred while browsing. Returning to the main menu.");
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
        twiml.say("Record your reply after the tone.");
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
        twiml.say("Invalid choice.");
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[voice] /voice/handle-message-menu error:", error);
      twiml.say("An error occurred. Returning to the main menu.");
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
        twiml.say("Record your message after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${senderId}` });
      } else if (digit === "2") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "9") {
        await storage.markMessageRead(msgId);
        twiml.redirect("/voice/main-menu");
      } else {
        twiml.say("Invalid choice.");
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[voice] /voice/handle-sender-profile-menu error:", error);
      twiml.say("An error occurred. Returning to the main menu.");
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
        twiml.say("Record your message after the tone.");
        twiml.record({ maxLength: 60, playBeep: true, action: `/voice/save-message?toUserId=${profileUserId}` });
      } else if (digit === "2") {
        twiml.redirect("/voice/browse-profiles");
      } else if (digit === "9") {
        twiml.redirect("/voice/main-menu");
      } else {
        twiml.say("Invalid choice.");
        twiml.redirect("/voice/browse-profiles");
      }
    } catch (error) {
      console.error("[voice] /voice/handle-profile-menu error:", error);
      twiml.say("An error occurred. Returning to the main menu.");
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
      twiml.say("Your message has been sent. Returning to profiles.");
      twiml.redirect("/voice/browse-profiles");
    } catch (error) {
      console.error("[voice] /voice/save-message error:", error);
      twiml.say("Failed to send your message. Returning to profiles.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 10. Info Menu ────────────────────────────────────────────────────────
  app.post("/voice/info-menu", async (_req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-info-menu" });
    gather.say("Information, prices, and membership.");
    gather.say("Press 1 for membership questions.");
    gather.say("Press 9 to return to the main menu.");
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
      twiml.say("Invalid choice.");
      twiml.redirect("/voice/info-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 11. Membership Questions ─────────────────────────────────────────────
  app.post("/voice/membership-questions", async (_req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-membership-questions" });
    gather.say("Membership questions.");
    gather.say("Press 1 to learn how membership works.");
    gather.say("Press 2 to hear our pricing.");
    gather.say("Press 3 to purchase a membership with a credit card.");
    gather.say("Press 9 to return to the main menu.");
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
      twiml.say("Invalid choice.");
      twiml.redirect("/voice/membership-questions");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 12. How Membership Works ─────────────────────────────────────────────
  app.post("/voice/membership-how-it-works", async (_req, res) => {
    const twiml = new VoiceResponse();
    twiml.say(
      "Here is how membership works. " +
      "As a member, you get full access to the voice line community. " +
      "Members can browse unlimited caller profiles, send and receive voice messages, and enjoy priority access to new features. " +
      "We offer three membership options: a 24 hour pass, a 7 day membership, and a 30 day membership. " +
      "Choose the option that works best for you."
    );
    twiml.redirect("/voice/membership-questions");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 13. Membership Pricing ───────────────────────────────────────────────
  app.post("/voice/membership-pricing", async (_req, res) => {
    const twiml = new VoiceResponse();
    twiml.say(
      "Here are our membership prices. " +
      "A 24 hour pass is 2 dollars and 99 cents. " +
      "A 7 day membership is 16 dollars and 99 cents. " +
      "A 30 day membership is 29 dollars and 99 cents. " +
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
      twiml.say("Cancelled. Returning to the main menu.");
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
      twiml.say("Invalid selection.");
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
      twiml.say(`Great choice! You selected 14 days access for ${pkg.priceLabel}, including your free 7-day first purchase bonus.`);
    } else {
      twiml.say(`You selected ${pkg.label} access for ${pkg.priceLabel}.`);
    }
    twiml.say("We will now collect your credit card information.");
    twiml.redirect("/voice/collect-card-number");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ─── 15. Card Collection ──────────────────────────────────────────────────
  app.post("/voice/collect-card-number", async (_req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      numDigits: 16,
      action: "/voice/handle-card-number",
      timeout: 30,
      finishOnKey: "",
    });
    gather.say("Please enter your 16-digit card number now.");
    twiml.say("We did not receive your card number. Please try again.");
    twiml.redirect("/voice/collect-card-number");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-card-number", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) || "";
    const callSid = req.body?.CallSid as string;
    const session = paymentSessions.get(callSid);

    if (!session) {
      twiml.say("Your session has expired. Please start over.");
      twiml.redirect("/voice/membership-purchase");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    if (digits.length !== 16 || !/^\d{16}$/.test(digits)) {
      twiml.say("Invalid card number. Please try again.");
      twiml.redirect("/voice/collect-card-number");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    session.cardNumber = digits;
    twiml.redirect("/voice/collect-card-expiry");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/collect-card-expiry", async (_req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      numDigits: 4,
      action: "/voice/handle-card-expiry",
      timeout: 20,
      finishOnKey: "",
    });
    gather.say("Please enter your card expiration date as 4 digits. For example, enter 0 1 2 6 for January 2026.");
    twiml.say("We did not receive your expiration date. Please try again.");
    twiml.redirect("/voice/collect-card-expiry");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-card-expiry", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) || "";
    const callSid = req.body?.CallSid as string;
    const session = paymentSessions.get(callSid);

    if (!session) {
      twiml.say("Your session has expired. Please start over.");
      twiml.redirect("/voice/membership-purchase");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    if (!/^\d{4}$/.test(digits)) {
      twiml.say("Invalid expiration date. Please enter 4 digits. For example, 0 1 2 6 for January 2026.");
      twiml.redirect("/voice/collect-card-expiry");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const month = parseInt(digits.substring(0, 2), 10);
    const year = parseInt("20" + digits.substring(2, 4), 10);

    if (month < 1 || month > 12) {
      twiml.say("Invalid expiration month. Please try again.");
      twiml.redirect("/voice/collect-card-expiry");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    session.expMonth = month;
    session.expYear = year;
    twiml.redirect("/voice/collect-card-cvv");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/collect-card-cvv", async (_req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      numDigits: 4,
      action: "/voice/handle-card-cvv",
      timeout: 20,
      finishOnKey: "#",
    });
    gather.say("Please enter your 3 or 4 digit card security code, then press pound.");
    twiml.say("We did not receive your security code. Please try again.");
    twiml.redirect("/voice/collect-card-cvv");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/voice/handle-card-cvv", async (req, res) => {
    const twiml = new VoiceResponse();
    const digits = (req.body?.Digits as string) || "";
    const callSid = req.body?.CallSid as string;
    const fromNumber = req.body?.From as string;
    const session = paymentSessions.get(callSid);

    if (!session || !session.cardNumber || !session.expMonth || !session.expYear) {
      twiml.say("Your session has expired. Please start over.");
      twiml.redirect("/voice/membership-purchase");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    if (!/^\d{3,4}$/.test(digits)) {
      twiml.say("Invalid security code. Please try again.");
      twiml.redirect("/voice/collect-card-cvv");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    session.cvv = digits;

    twiml.say("Thank you. Please hold while we process your payment.");

    try {
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      const user = await getOrCreateUser(fromNumber);

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          phone: user.phoneNumber,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserMembership(user.id, { stripeCustomerId: customerId });
      }

      const paymentMethod = await stripe.paymentMethods.create({
        type: "card",
        card: {
          number: session.cardNumber,
          exp_month: session.expMonth,
          exp_year: session.expYear,
          cvc: session.cvv,
        },
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: session.packagePriceCents,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethod.id,
        confirm: true,
        description: `${session.packageLabel} Membership`,
        off_session: true,
      });

      if (paymentIntent.status === "succeeded") {
        await storage.updateUserMembership(user.id, { membershipTier: session.packageName });
        paymentSessions.delete(callSid);
        const bonusMsg = (session.packageName === "14day" && session.isFirstPurchase)
          ? " Plus your free extra 7 days have been added — enjoy 14 days total!"
          : "";
        twiml.say(
          `Payment successful! You now have ${session.packageLabel} access. ` +
          `Your card has been charged ${session.priceLabel}.${bonusMsg} ` +
          "Thank you for joining. Returning to the main menu."
        );
      } else {
        paymentSessions.delete(callSid);
        twiml.say("Your payment could not be completed at this time. Please try again later. Returning to the main menu.");
      }
    } catch (err: any) {
      console.error("[voice] payment error:", err);
      paymentSessions.delete(callSid);
      const isStripeError = err?.type?.startsWith("Stripe") || err?.code;
      if (isStripeError) {
        twiml.say("Your payment was declined. Please check your card details and try again. Returning to the main menu.");
      } else {
        twiml.say("Payment processing is not available right now. Please try again later. Returning to the main menu.");
      }
    }

    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  return httpServer;
}
