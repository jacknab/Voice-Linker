#!/usr/bin/env bash
# =============================================================================
#  setup.sh  –  Full production VPS setup for Phone Booth
#
#  Usage:
#    bash setup.sh              # prompts for domain
#    bash setup.sh mydomain.com # domain as argument (still prompts to confirm)
#    bash setup.sh mydomain.com --yes  # fully unattended / no prompts
#
#  Requirements:
#    - Ubuntu 20.04 / 22.04 / 24.04  (amd64 or arm64)
#    - Non-root user with sudo privileges  (e.g. adduser deploy; usermod -aG sudo deploy)
#    - DNS A record for the domain already pointing at this server's IP
#    - SSL certificate already issued via certbot before running step 10
#      (or obtained afterwards; nginx SSL config is skipped with a helpful hint)
# =============================================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive   # suppress interactive apt prompts

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
SERVICE_NAME="phonebooth"              # systemd service name
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── DB password: reuse from existing .env, or generate a fresh one ────────────
DB_PASSWORD=""
if [ -f "${APP_DIR}/.env" ] && grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
    EXISTING_URL=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | cut -d= -f2-)
    DB_PASSWORD=$(echo "${EXISTING_URL}" | grep -oP '(?<=:)[^@]+(?=@)' || true)
fi
if [ -z "${DB_PASSWORD:-}" ]; then
    DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)
fi
# ──────────────────────────────────────────────────────────────────────────────

# ─── ARGUMENT PARSING ─────────────────────────────────────────────────────────
AUTO_YES=false
DOMAIN=""
for ARG in "$@"; do
    case "$ARG" in
        --yes|-y) AUTO_YES=true ;;
        *)        [[ -z "$DOMAIN" ]] && DOMAIN="$ARG" ;;
    esac
done

if [ -z "$DOMAIN" ]; then
    read -rp "$(echo -e "${BOLD}Domain name${RESET} [example.com]: ")" DOMAIN
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
if [ "$AUTO_YES" = false ]; then
    read -rp "Continue? [y/N] " CONFIRM
    [[ "${CONFIRM,,}" == "y" ]] || { echo "Aborted."; exit 0; }
else
    info "Auto-confirming (--yes flag set)."
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "1/10  Swap space"
# ═══════════════════════════════════════════════════════════════════════════════
#
#  npm install and the production build can use 500 MB–1 GB of RAM on a clean
#  run.  VPS plans with 1–2 GB RAM will OOM-kill the process without swap.
#  We create a 2 GB swap file if the server has less than 512 MB of swap.
#
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if (( SWAP_MB < 512 )); then
    info "Swap: ${SWAP_MB} MB detected — creating a 2 GB swap file..."
    if [ -f /swapfile ]; then
        sudo swapoff /swapfile 2>/dev/null || true
        sudo rm -f /swapfile
    fi
    # fallocate is instant; dd is the fallback for filesystems that don't support it
    sudo fallocate -l 2G /swapfile 2>/dev/null \
        || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile -q
    sudo swapon /swapfile
    # Make permanent across reboots
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    fi
    # Reduce swappiness (default 60 is too aggressive for a server)
    echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf > /dev/null
    sudo sysctl -p /etc/sysctl.d/99-swappiness.conf -q
    success "2 GB swap file created and enabled."
else
    info "Swap already configured (${SWAP_MB} MB) — skipping."
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "2/10  System packages"
# ═══════════════════════════════════════════════════════════════════════════════
sudo apt-get update -qq
sudo apt-get install -y -qq \
    curl wget git openssl ca-certificates gnupg lsb-release \
    build-essential python3 \
    ufw fail2ban \
    unattended-upgrades apt-listchanges

# ── Node.js 20.x ──────────────────────────────────────────────────────────────
#  Some npm packages (e.g. bcrypt) compile native add-ons; build-essential
#  (gcc, make, g++) is required for those to install correctly.
NODE_VER=$(node --version 2>/dev/null | grep -oP '(?<=v)\d+' || echo "0")
if (( NODE_VER < 20 )); then
    info "Node.js ${NODE_VER} found — upgrading to 20.x LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -q
    sudo apt-get install -y nodejs -qq
    NODE_VER=$(node --version | grep -oP '(?<=v)\d+')
    success "Node.js $(node --version) installed."
