#!/usr/bin/env bash
# =============================================================================
#  update.sh  —  Pull latest code, rebuild, and restart PM2
#  Run this from your git repo directory on the VPS:
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
success "Build complete."

# ── 4. Update ecosystem.config.cjs to point to this directory ─────────────────
# Patch the cwd in ecosystem.config.cjs so PM2 uses the right folder
if grep -q "cwd:" ecosystem.config.cjs; then
  sed -i "s|cwd: '.*'|cwd: '${APP_DIR}'|g" ecosystem.config.cjs
  info "Updated ecosystem.config.cjs cwd → $APP_DIR"
fi

# Also update the .env path reference if it still points to /apps/chatline
if grep -q "/apps/chatline" ecosystem.config.cjs; then
  sed -i "s|/apps/chatline|${APP_DIR}|g" ecosystem.config.cjs
  info "Updated ecosystem.config.cjs env paths → $APP_DIR"
fi

# ── 5. Restart PM2 ────────────────────────────────────────────────────────────
info "Restarting PM2..."

# Check if the process exists in PM2
if pm2 list | grep -q "malebox"; then
  pm2 restart malebox --update-env
  success "PM2 process 'malebox' restarted."
else
  # If not registered, start it fresh from ecosystem config
  info "No existing PM2 process found — starting fresh..."
  pm2 start ecosystem.config.cjs
  pm2 save
  success "PM2 process 'malebox' started."
fi

echo ""
success "Update complete! Check your site — it should be running the latest code."
pm2 status malebox
