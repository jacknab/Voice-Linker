#!/usr/bin/env bash
# =============================================================================
#  setup.sh  –  Full production VPS setup
#
#  Usage:
#    bash setup.sh              # prompts for domain (defaults to assicrentals.com)
#    bash setup.sh mydomain.com # domain as argument
#
#  Requirements:
#    - Ubuntu 20.04 / 22.04 / 24.04
#    - Non-root user with sudo privileges
#    - DNS A records for the domain already pointing at this server
# =============================================================================

set -euo pipefail

# ─── COLOUR HELPERS ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}━━━  $*  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
APP_PORT=5050                           # internal Node.js port (nginx proxies to this)
DB_USER="phonebooth_user"              # PostgreSQL role
DB_NAME="phonebooth_db"                # PostgreSQL database
DB_PASSWORD="1825Logan305"
SERVICE_NAME="phonebooth"              # systemd service name
CERT_DIR="assicrentals.com-0001"       # Let's Encrypt cert folder (already issued)
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
# ──────────────────────────────────────────────────────────────────────────────

# ─── DOMAIN ───────────────────────────────────────────────────────────────────
if [ -n "${1-}" ]; then
    DOMAIN="$1"
else
    read -rp "$(echo -e "${BOLD}Domain name${RESET} [assicrentals.com]: ")" DOMAIN
    DOMAIN="${DOMAIN:-assicrentals.com}"
fi
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
[[ -z "$DOMAIN" ]] && error "Domain name cannot be empty."

# ─── CONFIRM ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=================================================${RESET}"
echo -e "  Phone Booth – Production Setup"
echo -e "  Domain   : ${CYAN}${DOMAIN}${RESET}"
echo -e "  Database : ${DB_NAME}  (user: ${DB_USER})"
echo -e "  App port : ${APP_PORT} (internal)"
echo -e "  App dir  : ${APP_DIR}"
echo -e "${BOLD}=================================================${RESET}"
echo ""
read -rp "Continue? [y/N] " CONFIRM
[[ "${CONFIRM,,}" == "y" ]] || { echo "Aborted."; exit 0; }

# ═══════════════════════════════════════════════════════════════════════════════
step "1/9  System packages"
# ═══════════════════════════════════════════════════════════════════════════════
sudo apt-get update -qq

# Node.js 20.x
NODE_VER=$(node --version 2>/dev/null | grep -oP '(?<=v)\d+' || echo "0")
if (( NODE_VER < 20 )); then
    info "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -q
    sudo apt-get install -y nodejs -qq
else
    info "Node.js ${NODE_VER} already present – skipping."
fi

# PostgreSQL
if ! command -v psql &>/dev/null; then
    info "Installing PostgreSQL..."
    sudo apt-get install -y postgresql postgresql-contrib -qq
    sudo systemctl enable postgresql --now
else
    info "PostgreSQL already present – skipping."
fi

# Nginx
if ! command -v nginx &>/dev/null; then
    info "Installing Nginx..."
    sudo apt-get install -y nginx -qq
    sudo systemctl enable nginx --now
else
    info "Nginx already present – skipping."
fi

# Certbot (for auto-renewal of existing certificate)
if ! command -v certbot &>/dev/null; then
    info "Installing Certbot..."
    sudo apt-get install -y certbot python3-certbot-nginx -qq
else
    info "Certbot already present – skipping."
fi

success "System packages ready."

# ═══════════════════════════════════════════════════════════════════════════════
step "2/9  Node.js dependencies"
# ═══════════════════════════════════════════════════════════════════════════════
cd "${APP_DIR}"
npm install
success "npm install complete."

# ═══════════════════════════════════════════════════════════════════════════════
step "3/9  PostgreSQL – user, database, permissions"
# ═══════════════════════════════════════════════════════════════════════════════

# Create role if missing, always sync password
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
    | grep -q 1 \
    || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# Create database if missing
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
    | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# Privileges (PostgreSQL 15+ requires explicit schema grant)
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"

success "Database '${DB_NAME}' and user '${DB_USER}' are ready."

# ═══════════════════════════════════════════════════════════════════════════════
step "4/9  .env file"
# ═══════════════════════════════════════════════════════════════════════════════
NEW_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?sslmode=disable"

if [ -f "${APP_DIR}/.env" ]; then
    info ".env exists — updating DB credentials and port, preserving API keys."

    _upsert_env() {
        local key="$1" val="$2" file="${APP_DIR}/.env"
        if grep -q "^${key}=" "${file}"; then
            sed -i "s|^${key}=.*|${key}=${val}|" "${file}"
        else
            echo "${key}=${val}" >> "${file}"
        fi
    }

    _upsert_env "DATABASE_URL" "${NEW_DB_URL}"
    _upsert_env "PORT"         "${APP_PORT}"
    _upsert_env "NODE_ENV"     "production"

    success ".env updated — DATABASE_URL now points to ${DB_NAME}."
