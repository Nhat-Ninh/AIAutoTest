#!/usr/bin/env node
/* code-insight-cai.js — nối / gỡ cổng đọc mã Code-Insight cho MÁY TESTER theo config/code-insight.json (kit tự gọi mỗi phiên Claude; chạy lại bao nhiêu lần cũng được).
 *
 *   node code-insight-cai.js [dong-bo] [--dry-run] [--yen-lang]   làm cho máy KHỚP cấu hình: bat=true ⇒ ghi mục "code-insight" vào <kit>/.mcp.json
 *                                                               + đặt NODE_EXTRA_CA_CERTS tới chứng chỉ công khai của cổng; bat=false ⇒ gỡ đúng những mục do kit ghi
 *   node code-insight-cai.js kiem                               thử nối cổng bằng token Jira của bạn (initialize + tools/list), báo lỗi dễ hiểu
 *   node code-insight-cai.js trang-thai                         in cấu hình hiện tại
 *
 * An toàn: mặc định TẮT (bat=false) ⇒ không ghi gì. Chỉ đụng mục "code-insight" trong .mcp.json và khoá NODE_EXTRA_CA_CERTS KHI nó là của kit; mục / khoá khác của tester giữ nguyên.
 * Không bao giờ ghi token vào đâu cả (tiêu đề xác thực do code-insight-header.js tạo lúc chạy). Địa chỉ cổng PHẢI là https (EP_CODE_INSIGHT_HTTP=1 chỉ để thử). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

const KIT = path.resolve(__dirname, '..', '..');
const fwd = p => String(p).replace(/\\/g, '/');
const TEN = 'code-insight';
const DAU_HELPER = 'code-insight-header.js';        // cách nối CŨ (HTTP + headersHelper): vẫn nhận ra để thay / gỡ
const DAU_PROXY = 'code-insight-proxy.js';          // cách nối MỚI: máy chủ MCP stdio cục bộ
const TEP_CAU_HINH = () => process.env.EP_CI_CAU_HINH || path.join(KIT, 'config', 'code-insight.json');
const TEP_MCP = () => process.env.EP_CI_MCP || path.join(KIT, '.mcp.json');
const TEP_SETTINGS = () => process.env.EP_CI_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');

function docJson(f) { try { return { ok: true, v: JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) }; } catch (e) { return { ok: false, loi: e.code === 'ENOENT' ? 'chua-co' : 'hong' }; } }
function cauHinh() {
  const r = docJson(TEP_CAU_HINH());
  if (!r.ok) return { bat: false, url: '', caFile: '' };
  const c = r.v || {};
  const url = String(c.url || '').trim();
  // https luôn được; http chỉ khi trỏ về CHÍNH máy này (127.0.0.1 / localhost / [::1]) — chạy thử trên máy người phụ trách, token không đi qua mạng.
  const httpsOk = /^https:\/\//i.test(url) || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(url) || (process.env.EP_CODE_INSIGHT_HTTP === '1' && /^http:\/\//i.test(url));
  return { bat: c.bat === true && !!url && httpsOk, url, caFile: path.resolve(KIT, c.caFile || 'config/code-insight-ca.pem'), saiDiaChi: c.bat === true && !!url && !httpsOk };
}
function backup(f) { try { fs.copyFileSync(f, f + '.bak-easypos-tester-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)); } catch (e) { /* không có tệp để sao lưu */ } }
function ghi(f, obj, dry) { if (dry) return; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n'); }
const laCuaKit = (m) => !!m && ((typeof m.headersHelper === 'string' && m.headersHelper.includes(DAU_HELPER)) || (Array.isArray(m.args) && m.args.some(a => String(a).includes(DAU_PROXY))));

/** Làm máy khớp cấu hình. Trả danh sách việc đã làm (rỗng = không đổi gì). */
function apDung(opt) {
  opt = opt || {}; const dry = !!opt.dry; const viec = [];
  const c = cauHinh();
  if (c.saiDiaChi) viec.push('⚠ config/code-insight.json: url phải là https:// — bỏ qua, chưa bật cổng.');

  /* 1. .mcp.json */
  const mp = TEP_MCP(); const r = docJson(mp);
  if (r.ok || r.loi === 'chua-co') {
    const j = r.ok ? r.v : {}; j.mcpServers = j.mcpServers || {};
    const hienCo = j.mcpServers[TEN];
    if (c.bat) {
      // stdio: Claude tự chạy cầu nối cục bộ (đường dẫn Node tuyệt đối ⇒ không phụ thuộc PATH của VS Code); cầu nối tự lấy token Jira + chứng chỉ, không có bí mật trong tệp này.
      const moi = { type: 'stdio', command: fwd(process.execPath), args: [fwd(path.join(KIT, 'tools', 'tester', DAU_PROXY))] };
      if (hienCo && !laCuaKit(hienCo)) viec.push('⚠ .mcp.json đã có mục "' + TEN + '" KHÔNG phải của kit — giữ nguyên, không ghi đè.');
      else if (JSON.stringify(hienCo) !== JSON.stringify(moi)) { j.mcpServers[TEN] = moi; if (r.ok) backup(mp); ghi(mp, j, dry); viec.push((hienCo ? 'cập nhật' : 'thêm') + ' mục "' + TEN + '" trong ' + fwd(mp)); }
    } else if (laCuaKit(hienCo)) {
      delete j.mcpServers[TEN]; backup(mp);
      if (!Object.keys(j.mcpServers).length && Object.keys(j).length === 1 && !dry) fs.unlinkSync(mp); else { if (!Object.keys(j.mcpServers).length) delete j.mcpServers; ghi(mp, j, dry); }
      viec.push('gỡ mục "' + TEN + '" khỏi ' + fwd(mp) + ' (cổng đã tắt)');
    }
  } else viec.push('⚠ ' + fwd(mp) + ' không đọc được (JSON sai) — không sửa.');

  /* 2. Chứng chỉ công khai của cổng: cầu nối tự dùng config/code-insight-ca.pem (không cần cài đặt TLS toàn máy). Chỉ cảnh báo nếu thiếu; và GỠ biến NODE_EXTRA_CA_CERTS cũ do bản trước của kit đặt. */
  if (c.bat && /^https:/i.test(c.url) && !fs.existsSync(c.caFile)) viec.push('⚠ thiếu ' + fwd(c.caFile) + ' — cổng tự ký sẽ không nối được (người phụ trách cần bỏ chứng chỉ công khai của cổng vào đó và push).');
  const sp = TEP_SETTINGS(); const s = docJson(sp);
  if (s.ok && s.v && s.v.env && s.v.env.NODE_EXTRA_CA_CERTS && path.basename(fwd(s.v.env.NODE_EXTRA_CA_CERTS)) === 'code-insight-ca.pem') {
    const st = s.v; delete st.env.NODE_EXTRA_CA_CERTS; if (!Object.keys(st.env).length) delete st.env; backup(sp); ghi(sp, st, dry); viec.push('gỡ NODE_EXTRA_CA_CERTS cũ của kit khỏi ' + fwd(sp) + ' (không còn cần: cầu nối tự dùng chứng chỉ)');
  }
  return viec;
}

/** Thử nối cổng bằng token Jira của tester. Trả { ok, thongBao, cach }. */
function kiem() {
  return new Promise((resolve) => {
    const c = cauHinh();
    if (!c.bat) return resolve({ ok: false, tat: true, thongBao: 'Cổng Code-Insight đang TẮT (config/code-insight.json bat=false).' });
    let tk = null; try { tk = require('../lib/atlassian').layToken('jira'); } catch (e) { /* chưa có thư viện */ }
    if (!tk) return resolve({ ok: false, thongBao: 'Chưa có token Jira', cach: 'Tạo token Jira (PAT) và ghi vào jira.properties (HUONG-DAN-TESTER Phần 6.4).' });
    const u = new URL(c.url); const lib = u.protocol === 'http:' ? http : https;
    const opt = { method: 'POST', headers: { Authorization: 'Bearer ' + tk.token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, timeout: 15000 };
    if (u.protocol === 'https:' && c.caFile && fs.existsSync(c.caFile)) opt.ca = fs.readFileSync(c.caFile);
    const gui = (body) => new Promise((res, rej) => { const rq = lib.request(u, opt, (r) => { const ch = []; r.on('data', x => ch.push(x)); r.on('end', () => res({ s: r.statusCode, d: Buffer.concat(ch).toString('utf8') })); }); rq.on('timeout', () => rq.destroy(new Error('quá 15 giây không trả lời'))); rq.on('error', rej); rq.end(JSON.stringify(body)); });
    gui({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).then((r) => {
      if (r.s === 401) return resolve({ ok: false, thongBao: 'Cổng từ chối token Jira (401)', cach: 'Tạo lại token Jira (PAT) và ghi vào jira.properties.' });
      if (r.s === 403) return resolve({ ok: false, thongBao: 'Tài khoản Jira chưa được phép dùng cổng (403)', cach: 'Nhờ người phụ trách cấp quyền (cổng dựa trên quyền tạo ticket dự án EPB).' });
      if (r.s === 429) return resolve({ ok: false, thongBao: 'Cổng đang giới hạn tốc độ / hạn mức (429)', cach: 'Chờ một lúc rồi thử lại.' });
      if (r.s !== 200) return resolve({ ok: false, thongBao: 'Cổng trả lỗi ' + r.s, cach: 'Báo người phụ trách.' });
      let n = 0; try { n = JSON.parse(r.d).result.tools.length; } catch (e) { /* không phải JSON */ }
      resolve(n ? { ok: true, thongBao: 'Cổng Code-Insight nối được (' + n + ' tool) — đọc mã nguồn bằng token Jira, không cần quyền Bitbucket' } : { ok: false, thongBao: 'Cổng trả phản hồi lạ', cach: 'Báo người phụ trách.' });
    }, (e) => {
      const m = String(e.code || e.message || e);
      if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(m)) return resolve({ ok: false, thongBao: 'Không tin chứng chỉ của cổng (' + m + ')', cach: 'Admin cần đặt chứng chỉ công khai của cổng vào config/code-insight-ca.pem và push; rồi mở phiên Claude mới.' });
      resolve({ ok: false, thongBao: 'Không nối được cổng (' + m + ')', cach: 'Kiểm VPN / mạng nội bộ; vẫn lỗi thì báo người phụ trách (cổng có thể đang tắt).' });
    });
  });
}

/** Thử nối TCP tới host:port. Trả { ok:true } hoặc { ok:false, ma:'refused' (mạng thông, không có dịch vụ nghe) | 'timeout' (bị chặn / không có đường) | mã khác }. */
function thuTcp(host, port, ms) {
  return new Promise((resolve) => {
    const s = require('net').connect({ host, port: Number(port), timeout: ms || 5000 });
    let xong = false; const fin = (r) => { if (!xong) { xong = true; s.destroy(); resolve(r); } };
    s.on('connect', () => fin({ ok: true }));
    s.on('timeout', () => fin({ ok: false, ma: 'timeout' }));
    s.on('error', (e) => fin({ ok: false, ma: e.code === 'ECONNREFUSED' ? 'refused' : (e.code === 'ETIMEDOUT' ? 'timeout' : (e.code || 'khac')) }));
  });
}

/** Kit có mới không (dong-bo.js kiem). Máy tester + cần cập nhật (mã 10) ⇒ tự chạy cap-nhat. Trả { status, vaiTro, daCapNhat }. */
function kiemKit() {
  let vaiTro = ''; try { vaiTro = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.easypos-tester', 'dong-bo-che-do.json'), 'utf8')).vaiTro || ''; } catch (e) { /* chưa có dấu vai trò */ }
  const tool = path.join(KIT, 'tools', 'tester', 'dong-bo.js');
  const chay = (a) => require('child_process').spawnSync(process.execPath, [tool].concat(a), { encoding: 'utf8', timeout: 180000, windowsHide: true });
  let r = chay(['kiem', '--nhanh', '--yen-lang']); let daCapNhat = false;
  if (r.status === 10 && vaiTro === 'tester') { chay(['cap-nhat', '--yen-lang']); daCapNhat = true; r = chay(['kiem', '--nhanh', '--yen-lang']); }
  return { status: r.error ? -1 : r.status, vaiTro, daCapNhat };
}
function kiemClaude() {
  const r = process.platform === 'win32' ? require('child_process').spawnSync('claude --version', { encoding: 'utf8', timeout: 20000, shell: true, windowsHide: true }) : require('child_process').spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 20000 });
  return r.status === 0 ? String(r.stdout || '').trim().split('\n')[0] : null;
}

/** "Nút bấm" cho máy tester (CAI-CODE-INSIGHT.cmd): kiểm từng điều kiện, tự làm phần tự làm được, nói rõ [OK] / [!] / [X] và việc còn lại.
 *  opt (để thử): { kit, claude, tcp, coToken } thay cho kiểm thật. Ghi nhật ký (không chứa token) ra ~/.easypos-tester/cai-code-insight.log để gửi người phụ trách. */
async function caiDat(opt) {
  opt = opt || {};
  const dong = []; let ok = 0, canh = 0, loi = 0; const viec = [];
  const in_ = (s) => { dong.push(s); console.log(s); };
  const OK = (m) => { ok++; in_('  [OK] ' + m); };
  const CB = (m, cach) => { canh++; in_('  [!]  ' + m); if (cach) { in_('       → ' + cach); viec.push(cach); } };
  const X = (m, cach) => { loi++; in_('  [X]  ' + m); if (cach) { in_('       → ' + cach); viec.push(cach); } };
  const ket = () => {
    in_('\n== Kết quả: ' + ok + ' OK · ' + canh + ' cảnh báo · ' + loi + ' lỗi');
    if (loi) { in_('CHƯA dùng được. Làm các việc sau rồi bấm lại CAI-CODE-INSIGHT.cmd:'); [...new Set(viec)].forEach((v, i) => in_('  ' + (i + 1) + '. ' + v)); in_('Vẫn lỗi: gửi người phụ trách tệp ' + fwd(path.join(os.homedir(), '.easypos-tester', 'cai-code-insight.log'))); }
    else if (canh) { in_('Dùng được, còn lưu ý:'); [...new Set(viec)].forEach((v, i) => in_('  ' + (i + 1) + '. ' + v)); }
    try { const lg = process.env.EP_CI_LOG || path.join(os.homedir(), '.easypos-tester', 'cai-code-insight.log'); fs.mkdirSync(path.dirname(lg), { recursive: true }); fs.writeFileSync(lg, new Date().toISOString() + '\n' + dong.join('\n') + '\n'); } catch (e) { /* không ghi được nhật ký thì thôi */ }
    return { ok, canh, loi };
  };

  in_('CÀI CỔNG ĐỌC MÃ Code-Insight — EasyPOS tester kit');
  in_('  Bộ kit: ' + fwd(KIT));

  in_('\n== 1. Bộ kit');
  const k = opt.kit ? opt.kit() : kiemKit();
  if (k.status === 0) OK('Kit đã mới nhất' + (k.daCapNhat ? ' (vừa tự cập nhật)' : ''));
  else if (k.status === 10) (k.vaiTro === 'tester' ? X : CB)('Kit chưa mới / cần làm nốt sau cập nhật', 'Bấm CAP-NHAT.cmd (1–2 phút) rồi chạy lại');
  else if (k.status === 11) CB('Không kéo được bản kit mới (mạng / đăng nhập GitHub)', 'Bật VPN, đăng nhập GitHub khi Git hỏi, rồi chạy lại');
  else if (k.status === 12) X('Cập nhật kit bị TỪ CHỐI vì đáng ngờ', 'Dừng và báo người phụ trách kit');
  else CB('Không kiểm được trạng thái kit (mã ' + k.status + ')', 'Chạy node tools\\tester\\dong-bo.js trang-thai và báo người phụ trách nếu lỗi');

  in_('\n== 2. Công cụ trên máy');
  if (Number(process.versions.node.split('.')[0]) >= 18) OK('Node ' + process.version); else X('Node ' + process.version + ' quá cũ (cần ≥ 18)', 'Cài Node 20 LTS (HUONG-DAN-TESTER Phần 2.1)');
  const cl = opt.claude ? opt.claude() : kiemClaude();
  if (cl) OK('Claude Code: ' + cl); else CB('Không thấy lệnh claude trong cmd (bỏ qua nếu bạn dùng Claude trong VS Code)', 'Chưa cài Claude Code thì cài theo HUONG-DAN-TESTER Phần 2');

  in_('\n== 3. Cấu hình cổng (config/code-insight.json)');
  const c = cauHinh();
  if (c.saiDiaChi) { X('Địa chỉ cổng không hợp lệ: url phải là https://', 'Báo người phụ trách sửa config/code-insight.json'); return ket(); }
  if (!c.bat) { OK('Cổng Code-Insight đang TẮT (người phụ trách chưa bật) — bạn không cần làm gì, kit đọc mã như trước'); return ket(); }
  OK('Cổng đang BẬT: ' + c.url);
  const https_ = /^https:/i.test(c.url);
  if (https_) {
    if (fs.existsSync(c.caFile)) OK('Có chứng chỉ công khai của cổng (' + path.basename(c.caFile) + ')');
    else if (fs.existsSync(c.caFile + '.crt')) X('Tệp chứng chỉ bị đặt sai tên: ' + path.basename(c.caFile) + '.crt', 'Người phụ trách đổi tên thành ' + path.basename(c.caFile) + ' (bỏ đuôi .crt) rồi push');
    else X('Thiếu tệp chứng chỉ công khai ' + fwd(c.caFile), 'Báo người phụ trách đưa chứng chỉ của cổng vào kit (config/code-insight-ca.pem) và push, rồi bấm CAP-NHAT.cmd');
  }

  in_('\n== 4. Nối cấu hình vào Claude (tự làm)');
  let v = []; try { v = apDung({}); } catch (e) { X('Không ghi được cấu hình MCP: ' + e.message, 'Báo người phụ trách'); }
  if (!v.length) OK('Cấu hình MCP (.mcp.json) và chứng chỉ đã khớp'); else v.forEach(x => (/^⚠/.test(x) ? CB(x.replace(/^⚠\s*/, '')) : OK('Đã cập nhật: ' + x)));

  in_('\n== 5. Token Jira (cổng dùng token của chính bạn để biết bạn là ai)');
  let coTk = false; try { coTk = opt.coToken ? opt.coToken() : !!require('../lib/atlassian').layToken('jira'); } catch (e) { /* không đọc được */ }
  if (coTk) OK('Đã có token Jira (không in ra)'); else X('Chưa có token Jira', 'Tạo PAT Jira và ghi vào jira.properties (HUONG-DAN-TESTER Phần 6.4)');

  in_('\n== 6. Mạng tới cổng');
  const u = new URL(c.url); const cong = u.port || (https_ ? 443 : 80);
  const t = await (opt.tcp || thuTcp)(u.hostname, cong, 5000);
  if (t.ok) OK('Tới được ' + u.hostname + ':' + cong);
  else if (t.ma === 'refused') X('Mạng thông nhưng dịch vụ Code-Insight KHÔNG chạy ở ' + u.hostname + ':' + cong, 'Báo người phụ trách bật lại dịch vụ cổng (không phải lỗi máy bạn)');
  else if (t.ma === 'timeout') X('Không tới được ' + u.hostname + ':' + cong + ' (hết giờ)', 'Bật VPN; vẫn lỗi thì nhờ admin mở cổng ' + cong + ' cho máy / dải VPN của bạn');
  else X('Không nối được ' + u.hostname + ':' + cong + ' (' + t.ma + ')', 'Kiểm VPN / mạng; báo người phụ trách');

  if (t.ok && coTk) {
    in_('\n== 7. Thử gọi cổng thật (bằng token Jira của bạn)');
    const r = await kiem();
    if (r.ok) OK(r.thongBao); else X(r.thongBao, r.cach);
  }

  if (!loi) { in_('\nBước cuối (làm tay): mở phiên Claude MỚI trong thư mục kit, chọn CHO PHÉP máy chủ MCP "code-insight" khi được hỏi; gõ /mcp thấy code-insight "connected".'); }
  return ket();
}

module.exports = { cauHinh, apDung, kiem, caiDat, thuTcp };

if (require.main === module) {
  const a = process.argv.slice(2); const lenh = a.find(x => !x.startsWith('--')) || 'dong-bo';
  if (lenh === 'cai-dat') caiDat().then(r => process.exit(r.loi ? 1 : 0));
  else if (lenh === 'kiem') kiem().then(r => { console.log((r.ok ? '[OK] ' : '[!] ') + r.thongBao + (r.cach ? '\n     → ' + r.cach : '')); process.exit(r.ok || r.tat ? 0 : 1); });
  else if (lenh === 'trang-thai') { const c = cauHinh(); console.log(JSON.stringify({ bat: c.bat, url: c.url || '', caFile: fwd(c.caFile) }, null, 1)); }
  else if (lenh === 'dong-bo') {
    let v; try { v = apDung({ dry: a.includes('--dry-run') }); } catch (e) { console.error('code-insight-cai: ' + e.message); process.exit(0); }
    if (v.length) console.log(v.map(x => (a.includes('--dry-run') ? '[thử] ' : '') + x).join('\n')); else if (!a.includes('--yen-lang')) console.log('Cổng Code-Insight: đã khớp cấu hình, không đổi gì.');
  } else { console.error('Cách dùng: node code-insight-cai.js [dong-bo|kiem|trang-thai] [--dry-run] [--yen-lang]'); process.exit(2); }
}
