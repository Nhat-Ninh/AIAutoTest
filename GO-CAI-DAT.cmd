@echo off
chcp 65001 >nul
title Go EasyPOS tester kit
rem Go hook EasyPOS tester kit khoi ~/.claude/settings.json (co sao luu). Giu nguyen ~/.easypos-tester (mat khau) - tu xoa neu muon.
if exist "%LOCALAPPDATA%\easypos-tester-kit\setup.js" (
  node "%LOCALAPPDATA%\easypos-tester-kit\setup.js" --uninstall
) else (
  node "%~dp0setup.js" --uninstall
)
echo.
pause