else
    info "Node.js $(node --version) already present — skipping."
fi

# ── PostgreSQL ─────────────────────────────────────────────────────────────────
#
#  Detection strategy:
#    1. Check dpkg for any installed postgresql-XX package to get the version.
#    2. If not installed → install postgresql + postgresql-contrib.
#    3. Determine the correct systemd service name (version-specific on Ubuntu).
#    4. Ensure the service is enabled and running.
#    5. Wait up to 30 s for pg_isready before proceeding.
#    6. Verify pg_hba.conf allows TCP password auth on 127.0.0.1 — the method
#       the app uses.  Patch it to md5 if it is set to peer/ident/trust.
#
PG_VERSION=$(dpkg -l 'postgresql-[0-9]*' 2>/dev/null \
    | awk '/^ii/{print $2}' \
    | grep -oP '(?<=postgresql-)\d+' \
    | sort -n | tail -1 || true)

if [[ -z "$PG_VERSION" ]]; then
    info "PostgreSQL not found — installing..."
    sudo apt-get install -y postgresql postgresql-contrib -qq
    PG_VERSION=$(dpkg -l 'postgresql-[0-9]*' 2>/dev/null \
        | awk '/^ii/{print $2}' \
        | grep -oP '(?<=postgresql-)\d+' \
        | sort -n | tail -1 || true)
    [[ -z "$PG_VERSION" ]] && error "PostgreSQL installation failed — version not detected."
    success "PostgreSQL ${PG_VERSION} installed."
else
    info "PostgreSQL ${PG_VERSION} already installed."
fi

# ── PostgreSQL service ─────────────────────────────────────────────────────────
PG_SERVICE="postgresql"
if sudo systemctl list-units --type=service --all 2>/dev/null \
        | grep -q "postgresql@${PG_VERSION}-main.service"; then
    PG_SERVICE="postgresql@${PG_VERSION}-main"
fi

if ! sudo systemctl is-active --quiet "${PG_SERVICE}" 2>/dev/null; then
    info "Starting PostgreSQL service (${PG_SERVICE})..."
    sudo systemctl enable "${PG_SERVICE}" --now
    sleep 2
else
    info "PostgreSQL service (${PG_SERVICE}) is already running."
fi

# Wait for PostgreSQL to be ready
info "Waiting for PostgreSQL to accept connections..."
PG_WAIT_MAX=30; PG_WAITED=0
until sudo -u postgres pg_isready -q 2>/dev/null; do
    sleep 1
    PG_WAITED=$((PG_WAITED + 1))
    (( PG_WAITED >= PG_WAIT_MAX )) && \
        error "PostgreSQL did not become ready within ${PG_WAIT_MAX}s — check: sudo journalctl -u ${PG_SERVICE}"
done
success "PostgreSQL ${PG_VERSION} is running and accepting connections."

# ── pg_hba.conf — ensure TCP password auth works ──────────────────────────────
PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"
if [[ -f "$PG_HBA" ]]; then
    PATCHED=false
    # Replace "trust" on host lines (insecure)
    if sudo grep -qP '^host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+trust' "$PG_HBA" 2>/dev/null; then
        info "pg_hba.conf: patching 'trust' → 'md5' for TCP connections..."
        sudo sed -i -E \
            's/^(host\s+all\s+all\s+(127\.0\.0\.1\/32|::1\/128)\s+)trust$/\1md5/' \
            "$PG_HBA"
        PATCHED=true
    fi
    # Add explicit host entry if no 127.0.0.1 line exists at all
    if ! sudo grep -qP '^host\s+all\s+all\s+127\.0\.0\.1/32' "$PG_HBA" 2>/dev/null; then
        info "pg_hba.conf: adding host md5 entry for 127.0.0.1..."
        echo "host    all             all             127.0.0.1/32            md5" \
            | sudo tee -a "$PG_HBA" > /dev/null
        PATCHED=true
    fi
    if [ "$PATCHED" = true ]; then
        sudo systemctl reload "${PG_SERVICE}" 2>/dev/null \
            || sudo systemctl restart "${PG_SERVICE}"
        until sudo -u postgres pg_isready -q 2>/dev/null; do sleep 1; done
        success "pg_hba.conf updated and PostgreSQL reloaded."
    else
        info "pg_hba.conf already configured correctly."
    fi
