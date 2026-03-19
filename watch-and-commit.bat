@echo off
title FlowX Auto Commit
color 0A
echo.
echo  FlowX Auto Commit Watcher
echo  =========================
echo  Watching for changes...
echo  Every save auto-commits to GitHub
echo  Netlify deploys automatically after
echo.

cd C:\Users\hp\.gemini\antigravity\playground\crystal-andromeda\flowx

:watch
REM Wait 30 seconds then check for changes
timeout /t 30 /nobreak >nul

REM Check if there are any changes
git status --porcelain > temp_status.txt
set /p STATUS=<temp_status.txt
del temp_status.txt

if not "%STATUS%"=="" (
    echo  [%time%] Changes detected — committing...
    git add .
    git commit -m "Auto update — %date% %time%"
    git push origin main
    echo  [%time%] Pushed to GitHub — Netlify deploying...
    echo.
)

goto watch