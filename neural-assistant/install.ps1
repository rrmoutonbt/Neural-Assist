# ============================================================================
# Neural Assistant — Windows Installer
# ============================================================================
# Usage:
#   .\install.ps1                    # User-local install (default)
#   .\install.ps1 -Mode system       # System-wide install (requires admin)
#   .\install.ps1 -Full              # Include GPU/ML dependencies
#   .\install.ps1 -Mode system -Full # System + GPU/ML
#
# After install:
#   neural-assistant                 # Interactive CLI chat
#   neural-assistant-server          # Start API server (port 8000)
# ============================================================================

param(
    [ValidateSet("user", "system")]
    [string]$Mode = "user",
    [switch]$Full,
    [switch]$Local,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$AppName = "NeuralAssistant"
$AppVersion = "1.0.0"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonMinVersion = [version]"3.10"

# --- Colors & Helpers --------------------------------------------------------

function Write-Banner {
    Write-Host ""
    Write-Host "  _   _                      _     _            _     _              _   " -ForegroundColor Cyan
    Write-Host " | \ | | ___ _   _ _ __ __ _| |   / \   ___ ___(_)___| |_ __ _ _ __ | |_ " -ForegroundColor Cyan
    Write-Host " |  \| |/ _ \ | | | '__/ `` | |  / _ \ / __/ __| / __| __/ `` | '_ \| __|" -ForegroundColor Cyan
    Write-Host " | |\  |  __/ |_| | | | (_| | | / ___ \\__ \\__ \ \__ \ || (_| | | | | |_ " -ForegroundColor Cyan
    Write-Host " |_| \_|\___|\__,_|_|  \__,_|_|/_/   \_\___/___/_|___/\__\__,_|_| |_|\__|" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Windows Installer v$AppVersion" -ForegroundColor Blue
    Write-Host ""
}

function Log   ($msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Info  ($msg) { Write-Host "[i] $msg" -ForegroundColor Blue }
function Warn  ($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Err   ($msg) { Write-Host "[x] $msg" -ForegroundColor Red }

# --- Paths -------------------------------------------------------------------

if ($Mode -eq "system") {
    $InstallDir  = "$env:ProgramFiles\$AppName"
    $ConfigDir   = "$env:ProgramData\$AppName"
    $DataDir     = "$env:ProgramData\$AppName\data"
    $LogDir      = "$env:ProgramData\$AppName\logs"

    # Verify admin
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Err "System install requires administrator privileges."
        Err "Right-click install.bat > 'Run as administrator', or use: .\install.ps1 -Mode user"
        exit 1
    }
} else {
    $InstallDir  = "$env:LOCALAPPDATA\$AppName"
    $ConfigDir   = "$env:APPDATA\$AppName"
    $DataDir     = "$env:LOCALAPPDATA\$AppName\data"
    $LogDir      = "$env:LOCALAPPDATA\$AppName\logs"
}

$VenvDir = "$InstallDir\venv"
$AppDir  = "$InstallDir\app"

# --- Uninstall ---------------------------------------------------------------

if ($Uninstall) {
    Write-Host "Neural Assistant - Uninstaller" -ForegroundColor Yellow
    Write-Host ""

    # Remove from PATH
    Log "Removing from PATH..."
    if ($Mode -eq "system") {
        $envPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        $newPath = ($envPath -split ";" | Where-Object { $_ -ne "$InstallDir\bin" }) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
    } else {
        $envPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $newPath = ($envPath -split ";" | Where-Object { $_ -ne "$InstallDir\bin" }) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    }

    # Remove Start Menu shortcuts
    Log "Removing shortcuts..."
    $startMenu = if ($Mode -eq "system") {
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\$AppName"
    } else {
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\$AppName"
    }
    if (Test-Path $startMenu) { Remove-Item $startMenu -Recurse -Force }

    # Remove Desktop shortcut
    $desktop = [Environment]::GetFolderPath("Desktop")
    Remove-Item "$desktop\Neural Assistant.lnk" -Force -ErrorAction SilentlyContinue
    Remove-Item "$desktop\Neural Assistant Server.lnk" -Force -ErrorAction SilentlyContinue

    # Remove application
    Log "Removing application files..."
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }

    Log "Removing config and data..."
    if (Test-Path $ConfigDir) { Remove-Item $ConfigDir -Recurse -Force }

    Write-Host ""
    Write-Host "Neural Assistant uninstalled successfully." -ForegroundColor Green
    exit 0
}

# --- Preflight ---------------------------------------------------------------

Write-Banner

Log "Checking prerequisites..."

# Find Python
$PythonCmd = $null
foreach ($candidate in @("python3", "python", "py")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) {
        try {
            $verStr = & $cmd.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            $ver = [version]$verStr
            if ($ver -ge $PythonMinVersion) {
                $PythonCmd = $cmd.Source
                break
            }
        } catch { continue }
    }
}

