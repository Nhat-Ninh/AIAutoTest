/* Phần dùng chung của kho bài học: đọc / phân tích / kiểm định bài. Dùng ở bai-hoc.js (tester), dong-bo.js (gửi bài) và tools/ci/nhan-bai-hoc.js
 * (máy chủ nhận bài). Một nơi kiểm định ⇒ tester và máy chủ cùng một luật; không ai "lách" được bằng cách đi đường khác. */
'use strict';
const fs = require('fs');
const path = require('path');
const { quetBiMat } = require('./bi-mat');

const TEP_NHOM = { 'ky-thuat': 'bay-ky-thuat.md', 'moi-truong': 'moi-truong.md', loi: 'loi-da-biet.md' };   // tệp gộp của người phụ trách (bài cũ)
const TRANG_THAI = ['da-xac-nhan', 'nghi-ngo', 'het-han'];
const NHOM_HOP_LE = ['ky-thuat', 'moi-truong', 'loi', 'nghiep-vu'];
const TOI_DA_DONG_NOI_DUNG = 12;       // bài dài quá thì tra ra tốn token: ép ngắn
const TOI_DA_KY_TU = 1200;
const RE_ID_MOI = /^BH-\d{8}-[0-9a-f]{4,8}$/;           // mã bài do công cụ cấp: ngày + 8 ký tự ngẫu nhiên (cũ: 4) ⇒ hai máy cùng thêm bài gần như không bao giờ đụng mã; nếu đụng, gui đổi mã mới
const RE_TEN_TEP_BAI = /^BH-\d{8}-[0-9a-f]{4,8}\.md$/;

const bo = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const uocTok = s => Math.ceil(String(s).length / 3);          // ước lượng thô: tiếng Việt ~3 ký tự / token

/** Mã bài mới: BH-YYYYMMDD-xxxxxxxx (8 ký tự hex ngẫu nhiên, thử lại nếu trùng với `daCo`). */
function taoId(daCo, ngay) {
  const d = (ngay || new Date()).toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 50; i++) {
    const id = 'BH-' + d + '-' + require('crypto').randomBytes(4).toString('hex');
    if (!daCo || !daCo.has(id)) return id;
  }
  throw new Error('Không cấp được mã bài (trùng liên tục)');
}

