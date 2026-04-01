#!/usr/bin/env bash
# =============================================================================
#  setup.sh  –  Full production VPS setup script
#
#  Usage:
#    bash setup.sh                        # uses default domain below
#    bash setup.sh yourdomain.com         # domain as argument
#
#  Requirements:
#    - Ubuntu 20.04 / 22.04 / 24.04 (or compatible Debian-based distro)
#    - Run as a non-root user with sudo privileges
#    - DNS for your domain must already point to this server's IP
# =============================================================================

set -euo pipefail

# ─── COLOUR HELPERS ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
# Internal port Node.js listens on (nginx proxies 80/443 → this port)
APP_PORT=5050

# PostgreSQL credentials — change DB_PASSWORD before first run
DB_USER="phonebooth_user"
DB_NAME="phonebooth_db"
DB_PASSWORD="changeme_strong_password_here"

# systemd service name
SERVICE_NAME="phonebooth"

# Absolute path to the app (wherever this script lives)
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
# ──────────────────────────────────────────────────────────────────────────────

# ─── DOMAIN NAME ──────────────────────────────────────────────────────────────
if [ -n "${1-}" ]; then
    DOMAIN="$1"
else
    DEFAULT_DOMAIN="assicrentals.com"
    read -rp "$(echo -e "${BOLD}Enter your domain name${RESET} [${DEFAULT_DOMAIN}]: ")" DOMAIN
    DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
fi

DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%/}"

[[ -z "$DOMAIN" ]] && error "Domain name cannot be empty."

echo ""
echo -e "${BOLD}=================================================${RESET}"
echo -e "  Phone Booth – Full Production Setup"
echo -e "  Domain    : ${CYAN}${DOMAIN}${RESET}"
echo -e "  App dir   : ${APP_DIR}"
echo -e "  App port  : ${APP_PORT} (internal, behind nginx)"
echo -e "${BOLD}=================================================${RESET}"
echo ""
read -rp "Continue? [y/N] " CONFIRM
[[ "${CONFIRM,,}" == "y" ]] || { echo "Aborted."; exit 0; }

# ─── STEP 1 – System packages ─────────────────────────────────────────────────
step "1/8  Installing system packages"

sudo apt-get update -qq

# Node.js 20.x via NodeSource if not already at the right major version
NODE_VER=$(node --version 2>/dev/null | grep -oP '(?<=v)\d+' || echo "0")
if (( NODE_VER < 20 )); then
    info "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -q
    sudo apt-get install -y nodejs -qq
else
    info "Node.js ${NODE_VER} already installed – skipping."
fi

# PostgreSQL
if ! command -v psql &>/dev/null; then
    info "Installing PostgreSQL..."
    sudo apt-get install -y postgresql postgresql-contrib -qq
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
else
    info "PostgreSQL already installed – skipping."
fi

# Nginx
if ! command -v nginx &>/dev/null; then
    info "Installing Nginx..."
    sudo apt-get install -y nginx -qq
    sudo systemctl enable nginx
    sudo systemctl start nginx
else
    info "Nginx already installed – skipping."
fi

# Certbot — needed for automatic renewal cron/timer even though cert already exists
if ! command -v certbot &>/dev/null; then
    info "Installing Certbot (for auto-renewal)..."
    sudo apt-get install -y certbot python3-certbot-nginx -qq
else
    info "Certbot already installed – skipping."
fi

success "System packages ready."

# ─── STEP 2 – Node.js dependencies ───────────────────────────────────────────
step "2/8  Installing Node.js dependencies"
cd "${APP_DIR}"
npm install
success "npm install complete."

# ─── STEP 3 – PostgreSQL user + database ─────────────────────────────────────
step "3/8  Setting up PostgreSQL database"

# Create role if it doesn't exist, then always sync the password
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
    | grep -q 1 \
    || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"

sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# Create database if it doesn't exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
    | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# Full privileges on the database and public schema (required for PostgreSQL 15+)
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"

success "PostgreSQL user '${DB_USER}' and database '${DB_NAME}' are ready."

# ─── STEP 4 – Write / update .env file ───────────────────────────────────────
step "4/9  Configuring .env file"

SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")
NEW_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?sslmode=disable"

if [ -f "${APP_DIR}/.env" ]; then
    info ".env already exists — updating DATABASE_URL, PORT and NODE_ENV (API keys preserved)."

    # Update DATABASE_URL if it exists, otherwise append it
    if grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${NEW_DB_URL}|" "${APP_DIR}/.env"
    else
        echo "DATABASE_URL=${NEW_DB_URL}" >> "${APP_DIR}/.env"
    fi

    # Update PORT
    if grep -q "^PORT=" "${APP_DIR}/.env"; then
        sed -i "s|^PORT=.*|PORT=${APP_PORT}|" "${APP_DIR}/.env"
    else
        echo "PORT=${APP_PORT}" >> "${APP_DIR}/.env"
    fi

    # Update NODE_ENV
    if grep -q "^NODE_ENV=" "${APP_DIR}/.env"; then
        sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" "${APP_DIR}/.env"
    else
        echo "NODE_ENV=production" >> "${APP_DIR}/.env"
    fi

    success ".env updated (DATABASE_URL → ${DB_NAME}, PORT → ${APP_PORT})."
else
    cat > "${APP_DIR}/.env" <<EOF
# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=${NEW_DB_URL}

# ─── App ──────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=${APP_PORT}

