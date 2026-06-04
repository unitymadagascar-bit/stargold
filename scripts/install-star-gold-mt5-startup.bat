@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SOURCE=%SCRIPT_DIR%start-star-gold-mt5.bat"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP_DIR%\Start Star Gold MT5.bat"

if not exist "%SOURCE%" (
  echo Cannot find %SOURCE%
  exit /b 1
)

if not exist "%STARTUP_DIR%" (
  echo Cannot find Windows Startup folder:
  echo %STARTUP_DIR%
  exit /b 1
)

copy /Y "%SOURCE%" "%TARGET%" >nul
echo Star Gold By TSR startup script installed:
echo %TARGET%
echo Windows will launch MT5 after login. Save your MT5 XAUUSD profile with TradeTSRBridge attached.
