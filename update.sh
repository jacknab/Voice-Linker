#!/usr/bin/env bash
# =============================================================================
#  update.sh  —  Pull latest code, rebuild, and restart PM2
#  Run from your git repo directory on the VPS:
#    bash update.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# Always use the directory this script lives in as the app root
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info "App directory: $APP_DIR"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
info "Pulling latest code from GitHub..."
cd "$APP_DIR"
git stash 2>/dev/null || true
git pull origin main
success "Code updated."

# ── 2. Install dependencies ───────────────────────────────────────────────────
info "Installing dependencies..."
npm install --legacy-peer-deps
success "Dependencies installed."

# ── 3. Build ──────────────────────────────────────────────────────────────────
info "Building production bundle..."
npm run build
success "Build complete — dist/ is ready at $APP_DIR/dist/"

# ── 4. Rewrite ecosystem.config.cjs with correct paths ───────────────────────
# Do this BEFORE touching PM2 so the config is correct when we start
info "Patching ecosystem.config.cjs → cwd: $APP_DIR"
sed -i "s|cwd: '.*'|cwd: '${APP_DIR}'|g" ecosystem.config.cjs
sed -i "s|env_file: '.*'|env_file: '${APP_DIR}/.env'|g" ecosystem.config.cjs
sed -i "s|error_file: '.*'|error_file: '${APP_DIR}/logs/pm2-error.log'|g" ecosystem.config.cjs
sed -i "s|out_file: '.*'|out_file: '${APP_DIR}/logs/pm2-out.log'|g" ecosystem.config.cjs

# Make sure the logs directory exists
mkdir -p "$APP_DIR/logs"
success "ecosystem.config.cjs patched."

# ── 5. Force-reload PM2 with the new config ───────────────────────────────────
# pm2 restart does NOT re-read the ecosystem file — we must delete + re-start
info "Stopping and removing old PM2 process..."
pm2 delete malebox 2>/dev/null || true

info "Starting PM2 with updated config..."
pm2 start "$APP_DIR/ecosystem.config.cjs"
pm2 save --force
success "PM2 process 'malebox' started fresh from $APP_DIR."

echo ""
success "Update complete! Your site should now be running the latest build."
pm2 status malebox
