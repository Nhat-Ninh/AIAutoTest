#!/usr/bin/env node
/* confluence.js — ĐỌC tài liệu nghiệp vụ trên Confluence (chỉ GET, không sửa gì) và đổi sang markdown để Claude làm nguồn viết testcase.
 *
 *   node confluence.js toi                                  kiểm token + liệt kê vài space đọc được
 *   node confluence.js space                                liệt kê space
 *   node confluence.js tim "<từ khóa>" [--space KEY] [--gioi-han 15]   tìm trang
 *   node confluence.js trang <id | URL | KEY:Tiêu đề> [--ra <thư mục>] [--dinh-kem]   lấy nội dung 1 trang → markdown
 *   node confluence.js con <id | URL> [--sau 3] [--lay]     cây trang con (--lay: lấy luôn nội dung, tối đa 25 trang)
 *   node confluence.js dinh-kem <id | URL> [--tai] [--ra <thư mục>]        liệt kê / tải ảnh, PDF… đính kèm
 *   node confluence.js lien-ket <id | URL>                  mã Jira (EPB-…) được nhắc trong trang
 *
 * Kết quả lưu mặc định ở  <bộ kit>/tai-lieu-nghiep-vu/<id>-<tên>/  (thư mục này KHÔNG lên git — có thể chứa nội dung nội bộ).
 * Mỗi bản markdown ghi rõ: tiêu đề, link, PHIÊN BẢN, ngày sửa, giờ lấy — để báo cáo trích dẫn đúng nguồn.
 * Token: xem tools/lib/atlassian.js (không bao giờ in ra). */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../lib/atlassian.js');

const args = process.argv.slice(2);
const lenh = args[0];
const coCo = n => args.includes(n);
const giaTri = (n, mac) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : mac; };
const THU_MUC_GOC = path.join(A.KIT, 'tai-lieu-nghiep-vu');

/* ============ Đổi XHTML lưu trữ của Confluence → markdown ============ */
function giaiMa(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    const t = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', times: '×' };
    return t[e.toLowerCase()] !== undefined ? t[e.toLowerCase()] : m;
  });
}

const VOID = new Set(['br', 'hr', 'img', 'col', 'input']);
function phanTich(html) {
  const goc = { n: '#', a: {}, c: [] };
  const ngan = [goc];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = ngan[ngan.length - 1];
    if (m[1] !== undefined) { top.c.push({ tx: m[1], raw: true }); continue; }
    if (m[6] !== undefined) { top.c.push({ tx: m[6] }); continue; }
    if (m[3] === undefined) continue;                       // chú thích
    const ten = m[3].toLowerCase();
    if (m[2]) {                                             // thẻ đóng
      let i = ngan.length - 1;
      while (i > 0 && ngan[i].n !== ten) i--;
      if (i > 0) ngan.length = i;
      continue;
    }
    const a = {};
    String(m[4] || '').replace(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_, k, __, v1, v2) => { a[k.toLowerCase()] = giaiMa(v1 !== undefined ? v1 : v2); return ''; });
    const el = { n: ten, a, c: [] };
    top.c.push(el);
    if (!m[5] && !VOID.has(ten)) ngan.push(el);
  }
  return goc;
}

const timCon = (el, ten) => (el.c || []).filter(x => x.n === ten);
const tamCon = (el, ten) => (el.c || []).find(x => x.n === ten);
function thamSo(el, ten) { const p = (el.c || []).find(x => x.n === 'ac:parameter' && x.a['ac:name'] === ten); return p ? chuThuan(p) : ''; }
function chuThuan(el) { return (el.c || []).map(x => (x.tx !== undefined ? (x.raw ? x.tx : giaiMa(x.tx)) : chuThuan(x))).join('').replace(/\s+/g, ' ').trim(); }
const thuTuy = s => String(s || '').replace(/\n{3,}/g, '\n\n');

function veLe(s, tien) { return String(s).split('\n').map(l => (l.length ? tien + l : l)).join('\n'); }

function ve(nodes, ctx) { return (nodes || []).map(x => veMot(x, ctx)).join(''); }

