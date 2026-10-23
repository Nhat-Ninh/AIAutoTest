#!/usr/bin/env node
/* nhan-bai-hoc.js — MÁY CHỦ nhận bài học từ tester: kiểm lần nữa rồi tự gộp vào main. Chạy trong GitHub Actions theo lịch (workflow nhan-bai-hoc.yml),
 * HOẶC tay trên một bản clone của main: `node tools/ci/nhan-bai-hoc.js hop-nhat [--khong-day]`.
 *
 * Tester gửi lên nhánh inbox/<tên>-<giờ> (dong-bo.js gui). Với MỖI nhánh inbox/*, công cụ này:
 *   1. chỉ chấp nhận nhánh mà so với main CHỈ THÊM MỚI các tệp kien-thuc/bai/<yyyy-mm>/BH-<ngày>-<xxxx>.md (không sửa / xoá / đổi tên, không tệp nào khác,
 *      không liên kết tượng trưng, mỗi tệp ≤ 4 KB, tối đa vài commit và vài chục bài);
 *   2. đọc NỘI DUNG bằng `git show` (không checkout, không chạy mã trong nhánh) và kiểm bằng ĐÚNG luật của bai-hoc.js kiem: định dạng, bằng chứng, ngày, bí mật,
 *      mã không trùng bài nào trong main;
 *   3. đạt ⇒ ghi các tệp lên main bằng MỘT commit của bot (dễ `git revert`), đẩy main, xoá nhánh inbox;
 *      không đạt ⇒ đổi tên nhánh thành inbox-loi/… (giữ để người phụ trách xem) và in lý do.
 * Vì sao an toàn: mã chạy là mã của MAIN (đã được người phụ trách duyệt), không phải mã trong nhánh của tester; nội dung nhánh chỉ được đọc như dữ liệu.
 * Mã thoát: 0 xong (kể cả có nhánh bị loại) · 1 không đẩy được main / lỗi git. */
'use strict';
const fs = require('fs');
const path = require('path');
const { git } = require('../lib/git');
const L = require('../lib/bai-hoc-lib');

const KIT = process.env.EP_KIT_DIR ? path.resolve(process.env.EP_KIT_DIR) : process.cwd();
let CFG = { nhanhChinh: 'main', remote: 'origin', tienToHopThu: 'inbox', toiDaBaiMoiLanGui: 20, botEmail: 'easypos-kit-bot@users.noreply.github.com', botTen: 'easypos-kit-bot', duongBaiHoc: 'kien-thuc/bai/' };
try { CFG = Object.assign(CFG, JSON.parse(fs.readFileSync(path.join(KIT, 'config', 'dong-bo.json'), 'utf8'))); } catch (e) { /* mặc định */ }
const KHO = path.join(KIT, 'kien-thuc');
const G = (a, o) => git(a, Object.assign({ cwd: KIT, timeoutMs: 120000 }, o || {}));
const TOI_DA_BYTE = 4096;
const TOI_DA_COMMIT = 5;
const RE_DUONG = /^kien-thuc\/bai\/(\d{4})-(\d{2})\/(BH-(\d{4})(\d{2})\d{2}-[0-9a-f]{4,8})\.md$/;

/** Kiểm một nhánh inbox so với origin/main. Trả { loi: [], tep: [{duong, noiDung, id}] }. */
function kiemNhanh(nhanh, daCoId) {
  const loi = [], tep = [];
  const goc = G(['merge-base', `${CFG.remote}/${CFG.nhanhChinh}`, nhanh]);
  if (!goc.ok) return { loi: ['không có lịch sử chung với ' + CFG.nhanhChinh], tep };
  const soCommit = +G(['rev-list', '--count', `${goc.out}..${nhanh}`]).out;
  if (!(soCommit >= 1 && soCommit <= TOI_DA_COMMIT)) loi.push(`số commit ${soCommit} ngoài khoảng 1..${TOI_DA_COMMIT}`);
  const ds = G(['diff', '--name-status', '--no-renames', '--no-textconv', goc.out, nhanh]).out.split('\n').filter(Boolean);
  if (!ds.length) loi.push('không thay đổi gì');
  if (ds.length > CFG.toiDaBaiMoiLanGui) loi.push(`${ds.length} tệp, quá giới hạn ${CFG.toiDaBaiMoiLanGui}`);
  for (const dong of ds) {
    const truoc = loi.length;
    const [tt, duong] = dong.split('\t');
    const m = RE_DUONG.exec(duong || '');
    if (tt !== 'A') { loi.push(`${duong}: chỉ được THÊM MỚI tệp (trạng thái ${tt})`); continue; }
    if (!m) { loi.push(`${duong}: ngoài kien-thuc/bai/<yyyy-mm>/BH-<ngày>-<xxxx>.md`); continue; }
    if (m[1] !== m[4] || m[2] !== m[5]) { loi.push(`${duong}: thư mục tháng không khớp ngày trong mã bài`); continue; }
    const kieu = G(['ls-tree', nhanh, '--', duong]).out;
    if (!/^100644 blob /.test(kieu)) { loi.push(`${duong}: phải là tệp thường (không phải liên kết / tệp thực thi): ${kieu.slice(0, 20)}`); continue; }
    const kt = +G(['cat-file', '-s', `${nhanh}:${duong}`]).out;
    if (!(kt > 0 && kt <= TOI_DA_BYTE)) { loi.push(`${duong}: kích thước ${kt} byte ngoài 1..${TOI_DA_BYTE}`); continue; }
    const noiDung = G(['show', `${nhanh}:${duong}`]).out + '\n';
    for (const x of L.kiemTep(noiDung, duong)) loi.push(x);      // kiểm CẢ TỆP (chữ trước tiêu đề, bí mật NFC, thẻ, mẫu cấm): máy tester cũng đã kiểm, máy chủ KHÔNG tin
    const bai = L.phanTich(noiDung, { nhom: null, tep: duong, nguon: 'hop-thu' });
    if (bai.length !== 1) { loi.push(`${duong}: phải chứa đúng một bài (đang ${bai.length})`); continue; }
    const b = bai[0];
    if (b.id !== m[3]) loi.push(`${duong}: mã trong tệp (${b.id}) khác tên tệp`);
    if (daCoId.has(b.id)) loi.push(`${duong}: mã ${b.id} đã tồn tại`);
    for (const e of L.kiemBai(b, m[3])) loi.push(e);
    if (loi.length === truoc) tep.push({ duong, noiDung, id: b.id });
  }
  return { loi, tep };
}

