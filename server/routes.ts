import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import express from "express";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

// Extract Twilio recording SID from a recording URL
function getRecordingSid(url: string): string | null {
  const match = url.match(/Recordings\/([^\/\?.]+)/);
  return match ? match[1] : null;
}

// Build a URL pointing to our local audio proxy from the incoming request
function audioProxyUrl(recordingUrl: string, req: Request): string {
  const sid = getRecordingSid(recordingUrl);
  if (!sid) {
    console.warn("[audio] Could not extract SID from:", recordingUrl);
    return recordingUrl;
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] as string || req.headers.host || "";
  return `${proto}://${host}/audio/${sid}`;
}

function twimlError(res: Response, message = "An error occurred. Please try again later.") {
  const twiml = new VoiceResponse();
  twiml.say(message);
  twiml.redirect("/voice/main-menu");
  res.type("text/xml");
  res.send(twiml.toString());
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(express.urlencoded({ extended: true }));

  // Log all voice webhook requests for debugging
  app.use("/voice", (req: Request, _res: Response, next: NextFunction) => {
    console.log(`[voice] ${req.method} ${req.path} | From=${req.body?.From} Digits=${req.body?.Digits}`);
    next();
  });

  // --- Audio Proxy ---
  // Fetches a Twilio recording using stored credentials and streams it back.
  // This lets <Play> use our server URL instead of the private Twilio API URL.
  app.get("/audio/:sid", async (req, res) => {
    const { sid } = req.params;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    console.log(`[audio] Proxy request for SID=${sid}, creds=${accountSid ? "present" : "MISSING"}`);

    if (!accountSid || !authToken) {
      console.error("[audio] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set");
      return res.status(503).send("Audio credentials not configured");
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`;
    const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    try {
      const upstream = await fetch(twilioUrl, {
        headers: { Authorization: authHeader },
      });

      console.log(`[audio] Twilio responded ${upstream.status} for SID=${sid}`);

      if (!upstream.ok) {
        return res.status(upstream.status).send("Failed to fetch recording from Twilio");
      }

      res.setHeader("Content-Type", "audio/mpeg");
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);

      // Stream the body through
      const { Readable } = await import("stream");
      const readable = Readable.fromWeb(upstream.body as any);
      readable.pipe(res);
    } catch (error) {
      console.error("[audio] Error proxying recording:", error);
      res.status(500).send("Error fetching audio");
    }
  });

  // --- API Routes ---
  app.get(api.stats.get.path, async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch stats" });
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

  // 1. Initial Webhook: POST /voice
  app.post("/voice", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body?.From;

    if (!fromNumber) {
      twiml.say("We could not identify your caller ID. Goodbye.");
      twiml.hangup();
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    try {
      const user = await getOrCreateUser(fromNumber);
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

  // 2. Save Profile
  app.post("/voice/save-profile", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From;
      const recordingUrl = req.body?.RecordingUrl;
      const recordingDuration = parseInt(req.body?.RecordingDuration) || null;

      if (!fromNumber || !recordingUrl) {
        throw new Error(`Missing required fields: From=${fromNumber}, RecordingUrl=${recordingUrl}`);
      }

      const user = await getOrCreateUser(fromNumber);
      // Store the raw Twilio URL — audio proxy handles auth at play time
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

  // 3. Main Menu
  app.post("/voice/main-menu", async (_req, res) => {
    const twiml = new VoiceResponse();
    const gather = twiml.gather({ numDigits: 1, action: "/voice/handle-main-menu" });
    gather.say("Welcome to the voice line.");
    gather.say("Press 1 to listen to profiles. Press 2 to re-record your profile.");
    twiml.redirect("/voice/main-menu");
    res.type("text/xml");
    res.send(twiml.toString());
  });

  // 4. Handle Main Menu Input
  app.post("/voice/handle-main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body?.Digits;

    if (digit === "1") {
      twiml.redirect("/voice/browse-profiles");
    } else if (digit === "2") {
      twiml.say("After the tone, record your new profile. You have 30 seconds.");
      twiml.record({ maxLength: 30, playBeep: true, action: "/voice/save-profile" });
    } else {
      twiml.say("Invalid choice.");
      twiml.redirect("/voice/main-menu");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // 5. Browse Profiles
  app.post("/voice/browse-profiles", async (req, res) => {
    const twiml = new VoiceResponse();

    try {
      const fromNumber = req.body?.From;
      if (!fromNumber) throw new Error("Missing From field in browse-profiles");

      const user = await getOrCreateUser(fromNumber);
      const otherCount = await storage.getOtherProfileCount(user.id);

      console.log(`[voice] browse-profiles: userId=${user.id}, otherProfileCount=${otherCount}`);

      // Announce how many other callers are on the system
      if (otherCount === 0) {
        twiml.say("There are no new callers on the line right now. Please call back later.");
        twiml.redirect("/voice/main-menu");
        res.type("text/xml");
        return res.send(twiml.toString());
      }

      const callerWord = otherCount === 1 ? "caller" : "callers";
      twiml.say(`There ${otherCount === 1 ? "is" : "are"} ${otherCount} ${callerWord} on the line.`);

      const unreadMessage = await storage.getUnreadMessage(user.id);

      if (unreadMessage) {
        twiml.say("You have a new message.");
        twiml.play(audioProxyUrl(unreadMessage.recordingUrl, req));

        const gather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-message-menu?msgId=${unreadMessage.id}&senderId=${unreadMessage.fromUserId}`,
          timeout: 10,
        });
        gather.say("Press 1 to reply to this message.");
        gather.say("Press 2 to hear the sender's profile.");
        gather.say("Press 3 to continue browsing profiles.");
        gather.say("Press 9 to return to the main menu.");
        twiml.redirect("/voice/main-menu");
      } else {
        const randomProfile = await storage.getRandomProfile(user.id);

        if (randomProfile) {
          const playUrl = audioProxyUrl(randomProfile.recordingUrl, req);
          console.log(`[voice] browse-profiles: playing userId=${randomProfile.userId}, proxyUrl=${playUrl}`);
          twiml.play(playUrl);

          const gather = twiml.gather({
            numDigits: 1,
            action: `/voice/handle-profile-menu?profileUserId=${randomProfile.userId}`,
            timeout: 10,
          });
          gather.say("Press 1 to send this caller a message.");
          gather.say("Press 2 to hear the next profile.");
          gather.say("Press 9 to return to main menu.");
          twiml.redirect("/voice/main-menu");
        } else {
          twiml.say("There are no new callers on the line right now. Please call back later.");
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

  // 6. Handle Message Menu
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
        if (senderProfile) {
          twiml.play(audioProxyUrl(senderProfile.recordingUrl, req));
        } else {
          twiml.say("This caller no longer has a profile.");
        }
        const gather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-sender-profile-menu?senderId=${senderId}&msgId=${msgId}`,
          timeout: 10,
        });
        gather.say("Press 1 to send a message. Press 2 to continue browsing. Press 9 for main menu.");
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

  // 7. Handle Sender Profile Menu
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

  // 8. Handle Profile Menu
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

  // 9. Save Message
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
      // Store the raw Twilio URL — audio proxy handles auth at play time
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

  return httpServer;
}
