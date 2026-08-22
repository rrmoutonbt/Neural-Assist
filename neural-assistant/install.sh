#!/usr/bin/env bash
# ============================================================================
# Neural Assistant — Local Linux Installer
# ============================================================================
# Installs Neural Assistant as a local service on Linux.
#
# Usage:
#   sudo ./install.sh              # Full install (system-wide)
#   ./install.sh --user            # User-local install (~/.local/)
#   ./install.sh --full            # Include GPU/ML dependencies
#   ./install.sh --user --full     # User-local + GPU/ML
#   ./install.sh --uninstall       # Remove installation
#
# After install:
#   neural-assistant               # Interactive CLI chat
#   neural-assistant-server        # Start API server (port 8000)
#   sudo systemctl start neural-assistant  # Run as systemd service
# ============================================================================

set -euo pipefail

# --- Configuration -----------------------------------------------------------

APP_NAME="neural-assistant"
APP_VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Defaults
INSTALL_MODE="system"
INSTALL_FULL=false
INSTALL_LOCAL=false
PYTHON_MIN_VERSION="3.10"

# Parse arguments
for arg in "$@"; do
    case $arg in
        --user)     INSTALL_MODE="user" ;;
        --full)     INSTALL_FULL=true ;;
        --local)    INSTALL_LOCAL=true ;;
        --uninstall) exec "$SCRIPT_DIR/uninstall.sh" "$@"; exit ;;
        --help|-h)
            sed -n '2,/^# ===/p' "$0" | head -n -1 | sed 's/^# //' | sed 's/^#//'
            exit 0 ;;
        *) echo -e "${RED}Unknown option: $arg${NC}"; exit 1 ;;
    esac
done

# Set paths based on install mode
if [[ "$INSTALL_MODE" == "system" ]]; then
    INSTALL_DIR="/opt/${APP_NAME}"
    BIN_DIR="/usr/local/bin"
    CONFIG_DIR="/etc/${APP_NAME}"
    DATA_DIR="/var/lib/${APP_NAME}"
    LOG_DIR="/var/log/${APP_NAME}"
    SYSTEMD_DIR="/etc/systemd/system"
    NEED_ROOT=true
else
    INSTALL_DIR="${HOME}/.local/share/${APP_NAME}"
    BIN_DIR="${HOME}/.local/bin"
    CONFIG_DIR="${HOME}/.config/${APP_NAME}"
    DATA_DIR="${HOME}/.local/share/${APP_NAME}/data"
    LOG_DIR="${HOME}/.local/share/${APP_NAME}/logs"
    SYSTEMD_DIR="${HOME}/.config/systemd/user"
    NEED_ROOT=false
fi

VENV_DIR="${INSTALL_DIR}/venv"

# --- Helper functions ---------------------------------------------------------

log()    { echo -e "${GREEN}[+]${NC} $*"; }
info()   { echo -e "${BLUE}[i]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
error()  { echo -e "${RED}[x]${NC} $*" >&2; }
banner() {
    echo -e "${CYAN}"
    echo "  _   _                      _     _            _     _              _   "
    echo " | \ | | ___ _   _ _ __ __ _| |   / \   ___ ___(_)___| |_ __ _ _ __ | |_ "
    echo " |  \| |/ _ \ | | | '__/ _\` | |  / _ \ / __/ __| / __| __/ _\` | '_ \| __|"
    echo " | |\  |  __/ |_| | | | (_| | | / ___ \\\\__ \\__ \\ \\__ \\ || (_| | | | | |_ "
    echo " |_| \_|\___|\__,_|_|  \__,_|_|/_/   \_\\___/___/_|___/\__\__,_|_| |_|\__|"
    echo -e "${NC}"
    echo -e "  ${BLUE}Local Linux Installer v${APP_VERSION}${NC}"
    echo ""
}

check_root() {
    if [[ "$NEED_ROOT" == true ]] && [[ $EUID -ne 0 ]]; then
        error "System-wide install requires root. Use 'sudo ./install.sh' or './install.sh --user'"
        exit 1
    fi
}

find_python() {
    local candidates=("python3.12" "python3.11" "python3.10" "python3")
    for cmd in "${candidates[@]}"; do
        if command -v "$cmd" &>/dev/null; then
            local ver
            ver=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)
            if python3 -c "
import sys
min_parts = '${PYTHON_MIN_VERSION}'.split('.')
ver_parts = '${ver}'.split('.')
sys.exit(0 if (int(ver_parts[0]), int(ver_parts[1])) >= (int(min_parts[0]), int(min_parts[1])) else 1)
" 2>/dev/null; then
                echo "$cmd"
                return 0
            fi
        fi
    done
    return 1
}

# --- Preflight checks ---------------------------------------------------------

banner
check_root

log "Checking prerequisites..."

