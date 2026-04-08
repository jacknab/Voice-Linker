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
APP_PORT=5062
DB_USER="phonebooth_user"
DB_NAME="malebox_chatline"
SERVICE_NAME="malebox"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${APP_DIR}/.setup_config"

# CONFIGURATION STORAGE FUNCTIONS
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
        info "Configuration loaded from $CONFIG_FILE"
    fi
}

save_config() {
    cat > "$CONFIG_FILE" <<CONFIGEOF
DOMAIN="$DOMAIN"
APP_PORT="$APP_PORT"
DB_NAME="$DB_NAME"
CERT_EMAIL="$CERT_EMAIL"
CONFIGEOF
    success "Configuration saved to $CONFIG_FILE"
}

# DISCLAIMER SCREEN
show_disclaimer() {
    clear
    echo -e "${BOLD}${CYAN}================================================================${RESET}"
    echo -e "${BOLD}${CYAN}                    DISCLAIMER${RESET}"
    echo -e "${BOLD}${CYAN}================================================================${RESET}"
    echo ""
    echo -e "${YELLOW}Auto application setup process provided by TJ BENJAMIN Services${RESET}"
    echo -e "${YELLOW}This setup tool is developed for Ubuntu 22.04.5 LTS Linux based systems${RESET}"
    echo -e "${YELLOW}Requirements: Node.js v22.12.0 and PostgreSQL 15.15${RESET}"
    echo -e "${YELLOW}This tool will install dependencies, configure databases, set up SSL,${RESET}"
    echo -e "${YELLOW}and deploy the application with PM2 process management.${RESET}"
    echo ""
    echo -e "${YELLOW}The setup will modify system files and install packages.${RESET}"
    echo -e "${YELLOW}Please ensure you have proper backups and system access.${RESET}"
    echo ""
    echo -e "${BOLD}${CYAN}================================================================${RESET}"
    echo ""
    
    while true; do
        read -rp "$(echo -e "${BOLD}Do you agree to proceed? [Y/n]: ${RESET}")" AGREE
        case "$AGREE" in
            [Yy]|"") return 0 ;;
            [Nn]) return 1 ;;
            *) echo -e "${RED}Please enter Y or n${RESET}" ;;
        esac
    done
}

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
    # Safely extract password using sed — handles postgresql://user:pass@host/db format only
    DB_PASSWORD=$(echo "${EXISTING_URL}" | sed -nE 's|^[^:]+://[^:@]+:([^@/]+)@[^/].*|\1|p' || true)
    # Discard if it looks malformed (contains slashes or colons — sign of a corrupt URL)
    if echo "${DB_PASSWORD}" | grep -qP '[:/]'; then
        DB_PASSWORD=""
    fi
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
    sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};"
    success "Database '${DB_NAME}' and user '${DB_USER}' are ready."

    # Initialize database schema immediately after creation
    info "Initializing database schema..."
    cd "${APP_DIR}"
    if [ -f "package.json" ] && npm run db:push >/dev/null 2>&1; then
        success "Database schema initialized successfully."
    else
        warn "Database schema initialization failed - you may need to run 'npm run db:push' manually."
    fi

    # Write DATABASE_URL to .env immediately so db:push always uses the correct database
    local NEW_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1/${DB_NAME}?sslmode=disable"
    if [ -f "${APP_DIR}/.env" ]; then
        # Update existing DATABASE_URL line in place
        if grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${NEW_DB_URL}|" "${APP_DIR}/.env"
            info "DATABASE_URL updated in .env."
        else
            echo "DATABASE_URL=${NEW_DB_URL}" >> "${APP_DIR}/.env"
            info "DATABASE_URL added to existing .env."
        fi
    else
        # Create a minimal .env with just DATABASE_URL now; Step 6 will fill in the rest
        echo "DATABASE_URL=${NEW_DB_URL}" > "${APP_DIR}/.env"
        chmod 600 "${APP_DIR}/.env"
        info "Created .env with DATABASE_URL."
    fi
    success "DATABASE_URL written: ${NEW_DB_URL}"
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
        # Ensure SESSION_SECRET is always present (generate one if missing)
        if ! grep -q "^SESSION_SECRET=" "${APP_DIR}/.env"; then
            local SESSION_SECRET
            SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")
            upsert_env "SESSION_SECRET" "${SESSION_SECRET}"
            info "SESSION_SECRET was missing — generated and added to .env."
        fi
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

    # Ensure .env exists before trying to push — if not, create it first
    if [ ! -f "${APP_DIR}/.env" ]; then
        warn ".env not found — running Step 6 to create it first."
        do_step_6
    fi

    # Extract DATABASE_URL directly from .env so no inherited env var can override it
    info "Reading DATABASE_URL from .env..."
    DATABASE_URL=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | head -1 | cut -d= -f2-)
    if [ -z "${DATABASE_URL}" ]; then
        error "DATABASE_URL is empty in .env — cannot push schema. Run Step 6 first."
    fi
    export DATABASE_URL
    info "DATABASE_URL set to: ${DATABASE_URL}"

    info "Pushing Drizzle schema..."
    echo ""

    if ! npx drizzle-kit push --force; then
        error "Schema push failed — check the error above. Fix the DATABASE_URL in .env and re-run Step 8."
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

