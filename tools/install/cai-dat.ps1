<#
  cai-dat.ps1 - cai EasyPOS tester kit MOT LAN (CAI-DAT.cmd goi tep nay; bam dup CAI-DAT.cmd la du).

  1. Kiem Node 18+ (bat buoc) va Git (khuyen dung).
  2. Ban clone git: cai TAI CHO. Ban giai nen zip: chep vao cho CO DINH %LOCALAPPDATA%\easypos-tester-kit - hook tro toi do.
     (Hook tro toi tep khong con thi Claude Code CHO lenh chay - khong duoc de hook gay.)
  3. Chay setup.js --global-hooks: tao ~/.easypos-tester, them hook vao ~/.claude/settings.json (co sao luu), chay bo thu hook.
  4. npm install trong e2e (Playwright + mssql), kiem tra mo duoc trinh duyet.
  5. Nhac tester TU GO tai khoan vao ~/.easypos-tester/tai-khoan.json (khong dan vao chat Claude).
#>
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$src  = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dest = Join-Path $env:LOCALAPPDATA 'easypos-tester-kit'
$cfg  = Join-Path $env:USERPROFILE '.easypos-tester'

function TieuDe($s) { Write-Host ''; Write-Host ('== ' + $s) -ForegroundColor Cyan }
function Dat($s)    { Write-Host ('  [OK] ' + $s) -ForegroundColor Green }
function Canh($s)   { Write-Host ('  [!]  ' + $s) -ForegroundColor Yellow }
function Loi($s)    { Write-Host ('  [X]  ' + $s) -ForegroundColor Red }

function Chay([string]$cmdLine) {   # chay lenh qua cmd de lay ca stderr ma PowerShell 5.1 khong bien no thanh loi
    $out = cmd /c ($cmdLine + ' 2>&1')
    return @{ code = $LASTEXITCODE; text = ($out -join "`n") }
}
function ChayHan([string]$cmdLine, [int]$giay) {
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $cmdLine) -NoNewWindow -PassThru
    $null = $p.Handle   # giu handle thi ExitCode moi doc duoc
    if (-not $p.WaitForExit($giay * 1000)) { cmd /c ('taskkill /T /F /PID ' + $p.Id + ' >nul 2>&1'); return -999 }
    return $p.ExitCode
}
if ($MyInvocation.InvocationName -eq '.') { return }   # nap ham de thu, khong chay cai

Write-Host 'CAI DAT EasyPOS tester kit' -ForegroundColor Cyan
Write-Host ('  Nguon : ' + $src)

# ---------------------------------------------------------------- 1. cong cu can co
TieuDe '1. Kiem cong cu'
$node = Chay 'node -p process.versions.node'
if ($node.code -ne 0 -or $node.text -notmatch '^(\d+)\.') { Loi 'Khong co Node.js. Cai Node 18+ (https://nodejs.org) roi mo cmd moi va bam lai CAI-DAT.cmd.'; exit 1 }
if ([int]$Matches[1] -lt 18) { Loi ('Node ' + $node.text + ' qua cu, can 18+.'); exit 1 }
Dat ('Node ' + $node.text.Trim())
$git = Chay 'git --version'
if ($git.code -eq 0) { Dat $git.text.Trim() } else { Canh 'Khong co Git - CAP-NHAT.cmd (git pull) va bb.js (dang nhap Bitbucket) can Git. Cai tai https://git-scm.com/download/win' }

