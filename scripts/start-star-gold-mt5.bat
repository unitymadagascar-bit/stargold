@echo off
setlocal

rem Update this path if MetaTrader 5 is installed elsewhere.
set "MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe"

if exist "%MT5_PATH%" (
  start "" "%MT5_PATH%"
  echo Star Gold By TSR: MT5 launched.
  echo Make sure Algo Trading is active and the saved XAUUSD profile has TradeTSRBridge attached.
  exit /b 0
)

echo Star Gold By TSR: MT5 was not found at:
echo %MT5_PATH%
echo Edit this script and set MT5_PATH to your terminal64.exe location.
exit /b 1
