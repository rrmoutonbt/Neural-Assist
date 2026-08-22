@echo off
:: ============================================================================
:: Neural Assistant - Windows Installer Launcher
:: Right-click > "Run as administrator" for system install
:: Double-click for user-local install
:: ============================================================================

setlocal

:: Check if running as admin
net session >nul 2>&1
if %errorlevel% == 0 (
    set "INSTALL_MODE=system"
) else (
    set "INSTALL_MODE=user"
)

:: Forward any arguments
set "ARGS=%*"

:: Run PowerShell installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Mode %INSTALL_MODE% %ARGS%

if %errorlevel% neq 0 (
    echo.
    echo Installation failed. See errors above.
    pause
    exit /b 1
)

pause
