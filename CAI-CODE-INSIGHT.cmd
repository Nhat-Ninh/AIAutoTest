@echo off
chcp 65001 >nul
title Cai cong doc ma Code-Insight - EasyPOS tester kit
rem Bam doi: kiem tung dieu kien (kit moi, Node, Claude Code, cau hinh, token Jira, mang toi cong), tu noi cau hinh vao Claude, bao [OK] / [!] / [X] va viec con lai.
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Chua cai Node.js. Cai Node 20 LTS ^(HUONG-DAN-TESTER Phan 2.1^) roi bam lai.
  echo.
  pause
  exit /b 1
)
node "%~dp0tools\tester\code-insight-cai.js" cai-dat
echo.
pause