# Python
PYTHON_CMD=$(find_python) || {
    error "Python >= ${PYTHON_MIN_VERSION} is required but not found."
    error "Install it with: sudo apt install python3.11 python3.11-venv  (Debian/Ubuntu)"
    error "                 sudo dnf install python3.11                  (Fedora/RHEL)"
    exit 1
}
PYTHON_VER=$("$PYTHON_CMD" --version 2>&1)
log "Found ${PYTHON_VER} (${PYTHON_CMD})"

# python3-venv
if ! "$PYTHON_CMD" -m venv --help &>/dev/null; then
    error "python3-venv is required. Install: sudo apt install python3-venv"
    exit 1
fi

# pip
if ! "$PYTHON_CMD" -m pip --version &>/dev/null; then
    warn "pip not found, will attempt to bootstrap via ensurepip"
fi

# --- Install ------------------------------------------------------------------

log "Install mode: ${INSTALL_MODE}"
log "Install dir:  ${INSTALL_DIR}"
log "Config dir:   ${CONFIG_DIR}"
DEP_LABEL="slim (CPU only)"
if $INSTALL_FULL; then DEP_LABEL="full (GPU/ML)"; fi
if $INSTALL_LOCAL; then DEP_LABEL="${DEP_LABEL} + local LLM"; fi
log "Dependencies: ${DEP_LABEL}"
echo ""

# Create directories
log "Creating directories..."
mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"

# Copy application files
log "Copying application files..."
rsync -a --delete \
    --exclude='venv/' \
    --exclude='__pycache__/' \
    --exclude='*.pyc' \
    --exclude='.git/' \
    --exclude='install.sh' \
    --exclude='uninstall.sh' \
    --exclude='neural_assistant.log' \
    --exclude='tool_audit.jsonl' \
    "$SCRIPT_DIR/" "$INSTALL_DIR/app/"

# Copy config files if not already present (don't overwrite user configs)
for cfg in development.yaml staging.yaml production.yaml local.yaml; do
    if [[ ! -f "${CONFIG_DIR}/${cfg}" ]] && [[ -f "${SCRIPT_DIR}/config/${cfg}" ]]; then
        cp "${SCRIPT_DIR}/config/${cfg}" "${CONFIG_DIR}/${cfg}"
    fi
done

# Create .env template if not present
if [[ ! -f "${CONFIG_DIR}/.env" ]]; then
    log "Creating .env template..."
    cat > "${CONFIG_DIR}/.env" << 'ENVEOF'
# Neural Assistant - Environment Configuration
# Uncomment and set the providers you want to use.

NEURAL_ASSISTANT_ENV=local

# --- LLM Providers (set at least one) ---
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_API_KEY=AI...

# --- Ollama (local, no API key needed) ---
# OLLAMA_BASE_URL=http://localhost:11434

# --- Local LLM (in-process, no server needed) ---
# LOCAL_LLM_ENABLED=true
# LOCAL_LLM_MODEL=llama-3.2-3b
# LOCAL_LLM_DEVICE=auto
# LOCAL_LLM_CACHE_DIR=~/.cache/neural-assistant/models

# --- Server ---
# NEURAL_ASSISTANT_HOST=0.0.0.0
# NEURAL_ASSISTANT_PORT=8000

# --- Database (optional, defaults to SQLite) ---
# DATABASE_URL=sqlite:///neural_assistant.db
# REDIS_URL=redis://localhost:6379/0

# --- Security ---
# JWT_SECRET=change-me-to-a-random-string
# ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
ENVEOF
fi

# Create Python virtual environment
log "Creating virtual environment..."
"$PYTHON_CMD" -m venv "$VENV_DIR"

# Activate and install dependencies
log "Installing dependencies (this may take a few minutes)..."
source "$VENV_DIR/bin/activate"

pip install --upgrade pip setuptools wheel -q

if $INSTALL_FULL; then
    pip install -r "$INSTALL_DIR/app/neural_assistant_requirements.txt" -q
else
    pip install -r "$INSTALL_DIR/app/requirements-slim.txt" -q
fi

if $INSTALL_LOCAL || $INSTALL_FULL; then
    log "Installing local LLM dependencies..."
    pip install -r "$INSTALL_DIR/app/requirements-local.txt" -q 2>/dev/null || \
        warn "llama-cpp-python install failed (C compiler may be missing). Local LLM will use transformers backend only."
fi

deactivate

# --- Create CLI launchers -----------------------------------------------------

log "Creating CLI commands..."

# neural-assistant (interactive CLI)
cat > "${BIN_DIR}/neural-assistant" << CLIEOF
#!/usr/bin/env bash
# Neural Assistant — Interactive CLI
set -euo pipefail

export NEURAL_ASSISTANT_ENV="\${NEURAL_ASSISTANT_ENV:-local}"

# Load env file
ENV_FILE="${CONFIG_DIR}/.env"
if [[ -f "\$ENV_FILE" ]]; then
    set -a
    source "\$ENV_FILE"
    set +a
fi

# Activate venv and run
source "${VENV_DIR}/bin/activate"
cd "${INSTALL_DIR}/app"
exec python neural_assistant.py "\$@"
CLIEOF
chmod +x "${BIN_DIR}/neural-assistant"

