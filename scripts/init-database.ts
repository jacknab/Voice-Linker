#!/usr/bin/env tsx

/**
 * Database Initialization Script
 * 
 * This script initializes the database with all required tables.
 * Note: Authentication has been removed - no admin account needed.
 */

import { config } from "dotenv";
config();

async function initDatabase() {
  console.log("🚀 Initializing database...");
  
  try {
    // Step 1: Push database schema (creates all tables)
    console.log("📋 Step 1: Creating database tables...");
    const { execSync } = await import("child_process");
    execSync("npm run db:push", { stdio: "inherit" });
    
    console.log("\n🎉 Database initialization completed successfully!");
    console.log("\n🌐 Admin panel is accessible without authentication at: /admin");
    
  } catch (error: any) {
    console.error("❌ Database initialization failed:", error.message);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase();
}

export { initDatabase };
