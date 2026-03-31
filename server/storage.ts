import { db } from "./db";
import { regions, users, profiles, messages, activeCalls, membershipSettings, blockedUsers, type Region, type InsertRegion, type User, type Profile, type Message, type ActiveCall, type InsertUser, type InsertProfile, type InsertMessage, type MembershipSettings, type InsertMembershipSettings } from "@shared/schema";
import { eq, and, not, count, sql, inArray, or, notLike, isNull } from "drizzle-orm";

const VIRTUAL_PREFIX = "VIRTUAL-";

export interface ProfileWithUser extends Profile {
  phoneNumber: string;
}

export interface IStorage {
  // Regions
  getAllRegions(): Promise<Region[]>;
  getRegionBySlug(slug: string): Promise<Region | undefined>;
  getRegionById(id: string): Promise<Region | undefined>;
  createRegion(region: InsertRegion): Promise<Region>;
  updateRegion(id: string, data: Partial<InsertRegion>): Promise<Region>;
  deleteRegion(id: string): Promise<void>;
  getRegionActiveUserCount(regionId: string): Promise<number>;

  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
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
  registerActiveCall(callSid: string, userId: string, regionId?: string): Promise<void>;
  removeActiveCall(callSid: string): Promise<void>;
  removeStaleActiveCalls(olderThanMinutes: number): Promise<void>;
  getActiveCallerCount(excludeUserId: string, regionId?: string): Promise<number>;
  getAvailableProfileCount(excludeUserId: string, regionId?: string): Promise<number>;
  getAllActiveProfiles(excludeUserId: string, regionId?: string): Promise<Profile[]>;
  getActiveCallByUserId(userId: string): Promise<ActiveCall | undefined>;
  getRegionStats(regionId: string): Promise<{ activeCalls: number; voiceProfiles: number; messagesRelayed: number }>;

  // Block list
  isUserBlocked(blockerId: string, blockedUserId: string): Promise<boolean>;
  blockUser(blockerId: string, blockedUserId: string): Promise<void>;
  unblockUser(blockerId: string, blockedUserId: string): Promise<void>;

  updateUserMembership(userId: string, data: { stripeCustomerId?: string; membershipTier?: string; remainingMinutes?: number }): Promise<User>;
  deductMinutes(userId: string, minutes: number): Promise<User>;
  updateZipCode(userId: string, zipCode: string | null, geo?: { latitude: string; longitude: string; city: string; state: string }): Promise<void>;

  getMembershipSettings(): Promise<MembershipSettings>;
  updateMembershipSettings(data: Partial<InsertMembershipSettings>): Promise<MembershipSettings>;

  getStats(): Promise<{ users: number; profiles: number; messages: number; activeCalls: number }>;
}

export class DatabaseStorage implements IStorage {
  // --- Region CRUD ---

  async getAllRegions(): Promise<Region[]> {
    return db.select().from(regions).orderBy(regions.createdAt);
  }

  async getRegionBySlug(slug: string): Promise<Region | undefined> {
    const [region] = await db.select().from(regions).where(eq(regions.slug, slug));
    return region;
  }

  async getRegionById(id: string): Promise<Region | undefined> {
    const [region] = await db.select().from(regions).where(eq(regions.id, id));
    return region;
  }

  async createRegion(insertRegion: InsertRegion): Promise<Region> {
    const [region] = await db.insert(regions).values(insertRegion).returning();
    return region;
  }

  async updateRegion(id: string, data: Partial<InsertRegion>): Promise<Region> {
    const [region] = await db.update(regions).set(data).where(eq(regions.id, id)).returning();
    return region;
  }

  async deleteRegion(id: string): Promise<void> {
    await db.delete(regions).where(eq(regions.id, id));
  }

  async getRegionActiveUserCount(regionId: string): Promise<number> {
    const [result] = await db.select({ count: count() })
      .from(activeCalls)
      .where(eq(activeCalls.regionId, regionId));
    return result.count;
  }

  // --- User CRUD ---

  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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
          ...(insertProfile.nameRecordingUrl !== undefined && {
            nameRecordingUrl: insertProfile.nameRecordingUrl,
          }),
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

  async registerActiveCall(callSid: string, userId: string, regionId?: string): Promise<void> {
    await db.insert(activeCalls)
      .values({ callSid, userId, regionId: regionId ?? null })
      .onConflictDoUpdate({
        target: activeCalls.callSid,
        set: { userId, regionId: regionId ?? null, joinedAt: sql`now()` },
      });
  }

  async removeActiveCall(callSid: string): Promise<void> {
    await db.delete(activeCalls).where(eq(activeCalls.callSid, callSid));
  }

  async removeStaleActiveCalls(olderThanMinutes: number): Promise<void> {
    await db.delete(activeCalls)
      .where(
        and(
          sql`joined_at < now() - interval '${sql.raw(String(olderThanMinutes))} minutes'`,
          notLike(activeCalls.callSid, `${VIRTUAL_PREFIX}%`)
        )
      );
  }

  async getActiveCallerCount(excludeUserId: string, regionId?: string): Promise<number> {
    const conditions = regionId
      ? and(not(eq(activeCalls.userId, excludeUserId)), eq(activeCalls.regionId, regionId))
      : not(eq(activeCalls.userId, excludeUserId));
    const [result] = await db.select({ count: count() })
      .from(activeCalls)
      .where(conditions);
    return result.count;
  }