function veDanhSach(el, ctx, sau) {
  const co = el.n === 'ol';
  let i = 0, o = '';
  for (const li of (el.c || []).filter(x => x.n === 'li')) {
    i++;
    const long = (li.c || []).filter(x => x.n === 'ul' || x.n === 'ol');
    const chu = ve((li.c || []).filter(x => x.n !== 'ul' && x.n !== 'ol'), ctx).replace(/\n{2,}/g, '\n').trim();
    o += '  '.repeat(sau) + (co ? i + '. ' : '- ') + chu + '\n';
    for (const l of long) o += veDanhSach(l, ctx, sau + 1);
  }
  return o;
}

function veBang(el, ctx) {
  const hang = [];
  (function lay(e) { for (const x of (e.c || [])) { if (x.n === 'tr') hang.push(x); else if (x.c) lay(x); } })(el);
  if (!hang.length) return '';
  const cell = h => (h.c || []).filter(x => x.n === 'td' || x.n === 'th').map(td => ve(td.c, ctx).trim().replace(/\n{2,}/g, ' <br> ').replace(/\n/g, ' ').replace(/\|/g, '\\|'));
  const rows = hang.map(cell);
  const cot = Math.max(...rows.map(r => r.length));
  const chuan = r => { while (r.length < cot) r.push(''); return '| ' + r.join(' | ') + ' |'; };
  return '\n\n' + chuan(rows[0]) + '\n| ' + Array(cot).fill('---').join(' | ') + ' |\n' + rows.slice(1).map(chuan).join('\n') + '\n\n';
}

function veMacro(el, ctx) {
  const ten = (el.a['ac:name'] || '').toLowerCase();
  const than = tamCon(el, 'ac:rich-text-body');
  const mdThan = than ? ve(than.c, ctx).trim() : '';
  switch (ten) {
    case 'code': case 'noformat': {
      const t = tamCon(el, 'ac:plain-text-body');
      return '\n\n```' + (thamSo(el, 'language') || '') + '\n' + (t ? (t.c || []).map(x => x.tx || '').join('') : '') + '\n```\n\n';
    }
    case 'info': case 'note': case 'warning': case 'tip': case 'panel': {
      const nhan = { info: 'Thông tin', note: 'Lưu ý', warning: 'Cảnh báo', tip: 'Mẹo', panel: thamSo(el, 'title') || 'Khung' }[ten];
      return '\n\n' + veLe('**' + nhan + ':** ' + mdThan, '> ') + '\n\n';
    }
    case 'expand': case 'ui-expand': return '\n\n**' + (thamSo(el, 'title') || 'Mở rộng') + '**\n\n' + mdThan + '\n\n';
    case 'toc': case 'children': case 'pagetree': case 'recently-updated': case 'livesearch': case 'contentbylabel': return '';
    case 'include': case 'excerpt-include': {
      const pg = (function tim(e) { for (const x of (e.c || [])) { if (x.n === 'ri:page') return x.a['ri:content-title']; if (x.c) { const r = tim(x); if (r) return r; } } return ''; })(el);
      ctx.chen.push(pg); return '\n\n_[Nội dung chèn từ trang: ' + (pg || '?') + ' — lấy riêng nếu cần]_\n\n';
    }
    case 'jira': {
      const k = thamSo(el, 'key') || thamSo(el, 'jqlQuery') || thamSo(el, 'server') || '';
      if (/^[A-Z][A-Z0-9]+-\d+$/.test(k)) ctx.jira.add(k);
      return ' [Jira: ' + (k || '?') + '] ';
    }
    case 'status': return ' [' + (thamSo(el, 'title') || 'trạng thái') + '] ';
    case 'drawio': case 'gliffy': case 'lucid': case 'balsamiq': case 'plantuml': case 'mermaid': {
      const f = thamSo(el, 'diagramName') || thamSo(el, 'name') || '';
      ctx.sodo.push(ten + (f ? ':' + f : '')); return '\n\n_[Sơ đồ ' + ten + (f ? ' "' + f + '"' : '') + ' — nội dung nằm trong hình / tệp đính kèm, đọc bản ảnh nếu cần]_\n\n';
    }
    default: return mdThan ? '\n\n' + mdThan + '\n\n' : (ten ? ' [macro ' + ten + '] ' : '');
  }
}

