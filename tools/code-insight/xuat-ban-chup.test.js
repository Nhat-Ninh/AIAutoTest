/* Bộ thử xuat-ban-chup.sh trên một kho git TẠM (không đụng kho thật): tệp nhạy cảm bị loại, lịch sử Jira được xuất, "current" đổi nguyên tử,
 * dọn bản cũ, từ chối kho không phải git / bản chụp rỗng. Cần bash + git (Linux / Git Bash); trên Windows cần quyền tạo symlink (Developer Mode)
 * — thiếu thì các ca liên quan symlink được BỎ QUA (ghi rõ), nên chạy lại bộ thử này trên máy chủ Linux trước khi dùng thật.
 * Chạy: node tools/code-insight/xuat-ban-chup.test.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let dung = 0, sai = 0, boQua = 0;
const ca = (ten, ok, ct) => { if (ok) { dung++; console.log('ĐÚNG ' + ten); } else { sai++; console.log('SAI  ' + ten + (ct ? '\n     ' + String(ct).slice(0, 400) : '')); } };
const sh = path.join(__dirname, 'xuat-ban-chup.sh').replace(/\\/g, '/');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const env = Object.assign({}, process.env, { MSYS: 'winsymlinks:nativestrict', CI_GITLEAKS: 'tat', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.t' });
const chay = (lenh, cwd) => spawnSync(bash, ['-c', lenh], { cwd, env, encoding: 'utf8', timeout: 60000 });

if (spawnSync(bash, ['-c', 'git --version'], { encoding: 'utf8' }).status !== 0) { console.log('(bỏ qua cả bộ thử: không có bash / git)'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-xbc-'));
const ws = path.join(tmp, 'ws'); const snap = path.join(tmp, 'snap'); fs.mkdirSync(ws);
const wr = (f, t) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), t); };
const dir = (...p) => p.join('/');
chay('git init -q . && git config user.email t@t.t && git config user.name t', ws);
wr('src/A.java', 'class A { void f() { } }\n');
wr('src/main/resources/config/application-dev.yml', 'spring.datasource.password=Abc12345xyz\n');
wr('src/main/resources/config/messages_vi.properties', 'loi.x=Lỗi\n');
wr('id_' + 'rsa', 'khoa-rieng\n'); wr('chung-chi.pem', 'x\n'); wr('.env', 'A=1\n'); wr('bin/app.jar', 'jar\n'); wr('README.md', 'xin chao\n');
chay('git add -A && git commit -qm "EPB-12 them A" && echo "// sua" >> src/A.java && git commit -qam "EPB-13 sua A"', ws);
const sha = chay('git rev-parse HEAD', ws).stdout.trim();

let r = chay(`bash "${sh}" easyposbackend "${snap.replace(/\\/g, '/')}" 3`, ws);
const taoDuocLienKet = r.status === 0 && fs.existsSync(path.join(snap, 'easyposbackend', 'current'));
if (!taoDuocLienKet && /ln:|symlink|Operation not permitted/i.test(r.stderr + r.stdout)) {
  boQua++; console.log('(BỎ QUA các ca cần symlink: máy này không cho tạo — chạy lại trên Linux)\n     ' + (r.stderr || r.stdout).split('\n')[0]);
} else {
  ca('xuất bản chụp thành công (mã 0) và in "OK: repo@commit"', r.status === 0 && new RegExp('OK: easyposbackend@' + sha.slice(0, 12)).test(r.stdout), r.stdout + r.stderr);
  const bc = path.join(snap, 'easyposbackend', sha);
  const co = (f) => fs.existsSync(path.join(bc, f));
  ca('mã nguồn được giữ (src/A.java), README giữ', co('src/A.java') && co('README.md'));
  ca('cấu hình môi trường application-*.yml bị XOÁ', !co('src/main/resources/config/application-dev.yml'));
  ca('thông điệp i18n (messages_*.properties) được giữ', co('src/main/resources/config/messages_vi.properties'));
  ca('khoá riêng / chứng chỉ / .env bị XOÁ', !co('id_' + 'rsa') && !co('chung-chi.pem') && !co('.env'));
  ca('nhị phân (.jar) bị XOÁ', !co('bin/app.jar'));
  ca('KHÔNG có thư mục .git trong bản chụp', !co('.git'));
  ca('toàn bộ bản chụp KHÔNG còn chuỗi mật khẩu mẫu', !fs.readFileSync(path.join(bc, 'src/A.java'), 'utf8').includes('Abc12345') && !JSON.stringify(fs.readdirSync(bc)).includes('application-'));
  const cm = fs.readFileSync(path.join(bc, '.insight/commits.txt'), 'utf8'), ch = fs.readFileSync(path.join(bc, '.insight/changes.txt'), 'utf8');
  ca('.insight/commits.txt có thông điệp nhắc mã Jira (EPB-12, EPB-13)', /EPB-12/.test(cm) && /EPB-13/.test(cm), cm);
  ca('.insight/changes.txt có tên tệp đổi theo commit, KHÔNG có diff', /@@ \w+ EPB-13/.test(ch) && /src\/A\.java/.test(ch) && !/^[+-]\/\/ sua/m.test(ch), ch);
  ca('.insight/ban-chup.json ghi repo / commit / nhánh', (() => { const j = JSON.parse(fs.readFileSync(path.join(bc, '.insight/ban-chup.json'), 'utf8')); return j.repo === 'easyposbackend' && j.commit === sha; })());
  ca('"current" trỏ đúng commit vừa xuất', fs.readlinkSync(path.join(snap, 'easyposbackend', 'current')).replace(/\\/g, '/').endsWith(sha));

  // Lần 2: commit mới ⇒ current đổi, bản cũ còn; giữ tối đa N bản
  for (let i = 0; i < 4; i++) { chay(`echo "// l${i}" >> src/A.java && git commit -qam "EPB-2${i} lan ${i}"`, ws); const r2 = chay(`bash "${sh}" easyposbackend "${snap.replace(/\\/g, '/')}" 3`, ws); if (r2.status !== 0) { ca('xuất lặp lần ' + i, false, r2.stderr); break; } }
  const sha2 = chay('git rev-parse HEAD', ws).stdout.trim();
  const dsBan = fs.readdirSync(path.join(snap, 'easyposbackend')).filter(x => /^[0-9a-f]{40}$/.test(x));
  ca('chỉ giữ tối đa 3 bản cũ nhất, KHÔNG xoá bản đang là current', dsBan.length === 3 && dsBan.includes(sha2), dsBan.length + ' ' + dsBan.join(','));
  ca('current trỏ commit mới nhất sau nhiều lần xuất', fs.readlinkSync(path.join(snap, 'easyposbackend', 'current')).replace(/\\/g, '/').endsWith(sha2));
  ca('không còn thư mục tạm .dang-xuat / .current dở dang', !fs.readdirSync(path.join(snap, 'easyposbackend')).some(x => /^\.(dang-xuat|current\.)/.test(x)));

  // Quét bí mật bắt buộc (giả gitleaks luôn báo thấy) ⇒ KHÔNG đổi current
  const gia = path.join(tmp, 'bin'); fs.mkdirSync(gia); fs.writeFileSync(path.join(gia, 'gitleaks'), '#!/usr/bin/env bash\nexit 1\n'); fs.chmodSync(path.join(gia, 'gitleaks'), 0o755);
  chay('echo "// moi" >> src/A.java && git commit -qam "EPB-99 moi"', ws);
  const truoc = fs.readlinkSync(path.join(snap, 'easyposbackend', 'current'));
  const r3 = spawnSync(bash, ['-c', `PATH="${gia.replace(/\\/g, '/')}:$PATH" CI_GITLEAKS=bat bash "${sh}" easyposbackend "${snap.replace(/\\/g, '/')}" 3`], { cwd: ws, env: Object.assign({}, env, { CI_GITLEAKS: 'bat' }), encoding: 'utf8' });
  ca('gitleaks thấy bí mật ⇒ mã ≠ 0 và KHÔNG đổi current', r3.status === 5 && fs.readlinkSync(path.join(snap, 'easyposbackend', 'current')) === truoc, r3.status + ' ' + r3.stderr);
  ca('bản chụp bị từ chối KHÔNG để lại thư mục (không lọt vào cổng)', !fs.readdirSync(path.join(snap, 'easyposbackend')).some(x => x === chay('git rev-parse HEAD', ws).stdout.trim()));
}

// Che bí mật có điều kiện (CI_CHE_BI_MAT=1): không cần symlink để kiểm bản chụp (kiểm thư mục commit; đổi current cần symlink)
{
  const ws2 = path.join(tmp, 'ws2'); fs.mkdirSync(ws2);
  const w2 = (f, t) => { fs.mkdirSync(path.dirname(path.join(ws2, f)), { recursive: true }); fs.writeFileSync(path.join(ws2, f), t); };
  const BI_MAT = 'ABCDEFGHIJKLMNOP1234567890abcdef';
  w2('src/Cfg.java', 'class Cfg {\n  static final String API_KEY = "' + BI_MAT + '";\n  static final String TEN = "ngan";\n}\n');
  w2('src/Ok.java', 'class Ok { }\n');
  w2('password.json', '{"a":1}\n'); w2('.yo-rc.json', '{"b":2}\n');
  chay('git init -q . && git config user.email t@t.t && git config user.name t && git add -A && git commit -qm "EPB-5 cfg"', ws2);
  const sha3 = chay('git rev-parse HEAD', ws2).stdout.trim();
  const bin2 = path.join(tmp, 'bin2'); fs.mkdirSync(bin2);
  fs.writeFileSync(path.join(bin2, 'gitleaks'), [
    '#!/usr/bin/env bash',
    'while [ $# -gt 0 ]; do [ "$1" = "-r" ] && R="$2"; [ "$1" = "--source" ] && S="$2"; shift; done',
    'F="$(grep -rl "ABCDEFGHIJKLMNOP" "$S" --include=*.java | head -1)"',
    'if [ -n "$F" ]; then L="$(grep -n "ABCDEFGHIJKLMNOP" "$F" | head -1 | cut -d: -f1)"; printf \'[{"RuleID":"generic-api-key","File":"%s","StartLine":%s,"EndLine":%s}]\' "$F" "$L" "$L" > "$R"; exit 1; fi',
    "printf '[]' > \"$R\"; exit 0", ''].join('\n'));
  fs.chmodSync(path.join(bin2, 'gitleaks'), 0o755);
  const gu = process.platform === 'win32' ? chay(`cygpath -u "${bin2.replace(/\\/g, '/')}"`, tmp).stdout.trim() : bin2;
  const snap2 = path.join(tmp, 'snap2').replace(/\\/g, '/');
  const chayGl = (them) => spawnSync(bash, ['-c', `PATH="${gu}:$PATH" CI_GITLEAKS=bat ${them} bash "${sh}" cfgrepo "${snap2}" 3`], { cwd: ws2, env: Object.assign({}, env, { CI_GITLEAKS: 'bat' }), encoding: 'utf8' });
  const rA = chayGl('');
  ca('khoá viết cứng, KHÔNG bật che ⇒ mã 5 + báo đúng tệp:dòng, KHÔNG lộ giá trị', rA.status === 5 && /Cfg\.java:2/.test(rA.stderr) && !rA.stderr.includes(BI_MAT), rA.status + ' ' + rA.stderr);
  ca('(không bật che) KHÔNG phát hành thư mục commit', !fs.existsSync(path.join(snap2, 'cfgrepo', sha3)));
  const rB = chayGl('CI_CHE_BI_MAT=1');
  ca('bật che ⇒ báo "đã che 1 dòng", quét lại sạch (không còn thông báo KHÔNG phát hành)', /đã che 1 dòng/.test(rB.stderr) && !/KHÔNG phát hành/.test(rB.stderr), rB.status + ' ' + rB.stderr);
  const pb = path.join(snap2, 'cfgrepo', sha3);
  const cfg2 = fs.existsSync(path.join(pb, 'src/Cfg.java')) ? fs.readFileSync(path.join(pb, 'src/Cfg.java'), 'utf8') : '';
  ca('bản chụp đã che: không còn giá trị bí mật, có «đã che», tên biến và chuỗi ngắn giữ nguyên', cfg2 && !cfg2.includes(BI_MAT) && cfg2.includes('API_KEY = "«đã che»"') && cfg2.includes('"ngan"'), cfg2);
  ca('password.json / .yo-rc.json bị XOÁ khỏi bản chụp', fs.existsSync(pb) && !fs.existsSync(path.join(pb, 'password.json')) && !fs.existsSync(path.join(pb, '.yo-rc.json')));
  ca('ban-chup.json ghi daChe = 1', fs.existsSync(pb) && JSON.parse(fs.readFileSync(path.join(pb, '.insight/ban-chup.json'), 'utf8')).daChe === 1);
}

// Các ca không cần symlink
{
  const kg = path.join(tmp, 'khong-git'); fs.mkdirSync(kg);
  r = chay(`bash "${sh}" easyposbackend "${snap.replace(/\\/g, '/')}"`, kg); ca('không phải kho git ⇒ mã 3', r.status === 3, r.status + ' ' + r.stderr);
  r = chay(`bash "${sh}" "../etc" "${snap.replace(/\\/g, '/')}"`, ws); ca('tên repo lạ (../etc) ⇒ mã 2', r.status === 2, r.status);
  r = chay(`bash "${sh}"`, ws); ca('thiếu tham số ⇒ báo lỗi', r.status !== 0);
  r = chay(`bash "${sh}" easyposbackend "${snap.replace(/\\/g, '/')}" 1`, ws); ca('số bản giữ lại < 2 ⇒ mã 2', r.status === 2, r.status);
  const rong = path.join(tmp, 'rong'); fs.mkdirSync(rong); chay('git init -q . && git config user.email t@t.t && git config user.name t && echo k > .env && git add -A && git commit -qm x', rong);
  r = chay(`bash "${sh}" rong "${snap.replace(/\\/g, '/')}"`, rong); ca('bản chụp chỉ toàn tệp nhạy cảm (rỗng sau khi loại) ⇒ mã 4, không phát hành', r.status === 4 && !fs.existsSync(path.join(snap, 'rong', 'current')), r.status + ' ' + r.stderr);
}

console.log('\n' + dung + '/' + (dung + sai) + ' ca đúng' + (boQua ? ' (' + boQua + ' nhóm bị bỏ qua)' : ''));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* dọn tạm */ }
process.exit(sai ? 1 : 0);
