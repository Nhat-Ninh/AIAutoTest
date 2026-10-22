#!/usr/bin/env node
/* kiem-tra-may.js — "bác sĩ máy" cho tester: kiểm TỪNG điều kiện để chạy được bộ kit và chỉ cách sửa ngay chỗ nào chưa đạt.
 *
 *   KIEM-TRA-MAY.cmd            (bấm đúp)  — kiểm cài đặt, mạng / VPN, tài khoản, CSDL, hook
 *   KIEM-TRA-MAY.cmd --sau      — kiểm thêm: chạy bài kiểm đăng nhập giao diện + API trên dev (mất ~30 giây)
 *
 * Không in mật khẩu (chỉ báo "đã điền / chưa điền"). Chỉ đọc; không sửa gì. Thoát mã 1 nếu còn lỗi [X]. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');

const KIT = path.resolve(__dirname, '..', '..');
const E2E = path.join(KIT, 'e2e');
const HOME = os.homedir();
const CFG_DIR = path.join(HOME, '.easypos-tester');
const TEN_TK = ['tai-', 'khoan.json'].join('');
const SAU = process.argv.includes('--sau');
let loi = 0, canh = 0;

const ok = m => console.log('  [OK] ' + m);
const canhBao = (m, cach) => { canh++; console.log('  [!]  ' + m); if (cach) console.log('       → ' + cach); };
const hong = (m, cach) => { loi++; console.log('  [X]  ' + m); if (cach) console.log('       → ' + cach); };
const tieuDe = s => console.log('\n== ' + s);
const docJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const chay = (lenh, args, opt) => {
  const o = Object.assign({ encoding: 'utf8', timeout: 120000 }, opt || {});
  // Windows: chạy qua shell bằng MỘT chuỗi lệnh (tránh cảnh báo của Node khi truyền mảng tham số cùng shell).
  return process.platform === 'win32' ? spawnSync([lenh].concat(args || []).join(' '), Object.assign(o, { shell: true })) : spawnSync(lenh, args || [], o);
};

function get(url, ms) {
  return new Promise(resolve => {
    let xong = false;
    const fin = r => { if (!xong) { xong = true; resolve(r); } };
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: ms || 8000, rejectUnauthorized: false }, res => { res.resume(); fin({ status: res.statusCode }); });
      req.on('timeout', () => { req.destroy(); fin({ loi: 'quá ' + (ms || 8000) / 1000 + ' giây không trả lời' }); });
      req.on('error', e => fin({ loi: e.code || e.message }));
    } catch (e) { fin({ loi: e.message }); }
  });
}

function thuMucTrinhDuyet() {
  const e = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (e && e !== '0') return e;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'ms-playwright');
  return process.platform === 'darwin' ? path.join(HOME, 'Library', 'Caches', 'ms-playwright') : path.join(HOME, '.cache', 'ms-playwright');
}

(async () => {
  console.log('KIỂM TRA MÁY — EasyPOS tester kit');
  console.log('  Bộ kit: ' + KIT);

  /* 1. Công cụ */
  tieuDe('1. Công cụ cần có');
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 18) ok('Node.js ' + process.versions.node); else hong('Node.js ' + process.versions.node + ' quá cũ (cần ≥ 18)', 'Cài Node LTS tại https://nodejs.org rồi mở cửa sổ mới');
  const git = chay('git', ['--version']);
  if (git.status === 0) ok((git.stdout || '').trim()); else canhBao('Không thấy Git', 'Cài tại https://git-scm.com/download/win (cần cho CAP-NHAT.cmd)');
  const npm = chay('npm', ['--version']);
  if (npm.status === 0) ok('npm ' + (npm.stdout || '').trim()); else hong('Không chạy được npm', 'Cài lại Node.js LTS, rồi đóng và mở lại cửa sổ lệnh');

  /* 2. Vị trí bộ kit */
  tieuDe('2. Vị trí bộ kit');
  if (!fs.existsSync(path.join(KIT, 'hooks', 'guard-easypos.js')) || !fs.existsSync(path.join(E2E, 'package.json'))) {
    hong('Thư mục này không giống bộ kit (thiếu hooks\\guard-easypos.js hoặc e2e\\package.json)',
      'Có thể bạn clone thừa một lớp thư mục (vd C:\\easypos-tester\\AIAutoTest\\…). Chạy lại từ thư mục có CAI-DAT.cmd');
  } else ok('Có đủ hooks\\ và e2e\\');
  if (/[^\x20-\x7e]/.test(KIT) || /\s/.test(KIT)) canhBao('Đường dẫn bộ kit có dấu cách / ký tự có dấu: ' + KIT, 'Nên đặt ở đường dẫn ngắn, không dấu, ví dụ C:\\easypos-tester');
  else ok('Đường dẫn gọn, không dấu');

  /* 3. Thư viện test và trình duyệt */
  tieuDe('3. Thư viện test và trình duyệt (Playwright)');
  const yeuCau = (docJson(path.join(E2E, 'package.json')) || {}).devDependencies || {};
  const coPw = docJson(path.join(E2E, 'node_modules', '@playwright', 'test', 'package.json'));
  const coMssql = fs.existsSync(path.join(E2E, 'node_modules', 'mssql', 'package.json'));
  if (!coPw || !coMssql) hong('Chưa cài thư viện test trong e2e', 'Mở cmd: cd /d "' + E2E + '"  rồi  npm install');
  else if (yeuCau['@playwright/test'] && coPw.version !== yeuCau['@playwright/test']) canhBao('Playwright ' + coPw.version + ' khác bản yêu cầu ' + yeuCau['@playwright/test'], 'cd /d "' + E2E + '" rồi npm install');
  else ok('@playwright/test ' + coPw.version + ' và mssql đã cài');
  const goc = thuMucTrinhDuyet();
  let thuMuc = [];
  try { thuMuc = fs.readdirSync(goc); } catch (e) { /* chưa có */ }
  const coChromium = thuMuc.some(d => /^chromium(_headless_shell)?-\d+$/.test(d));
  const coFfmpeg = thuMuc.some(d => /^ffmpeg-\d+$/.test(d));
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p => fs.existsSync(p));
  const rieng = docJson(path.join(CFG_DIR, 'tester.json')) || {};
  if (coChromium) ok('Có trình duyệt chromium của Playwright');
  else if (edge) canhBao('Chưa có chromium của Playwright — sẽ dùng Microsoft Edge có sẵn', 'Tốt nhất: cd /d "' + E2E + '" rồi npx playwright install  (tải chromium + ffmpeg). Hoặc đặt biến EP_TRINH_DUYET=msedge');
  else hong('Không có trình duyệt nào để chạy test (chưa tải chromium, không thấy Edge)', 'cd /d "' + E2E + '" rồi npx playwright install  (cần mạng ra internet; có proxy thì đặt HTTPS_PROXY trước)');
  if (coFfmpeg) ok('Có ffmpeg (quay video khi test trượt)');
  else canhBao('Chưa có ffmpeg — bộ kit tự TẮT quay video, test vẫn chạy', 'Muốn có video: cd /d "' + E2E + '" rồi npx playwright install ffmpeg');
  if (rieng.trinhDuyet) ok('Trình duyệt ghi trong tester.json: ' + rieng.trinhDuyet);

  /* 4. Cấu hình môi trường */
  tieuDe('4. Cấu hình môi trường dev');
  const cau = docJson(path.join(KIT, 'config', 'moi-truong.json'));
  const dev = cau && cau.moiTruong && cau.moiTruong.dev;
  if (!dev || !dev.webUrl || !dev.apiUrl) hong('config\\moi-truong.json chưa có địa chỉ dev', 'Cập nhật bộ kit (CAP-NHAT.cmd) hoặc báo người phụ trách');
  else ok('Dev: ' + dev.webUrl + '  (CSDL ' + (dev.db && dev.db.database) + ')');

  /* 5. Mạng / VPN */
  tieuDe('5. Mạng / VPN tới môi trường dev');
  if (dev && dev.webUrl) {
    const w = await get(dev.webUrl);
    if (w.status && w.status < 500) ok('Mở được ' + dev.webUrl + ' (HTTP ' + w.status + ')');
    else hong('Không mở được ' + dev.webUrl + (w.loi ? ' (' + w.loi + ')' : ' (HTTP ' + w.status + ')'), 'Bật VPN công ty rồi chạy lại. Thử mở địa chỉ này bằng trình duyệt');
    const p = await get(String(dev.apiUrl).replace(/\/?$/, '/') + 'p/client/ping');
    if (p.status === 200) ok('API dev trả lời (ping HTTP 200)');
    else hong('API dev không trả lời ' + (p.loi ? '(' + p.loi + ')' : '(HTTP ' + p.status + ')'), 'Kiểm VPN; nếu web mở được mà API không, báo người phụ trách');
  }

  /* 6. Tài khoản */
  tieuDe('6. Tài khoản của bạn (' + TEN_TK + ')');
  const fTk = path.join(CFG_DIR, TEN_TK);
  const tk = docJson(fTk);
  let tkDu = false;
  if (!fs.existsSync(fTk)) hong('Chưa có tệp ' + fTk, 'Bấm CAI-DAT.cmd (tự tạo từ mẫu) hoặc chép config\\tai-khoan.example.json thành tệp đó, rồi tự điền');
  else if (!tk) hong('Tệp ' + TEN_TK + ' bị lỗi định dạng JSON', 'Mở bằng VS Code, xem dấu gạch đỏ: thiếu dấu " hoặc dấu phẩy');
  else {
    const d = tk.dev || {};
    const c = { 'dev.web.user': d.web && d.web.user, 'dev.web.password': d.web && d.web.password, 'dev.db.user': d.db && d.db.user, 'dev.db.password': d.db && d.db.password };
    const thieu = Object.keys(c).filter(k => !c[k]);
    if (thieu.length) hong('Khối dev còn trống: ' + thieu.join(', '), 'Mở ' + fTk + ' bằng VS Code, điền rồi bấm Ctrl+S (tab còn chấm tròn = chưa lưu). KHÔNG dán mật khẩu vào chat');
    else { ok('Khối dev đã điền đủ 4 ô (web + CSDL)'); tkDu = true; }
    const u = tk.uat || {};
    if (!(u.web && u.web.user)) console.log('  [i]  Khối uat chưa điền — bình thường nếu bạn chưa cần chạy UAT');
  }

  /* 7. CSDL */
  tieuDe('7. Đọc CSDL dev (chỉ SELECT)');
  if (!tkDu) console.log('  [i]  Bỏ qua — cần điền xong tài khoản (mục 6)');
  else if (!coPw || !coMssql) console.log('  [i]  Bỏ qua — cần cài thư viện (mục 3)');
  else {
    const f = path.join(os.tmpdir(), 'ep-kiem-may.sql');
    fs.writeFileSync(f, 'SELECT @@SERVERNAME AS may, DB_NAME() AS csdl\n');
    const r = chay('node', ['"' + path.join(KIT, 'tools', 'tester', 'dbq.js') + '"', 'dev', '"' + f + '"']);
    const out = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/);
    const dong = out.findIndex(l => /^may\s+csdl/.test(l));
    if (r.status === 0 && dong >= 0) ok('Đọc được CSDL: ' + out[dong + 1].replace(/\t/g, ' / '));
    else hong('Không đọc được CSDL dev', (out.filter(l => l && !l.startsWith('#')).slice(0, 2).join(' | ') || 'xem thông báo trên') + '  — thường do sai mật khẩu CSDL hoặc chưa bật VPN. Đừng thử lại liên tục (tài khoản có thể bị khoá)');
    try { fs.unlinkSync(f); } catch (e) { /* bỏ qua */ }
  }

  /* 8. Hook bảo vệ */
  tieuDe('8. Hook bảo vệ trong Claude Code');
  const st = docJson(path.join(HOME, '.claude', 'settings.json'));
  const txt = st ? JSON.stringify(st) : '';
  if (/guard-easypos/.test(txt)) {
    ok('Đã cài hook guard-easypos');
    const epKit = st.env && st.env.EP_KIT;
    if (epKit && path.resolve(epKit).toLowerCase() !== KIT.toLowerCase()) canhBao('EP_KIT trỏ tới ' + epKit + ' nhưng bạn đang ở ' + KIT, 'Bấm CAI-DAT.cmd trong thư mục bộ kit bạn định dùng, rồi Reload Window');
  } else canhBao('Chưa cài hook bảo vệ', 'Bấm đúp CAI-DAT.cmd, rồi VS Code: Ctrl+Shift+P → Developer: Reload Window, mở cuộc trò chuyện Claude mới');

  /* 8b. Jira / Confluence */
  tieuDe('8b. Jira và Confluence (token cá nhân — tùy chọn nhưng nên có)');
  const thuTok = (ten, tep, loai) => {
    const r = chay('node', ['"' + path.join(KIT, 'tools', tep) + '"', loai]);
    const out = ((r.stdout || '') + '\n' + (r.stderr || '')).split(/\r?\n/).filter(Boolean);
    if (r.status === 0) { const dong = out.find(l => /^Đăng nhập bằng/.test(l)); ok(ten + ': token dùng được — ' + (dong || '').replace('Đăng nhập bằng: ', '').replace(/ — ticket kit tạo.*$/, '')); return true; }
    const noi = out.join(' ');
    if (/Chưa có token/.test(noi)) canhBao(ten + ': chưa có token', 'Tạo PAT trong ' + ten + ' (avatar → Personal Access Tokens) rồi tự gõ vào tệp token của bạn (xem HUONG-DAN-TESTER.md Phần 6.4). Không có token vẫn chạy test được, chỉ không ' + (ten === 'Jira' ? 'tự tạo được ticket' : 'lấy được tài liệu nghiệp vụ'));
    else if (/401/.test(noi)) canhBao(ten + ': token sai / hết hạn / bị thu hồi', 'Tạo PAT mới và ghi lại vào tệp token');
    else if (/403|quyền/.test(noi)) canhBao(ten + ': ' + out[out.length - 1].slice(0, 200), 'Nhờ admin cấp quyền, hoặc dùng token khác');
    else canhBao(ten + ': không kết nối được — ' + (out[out.length - 1] || '').slice(0, 160), 'Kiểm VPN');
    return false;
  };
  if (coPw !== undefined) { thuTok('Jira', path.join('jira', 'jira-tao.js'), '--toi'); thuTok('Confluence', path.join('confluence', 'confluence.js'), 'toi'); }

  /* 9. Bài kiểm đăng nhập (tùy chọn) */
  if (SAU) {
    tieuDe('9. Bài kiểm đăng nhập giao diện + API trên dev (mất ~30 giây)');
    if (loi) console.log('  [i]  Bỏ qua — sửa các lỗi [X] ở trên trước');
    else {
      const r = chay('npx playwright test tests/_kiem-moi-truong --project=dev --reporter=line', [], { cwd: E2E, timeout: 300000 });
      const out = (((r.stdout || '') + '\n' + (r.stderr || '')).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).split(/\r?\n/);
      const tom = out.filter(l => /passed|failed|skipped/.test(l)).slice(-3);
      tom.forEach(l => console.log('       ' + l.trim()));
      const loiDong = out.find(l => /KHÔNG thuộc công ty|Executable doesn't exist|Chưa có tài khoản|BAD_CREDENTIALS|id_token|TỪ CHỐI/.test(l));
      if (r.status === 0) ok('3/3 bài kiểm đăng nhập đạt');
      else hong('Bài kiểm đăng nhập chưa đạt' + (loiDong ? ': ' + loiDong.trim().slice(0, 300) : ''), 'Tra bảng lỗi trong HUONG-DAN-TESTER.md (Phần 11) hoặc gửi nguyên văn thông báo cho người phụ trách');
    }
  }

  /* Tổng kết */
  console.log('\n==============================================');
  if (loi) { console.log('  KẾT QUẢ: còn ' + loi + ' lỗi [X] cần sửa (và ' + canh + ' cảnh báo [!]). Sửa theo dấu → rồi chạy lại KIEM-TRA-MAY.cmd.'); process.exit(1); }
  console.log('  KẾT QUẢ: máy sẵn sàng' + (canh ? ' (còn ' + canh + ' cảnh báo [!] — không chặn, đọc cho biết)' : '') + (SAU ? '.' : '. Chạy thêm KIEM-TRA-MAY.cmd --sau để thử đăng nhập thật.'));
  process.exit(0);
})();
