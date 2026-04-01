# Phonebooth

A voice-based social networking application built with Node.js, Express, and React.

## Quick Start

```bash
# Install dependencies
npm install

# Complete setup (database + build)
npm run setup

# Start the application
npm start
```

## Admin Access

**Secure Authentication Required!**

- Admin Panel: `http://localhost:5050/admin`
- Authentication: Numeric keypad sequence `7764 OK 9348 OK`
- Session-based authentication (no passwords stored in database)

### Quick Access:

1. Go to `/admin` 
2. Enter sequence: `7 7 6 4 OK 9 3 4 8 OK`
3. Access granted to admin dashboard

## Setup Commands

```bash
npm install          # Install dependencies
npm run setup        # Database init + build
pm2 start dist/index.cjs --name phonebooth  # Start with PM2
pm2 save            # Save PM2 configuration
pm2 restart phonebooth # Restart Phonebooth
npm run dev          # Development mode
npm start            # Production mode
npm run db:init      # Initialize database only
npm run build        # Build application only
```

## Restarting the Application

**To restart Phonebooth:**
```bash
pm2 restart phonebooth
```

**To restart all PM2 processes:**
```bash
pm2 restart all
```

**To check status:**
```bash
pm2 status
```

## Environment

Copy `.env.example` to `.env` and configure:

```env
DATABASE_URL=postgresql://user:password@host/dbname
SESSION_SECRET=your-secret-key
```

## Features

- Voice-based social networking
- Real-time voice messaging
- Geographic matching
- Admin dashboard
- Payment integration
- Text-to-speech capabilities

## Documentation

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed setup instructions.
