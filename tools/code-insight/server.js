#!/usr/bin/env node
/* server.js — CỔNG MCP của Code-Insight (chạy trên server, vùng tin cậy). Tester KHÔNG có đường nào tới mã nguồn: Claude trên máy họ gọi các
 * tool MCP cố định (tools.js) qua HTTPS bằng TOKEN JIRA của chính họ; cổng xác thực, kiểm quyền, hạn mức, tra cache, rồi giao WORKER (claude -p,
 * chỉ Read / Grep / Glob, trên BẢN CHỤP chỉ-đọc của mã đang chạy DEV) đọc mã và trả JSON thô; bộ lọc loc.js làm sạch rồi mới trả về.
 * Đóng khi không chắc: Jira hỏng / chỉ mục lỗi / worker lỗi / lọc lỗi ⇒ từ chối, KHÔNG trả kết quả thô.
 *
 * Chạy:   node tools/code-insight/server.js --cau-hinh <tệp.json>            chạy cổng
 *         node tools/code-insight/server.js --cau-hinh <tệp.json> --kiem     kiểm cấu hình, Jira, bản chụp rồi thoát
 *         … --thu-claude   chạy lệnh docker của worker với câu hỏi tầm thường, in lỗi thật · --thu-worker   chạy MỘT lượt worker thật, in kết quả thô / lỗi chi tiết
 * Chỉ dùng thư viện có sẵn của Node. Cấu hình mẫu: cau-hinh.mau.json (đặt tệp thật NGOÀI thư mục git; KHÔNG để bí mật trong tệp này). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DS, danhSach, LoiDauVao } = require('./tools');
const { loc } = require('./loc');
const CM = require('./chi-muc');

const PHIEN_BAN = '1.0.0';
const GIAO_THUC = ['2025-06-18', '2025-03-26', '2024-11-05'];
const TOI_DA_THAN = 64 * 1024;

const MAC_DINH = {
  lang: { cong: 8100, diaChi: '0.0.0.0', tls: { cert: '', key: '' }, choPhepHttp: false },
  jira: { url: 'https://jira-sds.softdreams.vn:8080', boQuaKiemChungChi: false, caFile: '' },   // ưu tiên caFile (CA nội bộ); boQuaKiemChungChi chỉ là phương án cuối vì PAT của mọi tester đi qua đây
  quyen: { kieu: 'quyen-jira', duAn: 'EPB', quyen: 'CREATE_ISSUES', danhSach: [] },
  repo: [],
  banChup: { thuMuc: '' },
  worker: { lenh: [], choPhepKhongDocker: false, hetGioMs: 240000, byteToiDa: 1024 * 1024, song: 2, hangDoiToiDa: 10, bienMoiTruong: ['PATH', 'PATHEXT', 'SystemRoot', 'HOME', 'USERPROFILE', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'COMSPEC', 'DOCKER_HOST', 'DOCKER_CONTEXT'], claude: {} },
  gioiHan: { yeuCauMoiPhut: 20, yeuCauMoiNgay: 150, workerMoiNgay: 40, byteMoiNgay: 600000, dongThoiMoiNguoi: 2 },
  loc: {},
  cache: { thuMuc: '', hanGio: 168 },
  chiMuc: { thuMuc: '', n: CM.N_MAC_DINH, hetGioMs: 600000 },
  nhatKy: '',
  trangThaiHanMuc: '',
};

function tron(a, b) {
  const ra = Object.assign({}, a);
  for (const k of Object.keys(b || {})) ra[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' && !Array.isArray(a[k])) ? tron(a[k], b[k]) : b[k];
  return ra;
}
function docCauHinh(tep) { return tron(MAC_DINH, JSON.parse(fs.readFileSync(tep, 'utf8').replace(/^\uFEFF/, ''))); }

/** Danh sách lỗi cấu hình (rỗng = hợp lệ). */
function kiemCauHinh(cfg) {
  const e = [];
  // http (không TLS) chỉ được nghe ở địa chỉ vòng lặp (127.0.0.1 / ::1): token Jira không bao giờ đi rõ chữ qua mạng.
  if (!(cfg.lang.tls.cert && cfg.lang.tls.key) && cfg.lang.choPhepHttp && !/^(127\.0\.0\.1|::1|localhost)$/.test(String(cfg.lang.diaChi || ''))) e.push('lang.choPhepHttp chỉ dùng khi lang.diaChi là 127.0.0.1 (chạy thử trên chính máy này). Muốn cho máy khác nối: dùng TLS (lang.tls.cert / lang.tls.key).');
  if (!(cfg.lang.tls.cert && cfg.lang.tls.key) && !cfg.lang.choPhepHttp) e.push('Thiếu TLS: điền lang.tls.cert / lang.tls.key (token Jira đi trong tiêu đề nên BẮT BUỘC https). Chỉ để thử mới đặt lang.choPhepHttp=true.');
  if (!Array.isArray(cfg.repo) || !cfg.repo.length) e.push('repo: cần danh sách repo được phục vụ');
  else if (cfg.repo.some(r => !/^[a-z0-9_.-]{1,80}$/.test(r))) e.push('repo: tên repo chỉ gồm chữ thường, số, _ . -');
  if (!cfg.banChup.thuMuc) e.push('banChup.thuMuc: cần thư mục gốc chứa <repo>/current (bản chụp do Jenkins xuất)');
  if (!Array.isArray(cfg.worker.lenh) || !cfg.worker.lenh.length) e.push('worker.lenh: cần mảng lệnh chạy worker, vd ["node","tools/code-insight/worker-claude.js"]');
  if (!['quyen-jira', 'danh-sach'].includes(cfg.quyen.kieu)) e.push('quyen.kieu phải là "quyen-jira" hoặc "danh-sach"');
  if (cfg.quyen.kieu === 'danh-sach' && !(cfg.quyen.danhSach || []).length) e.push('quyen.danhSach rỗng (kiểu danh-sach)');
  for (const k of ['yeuCauMoiPhut', 'yeuCauMoiNgay', 'workerMoiNgay', 'byteMoiNgay']) if (!(cfg.gioiHan[k] > 0)) e.push('gioiHan.' + k + ' phải > 0');
  if (!(cfg.worker.hetGioMs >= 1000) || !(cfg.worker.song >= 1)) e.push('worker.hetGioMs ≥ 1000 và worker.song ≥ 1');
  if (!(cfg.worker.claude && cfg.worker.claude.docker && cfg.worker.claude.docker.bat === true) && cfg.worker.choPhepKhongDocker !== true) e.push('worker.claude.docker.bat phải là true: worker KHÔNG cô lập đọc được cả máy chủ (khoá TLS, khoá API, nhật ký). Chỉ để thử mới đặt worker.choPhepKhongDocker=true.');
  if (!cfg.cache.thuMuc) e.push('cache.thuMuc: cần thư mục lưu cache báo cáo đã lọc');
  if (!cfg.chiMuc.thuMuc) e.push('chiMuc.thuMuc: cần thư mục lưu chỉ mục n-gram');
  return e;
}

