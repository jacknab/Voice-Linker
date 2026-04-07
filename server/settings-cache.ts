import { storage } from "./storage";
import type { MembershipSettings, SiteSettings } from "@shared/schema";

// ─── Membership Settings Cache ─────────────────────────────────────────────
// Settings are loaded from DB and cached for 60 seconds to avoid hitting
// the DB on every incoming call.

let _cachedSettings: MembershipSettings | null = null;
let _cacheExpiresAt = 0;

export async function getMembershipSettingsCached(): Promise<MembershipSettings> {
  if (_cachedSettings && Date.now() < _cacheExpiresAt) return _cachedSettings;
  _cachedSettings = await storage.getMembershipSettings();
  _cacheExpiresAt = Date.now() + 60_000;
  return _cachedSettings;
}

export function invalidateMembershipSettingsCache(): void {
  _cachedSettings = null;
  _cacheExpiresAt = 0;
}

// ─── Site Settings Cache ───────────────────────────────────────────────────
// Mirrors the membership settings cache pattern, used by playPrompt and IVR routes.

let _cachedSiteSettings: SiteSettings | null = null;
let _siteSettingsCacheExpiresAt = 0;

export async function getSiteSettingsCached(): Promise<SiteSettings> {
  if (_cachedSiteSettings && Date.now() < _siteSettingsCacheExpiresAt) return _cachedSiteSettings;
  _cachedSiteSettings = await storage.getSiteSettings();
  _siteSettingsCacheExpiresAt = Date.now() + 60_000;
  return _cachedSiteSettings;
}

export function invalidateSiteSettingsCache(): void {
  _cachedSiteSettings = null;
  _siteSettingsCacheExpiresAt = 0;
}

// Synchronous accessor used by playPrompt (which runs inside synchronous TwiML builders)
export function getRawSiteSettingsCache(): SiteSettings | null {
  return _cachedSiteSettings;
}
