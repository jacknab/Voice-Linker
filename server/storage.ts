import { db } from "./db";
import { users, profiles, messages, activeCalls, type User, type Profile, type Message, type ActiveCall, type InsertUser, type InsertProfile, type InsertMessage } from "@shared/schema";
import { eq, and, not, count, sql, inArray, or } from "drizzle-orm";

export interface ProfileWithUser extends Profile {
  phoneNumber: string;
}

export interface IStorage {
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getOrCreateUser(phoneNumber: string): Promise<User>;

  getProfile(userId: string): Promise<Profile | undefined>;
  upsertProfile(profile: InsertProfile): Promise<Profile>;
  getAllProfilesWithUsers(): Promise<ProfileWithUser[]>;
  deleteProfile(id: string): Promise<void>;

  getUnreadMessage(userId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageRead(messageId: string): Promise<void>;

  // Active call tracking (real-time party line)
  registerActiveCall(callSid: string, userId: string): Promise<void>;
  removeActiveCall(callSid: string): Promise<void>;
  removeStaleActiveCalls(olderThanMinutes: number): Promise<void>;
  getActiveCallerCount(excludeUserId: string): Promise<number>;
  getAvailableProfileCount(excludeUserId: string): Promise<number>;
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

  async getOrCreateUser(phoneNumber: string): Promise<User> {
    let user = await this.getUserByPhone(phoneNumber);
    if (!user) {
      user = await this.createUser({ phoneNumber });
    }
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

  async getAllProfilesWithUsers(): Promise<ProfileWithUser[]> {
    const rows = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        recordingUrl: profiles.recordingUrl,
        recordingDuration: profiles.recordingDuration,
        isAdminUploaded: profiles.isAdminUploaded,
        createdAt: profiles.createdAt,
        phoneNumber: users.phoneNumber,
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .orderBy(profiles.createdAt);
    return rows;
  }

  async deleteProfile(id: string): Promise<void> {
    await db.delete(profiles).where(eq(profiles.id, id));
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

  async getAvailableProfileCount(excludeUserId: string): Promise<number> {
    // Count profiles from active callers OR admin-uploaded profiles, excluding the caller themselves
    const activeUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(not(eq(activeCalls.userId, excludeUserId)));

    const ids = activeUserIds.map(r => r.userId);
    const conditions = ids.length > 0
      ? or(inArray(profiles.userId, ids), eq(profiles.isAdminUploaded, true))
      : eq(profiles.isAdminUploaded, true);

    const [result] = await db.select({ count: count() })
      .from(profiles)
      .where(and(conditions, not(eq(profiles.userId, excludeUserId))));
    return result.count;
  }

  async getRandomActiveProfile(excludeUserId: string): Promise<Profile | undefined> {
    // Get user IDs of other active callers
    const activeUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(not(eq(activeCalls.userId, excludeUserId)));

    const ids = activeUserIds.map(r => r.userId);

    // Return a random profile from:
    //  (a) active callers who have a profile, OR
    //  (b) admin-uploaded profiles (always available in the pool)
    const conditions = ids.length > 0
      ? or(inArray(profiles.userId, ids), eq(profiles.isAdminUploaded, true))
      : eq(profiles.isAdminUploaded, true);

    const [profile] = await db.select()
      .from(profiles)
      .where(and(conditions, not(eq(profiles.userId, excludeUserId))))
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