# neural-assistant-server (API server)
cat > "${BIN_DIR}/neural-assistant-server" << SRVEOF
#!/usr/bin/env bash
# Neural Assistant — API Server
set -euo pipefail

export NEURAL_ASSISTANT_ENV="\${NEURAL_ASSISTANT_ENV:-local}"

# Load env file
ENV_FILE="${CONFIG_DIR}/.env"
if [[ -f "\$ENV_FILE" ]]; then
    set -a
    source "\$ENV_FILE"
    set +a
fi

# Activate venv and run
source "${VENV_DIR}/bin/activate"
cd "${INSTALL_DIR}/app"
exec python neural_assistant_api_server.py "\$@"
SRVEOF
chmod +x "${BIN_DIR}/neural-assistant-server"

# --- Systemd service ----------------------------------------------------------

log "Installing systemd service..."

if [[ "$INSTALL_MODE" == "system" ]]; then
    cat > "${SYSTEMD_DIR}/${APP_NAME}.service" << SVCEOF
[Unit]
Description=Neural Assistant API Server
Documentation=https://github.com/banc-of-el/neural-assistant
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=neural-assistant
Group=neural-assistant
WorkingDirectory=${INSTALL_DIR}/app
EnvironmentFile=${CONFIG_DIR}/.env
ExecStart=${VENV_DIR}/bin/python neural_assistant_api_server.py
Restart=on-failure
RestartSec=5
StartLimitBurst=3
StartLimitIntervalSec=60

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${DATA_DIR} ${LOG_DIR}
PrivateTmp=yes

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP_NAME}

[Install]
WantedBy=multi-user.target
SVCEOF

    # Create service user if it doesn't exist
    if ! id -u neural-assistant &>/dev/null 2>&1; then
        useradd --system --no-create-home --shell /usr/sbin/nologin neural-assistant 2>/dev/null || true
    fi
    chown -R neural-assistant:neural-assistant "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR" 2>/dev/null || true

    systemctl daemon-reload
    log "Systemd service installed. Enable with: sudo systemctl enable --now ${APP_NAME}"

else
    mkdir -p "$SYSTEMD_DIR"
    cat > "${SYSTEMD_DIR}/${APP_NAME}.service" << SVCEOF
[Unit]
Description=Neural Assistant API Server (user)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}/app
EnvironmentFile=${CONFIG_DIR}/.env
ExecStart=${VENV_DIR}/bin/python neural_assistant_api_server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
SVCEOF

    systemctl --user daemon-reload 2>/dev/null || true
    log "User systemd service installed. Enable with: systemctl --user enable --now ${APP_NAME}"
fi

# --- Verify installation ------------------------------------------------------

log "Verifying installation..."

if "${VENV_DIR}/bin/python" -c "
import sys
sys.path.insert(0, '${INSTALL_DIR}/app')
from neural_assistant_config import NeuralAssistantConfigFactory
print('  Config system: OK')
from mathematical_core import MathematicalCore
print('  Math core:     OK')
from bee_bot_cognitive_framework import CognitiveBeeBot
print('  Cognitive:     OK')
" 2>/dev/null; then
    log "Core modules verified successfully."
else
    warn "Some modules failed to import — check dependencies."
fi

# --- Done ---------------------------------------------------------------------

echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}  Neural Assistant installed successfully!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "  ${CYAN}Quick start:${NC}"
echo ""
echo -e "    1. Configure API keys:"
echo -e "       ${YELLOW}nano ${CONFIG_DIR}/.env${NC}"
echo ""
echo -e "    2. Interactive chat:"
echo -e "       ${YELLOW}neural-assistant${NC}"
echo ""
echo -e "    3. Start API server:"
echo -e "       ${YELLOW}neural-assistant-server${NC}"
echo ""
if [[ "$INSTALL_MODE" == "system" ]]; then
echo -e "    4. Run as a service:"
echo -e "       ${YELLOW}sudo systemctl enable --now ${APP_NAME}${NC}"
else
echo -e "    4. Run as a service:"
echo -e "       ${YELLOW}systemctl --user enable --now ${APP_NAME}${NC}"
echo ""
echo -e "    ${BLUE}Note: Ensure ${BIN_DIR} is in your PATH${NC}"
fi
echo ""
echo -e "  ${CYAN}Paths:${NC}"
echo -e "    App:    ${INSTALL_DIR}/app/"
echo -e "    Config: ${CONFIG_DIR}/"
echo -e "    Data:   ${DATA_DIR}/"
echo -e "    Logs:   ${LOG_DIR}/"
echo -e "    Venv:   ${VENV_DIR}/"
echo ""
echo -e "  ${CYAN}Commands:${NC}"
echo -e "    neural-assistant          Interactive CLI"
echo -e "    neural-assistant-server   API server (port 8000)"
echo ""
echo -e "  To uninstall: ${YELLOW}$(dirname "$0")/uninstall.sh${NC}"
echo ""