# Try 'py' launcher with version flag
if (-not $PythonCmd) {
    $pyLauncher = Get-Command "py" -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        try {
            $verStr = & py -3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            $ver = [version]$verStr
            if ($ver -ge $PythonMinVersion) {
                $PythonCmd = "py -3"
            }
        } catch {}
    }
}

if (-not $PythonCmd) {
    Err "Python >= $PythonMinVersion is required but not found."
    Err ""
    Err "Install Python from: https://www.python.org/downloads/"
    Err "  - Check 'Add python.exe to PATH' during installation"
    Err "  - Restart your terminal after installing"
    exit 1
}

$PythonVer = & $PythonCmd --version 2>&1
Log "Found $PythonVer ($PythonCmd)"

# Check venv
try {
    & $PythonCmd -m venv --help | Out-Null
} catch {
    Err "Python venv module not available. Reinstall Python with default options."
    exit 1
}

# --- Install -----------------------------------------------------------------

Log "Install mode:  $Mode"
Log "Install dir:   $InstallDir"
Log "Config dir:    $ConfigDir"
$depLabel = if ($Full) { "full (GPU/ML)" } else { "slim (CPU only)" }
if ($Local) { $depLabel += " + local LLM" }
Log "Dependencies:  $depLabel"
Write-Host ""