const bam = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const homNay = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const ngauNhien = () => crypto.randomBytes(4).toString('hex');

/* ---------------- Jira ---------------- */
function jiraGet(cfg, duong, token) {
  return new Promise((res, rej) => {
    const u = new URL(cfg.jira.url.replace(/\/+$/, '') + duong);
    const lib = u.protocol === 'http:' ? http : https;
    const opt = { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, timeout: 15000 };
    if (u.protocol === 'https:') { if (cfg.jira.caFile) opt.ca = fs.readFileSync(cfg.jira.caFile); else if (cfg.jira.boQuaKiemChungChi) opt.rejectUnauthorized = false; }
    const rq = lib.request(u, opt, (r) => { const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => res({ s: r.statusCode, d: Buffer.concat(ch).toString('utf8') })); });
    rq.on('timeout', () => rq.destroy(new Error('Jira không trả lời')));
    rq.on('error', rej);
    rq.end();
  });
}

/* ---------------- hạn mức theo từng tester ---------------- */
function taoHanMuc(cfg) {
  const m = new Map();
  const tep = cfg.trangThaiHanMuc;
  if (tep) { try { const j = JSON.parse(fs.readFileSync(tep, 'utf8')); if (j.ngay === homNay()) for (const k of Object.keys(j.nguoi || {})) m.set(k, Object.assign({ phut: [], yc: 0, worker: 0, byte: 0 }, j.nguoi[k], { phut: [] })); } catch (e) { /* chưa có / hỏng: đếm lại từ 0 */ } }
  const lay = (n) => { let x = m.get(n); if (!x) { x = { phut: [], yc: 0, worker: 0, byte: 0 }; m.set(n, x); } return x; };
  let ngay = homNay();
  const sangNgay = () => { const h = homNay(); if (h !== ngay) { ngay = h; m.clear(); } };
  const g = cfg.gioiHan;
  return {
    /** Kiểm và ghi một yêu cầu. Trả null nếu được, hoặc thông báo từ chối. */
    yeuCau(nguoi) {
      sangNgay(); const x = lay(nguoi); const now = Date.now();
      x.phut = x.phut.filter(t => now - t < 60000);
      if (x.phut.length >= g.yeuCauMoiPhut) return 'Quá ' + g.yeuCauMoiPhut + ' yêu cầu mỗi phút — chờ một lát.';
      if (x.yc >= g.yeuCauMoiNgay) return 'Hết hạn mức ' + g.yeuCauMoiNgay + ' yêu cầu hôm nay.';
      if (x.byte >= g.byteMoiNgay) return 'Hết hạn mức dung lượng trả về hôm nay.';
      x.phut.push(now); x.yc++; return null;
    },
    /** Kiểm hạn mức lượt chạy worker (tốn tiền LLM). */
    worker(nguoi) { sangNgay(); const x = lay(nguoi); if (x.worker >= g.workerMoiNgay) return 'Hết hạn mức ' + g.workerMoiNgay + ' lượt phân tích mới hôm nay (kết quả đã có trong cache vẫn đọc được).'; x.worker++; return null; },
    byte(nguoi, n) { sangNgay(); lay(nguoi).byte += n; },
    luu() {
      if (!tep) return;
      try { const o = {}; for (const [k, v] of m) o[k] = { yc: v.yc, worker: v.worker, byte: v.byte }; fs.mkdirSync(path.dirname(tep), { recursive: true }); const tam = tep + '.' + process.pid + '.tmp'; fs.writeFileSync(tam, JSON.stringify({ ngay, nguoi: o })); fs.renameSync(tam, tep); } catch (e) { console.error('Không lưu được trạng thái hạn mức: ' + e.message); }
    },
  };
}

