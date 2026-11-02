#!/usr/bin/env node
/* dong-bo.js — ĐỒNG BỘ kit với nhánh main TỰ ĐỘNG, KHÔNG CONFLICT, tester KHÔNG phải biết git.
 *
 *   node dong-bo.js kiem [--nhanh] [--yen-lang]    CỔNG trước mỗi lượt chạy test: kit phải mới (≤ tuoiToiDaPhut phút). Cũ ⇒ tự kéo main về. Mã thoát 0 = cho chạy.
 *   node dong-bo.js cap-nhat [--yen-lang]          kéo main về ngay + làm nốt việc sau cập nhật (npm install, đăng ký lại hook khi cần)
 *   node dong-bo.js gui [--xem]                    gửi bài học trong hộp thư (~/.easypos-tester/bai-hoc-cho-gui) lên kho chung, đúng kênh an toàn
 *   node dong-bo.js trang-thai                     kit đang ở đâu so với main, hộp thư còn gì
 *
 * VÌ SAO KHÔNG CONFLICT:
 *  1. Tester không bao giờ sửa tệp được git theo dõi: kết quả (bao-cao/, test-results/…) nằm trong .gitignore; bài học đi qua hộp thư NGOÀI thư mục kit.
 *  2. Kéo về bằng `fetch` + `merge --ff-only` (chỉ tiến lên, không bao giờ tạo merge / conflict).
 *  3. Nếu vẫn có gì lạ (tệp bị sửa tay, đang ở nhánh khác, có commit cục bộ): SAO LƯU vào ~/.easypos-tester/sao-luu/<giờ>/ (patch + tham chiếu commit)
 *     rồi đưa thư mục về ĐÚNG origin/main. Không hỏi, không dừng, không mất dữ liệu.
 * VÌ SAO AN TOÀN:
 *  - Chỉ kéo nhánh main của đúng remote đã cấu hình (config/dong-bo.json); không chạy lệnh nào từ nội dung kéo về ngoài các bước sau cập nhật cố định.
 *  - Commit của bot nhận bài chỉ được phép chạm kien-thuc/; chạm chỗ khác ⇒ TỪ CHỐI cập nhật (mã 12).
 *  - Cập nhật chạm hooks/, tools/, e2e/lib/, rules/, config/… được in rõ ra ("CHẠM VÀO …") để không có thay đổi âm thầm.
 *  - Bài học gửi đi bị kiểm lại (cùng luật với máy chủ) và chỉ được thêm tệp mới dưới kien-thuc/bai/; máy chủ kiểm lần nữa rồi mới gộp vào main.
 * Mã thoát: 0 ổn · 10 cần làm nốt (chạy `cap-nhat`) · 11 không kéo được và đã quá hạn ngoại tuyến · 12 từ chối cập nhật đáng ngờ · 13 lỗi git bất thường · 2 sai cách dùng. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { git } = require('../lib/git');
const L = require('../lib/bai-hoc-lib');

const KIT = process.env.EP_KIT_DIR ? path.resolve(process.env.EP_KIT_DIR) : path.resolve(__dirname, '..', '..');
const STATE = process.env.EP_STATE_DIR ? path.resolve(process.env.EP_STATE_DIR) : path.join(os.homedir(), '.easypos-tester');
const F_TT = path.join(STATE, 'dong-bo.json');
const F_KHOA = path.join(STATE, 'dong-bo.lock');
const F_CHAY = path.join(STATE, 'chay-test.lock');
const HOP_THU = path.join(STATE, 'bai-hoc-cho-gui');
const DA_GUI = path.join(STATE, 'bai-hoc-da-gui');

const MAC_DINH = { nhanhChinh: 'main', remote: 'origin', remoteUrl: '', tienToHopThu: 'inbox', kenhGui: 'inbox', tuoiToiDaPhut: 30, choPhepNgoaiTuyenNgay: 3, timeoutFetchGiay: 25, timeoutGuiGiay: 60,
  toiDaCommitMoiLanKeo: 300, toiDaBaiMoiLanGui: 20, botEmail: 'easypos-kit-bot@users.noreply.github.com', botTen: 'easypos-kit-bot', duongNhayCam: [], duongBaiHoc: 'kien-thuc/bai/' };
let CFG = MAC_DINH;
try { CFG = Object.assign({}, MAC_DINH, JSON.parse(fs.readFileSync(path.join(KIT, 'config', 'dong-bo.json'), 'utf8'))); } catch (e) { /* dùng mặc định */ }

const args = process.argv.slice(2);
const lenh = args[0];
const YEN = args.includes('--yen-lang');
const NHANH = args.includes('--nhanh');
const in_ = (s) => { if (!YEN) console.log(s); };
const canh = (s) => console.log('  [!] ' + s);
const loiIn = (s) => console.error(s);
const G = (a, o) => git(a, Object.assign({ cwd: KIT }, o || {}));

/* ---------- vai trò máy ----------
 * 'tester'   : máy tester (setup.js ghi dấu khi cài / cập nhật): được TỰ ĐƯA thư mục về đúng origin/main nếu có thay đổi lạ (sau khi sao lưu) — đây là cách bảo đảm không conflict.
 * khác / thiếu: máy người phụ trách hoặc chưa cài dấu: KHÔNG BAO GIỜ tự ghi đè công việc đang dở; chỉ kéo khi tiến lên sạch (ff-only), còn lại chỉ báo.
 * Chủ động chấp nhận ghi đè (sau sao lưu) trên một máy bất kỳ: thêm --chap-nhan-sao-luu. */
