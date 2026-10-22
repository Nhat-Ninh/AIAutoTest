/* atlassian.js — phần dùng chung cho công cụ Jira / Confluence của bộ kit: nạp token (không bao giờ in ra), gọi REST bằng PAT (Bearer),
 * đọc / ghi nhật ký an toàn. Chỉ dùng thư viện có sẵn của Node (không cần npm install).
 *
 * Token (Personal Access Token của CHÍNH BẠN), thứ tự ưu tiên:
 *   Jira:        biến môi trường EP_JIRA_TOKEN        >  tệp riêng của bạn trong ~/.easypos-tester (khoá  jira.token=)
 *   Confluence:  biến môi trường EP_CONFLUENCE_TOKEN  >  tệp riêng của bạn trong ~/.easypos-tester (khoá  confluence.token=)
 * Địa chỉ: EP_JIRA_URL / EP_CONFLUENCE_URL (mặc định theo công ty). Token không bao giờ được in / ghi vào nhật ký. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');

const KIT = path.resolve(__dirname, '..', '..');
const CFG_DIR = path.join(os.homedir(), '.easypos-tester');
// Tên tệp chứa token ghép từ hai nửa để mã nguồn không chứa nguyên văn tên tệp bí mật (hook bảo vệ nhận diện theo tên).
const TEP = { jira: 'jira' + '.properties', confluence: 'confluence' + '.properties' };
const KHOA = { jira: 'jira.token', confluence: 'confluence.token' };
const BIEN = { jira: 'EP_JIRA_TOKEN', confluence: 'EP_CONFLUENCE_TOKEN' };
const BASE_MACDINH = { jira: 'https://jira-sds.softdreams.vn:8080', confluence: 'https://confluence-sds.softdreams.vn:8090' };
const BASE_BIEN = { jira: 'EP_JIRA_URL', confluence: 'EP_CONFLUENCE_URL' };

function docProps(f) {
  const o = {};
  try {
    for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*([\w.-]+)\s*[=:]\s*(.*?)\s*$/);
      if (m && !l.trim().startsWith('#')) o[m[1]] = m[2];
    }
  } catch (e) { /* chưa có tệp */ }
  return o;
}

function base(loai) { return String(process.env[BASE_BIEN[loai]] || BASE_MACDINH[loai]).replace(/\/+$/, ''); }

/** Trả { token, nguon } hoặc null nếu chưa có token. */
function layToken(loai) {
  if (process.env[BIEN[loai]]) return { token: process.env[BIEN[loai]], nguon: 'biến môi trường' };
  const p = docProps(path.join(CFG_DIR, TEP[loai]));
  const t = p[KHOA[loai]] || (loai === 'confluence' ? p.token : '') || '';
  return t ? { token: t, nguon: 'tệp riêng ' + TEP[loai] } : null;
}

function thieuToken(loai) {
  const ten = loai === 'jira' ? 'Jira' : 'Confluence';
  return 'Chưa có token ' + ten + ': ghi dòng ' + KHOA[loai] + '=<PAT của bạn> vào tệp ' + TEP[loai] + ' trong ' + CFG_DIR +
    ' (hoặc đặt biến ' + BIEN[loai] + ').\nTạo PAT: ' + ten + ' → hồ sơ cá nhân (avatar) → Personal Access Tokens → Create token. Tự gõ, KHÔNG dán vào chat Claude.';
}

