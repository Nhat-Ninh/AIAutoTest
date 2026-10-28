/* chi-muc.js — CHỈ MỤC N-GRAM của mã nguồn (lớp 2 của bộ lọc output, xem loc.js).
 * Mỗi cửa sổ N token liên tiếp của MỌI tệp văn bản trong bản chụp được băm thành số 53 bit, xếp vào một mảng đã sắp để tra nhanh.
 * Một đoạn văn trong báo cáo mà có CỬA SỔ N token trùng với mã nguồn ⇒ đang chép mã ⇒ bị che. Mã nguồn KHÔNG nằm trong chỉ mục (chỉ có băm).
 * Phạm vi chỉ mục PHẢI bằng phạm vi worker đọc được (mọi tệp văn bản, không theo đuôi tệp): tệp nào worker đọc được mà chỉ mục không có thì lọc không nhận ra.
 * Chỉ mục KHÔNG ĐẦY ĐỦ (tệp quá lớn / vượt tổng) bị đánh dấu — cổng từ chối dùng (đóng khi không chắc). Chuẩn hoá NFKC + bỏ ký tự định dạng (U+200B…) trước khi tách token.
 * Giới hạn đã biết: chép lại rồi đổi tên biến / diễn đạt lại, hoặc mã hoá (base64, đảo ngược…) thì không bắt được — xem tài liệu rủi ro còn lại.
 * Dựng một lần cho mỗi commit của bản chụp (lưu ra tệp để khỏi dựng lại). Chỉ dùng thư viện có sẵn của Node. */
'use strict';
const fs = require('fs');
const path = require('path');

const N_MAC_DINH = 6;
// Token theo Unicode: chữ (kể cả tiếng Việt có dấu) là MỘT token, không bị tách thành mảnh (bản ASCII-only làm văn xuôi tiếng Việt trùng mã nguồn oan).
const TOKEN_RE = /[\p{L}_$][\p{L}\p{N}_$]*|\p{N}+|[^\s\p{L}\p{N}_]/gu;
const BO_QUA_THU_MUC = new Set(['.git', 'node_modules']);       // trùng với thư mục mà xuat-ban-chup.sh xoá khỏi bản chụp
const MAGIC = 'EPCI3';      // đổi định dạng token ⇒ chỉ mục cũ không dùng lại được (cổng tự dựng lại)

/** Chuẩn hoá văn bản trước khi tách token / kiểm: NFKC (gộp dạng toàn chiều, dấu hợp…) và bỏ ký tự định dạng vô hình (U+200B, U+FEFF, điều khiển hai chiều…). */
function chuan(text) { return String(text == null ? '' : text).normalize('NFKC').replace(/\p{Cf}/gu, ''); }

