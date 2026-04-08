# Environment Pollution Fix - Voice Application

## Problem Summary
The voice application was contributing to global environment variable pollution on the VPS server, causing database connection issues for other applications.

## Root Cause Identified
The voice application had `import { config } from "dotenv"` and `config()` calls in multiple files:
- `server/index.ts` 
- `server/db.ts`

These calls load environment variables globally at application start, contaminating the environment for all subsequent Node.js processes.

## Impact on Other Applications
- Malebox chat line application was connecting to wrong databases due to environment pollution
- API endpoints returning 500 errors due to incorrect database connections
- Environment variable conflicts between multiple applications

## Solution Applied

### 1. Removed Dotenv Loading from Multiple Files

**Modified `/opt/voice/server/index.ts`:**
```typescript
// Before:
import { config } from "dotenv";
config();
import express, { type Request, Response, NextFunction } from "express";

// After:
import express, { type Request, Response, NextFunction } from "express";
```

**Modified `/opt/voice/server/db.ts`:**
```typescript
// Before:
import { config } from "dotenv";
config();
import { drizzle } from "drizzle-orm/node-postgres";

// After:
import { drizzle } from "drizzle-orm/node-postgres";
```

### 2. Application Restart Required
After the fix, the application needs to be restarted to clear the polluted environment variables.

## Prevention Measures

### For Future Development:
1. **Never use `config()` from dotenv in application code**
2. **Use application-specific environment loading** within the application code
3. **Load environment variables explicitly** when needed
4. **Consider using explicit environment variable setting** in systemd services

### Recommended Environment Loading:
```typescript
// Instead of: import { config } from "dotenv"; config();
// Use explicit loading within the application:
import { config } from "dotenv";
config({ path: '/path/to/.env' }); // Explicit path
```

### Or Better Yet - Use Systemd EnvironmentFile:
```ini
[Service]
EnvironmentFile=/path/to/.env
ExecStart=/usr/bin/node dist/index.cjs
```

## Verification
After the fix:
- Voice application continues to run normally
- Other applications can use their own environment variables without interference
- Malebox chat line application can connect to its correct database

## Files Modified
- `/opt/voice/server/index.ts` - Removed dotenv import and config call
- `/opt/voice/server/db.ts` - Removed dotenv import and config call

## Notes for System Administrators
- Always check for `config()` from dotenv in Node.js applications
- Use `ps aux` and `cat /proc/[PID]/environ` to debug environment variable issues
- Consider using Docker containers for better application isolation in production

## Impact on Git Repository
This fix involves modifying the application source code. The changes are minimal and remove problematic dotenv calls that were causing system-wide environment pollution.