/** Tách một tệp thành các bài. meta: { nhom, chucNang, tep, nguon }. */
function phanTich(noiDung, meta) {
  const bai = [];
  const dong = String(noiDung).split(/\r?\n/);
  let cur = null;
  const dongBai = () => { if (cur) { bai.push(cur); cur = null; } };
  dong.forEach((l, i) => {
    const h = l.match(/^##\s+(BH-[\w-]+|MỚI)\s*\|\s*(.*?)\s*$/);
    if (h) {
      dongBai();
      const phan = h[2].split('|').map(s => s.trim());
      const tagsPhan = phan.find(p => /^tags\s*:/i.test(p));
      const nhomPhan = phan.find(p => /^nhom\s*:/i.test(p));
      const cnPhan = phan.find(p => /^chuc-nang\s*:/i.test(p));
      const tieuDe = phan.filter(p => p !== tagsPhan && p !== nhomPhan && p !== cnPhan).join(' | ');
      cur = {
        id: h[1], tieuDe, tags: tagsPhan ? tagsPhan.replace(/^tags\s*:\s*/i, '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [],
        nhom: nhomPhan ? nhomPhan.replace(/^nhom\s*:\s*/i, '').trim() : meta.nhom,
        chucNang: cnPhan ? cnPhan.replace(/^chuc-nang\s*:\s*/i, '').trim() : meta.chucNang,
        truong: {}, dong: [], tep: meta.tep, nguon: meta.nguon || 'kho', dongBatDau: i + 1,
      };
      return;
    }
    if (!cur) return;
    cur.dong.push(l);
    const f = l.match(/^-\s+(Nội dung|Bằng chứng|Xác nhận|Trạng thái|Áp dụng)\s*:\s*(.*)$/);
    if (f) cur.truong[f[1]] = f[2].trim();
    else if (/^\s+\S/.test(l) && cur.lastField) cur.truong[cur.lastField] += ' ' + l.trim();
    cur.lastField = f ? f[1] : (/^\s+\S/.test(l) ? cur.lastField : null);
  });
  dongBai();
  return bai;
}

/** Kiểm một bài: trả mảng lỗi (rỗng = đạt). viTri: chuỗi định vị cho thông báo. */
function kiemBai(b, viTri) {
  const e = [];
  if (!b.tieuDe || b.tieuDe.length < 5) e.push('thiếu tiêu đề');
  if (b.tieuDe.length > 110) e.push('tiêu đề dài quá 110 ký tự');
  if (!b.tags.length) e.push('thiếu tags');
  for (const k of ['Nội dung', 'Bằng chứng', 'Xác nhận', 'Trạng thái']) if (!b.truong[k]) e.push('thiếu "- ' + k + ':"');
  if (b.truong['Trạng thái'] && !TRANG_THAI.includes(b.truong['Trạng thái'])) e.push('Trạng thái phải là: ' + TRANG_THAI.join(' | '));
  const xn = b.truong['Xác nhận'] || '';
  if (xn && !/^\d{4}-\d{2}-\d{2}\b/.test(xn)) e.push('"Xác nhận" phải bắt đầu bằng ngày YYYY-MM-DD (vd 2026-10-22 · dev · dev@4a85a58)');
  if (b.truong['Bằng chứng'] && b.truong['Bằng chứng'].length < 8) e.push('"Bằng chứng" quá ngắn — ghi báo cáo / ticket / commit / tệp:dòng');
  if (b.dong.filter(l => l.trim()).length > TOI_DA_DONG_NOI_DUNG || b.dong.join('\n').length > TOI_DA_KY_TU) e.push('bài quá dài (> ' + TOI_DA_DONG_NOI_DUNG + ' dòng / ' + TOI_DA_KY_TU + ' ký tự) — rút gọn hoặc tách bài (tốn token mỗi lần tra)');
  if (!NHOM_HOP_LE.includes(b.nhom)) e.push('nhóm không hợp lệ: ' + b.nhom);
  if (b.nhom === 'nghiep-vu' && !b.chucNang) e.push('bài nghiệp vụ phải có "chuc-nang:" (hoặc nằm trong kien-thuc/nghiep-vu/<chuc-nang>.md)');
  for (const x of quetBiMat(b.dong.join('\n') + '\n' + b.tieuDe, b.id)) e.push('NGHI BÍ MẬT — ' + x);
  return e.map(x => (viTri ? viTri + ': ' : '') + x);
}

/* Nội dung KHÔNG được xuất hiện trong bài học mới (kho tự gộp bài của tester vào main và Claude đọc bài khi tra ⇒ không để bài thành đường chèn chỉ thị / lệnh):
 * tham chiếu tới cơ chế an toàn của kit, lệnh mạng / xoá, địa chỉ ngoài hệ thống nội bộ, kiểu "bỏ qua mọi luật", tệp mật khẩu. Bài kỹ thuật thật không cần những thứ này. */
const MAU_CAM = [
  [/EP_(BO_QUA|CHO_PHEP|PROD)\w*/i, 'biến tắt cổng an toàn (EP_BO_QUA… / EP_CHO_PHEP… / EP_PROD…)'],
  [/dong-bo\.js|jira-tao\.js|guard-easypos|session-rules|nhan-bai-hoc|\.github[\\/]/i, 'tên công cụ / hook an toàn của kit'],
  [/--chap-nhan|--vao-kho|(^|\s)--tao(\s|$)/i, 'cờ ghi đè / ghi vào kho / tạo ticket thật'],
  [/\b(curl|wget|Invoke-WebRequest|Invoke-Expression|iex|Remove-Item|powershell|eval)\b|cmd\s*\/c|rm\s+-rf/i, 'lệnh mạng / thực thi / xoá'],
  [/(bỏ qua|phớt lờ|quên|ignore|disregard)\s+(mọi|tất cả|các|all|previous|prior|the)\b[^\n]{0,40}(luật|quy tắc|hướng dẫn|chỉ thị|rules|instructions)/i, 'câu kiểu "bỏ qua mọi luật"'],
  [/tai-khoan(\.json)?|\.properties\b|\.env\b|id_token|bearer/i, 'tệp / khoá mật khẩu'],
  [/https?:\/\/(?!(jira-sds|confluence-sds|git-sds)\.softdreams\.vn|10\.100\.|localhost|127\.0\.0\.1)/i, 'địa chỉ ngoài hệ thống nội bộ'],
];

/** Kiểm CẢ TỆP bài mới (một bài mỗi tệp) trước khi gửi / nhận: không có chữ trước tiêu đề, thẻ & chức năng chỉ gồm a-z0-9-, quét bí mật toàn tệp (đã chuẩn hoá NFC),
 *  và không chứa mẫu cấm. Trả mảng lỗi (rỗng = đạt). */
function kiemTep(noiDung, viTri) {
  const e = [];
  const nd = String(noiDung).normalize('NFC');
  const dong = nd.split(/\r?\n/);
  const dauTien = dong.findIndex(l => /^##\s/.test(l));
  if (dauTien < 0) e.push('không có dòng tiêu đề "## …"');
  else if (dong.slice(0, dauTien).some(l => l.trim())) e.push('có chữ nằm TRƯỚC dòng tiêu đề (chỉ được có tiêu đề bài rồi tới các dòng "- …")');
  for (const x of quetBiMat(nd, 'tệp')) e.push('NGHI BÍ MẬT (quét cả tệp) — ' + x);
  for (const [re, nhan] of MAU_CAM) { const m = nd.match(re); if (m) e.push('chứa ' + nhan + ': "' + String(m[0]).slice(0, 40) + '" — không được có trong bài học (nếu thật sự cần, người phụ trách ghi trực tiếp vào kho)'); }
  for (const b of phanTich(nd, { nhom: null, tep: viTri || '' })) {
    for (const tg of b.tags) if (!/^[a-z0-9-]{1,40}$/.test(tg)) e.push('tag "' + tg.slice(0, 30) + '" chỉ được gồm a-z, 0-9, dấu gạch ngang');
    if (b.chucNang && !/^[a-z0-9-]{1,60}$/.test(b.chucNang)) e.push('chuc-nang chỉ được gồm a-z, 0-9, dấu gạch ngang');
  }
  return e.map(x => (viTri ? viTri + ': ' : '') + x);
}


/** Đọc mọi tệp .md trong thư mục (đệ quy). */
function lietKeMd(dir) {
  const ra = [];
  if (!fs.existsSync(dir)) return ra;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) ra.push(...lietKeMd(p));
    else if (/\.md$/.test(f.name)) ra.push(p);
  }
  return ra.sort();
}

/** Các tệp của kho: tệp gộp cũ (3 nhóm) + nghiep-vu/*.md + bai/**.md (mỗi bài một tệp). */
function dsTepKho(kho) {
  const ra = [];
  for (const [g, f] of Object.entries(TEP_NHOM)) ra.push({ nhom: g, tep: path.join(kho, f) });
  for (const p of lietKeMd(path.join(kho, 'nghiep-vu'))) ra.push({ nhom: 'nghiep-vu', tep: p, chucNang: path.basename(p, '.md') });
  for (const p of lietKeMd(path.join(kho, 'bai'))) ra.push({ nhom: null, tep: p, don: true });
  return ra.filter(x => fs.existsSync(x.tep));
}

/** Đọc toàn bộ bài. `them`: danh sách thư mục ngoài kho (hộp thư chờ gửi) — bài trong đó đánh dấu nguon = 'cho-gui'; trùng mã thì bài trong kho thắng. */
function docKho(kho, them) {
  const tat = [];
  for (const t of dsTepKho(kho)) tat.push(...phanTich(fs.readFileSync(t.tep, 'utf8'), { nhom: t.nhom, chucNang: t.chucNang, tep: t.tep, nguon: 'kho' }));
  const daCo = new Set(tat.map(b => b.id));
  for (const dir of them || []) {
    for (const p of lietKeMd(dir)) {
      for (const b of phanTich(fs.readFileSync(p, 'utf8'), { nhom: null, tep: p, nguon: 'cho-gui' })) if (!daCo.has(b.id)) { tat.push(b); daCo.add(b.id); }
    }
  }
  return tat;
}

/** Nội dung một tệp một-bài (dùng khi ghi vào hộp thư / kho). */
function viet1Bai(b, id) {
  const dau = ['## ' + id, 'nhom: ' + b.nhom];
  if (b.chucNang) dau.push('chuc-nang: ' + b.chucNang);
  dau.push('tags: ' + b.tags.join(', '), b.tieuDe);
  const khoi = [dau.join(' | '), ...b.dong];
  while (khoi.length && !khoi[khoi.length - 1].trim()) khoi.pop();
  return khoi.join('\n') + '\n';
}

module.exports = { kiemTep, MAU_CAM, TEP_NHOM, TRANG_THAI, NHOM_HOP_LE, RE_ID_MOI, RE_TEN_TEP_BAI, TOI_DA_KY_TU, TOI_DA_DONG_NOI_DUNG, bo, uocTok, taoId, phanTich, kiemBai, lietKeMd, dsTepKho, docKho, viet1Bai };
