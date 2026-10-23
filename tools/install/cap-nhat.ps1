# cap-nhat.ps1 - cap nhat EasyPOS tester kit len ban moi nhat cua nhanh main. CAP-NHAT.cmd goi tep nay.
# Kit TU cap nhat truoc moi lan chay test (tools/tester/dong-bo.js); tep nay la cach CHU DONG khi can (vd sau khi nghi ngo, hoac hook bao "can cap-nhat").
# Khong can biet git: moi thay doi la trong thu muc kit duoc sao luu vao ~/.easypos-tester/sao-luu/<gio>/ roi dua ve dung main.
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$kit = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
function Dat($s)  { Write-Host ('  [OK] ' + $s) -ForegroundColor Green }
function Loi($s)  { Write-Host ('  [X]  ' + $s) -ForegroundColor Red }

Write-Host ('CAP NHAT EasyPOS tester kit: ' + $kit) -ForegroundColor Cyan
$null = cmd /c 'node -v 2>&1'
if ($LASTEXITCODE -ne 0) { Loi 'Khong thay Node.js - cai Node LTS roi mo cua so cmd moi.'; exit 1 }

# --chap-nhan-sao-luu: ban chu dong bam CAP-NHAT nen chap nhan dua thu muc kit ve dung main (co sao luu truoc). Khong bao gio conflict.
& node (Join-Path $kit 'tools\tester\dong-bo.js') cap-nhat --chap-nhan-sao-luu
$ma = $LASTEXITCODE
if ($ma -ne 0) {
    if ($ma -eq 11) { Loi 'Khong ket noi duoc GitHub: kiem mang / dang nhap GitHub (chay mot lan "git fetch" trong thu muc kit), roi bam lai.' }
    elseif ($ma -eq 12) { Loi 'Cap nhat bi TU CHOI vi dang ngo (xem thong bao tren). Bao nguoi phu trach kit, dung chay test.' }
    else { Loi ('dong-bo.js loi (ma ' + $ma + ') - bao nguoi phu trach.') }
    exit 1
}

# Dang ky lai hook (idempotent) + dat vai tro may neu chua co. Dong-bo cung tu lam khi hook doi, chay lai o day cho chac.
& node (Join-Path $kit 'setup.js') --global-hooks
if ($LASTEXITCODE -ne 0) { Loi 'setup.js loi sau khi cap nhat - bao nguoi phu trach (hook co the dang o ban moi nhung bo thu sai).'; exit 1 }
Write-Host ''
Dat 'Xong. Trong VS Code: Ctrl+Shift+P -> "Developer: Reload Window", roi mo cuoc tro chuyen Claude MOI.'
exit 0
