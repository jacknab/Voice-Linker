import { db } from "./db";
import { regions, users, profiles, messages, activeCalls, membershipSettings, blockedUsers, zipCodes, callLogs, flaggedContent, promoCodes, promoRedemptions, type Region, type InsertRegion, type User, type Profile, type Message, type ActiveCall, type InsertUser, type InsertProfile, type InsertMessage, type MembershipSettings, type InsertMembershipSettings, type ZipCode, type FlaggedContent, type InsertFlaggedContent, type PromoCode, type InsertPromoCode, type PromoRedemption } from "@shared/schema";
import { eq, and, not, count, sql, inArray, notInArray, or, notLike, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const VIRTUAL_PREFIX = "VIRTUAL-";

export interface ProfileWithUser extends Profile {
  phoneNumber: string;
}

export interface CallerSummary {
  id: string;
  phoneNumber: string;
  membershipTier: string | null;
  remainingSeconds: number | null;
  createdAt: Date | null;
  hasProfile: boolean;
  callCount: number;
  messageCount: number;
  blockCount: number;
}

export interface CallerDetail {
  user: User;
  profile: Profile | null;
  callHistory: { id: string; callSid: string; durationSeconds: number | null; startedAt: Date | null; completedAt: Date | null; toPhoneNumber: string | null }[];
  sentMessages: { id: string; toPhoneNumber: string; createdAt: Date | null; isRead: boolean | null }[];
  receivedMessages: { id: string; fromPhoneNumber: string; createdAt: Date | null; isRead: boolean | null }[];
  blockedByUser: { id: string; phoneNumber: string; blockedAt: Date | null }[];
  blockedByOthers: { id: string; phoneNumber: string; blockedAt: Date | null }[];
}

export interface FlaggedItemWithDetails {
  id: string;
  contentType: string;
  contentId: string;
  reason: string;
  status: string;
  createdAt: Date | null;
  reviewedAt: Date | null;
  reportedByPhone: string | null;
  // Profile fields (when contentType === "profile")
  profilePhone: string | null;
  profileRecordingUrl: string | null;
  profileDuration: number | null;
  // Message fields (when contentType === "message")
  messageFromPhone: string | null;
  messageToPhone: string | null;
  messageRecordingUrl: string | null;
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
  getNearbyProfileUserIds(excludeUserId: string, regionId: string | undefined, callerLat: number, callerLon: number, thresholdKm: number): Promise<string[]>;
  getActiveCallByUserId(userId: string): Promise<ActiveCall | undefined>;
  getZipEntryById(id: string): Promise<ZipCode | undefined>;
  getRegionStats(regionId: string): Promise<{ activeCalls: number; voiceProfiles: number; messagesRelayed: number }>;

  // Block list
  isUserBlocked(blockerId: string, blockedUserId: string): Promise<boolean>;
  blockUser(blockerId: string, blockedUserId: string): Promise<void>;
  unblockUser(blockerId: string, blockedUserId: string): Promise<void>;

  // Admin blocked list
  getAdminBlockedList(): Promise<{
    id: string;
    blockerPhone: string;
    blockedPhone: string;
    createdAt: Date;
  }[]>;
  adminUnblockById(id: string): Promise<void>;

  updateUserMembership(userId: string, data: { stripeCustomerId?: string; membershipTier?: string; remainingSeconds?: number }): Promise<User>;
  deductSeconds(userId: string, seconds: number): Promise<User>;
  getZipEntryByCode(code: string): Promise<ZipCode | undefined>;
  getOrCreateZipEntry(code: string, geo?: { latitude: number; longitude: number; city: string; state: string; neighborhood?: string | null }): Promise<ZipCode>;
  setUserZipCode(userId: string, zipCodeId: string): Promise<void>;
  getAllZipCodes(): Promise<ZipCode[]>;
  upsertAdminZipEntry(code: string, neighborhood: string): Promise<ZipCode>;
  deleteZipEntry(id: string): Promise<void>;
  updateZipNeighborhood(id: string, neighborhood: string): Promise<ZipCode>;

  getMembershipSettings(): Promise<MembershipSettings>;
  updateMembershipSettings(data: Partial<InsertMembershipSettings>): Promise<MembershipSettings>;

  // Call log tracking for phone-number stats
  logCall(callSid: string, fromPhoneNumber: string, toPhoneNumber: string | null, regionId: string | null): Promise<void>;
  finalizeCallLog(callSid: string, durationSeconds: number): Promise<void>;
  getPhoneNumberStats(year: number, month: number): Promise<{
    phoneNumber: string;
    regionId: string | null;
    regionName: string | null;
    callCount: number;
    totalSeconds: number;
    lastCallAt: Date | null;
  }[]>;

  getStats(): Promise<{ users: number; profiles: number; messages: number; activeCalls: number }>;

  // Caller management (admin)
  getAllCallersWithDetails(): Promise<CallerSummary[]>;
  getCallerDetailById(userId: string): Promise<CallerDetail | null>;
  adjustUserCredits(userId: string, deltaSeconds: number): Promise<User>;
  adminBlockByUserIds(blockerId: string, blockedUserId: string): Promise<void>;
  adminUnblockByUserIds(blockerId: string, blockedUserId: string): Promise<void>;

  // Flagged content queue
  getAllFlaggedItems(status?: string): Promise<FlaggedItemWithDetails[]>;
  createFlaggedItem(data: InsertFlaggedContent): Promise<FlaggedContent>;
  resolveFlaggedItem(id: string, status: string): Promise<void>;
  deleteFlaggedItem(id: string): Promise<void>;

  // Promo codes
  getAllPromoCodes(): Promise<(PromoCode & { redemptionCount: number })[]>;
  createPromoCode(data: InsertPromoCode): Promise<PromoCode>;
  updatePromoCode(id: string, data: Partial<InsertPromoCode>): Promise<PromoCode>;
  deletePromoCode(id: string): Promise<void>;
  redeemPromoCode(code: string, userId: string): Promise<{ promoCode: PromoCode; secondsAwarded: number } | { error: string }>;
  getPromoRedemptions(promoCodeId: string): Promise<(PromoRedemption & { phoneNumber: string })[]>;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function neighborhoodToAudioFile(neighborhood: string): string {
  const slug = neighborhood
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `neighborhood_${slug}.mp3`;
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
        nameRecordingUrl: profiles.nameRecordingUrl,
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

    // Collect all user IDs blocked in either direction so we can exclude them
    const blockedByMe = await db.select({ blockedUserId: blockedUsers.blockedUserId })
      .from(blockedUsers)
      .where(eq(blockedUsers.blockerId, excludeUserId));
    const blockedMe = await db.select({ blockerId: blockedUsers.blockerId })
      .from(blockedUsers)
      .where(eq(blockedUsers.blockedUserId, excludeUserId));

    const hiddenIds = [
      ...blockedByMe.map(r => r.blockedUserId),
      ...blockedMe.map(r => r.blockerId),
    ];

    const baseCondition = and(conditions, not(eq(profiles.userId, excludeUserId)));
    const finalCondition = hiddenIds.length > 0
      ? and(baseCondition, notInArray(profiles.userId, hiddenIds))
      : baseCondition;

    const rows = await db.select({ profile: profiles })
      .from(profiles)
      .leftJoin(users, eq(profiles.userId, users.id))
      .where(finalCondition)
      .orderBy(sql`RANDOM()`);

    return rows.map(r => r.profile);
  }

  async getNearbyProfileUserIds(excludeUserId: string, regionId: string | undefined, callerLat: number, callerLon: number, thresholdKm: number): Promise<string[]> {
    const activeUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(
        regionId
          ? and(not(eq(activeCalls.userId, excludeUserId)), eq(activeCalls.regionId, regionId))
          : not(eq(activeCalls.userId, excludeUserId))
      );

    const ids = activeUserIds.map(r => r.userId);
    if (ids.length === 0) return [];

    const rows = await db.select({ userId: profiles.userId, lat: zipCodes.latitude, lon: zipCodes.longitude })
      .from(profiles)
      .leftJoin(users, eq(profiles.userId, users.id))
      .leftJoin(zipCodes, eq(users.zipCodeId, zipCodes.id))
      .where(and(inArray(profiles.userId, ids), not(eq(profiles.userId, excludeUserId))));

    return rows
      .filter(r => r.lat != null && r.lon != null)
      .filter(r => haversineKm(callerLat, callerLon, r.lat!, r.lon!) <= thresholdKm)
      .map(r => r.userId);
  }

  async getZipEntryById(id: string): Promise<ZipCode | undefined> {
    const [entry] = await db.select().from(zipCodes).where(eq(zipCodes.id, id)).limit(1);
    return entry;
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

  async getAdminBlockedList(): Promise<{
    id: string;
    blockerPhone: string;
    blockedPhone: string;
    createdAt: Date;
  }[]> {
    const blocker = alias(users, "blocker");
    const blocked = alias(users, "blocked");
    const rows = await db
      .select({
        id: blockedUsers.id,
        blockerPhone: blocker.phoneNumber,
        blockedPhone: blocked.phoneNumber,
        createdAt: blockedUsers.createdAt,
      })
      .from(blockedUsers)
      .innerJoin(blocker, eq(blockedUsers.blockerId, blocker.id))
      .innerJoin(blocked, eq(blockedUsers.blockedUserId, blocked.id))
      .orderBy(sql`${blockedUsers.createdAt} DESC`);
    return rows as any[];
  }

  async adminUnblockById(id: string): Promise<void> {
    await db.delete(blockedUsers).where(eq(blockedUsers.id, id));
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

  async updateUserMembership(userId: string, data: { stripeCustomerId?: string; membershipTier?: string; remainingSeconds?: number }): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, userId)).returning();
    return user;
  }

  async deductSeconds(userId: string, seconds: number): Promise<User> {
    const [user] = await db.update(users)
      .set({ remainingSeconds: sql`GREATEST(0, COALESCE(${users.remainingSeconds}, 0) - ${seconds})` })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getZipEntryByCode(code: string): Promise<ZipCode | undefined> {
    const [entry] = await db.select().from(zipCodes).where(eq(zipCodes.code, code)).limit(1);
    return entry;
  }

  async getOrCreateZipEntry(code: string, geo?: { latitude: number; longitude: number; city: string; state: string; neighborhood?: string | null }): Promise<ZipCode> {
    const [existing] = await db.select().from(zipCodes).where(eq(zipCodes.code, code));
    if (existing) return existing;
    const [created] = await db.insert(zipCodes).values({ code, ...geo }).returning();
    return created;
  }

  async setUserZipCode(userId: string, zipCodeId: string): Promise<void> {
    await db.update(users).set({ zipCodeId }).where(eq(users.id, userId));
  }

  async getAllZipCodes(): Promise<ZipCode[]> {
    return db.select().from(zipCodes).orderBy(zipCodes.code);
  }

  async upsertAdminZipEntry(code: string, neighborhood: string): Promise<ZipCode> {
    const audioFile = neighborhoodToAudioFile(neighborhood);
    const [existing] = await db.select().from(zipCodes).where(eq(zipCodes.code, code));
    if (existing) {
      const [updated] = await db.update(zipCodes)
        .set({ neighborhood, audioFile })
        .where(eq(zipCodes.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(zipCodes).values({ code, neighborhood, audioFile }).returning();
    return created;
  }

  async deleteZipEntry(id: string): Promise<void> {
    await db.delete(zipCodes).where(eq(zipCodes.id, id));
  }

  async updateZipNeighborhood(id: string, neighborhood: string): Promise<ZipCode> {
    const audioFile = neighborhoodToAudioFile(neighborhood);
    const [updated] = await db.update(zipCodes)
      .set({ neighborhood, audioFile })
      .where(eq(zipCodes.id, id))
      .returning();
    return updated;
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

  async logCall(callSid: string, fromPhoneNumber: string, toPhoneNumber: string | null, regionId: string | null): Promise<void> {
    await db.insert(callLogs)
      .values({ callSid, fromPhoneNumber, toPhoneNumber, regionId })
      .onConflictDoNothing();
  }

  async finalizeCallLog(callSid: string, durationSeconds: number): Promise<void> {
    await db.update(callLogs)
      .set({ durationSeconds, completedAt: new Date() })
      .where(eq(callLogs.callSid, callSid));
  }

  async getPhoneNumberStats(year: number, month: number): Promise<{
    phoneNumber: string;
    regionId: string | null;
    regionName: string | null;
    callCount: number;
    totalSeconds: number;
    lastCallAt: Date | null;
  }[]> {
    const result = await db.execute(sql`
      SELECT
        cl.to_phone_number            AS "phoneNumber",
        r.id                          AS "regionId",
        r.name                        AS "regionName",
        COUNT(*)::int                 AS "callCount",
        SUM(COALESCE(cl.duration_seconds, 0))::int AS "totalSeconds",
        MAX(cl.started_at)            AS "lastCallAt"
      FROM call_logs cl
      LEFT JOIN regions r ON r.phone_number = cl.to_phone_number
      WHERE EXTRACT(YEAR  FROM cl.started_at) = ${year}
        AND EXTRACT(MONTH FROM cl.started_at) = ${month}
      GROUP BY cl.to_phone_number, r.id, r.name
      ORDER BY "callCount" DESC
    `);
    return result.rows as any[];
  }

  async getAllCallersWithDetails(): Promise<CallerSummary[]> {
    const result = await db.execute(sql`
      SELECT
        u.id,
        u.phone_number      AS "phoneNumber",
        u.membership_tier   AS "membershipTier",
        u.remaining_seconds AS "remainingSeconds",
        u.created_at        AS "createdAt",
        (p.id IS NOT NULL)::boolean AS "hasProfile",
        COALESCE(cl.call_count, 0)::int    AS "callCount",
        COALESCE(mc.msg_count, 0)::int     AS "messageCount",
        COALESCE(bl.block_count, 0)::int   AS "blockCount"
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN (
        SELECT from_phone_number, COUNT(*)::int AS call_count
        FROM call_logs
        GROUP BY from_phone_number
      ) cl ON cl.from_phone_number = u.phone_number
      LEFT JOIN (
        SELECT from_user_id, COUNT(*)::int AS msg_count
        FROM messages
        GROUP BY from_user_id
      ) mc ON mc.from_user_id = u.id
      LEFT JOIN (
        SELECT blocker_id, COUNT(*)::int AS block_count
        FROM blocked_users
        GROUP BY blocker_id
      ) bl ON bl.blocker_id = u.id
      ORDER BY u.created_at DESC
    `);
    return result.rows as unknown as CallerSummary[];
  }

  async getCallerDetailById(userId: string): Promise<CallerDetail | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));

    const callHistory = await db.execute(sql`
      SELECT id, call_sid AS "callSid", duration_seconds AS "durationSeconds",
             started_at AS "startedAt", completed_at AS "completedAt",
             to_phone_number AS "toPhoneNumber"
      FROM call_logs
      WHERE from_phone_number = ${user.phoneNumber}
      ORDER BY started_at DESC
      LIMIT 50
    `);

    const sentRows = await db.execute(sql`
      SELECT m.id, u.phone_number AS "toPhoneNumber", m.created_at AS "createdAt", m.is_read AS "isRead"
      FROM messages m
      JOIN users u ON u.id = m.to_user_id
      WHERE m.from_user_id = ${userId}
      ORDER BY m.created_at DESC
      LIMIT 50
    `);

    const receivedRows = await db.execute(sql`
      SELECT m.id, u.phone_number AS "fromPhoneNumber", m.created_at AS "createdAt", m.is_read AS "isRead"
      FROM messages m
      JOIN users u ON u.id = m.from_user_id
      WHERE m.to_user_id = ${userId}
      ORDER BY m.created_at DESC
      LIMIT 50
    `);

    const blockedByUserRows = await db.execute(sql`
      SELECT bu.id, u.phone_number AS "phoneNumber", bu.created_at AS "blockedAt"
      FROM blocked_users bu
      JOIN users u ON u.id = bu.blocked_user_id
      WHERE bu.blocker_id = ${userId}
      ORDER BY bu.created_at DESC
    `);

    const blockedByOthersRows = await db.execute(sql`
      SELECT bu.id, u.phone_number AS "phoneNumber", bu.created_at AS "blockedAt"
      FROM blocked_users bu
      JOIN users u ON u.id = bu.blocker_id
      WHERE bu.blocked_user_id = ${userId}
      ORDER BY bu.created_at DESC
    `);

    return {
      user,
      profile: profile ?? null,
      callHistory: callHistory.rows as any[],
      sentMessages: sentRows.rows as any[],
      receivedMessages: receivedRows.rows as any[],
      blockedByUser: blockedByUserRows.rows as any[],
      blockedByOthers: blockedByOthersRows.rows as any[],
    };
  }

  async adjustUserCredits(userId: string, deltaSeconds: number): Promise<User> {
    const [user] = await db.update(users)
      .set({
        remainingSeconds: sql`GREATEST(0, COALESCE(${users.remainingSeconds}, 0) + ${deltaSeconds})`
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async adminBlockByUserIds(blockerId: string, blockedUserId: string): Promise<void> {
    await db.insert(blockedUsers).values({ blockerId, blockedUserId }).onConflictDoNothing();
  }

  async adminUnblockByUserIds(blockerId: string, blockedUserId: string): Promise<void> {
    await db.delete(blockedUsers).where(
      and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedUserId, blockedUserId))
    );
  }

  async getAllFlaggedItems(status?: string): Promise<FlaggedItemWithDetails[]> {
    const whereClause = status ? `AND fc.status = '${status}'` : "";
    const result = await db.execute(sql`
      SELECT
        fc.id,
        fc.content_type     AS "contentType",
        fc.content_id       AS "contentId",
        fc.reason,
        fc.status,
        fc.created_at       AS "createdAt",
        fc.reviewed_at      AS "reviewedAt",
        rep.phone_number    AS "reportedByPhone",
        -- Profile fields
        pu.phone_number     AS "profilePhone",
        p.recording_url     AS "profileRecordingUrl",
        p.recording_duration AS "profileDuration",
        -- Message fields
        mu.phone_number     AS "messageFromPhone",
        mtu.phone_number    AS "messageToPhone",
        m.recording_url     AS "messageRecordingUrl"
      FROM flagged_content fc
      LEFT JOIN users rep ON rep.id = fc.reported_by_user_id
      -- Profile join (only applies when content_type = 'profile')
      LEFT JOIN profiles p ON p.id = fc.content_id AND fc.content_type = 'profile'
      LEFT JOIN users pu ON pu.id = p.user_id
      -- Message join (only applies when content_type = 'message')
      LEFT JOIN messages m ON m.id = fc.content_id AND fc.content_type = 'message'
      LEFT JOIN users mu ON mu.id = m.from_user_id
      LEFT JOIN users mtu ON mtu.id = m.to_user_id
      ${status ? sql`WHERE fc.status = ${status}` : sql``}
      ORDER BY fc.created_at DESC
    `);
    return result.rows as unknown as FlaggedItemWithDetails[];
  }

  async createFlaggedItem(data: InsertFlaggedContent): Promise<FlaggedContent> {
    const [item] = await db.insert(flaggedContent).values(data).returning();
    return item;
  }

  async resolveFlaggedItem(id: string, status: string): Promise<void> {
    await db.update(flaggedContent)
      .set({ status, reviewedAt: new Date() })
      .where(eq(flaggedContent.id, id));
  }

  async deleteFlaggedItem(id: string): Promise<void> {
    await db.delete(flaggedContent).where(eq(flaggedContent.id, id));
  }

  // ── Promo Codes ──────────────────────────────────────────────────────────────

  async getAllPromoCodes(): Promise<(PromoCode & { redemptionCount: number })[]> {
    const rows = await db.select().from(promoCodes).orderBy(promoCodes.createdAt);
    const counts = await db
      .select({ promoCodeId: promoRedemptions.promoCodeId, cnt: count() })
      .from(promoRedemptions)
      .groupBy(promoRedemptions.promoCodeId);
    const countMap = new Map(counts.map(c => [c.promoCodeId, Number(c.cnt)]));
    return rows.map(r => ({ ...r, redemptionCount: countMap.get(r.id) ?? 0 }));
  }

  async createPromoCode(data: InsertPromoCode): Promise<PromoCode> {
    const [created] = await db.insert(promoCodes).values(data).returning();
    return created;
  }

  async updatePromoCode(id: string, data: Partial<InsertPromoCode>): Promise<PromoCode> {
    const [updated] = await db.update(promoCodes).set(data).where(eq(promoCodes.id, id)).returning();
    return updated;
  }

  async deletePromoCode(id: string): Promise<void> {
    await db.delete(promoCodes).where(eq(promoCodes.id, id));
  }

  async redeemPromoCode(code: string, userId: string): Promise<{ promoCode: PromoCode; secondsAwarded: number } | { error: string }> {
    const upperCode = code.toUpperCase().trim();
    const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, upperCode));
    if (!promo) return { error: "Invalid promo code." };
    if (!promo.isActive) return { error: "This promo code is no longer active." };
    if (promo.expiresAt && promo.expiresAt < new Date()) return { error: "This promo code has expired." };
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return { error: "This promo code has reached its maximum number of uses." };

    const [existing] = await db.select().from(promoRedemptions)
      .where(and(eq(promoRedemptions.promoCodeId, promo.id), eq(promoRedemptions.userId, userId)));
    if (existing) return { error: "You have already redeemed this promo code." };

    const secondsAwarded = promo.valueMinutes * 60;
    await db.update(users)
      .set({ remainingSeconds: sql`COALESCE(${users.remainingSeconds}, 0) + ${secondsAwarded}` })
      .where(eq(users.id, userId));
    await db.insert(promoRedemptions).values({ promoCodeId: promo.id, userId, secondsAwarded });
    await db.update(promoCodes)
      .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
      .where(eq(promoCodes.id, promo.id));
    const [refreshed] = await db.select().from(promoCodes).where(eq(promoCodes.id, promo.id));
    return { promoCode: refreshed, secondsAwarded };
  }

  async getPromoRedemptions(promoCodeId: string): Promise<(PromoRedemption & { phoneNumber: string })[]> {
    const rows = await db.select({
      id: promoRedemptions.id,
      promoCodeId: promoRedemptions.promoCodeId,
      userId: promoRedemptions.userId,
      secondsAwarded: promoRedemptions.secondsAwarded,
      redeemedAt: promoRedemptions.redeemedAt,
      phoneNumber: users.phoneNumber,
    })
      .from(promoRedemptions)
      .innerJoin(users, eq(promoRedemptions.userId, users.id))
      .where(eq(promoRedemptions.promoCodeId, promoCodeId))
      .orderBy(promoRedemptions.redeemedAt);
    return rows;
  }
}

export const storage = new DatabaseStorage();