/* ---------------- worker ---------------- */
class LoiWorker extends Error { constructor(ma, msg) { super(msg); this.ma = ma; } }

function chayWorker(cfg, yeuCau) {
  return new Promise((res, rej) => {
    const env = {}; for (const k of cfg.worker.bienMoiTruong) if (process.env[k] !== undefined) env[k] = process.env[k];
    let c;
    try { c = spawn(cfg.worker.lenh[0], cfg.worker.lenh.slice(1), { cwd: path.resolve(__dirname, '..', '..'), env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
    catch (e) { return rej(new LoiWorker('khong-chay', 'không chạy được worker')); }
    let out = '', err = '', xong = false;
    const ketThuc = (f) => { if (xong) return; xong = true; clearTimeout(kill); f(); };
    const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) { /* đã thoát */ } ketThuc(() => rej(new LoiWorker('het-gio', 'worker quá ' + Math.round(cfg.worker.hetGioMs / 1000) + ' giây'))); }, cfg.worker.hetGioMs);
    c.stdout.on('data', d => { out += d; if (out.length > cfg.worker.byteToiDa) { try { c.kill('SIGKILL'); } catch (e) { /* đã thoát */ } ketThuc(() => rej(new LoiWorker('qua-lon', 'output của worker vượt giới hạn'))); } });
    c.stderr.on('data', d => { if (err.length < 1500) err += d; });
    c.on('error', () => ketThuc(() => rej(new LoiWorker('khong-chay', 'không chạy được worker'))));
    c.on('close', (code) => ketThuc(() => {
      if (code !== 0) return rej(Object.assign(new LoiWorker('thoat-loi', 'worker thoát mã ' + code), { stderr: err }));
      try { const j = JSON.parse(out); if (!j || typeof j !== 'object' || !('ket' in j)) throw new Error('thiếu ket'); res(j); } catch (e) { rej(new LoiWorker('json-sai', 'worker không trả JSON hợp lệ')); }
    }));
    c.stdin.on('error', () => { /* worker thoát sớm */ });
    c.stdin.end(JSON.stringify(yeuCau));
  });
}

function taoHangDoi(song, toiDa) {
  let dang = 0; const doi = [];
  const tiep = () => { while (dang < song && doi.length) { dang++; const f = doi.shift(); f(); } };
  return (viec) => new Promise((res, rej) => {
    if (dang >= song && doi.length >= toiDa) return rej(new LoiWorker('ban', 'hệ thống đang bận'));
    doi.push(() => { viec().then(res, rej).finally(() => { dang--; tiep(); }); });
    tiep();
  });
}

