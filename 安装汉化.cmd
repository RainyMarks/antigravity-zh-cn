@echo off
rem Antigravity zh-CN patch installer. Optional args: -Lang  -NoTheme  -NoAutoUpdate  -AppDir "D:\path\to\Antigravity"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
