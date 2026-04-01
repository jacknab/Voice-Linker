import { config } from "dotenv";
config();

import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { adminAccounts } from "../shared/schema";
import { eq } from "drizzle-orm";

const EMAIL = "admin@me.com";
const PASSWORD = "1825Logan!";

async function seedAdmin() {
  const existing = await db
    .select({ id: adminAccounts.id })
    .from(adminAccounts)
    .where(eq(adminAccounts.email, EMAIL));

  if (existing.length > 0) {
    console.log(`[seed-admin] Admin account already exists: ${EMAIL}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await db.insert(adminAccounts).values({ email: EMAIL, passwordHash });
  console.log(`[seed-admin] Created admin account: ${EMAIL}`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("[seed-admin] Failed:", err.message);
  process.exit(1);
});