function bamToken(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Danh sách băm token (chữ thường, đã chuẩn hoá) của một đoạn văn. */
function bamCacToken(text) {
  const ra = [];
  const m = chuan(text).toLowerCase().match(TOKEN_RE) || [];
  for (let i = 0; i < m.length; i++) ra.push(bamToken(m[i]));
  return ra;
}

/** Băm cửa sổ [i, i+n) của dãy băm token thành số nguyên < 2^53 (hai bộ trộn độc lập). */
function bamCuaSo(th, i, n) {
  let a = 0x9e3779b1, b = 0x85ebca6b;
  for (let k = 0; k < n; k++) {
    const t = th[i + k];
    a = Math.imul(a ^ t, 0x01000193) >>> 0;
    a = (a ^ (a >>> 15)) >>> 0;
    b = Math.imul(b + t + k, 0x5bd1e995) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return (a & 0x1fffff) * 4294967296 + b;
}

class ChiMuc {
  constructor(mang, n, thongKe) { this.mang = mang; this.n = n; this.thongKe = thongKe || {}; }
  get kichThuoc() { return this.mang.length; }
  /** Chỉ mục có đủ để tin không: false nếu có tệp bị bỏ sót (quá lớn / vượt tổng). */
  get dayDu() { return !this.thongKe.khongDayDu; }
  /** Có cửa sổ băm này trong chỉ mục không (tìm nhị phân). */
  co(v) {
    const a = this.mang; let lo = 0, hi = a.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >>> 1; const x = a[mid]; if (x === v) return true; if (x < v) lo = mid + 1; else hi = mid - 1; }
    return false;
  }
  /** Số cửa sổ trùng mã nguồn mà BẮC QUA ranh giới giữa hai mục liền nhau (dấu hiệu mã bị chia nhỏ qua nhiều mục). Cửa sổ nằm trọn trong một mục do kiểm từng mục lo; cộng chúng lại làm báo cáo dài bị từ chối oan. */
  soTrungLienChuoi(ds) {
    const th = []; const bien = new Set();
    for (const s of ds) { const t = bamCacToken(s); if (!t.length) continue; if (th.length) bien.add(th.length); for (const x of t) th.push(x); }
    let dem = 0;
    for (let i = 0; i + this.n <= th.length; i++) {
      let cat = false; for (let b = i + 1; b < i + this.n; b++) if (bien.has(b)) { cat = true; break; }
      if (cat && this.co(bamCuaSo(th, i, this.n))) dem++;
    }
    return dem;
  }
  /** Số cửa sổ của đoạn văn trùng với mã nguồn (0 = sạch). Đoạn ngắn hơn N token không có cửa sổ nên luôn 0. */
  soTrung(text) {
    const th = bamCacToken(text);
    let dem = 0;
    for (let i = 0; i + this.n <= th.length; i++) if (this.co(bamCuaSo(th, i, this.n))) dem++;
    return dem;
  }
}

/** Tệp nhị phân? (có byte NUL trong 8 KB đầu) */
function laNhiPhan(buf) { const n = Math.min(buf.length, 8192); for (let i = 0; i < n; i++) if (buf[i] === 0) return true; return false; }

/** Dựng chỉ mục từ thư mục bản chụp. opts: { n, tepToiDa (byte), tongToiDa (byte) }. Tệp nhị phân bị bỏ (worker đọc không ra chữ); tệp văn bản quá lớn / vượt tổng ⇒ đánh dấu KHÔNG ĐẦY ĐỦ. */
function dung(thuMuc, opts) {
  opts = opts || {};
  const n = opts.n || N_MAC_DINH, tepToiDa = opts.tepToiDa || 4 * 1024 * 1024, tongToiDa = opts.tongToiDa || 800 * 1024 * 1024;
  let buf = new Float64Array(1 << 20), dem = 0, soTep = 0, tongByte = 0, khongDayDu = false, boSot = 0;
  const them = (v) => { if (dem === buf.length) { const nb = new Float64Array(buf.length * 2); nb.set(buf); buf = nb; } buf[dem++] = v; };
  const di = (d, sau) => {
    if (sau > 60) { khongDayDu = true; boSot++; return; }
    let ds; try { ds = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { khongDayDu = true; boSot++; return; }
    for (const e of ds) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;   // không đi theo liên kết: tránh thoát khỏi bản chụp (bản chụp không có liên kết)
      if (e.isDirectory()) { if (!BO_QUA_THU_MUC.has(e.name)) di(p, sau + 1); continue; }
      if (!e.isFile()) continue;
      let st; try { st = fs.statSync(p); } catch (x) { khongDayDu = true; boSot++; continue; }
      if (st.size > tepToiDa || tongByte + st.size > tongToiDa) { khongDayDu = true; boSot++; continue; }
      let b; try { b = fs.readFileSync(p); } catch (x) { khongDayDu = true; boSot++; continue; }
      if (laNhiPhan(b)) continue;
      soTep++; tongByte += st.size;
      const th = bamCacToken(b.toString('utf8'));
      for (let i = 0; i + n <= th.length; i++) them(bamCuaSo(th, i, n));
    }
  };
  di(thuMuc, 0);
  const mang = buf.slice(0, dem).sort();
  let k = 0; for (let i = 0; i < mang.length; i++) if (i === 0 || mang[i] !== mang[i - 1]) mang[k++] = mang[i];
  return new ChiMuc(mang.slice(0, k), n, { soTep, tongByte, khongDayDu, boSot });
}

/** Lưu / đọc chỉ mục (tệp nhị phân: tiêu đề + mảng Float64). Cờ "không đầy đủ" nằm trong tiêu đề. */
function luu(chiMuc, tep) {
  const dau = Buffer.alloc(16); dau.write(MAGIC, 0, 'latin1'); dau.writeUInt8(chiMuc.thongKe.khongDayDu ? 1 : 0, 5); dau.writeUInt32LE(chiMuc.n, 8); dau.writeUInt32LE(chiMuc.mang.length, 12);
  const tam = tep + '.tmp';
  fs.writeFileSync(tam, Buffer.concat([dau, Buffer.from(chiMuc.mang.buffer, chiMuc.mang.byteOffset, chiMuc.mang.byteLength)]));
  fs.renameSync(tam, tep);
}
function doc(tep) {
  const b = fs.readFileSync(tep);
  if (b.length < 16 || b.toString('latin1', 0, 5) !== MAGIC) throw new Error('Tệp chỉ mục không hợp lệ');
  const n = b.readUInt32LE(8), len = b.readUInt32LE(12);
  if (b.length !== 16 + len * 8) throw new Error('Tệp chỉ mục bị cắt cụt');
  const mang = new Float64Array(len); Buffer.from(mang.buffer).set(b.subarray(16));
  return new ChiMuc(mang, n, { tuTep: true, khongDayDu: b.readUInt8(5) === 1 });
}

module.exports = { dung, luu, doc, ChiMuc, bamCacToken, bamCuaSo, chuan, N_MAC_DINH };
