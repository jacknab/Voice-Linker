import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import express from "express";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Parse urlencoded bodies for Twilio webhook
  app.use(express.urlencoded({ extended: true }));

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
  
  // Helper to ensure user exists
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
    const fromNumber = req.body.From;
    
    if (!fromNumber) {
      twiml.say("We could not identify your caller ID. Goodbye.");
      twiml.hangup();
      res.type('text/xml');
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
          action: "/voice/save-profile"
        });
      } else {
        twiml.redirect("/voice/main-menu");
      }
    } catch (error) {
      console.error(error);
      twiml.say("An error occurred. Please try again later.");
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
  });

  // 2. Save Profile
  app.post("/voice/save-profile", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body.From;
    const recordingUrl = req.body.RecordingUrl;
    const recordingDuration = parseInt(req.body.RecordingDuration) || null;

    try {
      const user = await getOrCreateUser(fromNumber);
      await storage.upsertProfile({
        userId: user.id,
        recordingUrl,
        recordingDuration
      });

      twiml.say("Your profile has been saved.");
      twiml.redirect("/voice/main-menu");
    } catch (error) {
      console.error(error);
      twiml.say("We could not save your profile.");
      twiml.hangup();
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // 3. Main Menu
  app.post("/voice/main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    
    const gather = twiml.gather({
      numDigits: 1,
      action: "/voice/handle-main-menu",
    });
    
    gather.say("Welcome to the voice line.");
    gather.say("Press 1 to listen to profiles. Press 2 to re-record your profile.");
    
    twiml.redirect("/voice/main-menu"); // If no input, loop
    
    res.type('text/xml');
    res.send(twiml.toString());
  });

  app.post("/voice/handle-main-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body.Digits;

    if (digit === '1') {
      twiml.redirect("/voice/browse-profiles");
    } else if (digit === '2') {
      twiml.say("After the tone, record your new profile. You have 30 seconds.");
      twiml.record({
        maxLength: 30,
        playBeep: true,
        action: "/voice/save-profile"
      });
    } else {
      twiml.say("Invalid choice.");
      twiml.redirect("/voice/main-menu");
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // 4. Browse Profiles Logic (STEP 1 & 2 & 3)
  app.post("/voice/browse-profiles", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body.From;

    try {
      const user = await getOrCreateUser(fromNumber);
      
      // STEP 1: Check unread messages
      const unreadMessage = await storage.getUnreadMessage(user.id);
      
      if (unreadMessage) {
        // STEP 2: Deliver message
        twiml.say("You have a new message.");
        twiml.play(unreadMessage.recordingUrl);
        
        const gather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-message-menu?msgId=${unreadMessage.id}&senderId=${unreadMessage.fromUserId}`
        });
        
        gather.say("Press 1 to reply to this message.");
        gather.say("Press 2 to hear the sender's profile.");
        gather.say("Press 3 to continue browsing profiles.");
        gather.say("Press 9 to return to the main menu.");
        
      } else {
        // STEP 3: Play next profile
        const randomProfile = await storage.getRandomProfile(user.id);
        
        if (randomProfile) {
          twiml.play(randomProfile.recordingUrl);
          
          const gather = twiml.gather({
            numDigits: 1,
            action: `/voice/handle-profile-menu?profileUserId=${randomProfile.userId}`
          });
          gather.say("Press 1 to send this caller a message.");
          gather.say("Press 2 to hear the next profile.");
          gather.say("Press 9 to return to main menu.");
        } else {
          twiml.say("There are no other profiles available at this time.");
          twiml.redirect("/voice/main-menu");
        }
      }
    } catch (error) {
      console.error(error);
      twiml.say("An error occurred while browsing.");
      twiml.redirect("/voice/main-menu");
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // 5. Handle Message Menu
  app.post("/voice/handle-message-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body.Digits;
    const msgId = req.query.msgId as string;
    const senderId = req.query.senderId as string;

    if (digit === '1') {
      // Reply to message
      await storage.markMessageRead(msgId);
      twiml.say("Record your reply after the tone.");
      twiml.record({
        maxLength: 60,
        playBeep: true,
        action: `/voice/save-message?toUserId=${senderId}`
      });
    } else if (digit === '2') {
      // Hear sender's profile
      try {
        const senderProfile = await storage.getProfile(senderId);
        if (senderProfile) {
          twiml.play(senderProfile.recordingUrl);
        } else {
          twiml.say("This caller no longer has a profile.");
        }
        const gather = twiml.gather({
          numDigits: 1,
          action: `/voice/handle-sender-profile-menu?senderId=${senderId}&msgId=${msgId}`
        });
        gather.say("Press 1 to send a message. Press 2 to continue browsing profiles. Press 9 to return to main menu.");
      } catch (error) {
        twiml.say("Error finding profile.");
        twiml.redirect("/voice/browse-profiles");
      }
    } else if (digit === '3') {
      // Continue browsing
      await storage.markMessageRead(msgId);
      twiml.redirect("/voice/browse-profiles");
    } else if (digit === '9') {
      await storage.markMessageRead(msgId);
      twiml.redirect("/voice/main-menu");
    } else {
      twiml.say("Invalid choice.");
      twiml.redirect(`/voice/browse-profiles`); // Will re-trigger message playback if unread
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  app.post("/voice/handle-sender-profile-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body.Digits;
    const senderId = req.query.senderId as string;
    const msgId = req.query.msgId as string;

    if (digit === '1') {
      await storage.markMessageRead(msgId);
      twiml.say("Record your message after the tone.");
      twiml.record({
        maxLength: 60,
        playBeep: true,
        action: `/voice/save-message?toUserId=${senderId}`
      });
    } else if (digit === '2') {
      await storage.markMessageRead(msgId);
      twiml.redirect("/voice/browse-profiles");
    } else if (digit === '9') {
      await storage.markMessageRead(msgId);
      twiml.redirect("/voice/main-menu");
    } else {
      twiml.say("Invalid choice.");
      twiml.redirect("/voice/browse-profiles");
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
  });

  // 6. Handle Profile Menu
  app.post("/voice/handle-profile-menu", async (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body.Digits;
    const profileUserId = req.query.profileUserId as string;

    if (digit === '1') {
      twiml.say("Record your message after the tone.");
      twiml.record({
        maxLength: 60,
        playBeep: true,
        action: `/voice/save-message?toUserId=${profileUserId}`
      });
    } else if (digit === '2') {
      twiml.redirect("/voice/browse-profiles");
    } else if (digit === '9') {
      twiml.redirect("/voice/main-menu");
    } else {
      twiml.say("Invalid choice.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // 7. Save Message
  app.post("/voice/save-message", async (req, res) => {
    const twiml = new VoiceResponse();
    const fromNumber = req.body.From;
    const recordingUrl = req.body.RecordingUrl;
    const toUserId = req.query.toUserId as string;

    try {
      const user = await getOrCreateUser(fromNumber);
      await storage.createMessage({
        fromUserId: user.id,
        toUserId,
        recordingUrl
      });
      twiml.say("Your message has been sent. Returning to the profiles.");
      twiml.redirect("/voice/browse-profiles");
    } catch (error) {
      console.error(error);
      twiml.say("Failed to send message.");
      twiml.redirect("/voice/browse-profiles");
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  return httpServer;
}