/* ---------------- máy chủ ---------------- */
function taoMayChu(cfg) {
  const hanMuc = taoHanMuc(cfg);
  const hangDoi = taoHangDoi(cfg.worker.song, cfg.worker.hangDoiToiDa);
  const xacThucNho = new Map();      // băm token → { kq, het }
  const saiTheoIp = new Map();       // ip → { n, t }
  const chiMucBoNho = new Map();     // repo@sha → ChiMuc
  const dangDung = new Map();        // repo@sha → Promise
  const dangChayKhoa = new Map();    // khoá cache → Promise (cùng câu hỏi chạy chung một worker)
  const dangChayNguoi = new Map();   // người → số phân tích đang chạy
  const hanMucTimer = setInterval(() => hanMuc.luu(), 30000); if (hanMucTimer.unref) hanMucTimer.unref();

  function nhatKy(o) {
    const dong = JSON.stringify(Object.assign({ t: new Date().toISOString() }, o));
    if (!cfg.nhatKy) { if (process.env.CI_IN_NHAT_KY === '1') console.log(dong); return; }
    try { fs.mkdirSync(path.dirname(cfg.nhatKy), { recursive: true }); fs.appendFileSync(cfg.nhatKy, dong + '\n'); } catch (e) { console.error('Không ghi được nhật ký: ' + e.message); }
  }

  async function xacThuc(token) {
    const khoa = bam(token); const now = Date.now();
    const c = xacThucNho.get(khoa); if (c && c.het > now) return c.kq;
    const me = await jiraGet(cfg, '/rest/api/2/myself', token);
    let kq;
    if (me.s === 401 || me.s === 403) kq = { ok: false, ma: 401, lyDo: 'Token Jira sai / hết hạn' };
    else if (me.s !== 200) throw new Error('Jira trả ' + me.s);
    else {
      let ten = ''; try { ten = String(JSON.parse(me.d).name || '').trim(); } catch (e) { /* để trống */ }
      if (!ten) throw new Error('Jira không cho biết tên người dùng');
      if (cfg.quyen.kieu === 'danh-sach') kq = (cfg.quyen.danhSach || []).map(s => String(s).toLowerCase()).includes(ten.toLowerCase()) ? { ok: true, nguoi: ten } : { ok: false, ma: 403, lyDo: 'Bạn chưa được phép dùng cổng đọc mã' };
      else {
        const p = await jiraGet(cfg, '/rest/api/2/mypermissions?projectKey=' + encodeURIComponent(cfg.quyen.duAn) + '&permissions=' + encodeURIComponent(cfg.quyen.quyen), token);
        if (p.s !== 200) throw new Error('Jira mypermissions trả ' + p.s);
        let co = false; try { co = JSON.parse(p.d).permissions[cfg.quyen.quyen].havePermission === true; } catch (e) { /* coi như không có */ }
        kq = co ? { ok: true, nguoi: ten } : { ok: false, ma: 403, lyDo: 'Tài khoản Jira chưa có quyền ' + cfg.quyen.quyen + ' ở dự án ' + cfg.quyen.duAn + ' (cổng dựa vào quyền này)' };
      }
    }
    if (xacThucNho.size > 2000) xacThucNho.delete(xacThucNho.keys().next().value);
    xacThucNho.set(khoa, { kq, het: now + (kq.ok ? 5 * 60000 : 30000) });
    return kq;
  }

  /* bản chụp hiện tại của repo: <banChup.thuMuc>/<repo>/current → <sha>, phải nằm TRONG thư mục repo (không thoát ra ngoài) */
  function banChupHienTai(repo) {
    try {
      const goc = path.resolve(cfg.banChup.thuMuc, repo);
      const that = fs.realpathSync(path.join(goc, 'current'));
      const gocThat = fs.realpathSync(goc);
      if (!that.startsWith(gocThat + path.sep)) return null;
      const sha = path.basename(that);
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(sha)) return null;
      // Ghim đường dẫn THẬT của bản chụp (không đi qua "current"): Jenkins đổi current giữa chừng thì worker vẫn đọc đúng bản mà chỉ mục đã dựng.
      return { repo, sha, thuMuc: that, duongDan: repo + '/' + sha };
    } catch (e) { return null; }
  }

  // Dựng chỉ mục: MỘT lần một (hàng đợi toàn cục), có hạn giờ và giới hạn bộ nhớ — tránh nhiều repo dựng song song làm cạn RAM / treo cổng.
  const hangDungChiMuc = taoHangDoi(1, 50);
  function dungChiMucTienTrinh(thuMuc, tep) {
    return new Promise((res, rej) => {
      const c = spawn(process.execPath, ['--max-old-space-size=3072', path.join(__dirname, 'dung-chi-muc.js'), thuMuc, tep, String(cfg.chiMuc.n)], { stdio: 'ignore', windowsHide: true });
      const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) { /* đã thoát */ } rej(new Error('dựng chỉ mục quá hạn')); }, cfg.chiMuc.hetGioMs || 600000);
      c.on('error', (e) => { clearTimeout(kill); rej(e); });
      c.on('close', (code) => { clearTimeout(kill); code === 0 ? res() : rej(new Error('dựng chỉ mục mã ' + code)); });
    });
  }
  async function layChiMuc(b) {
    const khoa = b.repo + '@' + b.sha;
    if (chiMucBoNho.has(khoa)) return chiMucBoNho.get(khoa);
    const tep = path.join(cfg.chiMuc.thuMuc, khoa.replace(/[^\w.@-]/g, '_') + '.idx');
    let p = dangDung.get(khoa);
    if (!p) {
      p = (async () => {
        let cm = null;
        try { cm = CM.doc(tep); } catch (e) { /* chưa có / hỏng: dựng lại */ }
        if (!cm) {
          fs.mkdirSync(cfg.chiMuc.thuMuc, { recursive: true });
          await hangDungChiMuc(() => dungChiMucTienTrinh(b.thuMuc, tep));
          cm = CM.doc(tep);
        }
        // Chỉ mục thiếu tệp (quá lớn / vượt tổng) thì lọc không bảo đảm được ⇒ KHÔNG dùng (đóng khi không chắc).
        if (!cm.dayDu) throw new Error('chỉ mục không đầy đủ (có tệp văn bản quá lớn / vượt giới hạn) — xử lý bản chụp rồi xuất lại');
        return cm;
      })().finally(() => dangDung.delete(khoa));
      dangDung.set(khoa, p);
    }
    const cm = await p;
    if (chiMucBoNho.size >= 8) chiMucBoNho.delete(chiMucBoNho.keys().next().value);
    chiMucBoNho.set(khoa, cm);
    return cm;
  }

  const tepCache = (khoa) => path.join(cfg.cache.thuMuc, khoa + '.json');
  function docCache(khoa) {
    try { const f = tepCache(khoa); const st = fs.statSync(f); if (Date.now() - st.mtimeMs > cfg.cache.hanGio * 3600000) return null; return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; }
  }
  function ghiCache(khoa, v) {
    try { fs.mkdirSync(cfg.cache.thuMuc, { recursive: true }); const f = tepCache(khoa); const tam = f + '.' + ngauNhien() + '.tmp'; fs.writeFileSync(tam, JSON.stringify(v)); fs.renameSync(tam, f); } catch (e) { console.error('Không ghi được cache: ' + e.message); }
  }

  const loiTool = (msg) => ({ isError: true, content: [{ type: 'text', text: msg }] });
  const vanBan = (t) => ({ content: [{ type: 'text', text: t }] });
  // Không đưa số đoạn bị che / lý do lọc cho tester (tránh thành "máy dò" xem câu nào trùng mã): chỉ ghi nhật ký quản trị.
  const dinhDang = (v) => '# Bản mã đã đọc (đang chạy trên DEV): ' + v.banMa + '\n' + JSON.stringify(v.ket, null, 2);

  /** Hàm kiểm trường tham_chieu cho bộ lọc: "đường/dẫn:dòng" phải là TỆP CÓ THẬT (không phải liên kết) trong bản chụp, dòng không vượt số dòng của tệp. */
  function taoKiemThamChieu(ban) {
    return (ref) => {
      const m = String(ref).match(/^(.+?)(?::(\d{1,6})(?:-(\d{1,6}))?)?$/);
      if (!m) return false;
      const p = m[1].replace(/\\/g, '/').replace(/^\.\//, '');
      if (p.startsWith('/') || p.includes('..') || p.length > 160) return false;
      if (m[2] && m[3] && +m[3] < +m[2]) return false;
      const dong = m[3] ? +m[3] : (m[2] ? +m[2] : 0);
      for (const b of ban) {
        let rel = p;
        for (const tienTo of [b.repo + '/' + b.sha + '/', b.repo + '/current/', b.repo + '/']) if (rel.startsWith(tienTo)) { rel = rel.slice(tienTo.length); break; }
        const full = path.resolve(b.thuMuc, rel);
        if (!full.startsWith(b.thuMuc + path.sep)) continue;
        let st; try { st = fs.lstatSync(full); } catch (e) { continue; }
        if (!st.isFile() || st.size > 4 * 1024 * 1024) continue;
        if (!dong) return true;
        try { const txt = fs.readFileSync(full, 'utf8'); let n = 1; for (let i = 0; i < txt.length; i++) if (txt.charCodeAt(i) === 10) n++; if (dong <= n) return true; } catch (e) { /* tệp không đọc được: thử repo khác */ }
      }
      return false;
    };
  }

  /** Thực hiện một lần gọi tool. Trả { kq (khuôn MCP), log }. */
  async function goiTool(nguoi, ten, args) {
    const t = Object.prototype.hasOwnProperty.call(DS, ten) ? DS[ten] : null;
    if (!t) return { kq: loiTool('Tool không tồn tại: ' + String(ten).slice(0, 40)), log: { ma: 'khong-co-tool' } };
    let n;
    try { n = t.kiemDauVao(args, cfg); } catch (e) { if (e instanceof LoiDauVao) return { kq: loiTool(e.message), log: { ma: 'dau-vao', args: JSON.stringify(args || {}).slice(0, 300) } }; throw e; }
    const log = { args: JSON.stringify(n).slice(0, 300) };
    const ban = (n.repo ? [n.repo] : cfg.repo).map(banChupHienTai).filter(Boolean);
    if (!ban.length) return { kq: loiTool('Bản chụp mã nguồn chưa sẵn sàng — báo người phụ trách (Jenkins chưa xuất bản chụp).'), log: Object.assign(log, { ma: 'chua-co-ban-chup' }) };
    const banMa = ban.map(b => b.repo + '@' + b.sha.slice(0, 12)).join(', ');
    const khoa = bam(ten + '|' + t.khoaCache(n) + '|' + ban.map(b => b.repo + '@' + b.sha).join(','));
    const c = docCache(khoa);
    if (c) return { kq: vanBan(dinhDang(c)), log: Object.assign(log, { ma: 'ok', cache: true, banMa }) };

    // Cùng câu hỏi đang được phân tích (bởi người khác hoặc chính người này): chờ chung kết quả, không chạy thêm worker / không tốn thêm hạn mức.
    const dangCo = dangChayKhoa.get(khoa);
    if (dangCo) { const r = await dangCo.catch(() => null); if (r && !r.kq.isError) return { kq: r.kq, log: Object.assign(log, { ma: 'ok', cache: 'cho-chung', banMa }) }; }

    if ((dangChayNguoi.get(nguoi) || 0) >= cfg.gioiHan.dongThoiMoiNguoi) return { kq: loiTool('Bạn đang có ' + cfg.gioiHan.dongThoiMoiNguoi + ' phân tích chạy dở — chờ xong rồi hỏi tiếp.'), log: Object.assign(log, { ma: 'qua-dong-thoi' }) };
    dangChayNguoi.set(nguoi, (dangChayNguoi.get(nguoi) || 0) + 1);
    const chay = chayMoi();
    dangChayKhoa.set(khoa, chay);
    try { return await chay; }
    finally { dangChayKhoa.delete(khoa); const x = (dangChayNguoi.get(nguoi) || 1) - 1; if (x > 0) dangChayNguoi.set(nguoi, x); else dangChayNguoi.delete(nguoi); }

    async function chayMoi() {
      const cham = hanMuc.worker(nguoi);
      if (cham) return { kq: loiTool(cham), log: Object.assign(log, { ma: 'het-han-muc-worker' }) };
      let chiMuc;
      try { const ds = []; for (const b of ban) ds.push(await layChiMuc(b)); chiMuc = { soTrung: (x) => ds.reduce((a, d) => a + d.soTrung(x), 0) }; }
      catch (e) { return { kq: loiTool('Cổng tạm thời không kiểm được bản chụp (chỉ mục) — thử lại sau / báo người phụ trách.'), log: Object.assign(log, { ma: 'loi-chi-muc', chiTiet: String(e.message).slice(0, 160) }) }; }

      const yeuCau = (phanHoi) => ({ tool: ten, nhiemVu: t.nhiemVu(n), args: n, repos: ban.map(b => ({ ten: b.repo, duongDan: b.duongDan, sha: b.sha, thuMuc: b.thuMuc })), thuMucGoc: path.resolve(cfg.banChup.thuMuc), luocDo: t.luocDo, phanHoi: phanHoi || '', cauHinhWorker: cfg.worker.claude });
      const kiemThamChieu = taoKiemThamChieu(ban);
      let raw, kqLoc, lanThu = 0;
      try {
        for (;;) {
          lanThu++;
          if (lanThu > 1) { const c2 = hanMuc.worker(nguoi); if (c2) return { kq: loiTool(c2), log: Object.assign(log, { ma: 'het-han-muc-worker', banMa }) }; }   // viết lại cũng là một lượt worker (tốn tiền)
          raw = await hangDoi(() => chayWorker(cfg, yeuCau(lanThu > 1 ? 'Kết quả lần trước bị bộ lọc từ chối. Viết lại BẰNG LỜI, không chép mã, không cấu hình, không bí mật.' : '')));
          hanMuc.luu();
          kqLoc = loc(raw.ket, t.luocDo, { chiMuc, cfg: cfg.loc, kiemThamChieu });
          if (kqLoc.ok || lanThu >= 2 || kqLoc.ma === 'loi-loc') break;
        }
      } catch (e) {
        if (e instanceof LoiWorker) return { kq: loiTool(e.ma === 'ban' ? 'Hệ thống đang bận, thử lại sau ít phút.' : 'Worker phân tích gặp sự cố — thử lại; vẫn lỗi thì báo người phụ trách.'), log: Object.assign(log, { ma: 'loi-worker-' + e.ma, chiTiet: String(e.stderr || e.message).slice(0, 200), banMa }) };
        throw e;
      }
      Object.assign(log, { banMa, soLanWorker: lanThu, chiPhiUsd: raw && raw.meta && raw.meta.chiPhiUsd });
      if (!kqLoc.ok) return { kq: loiTool('Kết quả bị bộ lọc an toàn từ chối. Hãy hỏi cụ thể hơn, bằng lời, về luồng / quy tắc — không đòi mã nguồn.'), log: Object.assign(log, { ma: 'bi-loc-tu-choi', lyDo: kqLoc.lyDo }) };
      const v = { ket: kqLoc.ket, banMa, tao: new Date().toISOString() };
      ghiCache(khoa, v);
      return { kq: vanBan(dinhDang(v)), log: Object.assign(log, { ma: 'ok', cache: false, daChe: kqLoc.daChe.map(x => x.lop).join(',') }) };
    }
  }

  function tra(res, ma, noiDung, kieu, them) {
    const b = Buffer.from(noiDung === undefined ? '' : (typeof noiDung === 'string' ? noiDung : JSON.stringify(noiDung)));
    res.writeHead(ma, Object.assign({ 'Content-Type': kieu || 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, them || {}));
    res.end(b);
    return b.length;
  }
  const rpcLoi = (res, id, ma, msg, http_) => tra(res, http_ || 200, { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: ma, message: msg } });
  function docThan(req) {
    return new Promise((res, rej) => {
      const ch = []; let n = 0;
      let qua = false;
      req.on('data', (c) => { n += c.length; if (qua) return; if (n > TOI_DA_THAN) { qua = true; ch.length = 0; rej(Object.assign(new Error('Thân yêu cầu quá lớn'), { ma: 413 })); } else ch.push(c); });   // quá lớn: bỏ phần còn lại (xả), vẫn trả được 413
      req.on('end', () => res(Buffer.concat(ch).toString('utf8')));
      req.on('error', rej);
    });
  }

  async function handler(req, res) {
    const bat = Date.now(); const ip = req.socket.remoteAddress || '';
    let nguoi = null, log = {}, ma = 0, khongLog = false;
    try {
      if (req.headers.origin) { ma = 403; tra(res, 403, 'Từ chối', 'text/plain; charset=utf-8'); return; }   // chống DNS rebinding: máy khách MCP không gửi Origin
      const u = new URL(req.url, 'http://x');
      if (req.method === 'GET' && u.pathname === '/health') { khongLog = true; ma = 200; tra(res, 200, 'ok\n', 'text/plain; charset=utf-8'); return; }
      if (u.pathname !== '/mcp') { ma = 404; tra(res, 404, 'Không có', 'text/plain; charset=utf-8'); return; }
      if (req.method !== 'POST') { ma = 405; tra(res, 405, 'Chỉ nhận POST', 'text/plain; charset=utf-8', { Allow: 'POST' }); return; }

      const s = saiTheoIp.get(ip);
      if (s && Date.now() - s.t < 60000 && s.n >= 10) { ma = 429; tra(res, 429, 'Quá nhiều lần xác thực sai — chờ 1 phút.', 'text/plain; charset=utf-8'); return; }
      const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S{8,512})$/);
      let than;
      try { than = await docThan(req); } catch (e) { ma = e.ma || 400; tra(res, ma, 'Yêu cầu không hợp lệ', 'text/plain; charset=utf-8', { Connection: 'close' }); return; }
      if (!m) { ma = 401; tra(res, 401, 'Thiếu token Jira (Authorization: Bearer …)', 'text/plain; charset=utf-8'); return; }

      let xt;
      try { xt = await xacThuc(m[1]); } catch (e) { ma = 502; log.chiTiet = String(e.message).slice(0, 100); tra(res, 502, 'Không xác thực được với Jira lúc này — thử lại sau.', 'text/plain; charset=utf-8'); return; }
      if (!xt.ok) {
        ma = xt.ma;
        if (saiTheoIp.size > 5000) { const t1 = Date.now(); for (const [k, v] of saiTheoIp) if (t1 - v.t > 60000) saiTheoIp.delete(k); }
        if (xt.ma === 401) { const t0 = Date.now(); const cu = saiTheoIp.get(ip); saiTheoIp.set(ip, cu && t0 - cu.t < 60000 ? { n: cu.n + 1, t: cu.t } : { n: 1, t: t0 }); }
        tra(res, xt.ma, xt.lyDo, 'text/plain; charset=utf-8'); return;
      }
      nguoi = xt.nguoi;

      let rpc; try { rpc = JSON.parse(than); } catch (e) { ma = 400; rpcLoi(res, null, -32700, 'JSON không hợp lệ', 400); return; }
      if (!rpc || typeof rpc !== 'object' || Array.isArray(rpc) || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') { ma = 400; rpcLoi(res, null, -32600, 'Yêu cầu JSON-RPC không hợp lệ (không nhận mảng / batch)', 400); return; }
      log.method = rpc.method;
      if (rpc.id === undefined) { ma = 202; tra(res, 202, ''); return; }   // thông báo (notifications/*): không trả lời

      const cham = hanMuc.yeuCau(nguoi);
      if (cham) { ma = 429; log.lyDo = 'het-han-muc'; if (rpc.method === 'tools/call') { ma = 200; tra(res, 200, { jsonrpc: '2.0', id: rpc.id, result: loiTool(cham) }); } else rpcLoi(res, rpc.id, -32000, cham, 429); return; }

      if (rpc.method === 'initialize') {
        const yc = rpc.params && rpc.params.protocolVersion;
        const kq = { protocolVersion: GIAO_THUC.includes(yc) ? yc : GIAO_THUC[0], capabilities: { tools: {} }, serverInfo: { name: 'code-insight', version: PHIEN_BAN }, instructions: 'Cổng này chỉ trả BẢN TÓM TẮT đã lọc về mã nguồn đang chạy trên DEV (không có mã nguyên văn). Ghi "bản mã" (repo@commit) vào báo cáo. Đừng đòi in nguyên tệp / cấu hình: sẽ bị từ chối.' };
        ma = 200; tra(res, 200, { jsonrpc: '2.0', id: rpc.id, result: kq }); return;
      }
      if (rpc.method === 'ping') { ma = 200; tra(res, 200, { jsonrpc: '2.0', id: rpc.id, result: {} }); return; }
      if (rpc.method === 'tools/list') { ma = 200; tra(res, 200, { jsonrpc: '2.0', id: rpc.id, result: { tools: danhSach() } }); return; }
      if (rpc.method === 'tools/call') {
        const p = rpc.params || {};
        const r = await goiTool(nguoi, String(p.name || ''), p.arguments);
        Object.assign(log, r.log, { tool: String(p.name || '').slice(0, 40) });
        const b = tra(res, 200, { jsonrpc: '2.0', id: rpc.id, result: r.kq }); ma = 200; hanMuc.byte(nguoi, b); return;
      }
      ma = 200; rpcLoi(res, rpc.id, -32601, 'Phương thức không được hỗ trợ'); return;
    } catch (e) {
      ma = 500; log.chiTiet = String(e && e.message || e).slice(0, 150);
      try { if (!res.headersSent) tra(res, 500, 'Lỗi cổng — báo người phụ trách', 'text/plain; charset=utf-8'); else res.end(); } catch (x) { /* đã đóng */ }
    } finally {
      if (!khongLog) nhatKy(Object.assign({ nguoi, ip: nguoi ? undefined : ip, http: ma, ms: Date.now() - bat }, log, { ma: log.ma || ma }));
    }
  }

  return { handler, hanMuc, banChupHienTai, xacThucNho };
}