# ── Step 0 - Configuration Variables Setup
do_step_0() {
    hdr "Configuration Variables Setup"
    info "This step allows you to configure setup variables without running the actual setup."
    info "These settings will be saved and used when you run the setup process."
    echo ""
    
    # Load existing configuration
    load_config
    
    echo -e "${BOLD}Current Configuration:${RESET}"
    echo -e "  Domain: ${CYAN}${DOMAIN:-<not set>}${RESET}"
    echo -e "  Port: ${CYAN}${APP_PORT}${RESET}"
    echo -e "  Database: ${CYAN}${DB_NAME}${RESET}"
    echo -e "  Email: ${CYAN}${CERT_EMAIL:-<not set>}${RESET}"
    echo ""
    
    while true; do
        echo -e "${BOLD}Select an option to configure:${RESET}"
        echo "  1) Domain name"
        echo "  2) Application port"
        echo "  3) Database name"
        echo "  4) SSL certificate email"
        echo "  5) Save and exit"
        echo "  6) Exit without saving"
        echo ""
        read -rp "Choice [1-6]: " CHOICE
        
        case "$CHOICE" in
            1)
                read -rp "$(echo -e "${BOLD}Domain name${RESET} [${DOMAIN:-example.com}]: ")" NEW_DOMAIN
                if [ -n "$NEW_DOMAIN" ]; then
                    DOMAIN="${NEW_DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
                    [[ -z "$DOMAIN" ]] && error "Domain name cannot be empty."
                    success "Domain updated to: $DOMAIN"
                fi
                ;;
            2)
                read -rp "$(echo -e "${BOLD}Application port${RESET} [${APP_PORT}]: ")" NEW_PORT
                if [ -n "$NEW_PORT" ]; then
                    if [[ "$NEW_PORT" =~ ^[0-9]+$ ]] && (( NEW_PORT >= 1024 && NEW_PORT <= 65535 )); then
                        APP_PORT="$NEW_PORT"
                        success "Port updated to: $APP_PORT"
                    else
                        error "Port must be between 1024 and 65535."
                    fi
                fi
                ;;
            3)
                read -rp "$(echo -e "${BOLD}Database name${RESET} [${DB_NAME}]: ")" NEW_DB
                if [ -n "$NEW_DB" ]; then
                    DB_NAME="$NEW_DB"
                    success "Database name updated to: $DB_NAME"
                fi
                ;;
            4)
                read -rp "$(echo -e "${BOLD}SSL certificate email${RESET} [${CERT_EMAIL:-admin@${DOMAIN:-example.com}}]: ")" NEW_EMAIL
                if [ -n "$NEW_EMAIL" ]; then
                    CERT_EMAIL="$NEW_EMAIL"
                    success "Email updated to: $CERT_EMAIL"
                fi
                ;;
            5)
                save_config
                return 0
                ;;
            6)
                return 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Please select 1-6.${RESET}"
                ;;
        esac
        echo ""
    done
}

