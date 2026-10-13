@echo off
rem Restore English Antigravity and remove the auto-update task.
set "AGZH=%LOCALAPPDATA%\antigravity-zh-cn\agzh.ps1"
if not exist "%AGZH%" set "AGZH=%~dp0agzh.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%AGZH%" -Action Uninstall %*
echo.
pause