else
    warn "pg_hba.conf not found at ${PG_HBA} — skipping auth configuration."
fi

# ── Nginx ──────────────────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
    info "Installing Nginx..."
    sudo apt-get install -y nginx -qq
    sudo systemctl enable nginx --now
    success "Nginx installed and started."
else
    info "Nginx $(nginx -v 2>&1 | grep -oP '[\d.]+') already present — skipping."
fi

# ── Certbot (Let's Encrypt SSL) ───────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
    info "Installing Certbot..."
    sudo apt-get install -y certbot python3-certbot-nginx -qq
    success "Certbot installed."
else
    info "Certbot already present — skipping."
fi

success "All system packages ready."

# ═══════════════════════════════════════════════════════════════════════════════
step "3/10  Firewall (UFW)"
# ═══════════════════════════════════════════════════════════════════════════════
#
#  Rules: allow SSH (so we don't lock ourselves out), allow HTTP + HTTPS for
#  Nginx, block everything else inbound.  Outbound is unrestricted.
#
info "Configuring UFW firewall rules..."
sudo ufw allow OpenSSH     > /dev/null   # port 22 — MUST be first
sudo ufw allow 80/tcp      > /dev/null   # HTTP
sudo ufw allow 443/tcp     > /dev/null   # HTTPS

# Enable UFW non-interactively if not already active
UFW_STATUS=$(sudo ufw status | head -1)
if echo "$UFW_STATUS" | grep -q "inactive"; then
    echo "y" | sudo ufw enable > /dev/null
    success "Firewall enabled — SSH (22), HTTP (80), HTTPS (443) allowed."
else
    sudo ufw reload > /dev/null
    success "Firewall already active — rules updated."
fi

# ── fail2ban (SSH brute-force protection) ─────────────────────────────────────
if ! sudo systemctl is-active --quiet fail2ban 2>/dev/null; then
    sudo systemctl enable fail2ban --now
fi
# Write a local jail config if it doesn't exist yet
F2B_JAIL="/etc/fail2ban/jail.d/phonebooth.conf"
if [ ! -f "$F2B_JAIL" ]; then
    sudo tee "$F2B_JAIL" > /dev/null <<F2BEOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
F2BEOF
    sudo systemctl reload fail2ban 2>/dev/null || sudo systemctl restart fail2ban
fi
success "fail2ban active — SSH brute-force protection enabled."

# ── Automatic security updates ────────────────────────────────────────────────
# Enable unattended-upgrades for the security pocket only (safe default).
if [ -f /etc/apt/apt.conf.d/50unattended-upgrades ]; then
    info "unattended-upgrades already configured — skipping."
else
    sudo dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true
    info "Automatic security updates enabled."
fi

# ═══════════════════════════════════════════════════════════════════════════════
step "4/10  Node.js dependencies"
# ═══════════════════════════════════════════════════════════════════════════════
cd "${APP_DIR}"
info "Installing npm packages (this may take a minute)..."
rm -rf node_modules
npm install --silent
success "npm install complete."

# ═══════════════════════════════════════════════════════════════════════════════
step "5/10  PostgreSQL – user, database, permissions"
# ═══════════════════════════════════════════════════════════════════════════════

# Create role if missing, always sync password
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
    | grep -q 1 \
    || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# Create database only if it does not already exist — never drop on re-runs
