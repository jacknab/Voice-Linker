#!/usr/bin/env bash
# =============================================================================
#  setup.sh  –  Phone Booth full production VPS setup
#
#  Usage:
#    bash setup.sh                       # interactive menu
#    bash setup.sh mydomain.com          # pre-fill domain, show menu
#    bash setup.sh mydomain.com --yes    # fully unattended, run all steps
#
#  Requirements:
#    - Ubuntu 20.04 / 22.04 / 24.04
#    - Non-root user with sudo privileges
#    - DNS A record pointing to this server's IP
# =============================================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ─── COLOUR HELPERS ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
hdr()     { echo -e "\n${BOLD}${CYAN}━━━  $*  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ─── GLOBAL CONFIGURATION ─────────────────────────────────────────────────────
APP_PORT=5050
DB_USER="phonebooth_user"
DB_NAME="phonebooth_db"
SERVICE_NAME="phonebooth"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── ARGUMENT PARSING ─────────────────────────────────────────────────────────
AUTO_YES=false
DOMAIN=""
for ARG in "$@"; do
    case "$ARG" in
        --yes|-y) AUTO_YES=true ;;
        *)        [[ -z "$DOMAIN" ]] && DOMAIN="$ARG" ;;
    esac
done

# ─── DOMAIN ───────────────────────────────────────────────────────────────────
if [ -z "$DOMAIN" ]; then
    read -rp "$(echo -e "${BOLD}Domain name${RESET} [example.com]: ")" DOMAIN
fi
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
[[ -z "$DOMAIN" ]] && error "Domain name cannot be empty."

# ─── PORT ─────────────────────────────────────────────────────────────────────
while true; do
    echo ""
    echo -e "${BOLD}What port should the app run on?${RESET}"
    echo -e "  (1024–65535 — default: ${CYAN}${APP_PORT}${RESET})"
    if ss -tlnp 2>/dev/null | awk '{print $4}' | grep -q ":${APP_PORT}$"; then
        echo -e "  ${RED}[WARN]${RESET} Port ${APP_PORT} appears to be in use — consider choosing a different one."
    fi
    read -rp "  Port: " _INPUT_PORT
    _INPUT_PORT="${_INPUT_PORT:-$APP_PORT}"
    if [[ "$_INPUT_PORT" =~ ^[0-9]+$ ]] && (( _INPUT_PORT >= 1024 && _INPUT_PORT <= 65535 )); then
        if ss -tlnp 2>/dev/null | awk '{print $4}' | grep -q ":${_INPUT_PORT}$"; then
            echo -e "  ${RED}[WARN]${RESET} Port ${_INPUT_PORT} is already in use by another process."
            read -rp "  Use it anyway? [y/N]: " _CONFIRM_PORT
            [[ "$_CONFIRM_PORT" =~ ^[Yy]$ ]] || continue
        fi
        APP_PORT="$_INPUT_PORT"
        info "Application will run on port ${APP_PORT}."
        break
    else
        echo -e "${RED}[ERROR]${RESET} Enter a number between 1024 and 65535."
    fi
done

# ─── DB PASSWORD (reuse from .env or generate fresh) ─────────────────────────
DB_PASSWORD=""
if [ -f "${APP_DIR}/.env" ] && grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
    EXISTING_URL=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | cut -d= -f2-)
    DB_PASSWORD=$(echo "${EXISTING_URL}" | grep -oP '(?<=:)[^@]+(?=@)' || true)
fi
if [ -z "${DB_PASSWORD:-}" ]; then
    DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)
fi

