import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import express from "express";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

function normalizeRecordingUrl(url: string): string {
  if (!url) return url;
  if (url.endsWith(".mp3") || url.endsWith(".wav")) return url;
  return url + ".mp3";
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

  // Catch any unhandled errors from voice routes and return TwiML instead of JSON
  app.use("/voice", (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[voice] unhandled error:", err);
    twimlError(res);
  });

  // --- API Routes ---
  app.get(api.stats.get.path, async (req, res) => {
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
        twiml.record({
          maxLength: 30,
          playBeep: true,
          action: "/voice/save-profile",
        });
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
      await storage.upsertProfile({ userId: user.id, recordingUrl: normalizeRecordingUrl(recordingUrl), recordingDuration });

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

    const gather = twiml.gather({
      numDigits: 1,
      action: "/voice/handle-main-menu",
    });

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
      twiml.record({
        maxLength: 30,
        playBeep: true,
        action: "/voice/save-profile",
      });
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

      if (!fromNumber) {
        throw new Error("Missing From field in browse-profiles");
      }

      const user = await getOrCreateUser(fromNumber);
      const unreadMessage = await storage.getUnreadMessage(user.id);

      if (unreadMessage) {
        twiml.say("You have a new message.");
        twiml.play(normalizeRecordingUrl(unreadMessage.recordingUrl));

        const gather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-message-menu?msgId=${unreadMessage.id}&senderId=${unreadMessage.fromUserId}`,
          timeout: 10,
        });
        gather.say("Press 1 to reply to this message.");
        gather.say("Press 2 to hear the sender's profile.");
        gather.say("Press 3 to continue browsing profiles.");
        gather.say("Press 9 to return to the main menu.");

        // Fallback if no input received
        twiml.redirect("/voice/main-menu");
      } else {
        const randomProfile = await storage.getRandomProfile(user.id);

        if (randomProfile) {
          const playUrl = normalizeRecordingUrl(randomProfile.recordingUrl);
          console.log(`[voice] browse-profiles: playing profile for userId=${randomProfile.userId}, url=${playUrl}`);
          twiml.play(playUrl);

          const gather = twiml.gather({
            numDigits: 1,
            action: `/voice/handle-profile-menu?profileUserId=${randomProfile.userId}`,
            timeout: 10,
          });
          gather.say("Press 1 to send this caller a message.");
          gather.say("Press 2 to hear the next profile.");
          gather.say("Press 9 to return to main menu.");

          // Fallback if no input received
          twiml.redirect("/voice/main-menu");
        } else {
          twiml.say("There are no other profiles available at this time.");
          twiml.redirect("/voice/main-menu");
        }
      }
    } catch (error) {
      console.error("[voice] /voice/browse-profiles error:", error);
      twiml.say("An error occurred while browsing. Returning to the main menu.");
      twiml.redirect("/voice/main-menu");
    }

    const twimlOutput = twiml.toString();
    console.log(`[voice] browse-profiles: TwiML response =\n${twimlOutput}`);
    res.type("text/xml");
    res.send(twimlOutput);
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
        twiml.record({
          maxLength: 60,
          playBeep: true,
          action: `/voice/save-message?toUserId=${senderId}`,
        });
      } else if (digit === "2") {
        const senderProfile = await storage.getProfile(senderId);
        if (senderProfile) {
          twiml.play(normalizeRecordingUrl(senderProfile.recordingUrl));
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
        twiml.record({
          maxLength: 60,
          playBeep: true,
          action: `/voice/save-message?toUserId=${senderId}`,
        });
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
        twiml.record({
          maxLength: 60,
          playBeep: true,
          action: `/voice/save-message?toUserId=${profileUserId}`,
        });
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
      await storage.createMessage({ fromUserId: user.id, toUserId, recordingUrl: normalizeRecordingUrl(recordingUrl) });
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
