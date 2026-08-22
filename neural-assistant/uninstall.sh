#!/usr/bin/env bash
# ============================================================================
# Neural Assistant — Uninstaller
# ============================================================================
# Usage:
#   sudo ./uninstall.sh           # Remove system-wide install
#   ./uninstall.sh --user         # Remove user-local install
#   ./uninstall.sh --keep-config  # Remove but keep config/data
# ============================================================================

set -euo pipefail

APP_NAME="neural-assistant"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_MODE="system"
KEEP_CONFIG=false

for arg in "$@"; do
    case $arg in
        --user)        INSTALL_MODE="user" ;;
        --keep-config) KEEP_CONFIG=true ;;
        --help|-h)
            sed -n '2,/^# ===/p' "$0" | head -n -1 | sed 's/^# //' | sed 's/^#//'
            exit 0 ;;
    esac
done

if [[ "$INSTALL_MODE" == "system" ]]; then
    INSTALL_DIR="/opt/${APP_NAME}"
    BIN_DIR="/usr/local/bin"
    CONFIG_DIR="/etc/${APP_NAME}"
    DATA_DIR="/var/lib/${APP_NAME}"
    LOG_DIR="/var/log/${APP_NAME}"
    SYSTEMD_DIR="/etc/systemd/system"

    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}[x] System uninstall requires root. Use 'sudo ./uninstall.sh'${NC}"
        exit 1
    fi
else
    INSTALL_DIR="${HOME}/.local/share/${APP_NAME}"
    BIN_DIR="${HOME}/.local/bin"
    CONFIG_DIR="${HOME}/.config/${APP_NAME}"
    DATA_DIR="${HOME}/.local/share/${APP_NAME}/data"
    LOG_DIR="${HOME}/.local/share/${APP_NAME}/logs"
    SYSTEMD_DIR="${HOME}/.config/systemd/user"
fi

echo -e "${YELLOW}Neural Assistant — Uninstaller${NC}"
echo ""

# Stop and disable service
echo -e "${GREEN}[+]${NC} Stopping service..."
if [[ "$INSTALL_MODE" == "system" ]]; then
    systemctl stop "${APP_NAME}" 2>/dev/null || true
    systemctl disable "${APP_NAME}" 2>/dev/null || true
    rm -f "${SYSTEMD_DIR}/${APP_NAME}.service"
    systemctl daemon-reload 2>/dev/null || true

    # Remove service user
    userdel neural-assistant 2>/dev/null || true
else
    systemctl --user stop "${APP_NAME}" 2>/dev/null || true
    systemctl --user disable "${APP_NAME}" 2>/dev/null || true
    rm -f "${SYSTEMD_DIR}/${APP_NAME}.service"
    systemctl --user daemon-reload 2>/dev/null || true
fi

# Remove CLI commands
echo -e "${GREEN}[+]${NC} Removing CLI commands..."
rm -f "${BIN_DIR}/neural-assistant"
rm -f "${BIN_DIR}/neural-assistant-server"

# Remove application files
echo -e "${GREEN}[+]${NC} Removing application files..."
rm -rf "$INSTALL_DIR"

# Optionally remove config and data
if [[ "$KEEP_CONFIG" == true ]]; then
    echo -e "${YELLOW}[!]${NC} Keeping config at ${CONFIG_DIR}"
    echo -e "${YELLOW}[!]${NC} Keeping data at ${DATA_DIR}"
else
    echo -e "${GREEN}[+]${NC} Removing config and data..."
    rm -rf "$CONFIG_DIR"
    rm -rf "$DATA_DIR"
    rm -rf "$LOG_DIR"
fi

echo ""
echo -e "${GREEN}Neural Assistant uninstalled successfully.${NC}"
