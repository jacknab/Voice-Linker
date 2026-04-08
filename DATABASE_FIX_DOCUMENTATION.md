# Database Fix Documentation - Malebox Chat Line Application

## Problem Summary
The malebox.net chat line application was failing to start due to database connection issues and missing database tables. The application was connecting to the wrong database and had permission issues.

## Root Causes Identified
1. **Wrong Database Connection**: Application was connecting to `polish_ai` database instead of the correct chat line database
2. **Missing Database Tables**: The correct database was empty and missing required tables like `active_calls`, `users`, etc.
3. **Database Permission Issues**: The database user didn't have proper permissions to create tables
4. **Environment Variable Caching**: The DATABASE_URL environment variable was cached/stuck to the old database

## Solution Steps Applied

### 1. Created New Database
```bash
sudo -u postgres createdb malebox_chatline
```

### 2. Set Database User Permissions
```bash
sudo -u postgres psql -c "ALTER USER phonebooth_user PASSWORD '1825Logan305!';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE malebox_chatline TO phonebooth_user;"
sudo -u postgres psql -d malebox_chatline -c "GRANT ALL ON SCHEMA public TO phonebooth_user;"
sudo -u postgres psql -d malebox_chatline -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO phonebooth_user;"
```

### 3. Updated Environment Configuration
Created/updated `.env` file with correct database URL:
```
DATABASE_URL=postgresql://phonebooth_user:1825Logan305!@localhost:5432/malebox_chatline
```

### 4. Pushed Database Schema
Used explicit DATABASE_URL to override any cached environment variables:
```bash
DATABASE_URL="postgresql://phonebooth_user:1825Logan305!@localhost:5432/malebox_chatline" npm run db:push
```

### 5. Killed Old Process and Restarted Application
```bash
pkill -f "node dist/index.cjs"
DATABASE_URL="postgresql://phonebooth_user:1825Logan305!@localhost:5432/malebox_chatline" npm run start
```

## Key Files Modified
- `.env` - Updated with correct database URL
- `server/routes.ts` - Fixed ivr-default import issue
- `script/build.ts` - Updated build process

## Verification
- Application now runs on port 5000 (as configured)
- All required database tables created successfully
- No more database connection errors
- Website accessible at https://malebox.net

## Prevention Measures
To prevent this issue in the future:
1. Always verify database connection before running db:push
2. Use explicit DATABASE_URL when running database commands
3. Ensure proper database permissions are set
4. Kill old processes before restarting with new database configuration

## Database Schema Created
The following tables were successfully created:
- active_calls
- audit_logs  
- blocked_users
- call_logs
- flagged_content
- mailboxes
- membership_cards
- membership_link_codes
- membership_settings
- messages
- moderation_logs
- profiles
- promo_codes
- promo_redemptions
- region_links
- regions
- seed_sessions
- site_settings
- users
- web_user_alt_phones
- web_users
- zip_codes

## Notes for Replit AI
If encountering similar issues:
1. Check what database the application is actually connecting to (use `ps aux | grep node`)
2. Verify DATABASE_URL is being read correctly from .env
3. Use explicit DATABASE_URL environment variable when running database commands
4. Ensure database user has proper permissions for the target database
5. Kill any running processes before restarting with new configuration
