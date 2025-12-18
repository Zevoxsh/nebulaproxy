@echo off
title Nebula Proxy Server

echo ========================================
echo    Starting Nebula Proxy Server
echo ========================================
echo.

echo Checking administrator privileges...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Not running as Administrator!
    echo Ports 80 and 443 may fail to bind.
    echo Please run this script as Administrator.
    echo.
    pause
)

echo Starting server...
echo.
node src\index.js

pause
