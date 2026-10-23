#!/usr/bin/env node
/* bb.js — ĐỌC code trên Bitbucket KHÔNG cần tải repo về máy: PR (thông tin, tệp đổi, diff), so hai nhánh, đọc một tệp / thư mục ở
 * nhánh bất kỳ, commit mới nhất, tìm PR theo mã Jira trên mọi repo. CHỈ GỬI GET — không sửa, không comment, không duyệt gì.
 * Tài khoản (không bao giờ in ra): biến EP_GIT_USER / EP_GIT_TOKEN → ~/.easypos-tester/git.properties (git.user=, git.token= — HTTP access
 * token Bitbucket của chính bạn, chỉ cần quyền đọc) → không có thì dùng tài khoản Bitbucket máy đã đăng nhập cho git (git credential fill —
 * KHÔNG bật hộp hỏi; chưa đăng nhập thì báo, clone / fetch một lần là có).
 *
 *   node bb.js repo [chữ]                         repo trong project (mặc định EPOS), lọc theo chữ
 *   node bb.js nhanh <repo> [chữ]                 nhánh của repo (lọc), kèm commit mới nhất
 *   node bb.js pr <repo> [chữ]                    PR mới nhất (mọi trạng thái), lọc theo chữ (mã Jira, tiêu đề, nhánh)
 *   node bb.js pr <repo> <số> [--du] [--ra tệp]   chi tiết PR: nguồn → đích, trạng thái, người duyệt, commit, tệp đổi, DIFF
 *   node bb.js jira <MÃ-JIRA>                     tìm PR nhắc mã Jira trên MỌI repo của project
 *   node bb.js so-sanh <repo> <từ> <đến> [--diff] [--du]   commit có ở <từ> mà <đến> chưa có + tệp khác nhau (+ diff)
 *   node bb.js tep <repo> <đường-dẫn> [nhánh]      nội dung một tệp ở nhánh (mặc định nhánh mặc định của repo)
 *   node bb.js ls <repo> [thư-mục] [nhánh]          liệt kê thư mục
 *   node bb.js commit <repo> [nhánh] [số]           commit mới nhất của nhánh
 * <repo>: tên repo trong project EPOS (vd easyposbackend, easypos-frontend, easypos-gateway-cloud) hoặc DỰ-ÁN/repo. <nhánh>: tên nhánh, refs/…, hoặc mã commit.
 * Diff dài cắt ở 4000 dòng — thêm --du để in đủ, --ra <tệp> để ghi ra tệp. */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const BASE = (process.env.EP_BB_URL || 'https://git-sds.softdreams.vn:7990').replace(/\/+$/, '');
const DU_AN = 'EPOS';

function taiKhoan() {
  let user = process.env.EP_GIT_USER || '', token = process.env.EP_GIT_TOKEN || '';
  if (!user || !token) {
    try {
      const p = {};
      for (const l of fs.readFileSync(path.join(require('os').homedir(), '.easypos-tester', 'git.properties'), 'utf8').split(/\r?\n/)) {
        const m = l.match(/^\s*([\w.-]+)\s*[=:]\s*(.*?)\s*$/);
        if (m && !l.trim().startsWith('#')) p[m[1]] = m[2];
      }
      user = user || p['git.user'] || ''; token = token || p['git.token'] || '';
    } catch (e) { /* chưa có tệp */ }
  }
  if (user && token) return { user, token, nguon: 'rieng' };
  // Không có token riêng: dùng tài khoản Bitbucket của chính máy này (Git Credential Manager), không bao giờ hỏi.
  try {
    const u = new URL(BASE);
    const r = require('child_process').spawnSync('git', ['credential', 'fill'], {
      input: 'protocol=' + u.protocol.replace(':', '') + '\nhost=' + u.host + '\n\n', encoding: 'utf8', timeout: 20000,
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '' }),
    });
    const kv = {}; for (const l of String(r.stdout || '').split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) kv[l.slice(0, i)] = l.slice(i + 1); }
    if (r.status === 0 && kv.username && kv.password) return { user: kv.username, token: kv.password, nguon: 'may' };
  } catch (e) { /* không có git / không có tài khoản lưu sẵn */ }
  return null;
}
const TK = taiKhoan();
function die(s, code) { console.error(s); process.exit(code || 1); }
if (!TK) die('Chua co tai khoan Bitbucket: ghi git.user= / git.token= (HTTP access token chi doc cua ban) vao ~/.easypos-tester/git.properties,\n'
  + 'hoac clone / fetch mot repo tren git-sds.softdreams.vn mot lan (dang nhap Bitbucket) roi chay lai.', 3);