# ─── DETECT POSTGRES VARS (called at start of any step that needs them) ───────
detect_pg() {
    PG_VERSION=$(dpkg -l 'postgresql-[0-9]*' 2>/dev/null \
        | awk '/^ii/{print $2}' \
        | grep -oP '(?<=postgresql-)\d+' \
        | sort -n | tail -1 || true)
    PG_SERVICE="postgresql"
    if [[ -n "${PG_VERSION:-}" ]] && sudo systemctl list-units --type=service --all 2>/dev/null \
            | grep -q "postgresql@${PG_VERSION}-main.service"; then
        PG_SERVICE="postgresql@${PG_VERSION}-main"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP FUNCTIONS
# Each step is self-contained and safe to re-run multiple times.
# ═══════════════════════════════════════════════════════════════════════════════

# ── Step 1 – Swap space ───────────────────────────────────────────────────────
do_step_1() {
    hdr "Step 1/10  Swap space"
    SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
    if (( SWAP_MB < 512 )); then
        info "Swap: ${SWAP_MB} MB — creating 2 GB swap file..."
        if [ -f /swapfile ]; then
            sudo swapoff /swapfile 2>/dev/null || true
            sudo rm -f /swapfile
        fi
        sudo fallocate -l 2G /swapfile 2>/dev/null \
            || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile -q
        sudo swapon /swapfile
        grep -q '/swapfile' /etc/fstab \
            || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
        echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf > /dev/null
        sudo sysctl -p /etc/sysctl.d/99-swappiness.conf -q
        success "2 GB swap file created and enabled."
    else
        info "Swap already configured (${SWAP_MB} MB) — skipping."
    fi
}

# ── Step 2 – System packages ──────────────────────────────────────────────────
do_step_2() {
    hdr "Step 2/10  System packages"
    sudo apt-get update -qq
    sudo apt-get install -y -qq \
        curl wget git openssl ca-certificates gnupg lsb-release \
        build-essential python3 \
        ufw fail2ban \
        unattended-upgrades apt-listchanges

    # Node.js 20.x LTS
    NODE_VER=$(node --version 2>/dev/null | grep -oP '(?<=v)\d+' || echo "0")
    if (( NODE_VER < 20 )); then
        info "Node.js ${NODE_VER} found — installing 20.x LTS..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -q
        sudo apt-get install -y nodejs -qq
        success "Node.js $(node --version) installed."
    else
        info "Node.js $(node --version) already present — skipping."
    fi

    # PostgreSQL
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
        [[ -z "$PG_VERSION" ]] && error "PostgreSQL installation failed."
        success "PostgreSQL ${PG_VERSION} installed."
    else
        info "PostgreSQL ${PG_VERSION} already installed."
    fi

    # Detect service name and start
    detect_pg
    if ! sudo systemctl is-active --quiet "${PG_SERVICE}" 2>/dev/null; then
        sudo systemctl enable "${PG_SERVICE}" --now
        sleep 2
    else
        info "PostgreSQL service (${PG_SERVICE}) already running."
    fi
    info "Waiting for PostgreSQL to accept connections..."
    PG_WAIT=0
    until sudo -u postgres pg_isready -q 2>/dev/null; do
        sleep 1; PG_WAIT=$((PG_WAIT+1))
        (( PG_WAIT >= 30 )) && error "PostgreSQL did not become ready within 30 s."
    done
    success "PostgreSQL ${PG_VERSION} ready."

    # pg_hba.conf — ensure TCP md5 auth
    PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"
    if [[ -f "$PG_HBA" ]]; then
        PATCHED=false
        if sudo grep -qP '^host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+trust' "$PG_HBA" 2>/dev/null; then
            sudo sed -i -E \
                's/^(host\s+all\s+all\s+(127\.0\.0\.1\/32|::1\/128)\s+)trust$/\1md5/' "$PG_HBA"
            PATCHED=true
        fi
        if ! sudo grep -qP '^host\s+all\s+all\s+127\.0\.0\.1/32' "$PG_HBA" 2>/dev/null; then
            echo "host    all             all             127.0.0.1/32            md5" \
                | sudo tee -a "$PG_HBA" > /dev/null
            PATCHED=true
        fi
        if [ "$PATCHED" = true ]; then
            sudo systemctl reload "${PG_SERVICE}" 2>/dev/null \
                || sudo systemctl restart "${PG_SERVICE}"
            until sudo -u postgres pg_isready -q 2>/dev/null; do sleep 1; done
            success "pg_hba.conf patched — md5 TCP auth enabled."
        else
            info "pg_hba.conf already configured correctly."
        fi
    fi

    # Nginx
    if ! command -v nginx &>/dev/null; then
        info "Installing Nginx..."
        sudo apt-get install -y nginx -qq
        sudo systemctl enable nginx --now
        success "Nginx installed."
    else
        info "Nginx $(nginx -v 2>&1 | grep -oP '[\d.]+') already present — skipping."
    fi

    # Certbot
    if ! command -v certbot &>/dev/null; then
        info "Installing Certbot..."
        sudo apt-get install -y certbot python3-certbot-nginx -qq
        success "Certbot installed."
    else
        info "Certbot already present — skipping."
    fi

    success "All system packages ready."
}

# ── Step 3 – Firewall ─────────────────────────────────────────────────────────
do_step_3() {
    hdr "Step 3/10  Firewall (UFW + fail2ban)"
    sudo ufw allow OpenSSH  > /dev/null
    sudo ufw allow 80/tcp   > /dev/null
    sudo ufw allow 443/tcp  > /dev/null
    if sudo ufw status | grep -q "inactive"; then
        echo "y" | sudo ufw enable > /dev/null
        success "UFW enabled — SSH (22), HTTP (80), HTTPS (443) allowed."
    else
        sudo ufw reload > /dev/null
        success "UFW rules updated."
    fi

    if ! sudo systemctl is-active --quiet fail2ban 2>/dev/null; then
        sudo systemctl enable fail2ban --now
    fi
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

    if [ ! -f /etc/apt/apt.conf.d/50unattended-upgrades ]; then
        sudo dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true
    fi
    success "Automatic security updates configured."
}

# ── Step 4 – npm install ──────────────────────────────────────────────────────
do_step_4() {
    hdr "Step 4/10  Node.js dependencies"
    cd "${APP_DIR}"
    info "Installing npm packages (this may take a minute)..."
    rm -rf node_modules
    npm install --silent
    success "npm install complete."
}

# ── Step 5 – PostgreSQL database + user ──────────────────────────────────────
do_step_5() {
    hdr "Step 5/10  PostgreSQL – user, database, permissions"

    # ── Prompt for database name ──────────────────────────────────────────────
    while true; do
        echo ""
        echo -e "${BOLD}What should the database be called?${RESET}"
        echo -e "  (letters, numbers and underscores only — default: ${CYAN}${DB_NAME}${RESET})"
        read -rp "  Database name: " _INPUT_DB_NAME
        # Use default if user pressed Enter without typing anything
        _INPUT_DB_NAME="${_INPUT_DB_NAME:-$DB_NAME}"
        # Validate: only a-z A-Z 0-9 _
        if [[ "$_INPUT_DB_NAME" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]]; then
            DB_NAME="$_INPUT_DB_NAME"
            info "Database will be named '${DB_NAME}'."
            break
        else
            echo -e "${RED}[ERROR]${RESET} Invalid name — use only letters, numbers, and underscores, starting with a letter."
        fi
    done

    detect_pg
    [[ -z "${PG_VERSION:-}" ]] && error "PostgreSQL is not installed. Please run Step 2 first."
    if ! sudo -u postgres pg_isready -q 2>/dev/null; then
        sudo systemctl start "${PG_SERVICE}"
        sleep 3
    fi

    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
        | grep -q 1 \
        || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"
    sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

    DB_EXISTS=$(sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')
    if [ "${DB_EXISTS}" = "1" ]; then
        info "Database '${DB_NAME}' already exists — keeping existing data."
    else
        info "Creating database '${DB_NAME}'..."
        sudo systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
        sudo -u postgres psql -v ON_ERROR_STOP=1 \
            -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
    fi

    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
    sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"
    success "Database '${DB_NAME}' and user '${DB_USER}' are ready."
}

# ── Step 6 – .env file ────────────────────────────────────────────────────────
do_step_6() {
    hdr "Step 6/10  .env file"
    local NEW_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1/${DB_NAME}?sslmode=disable"

    upsert_env() {
        local key="$1" val="$2" file="${APP_DIR}/.env"
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
        info ".env exists — updating DATABASE_URL, PORT, NODE_ENV."
        upsert_env "DATABASE_URL" "${NEW_DB_URL}"
        upsert_env "PORT"         "${APP_PORT}"
        upsert_env "NODE_ENV"     "production"
        success ".env updated."
    else
        local SESSION_SECRET
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
    chmod 600 "${APP_DIR}/.env"
    info ".env permissions set to 600 (owner-read only)."
}

# ── Step 7 – Uploads directory ────────────────────────────────────────────────
do_step_7() {
    hdr "Step 7/10  Uploads directory"
    for DIR in \
        "${APP_DIR}/uploads" \
        "${APP_DIR}/uploads/mm" \
        "${APP_DIR}/uploads/mw"; do
        [ -d "$DIR" ] || mkdir -p "$DIR" && info "Verified: $DIR"
    done
    chmod -R 755 "${APP_DIR}/uploads"
    success "uploads/ directory structure ready."
}

# ── Step 8 – Database schema ──────────────────────────────────────────────────
do_step_8() {
    hdr "Step 8/10  Database schema"
    cd "${APP_DIR}"
    echo ""
    echo -e "${BOLD}The following step will create or update database tables to match the application schema.${RESET}"
    echo -e "  Drizzle will show you exactly which tables will be created or altered before applying any changes."
    echo ""

    if [ "$AUTO_YES" = true ]; then
        info "Running in unattended mode (--yes) — applying schema without prompt."
        npx drizzle-kit push --force
    else
        info "Pushing Drizzle schema — you will be asked to confirm any destructive changes..."
        npx drizzle-kit push
    fi

    success "Schema pushed."
}

# ── Step 9 – Production build ─────────────────────────────────────────────────
do_step_9() {
    hdr "Step 9/10  Production build"
    cd "${APP_DIR}"
    npm run build
    success "Build complete → ${APP_DIR}/dist/"
}

# ── Step 10 – systemd service ─────────────────────────────────────────────────
do_step_10() {
    hdr "Step 10a/10  systemd service (${SERVICE_NAME})"
    local RUN_AS_USER
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

    # ── Nginx + SSL ──────────────────────────────────────────────────────────
    hdr "Step 10b/10  Nginx + SSL"

    # Auto-detect Let's Encrypt cert directory
    # Certbot sometimes appends -0001, -0002 when a domain already had a cert
    local CERT_BASE=""
    for CANDIDATE in \
        "/etc/letsencrypt/live/${DOMAIN}" \
        "/etc/letsencrypt/live/${DOMAIN}-0001" \
        "/etc/letsencrypt/live/${DOMAIN}-0002" \
        "/etc/letsencrypt/live/${DOMAIN}-0003"; do
        if [ -f "${CANDIDATE}/fullchain.pem" ] && [ -f "${CANDIDATE}/privkey.pem" ]; then
            CERT_BASE="$CANDIDATE"
            break
        fi
    done

    if [ -z "$CERT_BASE" ]; then
        info "No SSL certificate found for '${DOMAIN}' — requesting one from Let's Encrypt now."
        echo ""

        # Ask for the email Let's Encrypt will use for renewal reminders
        read -rp "$(echo -e "${BOLD}Email for SSL certificate notices${RESET} [admin@${DOMAIN}]: ")" _CERT_EMAIL
        _CERT_EMAIL="${_CERT_EMAIL:-admin@${DOMAIN}}"

        # Write a minimal HTTP server block so certbot can serve the ACME challenge
        local TMP_SITE="/etc/nginx/sites-available/${SERVICE_NAME}_acme"
        sudo tee "$TMP_SITE" > /dev/null <<ACMENGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    root /var/www/html;
    location /.well-known/acme-challenge/ { try_files \$uri =404; }
    location / { return 444; }
}
ACMENGINX
        sudo ln -sf "$TMP_SITE" "/etc/nginx/sites-enabled/${SERVICE_NAME}_acme"
        sudo nginx -t && sudo systemctl reload nginx \
            || error "Nginx config test failed — fix nginx errors and re-run Step 10."

        info "Running certbot — make sure ${DOMAIN} and www.${DOMAIN} point to this server's IP and port 80 is open."
        sudo certbot certonly --nginx \
            -d "${DOMAIN}" -d "www.${DOMAIN}" \
            --non-interactive --agree-tos -m "${_CERT_EMAIL}" \
            || error "Certbot failed. Confirm DNS is pointing to this server and port 80 is reachable, then re-run Step 10."

        # Clean up the temporary ACME challenge site
        sudo rm -f "/etc/nginx/sites-enabled/${SERVICE_NAME}_acme" "$TMP_SITE"
        sudo systemctl reload nginx

        # Re-scan now that the cert has been issued
        for CANDIDATE in \
            "/etc/letsencrypt/live/${DOMAIN}" \
            "/etc/letsencrypt/live/${DOMAIN}-0001" \
            "/etc/letsencrypt/live/${DOMAIN}-0002" \
            "/etc/letsencrypt/live/${DOMAIN}-0003"; do
            if [ -f "${CANDIDATE}/fullchain.pem" ] && [ -f "${CANDIDATE}/privkey.pem" ]; then
                CERT_BASE="$CANDIDATE"
                break
            fi
        done

        [[ -z "$CERT_BASE" ]] \
            && error "Certificate was issued but could not be located under /etc/letsencrypt/live/ — check certbot output above."

        success "SSL certificate obtained at ${CERT_BASE}/"
    else
        # Existing cert found — reuse it; never touch certs belonging to other apps
        info "Existing SSL certificate found at ${CERT_BASE}/"
        info "Reusing existing certificate — no new certbot request needed."
    fi
    [ -L /etc/nginx/sites-enabled/default ] \
        && sudo rm -f /etc/nginx/sites-enabled/default \
        && info "Removed default nginx site."

    for LINK in /etc/nginx/sites-enabled/*; do
        [ -L "${LINK}" ] && [ ! -e "${LINK}" ] && sudo rm -f "${LINK}" \
            && warn "Removed broken symlink: ${LINK}"
    done

    # Global Nginx tweaks — always rewritten so re-runs self-heal any old config
    local NG_GLOBAL="/etc/nginx/conf.d/phonebooth_global.conf"
    sudo tee "$NG_GLOBAL" > /dev/null <<NGXGLOBAL
server_tokens off;
client_max_body_size 50M;
NGXGLOBAL
    info "Wrote ${NG_GLOBAL}"

    local NGINX_SITE="/etc/nginx/sites-available/${SERVICE_NAME}"
    sudo tee "${NGINX_SITE}" > /dev/null <<NGINXEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

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

    location /uploads/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

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
    sudo systemctl enable certbot.timer 2>/dev/null || true
    success "Nginx configured and reloaded."
}

# ─── RUN FROM A GIVEN STEP ────────────────────────────────────────────────────
run_from() {
    local FROM="$1"
    (( FROM <= 1  )) && do_step_1
    (( FROM <= 2  )) && do_step_2
    (( FROM <= 3  )) && do_step_3
    (( FROM <= 4  )) && do_step_4
    (( FROM <= 5  )) && do_step_5
    (( FROM <= 6  )) && do_step_6
    (( FROM <= 7  )) && do_step_7
    (( FROM <= 8  )) && do_step_8
    (( FROM <= 9  )) && do_step_9
    (( FROM <= 10 )) && do_step_10

    echo ""
    echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
    echo -e "${BOLD}${GREEN}  Setup complete!${RESET}"
    echo ""
    echo -e "  ${BOLD}Site      :${RESET} ${CYAN}https://${DOMAIN}${RESET}"
    echo -e "  ${BOLD}Admin     :${RESET} https://${DOMAIN}/admin/login"
    echo -e "  ${BOLD}Database  :${RESET} ${DB_NAME}  (user: ${DB_USER})"
    echo -e "  ${BOLD}Service   :${RESET} ${SERVICE_NAME}  (systemd)"
    echo ""
    echo -e "  ${BOLD}Useful commands:${RESET}"
    echo -e "    App logs  : sudo journalctl -u ${SERVICE_NAME} -f"
    echo -e "    Restart   : sudo systemctl restart ${SERVICE_NAME}"
    echo -e "    Nginx log : sudo tail -f /var/log/nginx/phonebooth_error.log"
    echo -e "    Firewall  : sudo ufw status"
    echo ""
    echo -e "  ${BOLD}${YELLOW}Fill in your API keys in .env then restart:${RESET}"
    echo -e "    nano ${APP_DIR}/.env"
    echo ""
    echo -e "    TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER"
    echo -e "    ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID"
    echo -e "    STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
    echo ""
    echo -e "    sudo systemctl restart ${SERVICE_NAME}"
    echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MENU
# ═══════════════════════════════════════════════════════════════════════════════

# If --yes flag is set, skip the menu and run everything
if [ "$AUTO_YES" = true ]; then
    info "Running all steps unattended (--yes flag set)."
    run_from 1
    exit 0
fi

show_menu() {
    clear
    echo -e "${BOLD}${CYAN}"
    echo "  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║          Phone Booth  –  VPS Setup Menu                 ║"
    echo "  ╠══════════════════════════════════════════════════════════╣"
    echo "  ║                                                          ║"
    echo "  ║   Domain : ${DOMAIN}"
    echo "  ║                                                          ║"
    echo "  ║   1)  Full Setup  (run all steps from the beginning)     ║"
    echo "  ║                                                          ║"
    echo "  ║   ── Resume / re-run from a specific step ──             ║"
    echo "  ║   2)  Step  1  –  Swap space                            ║"
    echo "  ║   3)  Step  2  –  System packages & Node.js             ║"
    echo "  ║   4)  Step  3  –  Firewall  (UFW + fail2ban)            ║"
    echo "  ║   5)  Step  4  –  npm install                           ║"
    echo "  ║   6)  Step  5  –  PostgreSQL database & user            ║"
    echo "  ║   7)  Step  6  –  .env configuration                    ║"
    echo "  ║   8)  Step  7  –  Uploads directory                     ║"
    echo "  ║   9)  Step  8  –  Database schema + admin account       ║"
    echo "  ║  10)  Step  9  –  Production build                      ║"
    echo "  ║  11)  Step 10  –  systemd service + Nginx + SSL         ║"
    echo "  ║                                                          ║"
    echo "  ║   0)  Exit                                               ║"
    echo "  ║                                                          ║"
    echo "  ╚══════════════════════════════════════════════════════════╝"
    echo -e "${RESET}"
    echo -e "  ${YELLOW}Note: every step is safe to re-run — it skips work${RESET}"
    echo -e "  ${YELLOW}that is already done and only applies what's missing.${RESET}"
    echo ""
}

while true; do
    show_menu
    read -rp "  Enter choice [0-11]: " CHOICE

    case "$CHOICE" in
        0)
            echo "Exiting."; exit 0 ;;
        1)
            run_from 1  ;;
        2)
            run_from 1  ;;   # step 1 from the menu → start from Step 1
        3)
            run_from 2  ;;
        4)
            run_from 3  ;;
        5)
            run_from 4  ;;
        6)
            run_from 5  ;;
        7)
            run_from 6  ;;
        8)
            run_from 7  ;;
        9)
            run_from 8  ;;
        10)
            run_from 9  ;;
        11)
            run_from 10 ;;
        *)
            echo -e "${RED}Invalid choice — please enter a number between 0 and 11.${RESET}"
            sleep 1 ;;
    esac

    echo ""
    read -rp "  Return to menu? [Y/n]: " AGAIN
    [[ "${AGAIN,,}" == "n" ]] && break
done
