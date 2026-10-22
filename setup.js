#!/usr/bin/env node
/* Cài EasyPOS tester kit trên máy tester.
 *
 *   node setup.js                 tạo ~/.easypos-tester/ (tệp tài khoản mẫu, jira / git trống), chạy bộ thử hook
 *   node setup.js --global-hooks  thêm hook + biến EP_KIT vào ~/.claude/settings.json (có sao lưu)
 *   node setup.js --uninstall     gỡ hook + EP_KIT CỦA BỘ NÀY khỏi ~/.claude (có sao lưu), giữ ~/.easypos-tester
 *   node setup.js --dry-run …     chỉ in việc sẽ làm, không ghi gì
 *   --thay-bo-khac                (đi kèm --global-hooks) máy đang cài bộ kit KHÁC (vd eb-devkit) thì gỡ hook bộ đó rồi cài bộ này
 *                                 (mặc định: DỪNG — hai bộ cùng cài là hai hook cùng chạy, luật nói ngược nhau)
 *   Người dùng bình thường: bấm đúp CAI-DAT.cmd / GO-CAI-DAT.cmd thay cho các lệnh trên.
 *
 * Mật khẩu KHÔNG bao giờ nằm trong repo: tệp tài khoản ở ~/.easypos-tester/, người dùng tự điền.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const HOME = os.homedir();
const CFG = path.join(HOME, '.easypos-tester');
const DRY = process.argv.includes('--dry-run');
const GLOBAL = process.argv.includes('--global-hooks');
const REPLACE = process.argv.includes('--thay-bo-khac');
const fwd = p => p.replace(/\\/g, '/');
const normRoot = p => fwd(String(p || '')).replace(/\/+$/, '').toLowerCase();
const sameRoot = r => normRoot(r) === normRoot(ROOT);
const isKitDir = r => !!r && (fs.existsSync(path.join(r, 'hooks', 'guard-easypos.js')) || fs.existsSync(path.join(r, 'hooks', 'guard-db.js')));

function step(msg) { console.log((DRY ? '[thử] ' : '') + msg); }

// Hook của bộ kit: guard-easypos.js / session-rules.js (và guard-db.js của bộ eb-devkit cũ nếu máy từng cài). KHÔNG đụng hook riêng trong ~/.claude/hooks.
const PERSONAL_RE = /[\\/]\.claude[\\/]+hooks[\\/]/;
const HOOK_RE = /[\\/]hooks[\\/]+(guard-easypos|guard-db|session-rules)\.js/;
const isKitHook = h => (h.hooks || []).some(x => HOOK_RE.test(x.command || '') && !PERSONAL_RE.test(x.command || ''));
/* Gốc các bộ kit mà một mục hook trỏ tới (thư mục chứa hooks/). */
function rootsOf(h) {
  const out = [];
  for (const x of h.hooks || []) {
    const c = String(x.command || '');
    if (PERSONAL_RE.test(c)) continue;
    const m = c.match(/"?([^"]*?)[\\/]+hooks[\\/]+(?:guard-easypos|guard-db|session-rules)\.js/);
    if (m) out.push(m[1].replace(/^\s*node\s+/i, '').trim());
  }
  return out;
}
function backup(sp) {
  const bak = sp + '.bak-easypos-tester-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  fs.copyFileSync(sp, bak); step('sao lưu ' + bak);
}
function readSettings(sp, mustExist) {
  if (!fs.existsSync(sp)) return mustExist ? null : {};
  try { return JSON.parse(fs.readFileSync(sp, 'utf8')); }
  catch (e) { console.error('Không đọc được ' + sp + ' (JSON sai) — dừng, không sửa gì.'); process.exit(1); }
}