// Token truy cập HTTP của Bitbucket (BBDC-…): Bearer; mật khẩu thường: Basic (đường /raw REST nhận cả hai).
const AUTH = /^BBDC-/.test(TK.token) ? 'Bearer ' + TK.token : 'Basic ' + Buffer.from(TK.user + ':' + TK.token).toString('base64');

function get(p, accept) {
  return new Promise((res, rej) => {
    const rq = https.get(BASE + p, {
      headers: { Authorization: AUTH, Accept: accept || 'application/json' },
      rejectUnauthorized: false, timeout: 60000,
    }, r => {
      let d = ''; r.setEncoding('utf8'); r.on('data', c => { d += c; }); r.on('end', () => res({ s: r.statusCode, d }));
    });
    rq.on('timeout', () => rq.destroy(new Error('qua 60 giay khong tra loi')));
    rq.on('error', rej);
  });
}
function loiHttp(r, gi) {
  let msg = ''; try { msg = (JSON.parse(r.d).errors || []).map(e => e.message).join('; '); } catch (e) { msg = String(r.d).slice(0, 200); }
  if (r.s === 401 || r.s === 403) die((TK.nguon === 'rieng' ? 'Token Bitbucket rieng (git.properties)' : 'Tai khoan Bitbucket cua may (' + TK.user + ')') + ' KHONG co quyen doc ' + gi + ' (HTTP ' + r.s + ') - bao admin cap quyen doc.', 4);
  if (r.s === 404) die('Khong thay ' + gi + ' (HTTP 404): ' + msg + '\nXem ten repo: node bb.js repo · ten nhanh: node bb.js nhanh <repo>', 5);
  die('Loi Bitbucket ' + r.s + ' khi doc ' + gi + ': ' + msg, 6);
}
async function json(p, gi) { const r = await get(p); if (r.s !== 200) loiHttp(r, gi); return JSON.parse(r.d); }
async function tatCa(p, gi, toiDa) {
  const ra = []; let start = 0;
  for (;;) {
    const j = await json(p + (p.includes('?') ? '&' : '?') + 'limit=100&start=' + start, gi);
    ra.push(...(j.values || []));
    if (j.isLastPage || ra.length >= (toiDa || 1000) || j.nextPageStart == null) break;
    start = j.nextPageStart;
  }
  return ra.slice(0, toiDa || 1000);
}

function repoPath(arg) {
  if (!arg) die('Thieu ten repo. Xem: node bb.js repo');
  const [a, b] = arg.includes('/') ? arg.split('/') : [DU_AN, arg];
  if (!/^[A-Za-z0-9_~-]+$/.test(a) || !/^[A-Za-z0-9_.-]+$/.test(b)) die('Ten repo khong hop le: ' + arg);
  return { key: a.toUpperCase(), slug: b.toLowerCase(), rest: '/rest/api/1.0/projects/' + a.toUpperCase() + '/repos/' + b.toLowerCase(), web: BASE + '/projects/' + a.toUpperCase() + '/repos/' + b.toLowerCase() };
}
function refOf(x) {
  if (!x) return null;
  if (!/^[A-Za-z0-9._\/-]+$/.test(x) || x.includes('..')) die('Ten nhanh / commit khong hop le: ' + x);
  if (/^refs\//.test(x) || /^[0-9a-f]{7,40}$/i.test(x)) return x;
  return 'refs/heads/' + x;
}
// Nhánh mặc định khi lệnh không truyền nhánh: biến EP_BB_NHANH > config/moi-truong.json → nhanhCode.dev (nhánh đang deploy lên DEV).
// Không có cấu hình thì để Bitbucket dùng nhánh mặc định của repo.
function nhanhMacDinh() {
  if (process.env.EP_BB_NHANH) return refOf(process.env.EP_BB_NHANH);
  try {
    const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'moi-truong.json'), 'utf8'));
    return (c.nhanhCode && c.nhanhCode.dev) ? refOf(c.nhanhCode.dev) : null;
  } catch (e) { return null; }
}
const ngay = ms => ms ? new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 16) : '';
const ten = u => (u && (u.user ? (u.user.displayName || u.user.name) : (u.displayName || u.name))) || '?';