/* ---------------- --kiem và chạy ---------------- */
async function kiemNoi(cfg) {
  const ra = [];
  try { const r = await jiraGet(cfg, '/rest/api/2/serverInfo', 'x'); ra.push('Jira ' + cfg.jira.url + ': HTTP ' + r.s + ' (200 / 401 đều là nối được)'); } catch (e) { ra.push('Jira ' + cfg.jira.url + ': KHÔNG nối được (' + String(e.message).slice(0, 80) + ')'); }
  const t = taoMayChu(Object.assign({}, cfg, { nhatKy: '', trangThaiHanMuc: '' }));
  for (const r of cfg.repo) { const b = t.banChupHienTai(r); ra.push('Bản chụp ' + r + ': ' + (b ? 'OK @' + b.sha.slice(0, 12) : 'CHƯA CÓ ' + path.join(cfg.banChup.thuMuc, r, 'current'))); }
  return ra;
}

/** --thu-claude: chạy ĐÚNG lệnh docker của worker với một câu hỏi tầm thường, in lỗi thật (stderr) — để quản trị biết Claude trong container có đăng nhập / chạy được không. */
function thuClaude(cfg) {
  const d = Object.assign({ anh: 'insight-worker:latest' }, (cfg.worker.claude && cfg.worker.claude.docker) || {});
  const args = ['run', '--rm', '-i', ...(typeof process.getuid === 'function' ? ['--user', process.getuid() + ':' + process.getgid()] : []), '--tmpfs', '/tmp:rw,size=256m', '-e', 'HOME=/tmp/home', '-e', 'CLAUDE_CODE_OAUTH_TOKEN', '-e', 'ANTHROPIC_API_KEY', d.anh, 'claude', '-p', 'Chỉ trả lời đúng một từ: OK', '--output-format', 'json'];
  console.log('Biến môi trường: CLAUDE_CODE_OAUTH_TOKEN ' + (process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'có' : 'KHÔNG CÓ') + ' · ANTHROPIC_API_KEY ' + (process.env.ANTHROPIC_API_KEY ? 'có' : 'không có'));
  const r = require('child_process').spawnSync('docker', args, { encoding: 'utf8', timeout: 180000, env: process.env });
  console.log('docker thoát mã ' + r.status + (r.error ? ' (' + r.error.message + ')' : ''));
  console.log('--- stdout (cuối) ---');
  console.log(String(r.stdout || '').slice(-900));
  console.log('--- stderr (cuối) ---');
  console.log(String(r.stderr || '').slice(-900));
}