DB_EXISTS=$(sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')
if [ "${DB_EXISTS}" = "1" ]; then
    info "Database '${DB_NAME}' already exists — keeping existing data."
else
    info "Creating database '${DB_NAME}'..."
    sudo systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
    sudo -u postgres psql -v ON_ERROR_STOP=1 \
        -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi

# Ensure correct privileges (safe to run multiple times)
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"

success "Database '${DB_NAME}' and user '${DB_USER}' are ready."

# ═══════════════════════════════════════════════════════════════════════════════
step "6/10  .env file"
# ═══════════════════════════════════════════════════════════════════════════════
NEW_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1/${DB_NAME}?sslmode=disable"

# Use Python for reliable key=value upsert — avoids sed special-character issues
upsert_env() {
    local key="$1"
    local val="$2"
    local file="${APP_DIR}/.env"
    python3 - <<PYEOF
import re
key = """${key}"""
val = """${val}"""
path = """${file}"""
with open(path, "r") as f:
    content = f.read()
pattern = re.compile(r"^" + re.escape(key) + r"=.*$", re.MULTILINE)
new_line = key + "=" + val
if pattern.search(content):
    content = pattern.sub(new_line, content)
else:
    content = content.rstrip("\n") + "\n" + new_line + "\n"
with open(path, "w") as f:
    f.write(content)
PYEOF
}

if [ -f "${APP_DIR}/.env" ]; then
    info ".env exists — updating DB credentials and port, preserving API keys."
    upsert_env "DATABASE_URL" "${NEW_DB_URL}"
    upsert_env "PORT"         "${APP_PORT}"
    upsert_env "NODE_ENV"     "production"
    success ".env updated — DATABASE_URL points to ${DB_NAME}."
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
    success ".env created."
fi

# Lock down .env so only the current user can read it
chmod 600 "${APP_DIR}/.env"
info ".env permissions set to 600 (owner-read only)."

# ═══════════════════════════════════════════════════════════════════════════════
step "7/10  Uploads directory"
# ═══════════════════════════════════════════════════════════════════════════════
#
#  The app writes ElevenLabs-generated MP3s to uploads/, uploads/mm/, uploads/mw/
#  and stores caller recordings under uploads/.  If these directories don't exist
#  the app crashes silently on first audio generation.
#
for DIR in \
    "${APP_DIR}/uploads" \
    "${APP_DIR}/uploads/mm" \
    "${APP_DIR}/uploads/mw"; do
    if [ ! -d "$DIR" ]; then
        mkdir -p "$DIR"
        info "Created: $DIR"
    fi
done
chmod -R 755 "${APP_DIR}/uploads"
success "uploads/ directory structure verified."

# ═══════════════════════════════════════════════════════════════════════════════
step "8/10  Database schema + admin account"
# ═══════════════════════════════════════════════════════════════════════════════
info "Pushing Drizzle schema..."
npx drizzle-kit push --force
success "Schema pushed."

info "Ensuring admin account..."
npx tsx scripts/reset-admin.ts
success "Admin account ready."

# ═══════════════════════════════════════════════════════════════════════════════
step "9/10  Build"
# ═══════════════════════════════════════════════════════════════════════════════
npm run build
success "Build complete → ${APP_DIR}/dist/"

# ═══════════════════════════════════════════════════════════════════════════════
step "10a/10  systemd service (${SERVICE_NAME})"
# ═══════════════════════════════════════════════════════════════════════════════
RUN_AS_USER="$(whoami)"

sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=Phone Booth – Node.js production server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${RUN_AS_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=$(which node) ${APP_DIR}/dist/index.cjs
Restart=always
RestartSec=5
# Allow large numbers of open files (for concurrent audio + call connections)
LimitNOFILE=65536
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
step "10b/10  Nginx + SSL"
# ═══════════════════════════════════════════════════════════════════════════════

# ── Auto-detect the Let's Encrypt certificate directory ───────────────────────
CERT_BASE=""
for CANDIDATE in \
    "/etc/letsencrypt/live/${DOMAIN}" \
    "/etc/letsencrypt/live/${DOMAIN}-0001" \
    "/etc/letsencrypt/live/${DOMAIN}-0002"; do
    if [ -f "${CANDIDATE}/fullchain.pem" ] && [ -f "${CANDIDATE}/privkey.pem" ]; then
        CERT_BASE="$CANDIDATE"
        break
    fi
done

if [ -z "$CERT_BASE" ]; then
    warn "────────────────────────────────────────────────────────────────"
    warn "No SSL certificate found for '${DOMAIN}'."
    warn "Obtain one first with:"
    warn "  sudo certbot certonly --nginx -d ${DOMAIN} -d www.${DOMAIN} \\"
    warn "       --non-interactive --agree-tos -m admin@${DOMAIN}"
    warn "Then re-run this script to complete the Nginx configuration."
    warn "────────────────────────────────────────────────────────────────"
else
    info "SSL certificate found at ${CERT_BASE}/"

    # Remove default nginx site
    [ -L /etc/nginx/sites-enabled/default ] \
        && sudo rm -f /etc/nginx/sites-enabled/default \
        && info "Removed default nginx site."

    # Remove broken symlinks
    for LINK in /etc/nginx/sites-enabled/*; do
        if [ -L "${LINK}" ] && [ ! -e "${LINK}" ]; then
            sudo rm -f "${LINK}"
            warn "Removed broken nginx symlink: ${LINK}"
        fi
    done

    # Nginx global tweaks (applied only once)
    NGINX_CONF_TWEAKED="/etc/nginx/conf.d/phonebooth_global.conf"
    if [ ! -f "$NGINX_CONF_TWEAKED" ]; then
        sudo tee "$NGINX_CONF_TWEAKED" > /dev/null <<NGXGLOBAL
# Phone Booth global Nginx settings
server_tokens off;                      # hide Nginx version
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
gzip_min_length 1024;
client_max_body_size 50M;
NGXGLOBAL
        info "Applied global Nginx tweaks (gzip, server_tokens off)."
    fi

    # Write site config
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

    ssl_certificate     ${CERT_BASE}/fullchain.pem;
    ssl_certificate_key ${CERT_BASE}/privkey.pem;
    ssl_trusted_certificate ${CERT_BASE}/chain.pem;

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

    # Twilio webhooks — short read timeout (Twilio gives up after 15 s)
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
        proxy_buffering off;
        proxy_pass_header Set-Cookie;
    }

    # Audio uploads — long cache (files are content-addressable by name)
    location /uploads/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    # React SPA + WebSocket hot-reload
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

    sudo ln -sf "${NGINX_SITE}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
    sudo nginx -t
    sudo systemctl reload nginx

    # Enable automatic cert renewal
    sudo systemctl enable certbot.timer 2>/dev/null || true

    success "Nginx configured and reloaded."
fi

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}=================================================${RESET}"
echo -e "${BOLD}${GREEN}  All done!${RESET}"
echo ""
echo -e "  ${BOLD}Site       :${RESET} ${CYAN}https://${DOMAIN}${RESET}"
echo -e "  ${BOLD}Admin      :${RESET} https://${DOMAIN}/admin/login"
echo -e "  ${BOLD}Database   :${RESET} ${DB_NAME}  (user: ${DB_USER})"
echo -e "  ${BOLD}PostgreSQL :${RESET} version ${PG_VERSION}, service: ${PG_SERVICE}"
echo -e "  ${BOLD}Service    :${RESET} ${SERVICE_NAME}  (systemd)"
echo -e "  ${BOLD}Node.js    :${RESET} $(node --version)"
echo -e "  ${BOLD}Nginx      :${RESET} $(nginx -v 2>&1 | grep -oP '[\d.]+')"
echo ""
echo -e "  ${BOLD}Useful commands:${RESET}"
echo -e "    App logs  : sudo journalctl -u ${SERVICE_NAME} -f"
echo -e "    Restart   : sudo systemctl restart ${SERVICE_NAME}"
echo -e "    Nginx log : sudo tail -f /var/log/nginx/phonebooth_error.log"
echo -e "    Firewall  : sudo ufw status"
echo -e "    Fail2ban  : sudo fail2ban-client status sshd"
echo ""
echo -e "  ${BOLD}${YELLOW}Next: fill in your API keys in .env then restart:${RESET}"
echo -e "    nano ${APP_DIR}/.env"
echo ""
echo -e "    TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER"
echo -e "    ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID"
echo -e "    STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
echo ""
echo -e "    sudo systemctl restart ${SERVICE_NAME}"
echo -e "${BOLD}${GREEN}=================================================${RESET}"
echo ""