/* Diff JSON của Bitbucket → dạng unified quen thuộc. */
function diffText(j) {
  const out = [];
  for (const f of j.diffs || []) {
    const a = f.source ? f.source.toString : '/dev/null', b = f.destination ? f.destination.toString : '/dev/null';
    out.push('diff --git a/' + (f.source ? a : b) + ' b/' + (f.destination ? b : a), '--- ' + (f.source ? 'a/' + a : a), '+++ ' + (f.destination ? 'b/' + b : b));
    if (f.binary) { out.push('(tep nhi phan)'); continue; }
    for (const h of f.hunks || []) {
      out.push('@@ -' + h.sourceLine + ',' + h.sourceSpan + ' +' + h.destinationLine + ',' + h.destinationSpan + ' @@' + (h.context ? ' ' + h.context : ''));
      for (const s of h.segments || []) {
        const dau = s.type === 'ADDED' ? '+' : s.type === 'REMOVED' ? '-' : ' ';
        for (const l of s.lines || []) out.push(dau + l.line);
      }
    }
    if (f.truncated) out.push('(Bitbucket cat bot diff cua tep nay - xem tren web)');
  }
  if (j.truncated) out.push('(Bitbucket cat bot diff - qua nhieu tep / dong; xem tren web)');
  return out;
}
function inDiff(dong, co) {
  const DU = co.du, RA = co.ra;
  if (RA) { fs.writeFileSync(RA, dong.join('\n') + '\n'); console.log('Da ghi diff (' + dong.length + ' dong) ra ' + RA); return; }
  const n = DU ? dong.length : Math.min(dong.length, 4000);
  console.log(dong.slice(0, n).join('\n'));
  if (n < dong.length) console.log('\n... con ' + (dong.length - n) + ' dong nua - them --du de in du, hoac --ra <tep> de ghi ra tep.');
}

/* In nội dung một tệp có chọn lọc để khỏi đọc cả tệp lớn: --dong a-b, --tim <regex>; không chọn thì in tối đa 400 dòng (thêm --du để in đủ). */
const TOI_DA_DONG_TEP = 400;
function inTep(noi, co) {
  const d = noi.split('\n'); if (d.length && d[d.length - 1] === '') d.pop();
  const so = i => String(i + 1).padStart(5) + '  ';
  if (co.dong) {
    const m = String(co.dong).match(/^(\d+)(?:-(\d+))?$/);
    if (!m) die('--dong phai la "a-b" hoac "a" (vd 120-180)');
    const a = Math.max(1, +m[1]), b = Math.min(d.length, +(m[2] || m[1]));
    console.log(d.slice(a - 1, b).map((l, i) => so(a - 1 + i) + l).join('\n'));
    console.error('# dong ' + a + '-' + b + ' / ' + d.length);
    return;
  }
  if (co.tim) {
    let re; try { re = new RegExp(co.tim, 'i'); } catch (e) { die('--tim: bieu thuc khong hop le: ' + e.message); }
    const hit = []; d.forEach((l, i) => { if (re.test(l)) hit.push(i); });
    const ra = new Set(); for (const i of hit.slice(0, 40)) for (let k = Math.max(0, i - 2); k <= Math.min(d.length - 1, i + 2); k++) ra.add(k);
    let truoc = -2;
    for (const i of [...ra].sort((x, y) => x - y)) { if (i > truoc + 1) console.log('  ...'); console.log(so(i) + d[i]); truoc = i; }
    console.error('# ' + hit.length + ' cho khop "' + co.tim + '" / ' + d.length + ' dong' + (hit.length > 40 ? ' (chi in 40 cho dau)' : ''));
    return;
  }
  if (!co.du && d.length > TOI_DA_DONG_TEP) {
    console.log(d.slice(0, TOI_DA_DONG_TEP).join('\n'));
    console.error('# Tep co ' + d.length + ' dong, moi in ' + TOI_DA_DONG_TEP + ' dong dau. Doc doan khac: --dong a-b · tim noi dung: --tim <regex> · in du: --du');
    return;
  }
  console.log(d.join('\n'));
}