# Create directories
Log "Creating directories..."
foreach ($dir in @($InstallDir, "$InstallDir\bin", $ConfigDir, $DataDir, $LogDir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# Copy application files
Log "Copying application files..."
if (Test-Path $AppDir) { Remove-Item $AppDir -Recurse -Force }
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

# Copy files (excluding installer artifacts, caches, logs)
$excludeDirs = @("venv", "__pycache__", ".git")
Get-ChildItem -Path $ScriptDir -Recurse -Force |
    Where-Object {
        $relativePath = $_.FullName.Substring($ScriptDir.Length + 1)
        $skip = $false
        foreach ($ex in $excludeDirs) {
            if ($relativePath -like "$ex\*" -or $relativePath -eq $ex) { $skip = $true; break }
        }
        if ($_.Name -match '^\.(git|env)' -and $_.PSIsContainer) { $skip = $true }
        if ($_.Name -in @("install.sh", "uninstall.sh", "neural_assistant.log", "tool_audit.jsonl")) { $skip = $true }
        if ($_.Extension -eq ".pyc") { $skip = $true }
        -not $skip
    } |
    ForEach-Object {
        $dest = $_.FullName.Replace($ScriptDir, $AppDir)
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
        } else {
            $destDir = Split-Path $dest -Parent
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            Copy-Item $_.FullName -Destination $dest -Force
        }
    }

# Copy config files (don't overwrite existing)
Log "Setting up configuration..."
$configSource = Join-Path $ScriptDir "config"
if (Test-Path $configSource) {
    Get-ChildItem "$configSource\*.yaml" | ForEach-Object {
        $dest = Join-Path $ConfigDir $_.Name
        if (-not (Test-Path $dest)) {
            Copy-Item $_.FullName $dest
        }
    }
}

# Create .env template if not present
$envFile = Join-Path $ConfigDir ".env"
if (-not (Test-Path $envFile)) {
    Log "Creating .env template..."
    @"
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
"@ | Set-Content $envFile -Encoding UTF8
}

# Create virtual environment
Log "Creating virtual environment..."
& $PythonCmd -m venv $VenvDir

# Install dependencies
Log "Installing dependencies (this may take a few minutes)..."
$pipExe = Join-Path $VenvDir "Scripts\pip.exe"
$pythonExe = Join-Path $VenvDir "Scripts\python.exe"

& $pipExe install --upgrade pip setuptools wheel -q

if ($Full) {
    & $pipExe install -r "$AppDir\neural_assistant_requirements.txt" -q
} else {
    & $pipExe install -r "$AppDir\requirements-slim.txt" -q
}

if ($Local -or $Full) {
    Log "Installing local LLM dependencies..."
    & $pipExe install -r "$AppDir\requirements-local.txt" -q 2>$null
    if ($LASTEXITCODE -ne 0) {
        Warn "llama-cpp-python install failed (C compiler may be missing). Local LLM will use transformers backend only."
    }
}

# --- Create CLI launchers (.bat + .ps1) ---------------------------------------

Log "Creating CLI commands..."

$binDir = "$InstallDir\bin"

# neural-assistant.bat (interactive CLI)
@"
@echo off
setlocal

set "NEURAL_ASSISTANT_ENV=%NEURAL_ASSISTANT_ENV%"
if "%NEURAL_ASSISTANT_ENV%"=="" set "NEURAL_ASSISTANT_ENV=local"

:: Load env file
for /f "usebackq tokens=1,* delims==" %%a in ("$ConfigDir\.env") do (
    set "line=%%a"
    if not "!line:~0,1!"=="#" if not "%%a"=="" set "%%a=%%b"
)

"$VenvDir\Scripts\python.exe" "$AppDir\neural_assistant.py" %*
"@ | Set-Content "$binDir\neural-assistant.bat" -Encoding ASCII

# neural-assistant-server.bat (API server)
@"
@echo off
setlocal

set "NEURAL_ASSISTANT_ENV=%NEURAL_ASSISTANT_ENV%"
if "%NEURAL_ASSISTANT_ENV%"=="" set "NEURAL_ASSISTANT_ENV=local"

:: Load env file
for /f "usebackq tokens=1,* delims==" %%a in ("$ConfigDir\.env") do (
    set "line=%%a"
    if not "!line:~0,1!"=="#" if not "%%a"=="" set "%%a=%%b"
)

"$VenvDir\Scripts\python.exe" "$AppDir\neural_assistant_api_server.py" %*
"@ | Set-Content "$binDir\neural-assistant-server.bat" -Encoding ASCII

# PowerShell launcher (better env loading)
@"
# Neural Assistant — PowerShell Launcher
param([switch]`$Server)

`$env:NEURAL_ASSISTANT_ENV = if (`$env:NEURAL_ASSISTANT_ENV) { `$env:NEURAL_ASSISTANT_ENV } else { "local" }

# Load .env file
`$envFile = "$ConfigDir\.env"
if (Test-Path `$envFile) {
    Get-Content `$envFile | ForEach-Object {
        if (`$_ -match '^\s*([^#][^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable(`$matches[1].Trim(), `$matches[2].Trim(), "Process")
        }
    }
}

`$pythonExe = "$VenvDir\Scripts\python.exe"
`$appDir = "$AppDir"

if (`$Server) {
    & `$pythonExe "`$appDir\neural_assistant_api_server.py" @args
} else {
    & `$pythonExe "`$appDir\neural_assistant.py" @args
}
"@ | Set-Content "$binDir\neural-assistant.ps1" -Encoding UTF8

# --- Add to PATH -------------------------------------------------------------

Log "Adding to PATH..."
$scope = if ($Mode -eq "system") { "Machine" } else { "User" }
$currentPath = [Environment]::GetEnvironmentVariable("Path", $scope)

