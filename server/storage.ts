import { db } from "./db";
import { users, profiles, messages, activeCalls, type User, type Profile, type Message, type ActiveCall, type InsertUser, type InsertProfile, type InsertMessage } from "@shared/schema";
import { eq, and, not, count, sql, inArray } from "drizzle-orm";

export interface IStorage {
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getProfile(userId: string): Promise<Profile | undefined>;
  upsertProfile(profile: InsertProfile): Promise<Profile>;

  getUnreadMessage(userId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageRead(messageId: string): Promise<void>;

  // Active call tracking (real-time party line)
  registerActiveCall(callSid: string, userId: string): Promise<void>;
  removeActiveCall(callSid: string): Promise<void>;
  removeStaleActiveCalls(olderThanMinutes: number): Promise<void>;
  getActiveCallerCount(excludeUserId: string): Promise<number>;
  getRandomActiveProfile(excludeUserId: string): Promise<Profile | undefined>;

  getStats(): Promise<{ users: number; profiles: number; messages: number; activeCalls: number }>;
}

export class DatabaseStorage implements IStorage {
  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return profile;
  }

  async upsertProfile(insertProfile: InsertProfile): Promise<Profile> {
    const [profile] = await db.insert(profiles)
      .values(insertProfile)
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          recordingUrl: insertProfile.recordingUrl,
          recordingDuration: insertProfile.recordingDuration,
        }
      })
      .returning();
    return profile;
  }

  async getUnreadMessage(userId: string): Promise<Message | undefined> {
    const [message] = await db.select()
      .from(messages)
      .where(and(
        eq(messages.toUserId, userId),
        eq(messages.isRead, false)
      ))
      .limit(1);
    return message;
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }

  async markMessageRead(messageId: string): Promise<void> {
    await db.update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, messageId));
  }

  // --- Active Call Tracking ---

  async registerActiveCall(callSid: string, userId: string): Promise<void> {
    await db.insert(activeCalls)
      .values({ callSid, userId })
      .onConflictDoUpdate({
        target: activeCalls.callSid,
        set: { userId, joinedAt: sql`now()` },
      });
  }

  async removeActiveCall(callSid: string): Promise<void> {
    await db.delete(activeCalls).where(eq(activeCalls.callSid, callSid));
  }

  // Safety valve: clean up calls that have been "active" too long (missed status callbacks)
  async removeStaleActiveCalls(olderThanMinutes: number): Promise<void> {
    await db.delete(activeCalls)
      .where(sql`joined_at < now() - interval '${sql.raw(String(olderThanMinutes))} minutes'`);
  }

  async getActiveCallerCount(excludeUserId: string): Promise<number> {
    const [result] = await db.select({ count: count() })
      .from(activeCalls)
      .where(not(eq(activeCalls.userId, excludeUserId)));
    return result.count;
  }

  async getRandomActiveProfile(excludeUserId: string): Promise<Profile | undefined> {
    // Get user IDs of other active callers who have profiles
    const activeUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(not(eq(activeCalls.userId, excludeUserId)));

    if (activeUserIds.length === 0) return undefined;

    const ids = activeUserIds.map(r => r.userId);
    const [profile] = await db.select()
      .from(profiles)
      .where(inArray(profiles.userId, ids))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return profile;
  }

  async getStats(): Promise<{ users: number; profiles: number; messages: number; activeCalls: number }> {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [profileCount] = await db.select({ count: count() }).from(profiles);
    const [messageCount] = await db.select({ count: count() }).from(messages);
    const [activeCount] = await db.select({ count: count() }).from(activeCalls);

    return {
      users: userCount.count,
      profiles: profileCount.count,
      messages: messageCount.count,
      activeCalls: activeCount.count,
    };
  }
}

export const storage = new DatabaseStorage();