function veMot(x, ctx) {
  if (x.tx !== undefined) return x.raw ? x.tx : giaiMa(x.tx).replace(/\s+/g, ' ');
  const n = x.n;
  if (/^h[1-6]$/.test(n)) return '\n\n' + '#'.repeat(+n[1]) + ' ' + ve(x.c, ctx).trim() + '\n\n';
  switch (n) {
    case 'p': { const t = ve(x.c, ctx).trim(); return t ? '\n\n' + t + '\n\n' : ''; }
    case 'br': return '  \n';
    case 'hr': return '\n\n---\n\n';
    case 'strong': case 'b': { const t = ve(x.c, ctx).trim(); return t ? '**' + t + '**' : ''; }
    case 'em': case 'i': { const t = ve(x.c, ctx).trim(); return t ? '_' + t + '_' : ''; }
    case 's': case 'del': return '~~' + ve(x.c, ctx).trim() + '~~';
    case 'code': return '`' + chuThuan(x) + '`';
    case 'pre': return '\n\n```\n' + (x.c || []).map(c => c.tx || chuThuan(c)).join('') + '\n```\n\n';
    case 'ul': case 'ol': return '\n\n' + veDanhSach(x, ctx, 0) + '\n';
    case 'table': return veBang(x, ctx);
    case 'blockquote': return '\n\n' + veLe(ve(x.c, ctx).trim(), '> ') + '\n\n';
    case 'a': { const t = ve(x.c, ctx).trim() || x.a.href; return x.a.href ? '[' + t + '](' + x.a.href + ')' : t; }
    case 'time': return x.a.datetime || '';
    case 'img': return '![ảnh](' + (x.a.src || '') + ')';
    case 'ac:image': {
      const att = (function tim(e) { for (const c of (e.c || [])) { if (c.n === 'ri:attachment') return c.a['ri:filename']; if (c.c) { const r = tim(c); if (r) return r; } } return ''; })(x);
      const url = (function tim(e) { for (const c of (e.c || [])) { if (c.n === 'ri:url') return c.a['ri:value']; if (c.c) { const r = tim(c); if (r) return r; } } return ''; })(x);
      if (att) { ctx.anh.add(att); return '\n\n![ảnh: ' + att + '](anh/' + att + ')\n\n'; }
      return url ? '\n\n![ảnh](' + url + ')\n\n' : '';
    }
    case 'ac:link': {
      const trang = tamCon(x, 'ri:page'), tep = tamCon(x, 'ri:attachment'), nd = tamCon(x, 'ri:user');
      const chu = (tamCon(x, 'ac:plain-text-link-body') ? chuThuan(tamCon(x, 'ac:plain-text-link-body')) : '') || (tamCon(x, 'ac:link-body') ? ve(tamCon(x, 'ac:link-body').c, ctx).trim() : '');
      if (trang) { ctx.trang.add(trang.a['ri:content-title']); return '[' + (chu || trang.a['ri:content-title']) + ']' + '(Confluence: ' + trang.a['ri:content-title'] + ')'; }
      if (tep) { ctx.anh.add(tep.a['ri:filename']); return '[' + (chu || tep.a['ri:filename']) + '](anh/' + tep.a['ri:filename'] + ')'; }
      if (nd) return '@' + (chu || nd.a['ri:userkey'] || 'user');
      return chu;
    }
    case 'ri:user': return '@' + (x.a['ri:userkey'] || 'user');
    case 'ac:structured-macro': return veMacro(x, ctx);
    case 'ac:task-list': return '\n\n' + (x.c || []).filter(t => t.n === 'ac:task').map(t => '- [' + (chuThuan(tamCon(t, 'ac:task-status') || { c: [] }) === 'complete' ? 'x' : ' ') + '] ' + ve((tamCon(t, 'ac:task-body') || { c: [] }).c, ctx).trim()).join('\n') + '\n\n';
    case 'ac:parameter': case 'ac:emoticon': case 'ac:placeholder': case 'ac:inline-comment-marker': return n === 'ac:inline-comment-marker' ? ve(x.c, ctx) : '';
    case 'ac:layout': case 'ac:layout-section': case 'ac:layout-cell': case 'ac:rich-text-body': case 'div': case 'span': case 'li': case 'td': case 'th': case 'tr': case 'tbody': case 'thead': return ve(x.c, ctx);
    default: return ve(x.c, ctx);
  }
}

