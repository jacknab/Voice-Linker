#!/usr/bin/env bash
# =============================================================================
#  setup.sh  –  VPS full setup script
#  Run as a user that has sudo privileges.
#  Usage:  bash setup.sh
# =============================================================================

set -euo pipefail

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
# The password for the PostgreSQL application user.
DB_PASSWORD="changeme_strong_password_here"

# Port the Node.js app will listen on (internal, behind nginx).
APP_PORT=5050

# The public domain/IP nginx will listen on.
# Change this to your actual domain name or server IP address.
SERVER_NAME="_"

# These are created automatically – change only if you need to.
DB_USER="appuser"
DB_NAME="appdb"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="ivr-app"
# ──────────────────────────────────────────────────────────────────────────────

echo ""
echo "================================================="
echo "  Full VPS Setup Script"
echo "  App directory: ${APP_DIR}"
echo "================================================="
echo ""

# ─── 1. Node.js dependencies ──────────────────────────────────────────────────
echo "[1/7] Installing Node.js dependencies..."
cd "${APP_DIR}"
npm install
echo "      Done."
echo ""

# ─── 2. PostgreSQL: user + database ──────────────────────────────────────────
echo "[2/7] Setting up PostgreSQL database..."

# Create role if it does not exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"

# Always sync the password (handles the already-exists case)
sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# Create database if it does not exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# Grant full privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

# Also grant privileges on the public schema (needed for newer PostgreSQL)
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"

echo "      PostgreSQL user  : ${DB_USER}"
echo "      PostgreSQL db    : ${DB_NAME}"
echo "      Done."
echo ""

# ─── 3. Write the .env file ───────────────────────────────────────────────────
echo "[3/7] Writing .env file..."

# Generate a random session secret if openssl is available
SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-to-a-long-random-string-$(date +%s)")

cat > "${APP_DIR}/.env" <<EOF
# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?sslmode=disable

# ─── App ──────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=${APP_PORT}

# ─── Session ──────────────────────────────────────────────────────────────────
SESSION_SECRET=${SESSION_SECRET}

# ─── Third-party API keys (fill in before going live) ─────────────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF

echo "      .env written (PORT=${APP_PORT}, NODE_ENV=production)."
echo ""

# ─── 4. Push the database schema ──────────────────────────────────────────────
echo "[4/7] Pushing database schema (drizzle-kit push)..."
npm run db:push
echo "      Done."
echo ""

# ─── 5. Build the application ─────────────────────────────────────────────────
echo "[5/7] Building the application (npm run build)..."
npm run build
echo "      Done."
echo ""

# ─── 6. Create and enable a systemd service ───────────────────────────────────
echo "[6/7] Creating systemd service (${SERVICE_NAME})..."

# Detect the user running this script so the service runs as the same user
RUN_AS_USER="$(whoami)"

sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=IVR App – Node.js
After=network.target postgresql.service

[Service]
Type=simple
User=${RUN_AS_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=$(which node) ${APP_DIR}/dist/index.cjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

echo "      Service '${SERVICE_NAME}' enabled and started."
echo "      Check status: sudo systemctl status ${SERVICE_NAME}"
echo "      View logs:    sudo journalctl -u ${SERVICE_NAME} -f"
echo ""

# ─── 7. Configure nginx as a reverse proxy ────────────────────────────────────
echo "[7/7] Configuring nginx reverse proxy..."

sudo tee /etc/nginx/sites-available/${SERVICE_NAME} > /dev/null <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    # Increase body size limit for audio file uploads
    client_max_body_size 50M;

    # Proxy all requests to the Node.js app.
    # This includes /admin and all other client-side routes –
    # Express handles the SPA catch-all and returns index.html.
    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;

        # WebSocket support (needed for development hot-reload, harmless in prod)
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";

        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
EOF

# Enable the site (remove default if it exists to avoid conflicts)
sudo ln -sf /etc/nginx/sites-available/${SERVICE_NAME} /etc/nginx/sites-enabled/${SERVICE_NAME}

# Disable the default nginx site if it exists (it would intercept requests)
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
    echo "      Removed default nginx site (it was intercepting requests)."
fi

# Test nginx config before reloading
sudo nginx -t
sudo systemctl reload nginx

echo "      Nginx configured and reloaded."
echo "      All requests (including /admin) are proxied to port ${APP_PORT}."
echo ""

# ─── Done ─────────────────────────────────────────────────────────────────────
echo "================================================="
echo "  Setup complete!"
echo ""
echo "  Database   : ${DB_NAME}"
echo "  DB User    : ${DB_USER}"
echo "  App Port   : ${APP_PORT} (internal, behind nginx)"
echo "  Public     : http://${SERVER_NAME} (nginx on port 80)"
echo ""
echo "  Useful commands:"
echo "    Check app status : sudo systemctl status ${SERVICE_NAME}"
echo "    View app logs    : sudo journalctl -u ${SERVICE_NAME} -f"
echo "    Restart app      : sudo systemctl restart ${SERVICE_NAME}"
echo "    Reload nginx     : sudo systemctl reload nginx"
echo ""
echo "  IMPORTANT – before going live:"
echo "    1. Edit .env and fill in your Twilio / ElevenLabs / Stripe keys."
echo "    2. Change SERVER_NAME at the top of this script to your domain"
echo "       and re-run step 7 (or update the nginx config manually)."
echo "    3. Use certbot to add HTTPS:  sudo certbot --nginx -d yourdomain.com"
echo "    4. Change DB_PASSWORD at the top of this script before the first run."
echo "================================================="
echo ""
