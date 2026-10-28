/* loc.js — BỘ LỌC OUTPUT của Code-Insight: chốt chặn chính của cổng. Là mã xác định chạy SAU agent (không phải lời dặn trong prompt):
 * agent bị dụ thế nào thì thứ ra khỏi cổng vẫn phải qua đây. Nguyên tắc: đóng khi không chắc — lỗi / nghi ngờ thì KHÔNG trả kết quả.
 *
 * Đầu vào: đối tượng JSON thô của worker + lược đồ (schema) của tool. Lược đồ KHÔNG có trường nào để chứa code; trường lạ bị bỏ.
 * Mọi chuỗi được CHUẨN HOÁ (NFKC, bỏ ký tự vô hình) rồi qua các lớp (kiểm trên chuỗi đầy đủ TRƯỚC khi cắt ngắn, để cắt không giúp lách):
 *   0. ký tự lạ (ngoài Latin / tiếng Việt / dấu câu thường: Cyrillic, Hy Lạp, toàn chiều…) và chuỗi quá dài so với trường → che   [chặn homoglyph, giấu ký tự]
 *   1. giống mã nguồn (khối ```, { }, ; cuối dòng, chú thích @…, khai báo hàm, câu SQL, thẻ XML…)                            → che
 *   2. trùng n-gram với chỉ mục mã nguồn (chi-muc.js) — kiểm TỪNG chuỗi VÀ cả chuỗi ghép của toàn báo cáo (chặn chia nhỏ mã)  → che / từ chối
 *   3. giới hạn độ dài từng chuỗi, số phần tử mảng, tổng báo cáo                                                              → cắt
 *   4. bí mật (mật khẩu, token, khoá, JWT, khoá của nhà cung cấp…), địa chỉ IP, tên máy nội bộ, chuỗi băm / base64 dài        → che
 *   Trường tham_chieu chỉ nhận "tệp:dòng" TRỎ TỚI TỆP CÓ THẬT trong bản chụp (cổng kiểm), không còn là kênh giấu chữ.
 * Che quá nhiều (vượt ngưỡng) ⇒ coi cả kết quả là không an toàn ⇒ từ chối. Nhãn che KHÔNG nói lý do (khỏi lộ thông tin cho người dò).
 * GIỚI HẠN ĐÃ BIẾT (không có bộ lọc từ vựng nào khắc phục hết): văn xuôi diễn đạt lại gần nguyên văn, hoặc mã hoá chữ (đảo ngược, rot13…) có thể lọt;
 * rủi ro này được giảm bằng hạn mức, cache, nhật ký và đóng gói pháp lý, không bằng bộ lọc. */
'use strict';
const { quetBiMat } = require('../lib/bi-mat');
const { chuan } = require('./chi-muc');

// nguongNgram: số cửa sổ n-gram trùng tối thiểu để coi là CHÉP mã (n = 6 ⇒ 3 cửa sổ = ≥ 8 token liền nhau). Trích ngắn kiểu `invoice.getStatus()` không bị che nhầm.
const MAC_DINH = { chuoiToiDa: 400, tongToiDa: 8000, soCheToiDa: 8, tiLeCheToiDa: 0.4, nguongNgram: 3 };
const NHAN = { che: '[đã che]', thamchieu: '[tham chiếu không hợp lệ]' };
const THAM_CHIEU_RE = /^[\w$./@-]{1,160}(:\d{1,6}(-\d{1,6})?)?$/;
// Ký tự cho phép trong văn bản tự do: xuống dòng / tab, ASCII in được, Latin-1 + Latin mở rộng (gồm chữ Việt dựng sẵn), dấu gạch, ngoặc kép thường, •, …, mũi tên, ·.
const KY_TU_LA_RE = /[^\n\t\x20-\x7e -ɏḀ-ỿ‐-―‘-‟•…←-↔⇒·]/u;

class LoiLoc extends Error { constructor(ma, msg) { super(msg); this.ma = ma; } }

