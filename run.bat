@echo off
echo.
echo ====================================
echo   Block Builder Multiplayer Server
echo ====================================
echo.
echo Installing dependencies...
call npm install

echo.
echo.
echo Starting server...
echo.
node server.js

pause
