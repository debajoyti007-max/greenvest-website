@echo off
title RYMON OFFICIAL TELEGRAM BOT DAEMON (@Rymon007bot)
color 0A
cd /d "%~dp0"
echo ===================================================
echo   RYMON OFFICIAL TELEGRAM BOT 24/7 DAEMON
echo   Bot: @Rymon007bot
echo   Owner: @montage007pc (5831000769)
echo ===================================================
echo.
echo Starting 24/7 background listener...
node scripts/telegram-bot-daemon.mjs
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Bot daemon crashed or stopped. Restarting in 5 seconds...
    timeout /t 5
    goto :start
)
pause
