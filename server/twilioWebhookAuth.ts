import type { Request, Response, NextFunction } from "express";
import twilio from "twilio";

let warnedMissingToken = false;
let warnedDevBypass = false;

function fullPublicUrl(req: Request): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ||
    req.protocol;
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ||
    req.headers.host ||
    "";
  return `${proto}://${host}${req.originalUrl}`;
}

export function twilioWebhookAuth(req: Request, res: Response, next: NextFunction): void {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const isProduction = process.env.NODE_ENV === "production";

  if (!authToken) {
    if (isProduction) {
      console.error(
        "[twilio-auth] BLOCKED: TWILIO_AUTH_TOKEN is not set in production — refusing webhook.",
      );
      res.status(503).json({ error: "Twilio webhook auth not configured" });
      return;
    }
    if (!warnedMissingToken) {
      warnedMissingToken = true;
      console.warn(
        "[twilio-auth] TWILIO_AUTH_TOKEN not set — webhook signature validation DISABLED (dev only).",
      );
    }
    next();
    return;
  }

  if (!isProduction && process.env.TWILIO_WEBHOOK_VALIDATE !== "true") {
    if (!warnedDevBypass) {
      warnedDevBypass = true;
      console.warn(
        "[twilio-auth] Dev mode — webhook signature validation bypassed. Set TWILIO_WEBHOOK_VALIDATE=true to enforce.",
      );
    }
    next();
    return;
  }

  const signature = req.headers["x-twilio-signature"];
  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) {
    console.warn(`[twilio-auth] Missing X-Twilio-Signature on ${req.method} ${req.originalUrl}`);
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const url = fullPublicUrl(req);
  const params = (req.body && typeof req.body === "object") ? req.body : {};

  const valid = twilio.validateRequest(authToken, sig, url, params);
  if (!valid) {
    console.warn(
      `[twilio-auth] INVALID signature on ${req.method} ${req.originalUrl} — rejecting (url=${url})`,
    );
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
