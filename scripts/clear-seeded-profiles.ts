/**
 * clear-seeded-profiles.ts
 *
 * Removes all admin-uploaded seed profiles and their associated virtual users
 * (+1720111XXXX phone numbers) so you can start fresh from the admin panel.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/clear-seeded-profiles.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: false });
loadEnv({ path: "/opt/Voice-Linker/.env", override: false });

import fs from "fs";
import path from "path";
import { db } from "../server/db";
import { profiles, users, activeCalls } from "@shared/schema";
import { eq, like, and } from "drizzle-orm";

const PHONE_PREFIX = "+1720111";
const VIRTUAL_PREFIX = "VIRTUAL-";
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

async function main() {
  console.log("[clear-seeded-profiles] Starting...");

  // 1. Find all admin-uploaded profiles and their recording files
  const seedProfiles = await db
    .select({ id: profiles.id, userId: profiles.userId, recordingUrl: profiles.recordingUrl })
    .from(profiles)
    .where(eq(profiles.isAdminUploaded, true));

  console.log(`[clear-seeded-profiles] Found ${seedProfiles.length} seeded profile(s).`);

  // 2. Remove any active virtual caller entries for these users
  for (const p of seedProfiles) {
    await db
      .delete(activeCalls)
      .where(like(activeCalls.callSid, `${VIRTUAL_PREFIX}${p.userId}%`));
  }
  console.log(`[clear-seeded-profiles] Cleared virtual caller entries.`);

  // 3. Delete the profile records
  if (seedProfiles.length > 0) {
    for (const p of seedProfiles) {
      await db.delete(profiles).where(eq(profiles.id, p.id));

      // Delete the recording file from disk if it's a local seed file
      if (p.recordingUrl?.startsWith("/uploads/")) {
        const diskPath = path.join(UPLOADS_DIR, p.recordingUrl.replace("/uploads/", ""));
        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
          console.log(`[clear-seeded-profiles] Deleted file: ${p.recordingUrl}`);
        }
      }
    }
  }

  // 4. Delete the virtual seed users (+1720111XXXX)
  const seedUsers = await db
    .select({ id: users.id, phoneNumber: users.phoneNumber })
    .from(users)
    .where(like(users.phoneNumber, `${PHONE_PREFIX}%`));

  console.log(`[clear-seeded-profiles] Found ${seedUsers.length} seed user(s) to delete.`);
  for (const u of seedUsers) {
    await db.delete(users).where(eq(users.id, u.id));
    console.log(`[clear-seeded-profiles] Deleted user: ${u.phoneNumber}`);
  }

  console.log("[clear-seeded-profiles] Done. You can now re-upload seed greetings via the admin panel.");
  process.exit(0);
}

main().catch(err => {
  console.error("[clear-seeded-profiles] Fatal error:", err);
  process.exit(1);
});