function hopNhat(khongDay) {
  const f = G(['fetch', '--quiet', '--no-tags', '--prune', CFG.remote, `+refs/heads/${CFG.nhanhChinh}:refs/remotes/${CFG.remote}/${CFG.nhanhChinh}`, `+refs/heads/${CFG.tienToHopThu}/*:refs/remotes/${CFG.remote}/${CFG.tienToHopThu}/*`]);
  if (!f.ok) { console.error('fetch lỗi: ' + f.err); return 1; }
  const nhanhs = G(['for-each-ref', `refs/remotes/${CFG.remote}/${CFG.tienToHopThu}/`, '--format=%(refname:short)']).out.split('\n').filter(Boolean);
  if (!nhanhs.length) { console.log('Không có nhánh ' + CFG.tienToHopThu + '/* nào chờ nhận.'); return 0; }

  const daCoId = new Set(L.docKho(KHO).map(b => b.id));
  const hopLe = [], hong = [];
  for (const n of nhanhs) {
    const kq = kiemNhanh(n, daCoId);
    const ten = n.slice((CFG.remote + '/').length);
    if (kq.loi.length || !kq.tep.length) { hong.push({ ten, loi: kq.loi.length ? kq.loi : ['không có bài hợp lệ'] }); continue; }
    kq.tep.forEach(t => daCoId.add(t.id));
    hopLe.push({ ten, tep: kq.tep });
  }
  for (const h of hong) console.log(`✖ ${h.ten}: BỊ LOẠI\n    - ${h.loi.slice(0, 8).join('\n    - ')}`);
  for (const h of hopLe) console.log(`✔ ${h.ten}: ${h.tep.length} bài hợp lệ`);
  if (khongDay) { console.log('(--khong-day: chưa ghi / đẩy gì)'); return 0; }

  let loiDay = false;
  for (const h of hopLe) {
    let xong = false;
    for (let lan = 1; lan <= 4 && !xong; lan++) {
      G(['fetch', '--quiet', '--no-tags', CFG.remote, `+refs/heads/${CFG.nhanhChinh}:refs/remotes/${CFG.remote}/${CFG.nhanhChinh}`]);
      let r = G(['checkout', '-q', '-f', '-B', CFG.nhanhChinh, `${CFG.remote}/${CFG.nhanhChinh}`]);
      if (!r.ok) { console.error('checkout lỗi: ' + r.err); loiDay = true; break; }
      for (const t of h.tep) { const dich = path.join(KIT, t.duong); fs.mkdirSync(path.dirname(dich), { recursive: true }); fs.writeFileSync(dich, t.noiDung); }
      G(['add', '--'].concat(h.tep.map(t => t.duong)));
      const lac = G(['diff', '--cached', '--name-status']).out.split('\n').filter(l => l && !(/^A\t/.test(l) && RE_DUONG.test(l.split('\t')[1])));
      if (lac.length) { console.error('Dừng: thay đổi chuẩn bị ghi chứa thứ ngoài kế hoạch: ' + lac.join(' | ')); loiDay = true; break; }
      r = G(['-c', 'user.name=' + CFG.botTen, '-c', 'user.email=' + CFG.botEmail, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', `Nhận ${h.tep.length} bài học từ ${h.ten}`]);
      if (!r.ok) { console.error('commit lỗi: ' + r.err); loiDay = true; break; }
      r = G(['push', '--quiet', CFG.remote, `${CFG.nhanhChinh}:${CFG.nhanhChinh}`]);
      if (r.ok) xong = true; else console.error(`đẩy ${CFG.nhanhChinh} lần ${lan} lỗi (có thể ai đó vừa đẩy): ${r.err.split('\n')[0]}`);
    }
    if (xong) { G(['push', '--quiet', CFG.remote, '--delete', h.ten]); console.log(`→ đã gộp ${h.ten} vào ${CFG.nhanhChinh} và xoá nhánh`); } else loiDay = true;
  }
  for (const h of hong) {   // giữ lại để người phụ trách xem: đổi tên sang inbox-loi/…
    const moi = h.ten.replace(new RegExp('^' + CFG.tienToHopThu + '/'), CFG.tienToHopThu + '-loi/');
    const r = G(['push', '--quiet', CFG.remote, `refs/remotes/${CFG.remote}/${h.ten}:refs/heads/${moi}`]);
    if (r.ok) G(['push', '--quiet', CFG.remote, '--delete', h.ten]);
  }
  return loiDay ? 1 : 0;
}

const lenh = process.argv[2];
if (lenh === 'hop-nhat') process.exit(hopNhat(process.argv.includes('--khong-day')));
console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 17).map(l => l.replace(/^ ?\* ?/, '').replace(/^\/\* ?/, '')).join('\n'));
process.exit(lenh ? 2 : 0);
