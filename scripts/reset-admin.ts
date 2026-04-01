import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { adminAccounts } from "../shared/schema";
import { eq } from "drizzle-orm";

const EMAIL = "admin@me.com";
const PASSWORD = "1825Logan!";

async function resetAdmin() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const existing = await db
    .select({ id: adminAccounts.id })
    .from(adminAccounts)
    .where(eq(adminAccounts.email, EMAIL));

  if (existing.length > 0) {
    await db
      .update(adminAccounts)
      .set({ passwordHash })
      .where(eq(adminAccounts.email, EMAIL));
    console.log(`[reset-admin] Password reset for: ${EMAIL}`);
  } else {
    await db.insert(adminAccounts).values({ email: EMAIL, passwordHash });
    console.log(`[reset-admin] Created admin account: ${EMAIL}`);
  }

  process.exit(0);
}

resetAdmin().catch((err) => {
  console.error("[reset-admin] Failed:", err.message);
  process.exit(1);
});
