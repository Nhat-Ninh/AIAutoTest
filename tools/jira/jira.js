#!/usr/bin/env node
/* jira.js — đọc MỘT issue Jira (chỉ GET) và in bản markdown gọn cho bước phân tích / tái hiện lỗi khi kiểm thử.
 *
 *   node jira.js EPB-12345 [--json]
 *
 * Địa chỉ: https://jira-sds.softdreams.vn:8080 (đổi bằng biến EP_JIRA_URL). Token (Personal Access Token, chỉ cần quyền đọc):
 *   biến môi trường EP_JIRA_TOKEN  >  ~/.easypos-tester/jira.properties (jira.token=…).
 * Token không bao giờ được in. Mã issue kiểm bằng regex trước khi gửi. Không ghi gì lên Jira.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const KIT = path.resolve(__dirname, '..', '..');
const BASE = (process.env.EP_JIRA_URL || 'https://jira-sds.softdreams.vn:8080').replace(/\/+$/, '');
const key = String(process.argv[2] || '').trim().toUpperCase();
if (!/^[A-Z][A-Z0-9]{1,15}-\d{1,7}$/.test(key)) { console.error('dung: node jira.js <MA-ISSUE> (vd EPB-12345)'); process.exit(2); }

function docProps(f) {
  try { const o = {}; for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([\w.-]+)\s*[=:]\s*(.*?)\s*$/); if (m && !l.trim().startsWith('#')) o[m[1]] = m[2]; } return o; }
  catch (e) { return {}; }
}
let token = process.env.EP_JIRA_TOKEN || '';
for (const f of [path.join(os.homedir(), '.easypos-tester', 'jira.properties')]) { if (token) break; token = docProps(f)['jira.token'] || ''; }
if (!token) {
  console.error('Chua co token Jira: dat EP_JIRA_TOKEN, hoac ghi jira.token=... vao ~/.easypos-tester/jira.properties (Jira -> Profile -> Personal Access Tokens).');
  console.error('Khong co token thi dan noi dung issue (tieu de, mo ta, buoc tai hien, ket qua mong doi) vao chat.');
  process.exit(3);
}

const fields = 'summary,issuetype,status,priority,assignee,reporter,created,updated,description,environment,components,fixVersions,versions,labels,issuelinks,subtasks,comment,attachment,parent,resolution';
const u = new URL(BASE + '/rest/api/2/issue/' + encodeURIComponent(key) + '?fields=' + fields);
const req = https.get(u, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, rejectUnauthorized: false, timeout: 30000 }, res => {
  let b = ''; res.setEncoding('utf8'); res.on('data', d => (b += d));
  res.on('end', () => {
    if (res.statusCode === 401 || res.statusCode === 403) { console.error('Jira tu choi (HTTP ' + res.statusCode + ') - token sai / het han / khong co quyen xem ' + key + '.'); process.exit(4); }
    if (res.statusCode === 404) { console.error('Khong thay issue ' + key + ' (hoac khong co quyen xem).'); process.exit(4); }
    if (res.statusCode !== 200) { console.error('Jira loi HTTP ' + res.statusCode); process.exit(4); }
    const j = JSON.parse(b); const f = j.fields || {};
    if (process.argv.includes('--json')) { console.log(JSON.stringify({ key: j.key, fields: f }, null, 2)); return; }
    const ten = x => (x && (x.displayName || x.name || x.value)) || '—';
    const cat = (s, n) => { s = String(s || '').replace(/\r/g, ''); return s.length > n ? s.slice(0, n) + '\n…(cắt bớt)' : s; };
    const o = [];
    o.push('# ' + j.key + ' — ' + (f.summary || ''));
    o.push('');
    o.push('- Loại: ' + ten(f.issuetype) + ' · Trạng thái: ' + ten(f.status) + ' · Ưu tiên: ' + ten(f.priority) + (f.resolution ? ' · Giải quyết: ' + ten(f.resolution) : ''));
    o.push('- Người làm: ' + ten(f.assignee) + ' · Người báo: ' + ten(f.reporter) + ' · Tạo: ' + String(f.created || '').slice(0, 16) + ' · Cập nhật: ' + String(f.updated || '').slice(0, 16));
    if (f.parent) o.push('- Thuộc: ' + f.parent.key + ' — ' + ((f.parent.fields || {}).summary || ''));
    if ((f.components || []).length) o.push('- Thành phần: ' + f.components.map(ten).join(', '));
    if ((f.labels || []).length) o.push('- Nhãn: ' + f.labels.join(', '));
    if ((f.versions || []).length || (f.fixVersions || []).length) o.push('- Phiên bản lỗi: ' + (f.versions || []).map(ten).join(', ') + ' · Sửa ở: ' + (f.fixVersions || []).map(ten).join(', '));
    o.push('', '## Mô tả', '', cat(f.description, 8000) || '_(trống)_');
    if (f.environment) o.push('', '## Môi trường', '', cat(f.environment, 1500));
    if ((f.issuelinks || []).length) { o.push('', '## Liên kết'); for (const l of f.issuelinks) { const x = l.outwardIssue || l.inwardIssue; if (x) o.push('- ' + (l.outwardIssue ? l.type.outward : l.type.inward) + ' ' + x.key + ' — ' + ((x.fields || {}).summary || '') + ' (' + ten((x.fields || {}).status) + ')'); } }
    if ((f.subtasks || []).length) { o.push('', '## Sub-task'); for (const s of f.subtasks) o.push('- ' + s.key + ' — ' + ((s.fields || {}).summary || '') + ' (' + ten((s.fields || {}).status) + ')'); }
    if ((f.attachment || []).length) { o.push('', '## Tệp đính kèm (chỉ tên)'); for (const t of f.attachment) o.push('- ' + t.filename + ' (' + Math.round((t.size || 0) / 1024) + ' KB)'); }
    const cm = ((f.comment || {}).comments || []).slice(-15);
    if (cm.length) { o.push('', '## Bình luận (' + cm.length + ' gần nhất)'); for (const c of cm) o.push('', '**' + ten(c.author) + '** · ' + String(c.created || '').slice(0, 16), '', cat(c.body, 2000)); }
    console.log(o.join('\n'));
  });
});
req.on('timeout', () => { req.destroy(); console.error('Jira qua 30 giay khong tra loi (mang / VPN).'); process.exit(4); });
req.on('error', e => { console.error('Khong ket noi duoc Jira: ' + e.message); process.exit(4); });
