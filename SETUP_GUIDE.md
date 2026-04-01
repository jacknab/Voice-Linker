# Phonebooth Setup Guide

This guide will help you set up the Phonebooth application from scratch.

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- npm or yarn

## Quick Setup (Recommended)

For new installations, run the automated setup script:

```bash
# Clone and navigate to the project
cd phonebooth

# Install dependencies
npm install

# Run complete setup (database + build)
npm run setup

# Start with PM2 (production)
pm2 start dist/index.cjs --name phonebooth

# Save PM2 configuration
pm2 save
```

## Manual Setup

If you prefer to set up manually:

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=disable
SESSION_SECRET=your-secret-key-here
```

### 3. Database Setup

#### Option A: Automated Database Initialization

```bash
npm run db:init
```

This will create all database tables using Drizzle.

#### Option B: Manual Database Setup

```bash
# Create database tables
npm run db:push
```

### 4. Build the Application

```bash
npm run build
```

### 5. Start the Application

#### Option A: Using PM2 (Recommended for Production)

```bash
# Start with PM2
pm2 start dist/index.cjs --name phonebooth

# Save PM2 configuration
pm2 save

# Restart Phonebooth
pm2 restart phonebooth

# Stop Phonebooth
pm2 stop phonebooth

# Check status
pm2 status
```

#### Option B: Direct Start (Development)

```bash
# Development mode
npm run dev

# Production mode
npm start
```

### PM2 Management Commands

```bash
pm2 restart phonebooth    # Restart Phonebooth application
pm2 restart all          # Restart all PM2 processes
pm2 status               # Check all process status
pm2 logs phonebooth      # View Phonebooth logs
pm2 stop phonebooth     # Stop Phonebooth
pm2 delete phonebooth   # Remove from PM2 list
```

## Admin Access

**Secure Authentication Required!**

The admin panel is protected by a secure numeric keypad authentication:

- **URL**: `http://localhost:5050/admin`
- **Authentication**: Numeric keypad sequence
- **Required Sequence**: `7764 OK 9348 OK`
- **Access**: Enter the sequence on the numeric keypad to gain access

### Authentication Details:

1. Visit `/admin` to access the secure login page
2. Use the on-screen numeric keypad to enter: `7 7 6 4 OK 9 3 4 8 OK`
3. If correct, you'll be redirected to the admin dashboard
4. Session remains active until you logout or close the browser

### Security Features:

- No username/password required
- Secure numeric sequence authentication
- Session-based authentication
- Automatic logout on session expiry
- No credentials stored in database

## Environment Variables

Key environment variables to configure:

```env
# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=disable

# Session
SESSION_SECRET=your-secret-key-here

# Twilio (for voice features)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=your-twilio-number

# ElevenLabs (for text-to-speech)
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=your-voice-id

# Stripe (for payments)
STRIPE_SECRET_KEY=your-stripe-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret
```

## Database Schema

The application uses the following main tables:

- `users` - Customer accounts
- `profiles` - Voice profiles
- `messages` - Voice messages
- `regions` - Geographic regions
- `call_logs` - Call history
- And more...

## Troubleshooting

### Database Connection Issues

1. Verify PostgreSQL is running
2. Check DATABASE_URL format
3. Ensure database exists
4. Verify user permissions

### Admin Access Issues

If you're having trouble accessing the admin panel:

1. **Authentication Required**: Make sure you're entering the correct sequence: `7764 OK 9348 OK`
2. **Clear Session**: Clear browser storage and try again
3. **Direct Access**: You can also access the secure login page directly at `/admin/secure-login`
4. **Check Sequence**: Ensure you're entering the numbers in the correct order with OK between the two parts
5. **Browser Issues**: Try a different browser or clear cache

### Port Conflicts

- Default port: 5050
- Change with PORT environment variable: `PORT=3000 npm start`

## Production Deployment

For production deployment:

1. Set NODE_ENV=production
2. Configure all environment variables
3. Use process manager (PM2, systemd)
4. Set up SSL/HTTPS
5. Configure reverse proxy (nginx)

## Development

For development:

```bash
# Start development server with hot reload
npm run dev

# Type checking
npm run check

# Database operations
npm run db:push    # Push schema changes
npm run db:init    # Initialize database
```

## Support

For issues:

1. Check this guide first
2. Review logs for error messages
3. Verify environment configuration
4. Check database connectivity
