#!/usr/bin/env node
/* jira-tao.js — TẠO ticket Bug trên Jira từ tệp nháp đã được tester duyệt, đính kèm ảnh bằng chứng, nối issue link, rồi in LINK.
 * Tester mở link và chỉ việc bấm Assign (Reporter là chủ PAT — tức chính người chạy kit).
 *
 *   node jira-tao.js --toi                      kiểm token, tài khoản, quyền tạo issue / đính kèm
 *   node jira-tao.js --meta                     in trường bắt buộc + giá trị cho phép của loại phiếu (để điền config/jira.json)
 *   node jira-tao.js <nháp.md>                  XEM TRƯỚC (dry-run, KHÔNG tạo gì): kiểm trường, tìm trùng, quét bí mật, in bản xem trước
 *   node jira-tao.js <nháp.md> --tao            TẠO THẬT (chỉ chạy sau khi tester đã duyệt nháp; hook sẽ hỏi xác nhận lần nữa)
 *   thêm:  --bo-qua-trung  vẫn tạo dù phát hiện đã có ticket cùng mã lỗi
 *
 * Chốt an toàn: chỉ project / loại phiếu trong config/jira.json · chỉ TẠO MỚI (không sửa / đóng ticket) · mặc định chỉ xem trước ·
 * chống trùng bằng nhãn at-<mã băm> + JQL · quét bí mật (mật khẩu / token) trong mô tả và tệp đính kèm văn bản trước khi gửi ·
 * giới hạn số ticket mỗi giờ · nhật ký ở thư mục chứa nháp. Token xem tools/lib/atlassian.js (không bao giờ in ra).
 *
 * Định dạng nháp: xem mau-bao-cao/07-jira-nhap.md (phần đầu YAML đơn giản giữa hai dòng ---, phần sau là mô tả theo wiki của Jira). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const A = require('../lib/atlassian.js');

const args = process.argv.slice(2);
const coCo = n => args.includes(n);
const TAO = coCo('--tao');
const cau = (() => { try { return JSON.parse(fs.readFileSync(path.join(A.KIT, 'config', 'jira.json'), 'utf8')); } catch (e) { return {}; } })();
const DU_AN = cau.project || 'EPB';
const LOAI = (cau.loaiPhieu && cau.loaiPhieu[0]) || 'Bug';
const NHAN_MD = cau.nhanMacDinh || ['auto-test'];
const GOI = (cau.gioiHanMoiGio || 10);
const NHAT_KY_CHUNG = path.join(A.CFG_DIR, 'jira-tao.log');

const loi = [], canh = [];
const L = m => console.log(m);
const hong = m => loi.push(m);
const luuY = m => canh.push(m);
const baoLoi = e => A.fatal('LỖI: ' + e.message, e.maLoi === 'thieu-token' ? 3 : 4);

/* ---------- đọc nháp ---------- */
function listDe(v) {
  const s = String(v || '').trim().replace(/^\[|\]$/g, '');
  return s ? s.split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
}
function docNhap(f) {
  let t; try { t = fs.readFileSync(f, 'utf8'); } catch (e) { A.fatal('Không đọc được nháp: ' + f, 2); }
  t = t.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) A.fatal('Nháp phải bắt đầu bằng phần đầu giữa hai dòng --- (xem mau-bao-cao/07-jira-nhap.md).', 2);
  const o = {};
  for (const l of m[1].split('\n')) { const k = l.match(/^([\w-]+)\s*:\s*(.*)$/); if (k && !l.trim().startsWith('#')) o[k[1].toLowerCase()] = k[2].replace(/\s+#.*$/, '').trim().replace(/^["'](.*)["']$/, '$1'); }   // bỏ chú thích cuối dòng (  # …)
  return { dau: o, than: m[2].trim() };
}

/* ---------- quét bí mật (mẫu dùng chung ở tools/lib/bi-mat.js) ---------- */
const { quetBiMat } = require('../lib/bi-mat');

/* ---------- khớp giá trị với danh sách cho phép ---------- */
const bo = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
const DONG_NGHIA = { cao: ['high', 'major'], 'trung binh': ['medium', 'normal', 'major'], thap: ['low', 'minor'], 'rat cao': ['highest', 'critical', 'blocker'], 'nghiem trong': ['critical', 'blocker', 'highest'] };
function khop(cho, ds) {
  const x = bo(cho);
  let hit = ds.find(v => bo(v.name || v.value) === x);
  if (!hit && DONG_NGHIA[x]) hit = ds.find(v => DONG_NGHIA[x].includes(bo(v.name || v.value)));
  return hit || null;
}

function chuyenGiaTri(meta, val) {
  const kieu = (meta.schema && meta.schema.type) || 'string';
  const item = meta.schema && meta.schema.items;
  const ds = meta.allowedValues || [];
  const mot = v => { const h = ds.length ? khop(v, ds) : null; if (ds.length && !h) return undefined; return h ? (h.name ? { name: h.name } : { value: h.value }) : (ds.length ? undefined : { value: v }); };
  if (kieu === 'array') { const arr = Array.isArray(val) ? val : listDe(val); if (item === 'string') return arr; return arr.map(v => (ds.length ? mot(v) : (item === 'user' || item === 'version' || item === 'component' ? { name: v } : { value: v }))).filter(Boolean); }
  if (kieu === 'option') return mot(val);
  if (kieu === 'number') return Number(val);
  if (kieu === 'user') return { name: val };
  if (kieu === 'version' || kieu === 'component' || kieu === 'priority') return { name: val };
  return val;
}

/* ---------- chính ---------- */
async function kiemToi() {
  const me = await A.json('jira', 'GET', '/rest/api/2/myself');
  L('Địa chỉ: ' + A.base('jira') + ' · Token: có (' + A.layToken('jira').nguon + ')');
  L('Đăng nhập bằng: ' + me.displayName + ' (' + me.name + ') — ticket kit tạo sẽ có REPORTER là người này.');
  const q = await A.json('jira', 'GET', '/rest/api/2/mypermissions?projectKey=' + DU_AN + '&permissions=CREATE_ISSUES,CREATE_ATTACHMENTS,BROWSE_PROJECTS,MODIFY_REPORTER');
  const p = q.permissions || {};
  const co = k => (p[k] && p[k].havePermission) ? 'có' : 'KHÔNG';
  L('Quyền trong project ' + DU_AN + ': xem ' + co('BROWSE_PROJECTS') + ' · tạo issue ' + co('CREATE_ISSUES') + ' · đính kèm ' + co('CREATE_ATTACHMENTS') + ' · đổi reporter ' + co('MODIFY_REPORTER'));
  if (co('CREATE_ISSUES') !== 'có') { L('X: token này KHÔNG có quyền tạo issue trong ' + DU_AN + ' — nhờ admin Jira cấp, hoặc dùng token khác.'); process.exit(1); }
  L('OK: sẵn sàng tạo ticket (chỉ khi bạn duyệt và chạy với --tao).');
}

async function layMeta() {
  // Jira cũ (≤ 8.x / 9.x đầu): createmeta?expand=... ; Jira mới (9.x muộn / 10): createmeta/{project}/issuetypes[/{id}] — thử cái mới nếu cái cũ 404.
  try {
    const j = await A.json('jira', 'GET', '/rest/api/2/issue/createmeta?projectKeys=' + DU_AN + '&issuetypeNames=' + encodeURIComponent(LOAI) + '&expand=projects.issuetypes.fields');
    const pr = (j.projects || [])[0]; const it = pr && (pr.issuetypes || [])[0];
    if (it) return it.fields || {};
  } catch (e) { if (e.maLoi !== '404') throw new Error('Không đọc được trường của ' + DU_AN + '/' + LOAI + ': ' + e.message); }
  try {
    const ds = await A.json('jira', 'GET', '/rest/api/2/issue/createmeta/' + DU_AN + '/issuetypes?maxResults=100');
    const loaiHit = (ds.issueTypes || ds.values || []).find(x => bo(x.name) === bo(LOAI));
    if (!loaiHit) throw new Error('Không thấy loại phiếu "' + LOAI + '" trong project ' + DU_AN + ' (có: ' + (ds.issueTypes || ds.values || []).map(x => x.name).join(', ') + ').');
    const ra = {};
    for (let start = 0; ; ) {
      const f = await A.json('jira', 'GET', '/rest/api/2/issue/createmeta/' + DU_AN + '/issuetypes/' + loaiHit.id + '?maxResults=100&startAt=' + start);
      const vals = f.fields || f.values || [];
      for (const m of vals) ra[m.fieldId || m.key] = m;
      start += vals.length;
      if (!vals.length || f.isLast !== false && start >= (f.total || start)) break;
      if (start >= (f.total || 0)) break;
    }
    if (Object.keys(ra).length) return ra;
    throw new Error('Jira trả về danh sách trường rỗng.');
  } catch (e) { throw new Error('Không đọc được trường của ' + DU_AN + '/' + LOAI + ': ' + e.message); }
}

function inMeta(f) {
  L('Trường của ' + DU_AN + ' / ' + LOAI + ':');
  for (const [id, m] of Object.entries(f)) {
    const ds = (m.allowedValues || []).map(v => v.name || v.value).slice(0, 12);
    L('  ' + (m.required ? '[BẮT BUỘC] ' : '           ') + id.padEnd(22) + ' ' + m.name + ' (' + ((m.schema && m.schema.type) || '?') + ')' + (ds.length ? ' ∈ ' + ds.join(' | ') : '') + (m.hasDefaultValue ? ' · có mặc định' : ''));
  }
}

async function main() {
  if (coCo('--toi')) return kiemToi();
  if (coCo('--meta')) return inMeta(await layMeta());
  const tep = args.find(a => !a.startsWith('--'));
  if (!tep) { L('Dùng: node jira-tao.js <nháp.md> [--tao]   |   --toi   |   --meta   (xem phần đầu tệp)'); process.exit(2); }
  const fNhap = path.resolve(tep);
  const thuMuc = path.dirname(fNhap);
  const { dau, than } = docNhap(fNhap);

  /* 1. Kiểm nháp */
  const du = (dau.project || DU_AN).toUpperCase();
  const loai = dau.issuetype || LOAI;
  if (du !== DU_AN) hong('Project "' + du + '" không được phép (chỉ ' + DU_AN + ' — sửa config/jira.json nếu cần mở rộng).');
  if (!(cau.loaiPhieu || ['Bug']).some(x => bo(x) === bo(loai))) hong('Loại phiếu "' + loai + '" không được phép (chỉ ' + (cau.loaiPhieu || ['Bug']).join(', ') + ').');
  const tomTat = (dau.summary || '').trim();
  if (!tomTat) hong('Nháp thiếu summary (tiêu đề).'); else if (tomTat.length > 250) hong('summary dài ' + tomTat.length + ' ký tự (tối đa 250).');
  if (!than || than.length < 40) hong('Phần mô tả quá ngắn / trống — cần bước tái hiện, kết quả thực tế, kết quả mong đợi.');
  if (than.length > 30000) hong('Mô tả dài ' + than.length + ' ký tự (tối đa ~30.000).');
  // Còn chỗ trống mẫu chưa điền (vd <Chức năng>, <bước 1>, <ten-chuc-nang>, <dd/mm/yyyy>) ⇒ chặn.
  const choTrong = (s) => (String(s).match(/<[^<>\n]{2,70}>/g) || []).filter(x => /[^\x00-\x7f]/.test(x) || /^<[a-z]+(-[a-z]+)+>$/.test(x) || /^<dd\/mm\/yyyy>$/i.test(x));
  const conTrong = [...choTrong(tomTat), ...choTrong(than), ...choTrong(dau.environment || ''), ...choTrong(dau.components || ''), ...choTrong(dau.labels || ''), ...choTrong(dau['dinh-kem'] || '')];
  if (conTrong.length) hong('Nháp còn chỗ trống mẫu chưa điền: ' + [...new Set(conTrong)].slice(0, 6).join(' ') + (conTrong.length > 6 ? ' …' : ''));
  for (const k of ['kết quả thực tế', 'kết quả mong đợi', 'bước tái hiện']) if (!bo(than).includes(bo(k))) luuY('Mô tả không có mục "' + k + '" — ticket sẽ khó hiểu với dev.');

  const dinhKem = listDe(dau['dinh-kem']);
  const duongTin = [];
  for (const d of dinhKem) {
    const abs = path.resolve(thuMuc, d);
    const tong = path.resolve(thuMuc);
    if (!abs.toLowerCase().startsWith(tong.toLowerCase() + path.sep) && !abs.toLowerCase().startsWith(path.join(A.KIT, 'bao-cao').toLowerCase() + path.sep) && !abs.toLowerCase().startsWith(path.join(A.KIT, 'e2e').toLowerCase() + path.sep)) { hong('Tệp đính kèm nằm ngoài thư mục nháp / bao-cao / e2e: ' + d); continue; }
    if (!fs.existsSync(abs)) { hong('Không thấy tệp đính kèm: ' + d); continue; }
    const kt = fs.statSync(abs).size;
    if (!/\.(png|jpe?g|gif|webp|webm|mp4|json|md|txt|log|pdf|zip|html)$/i.test(abs)) { hong('Loại tệp không được đính kèm: ' + d); continue; }
    if (kt > (cau.dungLuongDinhKemToiDa || 10485760)) { hong('Tệp quá lớn (' + Math.round(kt / 1048576) + ' MB): ' + d); continue; }
    if (/\.(json|md|txt|log|html)$/i.test(abs) && kt < 2 * 1024 * 1024) for (const b of quetBiMat(fs.readFileSync(abs, 'utf8'), path.basename(abs))) hong('Tệp đính kèm nghi chứa bí mật — ' + b);
    duongTin.push(abs);
  }
  if (duongTin.length > (cau.toiDaDinhKem || 10)) hong('Quá nhiều tệp đính kèm (' + duongTin.length + ' > ' + (cau.toiDaDinhKem || 10) + ').');
  for (const b of [...quetBiMat(than, 'mô tả'), ...quetBiMat(tomTat, 'summary'), ...quetBiMat(dau.environment || '', 'environment')]) hong('Nghi chứa bí mật — ' + b);

  /* 2. Hỏi Jira: người chạy, quyền, trường */
  const me = await A.json('jira', 'GET', '/rest/api/2/myself');
  const q = await A.json('jira', 'GET', '/rest/api/2/mypermissions?projectKey=' + DU_AN + '&permissions=CREATE_ISSUES,CREATE_ATTACHMENTS');
  const pq = q.permissions || {};
  if (!(pq.CREATE_ISSUES && pq.CREATE_ISSUES.havePermission)) hong('Token này không có quyền tạo issue trong ' + DU_AN + '.');
  if (duongTin.length && !(pq.CREATE_ATTACHMENTS && pq.CREATE_ATTACHMENTS.havePermission)) hong('Token này không có quyền đính kèm tệp trong ' + DU_AN + '.');
  const meta = await layMeta();

  const fields = { project: { key: DU_AN }, issuetype: { name: loai }, summary: tomTat, description: than };
  const xem = [];
  const dat = (id, giaTri, nhan) => {
    const m = meta[id];
    if (!m) { luuY('Project không có trường "' + id + '" — bỏ qua ' + nhan + '.'); return; }
    const v = chuyenGiaTri(m, giaTri);
    if (v === undefined || (Array.isArray(v) && !v.length)) { hong(nhan + ' "' + (Array.isArray(giaTri) ? giaTri.join(', ') : giaTri) + '" không nằm trong danh sách cho phép: ' + (m.allowedValues || []).map(a => a.name || a.value).slice(0, 15).join(' | ')); return; }
    fields[id] = v; xem.push(nhan + ': ' + (Array.isArray(giaTri) ? giaTri.join(', ') : giaTri));
  };
  if (dau.priority) dat('priority', dau.priority, 'Ưu tiên');
  const idTheoTen = ten => Object.keys(meta).find(k => bo(meta[k].name) === bo(ten));
  if (dau.severity) { const idSev = idTheoTen('Severity'); if (idSev) dat(idSev, dau.severity, 'Severity'); else luuY('Project không có trường Severity — bỏ qua.'); }
  // Trường "Tester" (nếu project có, kiểu danh sách người): mặc định là chính người chạy kit; nháp có thể ghi tester: <tên đăng nhập>.
  const idTester = idTheoTen('Tester');
  if (idTester && meta[idTester].schema && meta[idTester].schema.items === 'user') { const ai = dau.tester || me.name; fields[idTester] = [{ name: ai }]; xem.push('Tester: ' + ai); }
  if (dau.components) {
    // Danh sách component THẬT của project (createmeta không trả giá trị cho phép của trường này). Project không có component ⇒ báo ngay, đừng để Jira từ chối lúc tạo.
    let dsCp = null;
    try { dsCp = await A.json('jira', 'GET', '/rest/api/2/project/' + DU_AN + '/components'); } catch (e) { luuY('Không đọc được danh sách component: ' + e.message); }
    if (dsCp && !dsCp.length) hong('Project ' + DU_AN + ' KHÔNG có component nào — bỏ dòng components: khỏi nháp (hoặc nhờ admin tạo component).');
    else if (dsCp) {
      const ghep = listDe(dau.components).map(c => khop(c, dsCp));
      const thieuC = listDe(dau.components).filter((c, i) => !ghep[i]);
      if (thieuC.length) hong('Component "' + thieuC.join(', ') + '" không tồn tại trong ' + DU_AN + '. Có: ' + dsCp.map(c => c.name).slice(0, 15).join(' | '));
      else { fields.components = ghep.map(c => ({ name: c.name })); xem.push('Component: ' + ghep.map(c => c.name).join(', ')); }
    } else dat('components', listDe(dau.components), 'Component');
  }
  if (dau['affects-version']) dat('versions', listDe(dau['affects-version']), 'Affects Version');
  if (dau.environment) { if (meta.environment) { fields.environment = dau.environment; xem.push('Môi trường: ' + dau.environment); } else luuY('Project không có trường Environment — thêm vào mô tả.'); }
  if (dau.assignee) { fields.assignee = { name: dau.assignee }; xem.push('Assignee: ' + dau.assignee); }
  if (dau.reporter) { fields.reporter = { name: dau.reporter }; luuY('Đặt reporter "' + dau.reporter + '" cần quyền Modify Reporter (nếu không có, Jira sẽ từ chối).'); }

  const maLoi = (dau['ma-loi'] || tomTat).trim();
  const bam = crypto.createHash('sha1').update(bo(maLoi) + '|' + bo(dau.environment || '')).digest('hex').slice(0, 10);
  const nhan = [...new Set([...NHAN_MD, ...listDe(dau.labels), 'at-' + bam])];
  fields.labels = nhan;

  for (const [ten, val] of Object.entries(cau.truongThem || {})) {
    const id = meta[ten] ? ten : Object.keys(meta).find(k => bo(meta[k].name) === bo(ten));
    if (!id) { luuY('config/jira.json → truongThem có "' + ten + '" nhưng project không có trường đó.'); continue; }
    const v = (val && typeof val === 'object' && !Array.isArray(val)) ? val : chuyenGiaTri(meta[id], val);
    if (v === undefined) hong('Giá trị "' + val + '" của trường "' + meta[id].name + '" không nằm trong danh sách cho phép.'); else { fields[id] = v; xem.push(meta[id].name + ': ' + (typeof val === 'object' ? JSON.stringify(val) : val)); }
  }
  for (const [id, m] of Object.entries(meta)) {
    if (!m.required || ['project', 'issuetype', 'summary', 'reporter', 'description', 'attachment'].includes(id)) continue;
    if (fields[id] === undefined && !m.hasDefaultValue) hong('Project BẮT BUỘC trường "' + m.name + '" (' + id + ') mà nháp / config chưa có. Xem: node jira-tao.js --meta rồi điền vào config/jira.json → truongThem (nhờ người phụ trách).');
  }

  /* 3. Tìm trùng */
  let trung = null;
  try {
    const t = await A.json('jira', 'GET', '/rest/api/2/search?jql=' + encodeURIComponent('project = ' + DU_AN + ' AND labels = "at-' + bam + '"') + '&fields=summary,status,assignee&maxResults=3');
    if ((t.issues || []).length) trung = t.issues[0];
  } catch (e) { luuY('Không tìm trùng được: ' + e.message); }
  let gan = [];
  try {
    const tu = tomTat.replace(/\[[^\]]*\]/g, ' ').replace(/["\\]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 7).join(' ');
    if (tu) { const t = await A.json('jira', 'GET', '/rest/api/2/search?jql=' + encodeURIComponent('project = ' + DU_AN + ' AND summary ~ "' + tu + '" ORDER BY created DESC') + '&fields=summary,status&maxResults=4'); gan = (t.issues || []).filter(x => !trung || x.key !== trung.key); }
  } catch (e) { /* bỏ qua */ }

  /* 4. Giới hạn theo giờ */
  let daTaoGioQua = 0;
  try { daTaoGioQua = fs.readFileSync(NHAT_KY_CHUNG, 'utf8').split('\n').filter(l => l && Date.now() - Date.parse(l.split('\t')[0]) < 3600000).length; } catch (e) { /* chưa có */ }
  if (TAO && daTaoGioQua >= GOI) hong('Đã tạo ' + daTaoGioQua + ' ticket trong 1 giờ qua (giới hạn ' + GOI + ') — dừng để tránh tạo rác. Báo người phụ trách.');

  /* 5. Xem trước */
  L('════ ' + (TAO ? 'TẠO THẬT' : 'XEM TRƯỚC (chưa tạo gì)') + ' ════');
  L('Project / loại : ' + DU_AN + ' / ' + loai);
  L('Reporter       : ' + me.displayName + ' (' + me.name + ') — chủ của token, tức người đang chạy kit');
  L('Tiêu đề        : ' + tomTat);
  for (const x of xem) L(x.padEnd(0));
  L('Nhãn           : ' + nhan.join(', '));
  L('Đính kèm       : ' + (duongTin.length ? duongTin.map(f => path.basename(f)).join(', ') : '(không)'));
  const lk = listDe(dau['lien-ket']);
  L('Issue link     : ' + (lk.length ? lk.join(', ') : '(không)'));
  L('Độ dài mô tả   : ' + than.length + ' ký tự');
  if (trung) { L('\n⛔ ĐÃ CÓ ticket cùng mã lỗi: ' + trung.key + ' — ' + ((trung.fields || {}).summary || '') + ' · ' + A.base('jira') + '/browse/' + trung.key); if (!coCo('--bo-qua-trung')) hong('Ticket cùng mã lỗi đã tồn tại (' + trung.key + '). Không tạo thêm. (--bo-qua-trung nếu chắc chắn là lỗi khác.)'); }
  if (gan.length) { L('\n⚠ Có ticket giống (kiểm tra có phải cùng lỗi không):'); for (const g of gan) L('   ' + g.key + ' — ' + ((g.fields || {}).summary || '') + ' [' + (((g.fields || {}).status || {}).name || '?') + ']'); }
  for (const c of canh) L('⚠ ' + c);
  if (loi.length) { L('\n✖ KHÔNG THỂ TẠO:'); for (const x of loi) L('   - ' + x); process.exit(1); }
  if (!TAO) { L('\n✔ Nháp hợp lệ, chưa tạo gì. Tester duyệt nháp rồi chạy lại với --tao để tạo thật.'); return; }

  /* 6. Tạo thật */
  const r = await A.json('jira', 'POST', '/rest/api/2/issue', { json: { fields } });
  const key = r.key;
  const link = A.base('jira') + '/browse/' + key;
  const ketQua = { key, dinhKem: [], lienKet: [], loiPhu: [] };
  for (const f of duongTin) {
    try {
      const mp = A.multipart('file', path.basename(f), fs.readFileSync(f), A.mimeCua(f));
      await A.json('jira', 'POST', '/rest/api/2/issue/' + key + '/attachments', { body: mp.body, headers: Object.assign({ 'X-Atlassian-Token': 'no-check' }, mp.headers), timeout: 90000 });
      ketQua.dinhKem.push(path.basename(f));
    } catch (e) { ketQua.loiPhu.push('đính kèm ' + path.basename(f) + ': ' + e.message); }
  }
  for (const x of lk) {
    const mm = x.match(/^(?:([\w ]+):)?\s*([A-Z][A-Z0-9]+-\d+)$/i);
    if (!mm) { ketQua.loiPhu.push('issue link "' + x + '" sai dạng (KEY hoặc loại:KEY)'); continue; }
    try {
      await A.json('jira', 'POST', '/rest/api/2/issueLink', { json: { type: { name: (mm[1] || 'Relates').trim() }, inwardIssue: { key }, outwardIssue: { key: mm[2].toUpperCase() } } });
      ketQua.lienKet.push(mm[2].toUpperCase());
    } catch (e) { ketQua.loiPhu.push('issue link ' + mm[2] + ': ' + e.message); }
  }
  try {
    fs.mkdirSync(A.CFG_DIR, { recursive: true });
    fs.appendFileSync(NHAT_KY_CHUNG, new Date().toISOString() + '\t' + key + '\t' + me.name + '\n');
    fs.appendFileSync(path.join(thuMuc, 'jira-nhat-ky.md'), '- ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · **' + key + '** · ' + tomTat + ' · người tạo (reporter): ' + me.displayName + ' · đính kèm: ' + (ketQua.dinhKem.join(', ') || '—') + ' · ' + link + '\n');
  } catch (e) { /* không ghi được nhật ký thì thôi */ }

  L('\n✔ ĐÃ TẠO: ' + key);
  L('LINK: ' + link);
  L('Đính kèm: ' + (ketQua.dinhKem.join(', ') || '(không)') + ' · Issue link: ' + (ketQua.lienKet.join(', ') || '(không)'));
  if (ketQua.loiPhu.length) { L('⚠ Một số bước phụ chưa xong:'); for (const x of ketQua.loiPhu) L('   - ' + x); }
  L('\nVIỆC CỦA TESTER: mở link trên → bấm **Assign** (giao người xử lý) và kiểm Reporter. Gửi mã ' + key + ' để ghi vào báo cáo.');
}

main().catch(baoLoi);