function vaiTro() {
  if (process.env.EP_DONG_BO_VAI_TRO) return process.env.EP_DONG_BO_VAI_TRO;
  try { return JSON.parse(fs.readFileSync(path.join(STATE, 'dong-bo-che-do.json'), 'utf8')).vaiTro || ''; } catch (e) { return ''; }
}
// Vai trò phu-trach THẮNG mọi cờ: người phụ trách bấm nhầm CAP-NHAT.cmd cũng không mất công việc dở.
const DUOC_GHI_DE = () => vaiTro() === 'tester' || (args.includes('--chap-nhan-sao-luu') && vaiTro() !== 'phu-trach');

/* ---------- địa chỉ kho (remote) ----------
 * Máy tester có thể được cài từ GitHub (origin = GitHub) hoặc clone từ Bitbucket (origin = Bitbucket); tên remote trong cấu hình ("bitbucket") có thể CHƯA CÓ trên máy đó
 * ⇒ trước đây dong-bo báo "chưa có remote" (mã 13) và bài học không bao giờ lên được kho. Nay cấu hình khai remoteUrl (https://…):
 *   1. đã có remote nào TRỎ ĐÚNG địa chỉ đó (dù tên gì, vd origin) ⇒ dùng remote đó;
 *   2. chưa có remote tên cấu hình ⇒ tự THÊM (git remote add);
 *   3. remote tên cấu hình đang trỏ chỗ khác ⇒ máy tester: đổi địa chỉ; máy phụ trách: chỉ cảnh báo (không đụng).
 * Chỉ nhận địa chỉ https (cấu hình đến từ main đã được người phụ trách duyệt). Không có remoteUrl ⇒ hành vi cũ. */
const chuanUrl = (u) => String(u || '').trim().replace(/^(https?:\/\/)[^@/]*@/i, '$1').replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
function damBaoRemote(chiTim) {
  const url = String(CFG.remoteUrl || '').trim();
  if (!url) return;
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/[\w./~-]+$/.test(url)) { if (!chiTim) canh('config/dong-bo.json: remoteUrl không hợp lệ (chỉ nhận https://…) — bỏ qua.'); return; }
  const ds = G(['remote', '-v']).out.split('\n').map(l => l.match(/^(\S+)\s+(\S+) \(fetch\)$/)).filter(Boolean).map(m => ({ ten: m[1], url: m[2] }));
  const khop = ds.find(d => chuanUrl(d.url) === chuanUrl(url));
  if (khop) { CFG.remote = khop.ten; return; }
  if (chiTim) return;
  if (!ds.some(d => d.ten === CFG.remote)) {
    const r = G(['remote', 'add', CFG.remote, url]);
    if (r.ok) canh('Kit chưa có remote "' + CFG.remote + '" — đã tự thêm trỏ ' + url + '.'); else loiIn('Không thêm được remote "' + CFG.remote + '": ' + r.err.split('\n')[0]);
    return;
  }
  if (DUOC_GHI_DE()) { const r = G(['remote', 'set-url', CFG.remote, url]); if (r.ok) canh('Remote "' + CFG.remote + '" đang trỏ chỗ khác — đã đổi sang ' + url + ' theo config/dong-bo.json.'); }
  else canh('Remote "' + CFG.remote + '" không trỏ ' + url + ' (cấu hình mong muốn) — máy này không phải máy tester nên KHÔNG tự đổi.');
}
function tenKho() { const u = G(['remote', 'get-url', CFG.remote]).out; return /github\.com/i.test(u) ? 'GitHub' : /git-sds|bitbucket/i.test(u) ? 'Bitbucket' : 'kho git'; }

/* ---------- trạng thái ---------- */
function docTT() { try { return JSON.parse(fs.readFileSync(F_TT, 'utf8')); } catch (e) { return {}; } }
function ghiTT(tt) { try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(F_TT, JSON.stringify(tt, null, 1)); } catch (e) { /* không ghi được thì lần sau kiểm lại */ } }
const ngu = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) { /* bỏ qua */ } };
const song = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Khoá để hai tiến trình không cùng kéo về một lúc. Trả hàm nhả khoá; null nếu bận quá 20 giây. */
function layKhoa() {
  fs.mkdirSync(STATE, { recursive: true });
  for (let i = 0; i < 20; i++) {                       // chờ tối đa ~10 giây (+ fetch 25 giây phải còn dưới hạn 55 giây của hook)
    try {
      const fd = fs.openSync(F_KHOA, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() })); fs.closeSync(fd);
      return () => { try { fs.unlinkSync(F_KHOA); } catch (e) { /* đã nhả */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') return () => {};
      try {
        const t = JSON.parse(fs.readFileSync(F_KHOA, 'utf8'));
        if (Date.now() - t.ts > 10 * 60 * 1000 || !song(t.pid)) { fs.unlinkSync(F_KHOA); continue; }
      } catch (e2) {
        // Tệp khoá rỗng / dở dang: tiến trình kia có thể ĐANG ghi (khe giữa tạo tệp và ghi nội dung) — chỉ gỡ khi tệp đã cũ (> 5 giây), còn mới thì chờ.
        try { if (Date.now() - fs.statSync(F_KHOA).mtimeMs > 5000) { fs.unlinkSync(F_KHOA); continue; } } catch (e3) { continue; }
      }
      ngu(500);
    }
  }
  return null;
}
/** Đang có lượt chạy test? (globalSetup của Playwright ghi khoá này) — không kéo mã giữa chừng một lượt chạy. */
function dangChayTest() {
  try { const t = JSON.parse(fs.readFileSync(F_CHAY, 'utf8')); return song(t.pid) && Date.now() - t.ts < 90 * 60 * 1000; } catch (e) { return false; }
}

/* ---------- phân tích git ---------- */
const chuanHoa = (p) => path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
/** 'clone' (git chạy được, gốc repo = thư mục kit) · 'khong-phai-git' (không có .git: cài từ zip) · 'loi-git' (CÓ .git nhưng git lỗi: không có git, "dubious ownership", gốc repo lệch…).
 *  'loi-git' KHÔNG được coi như bản zip: cổng phải vẫn áp dụng (xem ngoaiTuyen) chứ không âm thầm tắt. */