  async getAvailableProfileCount(excludeUserId: string, regionId?: string): Promise<number> {
    const activeUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(
        regionId
          ? and(not(eq(activeCalls.userId, excludeUserId)), eq(activeCalls.regionId, regionId))
          : not(eq(activeCalls.userId, excludeUserId))
      );

    const ids = activeUserIds.map(r => r.userId);
    const conditions = ids.length > 0
      ? or(inArray(profiles.userId, ids), eq(profiles.isAdminUploaded, true))
      : eq(profiles.isAdminUploaded, true);

    const [result] = await db.select({ count: count() })
      .from(profiles)
      .where(and(conditions, not(eq(profiles.userId, excludeUserId))));
    return result.count;
  }

  async getAllActiveProfiles(excludeUserId: string, regionId?: string): Promise<Profile[]> {
    const activeUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(
        regionId
          ? and(not(eq(activeCalls.userId, excludeUserId)), eq(activeCalls.regionId, regionId))
          : not(eq(activeCalls.userId, excludeUserId))
      );

    const ids = activeUserIds.map(r => r.userId);
    const conditions = ids.length > 0
      ? or(inArray(profiles.userId, ids), eq(profiles.isAdminUploaded, true))
      : eq(profiles.isAdminUploaded, true);

    // Priority: 0 = paid members, 1 = free trial / no membership, 2 = admin-uploaded
    const membershipPriority = sql<number>`
      CASE
        WHEN ${profiles.isAdminUploaded} = true THEN 2
        WHEN ${users.membershipTier} IS NOT NULL AND ${users.membershipTier} != 'free_trial' THEN 0
        ELSE 1
      END
    `;

    const rows = await db.select({ profile: profiles })
      .from(profiles)
      .leftJoin(users, eq(profiles.userId, users.id))
      .where(and(conditions, not(eq(profiles.userId, excludeUserId))))
      .orderBy(membershipPriority, profiles.createdAt);

    return rows.map(r => r.profile);
  }

  async getActiveCallByUserId(userId: string): Promise<ActiveCall | undefined> {
    const [call] = await db.select().from(activeCalls).where(eq(activeCalls.userId, userId)).limit(1);
    return call;
  }

  async isUserBlocked(blockerId: string, blockedUserId: string): Promise<boolean> {
    const [row] = await db.select({ id: blockedUsers.id })
      .from(blockedUsers)
      .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedUserId, blockedUserId)))
      .limit(1);
    return !!row;
  }

  async blockUser(blockerId: string, blockedUserId: string): Promise<void> {
    await db.insert(blockedUsers).values({ blockerId, blockedUserId }).onConflictDoNothing();
  }

  async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    await db.delete(blockedUsers).where(
      and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedUserId, blockedUserId))
    );
  }

  async getRegionStats(regionId: string): Promise<{ activeCalls: number; voiceProfiles: number; messagesRelayed: number }> {
    // Active callers currently in this region
    const [activeResult] = await db.select({ count: count() })
      .from(activeCalls)
      .where(eq(activeCalls.regionId, regionId));

    // Voice profiles: users currently active in this region + admin-uploaded profiles
    const activeUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(eq(activeCalls.regionId, regionId));
    const ids = activeUserIds.map(r => r.userId);
    const profileCondition = ids.length > 0
      ? or(inArray(profiles.userId, ids), eq(profiles.isAdminUploaded, true))
      : eq(profiles.isAdminUploaded, true);
    const [profileResult] = await db.select({ count: count() })
      .from(profiles)
      .where(profileCondition);

    // Messages relayed system-wide (messages have no region association)
    const [msgResult] = await db.select({ count: count() }).from(messages);

    return {
      activeCalls: activeResult.count,
      voiceProfiles: profileResult.count,
      messagesRelayed: msgResult.count,
    };
  }

  async updateUserMembership(userId: string, data: { stripeCustomerId?: string; membershipTier?: string; remainingMinutes?: number }): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, userId)).returning();
    return user;
  }

  async deductMinutes(userId: string, minutes: number): Promise<User> {
    const [user] = await db.update(users)
      .set({ remainingMinutes: sql`GREATEST(0, COALESCE(${users.remainingMinutes}, 0) - ${minutes})` })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateZipCode(userId: string, zipCode: string | null, geo?: { latitude: string; longitude: string; city: string; state: string }): Promise<void> {
    await db.update(users).set({ zipCode, ...geo }).where(eq(users.id, userId));
  }

  async getMembershipSettings(): Promise<MembershipSettings> {
    const [settings] = await db.select().from(membershipSettings).where(eq(membershipSettings.id, "singleton"));
    if (settings) return settings;
    const [created] = await db.insert(membershipSettings).values({ id: "singleton" }).returning();
    return created;
  }

  async updateMembershipSettings(data: Partial<InsertMembershipSettings>): Promise<MembershipSettings> {
    const [updated] = await db.insert(membershipSettings)
      .values({ id: "singleton", ...data })
      .onConflictDoUpdate({ target: membershipSettings.id, set: data })
      .returning();
    return updated;
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