/** --thu-worker: chạy MỘT lượt worker THẬT (như khi tester hỏi) trên repo đầu tiên có bản chụp, in kết quả thô hoặc lỗi chi tiết (stderr) — chưa qua bộ lọc, chỉ cho quản trị. */
async function thuWorker(cfg) {
  const t = taoMayChu(Object.assign({}, cfg, { nhatKy: '', trangThaiHanMuc: '' }));
  const ban = cfg.repo.map(t.banChupHienTai).filter(Boolean).slice(0, 1);
  if (!ban.length) { console.log('Chưa có bản chụp nào (chạy --kiem để xem).'); return; }
  const tool = DS.giai_thich_luong; const n = { cau_hoi: 'Giải thích ngắn gọn module này làm gì', repo: ban[0].repo };
  const yc = { tool: 'giai_thich_luong', nhiemVu: tool.nhiemVu(n), args: n, repos: ban.map(b => ({ ten: b.repo, duongDan: b.duongDan, sha: b.sha, thuMuc: b.thuMuc })), thuMucGoc: path.resolve(cfg.banChup.thuMuc), luocDo: tool.luocDo, phanHoi: '', cauHinhWorker: cfg.worker.claude };
  console.log('Chạy worker thật trên ' + ban[0].repo + '@' + ban[0].sha.slice(0, 12) + ' (tối đa ' + Math.round(cfg.worker.hetGioMs / 1000) + ' giây)…');
  const t0 = Date.now();
  try {
    const r = await chayWorker(cfg, yc);
    console.log('OK sau ' + Math.round((Date.now() - t0) / 1000) + ' giây. Chi phí: ' + JSON.stringify(r.meta));
    console.log('Kết quả thô (đầu): ' + JSON.stringify(r.ket).slice(0, 600));
  } catch (e) {
    console.log('LỖI (' + (e.ma || '?') + '): ' + e.message);
    if (e.stderr) { console.log('--- stderr của worker ---'); console.log(e.stderr); }
    console.log('Gợi ý: chạy thêm --thu-claude để thấy lỗi gốc của claude trong container.');
  }
}