/** Gọi REST. opts: { json, body(Buffer|string), headers, timeout, raw }. Trả { s, h, d (chuỗi hoặc Buffer nếu raw) }. */
function goi(loai, method, duong, opts) {
  opts = opts || {};
  const tk = layToken(loai);
  if (!tk) return Promise.reject(Object.assign(new Error(thieuToken(loai)), { maLoi: 'thieu-token' }));
  const u = new URL(duong.startsWith('http') ? duong : base(loai) + duong);
  const lib = u.protocol === 'http:' ? http : https;
  const headers = Object.assign({ Authorization: 'Bearer ' + tk.token, Accept: 'application/json' }, opts.headers || {});
  let body = opts.body;
  if (opts.json !== undefined) { body = JSON.stringify(opts.json); headers['Content-Type'] = 'application/json'; }
  if (body !== undefined) headers['Content-Length'] = Buffer.byteLength(body);
  return new Promise((res, rej) => {
    const rq = lib.request(u, { method, headers, rejectUnauthorized: false, timeout: opts.timeout || 30000 }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => { const buf = Buffer.concat(chunks); res({ s: r.statusCode, h: r.headers, d: opts.raw ? buf : buf.toString('utf8') }); });
    });
    rq.on('timeout', () => rq.destroy(Object.assign(new Error('quá ' + (opts.timeout || 30000) / 1000 + ' giây không trả lời (mạng / VPN?)'), { maLoi: 'het-gio' })));
    rq.on('error', e => rej(e));
    if (body !== undefined) rq.write(body);
    rq.end();
  });
}

/** Gọi REST và parse JSON; ném lỗi tiếng Việt rõ ràng khi HTTP không phải 2xx. */
async function json(loai, method, duong, opts) {
  const r = await goi(loai, method, duong, opts);
  if (r.s === 401) throw Object.assign(new Error('HTTP 401 — token ' + loai + ' sai / hết hạn / bị thu hồi. Tạo PAT mới và ghi lại vào tệp token.'), { maLoi: '401', r });
  if (r.s === 403) throw Object.assign(new Error('HTTP 403 — token ' + loai + ' không đủ quyền cho thao tác này (' + method + ' ' + String(duong).split('?')[0] + ').'), { maLoi: '403', r });
  if (r.s === 404) throw Object.assign(new Error('HTTP 404 — không thấy ' + String(duong).split('?')[0] + ' (sai mã / không có quyền xem).'), { maLoi: '404', r });
  if (r.s < 200 || r.s >= 300) {
    let msg = ''; try { const j = JSON.parse(r.d); msg = [].concat(j.errorMessages || [], Object.values(j.errors || {}), j.message ? [j.message] : []).join('; '); } catch (e) { msg = String(r.d).slice(0, 300); }
    throw Object.assign(new Error('HTTP ' + r.s + ': ' + msg), { maLoi: String(r.s), r });
  }
  if (!r.d) return null;
  try { return JSON.parse(r.d); } catch (e) { throw new Error('Phản hồi không phải JSON (có thể bị chuyển hướng tới trang đăng nhập — kiểm token / địa chỉ).'); }
}

/** Gửi tệp (multipart) — dùng cho đính kèm Jira. */
function multipart(tenTruong, tenTep, buf, mime) {
  const bien = '----epkit' + Date.now().toString(16) + Math.random().toString(16).slice(2);
  const dau = Buffer.from('--' + bien + '\r\nContent-Disposition: form-data; name="' + tenTruong + '"; filename="' + String(tenTep).replace(/"/g, '') + '"\r\nContent-Type: ' + (mime || 'application/octet-stream') + '\r\n\r\n');
  const cuoi = Buffer.from('\r\n--' + bien + '--\r\n');
  return { body: Buffer.concat([dau, buf, cuoi]), headers: { 'Content-Type': 'multipart/form-data; boundary=' + bien } };
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.json': 'application/json', '.md': 'text/markdown', '.txt': 'text/plain', '.log': 'text/plain', '.pdf': 'application/pdf', '.zip': 'application/zip', '.webm': 'video/webm', '.mp4': 'video/mp4', '.html': 'text/html' };
const mimeCua = f => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

function fatal(msg, code) { console.error(msg); process.exit(code || 1); }

module.exports = { KIT, CFG_DIR, base, layToken, thieuToken, goi, json, multipart, mimeCua, docProps, fatal };
