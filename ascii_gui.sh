#!/usr/bin/env bash

# ASCII GUI Interface for Setup Script
# Provides visual menus and progress indicators using ASCII art

# Color definitions
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# GUI Functions
show_header() {
    clear
    echo -e "${BOLD}${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║${CYAN}                    MALEBOX SETUP SCRIPT                    ${RESET}║"
    echo "║${CYAN}                 By TJ BENJAMIN Services                 ${RESET}║"
    echo "╚═════════════════════════════════════════════════════════════════════╝"
    echo ""
}

show_menu_gui() {
    show_header
    echo -e "${BOLD}┌─────────────────────────────────────────────────────────────────┐${RESET}"
    echo -e "${BOLD}│${CYAN}  MAIN MENU${RESET}                                           │${RESET}"
    echo -e "${BOLD}├─────────────────────────────────────────────────────────┤${RESET}"
    echo -e "${BOLD}│${GREEN}  [1]${RESET} Full Setup (run all steps)                      │${RESET}"
    echo -e "${BOLD}│${GREEN}  [2]${RESET} Configuration Variables Setup                   │${RESET}"
    echo -e "${BOLD}│${GREEN}  [3]${RESET} Resume from Step 1                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [4]${RESET} Resume from Step 2                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [5]${RESET} Resume from Step 3                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [6]${RESET} Resume from Step 4                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [7]${RESET} Resume from Step 5                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [8]${RESET} Resume from Step 6                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [9]${RESET} Resume from Step 7                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [10]${RESET} Resume from Step 8                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [11]${RESET} Resume from Step 9                            │${RESET}"
    echo -e "${BOLD}│${GREEN}  [12]${RESET} Resume from Step 10                           │${RESET}"
    echo -e "${BOLD}│${GREEN}  [0]${RESET} Exit Setup                                    │${RESET}"
    echo -e "${BOLD}└─────────────────────────────────────────────────────────┘${RESET}"
    echo ""
    
    while true; do
        echo -n -e "${BOLD}Enter your choice [0-12]: ${RESET}"
        read -r CHOICE
        
        case "$CHOICE" in
            0) echo -e "${GREEN}Exiting setup...${RESET}"; exit 0 ;;
            1|2|3|4|5|6|7|8|9|10|11|12) 
                echo -e "${GREEN}Processing option $CHOICE...${RESET}"
                return "$CHOICE" ;;
            *) 
                echo -e "${RED}Invalid choice. Please select 0-12.${RESET}"
                sleep 1 ;;
        esac
    done
}

show_progress() {
    local message="$1"
    local percent="$2"
    local current="$3"
    local total="$4"
    
    echo -e "${BOLD}┌─────────────────────────────────────────────────────────┐${RESET}"
    echo -e "${BOLD}│${CYAN} PROGRESS: $message${RESET}                              │${RESET}"
    echo -e "${BOLD}│${GREEN} [${current}/${total}]${RESET} ${percent}%                              │${RESET}"
    echo -e "${BOLD}└─────────────────────────────────────────────────────────┘${RESET}"
    echo ""
}

show_status() {
    local status="$1"
    local message="$2"
    
    case "$status" in
        "info") echo -e "${BLUE}ℹ${RESET}  $message" ;;
        "success") echo -e "${GREEN}✓${RESET}  $message" ;;
        "warning") echo -e "${YELLOW}⚠${RESET}  $message" ;;
        "error") echo -e "${RED}✗${RESET}  $message" ;;
    *) echo -e "${BLUE}ℹ${RESET}  $message" ;;
    esac
}

# Loading animation
loading_animation() {
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠿")
    local i=0
    
    while [ $i -lt 8 ]; do
        echo -ne "\r${frames[$((i % 8))]} Loading..."
        sleep 0.1
        i=$((i + 1))
    done
    echo -ne "\rDone!"
}

# Usage information
show_usage() {
    echo -e "${BOLD}${CYAN}Usage: $0 [option]${RESET}"
    echo -e "${YELLOW}Options:${RESET}"
    echo "  -h, --help     Show this help message"
    echo "  -g, --gui     Show GUI interface instead of text menu"
    echo ""
    echo -e "${CYAN}Examples:${RESET}"
    echo "  $0 --gui        Show graphical interface"
    echo "  $0 1            Run full setup with GUI"
    echo ""
}

# Check if GUI mode is requested
if [[ "${1:-}" == "--gui" || "${1:-}" == "-g" ]]; then
    show_usage "$0"
    exit 0
fi
