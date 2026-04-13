import { config as loadEnv } from "dotenv";
loadEnv();

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { startSimulator } from "./simulator";
import { startAudioAutogen } from "./audioAutogen";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// Trust the first proxy (nginx) so Express reads X-Forwarded-Proto correctly.
// Without this, secure cookies are never sent back through the proxy and
// every request after login comes back as 401.
app.set("trust proxy", 1);

// ── Admin Desktop App CORS ────────────────────────────────────────────────────
// Allows the standalone admin app running on localhost to reach the API.
// Only localhost/127.0.0.1 origins are permitted — no external site can abuse this.
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin ?? "";
  const isLocalhost =
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1");
  if (isLocalhost) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ─── Stripe Webhook (must be registered BEFORE express.json) ───────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature" });
    }
    try {
      const { WebhookHandlers } = await import("./webhookHandlers");
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[stripe] webhook error:", err.message);
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || "dev-fallback-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Start the virtual caller simulator after a short delay to let the DB settle
  setTimeout(() => startSimulator().catch(err => console.error("[simulator] startup error:", err)), 3000);

  // Start the hourly audio auto-generation cron (generates any missing prompt MP3s via ElevenLabs)
  startAudioAutogen();

  // Periodically purge any active_calls rows that are more than 20 minutes old.
  // This catches calls where Twilio's status callback never fired (e.g. network issues).
  const { storage } = await import("./storage");

  // Seed default personality profiles (Roger, Dom, Chill, Spicy) on first run
  storage.seedDefaultPersonalities().catch(err => console.error("[personality] seed error:", err));
  setInterval(async () => {
    try {
      await storage.removeStaleActiveCalls(20);
      await storage.finalizeOrphanedCallLogs(5);
    } catch (err) {
      console.error("[cleanup] stale active-call purge failed:", err);
    }
  }, 60 * 1000); // every 1 minute

  // Nightly per-day billing deduction — fires at 23:59 server time.
  // Only runs when billingMode is set to 'per_day' in membership settings.
  async function runNightlyDayDeduction() {
    try {
      const settings = await storage.getMembershipSettings();
      if (settings.billingMode !== "per_day") {
        log("Nightly billing: skipped (mode is per_minute)", "billing");
        return;
      }
      const affected = await storage.deductOneDayFromAllActiveMembers();
      log(`Nightly billing: deducted 1 day from ${affected} active member(s)`, "billing");
    } catch (err) {
      console.error("[billing] Nightly deduction error:", err);
    }
  }

  function scheduleNightlyDeduction() {
    const now = new Date();
    const next = new Date();
    next.setHours(23, 59, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1); // already past 23:59, push to tomorrow
    const delay = next.getTime() - now.getTime();
    log(`Nightly billing scheduler: next run in ${Math.round(delay / 60000)} min`, "billing");
    setTimeout(async () => {
      await runNightlyDayDeduction();
      scheduleNightlyDeduction(); // re-schedule for the following night
    }, delay);
  }

  scheduleNightlyDeduction();

  // ── SMS Marketing Scheduler ────────────────────────────────────────────────
  // Fires at 10:00 AM server time daily; sends any active template whose
  // sendDay matches today's day-of-month.
  async function runSmsDailyCheck() {
    try {
      const today = new Date().getDate();
      const templates = await storage.getSmsTemplates();
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken  = process.env.TWILIO_AUTH_TOKEN;
      if (!accountSid || !authToken) return;

      const twilioLib = await import("twilio");
      const client = twilioLib.default(accountSid, authToken);
      const siteSettings = await storage.getSiteSettings();
      const fromNumber = siteSettings.fallbackPhoneNumber;
      if (!fromNumber) return;

      for (const tpl of templates) {
        if (!tpl.isActive || tpl.sendDay !== today || !tpl.message.trim()) continue;

        if (tpl.lastSentAt) {
          const sentDate = new Date(tpl.lastSentAt);
          const now = new Date();
          if (sentDate.getDate() === today && sentDate.getMonth() === now.getMonth() && sentDate.getFullYear() === now.getFullYear()) {
            log(`SMS scheduler: Template #${tpl.id} already sent today — skipping`, "sms");
            continue;
          }
        }

        log(`SMS scheduler: Sending Template #${tpl.id} (day ${tpl.sendDay})…`, "sms");
        const phoneNumbers = await storage.getRealUserPhoneNumbers();
        let sent = 0, failed = 0;
        for (const to of phoneNumbers) {
          try {
            await client.messages.create({ from: fromNumber, to, body: tpl.message });
            sent++;
          } catch (err: any) {
            failed++;
            console.error(`[sms] Failed to send to ${to}:`, err.message);
          }
          await new Promise(r => setTimeout(r, 50));
        }
        await storage.markSmsSent(tpl.id, sent);
        log(`SMS scheduler: Template #${tpl.id} done — ${sent} sent, ${failed} failed`, "sms");
      }
    } catch (err) {
      console.error("[sms] Daily check error:", err);
    }
  }

  function scheduleSmsCheck() {
    const now = new Date();
    const next = new Date();
    next.setHours(10, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    log(`SMS scheduler: next check in ${Math.round(delay / 60000)} min`, "sms");
    setTimeout(async () => {
      await runSmsDailyCheck();
      scheduleSmsCheck();
    }, delay);
  }

  scheduleSmsCheck();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
