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

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info "App directory: $APP_DIR"

ENV_FILE="$APP_DIR/.env"
ENV_BACKUP=""
cleanup() {
  if [ -n "${ENV_BACKUP:-}" ] && [ -f "$ENV_BACKUP" ]; then
    rm -f "$ENV_BACKUP"
  fi
}
trap cleanup EXIT

if [ -f "$ENV_FILE" ]; then
  ENV_BACKUP="$(mktemp)"
  cp -p "$ENV_FILE" "$ENV_BACKUP"
  cd "$APP_DIR"
  git update-index --skip-worktree .env 2>/dev/null || true
  info "Protected local .env from git pull changes."
fi

# ── 1. Discard local changes to server-generated files ───────────────────────
# These files are auto-generated at runtime (SEO pages, sitemap, robots.txt).
# They change on every server restart so they always conflict with git pull.
info "Resetting auto-generated files before pull..."
GENERATED_FILES=(
  "client/public/sitemap.xml"
  "client/public/robots.txt"
  "client/public/regions/index.html"
)
for f in "${GENERATED_FILES[@]}"; do
  if git ls-files --error-unmatch "$APP_DIR/$f" &>/dev/null 2>&1; then
    git checkout -- "$APP_DIR/$f" 2>/dev/null && info "  Reset: $f" || true
  fi
done
success "Generated files reset."

# ── 2. Pull latest code ───────────────────────────────────────────────────────
info "Pulling latest code from GitHub..."
cd "$APP_DIR"
git pull origin main
if [ -n "${ENV_BACKUP:-}" ] && [ -f "$ENV_BACKUP" ]; then
  if [ ! -f "$ENV_FILE" ] || ! cmp -s "$ENV_FILE" "$ENV_BACKUP"; then
    cp -p "$ENV_BACKUP" "$ENV_FILE"
    info "Restored local .env after pull."
  fi
  chmod 600 "$ENV_FILE" 2>/dev/null || true
fi
success "Code updated."

# ── 3. Install dependencies ───────────────────────────────────────────────────
info "Installing dependencies..."
npm install --legacy-peer-deps
success "Dependencies installed."

# ── 4. Run database migrations ────────────────────────────────────────────────
info "Applying database migrations..."
npm run db:push
success "Migrations applied."

# ── 5. Build ──────────────────────────────────────────────────────────────────
info "Building production bundle..."
npm run build
success "Build complete."

# ── 6. Force-reload PM2 with fresh config ────────────────────────────────────
# ecosystem.config.cjs now uses __dirname so paths are always correct.
# We delete + re-start so PM2 picks up the config fresh every time.
info "Restarting PM2..."
pm2 delete malebox 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.cjs"
pm2 save --force
success "PM2 restarted."

echo ""
success "Done! Your site should now be running the latest build."
pm2 status malebox
