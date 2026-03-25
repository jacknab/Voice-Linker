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
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  membershipTier: text("membership_tier"),
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

export const insertRegionSchema = createInsertSchema(regions).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true, isRead: true });

export type Region = typeof regions.$inferSelect;
export type InsertRegion = z.infer<typeof insertRegionSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type ActiveCall = typeof activeCalls.$inferSelect;
