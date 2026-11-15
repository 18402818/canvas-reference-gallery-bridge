@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" (
  echo [!] index.html not found. Run: node fetch-assets.js
  pause
  exit /b 1
)
set PORT=3001
node "%~dp0server.js"
pause
