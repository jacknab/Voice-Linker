import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { storage } from "./storage";
import { insertWebUserSchema } from "@shared/schema";
import { z } from "zod";

declare module "express-session" {
  interface SessionData {
    webUserId?: string;
    adminAccountId?: string;
  }
}

const router = Router();

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

function getBaseUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

async function sendResetEmail(to: string, resetUrl: string): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[auth] Password reset link for ${to}: ${resetUrl}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject: "Reset your password",
    text: `Click the link below to reset your password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────
router.post("/api/auth/register", async (req: Request, res: Response) => {
  const parsed = insertWebUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  try {
    const existing = await storage.getWebUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await storage.createWebUser(email, passwordHash);

    req.session.webUserId = user.id;
    await saveSession(req);
    return res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    console.error("[auth] register error:", err);
    return res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post("/api/auth/login", async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password." });
  }
  const { email, password } = parsed.data;

  try {
    const user = await storage.getWebUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (user.isLocked) {
      return res.status(403).json({ error: "Your account has been locked due to too many failed phone linking attempts. Please contact support." });
    }

    req.session.webUserId = user.id;
    await saveSession(req);
    return res.json({ id: user.id, email: user.email });
  } catch (err) {
    console.error("[auth] login error:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
router.post("/api/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    return res.json({ ok: true });
  });
});

// ─── Me (current session user) ───────────────────────────────────────────────
router.get("/api/auth/me", async (req: Request, res: Response) => {
  if (!req.session.webUserId) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const user = await storage.getWebUserById(req.session.webUserId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Session expired." });
    }
    return res.json({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      linkedPhoneNumber: user.linkedPhoneNumber,
      linkedMembershipNumber: user.linkedMembershipNumber ?? null,
      linkAttempts: user.linkAttempts,
      isLocked: user.isLocked,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch session." });
  }
});

// ─── Link Phone Number ────────────────────────────────────────────────────────
router.post("/api/auth/link-phone", async (req: Request, res: Response) => {
  if (!req.session.webUserId) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  try {
    const webUser = await storage.getWebUserById(req.session.webUserId);
    if (!webUser) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Session expired." });
    }

    if (webUser.isLocked) {
      req.session.destroy(() => {});
      return res.status(403).json({ error: "Your account has been locked. Please contact support." });
    }

    if (webUser.linkedPhoneNumber) {
      return res.status(400).json({ error: "A phone number is already linked to this account." });
    }

    const schema = z.object({ phoneNumber: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Please enter a valid phone number." });
    }

    // Normalize phone number: strip everything except digits, then ensure E.164-ish format
    const digits = parsed.data.phoneNumber.replace(/\D/g, "");
    let normalized: string;
    if (digits.length === 10) {
      normalized = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      normalized = `+${digits}`;
    } else if (digits.length > 7) {
      normalized = `+${digits}`;
    } else {
      return res.status(400).json({ error: "Please enter a valid 10-digit phone number." });
    }

    const phoneUser = await storage.getUserByPhone(normalized);

    // Fail if no user found OR if the user has no active membership tier
    const hasActiveMembership = phoneUser && phoneUser.membershipTier !== null;

    if (!hasActiveMembership) {
      const attempts = await storage.incrementWebUserLinkAttempts(webUser.id);
      const remaining = Math.max(0, 3 - attempts);

      if (attempts >= 3) {
        await storage.lockWebUser(webUser.id);
        req.session.destroy(() => {});
        console.log(`[auth] link-phone: account locked for web user ${webUser.id} after 3 failed attempts`);
        return res.status(403).json({
          error: "Your account has been locked after 3 failed attempts. Please contact support.",
          locked: true,
        });
      }

      console.log(`[auth] link-phone: failed attempt ${attempts}/3 for web user ${webUser.id} (phone=${normalized}, found=${!!phoneUser}, hasTier=${!!phoneUser?.membershipTier})`);
      return res.status(404).json({
        error: `No active membership found for that phone number. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        attemptsRemaining: remaining,
      });
    }

    await storage.linkWebUserPhone(webUser.id, normalized);
    console.log(`[auth] link-phone: linked ${normalized} to web user ${webUser.id}`);
    return res.json({ ok: true, phoneNumber: normalized });
  } catch (err) {
    console.error("[auth] link-phone error:", err);
    return res.status(500).json({ error: "Failed to link phone number. Please try again." });
  }
});

