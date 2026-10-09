@echo off
title Social Media Automation
cd /d "%~dp0"

rem Double-click this file to open Social Media Automation. Keep the black window open while you use it.

where node >nul 2>nul || goto nonode
node -e "process.exit(+process.versions.node.split('.')[0] < 20 ? 1 : 0)" || goto oldnode

if not exist node_modules\remotion\ (
  echo.
  echo  First time only: getting everything ready. This takes a few minutes.
  echo.
  call npm ci --no-audit --no-fund || goto failed
)

node app\server.mjs
echo.
echo  Social Media Automation stopped. You can close this window.
pause
exit /b 0

:nonode
echo.
echo  Node is not installed. Installing it now (you may be asked to allow it)...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements || goto nodemanual
echo.
echo  Node is installed. Close this window and double-click Start again.
pause
exit /b 0

:oldnode
echo.
echo  Your Node is too old. Updating it now...
winget upgrade -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements || goto nodemanual
echo.
echo  Node is updated. Close this window and double-click Start again.
pause
exit /b 0

:nodemanual
echo.
echo  Could not install Node by itself. Get the LTS version from https://nodejs.org
echo  then double-click Start again.
start "" https://nodejs.org
pause
exit /b 1

:failed
echo.
echo  Setup did not finish. Check the internet and double-click Start again.
echo  If it keeps failing, send a screenshot of this window to Ali.
pause
exit /b 1