/** Lớp 1: chuỗi có dáng mã nguồn? (`{id}` kiểu biến đường dẫn được phép.) Các regex đều có cận trên để không bị ReDoS. */
function giongMa(s) {
  const t = s.replace(/\{[\w.-]{1,40}\}/g, '');
  if (/```/.test(t)) return true;
  if (/[{}]/.test(t)) return true;
  if (/;\s*$/m.test(t)) return true;
  if (/(^|\s)@[A-Z]\w{0,60}\s*(\(|$)/m.test(t)) return true;                                       // chú thích @Service( …
  if (/^\s*(import|package)\s+[\w.*]{1,200}\s*;?\s*$/m.test(t)) return true;
  if (/\b(public|private|protected)\s+(static\s+)?(final\s+)?[\w<>\[\],?]{1,80}\s+\w{1,80}\s*\(/.test(t)) return true;   // khai báo hàm Java
  if (/\b(select\b[\s\S]{1,120}\bfrom\b|insert\s+into\b|delete\s+from\b|update\s+\w{1,60}\s+set\b)/i.test(t)) return true;  // SQL
  if (/<\/?[a-z][\w:-]{0,40}(\s[^>]{0,200})?\/?>/i.test(t)) return true;                           // thẻ XML / HTML
  if (/^\s*(if|for|while|switch|try|catch|return|throw)\b.{0,200}[(=].{0,200}/m.test(t) && /[()]/.test(t) && /(=>|==|!=|&&|\|\||\+\+)/.test(t)) return true;
  let yeu = 0;
  if (/=>|->\s*\w/.test(t)) yeu++;
  if (/\w{1,60}\([^)]{0,80}\)\.\w{1,60}\(/.test(t)) yeu++;                                          // a(b).c(d)
  if (/\b\w{1,60}\s{0,3}(==|!=|<=|>=)\s{0,3}\w{1,60}/.test(t) && /[()]/.test(t)) yeu++;
  if (/\bnew\s+[A-Z]\w{0,60}\s*\(/.test(t)) yeu++;
  return yeu >= 3;
}

/** Lớp 4: bí mật, địa chỉ nội bộ hoặc chuỗi giống mã hoá (băm / base64 dài)? */
function biMat(s) {
  if (quetBiMat(s, 'x').length) return true;
  if (/-----BEGIN [A-Z ]{1,40}-----/.test(s)) return true;
  if (/\b(jdbc:|mongodb(\+srv)?:\/\/|sqlserver:\/\/|redis:\/\/|amqps?:\/\/|ftp:\/\/|ssh:\/\/)/i.test(s)) return true;
  if (/\bsk-ant-[\w-]{8,}|\bsk-[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{12,}|\bgh[pousr]_[A-Za-z0-9]{16,}|\bxox[abprs]-[\w-]{8,}|\bAIza[0-9A-Za-z_-]{20,}|\bglpat-[\w-]{12,}/.test(s)) return true;   // khoá của nhà cung cấp
  if (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(s)) return true;                                              // mọi địa chỉ IPv4 (không chỉ dải riêng)
  if (/\b[\w-]{1,60}\.(local|internal|corp|lan|intranet|intra|svc|localdomain)\b/i.test(s)) return true;
  if (/\b[\w-]{1,60}\.(softdreams|easypos)\.vn\b/i.test(s)) return true;
  if (/(password|passwd|mật\s*khẩu|mat\s*khau|secret|api[\s_-]?key|token)(\s{1,3}[^\s:=]{1,12}){0,3}\s{0,3}(is|là|=|:|—|-)\s{0,3}\S{6,}/i.test(s)) return true;
  if (/\b[A-Fa-f0-9]{40,}\b/.test(s)) return true;
  const m = s.match(/[A-Za-z0-9+]{40,}/g) || [];
  if (m.some(x => /\d/.test(x) && /[a-z]/.test(x) && /[A-Z]/.test(x))) return true;
  return false;
}

/** Chuỗi chứa "từ" giống dữ liệu mã hoá (base64 / băm / số liệu dài) chứ không phải văn xuôi? */
function giongMaHoa(s) {
  for (const tok of s.split(/\s+/)) {
    if (tok.length > 60) return true;
    if (tok.length >= 32 && /\d/.test(tok)) return true;
    if (tok.length >= 20 && /\d/.test(tok) && /[A-Za-z]/.test(tok) && !/[.\-:\/_@#]/.test(tok)) return true;
    if (tok.length >= 12 && /[+=]/.test(tok) && /\d/.test(tok) && /[A-Za-z]/.test(tok)) return true;
  }
  return false;
}

/** Làm sạch MỘT chuỗi theo các lớp. Trả { text, lop } — lop = null nếu giữ nguyên (lop chỉ để ghi nhật ký quản trị, KHÔNG trả cho tester). */
function lamSachChuoi(s, max, ctx) {
  let t = chuan(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  let lop = null;
  if (t.length > Math.max(max * 3, 1200)) lop = 'qua-dai';
  else if (KY_TU_LA_RE.test(t)) lop = 'ky-tu-la';
  else if (giongMa(t)) lop = 'ma';
  else if (ctx.chiMuc && ctx.chiMuc.soTrung(t) >= ctx.cfg.nguongNgram) lop = 'ngram';
  else if (biMat(t)) lop = 'bimat';
  else if (giongMaHoa(t)) lop = 'ma-hoa';
  if (lop) return { text: NHAN.che, lop };
  if (t.length > max) t = t.slice(0, max - 1) + '…';
  return { text: t, lop: null };
}

function che(ctx, duong, lop, gt) { ctx.daChe.push({ truong: duong, lop, mau: gt === undefined ? '' : String(gt).slice(0, 100) }); }

/* ---- lược đồ ---- */
const Str = (max, o) => Object.assign({ t: 'str', max }, o || {});
const Enum = (...values) => ({ t: 'enum', values });
const Arr = (item, max) => ({ t: 'arr', item, max });
const Obj = (props) => ({ t: 'obj', props });
const ThamChieu = () => ({ t: 'str', max: 160, thamChieu: true });

function lamSachNut(v, nut, duong, ctx) {
  switch (nut.t) {
    case 'str': {
      if (typeof v !== 'string') throw new LoiLoc('schema', duong + ': cần chuỗi');
      ctx.soChuoi++;
      if (nut.thamChieu) {
        ctx.soThamChieu = (ctx.soThamChieu || 0) + 1;
        const t = chuan(v).trim();
        const phan = t.split(/\s*[;,]\s*/).filter(Boolean);
        // Chỉ nhận "đường/dẫn:dòng" và (khi cổng cấp hàm kiểm) phải là TỆP CÓ THẬT trong bản chụp, dòng không vượt số dòng của tệp.
        const hopLe = phan.length >= 1 && phan.length <= 4 && phan.every(x => THAM_CHIEU_RE.test(x) && !x.includes('..') && !biMat(x) && (!ctx.kiemThamChieu || ctx.kiemThamChieu(x) === true));
        if (!hopLe) { che(ctx, duong, 'tham-chieu', v); return NHAN.thamchieu; }
        return phan.join(', ');
      }
      const r = lamSachChuoi(v, Math.min(nut.max || ctx.cfg.chuoiToiDa, ctx.cfg.chuoiToiDa), ctx);
      if (r.lop) che(ctx, duong, r.lop, v); else ctx.vanBan.push(r.text);
      return r.text;
    }
    case 'enum':
      if (!nut.values.includes(v)) throw new LoiLoc('schema', duong + ': giá trị ngoài danh sách cho phép');
      return v;
    case 'int':
      if (!Number.isInteger(v) || v < (nut.min ?? -1e9) || v > (nut.max ?? 1e9)) throw new LoiLoc('schema', duong + ': cần số nguyên trong khoảng');
      return v;
    case 'arr': {
      if (!Array.isArray(v)) throw new LoiLoc('schema', duong + ': cần mảng');
      const ra = [];
      for (const it of v.slice(0, nut.max)) ra.push(lamSachNut(it, nut.item, duong + '[]', ctx));
      if (v.length > nut.max) ctx.catDai++;
      return ra;
    }
    case 'obj': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new LoiLoc('schema', duong + ': cần đối tượng');
      const ra = {};
      for (const k of Object.keys(nut.props)) {
        const con = nut.props[k];
        if (v[k] === undefined || v[k] === null) { if (!con.tuyChon) throw new LoiLoc('schema', duong + '.' + k + ': thiếu'); continue; }
        ra[k] = lamSachNut(v[k], con, duong ? duong + '.' + k : k, ctx);
      }
      return ra;
    }
    default: throw new LoiLoc('schema', 'lược đồ sai: ' + nut.t);
  }
}

/** Cắt bớt phần tử cuối của mảng dài nhất cho tới khi tổng JSON ≤ tongToiDa. */
function epTong(obj, tong) {
  let s = JSON.stringify(obj);
  while (s.length > tong) {
    let tot = null;
    const duyet = (o) => { if (Array.isArray(o)) { if (o.length && (!tot || JSON.stringify(o).length > JSON.stringify(tot).length)) tot = o; o.forEach(duyet); } else if (o && typeof o === 'object') Object.values(o).forEach(duyet); };
    duyet(obj);
    if (!tot) return false;
    tot.pop(); s = JSON.stringify(obj);
  }
  return true;
}

/** Lọc kết quả thô. opts: { chiMuc, cfg, kiemThamChieu(ref)→bool }. Trả { ok:true, ket, daChe:[{truong,lop}], catDai } hoặc { ok:false, ma, lyDo } (đóng khi không chắc). */
function loc(raw, luocDo, opts) {
  const cfg = Object.assign({}, MAC_DINH, (opts && opts.cfg) || {});
  const ctx = { cfg, chiMuc: opts && opts.chiMuc, kiemThamChieu: opts && opts.kiemThamChieu, daChe: [], soChuoi: 0, catDai: 0, vanBan: [] };
  let ket;
  try {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) ket = lamSachNut(raw, luocDo, '', ctx);
    else throw new LoiLoc('schema', 'kết quả của worker không phải đối tượng JSON');
    // Chặn chia nhỏ mã thành nhiều mảnh ngắn (mỗi mảnh < N token nên không mảnh nào tự trùng): kiểm cả CHUỖI GHÉP theo thứ tự của toàn báo cáo.
    if (ctx.chiMuc && ctx.vanBan.length > 1 && ctx.chiMuc.soTrung(ctx.vanBan.join(' ')) >= ctx.cfg.nguongNgram) throw new LoiLoc('ngram-lien-chuoi', 'báo cáo có đoạn mã bị chia nhỏ qua nhiều mục');
    if (!epTong(ket, cfg.tongToiDa)) throw new LoiLoc('qua-dai', 'báo cáo vượt giới hạn tổng và không cắt được');
  } catch (e) {
    if (e instanceof LoiLoc) return { ok: false, ma: e.ma, lyDo: e.message };
    return { ok: false, ma: 'loi-loc', lyDo: 'lỗi bộ lọc: ' + String(e && e.message || e).slice(0, 120) };
  }
  const cheNoiDung = ctx.daChe.filter(x => x.lop !== 'tham-chieu');
  const soChuoiNoiDung = Math.max(1, ctx.soChuoi - ctx.daChe.filter(x => x.lop === 'tham-chieu').length - (ctx.soThamChieu || 0) + ctx.daChe.filter(x => x.lop === 'tham-chieu').length);
  const tiLe = ctx.soChuoi ? cheNoiDung.length / Math.max(1, ctx.soChuoi - (ctx.soThamChieu || 0)) : 0;
  if (cheNoiDung.length > cfg.soCheToiDa || (cheNoiDung.length >= 3 && tiLe > cfg.tiLeCheToiDa)) {
    return { ok: false, ma: 'che-qua-nhieu', lyDo: 'kết quả có quá nhiều đoạn giống mã nguồn / bí mật (' + cheNoiDung.length + '/' + (ctx.soChuoi - (ctx.soThamChieu || 0)) + ') — bị từ chối', daChe: ctx.daChe };
  }
  return { ok: true, ket, daChe: ctx.daChe, catDai: ctx.catDai };
}

module.exports = { loc, giongMa, biMat, giongMaHoa, lamSachChuoi, MAC_DINH, NHAN, Str, Enum, Arr, Obj, ThamChieu, LoiLoc };