if ($currentPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$binDir", $scope)
    # Update current session too
    $env:Path = "$env:Path;$binDir"
    Log "Added $binDir to $scope PATH"
} else {
    Info "$binDir already in PATH"
}

# --- Create Start Menu shortcuts ----------------------------------------------

Log "Creating shortcuts..."

$startMenuDir = if ($Mode -eq "system") {
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\$AppName"
} else {
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\$AppName"
}
New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null

$WshShell = New-Object -ComObject WScript.Shell

# CLI shortcut
$shortcut = $WshShell.CreateShortcut("$startMenuDir\Neural Assistant.lnk")
$shortcut.TargetPath = "cmd.exe"
$shortcut.Arguments = "/k `"$binDir\neural-assistant.bat`""
$shortcut.WorkingDirectory = $AppDir
$shortcut.Description = "Neural Assistant - Interactive Chat"
$shortcut.Save()

# Server shortcut
$shortcut = $WshShell.CreateShortcut("$startMenuDir\Neural Assistant Server.lnk")
$shortcut.TargetPath = "cmd.exe"
$shortcut.Arguments = "/k `"$binDir\neural-assistant-server.bat`""
$shortcut.WorkingDirectory = $AppDir
$shortcut.Description = "Neural Assistant - API Server"
$shortcut.Save()

# Config folder shortcut
$shortcut = $WshShell.CreateShortcut("$startMenuDir\Configuration.lnk")
$shortcut.TargetPath = $ConfigDir
$shortcut.Description = "Neural Assistant - Configuration Files"
$shortcut.Save()

# Uninstaller shortcut
$shortcut = $WshShell.CreateShortcut("$startMenuDir\Uninstall.lnk")
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$AppDir\install.ps1`" -Mode $Mode -Uninstall"
$shortcut.Description = "Uninstall Neural Assistant"
$shortcut.Save()

# Desktop shortcut (optional)
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcut = $WshShell.CreateShortcut("$desktop\Neural Assistant.lnk")
$shortcut.TargetPath = "cmd.exe"
$shortcut.Arguments = "/k `"$binDir\neural-assistant.bat`""
$shortcut.WorkingDirectory = $AppDir
$shortcut.Description = "Neural Assistant - Interactive Chat"
$shortcut.Save()

# --- Verify installation ------------------------------------------------------

Log "Verifying installation..."

$verifyScript = @"
import sys
sys.path.insert(0, r'$AppDir')
try:
    from neural_assistant_config import NeuralAssistantConfigFactory
    print('  Config system: OK')
except Exception as e:
    print(f'  Config system: FAIL ({e})')
try:
    from mathematical_core import MathematicalCore
    print('  Math core:     OK')
except Exception as e:
    print(f'  Math core:     FAIL ({e})')
try:
    from bee_bot_cognitive_framework import CognitiveBeeBot
    print('  Cognitive:     OK')
except Exception as e:
    print(f'  Cognitive:     FAIL ({e})')
"@

& $pythonExe -c $verifyScript

# --- Done ---------------------------------------------------------------------

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Green
Write-Host "  Neural Assistant installed successfully!" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Quick start:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    1. Configure API keys:" -ForegroundColor White
Write-Host "       notepad $ConfigDir\.env" -ForegroundColor Yellow
Write-Host ""
Write-Host "    2. Interactive chat (open a NEW terminal first):" -ForegroundColor White
Write-Host "       neural-assistant" -ForegroundColor Yellow
Write-Host ""
Write-Host "    3. Start API server:" -ForegroundColor White
Write-Host "       neural-assistant-server" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Paths:" -ForegroundColor Cyan
Write-Host "    App:    $AppDir"
Write-Host "    Config: $ConfigDir"
Write-Host "    Data:   $DataDir"
Write-Host "    Logs:   $LogDir"
Write-Host "    Venv:   $VenvDir"
Write-Host ""
Write-Host "  Shortcuts added to Start Menu and Desktop." -ForegroundColor Blue
Write-Host "  NOTE: Open a NEW terminal for PATH changes to take effect." -ForegroundColor Yellow
Write-Host ""
