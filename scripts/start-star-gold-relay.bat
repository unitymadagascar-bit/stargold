@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "RELAY_SCRIPT=%SCRIPT_DIR%local-mt5-cloud-relay.mjs"
set "LOG_FILE=%SCRIPT_DIR%star-gold-relay.log"

if not exist "%RELAY_SCRIPT%" (
  echo Cannot find %RELAY_SCRIPT%
  exit /b 1
)

echo Starting Star Gold By TSR local MT5 cloud relay...
echo Logs: %LOG_FILE%
node "%RELAY_SCRIPT%" >> "%LOG_FILE%" 2>&1