function kieuKho() {
  let coGit = false;
  try { coGit = fs.existsSync(path.join(KIT, '.git')); } catch (e) { /* coi như không có */ }
  const r = G(['rev-parse', '--show-toplevel']);
  if (r.ok) {
    const goc = (() => { try { return fs.realpathSync(r.out); } catch (e) { return r.out; } })();
    const kit = (() => { try { return fs.realpathSync(KIT); } catch (e) { return KIT; } })();
    if (chuanHoa(goc) === chuanHoa(kit) || chuanHoa(r.out) === chuanHoa(KIT)) return { kieu: 'clone' };
    return coGit ? { kieu: 'loi-git', err: 'gốc repo git (' + r.out + ') khác thư mục kit (' + KIT + ') — thư mục kit nằm trong repo khác / liên kết thư mục?' } : { kieu: 'khong-phai-git' };
  }
  return coGit ? { kieu: 'loi-git', err: r.err || 'git lỗi' } : { kieu: 'khong-phai-git' };
}
function laBanClone() { return kieuKho().kieu === 'clone'; }
const ref = (x) => G(['rev-parse', '--verify', '--quiet', x]).out;
const ngan = (s) => String(s || '').slice(0, 8);

function gioHienTai() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }

/** Sao lưu mọi thứ cục bộ có thể mất trước khi đưa thư mục về origin/main. Trả đường dẫn thư mục sao lưu. */
function saoLuu(lyDo, remoteRef) {
  const dir = path.join(STATE, 'sao-luu', gioHienTai());
  fs.mkdirSync(dir, { recursive: true });
  const ghiChu = ['Lý do: ' + lyDo, 'Nhánh: ' + G(['rev-parse', '--abbrev-ref', 'HEAD']).out, 'HEAD: ' + ref('HEAD'), 'origin/main: ' + ref(remoteRef)];
  const patch = G(['diff', 'HEAD', '--binary']);
  if (patch.ok && patch.out.trim()) { fs.writeFileSync(path.join(dir, 'thay-doi.patch'), patch.out + '\n'); ghiChu.push('Đã lưu thay đổi tệp theo dõi: thay-doi.patch (khôi phục: git apply <tệp>)'); }
  const tren = G(['rev-list', '--count', remoteRef + '..HEAD']);
  if (tren.ok && +tren.out > 0) { G(['update-ref', 'refs/sao-luu/' + gioHienTai(), 'HEAD']); ghiChu.push(tren.out + ' commit cục bộ được giữ tại refs/sao-luu/' + gioHienTai() + ' (xem: git log refs/sao-luu/…)'); }
  // Tệp chưa theo dõi mà trùng đường dẫn với tệp trong origin/main sẽ bị ghi đè: chép trước.
  const chuaTheoDoi = G(['ls-files', '--others', '--exclude-standard']);
  if (chuaTheoDoi.ok && chuaTheoDoi.out) {
    const trongRemote = new Set(G(['ls-tree', '-r', '--name-only', remoteRef]).out.split('\n'));
    let dem = 0;
    for (const f of chuaTheoDoi.out.split('\n')) {
      if (!trongRemote.has(f) || dem >= 50) continue;
      try { const dich = path.join(dir, 'chua-theo-doi', f); fs.mkdirSync(path.dirname(dich), { recursive: true }); fs.copyFileSync(path.join(KIT, f), dich); dem++; } catch (e) { /* bỏ qua tệp không chép được */ }
    }
    if (dem) ghiChu.push(dem + ' tệp chưa theo dõi trùng đường dẫn đã được chép vào chua-theo-doi/');
  }
  fs.writeFileSync(path.join(dir, 'ghi-chu.txt'), ghiChu.join('\n') + '\n');
  return dir;
}