async function main() {
  const a = process.argv.slice(2);
  const i = a.indexOf('--cau-hinh');
  if (i < 0 || !a[i + 1]) { console.error('Cách dùng: node server.js --cau-hinh <tệp.json> [--kiem]\nMẫu: tools/code-insight/cau-hinh.mau.json'); process.exit(2); }
  const cfg = docCauHinh(a[i + 1]);
  const loi = kiemCauHinh(cfg);
  if (loi.length) { console.error('CẤU HÌNH CHƯA ĐẠT:\n  - ' + loi.join('\n  - ')); process.exit(1); }
  if (a.includes('--kiem')) { console.log('Cấu hình hợp lệ. Thử nối:'); for (const l of await kiemNoi(cfg)) console.log('  ' + l); console.log('Repo phục vụ: ' + cfg.repo.join(', ') + ' · worker: ' + cfg.worker.lenh.join(' ') + ' · quyền: ' + cfg.quyen.kieu); return; }
  if (a.includes('--thu-claude')) { thuClaude(cfg); return; }
  if (a.includes('--thu-worker')) { await thuWorker(cfg); return; }
  const { handler, hanMuc } = taoMayChu(cfg);
  const tls = cfg.lang.tls.cert && cfg.lang.tls.key;
  const server = tls ? https.createServer({ cert: fs.readFileSync(cfg.lang.tls.cert), key: fs.readFileSync(cfg.lang.tls.key) }, handler) : http.createServer(handler);
  server.requestTimeout = 30000; server.headersTimeout = 30000;
  const thoat = () => { hanMuc.luu(); process.exit(0); };
  process.on('SIGINT', thoat); process.on('SIGTERM', thoat);
  const diaChi = cfg.lang.diaChi || '0.0.0.0';
  server.listen(cfg.lang.cong, diaChi, () => console.log('Code-Insight nghe ở ' + (tls ? 'https' : 'http (CHỈ ĐỂ THỬ, chỉ trên máy này)') + '://' + diaChi + ':' + cfg.lang.cong + '/mcp — ' + cfg.repo.length + ' repo'));
}

module.exports = { docCauHinh, kiemCauHinh, taoMayChu, chayWorker, MAC_DINH, tron };
if (require.main === module) main().catch((e) => { console.error('Lỗi: ' + (e && e.message || e)); process.exit(1); });