# ---------------------------------------------------------------- 2. chep vao cho co dinh
TieuDe '2. Vi tri cai dat'
$top = Chay ('git -C "' + $src + '" rev-parse --show-toplevel')
$isClone = ($top.code -eq 0) -and ((($top.text.Trim()) -replace '/', '\').TrimEnd('\') -ieq $src.TrimEnd('\'))
if ($isClone) {
    # Ban clone git: cai TAI CHO (hook tro thang vao thu muc clone) de CAP-NHAT.cmd (git pull) cap nhat duoc. Dung xoa / doi thu muc nay.
    $dest = $src
    Dat ('Ban clone git - cai tai cho ' + $dest + ' (cap nhat: bam CAP-NHAT.cmd). DUNG xoa / doi thu muc nay.')
} elseif ((Resolve-Path $src).Path.TrimEnd('\') -ieq $dest.TrimEnd('\')) {
    Dat 'Dang chay tu cho co dinh - khong chep lai.'
} else {
    if (Test-Path $dest) {
        if (-not (Test-Path (Join-Path $dest 'hooks\guard-easypos.js'))) { Loi ($dest + ' da co nhung khong phai EasyPOS tester kit - dung, khong xoa.'); exit 1 }
        Remove-Item -Recurse -Force $dest
    }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force
    Get-ChildItem -Path $src -Force -Filter '.*' | Where-Object { $_.Name -ne '.git' } | Copy-Item -Destination $dest -Recurse -Force
    if (-not (Test-Path (Join-Path $dest 'hooks\guard-easypos.js'))) { Loi 'Chep that bai.'; exit 1 }
    Dat ('Da chep vao ' + $dest)
}

# ---------------------------------------------------------------- 3. hook + bo thu
TieuDe '3. Cai hook vao ~/.claude/settings.json + chay bo thu hook'
& node (Join-Path $dest 'setup.js') --global-hooks
if ($LASTEXITCODE -ne 0) { Loi 'setup.js loi - xem dong phia tren. Hook CHUA duoc cai dung.'; exit 1 }

# ---------------------------------------------------------------- 4. Playwright (co roi thi bo qua)
TieuDe '4. Playwright (co roi thi bo qua)'
$e2e = Join-Path $dest 'e2e'
$canBan = ''; try { $canBan = (Get-Content (Join-Path $e2e 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).devDependencies.'@playwright/test' } catch { }
$coBan = ''; try { $coBan = (Get-Content (Join-Path $e2e 'node_modules\@playwright\test\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch { }
if ($coBan -and $coBan -eq $canBan -and (Test-Path (Join-Path $e2e 'node_modules\mssql\package.json'))) { Dat ('Da co @playwright/test ' + $coBan + ' + mssql - bo qua.') }
else {
    Write-Host '  ... npm install trong e2e (toi da 10 phut)'
    $c = ChayHan ('cd /d "' + $e2e + '" && npm install --no-audit --no-fund --loglevel=error') 600
    if ($c -eq 0) { Dat 'Da cai @playwright/test + mssql' } else { Canh 'npm install loi / qua 10 phut - chua chay duoc ca test. Bam lai CAI-DAT sau (kiem mang / proxy).' }
}
$cli = Join-Path $e2e 'node_modules\@playwright\test\cli.js'
if (Test-Path $cli) {
    $c = ChayHan ('node "' + (Join-Path $dest 'tools\tester\kiem-trinh-duyet.js') + '"') 180
    if ($c -ne 0) {
        $c = ChayHan ('cd /d "' + $e2e + '" && node "' + $cli + '" install chromium') 600
        $c = ChayHan ('node "' + (Join-Path $dest 'tools\tester\kiem-trinh-duyet.js') + '"') 180
    }
    if ($c -eq 0) { Dat 'Playwright mo duoc trinh duyet.' } else { Canh 'Playwright chua mo duoc trinh duyet - ca test API van chay duoc, ca giao dien thi chua.' }
}

# ---------------------------------------------------------------- 5. tai khoan
TieuDe '5. Tai khoan (BAN TU LAM)'
$tk = Join-Path $cfg 'tai-khoan.json'
Write-Host ('  Mo ' + $tk + ' bang VS Code, dien user / password cua moi truong dev (test truoc) va uat (test sau).')
Write-Host '  - web: tai khoan EasyPOS du lieu GIA, da TAT OTP.   - db: tai khoan CSDL (uu tien CHI DOC; dev / UAT chua co thi dung tai khoan sa cua ung dung, dbq chi chay SELECT).'
Write-Host '  - KHONG dan mat khau vao chat Claude.'

TieuDe 'XONG'
Write-Host '  Trong VS Code: Ctrl+Shift+P -> "Developer: Reload Window", roi mo cuoc tro chuyen Claude MOI.'
Write-Host '  Kiem: hoi Claude "EP_KIT o dau" - phai ra' ($dest -replace '\\', '/')
Write-Host '  Go hook: bam GO-CAI-DAT.cmd. Mat khau nam o ~/.easypos-tester - KHONG commit, KHONG dan vao chat.'
exit 0
