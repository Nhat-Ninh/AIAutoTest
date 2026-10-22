@echo off
chcp 65001 >nul
title Cap nhat EasyPOS tester kit
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install\cap-nhat.ps1"
echo.
pause
