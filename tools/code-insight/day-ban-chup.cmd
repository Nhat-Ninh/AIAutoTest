@echo off
rem day-ban-chup.cmd - chay o BUOC CUOI cua job Jenkins tren may build (Windows, vd 10.100.110.78), CHI KHI build thanh cong:
rem   dong goi ma vua build thanh bundle git roi day sang server Code-Insight, server dung ban chup NGAY => tester doc dung ma cua lan build nay.
rem Cach dung trong job (Execute Windows batch command, thu muc hien tai la workspace):
rem   C:\insight\day-ban-chup.cmd easyposbackend-bia dev-bia
rem   (tham so 1 = ten repo trong cong, co hau to -bia; tham so 2 = nhan nhanh dev-bia hoac bia-prod-test)
rem Luon thoat ma 0: loi day ban chup chi duoc GHI vao log, KHONG lam hong ban build.
rem Bien tuy chon: INSIGHT_MAY (mac dinh 10.100.110.233), INSIGHT_USER (mac dinh easypos-dev-jenkins), INSIGHT_KHOA (khoa rieng, mac dinh C:\insight\insight_khoa),
rem                INSIGHT_KNOWN (known_hosts, mac dinh C:\insight\known_hosts).
setlocal
set "REPO=%~1"
set "NHANH=%~2"
if "%REPO%"=="" (echo [insight] Thieu ten repo. Cach dung: day-ban-chup.cmd ^<repo-bia^> ^<nhanh^> & exit /b 0)
if "%NHANH%"=="" set "NHANH=dev-bia"
if "%INSIGHT_MAY%"=="" set "INSIGHT_MAY=10.100.110.233"
if "%INSIGHT_USER%"=="" set "INSIGHT_USER=easypos-dev-jenkins"
if "%INSIGHT_KHOA%"=="" set "INSIGHT_KHOA=C:\insight\insight_khoa"
if "%INSIGHT_KNOWN%"=="" set "INSIGHT_KNOWN=C:\insight\known_hosts"

set "GOI=%TEMP%\insight-%REPO%.bundle"
if exist "%GOI%" del /f /q "%GOI%"

git -c safe.directory=* bundle create "%GOI%" HEAD
if errorlevel 1 (echo [insight] KHONG tao duoc bundle tu workspace hien tai - bo qua day ban chup & exit /b 0)
for /f %%h in ('git -c safe.directory=* rev-parse --short HEAD') do echo [insight] Day %REPO% commit %%h nhanh %NHANH% sang %INSIGHT_MAY%

ssh -i "%INSIGHT_KHOA%" -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="%INSIGHT_KNOWN%" %INSIGHT_USER%@%INSIGHT_MAY% "%REPO% %NHANH%" < "%GOI%"
if errorlevel 1 (echo [insight] CANH BAO: day ban chup that bai - tester van doc ban cu; xem log tren may chu / kiem tra khoa SSH & mang) else (echo [insight] OK: server da dung ban chup moi)

del /f /q "%GOI%" 2>nul
exit /b 0
