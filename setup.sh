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
DB_USER="appuser"
DB_NAME="appdb"
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

# Certbot (Let's Encrypt)
if ! command -v certbot &>/dev/null; then
    info "Installing Certbot..."
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

# ─── STEP 4 – Write .env file ─────────────────────────────────────────────────
step "4/8  Writing .env file"

SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")

# Only write if .env does not already exist (preserves existing API keys)
if [ -f "${APP_DIR}/.env" ]; then
    warn ".env already exists – skipping overwrite to preserve existing API keys."
    warn "Make sure DATABASE_URL and PORT are set correctly in .env."
else
    cat > "${APP_DIR}/.env" <<EOF
# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?sslmode=disable

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
step "5/8  Pushing database schema"
npm run db:push
success "Database schema is up to date."

# ─── STEP 6 – Build the application ──────────────────────────────────────────
step "6/8  Building the application"
npm run build
success "Build complete. Output: ${APP_DIR}/dist/"

# ─── STEP 7 – systemd service ─────────────────────────────────────────────────
step "7/8  Creating systemd service (${SERVICE_NAME})"

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

# ─── STEP 8 – SSL certificate via Certbot ────────────────────────────────────
step "8/8  Obtaining SSL certificate (Certbot)"

# Disable default nginx site to avoid conflicts during cert issuance
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
    info "Removed default nginx site."
fi

# Write a minimal HTTP-only config so certbot can complete the ACME challenge
NGINX_CERTBOT_TMP="/etc/nginx/sites-available/${SERVICE_NAME}-certbot-tmp"
sudo tee "${NGINX_CERTBOT_TMP}" > /dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    root /var/www/html;
    location /.well-known/acme-challenge/ { try_files \$uri =404; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF

sudo ln -sf "${NGINX_CERTBOT_TMP}" "/etc/nginx/sites-enabled/${SERVICE_NAME}-certbot-tmp"
sudo nginx -t && sudo systemctl reload nginx

# Obtain the certificate (skip if it already exists for this domain)
CERT_FOUND=false
for SUFFIX in "" "-0001" "-0002" "-0003"; do
    if [ -f "/etc/letsencrypt/live/${DOMAIN}${SUFFIX}/fullchain.pem" ]; then
        CERT_DIR="${DOMAIN}${SUFFIX}"
        CERT_FOUND=true
        info "Existing certificate found at /etc/letsencrypt/live/${CERT_DIR}/ – skipping certbot."
        break
    fi
done

if [ "$CERT_FOUND" = false ]; then
    info "Requesting SSL certificate for ${DOMAIN} and www.${DOMAIN}..."
    sudo certbot certonly \
        --webroot \
        --webroot-path /var/www/html \
        --non-interactive \
        --agree-tos \
        --register-unsafely-without-email \
        -d "${DOMAIN}" \
        -d "www.${DOMAIN}"

    # Detect the actual cert directory certbot created (base or -000x suffix)
    CERT_DIR=""
    for SUFFIX in "" "-0001" "-0002" "-0003"; do
        if [ -f "/etc/letsencrypt/live/${DOMAIN}${SUFFIX}/fullchain.pem" ]; then
            CERT_DIR="${DOMAIN}${SUFFIX}"
            break
        fi
    done

    [[ -z "$CERT_DIR" ]] && error "Certbot ran but certificate not found. Check: sudo certbot certificates"
    success "SSL certificate issued. Cert dir: /etc/letsencrypt/live/${CERT_DIR}/"
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
