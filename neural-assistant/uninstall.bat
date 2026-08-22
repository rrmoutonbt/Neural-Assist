@echo off
:: ============================================================================
:: Neural Assistant - Windows Uninstaller
:: Right-click > "Run as administrator" for system uninstall
:: ============================================================================

setlocal

net session >nul 2>&1
if %errorlevel% == 0 (
    set "INSTALL_MODE=system"
) else (
    set "INSTALL_MODE=user"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Mode %INSTALL_MODE% -Uninstall

pause
