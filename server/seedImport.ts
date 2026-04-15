/**
 * seedImport.ts — Startup seed folder importer.
 *
 * On every restart this module scans uploads/seeds/ for MP3 files and
 * automatically creates an admin-uploaded profile for each one that hasn't
 * been imported yet.  Files that were already imported on a previous run are
 * detected by their recording_url in the database and silently skipped, so
 * restarts are fully idempotent.
 *
 * Phone numbers follow the pattern  +1720111XXXX  where XXXX is the next
 * available 4-digit suffix (0001 → 9999).  The same file always ends up on
 * the same virtual user because the check is URL-based, not number-based.
 */

import fs from "fs";
import path from "path";
import * as mm from "music-metadata";
import { storage } from "./storage";
import { db } from "./db";
import { users, profiles } from "@shared/schema";
import { like } from "drizzle-orm";
import { addVirtualCaller } from "./simulator";
import { getSiteSettingsCached } from "./settings-cache";
import { log } from "./index";

const SEEDS_DIR = path.join(process.cwd(), "uploads", "seeds");
const PHONE_PREFIX = "+1720111";

function makePhoneNumber(suffix: number): string {
  return `${PHONE_PREFIX}${String(suffix).padStart(4, "0")}`;
}

export async function importSeedFolder(): Promise<void> {
  // Ensure the seeds directory exists so users can drop files right away
  if (!fs.existsSync(SEEDS_DIR)) {
    fs.mkdirSync(SEEDS_DIR, { recursive: true });
    log("created uploads/seeds/ directory", "seeds");
  }

  // Read all .mp3 files in the seeds folder
  let files: string[];
  try {
    files = fs.readdirSync(SEEDS_DIR).filter(f => f.toLowerCase().endsWith(".mp3"));
  } catch (err) {
    log(`could not read uploads/seeds/: ${err}`, "seeds");
    return;
  }

  if (files.length === 0) {
    log("no MP3 files found in uploads/seeds/ — nothing to import", "seeds");
    return;
  }

  // Build a set of recording URLs that have already been imported
  const importedUrls = new Set<string>();
  try {
    const existing = await db
      .select({ recordingUrl: profiles.recordingUrl })
      .from(profiles)
      .where(like(profiles.recordingUrl, "/uploads/seeds/%"));
    for (const row of existing) {
      if (row.recordingUrl) importedUrls.add(row.recordingUrl);
    }
  } catch (err) {
    log(`could not query existing seed profiles: ${err}`, "seeds");
    return;
  }

  // Find all phone suffixes already in use under our +1720111XXXX namespace
  const usedSuffixes = new Set<number>();
  try {
    const existing = await db
      .select({ phoneNumber: users.phoneNumber })
      .from(users)
      .where(like(users.phoneNumber, `${PHONE_PREFIX}%`));
    for (const row of existing) {
      const suffix = parseInt(row.phoneNumber.slice(PHONE_PREFIX.length), 10);
      if (!isNaN(suffix)) usedSuffixes.add(suffix);
    }
  } catch (err) {
    log(`could not query existing seed users: ${err}`, "seeds");
    return;
  }

  // Helper: return the next unused suffix
  let nextSuffix = 1;
  function claimNextSuffix(): number {
    while (usedSuffixes.has(nextSuffix)) nextSuffix++;
    const claimed = nextSuffix;
    usedSuffixes.add(claimed);
    nextSuffix++;
    return claimed;
  }

  const siteConf = await getSiteSettingsCached().catch(() => null);
  const siteCategory = siteConf?.siteCategory ?? "MM";

  let imported = 0;
  let skipped = 0;

  for (const filename of files) {
    const recordingUrl = `/uploads/seeds/${filename}`;

    if (importedUrls.has(recordingUrl)) {
      skipped++;
      continue;
    }

    // Parse duration from the MP3
    let recordingDuration: number | null = null;
    try {
      const filePath = path.join(SEEDS_DIR, filename);
      const metadata = await mm.parseFile(filePath);
      if (metadata.format.duration != null) {
        recordingDuration = Math.round(metadata.format.duration);
      }
    } catch {
      // Duration is optional — proceed without it
    }

    // Assign a phone number and create the user + profile
    try {
      const phoneNumber = makePhoneNumber(claimNextSuffix());
      const user = await storage.getOrCreateUser(phoneNumber);
      await storage.upsertProfile({
        userId: user.id,
        recordingUrl,
        recordingDuration,
        isAdminUploaded: true,
        siteCategory,
        gender: null,
      });

      // Register with the virtual caller simulator
      await addVirtualCaller(user.id).catch(err =>
        log(`addVirtualCaller error for ${filename}: ${err}`, "seeds"),
      );

      log(`imported ${filename} → ${phoneNumber}`, "seeds");
      imported++;
    } catch (err) {
      log(`failed to import ${filename}: ${err}`, "seeds");
    }
  }

  log(
    `scan complete — ${imported} imported, ${skipped} already on file (${files.length} total)`,
    "seeds",
  );
}
