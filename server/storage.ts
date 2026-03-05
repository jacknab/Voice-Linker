import { db } from "./db";
import { users, profiles, messages, type User, type Profile, type Message, type InsertUser, type InsertProfile, type InsertMessage } from "@shared/schema";
import { eq, and, not, count, sql } from "drizzle-orm";

export interface IStorage {
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getProfile(userId: string): Promise<Profile | undefined>;
  upsertProfile(profile: InsertProfile): Promise<Profile>;
  
  getUnreadMessage(userId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageRead(messageId: string): Promise<void>;
  
  getRandomProfile(excludeUserId: string): Promise<Profile | undefined>;
  
  getStats(): Promise<{users: number, profiles: number, messages: number}>;
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
  
  async getRandomProfile(excludeUserId: string): Promise<Profile | undefined> {
    const [profile] = await db.select()
      .from(profiles)
      .where(not(eq(profiles.userId, excludeUserId)))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return profile;
  }
  
  async getStats(): Promise<{users: number, profiles: number, messages: number}> {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [profileCount] = await db.select({ count: count() }).from(profiles);
    const [messageCount] = await db.select({ count: count() }).from(messages);
    
    return {
      users: userCount.count,
      profiles: profileCount.count,
      messages: messageCount.count
    };
  }
}

export const storage = new DatabaseStorage();