// ─── Linked Membership Data ───────────────────────────────────────────────────
router.get("/api/auth/membership", async (req: Request, res: Response) => {
  if (!req.session.webUserId) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const webUser = await storage.getWebUserById(req.session.webUserId);
    if (!webUser || !webUser.linkedPhoneNumber) {
      return res.status(404).json({ error: "No phone linked." });
    }
    const phoneUser = await storage.getUserByPhone(webUser.linkedPhoneNumber);
    if (!phoneUser) {
      return res.status(404).json({ error: "Linked phone number not found." });
    }
    const mailbox = await storage.getMailboxByUserId(phoneUser.id);
    return res.json({
      phoneNumber: phoneUser.phoneNumber,
      membershipTier: phoneUser.membershipTier,
      remainingSeconds: phoneUser.remainingSeconds,
      membershipNumber: phoneUser.membershipNumber,
      mailboxNumber: mailbox?.mailboxNumber ?? null,
    });
  } catch (err) {
    console.error("[auth] membership error:", err);
    return res.status(500).json({ error: "Failed to fetch membership data." });
  }
});

// ─── Call History ─────────────────────────────────────────────────────────────
router.get("/api/auth/call-history", async (req: Request, res: Response) => {
  if (!req.session.webUserId) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const webUser = await storage.getWebUserById(req.session.webUserId);
    if (!webUser || !webUser.linkedPhoneNumber) {
      return res.status(404).json({ error: "No phone linked." });
    }
    const history = await storage.getCallHistoryByPhone(webUser.linkedPhoneNumber, 100);
    return res.json(history);
  } catch (err) {
    console.error("[auth] call-history error:", err);
    return res.status(500).json({ error: "Failed to fetch call history." });
  }
});

// ─── Change Password ──────────────────────────────────────────────────────────
router.post("/api/auth/change-password", async (req: Request, res: Response) => {
  if (!req.session.webUserId) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await storage.getWebUserById(req.session.webUserId);
    if (!user) {
      return res.status(401).json({ error: "Session expired." });
    }
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await storage.updateWebUserPassword(user.id, passwordHash);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[auth] change-password error:", err);
    return res.status(500).json({ error: "Failed to change password. Please try again." });
  }
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
router.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email address." });
  }
  const { email } = parsed.data;

  // Always respond with the same message to prevent email enumeration
  const genericResponse = { ok: true, message: "If an account with that email exists, a reset link has been sent." };

  try {
    const user = await storage.getWebUserByEmail(email);
    if (!user) return res.json(genericResponse);

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await storage.setWebUserResetToken(email, token, expiry);

    const resetUrl = `${getBaseUrl(req)}/reset-password?token=${token}`;
    await sendResetEmail(email, resetUrl);

    return res.json(genericResponse);
  } catch (err) {
    console.error("[auth] forgot-password error:", err);
    return res.json(genericResponse);
  }
});

// ─── Reset Password ───────────────────────────────────────────────────────────
router.post("/api/auth/reset-password", async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { token, password } = parsed.data;

  try {
    const user = await storage.getWebUserByResetToken(token);
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await storage.updateWebUserPassword(user.id, passwordHash);
    await storage.clearWebUserResetToken(user.id);

    req.session.webUserId = user.id;
    await saveSession(req);
    return res.json({ ok: true, id: user.id, email: user.email });
  } catch (err) {
    console.error("[auth] reset-password error:", err);
    return res.status(500).json({ error: "Password reset failed. Please try again." });
  }
});

