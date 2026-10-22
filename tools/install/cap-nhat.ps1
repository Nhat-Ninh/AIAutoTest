<#
  cap-nhat.ps1 - keo ban moi cua EasyPOS tester kit (git pull) roi dang ky lai hook + chay bo thu. CAP-NHAT.cmd goi tep nay.
  Chi dung cho ban CLONE git (cai bang CAI-DAT.cmd tu thu muc clone). Ban giai nen zip: tai zip moi, bam CAI-DAT.cmd.
#>
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$kit = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
function Dat($s)  { Write-Host ('  [OK] ' + $s) -ForegroundColor Green }
function Canh($s) { Write-Host ('  [!]  ' + $s) -ForegroundColor Yellow }
function Loi($s)  { Write-Host ('  [X]  ' + $s) -ForegroundColor Red }

Write-Host ('CAP NHAT EasyPOS tester kit: ' + $kit) -ForegroundColor Cyan
$null = cmd /c ('git -C "' + $kit + '" rev-parse --is-inside-work-tree 2>&1')
if ($LASTEXITCODE -ne 0) { Loi 'Thu muc nay khong phai ban clone git - tai zip moi roi bam CAI-DAT.cmd.'; exit 1 }

$doi = cmd /c ('git -C "' + $kit + '" status --porcelain --untracked-files=no 2>&1')
if ($doi) { Loi 'Co tep bi sua tay trong thu muc bo kit (git status) - khong keo de. Hoan tac hoac bao nguoi phu trach:'; $doi | ForEach-Object { Write-Host ('       ' + $_) }; exit 1 }

$cu = (cmd /c ('git -C "' + $kit + '" rev-parse HEAD 2>&1')).Trim()
cmd /c ('git -C "' + $kit + '" pull --ff-only 2>&1') | ForEach-Object { Write-Host ('  ' + $_) }
if ($LASTEXITCODE -ne 0) { Loi 'git pull loi (mang / quyen Bitbucket / lich su lech) - hook GIU NGUYEN ban cu.'; exit 1 }
$moi = (cmd /c ('git -C "' + $kit + '" rev-parse HEAD 2>&1')).Trim()
if ($cu -eq $moi) { Dat 'Da la ban moi nhat.' }
else {
    Dat 'Thay doi moi:'
    cmd /c ('git -C "' + $kit + '" log --oneline ' + $cu + '..' + $moi + ' 2>&1') | ForEach-Object { Write-Host ('       ' + $_) }
}

Write-Host ''
& node (Join-Path $kit 'setup.js') --global-hooks
if ($LASTEXITCODE -ne 0) { Loi 'setup.js loi sau khi cap nhat - bao nguoi phu trach (hook co the dang o ban moi nhung bo thu sai).'; exit 1 }
Write-Host ''
Write-Host '  Xong. Trong VS Code: Ctrl+Shift+P -> "Developer: Reload Window", roi mo cuoc tro chuyen Claude MOI.'
exit 0