else
    SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")
    cat > "${APP_DIR}/.env" <<EOF
# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=${NEW_DB_URL}

# ─── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=${APP_PORT}

# ─── Session ─────────────────────────────────────────────────────────────────
SESSION_SECRET=${SESSION_SECRET}

# ─── Twilio ──────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# ─── ElevenLabs ──────────────────────────────────────────────────────────────
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# ─── Stripe ──────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF
    success ".env written."
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "5/9  Database schema (drizzle-kit push)"
# ═══════════════════════════════════════════════════════════════════════════════
npm run db:push
success "Schema pushed."

# ═══════════════════════════════════════════════════════════════════════════════
step "6/9  Admin account"
# ═══════════════════════════════════════════════════════════════════════════════
# reset-admin.ts creates the account if missing, resets the password if it exists
npx tsx scripts/reset-admin.ts
success "Admin account ready."

# ═══════════════════════════════════════════════════════════════════════════════
step "7/9  Build"
# ═══════════════════════════════════════════════════════════════════════════════
npm run build
success "Build complete → ${APP_DIR}/dist/"

# ═══════════════════════════════════════════════════════════════════════════════
step "8/9  systemd service (${SERVICE_NAME})"
# ═══════════════════════════════════════════════════════════════════════════════
RUN_AS_USER="$(whoami)"

sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=Phone Booth – Node.js
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

# ═══════════════════════════════════════════════════════════════════════════════
step "9/9  Nginx + SSL"
# ═══════════════════════════════════════════════════════════════════════════════

# Verify the SSL cert (already issued by certbot) is in place
CERT_BASE="/etc/letsencrypt/live/${CERT_DIR}"
for CERT_FILE in fullchain.pem privkey.pem chain.pem; do
    [ -f "${CERT_BASE}/${CERT_FILE}" ] \
        || error "SSL cert missing: ${CERT_BASE}/${CERT_FILE}  — run: sudo certbot certificates"
done
info "SSL certificate verified at ${CERT_BASE}/"

# Remove default site so it does not intercept requests
[ -L /etc/nginx/sites-enabled/default ] && sudo rm -f /etc/nginx/sites-enabled/default && info "Removed default nginx site."

# Write nginx site config
NGINX_SITE="/etc/nginx/sites-available/${SERVICE_NAME}"
sudo tee "${NGINX_SITE}" > /dev/null <<NGINXEOF
# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${CERT_DIR}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_DIR}/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/${CERT_DIR}/chain.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer-when-downgrade always;

    client_max_body_size 50M;

    # Twilio webhooks
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

    # API
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

    # Audio uploads (cached)
    location /uploads/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    # React SPA + WebSocket
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

    access_log /var/log/nginx/phonebooth_access.log;
    error_log  /var/log/nginx/phonebooth_error.log warn;
}
NGINXEOF

# Enable site
sudo ln -sf "${NGINX_SITE}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"

# Test and reload
sudo nginx -t
sudo systemctl reload nginx

# Enable cert auto-renewal
sudo systemctl enable certbot.timer 2>/dev/null || true

success "Nginx configured and reloaded."

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}=================================================${RESET}"
echo -e "${BOLD}${GREEN}  All done!${RESET}"
echo ""
echo -e "  ${BOLD}Site       :${RESET} ${CYAN}https://${DOMAIN}${RESET}"
echo -e "  ${BOLD}Admin      :${RESET} https://${DOMAIN}/admin/login"
echo -e "  ${BOLD}Database   :${RESET} ${DB_NAME} (user: ${DB_USER})"
echo -e "  ${BOLD}Service    :${RESET} ${SERVICE_NAME}"
echo ""
echo -e "  ${BOLD}Useful commands:${RESET}"
echo -e "    Logs    : sudo journalctl -u ${SERVICE_NAME} -f"
echo -e "    Restart : sudo systemctl restart ${SERVICE_NAME}"
echo -e "    Nginx   : sudo tail -f /var/log/nginx/phonebooth_error.log"
echo ""
echo -e "  ${BOLD}${YELLOW}Fill in your API keys in .env then restart the service:${RESET}"
echo -e "    TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER"
echo -e "    ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID"
echo -e "    STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
echo -e ""
echo -e "    sudo systemctl restart ${SERVICE_NAME}"
echo -e "${BOLD}${GREEN}=================================================${RESET}"
echo ""
