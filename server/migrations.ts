/**
 * startup-migrations.ts
 *
 * Idempotent schema patches that run every time the server starts.
 * Each statement uses ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS
 * so they are completely safe to re-run and never break an already-current DB.
 *
 * Add new columns HERE (not by hand-editing the production DB) so every
 * environment automatically catches up on the next restart.
 */

import { pool } from "./db";

const MIGRATIONS: string[] = [
  // ── users ────────────────────────────────────────────────────────────────
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_number TEXT UNIQUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_pin TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_started_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_purchased_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS recording_rejection_reason TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS recording_rejection_type TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_tier TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS remaining_seconds INTEGER`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_code_id UUID`,

  // ── profiles ─────────────────────────────────────────────────────────────
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name_recording_url TEXT`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recording_duration INTEGER`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin_uploaded BOOLEAN DEFAULT false`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS site_category TEXT`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS transcription TEXT`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS transcription_status TEXT`,

  // ── messages ─────────────────────────────────────────────────────────────
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_saved BOOLEAN DEFAULT false`,

  // ── active_calls ─────────────────────────────────────────────────────────
  `ALTER TABLE active_calls ADD COLUMN IF NOT EXISTS region_id UUID`,
  `ALTER TABLE active_calls ADD COLUMN IF NOT EXISTS gender TEXT`,
  `ALTER TABLE active_calls ADD COLUMN IF NOT EXISTS seeking TEXT`,

  // ── call_logs ────────────────────────────────────────────────────────────
  `ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS region_id UUID`,
  `ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS to_phone_number TEXT`,
  `ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS from_phone_number TEXT`,
  `ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`,
  `ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,

  // ── site_settings ─────────────────────────────────────────────────────────
  `ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS site_category TEXT NOT NULL DEFAULT 'MM'`,
  `ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS personality_mode TEXT NOT NULL DEFAULT 'rotate'`,
  `ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS customer_service_email TEXT`,
  `ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS customer_service_phone TEXT`,

  // ── membership_settings ───────────────────────────────────────────────────
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS bonus_plan_key TEXT`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS motd_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS motd_text TEXT`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS motd_main_menu_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS motd_main_menu_text TEXT`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS motd_phone_booth_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS motd_phone_booth_text TEXT`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS motd_post_purchase_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS motd_post_purchase_text TEXT`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'per_minute'`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS stripe_enabled BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS paypal_email TEXT`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS paypal_sandbox BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS free_mode BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE membership_settings ADD COLUMN IF NOT EXISTS free_mode_schedule_days INTEGER[] NOT NULL DEFAULT '{}'`,

  // ── tables that may not exist at all on older installs ────────────────────
  `CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_user_id UUID NOT NULL,
    blocked_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS flagged_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID,
    reported_user_id UUID,
    content_type TEXT NOT NULL,
    content_url TEXT,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS system_prompt_overrides (
    filename TEXT PRIMARY KEY,
    custom_text TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    value_minutes INTEGER NOT NULL,
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL,
    user_id UUID NOT NULL,
    seconds_awarded INTEGER NOT NULL,
    redeemed_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    detail JSONB,
    performed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS mailboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    box_number TEXT NOT NULL UNIQUE,
    pin TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS web_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    reset_token TEXT,
    reset_token_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS web_user_alt_phones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    web_user_id UUID NOT NULL,
    phone_number TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS membership_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    card_number TEXT NOT NULL UNIQUE,
    pin TEXT NOT NULL,
    value_minutes INTEGER NOT NULL,
    is_redeemed BOOLEAN NOT NULL DEFAULT false,
    redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS seed_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL,
    call_sid TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active'
  )`,

  `CREATE TABLE IF NOT EXISTS membership_link_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS moderation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action TEXT NOT NULL,
    reason TEXT,
    performed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS sms_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    send_day INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    sent_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS roger_prompt_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_name TEXT NOT NULL,
    old_text TEXT,
    new_text TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS personality_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    prompt_addon TEXT NOT NULL DEFAULT '',
    voice_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS ivr_error_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_sid TEXT,
    error_type TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  // ── zip_codes / regions / region_links (early tables, probably exist, but safe) ──
  `ALTER TABLE regions ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE regions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`,
];

export async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    let applied = 0;
    for (const sql of MIGRATIONS) {
      try {
        await client.query(sql);
        applied++;
      } catch (err: any) {
        // Log but never crash the server over a migration — a failed ALTER is
        // usually because the column already exists with an incompatible type,
        // which is a schema conflict that needs manual attention.
        console.error(`[migrations] Failed: ${sql.slice(0, 80).replace(/\s+/g, " ")}…\n  → ${err.message}`);
      }
    }
    console.log(`[migrations] ${applied}/${MIGRATIONS.length} statements applied.`);
  } finally {
    client.release();
  }
}