// ─── Helper: normalize phone number to E.164 ──────────────────────────────────
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 7) return `+${digits}`;
  return null;
}

// ─── GET /api/auth/alt-phones ─────────────────────────────────────────────────
router.get("/api/auth/alt-phones", async (req: Request, res: Response) => {
  if (!req.session.webUserId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const altPhones = await storage.getAltPhonesForWebUser(req.session.webUserId);
    return res.json(altPhones);
  } catch (err) {
    console.error("[auth] alt-phones GET error:", err);
    return res.status(500).json({ error: "Failed to load alternate phone numbers." });
  }
});

// ─── POST /api/auth/alt-phones ────────────────────────────────────────────────
router.post("/api/auth/alt-phones", async (req: Request, res: Response) => {
  if (!req.session.webUserId) return res.status(401).json({ error: "Not authenticated" });
  const schema = z.object({ phoneNumber: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Phone number is required." });

  const normalized = normalizePhone(parsed.data.phoneNumber);
  if (!normalized) return res.status(400).json({ error: "Please enter a valid phone number (10 digits)." });

  try {
    const webUser = await storage.getWebUserById(req.session.webUserId);
    if (!webUser) return res.status(401).json({ error: "Not authenticated" });
    if (!webUser.linkedPhoneNumber) {
      return res.status(400).json({ error: "You must link your primary phone before adding alternate numbers." });
    }

    // Can't add your own primary number as an alt
    if (normalized === webUser.linkedPhoneNumber) {
      return res.status(400).json({ error: "This is already your primary linked number." });
    }

    // Max 2 alt phones
    const existing = await storage.getAltPhonesForWebUser(req.session.webUserId);
    if (existing.length >= 2) {
      return res.status(400).json({ error: "You can only add up to 2 alternate phone numbers." });
    }

    // Must not already be someone's primary linked number
    const primaryUser = await storage.getUserByPhone(normalized);
    if (primaryUser?.membershipTier) {
      return res.status(400).json({ error: "This number is already associated with a membership. Please use a different number." });
    }

    const altPhone = await storage.addAltPhoneForWebUser(req.session.webUserId, normalized);
    console.log(`[auth] alt-phone added: ${normalized} for web user ${req.session.webUserId}`);
    return res.json(altPhone);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(400).json({ error: "This phone number is already linked to an account." });
    }
    console.error("[auth] alt-phones POST error:", err);
    return res.status(500).json({ error: "Failed to add alternate phone number." });
  }
});

// ─── DELETE /api/auth/alt-phones/:id ─────────────────────────────────────────
router.delete("/api/auth/alt-phones/:id", async (req: Request, res: Response) => {
  if (!req.session.webUserId) return res.status(401).json({ error: "Not authenticated" });
  try {
    await storage.removeAltPhoneForWebUser(req.session.webUserId as string, req.params.id as string);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[auth] alt-phones DELETE error:", err);
    return res.status(500).json({ error: "Failed to remove alternate phone number." });
  }
});

// ─── Link by Phone Number (MW mode) ──────────────────────────────────────────
// MW systems don't issue membership cards. Instead, the caller enters their
// 10-digit phone number and the system verifies they have an active membership
// with time remaining (and, for per_day billing, a non-expired activation).
router.post("/api/auth/link-phone-mw", async (req: Request, res: Response) => {
  if (!req.session.webUserId) return res.status(401).json({ error: "Not authenticated." });

  try {
    const webUser = await storage.getWebUserById(req.session.webUserId);
    if (!webUser) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Session expired." });
    }
    if (webUser.isLocked) {
      req.session.destroy(() => {});
      return res.status(403).json({ error: "Your account has been locked. Please contact support." });
    }
    if (webUser.linkedPhoneNumber) {
      return res.status(400).json({ error: "A phone number is already linked to this account." });
    }

    const rawPhone = String(req.body?.phoneNumber ?? "").trim();
    const normalized = normalizePhone(rawPhone);
    if (!normalized) {
      return res.status(400).json({ error: "Please enter a valid 10-digit phone number." });
    }

    const phoneUser = await storage.getUserByPhone(normalized);
    const membershipSettings = await storage.getMembershipSettings();
    const billingMode = membershipSettings.billingMode ?? "per_minute";

    let valid = false;
    let failReason = "No active membership found for that phone number.";

    if (phoneUser && phoneUser.membershipTier) {
      const remaining = phoneUser.remainingSeconds ?? 0;
      if (billingMode === "per_day") {
        // Per-day: must have at least one day remaining and a valid activation date
        if (remaining > 0 && phoneUser.membershipStartedAt !== null) {
          valid = true;
        } else if (remaining <= 0) {
          failReason = "Your membership has expired. Please call the access number to renew.";
        } else {
          failReason = "Your membership has not been fully activated yet. Please call the access number first.";
        }
      } else {
        // Per-minute: must have at least 1 minute remaining
        if (remaining >= 60) {
          valid = true;
        } else {
          failReason = "Your membership balance is too low to link. Please call the access number to add more time.";
        }
      }
    }

    if (!valid) {
      const attempts = await storage.incrementWebUserLinkAttempts(webUser.id);
      const remaining = Math.max(0, 3 - attempts);
      if (attempts >= 3) {
        await storage.lockWebUser(webUser.id);
        req.session.destroy(() => {});
        console.log(`[auth] link-phone-mw: account locked for web user ${webUser.id} after 3 failed attempts`);
        return res.status(403).json({
          error: "Your account has been locked after 3 failed attempts. Please contact support.",
          locked: true,
        });
      }
      console.log(`[auth] link-phone-mw: failed attempt ${attempts}/3 for web user ${webUser.id} (phone=${normalized})`);
      return res.status(404).json({
        error: `${failReason} ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        attemptsRemaining: remaining,
      });
    }

    await storage.linkWebUserPhone(webUser.id, normalized);
    console.log(`[auth] link-phone-mw: linked ${normalized} to web user ${webUser.id}`);
    return res.json({ ok: true, phoneNumber: normalized });
  } catch (err) {
    console.error("[auth] link-phone-mw error:", err);
    return res.status(500).json({ error: "Failed to link phone number. Please try again." });
  }
});

// ─── Link Membership Card ─────────────────────────────────────────────────────
// Validates a physical membership card (5-digit number + 4-digit PIN) and links
// the card's phone record to this web account.
router.post("/api/auth/link-card", async (req: Request, res: Response) => {
  if (!req.session.webUserId) return res.status(401).json({ error: "Not authenticated." });

  try {
    const webUser = await storage.getWebUserById(req.session.webUserId);
    if (!webUser) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Session expired." });
    }
    if (webUser.isLocked) {
      req.session.destroy(() => {});
      return res.status(403).json({ error: "Your account has been locked. Please contact support." });
    }
    if (webUser.linkedPhoneNumber) {
      return res.status(400).json({ error: "A phone number is already linked to this account." });
    }

    const cardNumber = String(req.body?.cardNumber ?? "").trim();
    const pin = String(req.body?.pin ?? "").trim();

    if (!/^\d{5}$/.test(cardNumber)) {
      return res.status(400).json({ error: "Please enter a valid 5-digit card number." });
    }
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: "Please enter a valid 4-digit PIN." });
    }

    const card = await storage.getMembershipCardByNumber(cardNumber);
    if (!card) {
      return res.status(404).json({ error: "Card not found. Please check the number and try again." });
    }
    if (!card.pin || card.pin !== pin) {
      return res.status(401).json({ error: "Incorrect PIN. Please try again." });
    }
    if (!card.phoneNumber) {
      return res.status(400).json({ error: "This card has not been activated yet. Please call the access number first to activate it." });
    }

    await storage.linkWebUserPhone(webUser.id, card.phoneNumber, card.cardNumber);
    console.log(`[auth] link-card: webUserId=${webUser.id} linked to phone=${card.phoneNumber} via card=${card.cardNumber}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[auth] link-card error:", err);
    return res.status(500).json({ error: "Failed to link card. Please try again." });
  }
});

// ─── Check Phone (pre-flight before generating link code) ────────────────────
// Verifies that a given phone number has an active membership in the system,
// so the dashboard can confirm eligibility before instructing the user to call.
router.post("/api/auth/check-phone", async (req: Request, res: Response) => {
  if (!req.session.webUserId) return res.status(401).json({ error: "Not authenticated." });

  try {
    const webUser = await storage.getWebUserById(req.session.webUserId);
    if (!webUser) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Session expired." });
    }
    if (webUser.isLocked) {
      req.session.destroy(() => {});
      return res.status(403).json({ error: "Your account has been locked. Please contact support." });
    }
    if (webUser.linkedPhoneNumber) {
      return res.status(400).json({ error: "A phone number is already linked to this account." });
    }

    const rawPhone = (req.body?.phoneNumber ?? "") as string;
    const digits = rawPhone.replace(/\D/g, "");
    let normalized: string;
    if (digits.length === 10) {
      normalized = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      normalized = `+${digits}`;
    } else {
      return res.status(400).json({ error: "Please enter a valid 10-digit US phone number." });
    }

    const phoneUser = await storage.getUserByPhone(normalized);
    const hasActiveMembership = phoneUser && phoneUser.membershipTier !== null && phoneUser.membershipTier !== "";

    if (!hasActiveMembership) {
      return res.status(404).json({ error: "No active membership found for that phone number. Please make sure you've purchased a membership by calling the access number first." });
    }

    console.log(`[auth] check-phone: active membership confirmed for ${normalized} (webUserId=${webUser.id})`);
    return res.json({ ok: true, phoneNumber: normalized });
  } catch (err) {
    console.error("[auth] check-phone error:", err);
    return res.status(500).json({ error: "Failed to verify phone number. Please try again." });
  }
});

// ─── Generate Phone Link Code ─────────────────────────────────────────────────
// Generates a 3-digit time-limited code the user presses on the phone keypad
// to verify they own that phone and link it to this web account.
router.post("/api/auth/generate-link-code", async (req: Request, res: Response) => {
  if (!req.session.webUserId) return res.status(401).json({ error: "Not authenticated." });

  try {
    const webUser = await storage.getWebUserById(req.session.webUserId);
    if (!webUser) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Session expired." });
    }
    if (webUser.linkedPhoneNumber) {
      return res.status(400).json({ error: "A phone number is already linked to this account." });
    }

    // Re-use an existing active code if one was recently generated
    const existing = await storage.getActiveCodeByWebUserId(webUser.id);
    if (existing) {
      return res.json({ code: existing.code, expiresAt: existing.expiresAt });
    }

    // Generate a unique 3-digit code (100–999 avoids a leading-zero display issue)
    let code = "";
    let attempts = 0;
    do {
      code = String(Math.floor(Math.random() * 900) + 100);
      attempts++;
    } while (attempts < 10 && !!(await storage.getActiveMembershipLinkCode(code)));

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // expires in 5 minutes
    const linkCode = await storage.createMembershipLinkCode(webUser.id, code, expiresAt);
    console.log(`[auth] generate-link-code: code=${linkCode.code} for webUserId=${webUser.id}`);
    return res.json({ code: linkCode.code, expiresAt: linkCode.expiresAt });
  } catch (err) {
    console.error("[auth] generate-link-code error:", err);
    return res.status(500).json({ error: "Failed to generate link code. Please try again." });
  }
});

export default router;