function xhtmlSangMd(html) {
  const ctx = { anh: new Set(), jira: new Set(), trang: new Set(), sodo: [], chen: [] };
  const cay = phanTich(String(html || ''));
  const md = thuTuy(ve(cay.c, ctx)).replace(/[ \t]+\n/g, '\n').replace(/ {3,}/g, '  ').trim();
  return { md, ...ctx };
}

/* ============ Gọi Confluence ============ */
const goi = (duong) => A.json('confluence', 'GET', duong);
const baoLoi = e => A.fatal('LỖI: ' + e.message, e.maLoi === 'thieu-token' ? 3 : 4);
const slug = s => String(s || 'trang').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'trang';

async function layId(tham) {
  const s = String(tham || '').trim();
  if (!s) A.fatal('Thiếu id / URL / "KEY:Tiêu đề" của trang.', 2);
  if (/^\d+$/.test(s)) return s;
  let m = s.match(/[?&]pageId=(\d+)/) || s.match(/\/pages\/(\d+)(?:[\/?#]|$)/) || s.match(/\/content\/(\d+)/);
  if (m) return m[1];
  m = s.match(/\/display\/([^\/]+)\/([^?#]+)/);
  let khoa, tieuDe;
  if (m) { khoa = decodeURIComponent(m[1]); tieuDe = decodeURIComponent(m[2].replace(/\+/g, ' ')); }
  else if (/^[A-Za-z0-9~_-]+:.+/.test(s)) { const i = s.indexOf(':'); khoa = s.slice(0, i); tieuDe = s.slice(i + 1); }
  else A.fatal('Không hiểu "' + s + '". Dùng id số, URL trang, hoặc KEY:Tiêu đề.', 2);
  const j = await goi('/rest/api/content?type=page&spaceKey=' + encodeURIComponent(khoa) + '&title=' + encodeURIComponent(tieuDe) + '&limit=2');
  if (!(j.results || []).length) A.fatal('Không thấy trang "' + tieuDe + '" trong space ' + khoa + '.', 5);
  return j.results[0].id;
}

/* Tìm bản lưu của trang theo mã (thư mục <id>-<slug>/trang.md) và đọc phiên bản đã lưu. null nếu chưa có. */
function timBanLuu(id, thuMuc) {
  try {
    const goc = thuMuc || THU_MUC_GOC;
    const ten = fs.readdirSync(goc).find(f => f.startsWith(id + '-'));
    if (!ten) return null;
    const tep = path.join(goc, ten, 'trang.md');
    const md = fs.readFileSync(tep, 'utf8');
    const m = md.match(/\*\*Phiên bản: (\d+)\*\*/);
    return { tep, md, phienBan: m ? m[1] : '' };
  } catch (e) { return null; }
}
function inTomTatBanLuu(ban, tieuDe) {
  const dong = ban.md.split('\n');
  const muc = dong.map((l, i) => [l, i + 1]).filter(([l]) => /^#{1,4}\s/.test(l)).slice(0, 60).map(([l, i]) => String(i).padStart(4) + ': ' + l);
  console.log('# ' + (tieuDe || '(trang)') + ' — BẢN LƯU CÒN MỚI (phiên bản ' + ban.phienBan + ', ' + dong.length + ' dòng, ~' + Math.ceil(ban.md.length / 3) + ' token)');
  console.log('Đã có trên máy, KHÔNG in lại để khỏi đọc trùng: ' + ban.tep);
  console.log('Mục lục (dòng: tiêu đề) — chỉ đọc đoạn cần bằng Read(offset, limit), hoặc chạy lại với --du để in cả trang, --lam-moi để tải lại:');
  console.log(muc.join('\n'));
}

async function layTrang(id) {
  const j = await goi('/rest/api/content/' + id + '?expand=body.storage,version,space,ancestors,metadata.labels');
  const goc = (j._links && j._links.base) || A.base('confluence');
  const kq = xhtmlSangMd(j.body && j.body.storage && j.body.storage.value);
  const nhan = ((j.metadata && j.metadata.labels && j.metadata.labels.results) || []).map(l => l.name);
  const duongDan = ((j.ancestors || []).map(a => a.title).concat([j.title])).join(' › ');
  const tieuDeDau = [
    '# ' + j.title, '',
    '- Nguồn: ' + goc + ((j._links && j._links.webui) || '/pages/viewpage.action?pageId=' + id),
    '- Space: ' + ((j.space && (j.space.key + ' — ' + j.space.name)) || '?') + ' · Mã trang: ' + id,
    '- **Phiên bản: ' + ((j.version && j.version.number) || '?') + '** · Sửa lần cuối: ' + String((j.version && j.version.when) || '').slice(0, 16).replace('T', ' ') + ' bởi ' + ((j.version && j.version.by && (j.version.by.displayName || j.version.by.username)) || '?'),
    '- Vị trí: ' + duongDan,
    nhan.length ? '- Nhãn: ' + nhan.join(', ') : null,
    '- Lấy lúc: ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' (ghi phiên bản này khi trích dẫn trong báo cáo)', '',
  ].filter(x => x !== null).join('\n');
  return { id, j, goc, kq, mdDay: tieuDeDau + '\n' + kq.md + '\n' };
}

function thuMucTrang(id, tieuDe, thuMuc) { return path.join(thuMuc || THU_MUC_GOC, id + '-' + slug(tieuDe)); }

async function taiDinhKem(id, dich, loc) {
  const j = await goi('/rest/api/content/' + id + '/child/attachment?limit=200');
  const goc = (j._links && j._links.base) || A.base('confluence');
  const ra = [];
  for (const a of (j.results || [])) {
    const ten = a.title; const kt = (a.extensions && a.extensions.fileSize) || 0;
    if (loc && !loc.has(ten)) continue;
    if (kt > 15 * 1024 * 1024) { ra.push({ ten, bo: 'lớn hơn 15 MB' }); continue; }
    const url = goc + a._links.download;
    const r = await A.goi('confluence', 'GET', url, { raw: true, headers: { Accept: '*/*' }, timeout: 60000 });
    if (r.s !== 200) { ra.push({ ten, bo: 'HTTP ' + r.s }); continue; }
    fs.mkdirSync(dich, { recursive: true });
    fs.writeFileSync(path.join(dich, ten.replace(/[\\/:*?"<>|]/g, '_')), r.d);
    ra.push({ ten, kb: Math.round(r.d.length / 1024) });
  }
  return ra;
}

async function cayCon(id, sau, toiDa, ra) {
  const j = await goi('/rest/api/content/' + id + '/child/page?limit=100');
  for (const c of (j.results || [])) {
    if (ra.length >= toiDa) return;
    ra.push({ id: c.id, tieuDe: c.title, sau: 0 });
  }
  if (sau > 1) for (const c of (j.results || [])) { const con = []; await cayCon(c.id, sau - 1, toiDa, con); const i = ra.findIndex(x => x.id === c.id); ra.splice(i + 1, 0, ...con.map(x => ({ ...x, sau: x.sau + 1 }))); }
}

/* ============ Lệnh ============ */
async function main() {
  try {
    if (lenh === 'toi') {
      const tk = A.layToken('confluence');
      console.log('Địa chỉ: ' + A.base('confluence') + ' · Token: ' + (tk ? 'có (' + tk.nguon + ')' : 'CHƯA CÓ'));
      let ten = '?';
      try { const u = await goi('/rest/api/user/current'); ten = (u.displayName || u.username) + (u.username ? ' (' + u.username + ')' : ''); } catch (e) { if (e.maLoi !== '404') throw e; }
      const sp = await goi('/rest/api/space?limit=25');
      console.log('Đăng nhập bằng: ' + ten);
      console.log('Space đọc được: ' + (sp.size || (sp.results || []).length) + (sp.results && sp.results.length ? ' — ' + sp.results.slice(0, 12).map(s => s.key).join(', ') + (sp.results.length > 12 ? ', …' : '') : ''));
      console.log('OK: token Confluence dùng được (chỉ đọc).');
      return;
    }
    if (lenh === 'space') {
      const sp = await goi('/rest/api/space?limit=100&type=global');
      for (const s of (sp.results || [])) console.log(s.key + '\t' + s.name);
      return;
    }
    if (lenh === 'tim') {
      const tu = String(args[1] || '').trim();
      if (!tu) A.fatal('Thiếu từ khóa. Ví dụ: node confluence.js tim "tạo sản phẩm" --space EPOS', 2);
      const khoa = giaTri('--space', '');
      const q = tu.replace(/"/g, '\\"');
      const cql = 'type = page AND (title ~ "' + q + '" OR text ~ "' + q + '")' + (khoa ? ' AND space = "' + khoa + '"' : '');   // không ORDER BY ⇒ Confluence xếp theo độ liên quan
      const j = await goi('/rest/api/content/search?cql=' + encodeURIComponent(cql) + '&limit=' + (+giaTri('--gioi-han', 15)) + '&expand=space,version');
      if (!(j.results || []).length) { console.log('Không thấy trang nào cho "' + tu + '"' + (khoa ? ' trong space ' + khoa : '') + '. Thử từ khóa khác / bỏ --space.'); return; }
      const goc = (j._links && j._links.base) || A.base('confluence');
      for (const r of j.results) console.log(r.id + '\t' + ((r.space && r.space.key) || '?') + '\tv' + ((r.version && r.version.number) || '?') + '\t' + String((r.version && r.version.when) || '').slice(0, 10) + '\t' + r.title + '\t' + goc + ((r._links && r._links.webui) || ''));
      console.log('\n(' + j.results.length + ' trang. Lấy nội dung: node confluence.js trang <id>)');
      return;
    }
    if (lenh === 'trang') {
      const id = await layId(args[1]);
      // Bản lưu CÙNG phiên bản thì KHÔNG in lại cả trang (tốn token, đọc trùng): chỉ in tóm tắt + mục lục tiêu đề + đường dẫn. --du để in đủ, --lam-moi để tải lại.
      if (!coCo('--khong-luu') && !coCo('--du') && !coCo('--lam-moi')) {
        const ban = timBanLuu(id, giaTri('--ra', null));
        if (ban) {
          const v = await goi('/rest/api/content/' + id + '?expand=version');
          const vMoi = String((v.version && v.version.number) || '');
          if (vMoi && vMoi === ban.phienBan) { inTomTatBanLuu(ban, v.title); return; }
          console.error('[Bản lưu v' + (ban.phienBan || '?') + ' đã cũ — trang hiện là v' + vMoi + ', tải lại]');
        }
      }
      const t = await layTrang(id);
      const luu = !coCo('--khong-luu');
      let dich = null;
      if (luu) {
        dich = thuMucTrang(id, t.j.title, giaTri('--ra', null));
        fs.mkdirSync(dich, { recursive: true });
        fs.writeFileSync(path.join(dich, 'trang.md'), t.mdDay);
        if (coCo('--dinh-kem') && t.kq.anh.size) {
          const kq = await taiDinhKem(id, path.join(dich, 'anh'), t.kq.anh);
          console.error('Đã tải ' + kq.filter(x => x.kb !== undefined).length + '/' + t.kq.anh.size + ' ảnh vào ' + path.join(dich, 'anh'));
        }
      }
      process.stdout.write(t.mdDay.length > 60000 ? t.mdDay.slice(0, 60000) + '\n\n…(cắt bớt ở 60.000 ký tự — đọc đủ ở ' + (dich ? path.join(dich, 'trang.md') : 'tệp lưu') + ')\n' : t.mdDay);
      if (t.kq.anh.size) console.error('\n[Trang có ' + t.kq.anh.size + ' ảnh / tệp: ' + [...t.kq.anh].slice(0, 8).join(', ') + ' — thêm --dinh-kem để tải về cho Claude đọc]');
      if (t.kq.sodo.length) console.error('[Có sơ đồ: ' + t.kq.sodo.join(', ') + ' — nội dung nằm trong hình, độ tin cậy thấp hơn chữ]');
      if (t.kq.chen.length) console.error('[Trang chèn nội dung từ trang khác: ' + t.kq.chen.join(', ') + ' — lấy riêng bằng KEY:Tiêu đề]');
      if (t.kq.jira.size) console.error('[Nhắc mã Jira: ' + [...t.kq.jira].join(', ') + ']');
      if (dich) console.error('[Đã lưu: ' + path.join(dich, 'trang.md') + ']');
      return;
    }
    if (lenh === 'con') {
      const id = await layId(args[1]);
      const goc = await goi('/rest/api/content/' + id);
      const ds = [];
      await cayCon(id, +giaTri('--sau', 3), 200, ds);
      console.log(goc.title + ' (' + id + ')');
      for (const c of ds) console.log('  '.repeat(c.sau + 1) + '- ' + c.tieuDe + ' (' + c.id + ')');
      console.log('\n(' + ds.length + ' trang con)');
      if (coCo('--lay')) {
        let n = 0;
        for (const c of ds.slice(0, 25)) {
          const t = await layTrang(c.id);
          const d = thuMucTrang(c.id, t.j.title, giaTri('--ra', null));
          fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'trang.md'), t.mdDay); n++;
        }
        console.log('Đã lưu nội dung ' + n + ' trang vào ' + (giaTri('--ra', null) || THU_MUC_GOC) + (ds.length > 25 ? ' (giới hạn 25 trang; lấy tiếp từng trang bằng "trang <id>")' : ''));
      }
      return;
    }
    if (lenh === 'dinh-kem') {
      const id = await layId(args[1]);
      const j = await goi('/rest/api/content/' + id + '/child/attachment?limit=200');
      const ds = j.results || [];
      if (!ds.length) { console.log('Trang không có tệp đính kèm.'); return; }
      for (const a of ds) console.log(a.title + '\t' + Math.round(((a.extensions && a.extensions.fileSize) || 0) / 1024) + ' KB\t' + ((a.extensions && a.extensions.mediaType) || ''));
      if (coCo('--tai')) {
        const t = await goi('/rest/api/content/' + id);
        const dich = path.join(thuMucTrang(id, t.title, giaTri('--ra', null)), 'dinh-kem');
        const kq = await taiDinhKem(id, dich, null);
        console.log('\nĐã tải vào ' + dich + ': ' + kq.filter(x => x.kb !== undefined).map(x => x.ten).join(', ') + (kq.some(x => x.bo) ? '\nBỏ qua: ' + kq.filter(x => x.bo).map(x => x.ten + ' (' + x.bo + ')').join(', ') : ''));
      }
      return;
    }
    if (lenh === 'lien-ket') {
      const id = await layId(args[1]);
      const t = await layTrang(id);
      const tho = (t.j.body && t.j.body.storage && t.j.body.storage.value) || '';
      let duAn = ['EPB'];
      try { const c = JSON.parse(fs.readFileSync(path.join(A.KIT, 'config', 'jira.json'), 'utf8')); duAn = [...new Set([].concat(c.maDuAnLienKet || [], c.project || []).filter(Boolean))]; } catch (e) { /* mặc định */ }
      const tatCa = [...new Set([...t.kq.jira, ...(tho.match(/\b[A-Z][A-Z0-9]{1,9}-\d{1,7}\b/g) || [])])];
      const jira = tatCa.filter(k => duAn.includes(k.split('-')[0]));
      const maNv = tatCa.filter(k => !duAn.includes(k.split('-')[0]));
      const nhom = {}; for (const k of maNv) { const h = k.split('-')[0]; (nhom[h] = nhom[h] || []).push(k); }
      console.log(t.j.title);
      console.log('  Mã Jira (' + duAn.join(', ') + '): ' + (jira.join(', ') || '(không có)'));
      const dong = Object.entries(nhom).map(([h, ds]) => h + ' (' + ds.length + '): ' + ds.join(', '));
      console.log('  Mã nghiệp vụ BA đánh sẵn trong tài liệu: ' + (dong.length ? '\n    ' + dong.join('\n    ') : '(không thấy)'));
      if (dong.length) console.log('  → Khi lập bảng quy tắc nghiệp vụ, DÙNG NGUYÊN các mã này (BR-01, US-01…) để truy vết.');
      return;
    }
    console.log('Dùng: node confluence.js <toi | space | tim | trang | con | dinh-kem | lien-ket> …  (xem phần đầu tệp để biết chi tiết)');
    process.exit(lenh ? 2 : 0);
  } catch (e) { baoLoi(e); }
}

if (require.main === module) main();
module.exports = { xhtmlSangMd };
