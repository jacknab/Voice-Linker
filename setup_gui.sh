#!/usr/bin/env bash

# =============================================================================
#  MALEBOX SETUP SCRIPT WITH ASCII GUI INTERFACE
#
#  Usage:
#    bash setup_gui.sh                    # GUI interface
#    bash setup_gui.sh --help             # Show help
#
#  Requirements:
#    - Ubuntu 22.04.5 LTS (Jammy Jellyfish)
#    - Node.js v22.12.0
#    - PostgreSQL 15.15
#
#  Features:
#    - ASCII GUI interface with visual menus
#    - Progress indicators and status displays
#    - Apache2 detection and handling
#    - Configuration variables setup
#    - Environment pollution prevention
# =============================================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# Source GUI functions
source "$(dirname "$0")/ascii_gui.sh"

# ─── GLOBAL CONFIGURATION ─────────────────────────────────────────────
APP_PORT=5062
DB_USER="malebox_user"
DB_NAME="malebox_chatline"
SERVICE_NAME="malebox"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${APP_DIR}/.setup_config"

# ─── ARGUMENT PARSING ─────────────────────────────────────────────────
AUTO_YES=false
DOMAIN=""
for ARG in "$@"; do
    case "$ARG" in
        --yes|-y) AUTO_YES=true ;;
        --help|-h) source "$(dirname "$0")/ascii_gui.sh" show_usage; exit 0 ;;
        *)        [[ -z "$DOMAIN" ]] && DOMAIN="$ARG" ;;
    esac
done

# ─── MAIN EXECUTION ───────────────────────────────────────────────────────
main() {
    # Load existing configuration
    load_config
    
    # Show header
    show_header
    
    # Show loading animation
    loading_animation
    
    # Show main menu
    show_menu_gui
    
    echo ""
    echo -e "${GREEN}Setup completed. Goodbye!${RESET}"
}

# Execute main function
main "$@"
