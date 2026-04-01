import { pgTable, text, boolean, timestamp, integer, uuid, doublePrecision } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const regions = pgTable("regions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  phoneNumber: text("phone_number").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  maxCapacity: integer("max_capacity").notNull().default(1000),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  linkedRegionId: uuid("linked_region_id"),
  defaultZipCode: text("default_zip_code"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lookup table — one row per unique US zip code, populated on first use
export const zipCodes = pgTable("zip_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  city: text("city"),
  state: text("state"),
  neighborhood: text("neighborhood"),
  audioFile: text("audio_file"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  membershipTier: text("membership_tier"),
  remainingSeconds: integer("remaining_seconds"),
  zipCodeId: uuid("zip_code_id").references(() => zipCodes.id),
  membershipNumber: text("membership_number").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().unique(),
  nameRecordingUrl: text("name_recording_url"),
  recordingUrl: text("recording_url").notNull(),
  recordingDuration: integer("recording_duration"),
  isAdminUploaded: boolean("is_admin_uploaded").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: uuid("from_user_id").notNull(),
  toUserId: uuid("to_user_id").notNull(),
  recordingUrl: text("recording_url").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tracks callers who are currently on the line (cleared when call ends)
export const activeCalls = pgTable("active_calls", {
  callSid: text("call_sid").primaryKey(),
  userId: uuid("user_id").notNull(),
  regionId: uuid("region_id"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Persistent log of every inbound call — used for operator phone-number stats
export const callLogs = pgTable("call_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  callSid: text("call_sid").notNull().unique(),
  regionId: uuid("region_id"),
  toPhoneNumber: text("to_phone_number"),    // Twilio access number that was dialed
  fromPhoneNumber: text("from_phone_number"), // Caller's originating number
  durationSeconds: integer("duration_seconds"), // null until call ends
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Relations
export const regionsRelations = relations(regions, ({ many }) => ({
  activeCalls: many(activeCalls),
}));

export const zipCodesRelations = relations(zipCodes, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  zipCode: one(zipCodes, {
    fields: [users.zipCodeId],
    references: [zipCodes.id],
  }),
  sentMessages: many(messages, { relationName: "sentMessages" }),
  receivedMessages: many(messages, { relationName: "receivedMessages" }),
  activeCalls: many(activeCalls),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  fromUser: one(users, {
    fields: [messages.fromUserId],
    references: [users.id],
    relationName: "sentMessages"
  }),
  toUser: one(users, {
    fields: [messages.toUserId],
    references: [users.id],
    relationName: "receivedMessages"
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const activeCallsRelations = relations(activeCalls, ({ one }) => ({
  user: one(users, {
    fields: [activeCalls.userId],
    references: [users.id],
  }),
  region: one(regions, {
    fields: [activeCalls.regionId],
    references: [regions.id],
  }),
}));

// Tracks blocked users — blockerId cannot live-connect with blockedUserId
export const blockedUsers = pgTable("blocked_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  blockerId: uuid("blocker_id").notNull(),
  blockedUserId: uuid("blocked_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const blockedUsersRelations = relations(blockedUsers, ({ one }) => ({
  blocker: one(users, { fields: [blockedUsers.blockerId], references: [users.id], relationName: "blocker" }),
  blocked: one(users, { fields: [blockedUsers.blockedUserId], references: [users.id], relationName: "blocked" }),
}));

// Flagged content queue — profiles or messages flagged for admin review
export const flaggedContent = pgTable("flagged_content", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  contentType: text("content_type").notNull(), // "profile" | "message"
  contentId: uuid("content_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "removed"
  reportedByUserId: uuid("reported_by_user_id"), // null = auto-flagged by system
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

// Singleton settings row for website/operator configuration
export const siteSettings = pgTable("site_settings", {
  id: text("id").primaryKey().default("singleton"),
  siteName: text("site_name").notNull().default("Phone Booth"),
  fallbackPhoneNumber: text("fallback_phone_number").notNull().default("800-730-2508"),
  customerServiceEmail: text("customer_service_email"),
  customerServicePhone: text("customer_service_phone"),
  // Site category: 'MM' = Men seeking Men (gay), 'MW' = Men seeking Women (straight)
  siteCategory: text("site_category").notNull().default("MM"),
});

export const insertSiteSettingsSchema = createInsertSchema(siteSettings).omit({ id: true });
export type SiteSettings = typeof siteSettings.$inferSelect;
export type InsertSiteSettings = z.infer<typeof insertSiteSettingsSchema>;

// Singleton settings row for membership/free-trial configuration
export const membershipSettings = pgTable("membership_settings", {
  id: text("id").primaryKey().default("singleton"),
  freeTrialMinutes: integer("free_trial_minutes").notNull().default(90),
  plan1Name: text("plan1_name").notNull().default("Premium"),
  plan1Minutes: integer("plan1_minutes").notNull().default(43200),
  plan1PriceCents: integer("plan1_price_cents").notNull().default(2500),
  plan2Name: text("plan2_name").notNull().default("Standard"),
  plan2Minutes: integer("plan2_minutes").notNull().default(20160),
  plan2PriceCents: integer("plan2_price_cents").notNull().default(1000),
  plan3Name: text("plan3_name").notNull().default("Basic"),
  plan3Minutes: integer("plan3_minutes").notNull().default(1440),
  plan3PriceCents: integer("plan3_price_cents").notNull().default(300),
  // Which plan key ("plan1", "plan2", "plan3") gets a first-time buyer double-minutes bonus, or null for none
  bonusPlanKey: text("bonus_plan_key"),
  // Announcement / MOTD — played to every caller right after the system greeting
  motdEnabled: boolean("motd_enabled").notNull().default(false),
  motdText: text("motd_text"),
  // Billing mode: 'per_minute' deducts during calls; 'per_day' deducts 1 day nightly at 23:59
  billingMode: text("billing_mode").notNull().default("per_minute"),
});

export const promoCodes = pgTable("promo_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  description: text("description"),
  valueMinutes: integer("value_minutes").notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const promoRedemptions = pgTable("promo_redemptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  promoCodeId: uuid("promo_code_id").notNull().references(() => promoCodes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  secondsAwarded: integer("seconds_awarded").notNull(),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
});

export const promoCodesRelations = relations(promoCodes, ({ many }) => ({
  redemptions: many(promoRedemptions),
}));

export const promoRedemptionsRelations = relations(promoRedemptions, ({ one }) => ({
  promoCode: one(promoCodes, { fields: [promoRedemptions.promoCodeId], references: [promoCodes.id] }),
  user: one(users, { fields: [promoRedemptions.userId], references: [users.id] }),
}));

// Admin action audit log — every write action in the admin panel creates a row
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),         // e.g. "profile_deleted", "caller_credited"
  targetType: text("target_type"),          // e.g. "profile", "region", "caller", "settings"
  targetId: text("target_id"),             // entity UUID/id (nullable)
  targetLabel: text("target_label"),        // human-readable label (e.g. phone number, code)
  detail: text("detail"),                   // optional JSON string with extra context
  performedBy: text("performed_by").notNull().default("admin"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true, createdAt: true, usedCount: true });
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;
export type PromoRedemption = typeof promoRedemptions.$inferSelect;

export const insertRegionSchema = createInsertSchema(regions).omit({ id: true, createdAt: true });
export const insertZipCodeSchema = createInsertSchema(zipCodes).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true, isRead: true });
export const insertMembershipSettingsSchema = createInsertSchema(membershipSettings).omit({ id: true });

export type Region = typeof regions.$inferSelect;
export type InsertRegion = z.infer<typeof insertRegionSchema>;

export type ZipCode = typeof zipCodes.$inferSelect;
export type InsertZipCode = z.infer<typeof insertZipCodeSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type ActiveCall = typeof activeCalls.$inferSelect;

export type MembershipSettings = typeof membershipSettings.$inferSelect;
export type InsertMembershipSettings = z.infer<typeof insertMembershipSettingsSchema>;

export const insertBlockedUserSchema = createInsertSchema(blockedUsers).omit({ id: true, createdAt: true });
export type BlockedUser = typeof blockedUsers.$inferSelect;
export type InsertBlockedUser = z.infer<typeof insertBlockedUserSchema>;

export type CallLog = typeof callLogs.$inferSelect;

export const insertFlaggedContentSchema = createInsertSchema(flaggedContent).omit({ id: true, createdAt: true, reviewedAt: true });
export type FlaggedContent = typeof flaggedContent.$inferSelect;
export type InsertFlaggedContent = z.infer<typeof insertFlaggedContentSchema>;

// ─── Mailboxes — one per member (free trial or paid) ─────────────────────────
// Categories: quick_hot_talk | bicurious | kink | total_top_strictly_bottoms | trans
export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  mailboxNumber: text("mailbox_number").notNull().unique(),
  category: text("category"),
  adRecordingUrl: text("ad_recording_url"),
  adRecordingDuration: integer("ad_recording_duration"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mailboxesRelations = relations(mailboxes, ({ one }) => ({
  user: one(users, { fields: [mailboxes.userId], references: [users.id] }),
}));

export const insertMailboxSchema = createInsertSchema(mailboxes).omit({ id: true, createdAt: true });
export type Mailbox = typeof mailboxes.$inferSelect;
export type InsertMailbox = z.infer<typeof insertMailboxSchema>;

// ─── Web Users (email/password auth for the website) ──────────────────────────
export const webUsers = pgTable("web_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  linkedPhoneNumber: text("linked_phone_number"),
  linkAttempts: integer("link_attempts").notNull().default(0),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Alternate phone numbers a web user can call in from — map to their primary membership
export const webUserAltPhones = pgTable("web_user_alt_phones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  webUserId: uuid("web_user_id").notNull().references(() => webUsers.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type WebUserAltPhone = typeof webUserAltPhones.$inferSelect;

export const insertWebUserSchema = createInsertSchema(webUsers).omit({ id: true, passwordHash: true, resetToken: true, resetTokenExpiry: true, createdAt: true }).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: z.string().email("Invalid email address"),
});

export type WebUser = typeof webUsers.$inferSelect;
export type InsertWebUser = z.infer<typeof insertWebUserSchema>;
