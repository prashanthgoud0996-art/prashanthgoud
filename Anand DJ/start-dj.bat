@echo off
title DJ MUSIC SYSTEM - PORTABLE USB EDITION
color 0B
echo ========================================================
echo        DJ MUSIC SYSTEM - PORTABLE EVENT EDITION
echo ========================================================
echo  Discovering portable USB Root...
echo  Starting local audio engine and database...
echo.

cd /d "%~dp0"
start "DJ Audio Engine Server" /b node server.js

echo  Waiting for system initialization...
timeout /t 2 /nobreak >nul

echo  Launching DJ Console in browser...
start http://127.0.0.1:7890

echo.
echo ========================================================
echo  SYSTEM STATUS: RUNNING (PORTABLE USB READY)
echo  Press Ctrl+C or close this window to stop the engine.
echo ========================================================
node -e "setInterval(()=>{}, 1000)"