async function main() {
  const args = process.argv.slice(2);
  const co = { du: args.includes('--du'), diff: args.includes('--diff'), ra: null };
  const iRa = args.indexOf('--ra'); if (iRa >= 0) { co.ra = args[iRa + 1]; args.splice(iRa, 2); }
  // Chỉ in phần cần (tiết kiệm token): --dong 120-180 (số dòng, tính từ 1) · --tim <regex> (dòng khớp ± 2 dòng quanh, tối đa 40 chỗ).
  for (const k of ['dong', 'tim']) { const i = args.indexOf('--' + k); if (i >= 0) { co[k] = args[i + 1]; args.splice(i, 2); } }
  const a = args.filter(x => !/^--(du|diff)$/.test(x));
  const lenh = a[0];

  if (lenh === 'repo') {
    const ds = await tatCa('/rest/api/1.0/projects/' + DU_AN + '/repos', 'danh sach repo ' + DU_AN);
    const loc = (a[1] || '').toLowerCase();
    for (const r of ds.filter(r => !loc || r.slug.includes(loc) || r.name.toLowerCase().includes(loc))) console.log(r.slug + (r.name !== r.slug ? '  (' + r.name + ')' : ''));
    return;
  }
  if (lenh === 'nhanh') {
    const R = repoPath(a[1]);
    const ds = await tatCa(R.rest + '/branches?details=true&orderBy=MODIFICATION' + (a[2] ? '&filterText=' + encodeURIComponent(a[2]) : ''), 'nhanh cua ' + R.slug, 300);
    for (const b of ds) {
      const m = b.metadata && b.metadata['com.atlassian.bitbucket.server.bitbucket-branch:latest-commit-metadata'];
      console.log(b.displayId + (b.isDefault ? '  [mac dinh]' : '') + '  ' + b.latestCommit.slice(0, 11) + (m ? '  ' + ngay(m.authorTimestamp) + '  ' + String(m.message || '').split('\n')[0].slice(0, 70) : ''));
    }
    console.log('(' + ds.length + ' nhanh, moi nhat truoc)');
    return;
  }
  if (lenh === 'pr' && a[2] && /^\d+$/.test(a[2])) {
    const R = repoPath(a[1]); const id = a[2];
    const p = await json(R.rest + '/pull-requests/' + id, 'PR #' + id + ' cua ' + R.slug);
    console.log('# PR #' + p.id + ' — ' + p.title);
    console.log('Repo: ' + R.slug + ' · ' + p.fromRef.displayId + ' → ' + p.toRef.displayId + ' · trang thai: ' + p.state + (p.state === 'MERGED' ? ' (' + ngay(p.closedDate) + ')' : ''));
    console.log('Tac gia: ' + ten(p.author) + ' · tao ' + ngay(p.createdDate) + ' · sua ' + ngay(p.updatedDate));
    console.log('Nguoi duyet: ' + ((p.reviewers || []).map(r => ten(r) + ' (' + r.status + ')').join(', ') || 'chua co'));
    console.log('Web: ' + R.web + '/pull-requests/' + p.id);
    if (p.description) console.log('\n## Mo ta\n' + p.description);
    const cm = await tatCa(R.rest + '/pull-requests/' + id + '/commits', 'commit cua PR', 200);
    console.log('\n## Commit (' + cm.length + ')');
    for (const c of cm) console.log('- ' + c.displayId + ' ' + ngay(c.authorTimestamp) + ' ' + (c.author && c.author.name) + ': ' + c.message.split('\n')[0]);
    const ch = await tatCa(R.rest + '/pull-requests/' + id + '/changes', 'tep doi cua PR', 2000);
    console.log('\n## Tep doi (' + ch.length + ')');
    for (const c of ch) console.log('- ' + c.type + ' ' + c.path.toString + (c.srcPath && c.srcPath.toString !== c.path.toString ? ' (tu ' + c.srcPath.toString + ')' : ''));
    const d = await json(R.rest + '/pull-requests/' + id + '/diff?contextLines=5&whitespace=ignore-all', 'diff cua PR');
    console.log('\n## Diff');
    inDiff(diffText(d), co);
    return;
  }
  if (lenh === 'pr') {
    const R = repoPath(a[1]);
    const ds = await tatCa(R.rest + '/pull-requests?state=ALL&order=NEWEST' + (a[2] ? '&filterText=' + encodeURIComponent(a[2]) : ''), 'PR cua ' + R.slug, 30);
    for (const p of ds) console.log('#' + p.id + '  ' + p.state.padEnd(8) + ' ' + ngay(p.updatedDate) + '  ' + p.fromRef.displayId + ' → ' + p.toRef.displayId + '  ' + ten(p.author) + ': ' + p.title);
    if (!ds.length) console.log('Khong co PR nao' + (a[2] ? ' khop "' + a[2] + '"' : ''));
    return;
  }
  if (lenh === 'jira') {
    const ma = (a[1] || '').toUpperCase();
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(ma)) die('Ma Jira khong hop le: ' + a[1]);
    const repos = await tatCa('/rest/api/1.0/projects/' + DU_AN + '/repos', 'danh sach repo ' + DU_AN);
    let n = 0;
    for (const r of repos) {
      const res = await get('/rest/api/1.0/projects/' + DU_AN + '/repos/' + r.slug + '/pull-requests?state=ALL&order=NEWEST&limit=50&filterText=' + encodeURIComponent(ma));
      if (res.s !== 200) { console.log('  (bo qua ' + r.slug + ': HTTP ' + res.s + ')'); continue; }
      for (const p of JSON.parse(res.d).values || []) {
        if (!new RegExp('\\b' + ma + '\\b', 'i').test(p.title + ' ' + (p.description || '') + ' ' + p.fromRef.displayId)) continue;
        n++; console.log(r.slug + ' #' + p.id + '  ' + p.state.padEnd(8) + ' ' + ngay(p.updatedDate) + '  ' + p.fromRef.displayId + ' → ' + p.toRef.displayId + '  ' + p.title);
      }
    }
    console.log('(' + n + ' PR nhac ' + ma + ' tren ' + repos.length + ' repo ' + DU_AN + ') — xem chi tiet: node bb.js pr <repo> <so>');
    return;
  }
  if (lenh === 'so-sanh') {
    const R = repoPath(a[1]); const tu = refOf(a[2]), den = refOf(a[3]);
    if (!tu || !den) die('Cach dung: node bb.js so-sanh <repo> <tu-nhanh> <den-nhanh>  (commit co o <tu> ma <den> chua co)');
    const q = '?from=' + encodeURIComponent(tu) + '&to=' + encodeURIComponent(den);
    const cm = await tatCa(R.rest + '/compare/commits' + q, 'so sanh ' + a[2] + ' / ' + a[3], 300);
    console.log('# ' + R.slug + ': ' + a[2] + ' co ' + cm.length + (cm.length >= 300 ? '+' : '') + ' commit ma ' + a[3] + ' chua co');
    for (const c of cm.slice(0, 100)) console.log('- ' + c.displayId + ' ' + ngay(c.authorTimestamp) + ' ' + (c.author && c.author.name) + ': ' + c.message.split('\n')[0]);
    const ch = await tatCa(R.rest + '/compare/changes' + q, 'tep khac nhau', 3000);
    console.log('\n## Tep khac nhau (' + ch.length + ')');
    for (const c of ch) console.log('- ' + c.type + ' ' + c.path.toString);
    if (co.diff) { const d = await json(R.rest + '/compare/diff' + q + '&contextLines=5&whitespace=ignore-all', 'diff'); console.log('\n## Diff'); inDiff(diffText(d), co); }
    return;
  }
  if (lenh === 'tep') {
    const R = repoPath(a[1]); const f = a[2]; const at = refOf(a[3]) || nhanhMacDinh();
    if (!f || f.includes('..')) die('Cach dung: node bb.js tep <repo> <duong-dan> [nhanh]');
    if (!a[3] && at) console.error('# nhanh: ' + at.replace(/^refs\/heads\//, '') + ' (nhanh DEV mac dinh)');
    // Đường REST /raw (đường web /projects/…/raw chuyển hướng sang trang đăng nhập với token).
    const r = await get(R.rest + '/raw/' + f.split('/').map(encodeURIComponent).join('/') + (at ? '?at=' + encodeURIComponent(at) : ''), '*/*');
    if (r.s !== 200) loiHttp(r, f + ' (' + (a[3] || 'nhanh mac dinh') + ')');
    inTep(r.d, co);
    return;
  }
  if (lenh === 'ls') {
    const R = repoPath(a[1]); const dir = (a[2] || '').replace(/^\/+|\/+$/g, ''); const at = refOf(a[3]) || nhanhMacDinh();
    if (!a[3] && at) console.error('# nhanh: ' + at.replace(/^refs\/heads\//, '') + ' (nhanh DEV mac dinh)');
    if (dir.includes('..')) die('Duong dan khong hop le');
    const j = await json(R.rest + '/browse/' + dir.split('/').filter(Boolean).map(encodeURIComponent).join('/') + '?limit=1000' + (at ? '&at=' + encodeURIComponent(at) : ''), 'thu muc ' + (dir || '/'));
    for (const c of (j.children && j.children.values) || []) console.log((c.type === 'DIRECTORY' ? c.path.toString + '/' : c.path.toString));
    return;
  }
  if (lenh === 'commit') {
    const R = repoPath(a[1]); const at = refOf(a[2]) || nhanhMacDinh(); const n = Math.min(parseInt(a[3] || '20', 10) || 20, 200);
    const ds = await tatCa(R.rest + '/commits' + (at ? '?until=' + encodeURIComponent(at) : ''), 'commit', n);
    for (const c of ds) console.log(c.displayId + ' ' + ngay(c.authorTimestamp) + ' ' + (c.author && c.author.name) + ': ' + c.message.split('\n')[0]);
    return;
  }
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 19).map(l => l.replace(/^ ?\* ?/, '').replace(/^\/\* ?/, '')).join('\n'));
  process.exit(lenh ? 2 : 0);
}
main().catch(e => die('Loi: ' + e.message, 6));