/** Kiểm các commit sắp kéo về. Trả danh sách lý do từ chối (rỗng = ổn). */
function kiemCommitMoi(dsCommit) {
  const tuChoi = [];
  for (const c of dsCommit) {
    if (c.email.toLowerCase() !== String(CFG.botEmail).toLowerCase()) continue;
    const f = G(['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '--root', c.sha]);
    const ngoai = f.out.split('\n').filter(x => x && !x.startsWith('kien-thuc/'));
    if (ngoai.length) tuChoi.push(`commit ${ngan(c.sha)} của bot nhận bài học nhưng chạm vào ngoài kien-thuc/: ${ngoai.slice(0, 3).join(', ')}`);
  }
  return tuChoi;
}

/* ---------- sau cập nhật ---------- */
function chayLenhDai(cmd, cmdArgs, cwd, timeoutMs) {
  const win = process.platform === 'win32';
  const laCmd = win && (cmd === 'npm' || cmd === 'npx');          // npm / npx trên Windows là tệp .cmd: cần shell (lệnh và tham số do kit cố định, không lấy từ nội dung kéo về)
  const r = spawnSync(laCmd ? cmd + '.cmd' : cmd, cmdArgs, { cwd, encoding: 'utf8', timeout: timeoutMs, shell: laCmd, windowsHide: true });
  return { ok: r.status === 0 && !r.error, out: String(r.stdout || '') + String(r.stderr || '') };
}
function viecSauCapNhat(dsTep, khacBiet) {
  const can = [];
  if (dsTep.includes('e2e/package.json')) can.push('npm-install');
  if (dsTep.includes('hooks/hooks.json') || dsTep.includes('setup.js')) can.push('dang-ky-hook');
  if (can.includes('npm-install') && /@playwright\/test/.test(khacBiet.filter(l => /^[+-]\s*"@playwright\/test"/.test(l)).join('\n'))) can.push('playwright-install');
  return can;
}
/** Làm các việc sau cập nhật. Trả { dong: [dòng thông báo], conLai: [việc CHƯA thành công] } — việc lỗi vẫn nằm trong canXuLy (cổng không mở khi còn thiếu thư viện / trình duyệt). */
function lamViecSauCapNhat(can) {
  const dong = [], conLai = [];
  if (process.env.EP_BO_QUA_HAU_CAN === '1') return { dong: ['(bỏ qua việc sau cập nhật: ' + can.join(', ') + ')'], conLai: [] };
  const buoc = {
    'npm-install': ['npm', ['install', '--no-audit', '--no-fund'], path.join(KIT, 'e2e'), 10 * 60 * 1000, 'npm install (e2e)', 'cd e2e && npm install'],
    'dang-ky-hook': ['node', [path.join(KIT, 'setup.js'), '--global-hooks'], KIT, 90 * 1000, 'đăng ký lại hook (setup.js) — mở cuộc trò chuyện Claude MỚI để hook mới có hiệu lực', 'node setup.js --global-hooks'],
    'playwright-install': ['npx', ['playwright', 'install', 'chromium'], path.join(KIT, 'e2e'), 10 * 60 * 1000, 'cài trình duyệt Playwright', 'cd e2e && npx playwright install'],
  };
  for (const v of can) {
    const b = buoc[v];
    if (!b) continue;
    const r = chayLenhDai(b[0], b[1], b[2], b[3]);
    dong.push((r.ok ? '[OK] ' : '[!] ') + b[4] + (r.ok ? '' : ' — LỖI, chạy tay: ' + b[5]));
    if (!r.ok) conLai.push(v);
  }
  return { dong, conLai };
}
function donDepDaGui() {
  try {
    const trongKho = new Set(L.docKho(path.join(KIT, 'kien-thuc')).map(b => b.id));
    for (const f of fs.existsSync(DA_GUI) ? fs.readdirSync(DA_GUI) : []) if (trongKho.has(f.replace(/\.md$/, ''))) fs.unlinkSync(path.join(DA_GUI, f));
  } catch (e) { /* dọn dẹp không quan trọng */ }
}

/* ---------- cập nhật chính ---------- */
function capNhat() {
  const tt = docTT();
  const kho = kieuKho();
  if (kho.kieu === 'khong-phai-git') { canh('Kit KHÔNG phải bản clone git (cài từ zip?) nên KHÔNG tự cập nhật. Muốn có bản mới: tải zip mới rồi bấm CAI-DAT.cmd (báo cáo của bạn được giữ nguyên), hoặc nhờ người phụ trách cài lại bằng git clone.'); return 0; }
  if (kho.kieu === 'loi-git') return ngoaiTuyen(tt, { err: kho.err, status: 0 });   // CÓ .git mà git lỗi: không được âm thầm tắt cổng — áp dụng hạn ngoại tuyến
  damBaoRemote();
  const remote = CFG.remote, nhanh = CFG.nhanhChinh, remoteRef = `refs/remotes/${remote}/${nhanh}`;
  if (!G(['remote', 'get-url', remote]).ok) { canh(`Kit chưa có remote "${remote}" — không đồng bộ được.`); return 13; }
  if (dangChayTest()) { in_('Đang có một lượt chạy test — không cập nhật giữa chừng.'); return 0; }

  const nha = layKhoa();
  if (!nha) { in_('Đang có tiến trình khác cập nhật kit — dùng bản hiện tại.'); return 0; }
  try {
    const f = G(['fetch', '--quiet', '--no-tags', remote, `+refs/heads/${nhanh}:${remoteRef}`], { timeoutMs: CFG.timeoutFetchGiay * 1000 });
    if (!f.ok) return ngoaiTuyen(tt, f);
    const remoteSha = ref(remoteRef);
    if (!remoteSha) { loiIn(`Không thấy ${remote}/${nhanh} sau khi fetch.`); return 13; }
    const head = ref('HEAD');
    const nhanhHienTai = G(['rev-parse', '--abbrev-ref', 'HEAD']).out;
    const dirty = !!G(['status', '--porcelain', '--untracked-files=no']).out;
    const laTienToCuaRemote = G(['merge-base', '--is-ancestor', 'HEAD', remoteRef]).status === 0;

    // Không có gì mới trên main: KHÔNG đụng vào thư mục (kể cả khi có tệp theo dõi đang sửa dở — không được âm thầm hoàn tác công việc của người dùng).
    if (head === remoteSha && nhanhHienTai === nhanh) {
      ghiTT(Object.assign(tt, { thanhCongLuc: Date.now(), sha: head, thuLaiSau: 0 }));
      donDepDaGui();
      in_('Kit đã là bản mới nhất (' + ngan(head) + ').');
      return tt.canXuLy && tt.canXuLy.length && !NHANH ? xongViec(tt, []) : (tt.canXuLy && tt.canXuLy.length ? canXuLyThongBao(tt.canXuLy) : 0);
    }

    // Commit sắp kéo về
    // Kiểm TOÀN BỘ commit sắp kéo về (không cắt theo số lượng: tester vắng lâu có thể có hàng trăm commit hợp lệ mà không được phép bị kẹt vĩnh viễn).
    const log = G(['log', '--format=%H%x09%ae%x09%s', `${head}..${remoteRef}`]);
    const dsCommit = log.out ? log.out.split('\n').map(l => { const [sha, email, ...s] = l.split('\t'); return { sha, email: email || '', tieuDe: s.join('\t') }; }) : [];
    if (dsCommit.length > CFG.toiDaCommitMoiLanKeo) canh(`Kit đã lâu chưa cập nhật: ${dsCommit.length} commit mới (hơn ${CFG.toiDaCommitMoiLanKeo}). Mọi commit của bot nhận bài vẫn được kiểm từng cái.`);
    const tuChoi = kiemCommitMoi(dsCommit);
    if (tuChoi.length) { loiIn('TỪ CHỐI cập nhật kit (giữ nguyên bản hiện tại):\n  - ' + tuChoi.join('\n  - ') + '\nBáo người phụ trách kit.'); return 12; }

    // Cách kéo: (1) cố `merge --ff-only` trước — git GIỮ NGUYÊN thay đổi cục bộ không đụng tới tệp mới về, và tự từ chối nếu chồng lấn (kể cả tệp chưa theo dõi trùng đường dẫn).
    //           (2) chỉ khi (1) không được (lệch lịch sử, nhánh khác, chồng lấn): máy tester → SAO LƯU rồi đưa về đúng main; máy khác → chỉ báo, không đụng.
    let xong = false;
    const lyDoLech = [dirty ? 'có tệp theo dõi bị sửa' : '', !laTienToCuaRemote ? 'có commit cục bộ chưa có trên ' + nhanh : '', nhanhHienTai !== nhanh ? 'đang ở nhánh "' + nhanhHienTai + '"' : ''].filter(Boolean).join('; ');
    if (laTienToCuaRemote && nhanhHienTai === nhanh) {
      const r = G(['merge', '--ff-only', '--quiet', remoteRef]);
      if (r.ok) { xong = true; if (dirty) canh('Kit đang có tệp theo dõi bị sửa dở (không chồng lấn với bản mới) — đã GIỮ NGUYÊN và vẫn kéo bản mới. Lưu ý: bạn đang chạy kit đã sửa tay.'); }
    }
    if (!xong) {
      const lyDo = lyDoLech || 'bản mới chồng lấn với tệp cục bộ (tệp sửa dở / tệp chưa theo dõi trùng đường dẫn)';
      if (!DUOC_GHI_DE()) {
        canh('Kit có thay đổi cục bộ (' + lyDo + ') và máy này KHÔNG ở chế độ tự đưa về main (vai trò: ' + (vaiTro() || 'chưa đặt') + ') — KHÔNG cập nhật, không đụng vào công việc của bạn.');
        return 0;
      }
      const saoLuuDir = saoLuu(lyDo, remoteRef);
      const r = G(['checkout', '-f', '-B', nhanh, remoteRef]);
      if (!r.ok) { loiIn('Không đưa được kit về ' + remote + '/' + nhanh + ': ' + r.err.split('\n')[0]); return 13; }
      canh('Kit có thay đổi cục bộ (' + lyDo + ') — đã sao lưu vào ' + saoLuuDir + ' rồi đưa về đúng ' + remote + '/' + nhanh + '. Không cần làm gì thêm.');
    }
    const moi = ref('HEAD');
    const tepDoi = head === moi ? [] : G(['diff', '--name-only', head, moi]).out.split('\n').filter(Boolean);
    const khacBiet = tepDoi.includes('e2e/package.json') ? G(['diff', head, moi, '--', 'e2e/package.json']).out.split('\n') : [];
    const nhay = tepDoi.filter(p => (CFG.duongNhayCam || []).some(pre => p === pre || (pre.endsWith('/') ? p.startsWith(pre) : false)));
    const can = viecSauCapNhat(tepDoi, khacBiet);
    console.log(`Kit đã cập nhật ${ngan(head)} → ${ngan(moi)} (${dsCommit.length} commit mới):`);
    for (const c of dsCommit.slice(0, 8)) console.log(`   - ${ngan(c.sha)} ${c.tieuDe.slice(0, 90)}`);
    if (dsCommit.length > 8) console.log(`   … và ${dsCommit.length - 8} commit nữa`);
    if (nhay.length) console.log('   CHẠM VÀO (hook / công cụ / luật / cấu hình): ' + [...new Set(nhay.map(p => p.split('/').slice(0, 2).join('/')))].slice(0, 8).join(', '));
    // Hợp với việc còn treo từ lần cập nhật trước (không được ghi đè mất: vd package.json đổi rồi một commit bài học đến sau).
    const canTat = [...new Set([...(tt.canXuLy || []), ...can])];
    const ttMoi = Object.assign(tt, { thanhCongLuc: Date.now(), thuLaiSau: 0, sha: moi, canXuLy: canTat, capNhatCuoi: { luc: Date.now(), tu: ngan(head), den: ngan(moi), soCommit: dsCommit.length, nhayCam: nhay.length } });
    ghiTT(ttMoi);
    donDepDaGui();
    if (!canTat.length) return 0;
    if (NHANH) return canXuLyThongBao(canTat);
    return xongViec(ttMoi, []);
  } finally { nha(); }
}
function canXuLyThongBao(can) {
  loiIn('Kit vừa cập nhật và cần làm nốt (' + can.join(', ') + '). Chạy MỘT lần: node tools/tester/dong-bo.js cap-nhat   (khoảng 1–2 phút) rồi chạy lại.');
  return 10;
}
function xongViec(tt, canMoi) {
  const can = [...new Set([...(tt.canXuLy || []), ...canMoi])];
  const kq = lamViecSauCapNhat(can);
  for (const l of kq.dong) console.log('   ' + l);
  ghiTT(Object.assign(tt, { canXuLy: kq.conLai }));
  if (kq.conLai.length) { loiIn('Còn việc CHƯA làm được (' + kq.conLai.join(', ') + ') — lệnh chạy test vẫn bị chặn cho tới khi làm xong; làm theo dòng "LỖI, chạy tay" ở trên.'); return 10; }
  return 0;
}
function ngoaiTuyen(tt, f) {
  const tuoi = tt.thanhCongLuc ? (Date.now() - tt.thanhCongLuc) / 86400000 : Infinity;
  const xacThuc = /Authentication failed|could not read Username|terminal prompts disabled|Permission denied|403|401/i.test(f.err);
  const sohuu = /dubious ownership|safe\.directory/i.test(f.err);
  const khongCoGit = /ENOENT|not recognized|not found/i.test(f.err) && !f.status;
  const goiY = sohuu ? ' (Git từ chối vì thư mục kit thuộc tài khoản Windows khác: chạy MỘT lần `git config --global --add safe.directory "' + KIT.replace(/\\/g, '/') + '"`)'
    : khongCoGit ? ' (không tìm thấy lệnh git: cài Git for Windows rồi mở cửa sổ mới)'
    : xacThuc ? ' (có vẻ chưa đăng nhập ' + tenKho() + ': chạy MỘT lần `git fetch ' + CFG.remote + '` trong thư mục kit để Git nhớ tài khoản)' : ' (kiểm mạng / VPN)';
  // Lần sau (trong vài phút) không thử lại ngay: tránh mỗi lệnh chạy test lại chờ hết hạn fetch (~25 giây) khi đang mất mạng.
  if (tuoi <= CFG.choPhepNgoaiTuyenNgay) tt.thuLaiSau = Date.now() + 10 * 60000, ghiTT(tt);
  if (tuoi <= CFG.choPhepNgoaiTuyenNgay) { canh('Không kéo được bản mới của kit' + goiY + ' — dùng bản đã có (lần cập nhật cuối ' + (tuoi < 1 ? Math.round(tuoi * 24) + ' giờ' : tuoi.toFixed(1) + ' ngày') + ' trước, cho phép tối đa ' + CFG.choPhepNgoaiTuyenNgay + ' ngày).'); return 0; }
  loiIn('KHÔNG CHO CHẠY: không kéo được bản mới của kit' + goiY + ' và đã quá ' + CFG.choPhepNgoaiTuyenNgay + ' ngày chưa cập nhật.\n  Lỗi git: ' + f.err.split('\n')[0]);
  return 11;
}

function kiem() {
  if (process.env.EP_BO_QUA_DONG_BO === '1') { canh('ĐANG BỎ QUA kiểm cập nhật kit (EP_BO_QUA_DONG_BO=1) — bạn có thể đang chạy mã cũ.'); return 0; }
  const tt = docTT();
  if (laBanClone() && tt.sha && tt.sha === ref('HEAD') && tt.thanhCongLuc && Date.now() - tt.thanhCongLuc < CFG.tuoiToiDaPhut * 60000) {
    if (tt.canXuLy && tt.canXuLy.length) return canXuLyThongBao(tt.canXuLy);
    in_('Kit mới (' + ngan(tt.sha) + ', cập nhật ' + Math.round((Date.now() - tt.thanhCongLuc) / 60000) + ' phút trước).');
    return 0;
  }
  // Vừa thử mà không có mạng (và vẫn trong hạn ngoại tuyến): chưa thử lại ngay.
  if (tt.thuLaiSau && Date.now() < tt.thuLaiSau && tt.thanhCongLuc && (Date.now() - tt.thanhCongLuc) / 86400000 <= CFG.choPhepNgoaiTuyenNgay) {
    in_('Mới thử kéo kit mà không được (mất mạng?) — dùng bản hiện có, thử lại sau ' + Math.max(1, Math.round((tt.thuLaiSau - Date.now()) / 60000)) + ' phút.');
    return 0;
  }
  return capNhat();
}

/* ---------- gửi bài học ---------- */
function layTenTester() { return String(process.env.EP_TESTER || process.env.USERNAME || process.env.USER || 'tester').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'tester'; }

function gui() {
  const xem = args.includes('--xem');
  if (!laBanClone()) { loiIn('Kit không phải bản clone git — không gửi được.'); return 13; }
  const dsTep = fs.existsSync(HOP_THU) ? fs.readdirSync(HOP_THU).filter(f => f.endsWith('.md')).sort() : [];
  if (!dsTep.length) { console.log('Hộp thư trống — không có bài nào chờ gửi.'); return 0; }
  const hopLe = [], loi = [];
  for (const f of dsTep) {
    const p = path.join(HOP_THU, f);
    const noiDungTep = fs.readFileSync(p, 'utf8');
    const bai = L.phanTich(noiDungTep, { nhom: null, tep: p, nguon: 'cho-gui' });
    const id = f.replace(/\.md$/, '');
    const e = [...L.kiemTep(noiDungTep)];     // cùng kiểm cả tệp / mẫu cấm như máy chủ
    if (!L.RE_TEN_TEP_BAI.test(f)) e.push('tên tệp không đúng dạng BH-YYYYMMDD-xxxx.md');
    if (bai.length !== 1) e.push('tệp phải chứa đúng một bài');
    else { if (bai[0].id !== id) e.push('mã trong tệp khác tên tệp'); e.push(...L.kiemBai(bai[0])); }
    if (e.length) loi.push(`${f}: ${e.join('; ')}`); else hopLe.push({ f, p, id });
  }
  for (const l of loi) loiIn('  [bỏ qua] ' + l);
  if (!hopLe.length) { loiIn('Không có bài hợp lệ để gửi.'); return 13; }
  if (hopLe.length > CFG.toiDaBaiMoiLanGui) { canh(`Có ${hopLe.length} bài; mỗi lần gửi tối đa ${CFG.toiDaBaiMoiLanGui} — gửi ${CFG.toiDaBaiMoiLanGui} bài đầu.`); hopLe.length = CFG.toiDaBaiMoiLanGui; }
  console.log(`Sẽ gửi ${hopLe.length} bài lên nhánh ${CFG.tienToHopThu}/… của ${CFG.remote}:`);
  for (const b of hopLe) console.log('  + ' + b.id);
  if (xem) { console.log('(--xem: chưa gửi gì)'); return 0; }

  damBaoRemote();
  const url = G(['remote', 'get-url', CFG.remote]).out;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-gui-bai-'));
  const T = (a, o) => git(a, Object.assign({ cwd: tmp }, o || {}));
  try {
    for (const b of [['init', '-q'], ['remote', 'add', 'origin', url]]) { const r = T(b); if (!r.ok) { loiIn('git ' + b[0] + ' lỗi: ' + r.err); return 13; } }
    const f = T(['fetch', '--quiet', '--depth', '1', 'origin', `refs/heads/${CFG.nhanhChinh}`], { timeoutMs: CFG.timeoutGuiGiay * 1000 });
    if (!f.ok) return ngoaiTuyenGui(f);
    let r = T(['checkout', '-q', '-b', 'gui', 'FETCH_HEAD']); if (!r.ok) { loiIn('checkout lỗi: ' + r.err); return 13; }
    let them = 0;
    for (const b of hopLe) {
      const thang = b.id.slice(3, 7) + '-' + b.id.slice(7, 9);
      let dich = path.join(tmp, CFG.duongBaiHoc, thang, b.f);
      let noi = fs.readFileSync(b.p, 'utf8');
      if (fs.existsSync(dich)) {
        if (fs.readFileSync(dich, 'utf8').replace(/\s+$/, '') === noi.replace(/\s+$/, '')) continue;   // CÙNG nội dung đã có trên main (đã gộp trước đó)
        // Trùng MÃ nhưng nội dung KHÁC (hai máy bốc trúng cùng mã): đổi sang mã mới để bài không bị mất âm thầm.
        const idMoi = L.taoId(null, new Date(Date.UTC(+b.id.slice(3, 7), +b.id.slice(7, 9) - 1, +b.id.slice(9, 11))));
        noi = noi.replace('## ' + b.id, '## ' + idMoi);
        const fMoi = idMoi + '.md';
        dich = path.join(tmp, CFG.duongBaiHoc, thang, fMoi);
        canh(`Mã ${b.id} đã được bài KHÁC dùng trên main — gửi bài của bạn dưới mã mới ${idMoi}.`);
        try { fs.renameSync(b.p, path.join(HOP_THU, fMoi)); fs.writeFileSync(path.join(HOP_THU, fMoi), noi); b.f = fMoi; b.p = path.join(HOP_THU, fMoi); b.id = idMoi; } catch (e) { /* vẫn gửi được dưới mã mới; hộp thư cục bộ giữ mã cũ */ }
      }
      fs.mkdirSync(path.dirname(dich), { recursive: true }); fs.writeFileSync(dich, noi); them++;
    }
    if (them) {
      T(['add', '-A', CFG.duongBaiHoc]);
      const st = T(['diff', '--cached', '--name-status', '--no-renames']).out.split('\n').filter(Boolean);
      const lac = st.filter(l => !(/^A\t/.test(l) && l.split('\t')[1].startsWith(CFG.duongBaiHoc) && L.RE_TEN_TEP_BAI.test(path.basename(l.split('\t')[1]))));
      if (lac.length) { loiIn('Dừng: thay đổi chuẩn bị gửi chứa thứ ngoài kien-thuc/bai/ (không thể xảy ra bình thường):\n  ' + lac.join('\n  ')); return 13; }
      const ten = layTenTester();
      r = T(['-c', 'user.name=' + ten, '-c', 'user.email=' + ten + '@easypos-kit.local', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', `Bài học từ tester ${ten}: ${them} bài`]);
      if (!r.ok) { loiIn('commit lỗi: ' + r.err); return 13; }
      if (CFG.kenhGui === 'main-truc-tiep') {
        // Không có máy chủ nhận bài (vd Bitbucket): đẩy THẲNG lên main. Bài chỉ thêm tệp MỚI nên khi main đã có commit khác thì fetch lại + rebase rồi đẩy lại (tối đa 3 lần).
        for (let lan = 1; ; lan++) {
          r = T(['push', '--quiet', 'origin', `gui:refs/heads/${CFG.nhanhChinh}`], { timeoutMs: CFG.timeoutGuiGiay * 1000 });
          if (r.ok) break;
          if (lan >= 3 || !/rejected|non-fast-forward|fetch first/i.test(r.err)) return ngoaiTuyenGui(r);
          const f2 = T(['fetch', '--quiet', '--depth', '1', 'origin', `refs/heads/${CFG.nhanhChinh}`], { timeoutMs: CFG.timeoutGuiGiay * 1000 });
          if (!f2.ok) return ngoaiTuyenGui(f2);
          const rb = T(['-c', 'user.name=' + ten, '-c', 'user.email=' + ten + '@easypos-kit.local', 'rebase', 'FETCH_HEAD']);
          if (!rb.ok) { loiIn('Không rebase được bài học lên ' + CFG.nhanhChinh + ': ' + rb.err.split('\n')[0]); return 13; }
        }
        console.log(`✔ Đã đẩy ${them} bài học thẳng lên ${CFG.remote}/${CFG.nhanhChinh}; lần cập nhật sau bài sẽ về tới mọi máy.`);
      } else {
        const nhanhGui = `${CFG.tienToHopThu}/${ten}-${gioHienTai()}`;
        r = T(['push', '--quiet', 'origin', `gui:refs/heads/${nhanhGui}`], { timeoutMs: CFG.timeoutGuiGiay * 1000 });
        if (!r.ok) return ngoaiTuyenGui(r);
        console.log(`✔ Đã gửi ${them} bài lên ${nhanhGui}. Máy chủ sẽ kiểm lại và tự gộp vào ${CFG.nhanhChinh} (thường trong ~10 phút); lần cập nhật sau bài sẽ về tới mọi máy.`);
      }
    } else console.log('Các bài trong hộp thư đã có sẵn trên ' + CFG.nhanhChinh + ' — không cần gửi.');
    fs.mkdirSync(DA_GUI, { recursive: true });
    for (const b of hopLe) { try { fs.renameSync(b.p, path.join(DA_GUI, b.f)); } catch (e) { /* để lại, lần sau gửi lại cũng vô hại */ } }
    const tt = docTT(); tt.guiLuc = Date.now(); ghiTT(tt);
    return 0;
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* dọn thư mục tạm */ } }
}
function ngoaiTuyenGui(r) {
  const xacThuc = /Authentication failed|could not read Username|terminal prompts disabled|Permission denied|403|401|denied to/i.test(r.err);
  loiIn((xacThuc ? 'KHÔNG GỬI ĐƯỢC: tài khoản git trên máy này chưa đăng nhập hoặc chưa có quyền ghi ' + (CFG.kenhGui === 'main-truc-tiep' ? 'nhánh ' + CFG.nhanhChinh : 'nhánh inbox/') + '. ' : 'KHÔNG GỬI ĐƯỢC (mạng / máy chủ). ') + 'Bài vẫn nằm trong hộp thư, lần sau sẽ gửi lại.\n  Lỗi git: ' + r.err.split('\n')[0]);
  return 11;
}

function trangThai() {
  const tt = docTT();
  if (laBanClone()) damBaoRemote(true);
  console.log('Thư mục kit : ' + KIT);
  console.log('Vai trò máy : ' + (vaiTro() || 'chưa đặt (an toàn: không tự ghi đè)'));
  console.log('Là bản clone: ' + (laBanClone() ? 'có' : 'KHÔNG (cài từ zip?)'));
  if (laBanClone()) {
    console.log('Nhánh / HEAD: ' + G(['rev-parse', '--abbrev-ref', 'HEAD']).out + ' @ ' + ngan(ref('HEAD')));
    const rr = ref(`refs/remotes/${CFG.remote}/${CFG.nhanhChinh}`);
    if (rr) { const hon = G(['rev-list', '--count', `HEAD..${CFG.remote}/${CFG.nhanhChinh}`]).out, truoc = G(['rev-list', '--count', `${CFG.remote}/${CFG.nhanhChinh}..HEAD`]).out; console.log(`So với bản fetch gần nhất của ${CFG.remote}/${CFG.nhanhChinh}: chậm ${hon}, nhanh ${truoc} commit`); }
    console.log('Tệp theo dõi bị sửa: ' + (G(['status', '--porcelain', '--untracked-files=no']).out ? 'CÓ (giữ nguyên nếu không chồng lấn với bản mới; chồng lấn thì máy tester sao lưu rồi đưa về main, máy phụ trách chỉ báo)' : 'không'));
  }
  console.log('Cập nhật cuối: ' + (tt.thanhCongLuc ? new Date(tt.thanhCongLuc).toLocaleString('sv-SE') + ' (' + Math.round((Date.now() - tt.thanhCongLuc) / 60000) + ' phút trước)' : 'chưa lần nào'));
  if (tt.canXuLy && tt.canXuLy.length) console.log('CẦN LÀM NỐT   : ' + tt.canXuLy.join(', ') + '  → node tools/tester/dong-bo.js cap-nhat');
  const cho = fs.existsSync(HOP_THU) ? fs.readdirSync(HOP_THU).filter(f => f.endsWith('.md')).length : 0;
  console.log('Kho nhận bài   : ' + CFG.remote + ' (' + tenKho() + ') · nhánh ' + CFG.nhanhChinh + ' · kênh gửi: ' + CFG.kenhGui);
  console.log('Hộp thư bài học chờ gửi: ' + cho + (cho ? '  → node tools/tester/dong-bo.js gui' : ''));
  // Bài đã gửi lâu mà vẫn chưa về tới kho ⇒ có thể máy chủ đã loại (nhánh inbox-loi/…): không để bài mất âm thầm.
  let quaHan = 0;
  try { for (const f of fs.readdirSync(DA_GUI)) if (Date.now() - fs.statSync(path.join(DA_GUI, f)).mtimeMs > 2 * 86400000) quaHan++; } catch (e) { /* chưa có thư mục */ }
  console.log('Bài đã gửi nhưng chưa thấy trong main sau 2 ngày: ' + quaHan + (quaHan ? '  → có thể bị máy chủ loại (xem nhánh inbox-loi/ trên ' + tenKho() + '): báo người phụ trách' : ''));
  return 0;
}

/** Đặt vai trò máy: `dat-vai-tro tester` (tự đồng bộ, được ghi đè sau sao lưu) hoặc `dat-vai-tro phu-trach` (không bao giờ ghi đè công việc đang dở). */
function datVaiTro() {
  const v = args[1];
  if (!['tester', 'phu-trach'].includes(v)) { loiIn('Cách dùng: node dong-bo.js dat-vai-tro <tester|phu-trach>'); return 2; }
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(STATE, 'dong-bo-che-do.json'), JSON.stringify({ vaiTro: v }, null, 1) + '\n');
  console.log('Đã đặt vai trò máy = ' + v + (v === 'phu-trach' ? ' (kit sẽ KHÔNG tự ghi đè công việc đang dở trên máy này)' : ' (kit tự đồng bộ với main, thay đổi lạ được sao lưu rồi đưa về main)'));
  return 0;
}

const bang = { kiem, 'cap-nhat': capNhat, gui, 'trang-thai': trangThai, 'dat-vai-tro': datVaiTro };
if (!bang[lenh]) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 24).map(l => l.replace(/^ ?\* ?/, '').replace(/^\/\* ?/, '')).join('\n')); process.exit(lenh ? 2 : 0); }
let ma = 13;
try { ma = bang[lenh](); } catch (e) { loiIn('Lỗi bất thường: ' + (e && e.message)); ma = 13; }
process.exit(typeof ma === 'number' ? ma : 0);
