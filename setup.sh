#!/usr/bin/env bash
# =============================================================================
#  setup.sh  –  VPS first-run setup script
#  Run as a user that has sudo privileges.
# =============================================================================

set -euo pipefail

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
# Set the password you want to use for the database user below.
DB_PASSWORD="changeme_strong_password_here"

# These are created automatically – do not change unless you have a reason to.
DB_USER="appuser"
DB_NAME="appdb"
APP_PORT=5050
# ──────────────────────────────────────────────────────────────────────────────

echo ""
echo "================================================="
echo "  App Setup Script"
echo "================================================="
echo ""

# ─── 1. Install Node dependencies (fixes missing tsx and everything else) ─────
echo "[1/5] Installing Node.js dependencies..."
npm install
echo "      Done."
echo ""

# ─── 2. Create PostgreSQL user and database ───────────────────────────────────
echo "[2/5] Setting up PostgreSQL database..."

# Create the role (user) if it does not already exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"

# Update the password in case the role already existed
sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# Create the database if it does not already exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# Grant full privileges on the database to the user
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo "      PostgreSQL user  : ${DB_USER}"
echo "      PostgreSQL db    : ${DB_NAME}"
echo "      Done."
echo ""

# ─── 3. Write the .env file ───────────────────────────────────────────────────
echo "[3/5] Writing .env file..."

cat > .env <<EOF
# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?sslmode=disable

# ─── App ──────────────────────────────────────────────────────────────────────
PORT=${APP_PORT}

# ─── Session ──────────────────────────────────────────────────────────────────
# IMPORTANT: Replace this with a long random string before going to production.
SESSION_SECRET=change-me-to-a-long-random-string

# ─── Third-party API keys (fill in as needed) ─────────────────────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF

echo "      .env written with port ${APP_PORT} and database credentials."
echo ""

# ─── 4. Push the database schema ──────────────────────────────────────────────
echo "[4/5] Pushing database schema (drizzle-kit push)..."
npm run db:push
echo "      Done."
echo ""

# ─── 5. Build the application ─────────────────────────────────────────────────
echo "[5/5] Building the application..."
npm run build
echo "      Done."
echo ""

echo "================================================="
echo "  Setup complete!"
echo ""
echo "  Database : ${DB_NAME}"
echo "  DB User  : ${DB_USER}"
echo "  App Port : ${APP_PORT}"
echo ""
echo "  Start the app with:"
echo "    node ./dist/index.cjs"
echo ""
echo "  Or for development:"
echo "    npm run dev"
echo "================================================="
echo ""
