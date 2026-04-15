@echo off
setlocal
REM NVM for Windows keeps Node here; PATH is often missing in new terminals.
set "NVM_NODE=%APPDATA%\nvm\v16.20.2"
if not exist "%NVM_NODE%\npm.cmd" (
  echo npm not found at: %NVM_NODE%\npm.cmd
  echo Install or select Node 16: nvm install 16.20.2 ^&^& nvm use 16.20.2
  exit /b 1
)
set "PATH=%NVM_NODE%;%PATH%"
cd /d "%~dp0"
echo node:
where node
node -v
npm -v
call npm install
if errorlevel 1 exit /b 1
call npm run dev
