import { pgTable, text, boolean, timestamp, integer, uuid } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  membershipTier: text("membership_tier"),
  remainingMinutes: integer("remaining_minutes"),
  zipCode: text("zip_code"),
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

// Relations
export const regionsRelations = relations(regions, ({ many }) => ({
  activeCalls: many(activeCalls),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
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
});

export const insertRegionSchema = createInsertSchema(regions).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true, isRead: true });
export const insertMembershipSettingsSchema = createInsertSchema(membershipSettings).omit({ id: true });

export type Region = typeof regions.$inferSelect;
export type InsertRegion = z.infer<typeof insertRegionSchema>;

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