# ── Step 10 – PM2 process management ──────────────────────────────────────────
do_step_10() {
    hdr "Step 10a/10  PM2 process management (${SERVICE_NAME})"
    
    # CRITICAL WARNING: ENVIRONMENT POLLUTION PREVENTION
    # ================================================
    # NEVER use these methods in application code:
    # - import "dotenv/config"          (causes global environment pollution)
    # - require("dotenv").config()      (causes global environment pollution)
    # - config() from dotenv             (causes global environment pollution)
    #
    # These methods inject environment variables globally, contaminating
    # ALL Node.js processes on the server and causing database connection issues.
    #
    # ALWAYS use these PROPER methods instead:
    # - PM2 env_file: '${APP_DIR}/.env'  (isolated per application)
    # - Systemd EnvironmentFile           (isolated per application)
    # - Explicit environment variables   (no global pollution)
    #
    # AI ASSISTANTS: Do NOT add dotenv/config or config() calls to this application!
    # This will cause environment pollution and break other applications.
    
    warn "ENVIRONMENT POLLUTION PREVENTION: Ensure you understand the warnings above before proceeding!"
    
    # Create PM2 ecosystem configuration with isolated environment
    warn "Creating PM2 ecosystem config with isolated environment variables..."
    
    cat > "${APP_DIR}/ecosystem.config.cjs" <<ECOEOF
module.exports = {
  apps: [
    {
      name: '${SERVICE_NAME}',
      script: 'dist/index.cjs',
      cwd: '${APP_DIR}',
      env_file: '${APP_DIR}/.env',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: ${APP_PORT},
        DATABASE_URL: 'postgresql://${DB_USER}:1825Logan305!@localhost:5432/${DB_NAME}'
      },
      error_file: '${APP_DIR}/logs/pm2-error.log',
      out_file: '${APP_DIR}/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
ECOEOF

    # Create logs directory
    mkdir -p "${APP_DIR}/logs"

    # Start application with PM2
    info "Starting application with PM2..."
    pm2 start "${APP_DIR}/ecosystem.config.cjs"

    # Wait up to 15 seconds for the application to come up
    info "Waiting for application to start..."
    for i in $(seq 1 15); do
        sleep 1
        if pm2 list | grep -q "${SERVICE_NAME}.*online"; then
            success "Application '${SERVICE_NAME}' is running."
            break
        fi
        if [ "$i" -eq 15 ]; then
            warn "Application did not come up within 15 seconds. Last log lines:"
            pm2 logs "${SERVICE_NAME}" --lines 20 2>/dev/null || true
            error "Application '${SERVICE_NAME}' failed to start - see logs above. Fix the issue and re-run Step 10."
        fi
    done

    # Save PM2 process list for startup persistence
    pm2 save

    # ── Nginx + SSL ──────────────────────────────────────────────────────────
    hdr "Step 10b/10  Nginx + SSL"

    # ── Remove any stale certbot certificates for this domain before re-issuing ──
    info "Checking for existing certbot certificates for '${DOMAIN}'..."
    EXISTING_CERTS=()
    for CANDIDATE in \
        "/etc/letsencrypt/live/${DOMAIN}" \
        "/etc/letsencrypt/live/${DOMAIN}-0001" \
        "/etc/letsencrypt/live/${DOMAIN}-0002" \
        "/etc/letsencrypt/live/${DOMAIN}-0003"; do
        if [ -d "${CANDIDATE}" ]; then
            EXISTING_CERTS+=("$(basename "${CANDIDATE}")")
        fi
    done

    if [ ${#EXISTING_CERTS[@]} -gt 0 ]; then
        warn "Found ${#EXISTING_CERTS[@]} existing certificate(s) for '${DOMAIN}' — removing them for a clean re-issue."
        for CERT_NAME in "${EXISTING_CERTS[@]}"; do
            info "Deleting certificate: ${CERT_NAME}"
            sudo certbot delete --cert-name "${CERT_NAME}" --non-interactive 2>/dev/null \
                || sudo rm -rf "/etc/letsencrypt/live/${CERT_NAME}" \
                               "/etc/letsencrypt/archive/${CERT_NAME}" \
                               "/etc/letsencrypt/renewal/${CERT_NAME}.conf"
        done
        success "Old certificate(s) removed — a fresh one will be issued."
    else
        info "No existing certificates found for '${DOMAIN}'."
    fi

    # Auto-detect Let's Encrypt cert directory (will be empty after cleanup above)
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

    # ── Clean up default site and broken symlinks before any nginx -t test ───────
    [ -L /etc/nginx/sites-enabled/default ] \
        && sudo rm -f /etc/nginx/sites-enabled/default \
        && info "Removed default nginx site."

    for LINK in /etc/nginx/sites-enabled/*; do
        [ -L "${LINK}" ] && [ ! -e "${LINK}" ] && sudo rm -f "${LINK}" \
            && warn "Removed broken symlink: ${LINK}"
    done

    # Remove old phonebooth and existing malebox site configs before touching nginx
    # so that nginx can start cleanly after certbot (no stale config referencing deleted certs)
    info "Cleaning up old nginx configurations..."
    sudo rm -f \
        /etc/nginx/sites-enabled/phonebooth \
        /etc/nginx/sites-available/phonebooth \
        /etc/nginx/conf.d/phonebooth_global.conf \
        /etc/nginx/sites-enabled/malebox.conf \
        /etc/nginx/sites-available/malebox.conf \
        2>/dev/null || true
    
    # Also remove any potential malebox symlink in conf.d
    sudo rm -f /etc/nginx/conf.d/malebox.conf 2>/dev/null || true

    if [ -z "$CERT_BASE" ]; then
        info "No SSL certificate found for '${DOMAIN}' — requesting one from Let's Encrypt now."
        echo ""

        # Ask for the email Let's Encrypt will use for renewal reminders
        read -rp "$(echo -e "${BOLD}Email for SSL certificate notices${RESET} [admin@${DOMAIN}]: ")" _CERT_EMAIL
        _CERT_EMAIL="${_CERT_EMAIL:-admin@${DOMAIN}}"

        # Use standalone mode — certbot temporarily binds port 80 itself.
        # Stop nginx so port 80 is free, then restart after cert is issued.
        info "Stopping Nginx briefly so certbot can use port 80..."
        sudo systemctl stop nginx

        info "Running certbot — make sure ${DOMAIN} and www.${DOMAIN} point to this server's IP and port 80 is open."
        # Use || true — certbot's deploy hook tries to reload nginx while it's stopped,
        # which exits non-zero even when the certificate is successfully issued.
        # We verify the cert actually exists below instead of relying on the exit code.
        sudo certbot certonly --standalone \
            -d "${DOMAIN}" -d "www.${DOMAIN}" \
            --non-interactive --agree-tos -m "${_CERT_EMAIL}" || true

        sudo systemctl start nginx
        info "Nginx restarted."

        # Re-scan now that the cert has been issued
        info "Validating issued SSL certificate..."
        for CANDIDATE in \
            "/etc/letsencrypt/live/${DOMAIN}" \
            "/etc/letsencrypt/live/${DOMAIN}-0001" \
            "/etc/letsencrypt/live/${DOMAIN}-0002" \
            "/etc/letsencrypt/live/${DOMAIN}-0003"; do
            if [ -f "${CANDIDATE}/fullchain.pem" ] && [ -f "${CANDIDATE}/privkey.pem" ] && [ -f "${CANDIDATE}/chain.pem" ]; then
                # Validate certificate files are not empty and have proper content
                if [ -s "${CANDIDATE}/fullchain.pem" ] && [ -s "${CANDIDATE}/privkey.pem" ]; then
                    CERT_BASE="$CANDIDATE"
                    success "SSL certificate validated: ${CANDIDATE}"
                    break
                else
                    warn "Certificate files found but appear to be empty or corrupted: ${CANDIDATE}"
                fi
            fi
        done
        
        # Final validation
        if [ -z "$CERT_BASE" ]; then
            error "SSL certificate validation failed - no valid certificate found for ${DOMAIN}"
        fi

        success "SSL certificate obtained at ${CERT_BASE}/"
    else
        # Existing cert found — reuse it; never touch certs belonging to other apps
        info "Existing SSL certificate found at ${CERT_BASE}/"
        info "Reusing existing certificate — no new certbot request needed."
    fi

    # Remove any old global conf that may have conflicting directives
    sudo rm -f /etc/nginx/conf.d/malebox.conf /etc/nginx/conf.d/phonebooth_global.conf 2>/dev/null || true

    local NGINX_SITE="/etc/nginx/sites-available/malebox.conf"
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

    client_max_body_size 50M;

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

    access_log /var/log/nginx/malebox_access.log;
    error_log  /var/log/nginx/malebox_error.log warn;
}
NGINXEOF

# Create nginx symlink with proper validation
if [ -f "/etc/nginx/sites-enabled/malebox.conf" ]; then
    warn "Removing existing malebox.conf symlink to prevent duplication..."
    sudo rm -f "/etc/nginx/sites-enabled/malebox.conf"
fi
    
sudo ln -s "${NGINX_SITE}" "/etc/nginx/sites-enabled/malebox.conf"
    
# Validate nginx configuration before reloading
info "Testing nginx configuration..."
if ! sudo nginx -t; then
    error "Nginx config test failed - check the output above and re-run Step 10."
fi
    
# Ensure nginx is running before reload
if ! sudo systemctl is-active --quiet nginx; then
    info "Starting nginx service..."
    sudo systemctl start nginx
fi
    
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
    echo -e "  ${BOLD}Service   :${RESET} ${SERVICE_NAME}  (PM2)"
    echo ""
    echo -e "  ${BOLD}Useful commands:${RESET}"
    echo -e "    App logs  : pm2 logs ${SERVICE_NAME} -f"
    echo -e "    Restart   : pm2 restart ${SERVICE_NAME}"
    echo -e "    PM2 list  : pm2 list"
    echo -e "    Nginx log : sudo tail -f /var/log/nginx/malebox_error.log"
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

# Apache detection and handling
check_apache() {
    if dpkg -l | grep -q "^ii.*apache2"; then
        echo ""
        warn "Apache2 web server detected on this system!"
        echo ""
        echo -e "${YELLOW}[application name] requires nginx proxy server.${RESET}"
        echo -e "${YELLOW}Apache2 may conflict with nginx setup.${RESET}"
        echo ""
        echo -e "${YELLOW}Setup script options:${RESET}"
        echo "  1) Backup Apache configurations and uninstall Apache2"
        echo "  2) Continue with Apache2 installed (may cause conflicts)"
        echo "  3) Exit setup"
        echo ""
        
        while true; do
            read -rp "$(echo -e "${BOLD}Choose an option [1-3]: ${RESET}")" APACHE_CHOICE
            case "$APACHE_CHOICE" in
                1)
                    info "Creating backup of Apache configurations..."
                    BACKUP_FILE="/root/Apache_backup_$(date +%Y%m%d_%H%M%S).zip"
                    sudo zip -r "$BACKUP_FILE" /etc/apache2/ 2>/dev/null
                    if [ -f "$BACKUP_FILE" ]; then
                        success "Apache configurations backed up to $BACKUP_FILE"
                        info "Uninstalling Apache2 server..."
                        sudo systemctl stop apache2 2>/dev/null
                        sudo apt-get remove --purge apache2 apache2-utils -y
                        sudo apt-get autoremove -y
                        success "Apache2 uninstalled successfully"
                        return 0
                    else
                        error "Failed to create Apache backup"
                    fi
                    ;;
                2)
                    warn "Continuing with Apache2 installed..."
                    warn "This may cause port conflicts with nginx."
                    warn "nginx setup may not work properly."
                    warn "You are responsible for any conflicts that occur."
                    echo ""
                    echo -e "${YELLOW}Type 'YES' to accept responsibility and continue:${RESET}"
                    read -rp "Your choice: " CONTINUE_CONFIRM
                    if [ "$CONTINUE_CONFIRM" = "YES" ]; then
                        success "User accepted responsibility for Apache conflicts."
                        return 0
                    else
                        error "You must type 'YES' to accept responsibility."
                        sleep 2
                    fi
                    ;;
                3)
                    echo "Setup cancelled by user."
                    exit 0
                    ;;
                *)
                    echo -e "${RED}Invalid choice. Please select 1-3.${RESET}"
                    ;;
            esac
        done
    else
        return 0
    fi
}

# Load existing configuration
load_config

# Check for Apache conflicts before proceeding
if ! check_apache; then
    echo "Setup cancelled by user."
    exit 0
fi

# Show disclaimer before menu
if ! show_disclaimer; then
    echo "Setup cancelled by user."
    exit 0
fi

# If --yes flag is set, skip to menu and run everything
if [ "$AUTO_YES" = true ]; then
    info "Running all steps unattended (--yes flag set)."
    run_from 1
    exit 0
fi

show_menu() {
    clear
    echo -e "${BOLD}${CYAN}"
    echo "  ¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡"
    echo "  ¡          Phone Booth  -  VPS Setup Menu                 ¡"
    echo "  ¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡"
    echo "  ¡                                                          ¡"
    echo "  ¡   Domain : ${DOMAIN}"
    echo "  ¡                                                          ¡"
    echo "  ¡   1)  Full Setup  (run all steps from the beginning)     ¡"
    echo "  ¡   2)  Configuration Setup (set variables without running) ¡"
    echo "  ¡                                                          ¡"
    echo "  ¡   -- Resume / re-run from a specific step --             ¡"
    echo "  ¡   3)  Step  1  -  Swap space                            ¡"
    echo "  ¡   4)  Step  2  -  System packages & Node.js             ¡"
    echo "  ¡   5)  Step  3  -  Firewall  (UFW + fail2ban)            ¡"
    echo "  ¡   6)  Step  4  -  npm install                           ¡"
    echo "  ¡   7)  Step  5  -  PostgreSQL database & user            ¡"
    echo "  ¡   8)  Step  6  -  .env configuration                    ¡"
    echo "  ¡   9)  Step  7  -  Uploads directory                     ¡"
    echo "  ¡  10)  Step  8  -  Database schema + admin account       ¡"
    echo "  ¡  11)  Step  9  -  Production build                      ¡"
    echo "  ¡  12)  Step 10  -  PM2 process management + Nginx + SSL         ¡"
    echo "  ¡                                                          ¡"
    echo "  ¡   0)  Exit                                               ¡"
    echo "  ¡                                                          ¡"
    echo "  ¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡¡"
    echo -e "${RESET}"
    echo -e "  ${YELLOW}Note: every step is safe to re-run - it skips work${RESET}"
    echo -e "  ${YELLOW}that is already done and only applies what's missing.${RESET}"
    echo ""
}

while true; do
    show_menu
    read -rp "  Enter choice [0-12]: " CHOICE

    case "$CHOICE" in
        0)
            echo "Exiting."; exit 0 ;;
        1)
            run_from 1  ;;
        2)
            do_step_0  ;;   # configuration setup
        3)
            run_from 1  ;;   # step 1 from the menu -> start from Step 1
        4)
            run_from 2 ;;
        5)
            run_from 3  ;;
        6)
            run_from 4 ;;
        7)
            run_from 5 ;;
        8)
            run_from 6 ;;
        9)
            run_from 7 ;;
        10)
            run_from 8 ;;
        11)
            run_from 9 ;;
        12)
            run_from 10 ;;
        *)
            echo -e "${RED}Invalid choice - please enter a number between 0 and 12.${RESET}"
            sleep 1 ;;
    esac

    echo ""
    read -rp "  Return to menu? [Y/n]: " AGAIN
    [[ "${AGAIN,,}" == "n" ]] && break
done
