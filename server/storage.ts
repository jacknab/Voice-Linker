import { db } from "./db";
import { regions, regionLinks, users, profiles, messages, activeCalls, membershipSettings, siteSettings, blockedUsers, zipCodes, callLogs, flaggedContent, promoCodes, promoRedemptions, auditLogs, webUsers, webUserAltPhones, mailboxes, membershipLinkCodes, membershipCards, seedSessions, moderationLogs, type Region, type InsertRegion, type User, type Profile, type Message, type ActiveCall, type InsertUser, type InsertProfile, type InsertMessage, type MembershipSettings, type InsertMembershipSettings, type SiteSettings, type InsertSiteSettings, type ZipCode, type FlaggedContent, type InsertFlaggedContent, type PromoCode, type InsertPromoCode, type PromoRedemption, type AuditLog, type WebUser, type WebUserAltPhone, type Mailbox, type MembershipLinkCode, type MembershipCard, type SeedSession, type ModerationLog, type InsertModerationLog } from "@shared/schema";
import { eq, and, not, count, sql, inArray, notInArray, or, notLike, like, isNull, isNotNull, lt, gte, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const VIRTUAL_PREFIX = "VIRTUAL-";

export interface ProfileWithUser extends Profile {
  phoneNumber: string;
  transcription?: string | null;
  transcriptionStatus?: string | null;
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
  accountStatus: string;
}

export interface CallerDetail {
  user: User;
  profile: Profile | null;
  zipCode: ZipCode | null;
  mailbox: Mailbox | null;
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
  getLinkedRegions(regionId: string): Promise<Region[]>;
  setLinkedRegions(regionId: string, linkedIds: string[]): Promise<void>;

  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByMembershipNumber(membershipNumber: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getOrCreateUser(phoneNumber: string): Promise<User>;

  getProfile(userId: string): Promise<Profile | undefined>;
  upsertProfile(profile: InsertProfile): Promise<Profile>;
  getAllProfilesWithUsers(): Promise<ProfileWithUser[]>;
  getAdminUploadedProfilesWithUsers(): Promise<ProfileWithUser[]>;
  deleteProfile(id: string): Promise<void>;

  getUnreadMessage(userId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageRead(messageId: string): Promise<void>;
  getAllMessagesAdmin(): Promise<{
    id: string;
    fromPhone: string;
    toPhone: string;
    recordingUrl: string;
    isRead: boolean | null;
    createdAt: Date | null;
  }[]>;

  // Active call tracking (real-time party line)
  registerActiveCall(callSid: string, userId: string, regionId?: string): Promise<void>;
  updateActiveCallGender(callSid: string, gender: string): Promise<void>;
  removeActiveCall(callSid: string): Promise<void>;
  removeActiveCallsByUser(userId: string): Promise<void>;
  removeStaleActiveCalls(olderThanMinutes: number): Promise<void>;
  finalizeOrphanedCallLogs(olderThanMinutes: number): Promise<void>;
  getActiveCallerCount(excludeUserId: string, regionId?: string, callerGender?: string | null): Promise<number>;
  getAvailableProfileCount(excludeUserId: string, regionId?: string, callerGender?: string | null, currentSiteCategory?: string | null): Promise<number>;
  getAllActiveProfiles(excludeUserId: string, regionId?: string, callerGender?: string | null, currentSiteCategory?: string | null): Promise<Profile[]>;
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

  updateUserMembership(userId: string, data: { stripeCustomerId?: string; membershipTier?: string; remainingSeconds?: number; membershipNumber?: string; membershipPin?: string | null; membershipStartedAt?: Date | null }): Promise<User>;
  deductSeconds(userId: string, seconds: number): Promise<User>;
  deductOneDayFromAllActiveMembers(): Promise<number>;
  getZipEntryByCode(code: string): Promise<ZipCode | undefined>;
  getOrCreateZipEntry(code: string, geo?: { latitude: number; longitude: number; city: string; state: string; neighborhood?: string | null }): Promise<ZipCode>;
  setUserZipCode(userId: string, zipCodeId: string): Promise<void>;
  getAllZipCodes(): Promise<ZipCode[]>;
  upsertAdminZipEntry(code: string, neighborhood: string, latitude?: number, longitude?: number): Promise<ZipCode>;
  deleteZipEntry(id: string): Promise<void>;
  updateZipNeighborhood(id: string, neighborhood: string): Promise<ZipCode>;
  updateZipEntry(id: string, neighborhood: string, latitude?: number, longitude?: number): Promise<ZipCode>;

  getSiteSettings(): Promise<SiteSettings>;
  updateSiteSettings(data: Partial<InsertSiteSettings>): Promise<SiteSettings>;

  getMembershipSettings(): Promise<MembershipSettings>;
  updateMembershipSettings(data: Partial<InsertMembershipSettings>): Promise<MembershipSettings>;

  // Seed session tracking
  startSeedSession(userId: string, source: "admin_uploaded" | "real_caller", scheduledEndAt: Date): Promise<SeedSession>;
  endSeedSession(userId: string): Promise<void>;
  getActiveSeedSessions(): Promise<SeedSession[]>;
  getRecentSeedSessions(limitDays?: number): Promise<SeedSession[]>;
  getEligibleSeedProfiles(limit: number): Promise<{ userId: string }[]>;

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

  // Mailboxes
  getMailboxByUserId(userId: string): Promise<Mailbox | null>;
  touchMailboxLastChecked(userId: string): Promise<void>;
  getMailboxByNumber(mailboxNumber: string): Promise<Mailbox | null>;
  getOrCreateMailbox(userId: string): Promise<Mailbox>;
  createMailboxForSetup(userId: string): Promise<Mailbox>;
  updateMailboxProfile(userId: string, data: { dateOfBirth?: string; bodyType?: string; ethnicity?: string; setupComplete?: boolean }): Promise<void>;
  getMailboxesByCategory(category: string, excludeUserId: string): Promise<Mailbox[]>;
  updateMailboxAd(userId: string, category: string, adRecordingUrl: string, adRecordingDuration: number): Promise<Mailbox>;

  // Transcription
  updateProfileTranscription(recordingUrl: string, text: string | null, status: string): Promise<void>;
  updateMailboxTranscription(adRecordingUrl: string, text: string | null, status: string): Promise<void>;
  setProfileTranscriptionPending(profileId: string): Promise<void>;
  getAllProfilesWithTranscriptions(): Promise<ProfileWithUser[]>;

  // Flagged content queue
  getAllFlaggedItems(status?: string): Promise<FlaggedItemWithDetails[]>;
  createFlaggedItem(data: InsertFlaggedContent): Promise<FlaggedContent>;
  resolveFlaggedItem(id: string, status: string): Promise<void>;
  deleteFlaggedItem(id: string): Promise<void>;

  // Auto-moderation helpers
  countDistinctFlaggers(contentType: string, contentId: string): Promise<number>;
  countDistinctBlockersInWindow(blockedUserId: string, windowMs: number): Promise<number>;
  countFlagRemoveCycles(contentType: string, contentId: string): Promise<number>;
  countAutoRemovesForUser(userId: string): Promise<number>;
  setUserAccountStatus(userId: string, status: string): Promise<void>;
  getUserByProfileRecordingUrl(url: string): Promise<User | null>;
  getUserByMailboxAdRecordingUrl(url: string): Promise<User | null>;
  setUserRecordingRejection(userId: string, reason: string, type: string): Promise<void>;
  clearUserRecordingRejection(userId: string): Promise<void>;
  deleteProfileByUserId(userId: string): Promise<void>;
  clearMailboxAdByUserId(userId: string): Promise<void>;
  logModerationEvent(data: InsertModerationLog): Promise<ModerationLog>;
  getModerationLogs(opts?: { targetUserId?: string; limit?: number }): Promise<(ModerationLog & { targetPhone: string })[]>;

  // Promo codes
  getAllPromoCodes(): Promise<(PromoCode & { redemptionCount: number })[]>;
  createPromoCode(data: InsertPromoCode): Promise<PromoCode>;
  updatePromoCode(id: string, data: Partial<InsertPromoCode>): Promise<PromoCode>;
  deletePromoCode(id: string): Promise<void>;
  redeemPromoCode(code: string, userId: string): Promise<{ promoCode: PromoCode; secondsAwarded: number } | { error: string }>;
  getPromoRedemptions(promoCodeId: string): Promise<(PromoRedemption & { phoneNumber: string })[]>;

  // Audit log
  logAuditEvent(action: string, opts?: { targetType?: string; targetId?: string; targetLabel?: string; detail?: Record<string, unknown> }): Promise<void>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;

  // Web Users (email/password auth)
  getWebUserByEmail(email: string): Promise<WebUser | undefined>;
  getWebUserById(id: string): Promise<WebUser | undefined>;
  createWebUser(email: string, passwordHash: string): Promise<WebUser>;
  setWebUserResetToken(email: string, token: string, expiry: Date): Promise<void>;
  getWebUserByResetToken(token: string): Promise<WebUser | undefined>;
  updateWebUserPassword(id: string, passwordHash: string): Promise<void>;
  clearWebUserResetToken(id: string): Promise<void>;
  linkWebUserPhone(id: string, phoneNumber: string, membershipNumber?: string): Promise<void>;
  incrementWebUserLinkAttempts(id: string): Promise<number>;
  lockWebUser(id: string): Promise<void>;
  touchWebUserLastLogin(id: string): Promise<void>;
  getCallHistoryByPhone(phoneNumber: string, limit?: number): Promise<{ id: string; callSid: string; durationSeconds: number; startedAt: Date | null; completedAt: Date | null; toPhoneNumber: string | null }[]>;
  // Alt phone numbers
  getAltPhonesForWebUser(webUserId: string): Promise<WebUserAltPhone[]>;
  addAltPhoneForWebUser(webUserId: string, phoneNumber: string): Promise<WebUserAltPhone>;
  removeAltPhoneForWebUser(webUserId: string, altPhoneId: string): Promise<void>;
  getPrimaryPhoneForAltNumber(phoneNumber: string): Promise<string | null>;

  // Membership link codes (phone-verified web account linking)
  createMembershipLinkCode(webUserId: string, code: string, expiresAt: Date): Promise<MembershipLinkCode>;
  getActiveMembershipLinkCode(code: string): Promise<MembershipLinkCode | undefined>;
  getActiveCodeByWebUserId(webUserId: string): Promise<MembershipLinkCode | undefined>;
  consumeMembershipLinkCode(codeId: string): Promise<void>;

  // Membership cards (5-digit pre-created cards for events/distribution)
  createMembershipCard(cardNumber: string, pin: string, valueSeconds: number, notes?: string): Promise<MembershipCard>;
  getMembershipCardByNumber(cardNumber: string): Promise<MembershipCard | undefined>;
  getMembershipCardById(id: string): Promise<MembershipCard | undefined>;
  getMembershipCardByPhone(phoneNumber: string): Promise<MembershipCard | undefined>;
  linkCardToPhone(cardId: string, phoneNumber: string): Promise<void>;
  deductCardSeconds(cardId: string, seconds: number): Promise<MembershipCard>;
  getAllMembershipCards(): Promise<MembershipCard[]>;
  deleteMembershipCard(id: string): Promise<void>;
  updateMembershipCardNotes(id: string, notes: string): Promise<void>;
  isMembershipCardNumberTaken(cardNumber: string): Promise<boolean>;

  // Mailbox stats
  getMailboxStats(): Promise<{ total: number; byCategory: { category: string | null; count: number }[] }>;

  // Analytics
  getAnalytics(): Promise<{
    funnel: { totalCallers: number; withProfile: number; withMessage: number; withMembership: number };
    peakByHour: { hour: number; calls: number }[];
    peakByDay: { day: number; calls: number }[];
    retention: { oneTime: number; occasional: number; regular: number };
    revenue: {
      plan1Count: number; plan2Count: number; plan3Count: number;
      plan1Name: string; plan2Name: string; plan3Name: string;
      plan1PriceCents: number; plan2PriceCents: number; plan3PriceCents: number;
      estimatedMrrCents: number;
    };
  }>;
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

  async getLinkedRegions(regionId: string): Promise<Region[]> {
    const links = await db.select().from(regionLinks).where(eq(regionLinks.regionId, regionId));
    if (links.length === 0) return [];
    const ids = links.map(l => l.linkedRegionId);
    return db.select().from(regions).where(inArray(regions.id, ids));
  }

  async setLinkedRegions(regionId: string, linkedIds: string[]): Promise<void> {
    // Find which regions are being removed so we can clean up their reverse links too
    const currentLinks = await db.select().from(regionLinks).where(eq(regionLinks.regionId, regionId));
    const removedIds = currentLinks.map(l => l.linkedRegionId).filter(id => !linkedIds.includes(id));

    // Remove forward links from this region
    await db.delete(regionLinks).where(eq(regionLinks.regionId, regionId));

    // Remove reverse links for regions that were unlinked
    if (removedIds.length > 0) {
      await db.delete(regionLinks).where(
        and(inArray(regionLinks.regionId, removedIds), eq(regionLinks.linkedRegionId, regionId))
      );
    }

    if (linkedIds.length > 0) {
      // Insert forward links
      await db.insert(regionLinks).values(linkedIds.map(id => ({ regionId, linkedRegionId: id })));

      // Insert reverse links if they don't already exist
      for (const linkedId of linkedIds) {
        const [existing] = await db.select().from(regionLinks)
          .where(and(eq(regionLinks.regionId, linkedId), eq(regionLinks.linkedRegionId, regionId)));
        if (!existing) {
          await db.insert(regionLinks).values({ regionId: linkedId, linkedRegionId: regionId });
        }
      }
    }
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

  async getUserByMembershipNumber(membershipNumber: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.membershipNumber, membershipNumber));
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
          ...(insertProfile.siteCategory !== undefined && {
            siteCategory: insertProfile.siteCategory,
          }),
          ...(insertProfile.gender !== undefined && {
            gender: insertProfile.gender,
          }),
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
        siteCategory: profiles.siteCategory,
        gender: profiles.gender,
        createdAt: profiles.createdAt,
        phoneNumber: users.phoneNumber,
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .orderBy(profiles.createdAt);
    return rows;
  }

  async getAdminUploadedProfilesWithUsers(): Promise<ProfileWithUser[]> {
    const rows = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        nameRecordingUrl: profiles.nameRecordingUrl,
        recordingUrl: profiles.recordingUrl,
        recordingDuration: profiles.recordingDuration,
        isAdminUploaded: profiles.isAdminUploaded,
        siteCategory: profiles.siteCategory,
        gender: profiles.gender,
        createdAt: profiles.createdAt,
        phoneNumber: users.phoneNumber,
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(eq(profiles.isAdminUploaded, true))
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

  async getAllMessagesAdmin() {
    const sender = alias(users, "sender");
    const recipient = alias(users, "recipient");
    const rows = await db
      .select({
        id: messages.id,
        fromPhone: sender.phoneNumber,
        toPhone: recipient.phoneNumber,
        recordingUrl: messages.recordingUrl,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(sender, eq(messages.fromUserId, sender.id))
      .innerJoin(recipient, eq(messages.toUserId, recipient.id))
      .orderBy(messages.createdAt);
    return rows;
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

  async updateActiveCallGender(callSid: string, gender: string): Promise<void> {
    await db.update(activeCalls)
      .set({ gender })
      .where(eq(activeCalls.callSid, callSid));
  }

  async removeActiveCall(callSid: string): Promise<void> {
    // Finalize the call log (calculate duration from startedAt) before removing
    await db.execute(sql`
      UPDATE call_logs
      SET duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::integer),
          completed_at = now()
      WHERE call_sid = ${callSid} AND completed_at IS NULL
    `);
    await db.delete(activeCalls).where(eq(activeCalls.callSid, callSid));
  }

  async removeActiveCallsByUser(userId: string): Promise<void> {
    // Find call SIDs for this user, finalize their logs, then remove
    const rows = await db.select({ callSid: activeCalls.callSid }).from(activeCalls).where(eq(activeCalls.userId, userId));
    for (const { callSid } of rows) {
      await db.execute(sql`
        UPDATE call_logs
        SET duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::integer),
            completed_at = now()
        WHERE call_sid = ${callSid} AND completed_at IS NULL
      `);
    }
    await db.delete(activeCalls).where(eq(activeCalls.userId, userId));
  }

  // Finalize call logs that have no completedAt and no matching active_calls entry.
  // Catches cases where the active call was already purged but the log was never finalized.
  async finalizeOrphanedCallLogs(olderThanMinutes: number): Promise<void> {
    await db.execute(sql`
      UPDATE call_logs
      SET duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::integer),
          completed_at = now()
      WHERE completed_at IS NULL
        AND started_at < now() - interval '${sql.raw(String(olderThanMinutes))} minutes'
        AND call_sid NOT IN (SELECT call_sid FROM active_calls)
        AND call_sid NOT LIKE '${sql.raw(VIRTUAL_PREFIX)}%'
    `);
  }

  async removeStaleActiveCalls(olderThanMinutes: number): Promise<void> {
    // Finalize call logs for stale calls before removing them
    await db.execute(sql`
      UPDATE call_logs
      SET duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::integer),
          completed_at = now()
      WHERE call_sid IN (
        SELECT call_sid FROM active_calls
        WHERE joined_at < now() - interval '${sql.raw(String(olderThanMinutes))} minutes'
          AND call_sid NOT LIKE '${sql.raw(VIRTUAL_PREFIX)}%'
      ) AND completed_at IS NULL
    `);
    await db.delete(activeCalls)
      .where(
        and(
          sql`joined_at < now() - interval '${sql.raw(String(olderThanMinutes))} minutes'`,
          notLike(activeCalls.callSid, `${VIRTUAL_PREFIX}%`)
        )
      );
  }

  async getActiveCallerCount(excludeUserId: string, regionId?: string, callerGender?: string | null): Promise<number> {
    // If callerGender is provided, count only opposite-gender real callers (MW systems)
    const oppositeGender = callerGender === 'male' ? 'female' : callerGender === 'female' ? 'male' : null;
    const conditions = regionId
      ? and(
          not(eq(activeCalls.userId, excludeUserId)),
          eq(activeCalls.regionId, regionId),
          ...(oppositeGender ? [eq(activeCalls.gender, oppositeGender)] : [])
        )
      : and(
          not(eq(activeCalls.userId, excludeUserId)),
          ...(oppositeGender ? [eq(activeCalls.gender, oppositeGender)] : [])
        );
    const [result] = await db.select({ count: count() })
      .from(activeCalls)
      .where(conditions);
    return result.count;
  }

  async getAvailableProfileCount(excludeUserId: string, regionId?: string, callerGender?: string | null, currentSiteCategory?: string | null): Promise<number> {
    const oppositeGender = callerGender === 'male' ? 'female' : callerGender === 'female' ? 'male' : null;
    const isMW = currentSiteCategory === 'MW';

    // Real callers — filtered by region and opposite gender on MW
    const realCallerCondition = regionId
      ? and(
          not(eq(activeCalls.userId, excludeUserId)),
          eq(activeCalls.regionId, regionId),
          notLike(activeCalls.callSid, `${VIRTUAL_PREFIX}%`),
          ...(oppositeGender ? [eq(activeCalls.gender, oppositeGender)] : [])
        )
      : and(
          not(eq(activeCalls.userId, excludeUserId)),
          notLike(activeCalls.callSid, `${VIRTUAL_PREFIX}%`),
          ...(oppositeGender ? [eq(activeCalls.gender, oppositeGender)] : [])
        );
    const regionalUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(realCallerCondition);

    // Virtual callers (seed sessions) — scoped to the same region when one is provided
    // so the same seed profile doesn't appear simultaneously in two connected regions.
    const virtualCondition = regionId
      ? and(like(activeCalls.callSid, `${VIRTUAL_PREFIX}%`), eq(activeCalls.regionId, regionId))
      : like(activeCalls.callSid, `${VIRTUAL_PREFIX}%`);
    const virtualUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(virtualCondition);

    const realIds = regionalUserIds.map(r => r.userId);
    const virtualIds = virtualUserIds.map(r => r.userId);

    // Profile condition for virtual callers (including admin-uploaded seeds): siteCategory-scoped + gender-filtered for MW.
    // Admin-uploaded profiles are included here via activeCalls when their seed session is running,
    // which naturally scopes them to their assigned regionId and prevents them from appearing
    // simultaneously in both halves of a linked region pair.
    const virtualProfileCondition = virtualIds.length > 0
      ? and(
          inArray(profiles.userId, virtualIds),
          isMW && oppositeGender
            ? and(eq(profiles.siteCategory, 'MW'), eq(profiles.gender, oppositeGender))
            : or(isNull(profiles.siteCategory), eq(profiles.siteCategory, 'MM'))
        )
      : sql`false`;

    const conditions = realIds.length > 0
      ? or(inArray(profiles.userId, realIds), virtualProfileCondition)
      : virtualProfileCondition;

    const [result] = await db.select({ count: count() })
      .from(profiles)
      .where(and(conditions, not(eq(profiles.userId, excludeUserId))));
    return result.count;
  }

  async getAllActiveProfiles(excludeUserId: string, regionId?: string, callerGender?: string | null, currentSiteCategory?: string | null): Promise<Profile[]> {
    const oppositeGender = callerGender === 'male' ? 'female' : callerGender === 'female' ? 'male' : null;
    const isMW = currentSiteCategory === 'MW';

    // Real callers — filtered by region and opposite gender on MW
    const realCallerCondition = regionId
      ? and(
          not(eq(activeCalls.userId, excludeUserId)),
          eq(activeCalls.regionId, regionId),
          notLike(activeCalls.callSid, `${VIRTUAL_PREFIX}%`),
          ...(oppositeGender ? [eq(activeCalls.gender, oppositeGender)] : [])
        )
      : and(
          not(eq(activeCalls.userId, excludeUserId)),
          notLike(activeCalls.callSid, `${VIRTUAL_PREFIX}%`),
          ...(oppositeGender ? [eq(activeCalls.gender, oppositeGender)] : [])
        );
    const regionalUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(realCallerCondition);

    // Virtual callers (seed sessions) — scoped to the same region when one is provided
    // so the same seed profile doesn't appear simultaneously in two connected regions.
    const virtualCondition2 = regionId
      ? and(like(activeCalls.callSid, `${VIRTUAL_PREFIX}%`), eq(activeCalls.regionId, regionId))
      : like(activeCalls.callSid, `${VIRTUAL_PREFIX}%`);
    const virtualUserIds = await db.select({ userId: activeCalls.userId })
      .from(activeCalls)
      .where(virtualCondition2);

    const realIds = regionalUserIds.map(r => r.userId);
    const virtualIds = virtualUserIds.map(r => r.userId);

    // Profile condition for virtual callers (including admin-uploaded seeds): siteCategory-scoped + gender-filtered for MW.
    // Admin-uploaded profiles are included here via activeCalls when their seed session is running,
    // which naturally scopes them to their assigned regionId and prevents them from appearing
    // simultaneously in both halves of a linked region pair.
    const virtualProfileCondition = virtualIds.length > 0
      ? and(
          inArray(profiles.userId, virtualIds),
          isMW && oppositeGender
            ? and(eq(profiles.siteCategory, 'MW'), eq(profiles.gender, oppositeGender))
            : or(isNull(profiles.siteCategory), eq(profiles.siteCategory, 'MM'))
        )
      : sql`false`;

    const conditions = realIds.length > 0
      ? or(inArray(profiles.userId, realIds), virtualProfileCondition)
      : virtualProfileCondition;

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

  async updateUserMembership(userId: string, data: { stripeCustomerId?: string; membershipTier?: string; remainingSeconds?: number; membershipNumber?: string; membershipPin?: string | null; membershipStartedAt?: Date | null }): Promise<User> {
    // When a membership tier is being activated, record when it started.
    // This timestamp drives the 24-hour grace period for per_day billing so a member
    // who buys late at night isn't charged their first day deduction minutes later.
    const update: typeof data & { membershipStartedAt?: Date | null } = { ...data };
    if (data.membershipTier !== undefined && data.membershipTier !== null && data.membershipTier !== "" && data.membershipStartedAt === undefined) {
      update.membershipStartedAt = new Date();
    }
    const [user] = await db.update(users).set(update).where(eq(users.id, userId)).returning();
    return user;
  }

  async deductSeconds(userId: string, seconds: number): Promise<User> {
    const [user] = await db.update(users)
      .set({ remainingSeconds: sql`GREATEST(0, COALESCE(${users.remainingSeconds}, 0) - ${seconds})` })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async deductOneDayFromAllActiveMembers(): Promise<number> {
    const ONE_DAY_SECONDS = 86400;
    // Only deduct from members whose membership started at least 24 hours ago.
    // This gives new members a full first day before deductions begin, even if
    // they subscribed just minutes before the nightly 23:59 job runs.
    const cutoff = new Date(Date.now() - ONE_DAY_SECONDS * 1000);
    const result = await db.update(users)
      .set({ remainingSeconds: sql`GREATEST(0, COALESCE(${users.remainingSeconds}, 0) - ${ONE_DAY_SECONDS})` })
      .where(
        sql`COALESCE(${users.remainingSeconds}, 0) > 0
          AND ${users.membershipTier} IS NOT NULL
          AND (${users.membershipStartedAt} IS NULL OR ${users.membershipStartedAt} <= ${cutoff})`
      );
    return (result as any).rowCount ?? 0;
  }

  async getZipEntryByCode(code: string): Promise<ZipCode | undefined> {
    const [entry] = await db.select().from(zipCodes).where(eq(zipCodes.code, code)).limit(1);
    return entry;
  }

  async getOrCreateZipEntry(code: string, geo?: { latitude: number; longitude: number; city: string; state: string; neighborhood?: string | null }): Promise<ZipCode> {
    const [existing] = await db.select().from(zipCodes).where(eq(zipCodes.code, code));
    if (existing) return existing;
    const [created] = await db.insert(zipCodes).values({ code, ...geo }).onConflictDoNothing().returning();
    if (created) return created;
    // Race condition: another request inserted this zip between our SELECT and INSERT — re-fetch
    const [refetched] = await db.select().from(zipCodes).where(eq(zipCodes.code, code));
    if (refetched) return refetched;
    throw new Error(`[storage] getOrCreateZipEntry: failed to insert or find zip code "${code}"`);
  }

  async setUserZipCode(userId: string, zipCodeId: string): Promise<void> {
    await db.update(users).set({ zipCodeId }).where(eq(users.id, userId));
  }

  async getAllZipCodes(): Promise<ZipCode[]> {
    return db.select().from(zipCodes).orderBy(zipCodes.code);
  }

  async upsertAdminZipEntry(code: string, neighborhood: string, latitude?: number, longitude?: number): Promise<ZipCode> {
    const audioFile = neighborhoodToAudioFile(neighborhood);
    const [existing] = await db.select().from(zipCodes).where(eq(zipCodes.code, code));
    if (existing) {
      const updateData: Record<string, unknown> = { neighborhood, audioFile };
      if (latitude !== undefined && !isNaN(latitude)) updateData.latitude = latitude;
      if (longitude !== undefined && !isNaN(longitude)) updateData.longitude = longitude;
      const [updated] = await db.update(zipCodes)
        .set(updateData)
        .where(eq(zipCodes.id, existing.id))
        .returning();
      return updated;
    }
    const insertData: Record<string, unknown> = { code, neighborhood, audioFile };
    if (latitude !== undefined && !isNaN(latitude)) insertData.latitude = latitude;
    if (longitude !== undefined && !isNaN(longitude)) insertData.longitude = longitude;
    const [created] = await db.insert(zipCodes).values(insertData as any).returning();
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

  async updateZipEntry(id: string, neighborhood: string, latitude?: number, longitude?: number): Promise<ZipCode> {
    const audioFile = neighborhoodToAudioFile(neighborhood);
    const updateData: Record<string, unknown> = { neighborhood, audioFile };
    if (latitude !== undefined && !isNaN(latitude)) updateData.latitude = latitude;
    if (longitude !== undefined && !isNaN(longitude)) updateData.longitude = longitude;
    const [updated] = await db.update(zipCodes)
      .set(updateData)
      .where(eq(zipCodes.id, id))
      .returning();
    return updated;
  }

  async getSiteSettings(): Promise<SiteSettings> {
    const [settings] = await db.select().from(siteSettings).where(eq(siteSettings.id, "singleton"));
    if (settings) return settings;
    const [created] = await db.insert(siteSettings).values({ id: "singleton" }).returning();
    return created;
  }

  async updateSiteSettings(data: Partial<InsertSiteSettings>): Promise<SiteSettings> {
    const [updated] = await db.insert(siteSettings)
      .values({ id: "singleton", ...data })
      .onConflictDoUpdate({ target: siteSettings.id, set: data })
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

  // --- Seed Session Tracking ---

  async startSeedSession(userId: string, source: "admin_uploaded" | "real_caller", scheduledEndAt: Date): Promise<SeedSession> {
    // Close any open session for this user before starting a new one
    await db.update(seedSessions)
      .set({ endedAt: sql`now()` })
      .where(and(eq(seedSessions.userId, userId), isNull(seedSessions.endedAt)));
    const [session] = await db.insert(seedSessions)
      .values({ userId, source, scheduledEndAt })
      .returning();
    return session;
  }

  async endSeedSession(userId: string): Promise<void> {
    await db.update(seedSessions)
      .set({ endedAt: sql`now()` })
      .where(and(eq(seedSessions.userId, userId), isNull(seedSessions.endedAt)));
  }

  async getActiveSeedSessions(): Promise<SeedSession[]> {
    return db.select().from(seedSessions).where(isNull(seedSessions.endedAt));
  }

  async getRecentSeedSessions(limitDays = 7): Promise<SeedSession[]> {
    const since = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000);
    return db.select()
      .from(seedSessions)
      .where(gte(seedSessions.startedAt, since))
      .orderBy(desc(seedSessions.startedAt));
  }

  async getEligibleSeedProfiles(limit: number): Promise<{ userId: string }[]> {
    // Real-caller profiles eligible for seeding:
    //  1. Has a profile recording
    //  2. Not admin-uploaded (those are handled separately)
    //  3. Not a VIRTUAL- phone number
    //  4. No active membership AND no remaining seconds (exhausted or never had)
    //  5. No call in the last 30 days (dormant real user)
    //  6. No seed session started in the last 24 hours
    const rows = await db.execute<{ user_id: string }>(sql`
      SELECT p.user_id
      FROM profiles p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_admin_uploaded = false
        AND u.phone_number NOT LIKE ${`${VIRTUAL_PREFIX}%`}
        AND (u.membership_tier IS NULL)
        AND (u.remaining_seconds IS NULL OR u.remaining_seconds = 0)
        AND NOT EXISTS (
          SELECT 1 FROM call_logs cl
          WHERE cl.from_phone_number = u.phone_number
            AND cl.started_at > now() - INTERVAL '30 days'
        )
        AND NOT EXISTS (
          SELECT 1 FROM seed_sessions ss
          WHERE ss.user_id = p.user_id
            AND ss.started_at > now() - INTERVAL '24 hours'
        )
      ORDER BY RANDOM()
      LIMIT ${limit}
    `);
    return (rows.rows as { user_id: string }[]).map(r => ({ userId: r.user_id }));
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
        COALESCE(u.account_status, 'active') AS "accountStatus",
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

    const zipCode = user.zipCodeId
      ? (await db.select().from(zipCodes).where(eq(zipCodes.id, user.zipCodeId)).limit(1))[0] ?? null
      : null;

    const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.userId, userId));

    return {
      user,
      profile: profile ?? null,
      zipCode,
      mailbox: mailbox ?? null,
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

  async getMailboxByUserId(userId: string): Promise<Mailbox | null> {
    const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.userId, userId));
    return mailbox ?? null;
  }

  async touchMailboxLastChecked(userId: string): Promise<void> {
    await db
      .update(mailboxes)
      .set({ lastCheckedAt: new Date() })
      .where(eq(mailboxes.userId, userId));
  }

  async getMailboxByNumber(mailboxNumber: string): Promise<Mailbox | null> {
    const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.mailboxNumber, mailboxNumber));
    return mailbox ?? null;
  }

  async getOrCreateMailbox(userId: string): Promise<Mailbox> {
    const existing = await this.getMailboxByUserId(userId);
    if (existing) return existing;

    // Generate a unique 5-digit mailbox number (10000–99999)
    let mailboxNumber: string;
    let attempts = 0;
    do {
      mailboxNumber = String(Math.floor(10000 + Math.random() * 90000));
      const conflict = await this.getMailboxByNumber(mailboxNumber);
      if (!conflict) break;
      attempts++;
    } while (attempts < 20);

    const [mailbox] = await db.insert(mailboxes).values({ userId, mailboxNumber }).returning();
    console.log(`[mailbox] Created mailbox ${mailboxNumber} for userId=${userId}`);
    return mailbox;
  }

  async createMailboxForSetup(userId: string): Promise<Mailbox> {
    const existing = await this.getMailboxByUserId(userId);
    if (existing) return existing;

    let mailboxNumber: string;
    let attempts = 0;
    do {
      mailboxNumber = String(Math.floor(10000 + Math.random() * 90000));
      const conflict = await this.getMailboxByNumber(mailboxNumber);
      if (!conflict) break;
      attempts++;
    } while (attempts < 20);

    const [mailbox] = await db.insert(mailboxes).values({ userId, mailboxNumber, setupComplete: false }).returning();
    console.log(`[mailbox] Created mailbox ${mailboxNumber} for setup — userId=${userId}`);
    return mailbox;
  }

  async updateMailboxProfile(userId: string, data: { dateOfBirth?: string; bodyType?: string; ethnicity?: string; setupComplete?: boolean }): Promise<void> {
    await db.update(mailboxes).set(data).where(eq(mailboxes.userId, userId));
  }

  async getMailboxesByCategory(category: string, excludeUserId: string): Promise<Mailbox[]> {
    return db
      .select()
      .from(mailboxes)
      .where(
        and(
          eq(mailboxes.category, category),
          not(eq(mailboxes.userId, excludeUserId)),
          sql`${mailboxes.adRecordingUrl} IS NOT NULL`
        )
      );
  }

  async updateMailboxAd(userId: string, category: string, adRecordingUrl: string, adRecordingDuration: number): Promise<Mailbox> {
    const mailbox = await this.getOrCreateMailbox(userId);
    const [updated] = await db
      .update(mailboxes)
      .set({ category, adRecordingUrl, adRecordingDuration })
      .where(eq(mailboxes.userId, userId))
      .returning();
    console.log(`[mailbox] Updated ad for mailbox ${mailbox.mailboxNumber} — category=${category}`);
    return updated;
  }

  async updateProfileTranscription(recordingUrl: string, text: string | null, status: string): Promise<void> {
    await db.update(profiles)
      .set({ transcription: text, transcriptionStatus: status })
      .where(eq(profiles.recordingUrl, recordingUrl));
  }

  async updateMailboxTranscription(adRecordingUrl: string, text: string | null, status: string): Promise<void> {
    await db.update(mailboxes)
      .set({ adTranscription: text, adTranscriptionStatus: status })
      .where(eq(mailboxes.adRecordingUrl, adRecordingUrl));
  }

  async setProfileTranscriptionPending(profileId: string): Promise<void> {
    await db.update(profiles)
      .set({ transcriptionStatus: "pending" })
      .where(eq(profiles.id, profileId));
  }

  async getAllProfilesWithTranscriptions(): Promise<ProfileWithUser[]> {
    const rows = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        nameRecordingUrl: profiles.nameRecordingUrl,
        recordingUrl: profiles.recordingUrl,
        recordingDuration: profiles.recordingDuration,
        isAdminUploaded: profiles.isAdminUploaded,
        siteCategory: profiles.siteCategory,
        gender: profiles.gender,
        transcription: profiles.transcription,
        transcriptionStatus: profiles.transcriptionStatus,
        createdAt: profiles.createdAt,
        phoneNumber: users.phoneNumber,
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(eq(profiles.isAdminUploaded, false))
      .orderBy(profiles.createdAt);
    return rows as ProfileWithUser[];
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

  async logAuditEvent(action: string, opts?: { targetType?: string; targetId?: string; targetLabel?: string; detail?: Record<string, unknown> }): Promise<void> {
    await db.insert(auditLogs).values({
      action,
      targetType: opts?.targetType ?? null,
      targetId: opts?.targetId ?? null,
      targetLabel: opts?.targetLabel ?? null,
      detail: opts?.detail ? JSON.stringify(opts.detail) : null,
      performedBy: "admin",
    });
  }

  async getAuditLogs(limit = 200): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(sql`${auditLogs.createdAt} DESC`).limit(limit);
  }

  async getAnalytics(): Promise<{
    funnel: { totalCallers: number; withProfile: number; withMessage: number; withMembership: number };
    peakByHour: { hour: number; calls: number }[];
    peakByDay: { day: number; calls: number }[];
    retention: { oneTime: number; occasional: number; regular: number };
    revenue: {
      plan1Count: number; plan2Count: number; plan3Count: number;
      plan1Name: string; plan2Name: string; plan3Name: string;
      plan1PriceCents: number; plan2PriceCents: number; plan3PriceCents: number;
      estimatedMrrCents: number;
    };
  }> {
    // Funnel
    const [{ totalCallers }] = await db
      .select({ totalCallers: count() })
      .from(users)
      .where(notLike(users.phoneNumber, `${VIRTUAL_PREFIX}%`));

    const [{ withProfile }] = await db
      .select({ withProfile: count() })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(notLike(users.phoneNumber, `${VIRTUAL_PREFIX}%`));

    const [{ withMessage }] = await db
      .select({ withMessage: sql<number>`COUNT(DISTINCT ${messages.fromUserId})` })
      .from(messages)
      .innerJoin(users, eq(messages.fromUserId, users.id))
      .where(notLike(users.phoneNumber, `${VIRTUAL_PREFIX}%`));

    const [{ withMembership }] = await db
      .select({ withMembership: count() })
      .from(users)
      .where(and(
        notLike(users.phoneNumber, `${VIRTUAL_PREFIX}%`),
        sql`${users.membershipTier} IS NOT NULL`,
      ));

    // Peak usage by hour of day
    const hourResult = await db.execute(sql`
      SELECT EXTRACT(HOUR FROM started_at)::int AS hour, COUNT(*)::int AS calls
      FROM call_logs
      WHERE from_phone_number NOT LIKE ${`${VIRTUAL_PREFIX}%`}
      GROUP BY hour ORDER BY hour
    `);
    const peakByHour: { hour: number; calls: number }[] = Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
    for (const row of hourResult.rows as { hour: number; calls: number }[]) {
      peakByHour[row.hour].calls = Number(row.calls);
    }

    // Peak usage by day of week (0=Sun, 6=Sat)
    const dayResult = await db.execute(sql`
      SELECT EXTRACT(DOW FROM started_at)::int AS dow, COUNT(*)::int AS calls
      FROM call_logs
      WHERE from_phone_number NOT LIKE ${`${VIRTUAL_PREFIX}%`}
      GROUP BY dow ORDER BY dow
    `);
    const peakByDay: { day: number; calls: number }[] = Array.from({ length: 7 }, (_, i) => ({ day: i, calls: 0 }));
    for (const row of dayResult.rows as { dow: number; calls: number }[]) {
      peakByDay[row.dow].calls = Number(row.calls);
    }

    // Retention — group real callers by call count
    const retentionResult = await db.execute(sql`
      SELECT from_phone_number, COUNT(*)::int AS cnt
      FROM call_logs
      WHERE from_phone_number NOT LIKE ${`${VIRTUAL_PREFIX}%`}
      GROUP BY from_phone_number
    `);
    let oneTime = 0, occasional = 0, regular = 0;
    for (const row of retentionResult.rows as { from_phone_number: string; cnt: number }[]) {
      const n = Number(row.cnt);
      if (n === 1) oneTime++;
      else if (n <= 5) occasional++;
      else regular++;
    }

    // Revenue — count by membership tier, multiply by configured price
    const settings = await this.getMembershipSettings();
    const membershipResult = await db.execute(sql`
      SELECT membership_tier AS tier, COUNT(*)::int AS cnt
      FROM users
      WHERE membership_tier IS NOT NULL AND phone_number NOT LIKE ${`${VIRTUAL_PREFIX}%`}
      GROUP BY membership_tier
    `);
    const tierCounts: Record<string, number> = {};
    for (const row of membershipResult.rows as { tier: string; cnt: number }[]) {
      tierCounts[row.tier] = Number(row.cnt);
    }
    const plan1Count = tierCounts["plan1"] || 0;
    const plan2Count = tierCounts["plan2"] || 0;
    const plan3Count = tierCounts["plan3"] || 0;
    const estimatedMrrCents =
      plan1Count * settings.plan1PriceCents +
      plan2Count * settings.plan2PriceCents +
      plan3Count * settings.plan3PriceCents;

    return {
      funnel: {
        totalCallers: Number(totalCallers),
        withProfile: Number(withProfile),
        withMessage: Number(withMessage),
        withMembership: Number(withMembership),
      },
      peakByHour,
      peakByDay,
      retention: { oneTime, occasional, regular },
      revenue: {
        plan1Count, plan2Count, plan3Count,
        plan1Name: settings.plan1Name,
        plan2Name: settings.plan2Name,
        plan3Name: settings.plan3Name,
        plan1PriceCents: settings.plan1PriceCents,
        plan2PriceCents: settings.plan2PriceCents,
        plan3PriceCents: settings.plan3PriceCents,
        estimatedMrrCents,
      },
    };
  }

  // ─── Web Users ─────────────────────────────────────────────────────────────
  async getWebUserByEmail(email: string): Promise<WebUser | undefined> {
    const [user] = await db.select().from(webUsers).where(eq(webUsers.email, email.toLowerCase()));
    return user;
  }

  async getWebUserById(id: string): Promise<WebUser | undefined> {
    const [user] = await db.select().from(webUsers).where(eq(webUsers.id, id));
    return user;
  }

  async createWebUser(email: string, passwordHash: string): Promise<WebUser> {
    const [user] = await db.insert(webUsers).values({ email: email.toLowerCase(), passwordHash }).returning();
    return user;
  }

  async setWebUserResetToken(email: string, token: string, expiry: Date): Promise<void> {
    await db.update(webUsers).set({ resetToken: token, resetTokenExpiry: expiry }).where(eq(webUsers.email, email.toLowerCase()));
  }

  async getWebUserByResetToken(token: string): Promise<WebUser | undefined> {
    const [user] = await db.select().from(webUsers).where(eq(webUsers.resetToken, token));
    return user;
  }

  async updateWebUserPassword(id: string, passwordHash: string): Promise<void> {
    await db.update(webUsers).set({ passwordHash }).where(eq(webUsers.id, id));
  }

  async clearWebUserResetToken(id: string): Promise<void> {
    await db.update(webUsers).set({ resetToken: null, resetTokenExpiry: null }).where(eq(webUsers.id, id));
  }

  async getCallHistoryByPhone(phoneNumber: string, limit = 100): Promise<{
    id: string;
    callSid: string;
    durationSeconds: number;
    startedAt: Date | null;
    completedAt: Date | null;
    toPhoneNumber: string | null;
  }[]> {
    const result = await db.execute(sql`
      SELECT id, call_sid AS "callSid",
             duration_seconds AS "durationSeconds",
             started_at AS "startedAt",
             completed_at AS "completedAt",
             to_phone_number AS "toPhoneNumber"
      FROM call_logs
      WHERE from_phone_number = ${phoneNumber}
        AND duration_seconds IS NOT NULL
        AND duration_seconds > 0
      ORDER BY started_at DESC
      LIMIT ${limit}
    `);
    return result.rows as any[];
  }

  async linkWebUserPhone(id: string, phoneNumber: string, membershipNumber?: string): Promise<void> {
    await db.update(webUsers).set({
      linkedPhoneNumber: phoneNumber,
      ...(membershipNumber ? { linkedMembershipNumber: membershipNumber } : {}),
      linkAttempts: 0,
    }).where(eq(webUsers.id, id));
  }

  async incrementWebUserLinkAttempts(id: string): Promise<number> {
    const [updated] = await db
      .update(webUsers)
      .set({ linkAttempts: sql`${webUsers.linkAttempts} + 1` })
      .where(eq(webUsers.id, id))
      .returning({ linkAttempts: webUsers.linkAttempts });
    return updated?.linkAttempts ?? 0;
  }

  async lockWebUser(id: string): Promise<void> {
    await db.update(webUsers).set({ isLocked: true }).where(eq(webUsers.id, id));
  }

  async touchWebUserLastLogin(id: string): Promise<void> {
    await db.update(webUsers).set({ lastLoginAt: new Date() }).where(eq(webUsers.id, id));
  }

  async getAltPhonesForWebUser(webUserId: string): Promise<WebUserAltPhone[]> {
    return db.select().from(webUserAltPhones).where(eq(webUserAltPhones.webUserId, webUserId));
  }

  async addAltPhoneForWebUser(webUserId: string, phoneNumber: string): Promise<WebUserAltPhone> {
    const [row] = await db.insert(webUserAltPhones).values({ webUserId, phoneNumber }).returning();
    return row;
  }

  async removeAltPhoneForWebUser(webUserId: string, altPhoneId: string): Promise<void> {
    await db.delete(webUserAltPhones).where(and(
      eq(webUserAltPhones.id, altPhoneId),
      eq(webUserAltPhones.webUserId, webUserId),
    ));
  }

  async getPrimaryPhoneForAltNumber(phoneNumber: string): Promise<string | null> {
    const [row] = await db
      .select({ linkedPhoneNumber: webUsers.linkedPhoneNumber })
      .from(webUserAltPhones)
      .innerJoin(webUsers, eq(webUserAltPhones.webUserId, webUsers.id))
      .where(eq(webUserAltPhones.phoneNumber, phoneNumber));
    return row?.linkedPhoneNumber ?? null;
  }

  async createMembershipLinkCode(webUserId: string, code: string, expiresAt: Date): Promise<MembershipLinkCode> {
    const [row] = await db.insert(membershipLinkCodes).values({ webUserId, code, expiresAt }).returning();
    return row;
  }

  async getActiveMembershipLinkCode(code: string): Promise<MembershipLinkCode | undefined> {
    const now = new Date();
    const [row] = await db.select().from(membershipLinkCodes).where(
      and(
        eq(membershipLinkCodes.code, code),
        isNull(membershipLinkCodes.usedAt),
        sql`${membershipLinkCodes.expiresAt} > ${now}`,
      )
    ).limit(1);
    return row;
  }

  async getActiveCodeByWebUserId(webUserId: string): Promise<MembershipLinkCode | undefined> {
    const now = new Date();
    const [row] = await db.select().from(membershipLinkCodes).where(
      and(
        eq(membershipLinkCodes.webUserId, webUserId),
        isNull(membershipLinkCodes.usedAt),
        sql`${membershipLinkCodes.expiresAt} > ${now}`,
      )
    ).orderBy(membershipLinkCodes.createdAt).limit(1);
    return row;
  }

  async consumeMembershipLinkCode(codeId: string): Promise<void> {
    await db.update(membershipLinkCodes).set({ usedAt: new Date() }).where(eq(membershipLinkCodes.id, codeId));
  }

  // ── Membership Cards ──────────────────────────────────────────────────────────
  async createMembershipCard(cardNumber: string, pin: string, valueSeconds: number, notes?: string): Promise<MembershipCard> {
    const [row] = await db.insert(membershipCards).values({ cardNumber, pin, valueSeconds, notes: notes ?? null }).returning();
    return row;
  }

  async getMembershipCardByNumber(cardNumber: string): Promise<MembershipCard | undefined> {
    const [row] = await db.select().from(membershipCards).where(eq(membershipCards.cardNumber, cardNumber));
    return row;
  }

  async getMembershipCardById(id: string): Promise<MembershipCard | undefined> {
    const [row] = await db.select().from(membershipCards).where(eq(membershipCards.id, id));
    return row;
  }

  async getMembershipCardByPhone(phoneNumber: string): Promise<MembershipCard | undefined> {
    const [row] = await db.select().from(membershipCards).where(eq(membershipCards.phoneNumber, phoneNumber));
    return row;
  }

  async linkCardToPhone(cardId: string, phoneNumber: string): Promise<void> {
    await db.update(membershipCards).set({ phoneNumber, firstUsedAt: new Date() }).where(eq(membershipCards.id, cardId));
  }

  async deductCardSeconds(cardId: string, seconds: number): Promise<MembershipCard> {
    const [row] = await db
      .update(membershipCards)
      .set({ valueSeconds: sql`GREATEST(0, ${membershipCards.valueSeconds} - ${seconds})` })
      .where(eq(membershipCards.id, cardId))
      .returning();
    return row;
  }

  async getAllMembershipCards(): Promise<MembershipCard[]> {
    return db.select().from(membershipCards).orderBy(membershipCards.createdAt);
  }

  async deleteMembershipCard(id: string): Promise<void> {
    await db.delete(membershipCards).where(eq(membershipCards.id, id));
  }

  async updateMembershipCardNotes(id: string, notes: string): Promise<void> {
    await db.update(membershipCards).set({ notes: notes || null }).where(eq(membershipCards.id, id));
  }

  async isMembershipCardNumberTaken(cardNumber: string): Promise<boolean> {
    const [row] = await db.select({ id: membershipCards.id }).from(membershipCards).where(eq(membershipCards.cardNumber, cardNumber));
    return !!row;
  }

  async getMailboxStats(): Promise<{ total: number; byCategory: { category: string | null; count: number }[] }> {
    const totalResult = await db.select({ count: count() }).from(mailboxes);
    const total = Number(totalResult[0]?.count ?? 0);

    const byCategoryResult = await db.execute(sql`
      SELECT category, COUNT(*)::int AS count
      FROM mailboxes
      GROUP BY category
      ORDER BY count DESC
    `);

    const byCategory = (byCategoryResult.rows as { category: string | null; count: number }[]);
    return { total, byCategory };
  }

  // ── Auto-moderation implementations ──────────────────────────────────────────

  async countDistinctFlaggers(contentType: string, contentId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT reported_by_user_id)::int AS cnt
      FROM flagged_content
      WHERE content_type = ${contentType}
        AND content_id = ${contentId}::uuid
        AND reported_by_user_id IS NOT NULL
    `);
    return Number((result.rows[0] as { cnt: number })?.cnt ?? 0);
  }

  async countDistinctBlockersInWindow(blockedUserId: string, windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT blocker_id)::int AS cnt
      FROM blocked_users
      WHERE blocked_user_id = ${blockedUserId}::uuid
        AND created_at >= ${since}
    `);
    return Number((result.rows[0] as { cnt: number })?.cnt ?? 0);
  }

  async countFlagRemoveCycles(contentType: string, contentId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM flagged_content
      WHERE content_type = ${contentType}
        AND content_id = ${contentId}::uuid
        AND status = 'removed'
    `);
    return Number((result.rows[0] as { cnt: number })?.cnt ?? 0);
  }

  async countAutoRemovesForUser(userId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM moderation_logs
      WHERE target_user_id = ${userId}::uuid
        AND event_type = 'auto_remove'
    `);
    return Number((result.rows[0] as { cnt: number })?.cnt ?? 0);
  }

  async setUserAccountStatus(userId: string, status: string): Promise<void> {
    await db.update(users).set({ accountStatus: status }).where(eq(users.id, userId));
  }

  async deleteProfileByUserId(userId: string): Promise<void> {
    await db.delete(profiles).where(eq(profiles.userId, userId));
  }

  async getUserByProfileRecordingUrl(url: string): Promise<User | null> {
    const [row] = await db
      .select({ user: users })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(eq(profiles.recordingUrl, url));
    return row?.user ?? null;
  }

  async getUserByMailboxAdRecordingUrl(url: string): Promise<User | null> {
    const [row] = await db
      .select({ user: users })
      .from(mailboxes)
      .innerJoin(users, eq(mailboxes.userId, users.id))
      .where(eq(mailboxes.adRecordingUrl, url));
    return row?.user ?? null;
  }

  async setUserRecordingRejection(userId: string, reason: string, type: string): Promise<void> {
    await db.update(users)
      .set({ recordingRejectionReason: reason, recordingRejectionType: type })
      .where(eq(users.id, userId));
  }

  async clearUserRecordingRejection(userId: string): Promise<void> {
    await db.update(users)
      .set({ recordingRejectionReason: null, recordingRejectionType: null })
      .where(eq(users.id, userId));
  }

  async clearMailboxAdByUserId(userId: string): Promise<void> {
    await db.update(mailboxes)
      .set({ adRecordingUrl: null, adRecordingDuration: null, adTranscription: null, adTranscriptionStatus: null })
      .where(eq(mailboxes.userId, userId));
  }

  async logModerationEvent(data: InsertModerationLog): Promise<ModerationLog> {
    const [row] = await db.insert(moderationLogs).values(data).returning();
    return row;
  }

  async getModerationLogs(opts?: { targetUserId?: string; limit?: number }): Promise<(ModerationLog & { targetPhone: string })[]> {
    const limitVal = opts?.limit ?? 200;
    const whereClause = opts?.targetUserId
      ? sql`WHERE ml.target_user_id = ${opts.targetUserId}::uuid`
      : sql``;
    const result = await db.execute(sql`
      SELECT ml.*, u.phone_number AS "targetPhone"
      FROM moderation_logs ml
      LEFT JOIN users u ON u.id = ml.target_user_id
      ${whereClause}
      ORDER BY ml.created_at DESC
      LIMIT ${limitVal}
    `);
    return result.rows as (ModerationLog & { targetPhone: string })[];
  }
}

export const storage = new DatabaseStorage();
