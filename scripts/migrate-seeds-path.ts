/**
 * migrate-seeds-path.ts
 *
 * One-time migration for admin-uploaded profiles that were saved to
 * /uploads/<filename> before the fix that routes them to /uploads/seeds/.
 *
 * For each admin-uploaded profile whose recording_url is /uploads/<filename>
 * (not already in /uploads/seeds/):
 *   1. Moves the file from uploads/<filename> to uploads/seeds/<filename>
 *   2. Updates the database record to /uploads/seeds/<filename>
 *
 * Safe to run multiple times — skips anything already in the correct location.
 *
 * Usage:
 *   npx tsx scripts/migrate-seeds-path.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv();

import fs from "fs";
import path from "path";
import { db } from "../server/db";
import { profiles } from "@shared/schema";
import { eq, and, like, notLike } from "drizzle-orm";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const SEEDS_DIR   = path.join(UPLOADS_DIR, "seeds");

async function main() {
  console.log("[migrate-seeds-path] Starting...");

  // Ensure seeds directory exists
  if (!fs.existsSync(SEEDS_DIR)) {
    fs.mkdirSync(SEEDS_DIR, { recursive: true });
    console.log("[migrate-seeds-path] Created uploads/seeds/");
  }

  // Find admin-uploaded profiles whose url is /uploads/<file> (not /uploads/seeds/)
  const rows = await db
    .select({ id: profiles.id, recordingUrl: profiles.recordingUrl })
    .from(profiles)
    .where(
      and(
        eq(profiles.isAdminUploaded, true),
        like(profiles.recordingUrl, "/uploads/%"),
        notLike(profiles.recordingUrl, "/uploads/seeds/%"),
      )
    );

  if (rows.length === 0) {
    console.log("[migrate-seeds-path] No profiles need migration. Done.");
    process.exit(0);
  }

  console.log(`[migrate-seeds-path] Found ${rows.length} profile(s) to migrate.`);

  let moved = 0;
  let skipped = 0;
  let dbUpdated = 0;

  for (const row of rows) {
    const oldUrl      = row.recordingUrl!;
    const filename    = path.basename(oldUrl);
    const oldDiskPath = path.join(UPLOADS_DIR, filename);
    const newDiskPath = path.join(SEEDS_DIR, filename);
    const newUrl      = `/uploads/seeds/${filename}`;

    // Move the file if it exists at the old location
    if (fs.existsSync(oldDiskPath)) {
      try {
        fs.renameSync(oldDiskPath, newDiskPath);
        console.log(`[migrate-seeds-path] Moved: ${filename}`);
        moved++;
      } catch (err) {
        console.error(`[migrate-seeds-path] Could not move ${filename}:`, err);
        skipped++;
        continue;
      }
    } else if (fs.existsSync(newDiskPath)) {
      console.log(`[migrate-seeds-path] File already in seeds/: ${filename}`);
    } else {
      console.warn(`[migrate-seeds-path] File not found on disk, updating DB only: ${filename}`);
    }

    // Update the database record regardless of whether we moved a file
    await db
      .update(profiles)
      .set({ recordingUrl: newUrl })
      .where(eq(profiles.id, row.id));
    dbUpdated++;
    console.log(`[migrate-seeds-path] DB updated: ${oldUrl} → ${newUrl}`);
  }

  console.log(
    `[migrate-seeds-path] Done. Files moved: ${moved}, DB records updated: ${dbUpdated}, skipped: ${skipped}`
  );
  process.exit(0);
}

main().catch(err => {
  console.error("[migrate-seeds-path] Fatal error:", err);
  process.exit(1);
});
