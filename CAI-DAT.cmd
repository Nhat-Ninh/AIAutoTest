@echo off
chcp 65001 >nul
title Cai dat EasyPOS tester kit
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install\cai-dat.ps1" %*
echo.
pause