# ─── Session ──────────────────────────────────────────────────────────────────
SESSION_SECRET=${SESSION_SECRET}

# ─── Twilio (fill in before going live) ───────────────────────────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# ─── ElevenLabs (fill in before going live) ───────────────────────────────────
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# ─── Stripe (fill in before going live) ───────────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF
    success ".env written."
fi

# ─── STEP 5 – Push DB schema ──────────────────────────────────────────────────
step "5/9  Pushing database schema"
npm run db:push
success "Database schema is up to date."

# ─── STEP 6 – Seed/reset admin account ───────────────────────────────────────
step "6/9  Setting up admin account"
npx tsx scripts/reset-admin.ts
success "Admin account ready (password synced)."

# ─── STEP 7 – Build the application ──────────────────────────────────────────
step "7/9  Building the application"
npm run build
success "Build complete. Output: ${APP_DIR}/dist/"

# ─── STEP 8 – systemd service ─────────────────────────────────────────────────
step "8/9  Creating systemd service (${SERVICE_NAME})"

RUN_AS_USER="$(whoami)"

sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=Phone Booth – Node.js App
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
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

success "Service '${SERVICE_NAME}' enabled and started."
info  "  Status : sudo systemctl status ${SERVICE_NAME}"
info  "  Logs   : sudo journalctl -u ${SERVICE_NAME} -f"

# ─── STEP 9 – Nginx config + SSL ─────────────────────────────────────────────
step "9/9  Configuring Nginx with SSL"

# SSL certificate already issued by Certbot — use the known path
CERT_DIR="assicrentals.com-0001"
CERT_BASE="/etc/letsencrypt/live/${CERT_DIR}"

info "Using existing SSL certificate at ${CERT_BASE}/"

# Verify the cert files are actually there before writing the nginx config
[ -f "${CERT_BASE}/fullchain.pem" ] || error "Certificate not found at ${CERT_BASE}/fullchain.pem — check: sudo certbot certificates"
[ -f "${CERT_BASE}/privkey.pem"   ] || error "Certificate not found at ${CERT_BASE}/privkey.pem — check: sudo certbot certificates"
[ -f "${CERT_BASE}/chain.pem"     ] || error "Certificate not found at ${CERT_BASE}/chain.pem — check: sudo certbot certificates"

# Remove the default nginx site to prevent it intercepting requests
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
    info "Removed default nginx site."
fi

# ─── Deploy the full HTTPS nginx config ──────────────────────────────────────
NGINX_CONF_PATH="/etc/nginx/sites-available/${SERVICE_NAME}"

sudo tee "${NGINX_CONF_PATH}" > /dev/null <<EOF
# ─── HTTP → HTTPS redirect ────────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# ─── HTTPS server ─────────────────────────────────────────────────────────────
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    # SSL certificates
    ssl_certificate     /etc/letsencrypt/live/${CERT_DIR}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_DIR}/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/${CERT_DIR}/chain.pem;

    # Modern SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer-when-downgrade always;

    # Larger body for audio file uploads
    client_max_body_size 50M;

    # Twilio webhooks — /voice/* must respond within 15s
    location /voice/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 15s;
        proxy_connect_timeout 5s;
    }

    # REST API routes
    location /api/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
        proxy_connect_timeout 5s;
    }

    # Uploaded audio files — cache aggressively (immutable once stored)
    location /uploads/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    # React SPA + WebSocket support
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }

    # Logging
    access_log /var/log/nginx/voice_protocol_access.log;
    error_log  /var/log/nginx/voice_protocol_error.log warn;
}
EOF

# Enable the full HTTPS config and remove the temporary certbot config
sudo ln -sf "${NGINX_CONF_PATH}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
sudo rm -f "/etc/nginx/sites-enabled/${SERVICE_NAME}-certbot-tmp"
sudo rm -f "${NGINX_CERTBOT_TMP}"

# Enable automatic certificate renewal
sudo systemctl enable certbot.timer 2>/dev/null || true

sudo nginx -t
sudo systemctl reload nginx

success "Nginx configured with HTTPS and reloaded."

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}=================================================${RESET}"
echo -e "${BOLD}${GREEN}  Setup complete!${RESET}"
echo ""
echo -e "  ${BOLD}URL        :${RESET} ${CYAN}https://${DOMAIN}${RESET}"
echo -e "  ${BOLD}Cert dir   :${RESET} /etc/letsencrypt/live/${CERT_DIR}/"
echo -e "  ${BOLD}Database   :${RESET} ${DB_NAME}  (user: ${DB_USER})"
echo -e "  ${BOLD}App port   :${RESET} ${APP_PORT} (internal)"
echo -e "  ${BOLD}Service    :${RESET} ${SERVICE_NAME}"
echo ""
echo -e "  ${BOLD}Useful commands:${RESET}"
echo -e "    App status : sudo systemctl status ${SERVICE_NAME}"
echo -e "    App logs   : sudo journalctl -u ${SERVICE_NAME} -f"
echo -e "    Restart    : sudo systemctl restart ${SERVICE_NAME}"
echo -e "    Nginx logs : sudo tail -f /var/log/nginx/voice_protocol_error.log"
echo ""
echo -e "  ${BOLD}${YELLOW}Before going live, edit .env and fill in:${RESET}"
echo -e "    • TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER"
echo -e "    • ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID"
echo -e "    • STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
echo -e "  Then run: sudo systemctl restart ${SERVICE_NAME}"
echo -e "${BOLD}${GREEN}=================================================${RESET}"
echo ""