// 0. Gỡ: bỏ hook + biến EP_KIT của BỘ NÀY khỏi ~/.claude/settings.json (có sao lưu). Giữ ~/.easypos-tester (tài khoản) — người dùng tự xoá.
if (process.argv.includes('--uninstall')) {
  const sp = path.join(HOME, '.claude', 'settings.json');
  const s = readSettings(sp, true);
  if (!s) { console.log('Không có ' + sp + ' — không có gì để gỡ.'); process.exit(0); }
  const mine = h => isKitHook(h) && rootsOf(h).every(r => sameRoot(r) || !isKitDir(r));
  const conLai = new Set();
  let n = 0;
  for (const ev of ['PreToolUse', 'SessionStart']) {
    if (!s.hooks || !Array.isArray(s.hooks[ev])) continue;
    const before = s.hooks[ev].length;
    for (const h of s.hooks[ev]) if (isKitHook(h) && !mine(h)) rootsOf(h).forEach(r => conLai.add(fwd(r)));
    s.hooks[ev] = s.hooks[ev].filter(h => !mine(h));
    n += before - s.hooks[ev].length;
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
  const envKit = s.env && s.env.EP_KIT;
  if (envKit && (sameRoot(envKit) || !isKitDir(envKit))) { delete s.env.EP_KIT; n++; if (!Object.keys(s.env).length) delete s.env; }
  for (const r of conLai) console.log('Giữ nguyên hook của bộ kit khác: ' + r + ' (muốn gỡ thì bấm GO-CAI-DAT.cmd trong thư mục đó).');
  if (!n) { console.log('Không thấy hook của bộ kit này (' + fwd(ROOT) + ') trong ' + sp + ' — không sửa gì.'); process.exit(0); }
  if (!DRY) { backup(sp); fs.writeFileSync(sp, JSON.stringify(s, null, 2) + '\n'); }
  step('đã gỡ ' + n + ' mục EasyPOS tester kit khỏi ' + sp);
  console.log('Tài khoản vẫn ở ' + fwd(CFG) + ' — muốn xoá hẳn thì tự xoá thư mục đó. Mở lại VS Code (Reload Window) để hết hiệu lực.');
  process.exit(0);
}

function writeIfMissing(dst, text) {
  if (fs.existsSync(dst)) { step('giữ nguyên ' + dst + ' (đã có)'); return; }
  step('tạo ' + dst);
  if (!DRY) { fs.writeFileSync(dst, text); try { fs.chmodSync(dst, 0o600); } catch (e) { /* Windows: bỏ qua */ } }
}

// 1. Thư mục cấu hình riêng của tester (mật khẩu chỉ nằm ở đây, ngoài repo)
if (!fs.existsSync(CFG)) { step('tạo thư mục ' + CFG); if (!DRY) fs.mkdirSync(CFG, { recursive: true }); }
writeIfMissing(path.join(CFG, 'tai-khoan.json'), fs.readFileSync(path.join(ROOT, 'config', 'tai-khoan.example.json'), 'utf8'));
writeIfMissing(path.join(CFG, 'jira.properties'),
  '# PAT Jira của CHÍNH BẠN (Jira → avatar → Profile → Personal Access Tokens → Create token). Dùng để ĐỌC ticket và TẠO ticket lỗi (jira-tao.js). Tự gõ, không dán vào chat.\njira.token=\n');
writeIfMissing(path.join(CFG, 'confluence.properties'),
  '# PAT Confluence của CHÍNH BẠN (Confluence → avatar → Settings → Personal Access Tokens → Create token). Chỉ dùng để ĐỌC tài liệu nghiệp vụ (confluence.js). Tự gõ, không dán vào chat.\nconfluence.token=\n');
writeIfMissing(path.join(CFG, 'git.properties'),
  '# (Tuỳ chọn) HTTP access token Bitbucket của chính bạn (chỉ quyền đọc) cho tools/tester/bb.js. Để trống thì bb.js dùng tài khoản git đã đăng nhập trên máy.\ngit.user=\ngit.token=\n');

// 2. (tuỳ chọn) cài hook toàn cục
if (GLOBAL) {
  const sp = path.join(HOME, '.claude', 'settings.json');
  const s = readSettings(sp, false);
  // Hook + EP_KIT cài cho CẢ MÁY (~/.claude): mỗi máy chỉ được MỘT bộ kit. Đang có bộ khác (còn trên máy) ⇒ DỪNG.
  const khac = new Map();
  for (const ev of ['PreToolUse', 'SessionStart']) {
    for (const h of (s.hooks && Array.isArray(s.hooks[ev]) ? s.hooks[ev] : [])) {
      if (!isKitHook(h)) continue;
      for (const r of rootsOf(h)) {
        if (sameRoot(r)) continue;
        if (isKitDir(r)) khac.set(normRoot(r), r);
        else step('bỏ hook cũ trỏ tới bộ kit không còn trên máy: ' + fwd(r));
      }
    }
  }
  if (khac.size && !REPLACE) {
    console.error('\nDỪNG — máy này đang cài bộ kit KHÁC:');
    for (const r of khac.values()) console.error('  - ' + fwd(r));
    console.error('Hook và biến EP_KIT cài cho CẢ MÁY: cài thêm bộ này thì hai hook cùng chạy, hai bộ luật nói ngược nhau. Mỗi máy chỉ dùng MỘT bộ.');
    console.error('Muốn đổi sang bộ này: bấm GO-CAI-DAT.cmd trong thư mục bộ kia, rồi bấm lại CAI-DAT.cmd ở đây');
    console.error('(hoặc: node setup.js --global-hooks --thay-bo-khac). Chưa đụng tới ~/.claude.');
    process.exit(1);
  }
  for (const r of khac.values()) step('--thay-bo-khac: gỡ hook của ' + fwd(r));
  const guard = 'node "' + fwd(path.join(ROOT, 'hooks', 'guard-easypos.js')) + '"';
  const rules = 'node "' + fwd(path.join(ROOT, 'hooks', 'session-rules.js')) + '"';
  s.hooks = s.hooks || {};
  s.hooks.PreToolUse = (s.hooks.PreToolUse || []).filter(h => !isKitHook(h));
  s.hooks.PreToolUse.push({ matcher: 'Bash|PowerShell|Edit|Write|MultiEdit|NotebookEdit|Read|Grep', hooks: [{ type: 'command', command: guard }] });
  s.hooks.SessionStart = (s.hooks.SessionStart || []).filter(h => !isKitHook(h));
  s.hooks.SessionStart.push({ hooks: [{ type: 'command', command: rules }] });
  s.env = Object.assign({}, s.env, { EP_KIT: fwd(ROOT) });
  step('thêm hook guard-easypos + session-rules và EP_KIT=' + fwd(ROOT) + ' vào ' + sp);
  if (!DRY) {
    fs.mkdirSync(path.dirname(sp), { recursive: true });
    if (fs.existsSync(sp)) backup(sp);
    fs.writeFileSync(sp, JSON.stringify(s, null, 2) + '\n');
  }
}

// 3. Bộ thử hook (không chạy lệnh thật nào)
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'guard-easypos.test.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { EP_GUARD_NOLOG: '1' }) });
  console.log(out.trim().split('\n').pop());
} catch (e) {
  console.error('BỘ THỬ HOOK CÓ CA SAI:\n' + (e.stdout || e.message));
  process.exit(1);
}

console.log('\nViệc còn lại (tự làm, KHÔNG dán mật khẩu cho Claude):');
console.log('  1. Mở ' + fwd(path.join(CFG, 'tai-khoan.json')) + ' trong VS Code, điền user / password (web: tài khoản EasyPOS dữ liệu giả, tắt OTP; db: tài khoản CSDL chỉ-đọc).');
console.log('  2. (Tuỳ chọn) điền jira.token trong ' + fwd(path.join(CFG, 'jira.properties')) + ' để Claude đọc được ticket Jira.');
console.log('  3. ' + (GLOBAL ? 'Mở phiên Claude Code MỚI để nạp hook.' : 'Chạy lại với --global-hooks (hoặc bấm CAI-DAT.cmd) để cài hook vào ~/.claude.'));
