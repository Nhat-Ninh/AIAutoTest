@echo off
chcp 65001 >nul
title Kiem tra may - EasyPOS tester kit
node "%~dp0tools\tester\kiem-tra-may.js" %*
echo.
pause
