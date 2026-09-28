@echo off
rem Run once on a new computer. Checks Node and ffmpeg, then installs the studio packages.

where node >nul 2>nul || (echo Node not found. Install Node 20 or newer from https://nodejs.org & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo ffmpeg not found. In PowerShell run: winget install Gyan.FFmpeg & pause & exit /b 1)

cd /d "%~dp0plugins\studio\huzaifa-studio\assets\remotion-template"
call npm ci --no-audit --no-fund || (echo npm ci failed. See the error above. & pause & exit /b 1)

echo.
echo All set.
pause
