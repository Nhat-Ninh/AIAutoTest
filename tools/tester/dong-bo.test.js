#!/usr/bin/env node
/* Bộ thử dong-bo.js + tools/ci/nhan-bai-hoc.js bằng kho git TẠM (remote giả dạng bare, máy tester giả, máy chủ giả) — không đụng kit thật, không dùng mạng.
 * Chạy: node tools/tester/dong-bo.test.js   (thoát mã 1 nếu có ca sai) */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DONG_BO = path.join(__dirname, 'dong-bo.js');
const BAI_HOC = path.join(__dirname, 'bai-hoc.js');
const NHAN = path.join(__dirname, '..', 'ci', 'nhan-bai-hoc.js');
const CFG_REPO = path.join(__dirname, '..', '..', 'config', 'dong-bo.json');

const goc = fs.mkdtempSync(path.join(os.tmpdir(), 'dong-bo-test-'));
// Cấu hình thật trỏ Bitbucket + đẩy thẳng main; các ca dưới dựng remote tên "origin" và kênh inbox/ ⇒ ghi đè hai khoá đó (ca "main-truc-tiep" ở cuối tự dựng riêng).
const CFG_THAT = path.join(goc, 'dong-bo.cfg.json');
fs.writeFileSync(CFG_THAT, JSON.stringify({ ...JSON.parse(fs.readFileSync(CFG_REPO, 'utf8')), remote: 'origin', kenhGui: 'inbox' }, null, 1));
const P = (...a) => path.join(goc, ...a);
let dung = 0, sai = 0;
const ca = (ten, ok, chiTiet) => { if (ok) { dung++; console.log('ĐÚNG ' + ten); } else { sai++; console.log('SAI  ' + ten + (chiTiet ? '\n     ' + String(chiTiet).split('\n').slice(0, 6).join('\n     ') : '')); } };
const MT = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' };
const git = (cwd, ...a) => { const r = spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@test.local', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8', env: MT }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return (r.stdout || '').trim(); };
const gitOk = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: MT });

function chayDB(kit, state, lenh, extra = [], env = {}) {
  return spawnSync(process.execPath, [DONG_BO, lenh, ...extra], { encoding: 'utf8', env: { ...MT, EP_KIT_DIR: kit, EP_STATE_DIR: state, EP_BO_QUA_HAU_CAN: '1', EP_DONG_BO_VAI_TRO: 'tester', ...env }, timeout: 120000 });
}
const doc = (f) => fs.readFileSync(f, 'utf8');
const ghi = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const docTT = (state) => JSON.parse(doc(path.join(state, 'dong-bo.json')));
const gioCu = (state, ngay) => { const f = path.join(state, 'dong-bo.json'); const t = JSON.parse(doc(f)); t.thanhCongLuc = Date.now() - ngay * 86400000; t.thuLaiSau = 0; fs.writeFileSync(f, JSON.stringify(t)); };   // "thời gian trôi qua": cũng hết hạn chờ thử lại

/* ---------- dựng: remote + người phụ trách + tester ---------- */
const remote = P('remote.git');
fs.mkdirSync(remote); git(remote, 'init', '--bare', '-q'); git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
const ql = P('quan-ly'); fs.mkdirSync(ql); git(ql, 'init', '-q'); git(ql, 'checkout', '-q', '-b', 'main'); git(ql, 'remote', 'add', 'origin', remote);
ghi(path.join(ql, 'config', 'dong-bo.json'), doc(CFG_THAT));
ghi(path.join(ql, 'hooks', 'hooks.json'), '{}\n'); ghi(path.join(ql, 'setup.js'), '// setup\n'); ghi(path.join(ql, 'e2e', 'package.json'), '{"name":"e2e"}\n');
ghi(path.join(ql, 'tools', 'a.js'), '// a\n'); ghi(path.join(ql, 'kien-thuc', 'README.md'), '# kho\n'); ghi(path.join(ql, '.gitignore'), 'bao-cao/\nnode_modules/\n');
git(ql, 'add', '-A'); git(ql, 'commit', '-q', '-m', 'khoi tao'); git(ql, 'push', '-q', 'origin', 'main');

const kit = P('tester-kit'); git(goc, 'clone', '-q', remote, kit);
const st = P('trang-thai'); fs.mkdirSync(st);
const pushQL = (msg, fn, email) => { fn(); git(ql, 'add', '-A'); git(ql, ...(email ? ['-c', 'user.email=' + email] : []), 'commit', '-q', '-m', msg); git(ql, 'push', '-q', 'origin', 'main'); };
const headKit = () => git(kit, 'rev-parse', 'HEAD');
const headRemote = () => git(remote, 'rev-parse', 'refs/heads/main');

/* 1. đã mới */
let r = chayDB(kit, st, 'kiem');
ca('kiem khi đã mới: mã 0, ghi dấu', r.status === 0 && docTT(st).sha === headKit(), r.stdout + r.stderr);

/* 2. dấu mới + đúng HEAD ⇒ không cần mạng (đổi remote hỏng vẫn qua) */
git(kit, 'remote', 'set-url', 'origin', P('khong-co.git'));
r = chayDB(kit, st, 'kiem');
ca('dấu còn mới: không đụng mạng, mã 0', r.status === 0, r.stdout + r.stderr);
git(kit, 'remote', 'set-url', 'origin', remote);

/* 3. người phụ trách đẩy commit chạm hook ⇒ kiem (dấu cũ) kéo về và báo CHẠM VÀO */
pushQL('sua hook', () => { ghi(path.join(ql, 'tools', 'a.js'), '// a v2\n'); ghi(path.join(ql, 'kien-thuc', 'x.txt'), 'x\n'); });
gioCu(st, 0.5);   // dấu cũ 12 giờ
r = chayDB(kit, st, 'kiem');
ca('kiem tự kéo main về (fast-forward)', r.status === 0 && headKit() === headRemote() && doc(path.join(kit, 'tools', 'a.js')).includes('v2'), r.stdout + r.stderr);
ca('in rõ "CHẠM VÀO" khi cập nhật chạm tools/', /CHẠM VÀO/.test(r.stdout) && /tools/.test(r.stdout), r.stdout);

/* 4. tester sửa tay tệp theo dõi + commit cục bộ trên nhánh lạ ⇒ tự sao lưu rồi về main, không conflict */
ghi(path.join(kit, 'tools', 'a.js'), '// tester sua tay\n');
git(kit, 'checkout', '-q', '-b', 'nhanh-la'); git(kit, 'add', '-A'); git(kit, 'commit', '-q', '-m', 'commit cuc bo');
ghi(path.join(kit, 'hooks', 'hooks.json'), '{"sua":"tay"}\n');
pushQL('them tai lieu', () => ghi(path.join(ql, 'tai-lieu.md'), 'moi\n'));
r = chayDB(kit, st, 'cap-nhat');
const sl = fs.existsSync(P('trang-thai', 'sao-luu')) ? fs.readdirSync(P('trang-thai', 'sao-luu')) : [];
ca('lệch + sửa tay: về đúng origin/main, nhánh main, sạch', r.status === 0 && headKit() === headRemote() && git(kit, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main' && !git(kit, 'status', '--porcelain', '--untracked-files=no'), r.stdout + r.stderr);
ca('đã SAO LƯU: có patch thay đổi và tham chiếu commit cục bộ', sl.length === 1 && fs.existsSync(P('trang-thai', 'sao-luu', sl[0], 'thay-doi.patch')) && /refs\/sao-luu\//.test(doc(P('trang-thai', 'sao-luu', sl[0], 'ghi-chu.txt'))), sl.join(',') + ' ' + r.stdout);
ca('patch sao lưu chứa nội dung tester đã sửa', sl.length && doc(P('trang-thai', 'sao-luu', sl[0], 'thay-doi.patch')).includes('sua'), '');

/* 5. công việc đang dở trên máy: GIỮ nguyên khi không chồng lấn; chỉ ghi đè (sau sao lưu) ở máy tester khi bắt buộc */
// 5a. Không có gì mới trên main + đang sửa dở tệp theo dõi ⇒ KHÔNG đụng (kể cả máy tester)
ghi(path.join(kit, 'tools', 'a.js'), '// cong viec dang lam\n');
gioCu(st, 0.5);
const truoc5a = headKit();
r = chayDB(kit, st, 'kiem');
ca('tester: main không có gì mới + đang sửa dở ⇒ KHÔNG hoàn tác công việc (mã 0)', r.status === 0 && headKit() === truoc5a && doc(path.join(kit, 'tools', 'a.js')).includes('dang lam'), r.stdout + r.stderr);
// 5b. main có commit mới KHÔNG chồng lấn ⇒ kéo (ff) và giữ nguyên bản sửa dở
pushQL('them tai lieu 2', () => ghi(path.join(ql, 'tai-lieu2.md'), 'moi2\n'));
gioCu(st, 0.5);
r = chayDB(kit, st, 'kiem');
ca('tester: main có commit mới không chồng lấn ⇒ kéo về, GIỮ bản sửa dở, không sao lưu', r.status === 0 && headKit() === headRemote() && doc(path.join(kit, 'tools', 'a.js')).includes('dang lam') && !(fs.existsSync(P('trang-thai', 'sao-luu')) && fs.readdirSync(P('trang-thai', 'sao-luu')).length > 1), r.stdout + r.stderr);
// 5c. main sửa đúng tệp đang sửa dở (chồng lấn): máy phu-trach ⇒ không đụng; máy tester ⇒ sao lưu rồi đưa về main
pushQL('sua a.js tren main', () => ghi(path.join(ql, 'tools', 'a.js'), '// a tu main\n'));
gioCu(st, 0.5);
const truoc5c = headKit();
r = chayDB(kit, st, 'cap-nhat', [], { EP_DONG_BO_VAI_TRO: 'phu-trach' });
ca('phu-trach: chồng lấn với tệp sửa dở ⇒ KHÔNG cập nhật, không mất việc, mã 0', r.status === 0 && headKit() === truoc5c && doc(path.join(kit, 'tools', 'a.js')).includes('dang lam') && /KHÔNG cập nhật/.test(r.stdout), r.stdout + r.stderr);
r = chayDB(kit, st, 'cap-nhat', ['--chap-nhan-sao-luu'], { EP_DONG_BO_VAI_TRO: 'phu-trach' });
ca('phu-trach THẮNG cờ --chap-nhan-sao-luu (bấm nhầm CAP-NHAT.cmd không mất việc dở)', r.status === 0 && headKit() === truoc5c && doc(path.join(kit, 'tools', 'a.js')).includes('dang lam'), r.stdout + r.stderr);
const slTruoc = fs.readdirSync(P('trang-thai', 'sao-luu')).length;
r = chayDB(kit, st, 'cap-nhat');
ca('tester: chồng lấn ⇒ sao lưu rồi về main (mã 0)', r.status === 0 && headKit() === headRemote() && doc(path.join(kit, 'tools', 'a.js')).includes('tu main') && fs.readdirSync(P('trang-thai', 'sao-luu')).length === slTruoc + 1, r.stdout + r.stderr);
// 5d. tester có tệp CHƯA theo dõi trùng đường dẫn với tệp main vừa thêm ⇒ không kẹt mã 13; bản của tester được sao lưu
ghi(path.join(kit, 'e2e', 'tests', 'x', 'x.spec.ts'), '// cua tester\n');
pushQL('main them dung duong dan do', () => ghi(path.join(ql, 'e2e', 'tests', 'x', 'x.spec.ts'), '// chinh thuc\n'));
gioCu(st, 0.5);
r = chayDB(kit, st, 'kiem');
const slX = fs.readdirSync(P('trang-thai', 'sao-luu')).sort().pop();
ca('tester: tệp chưa theo dõi trùng đường dẫn tệp mới của main ⇒ KHÔNG kẹt, sao lưu bản của tester', r.status === 0 && headKit() === headRemote() && doc(path.join(kit, 'e2e', 'tests', 'x', 'x.spec.ts')).includes('chinh thuc') && fs.existsSync(P('trang-thai', 'sao-luu', slX, 'chua-theo-doi', 'e2e', 'tests', 'x', 'x.spec.ts')), r.stdout + r.stderr);

/* 6. ngoại tuyến: còn trong hạn cho qua (có cảnh báo), quá hạn thì chặn (mã 11) */
git(kit, 'remote', 'set-url', 'origin', P('khong-co.git'));
gioCu(st, 1);
r = chayDB(kit, st, 'kiem');
ca('ngoại tuyến 1 ngày: cho chạy kèm cảnh báo (mã 0)', r.status === 0 && /Không kéo được/.test(r.stdout), r.stdout + r.stderr);
const t0 = Date.now();
r = chayDB(kit, st, 'kiem');
ca('vừa thử mà mất mạng: lần sau KHÔNG thử lại ngay ("thử lại sau"), trả về mã 0', r.status === 0 && /thử lại sau/.test(r.stdout), r.stdout + r.stderr);
// CÓ .git mà git lỗi (vd "dubious ownership", gốc repo lệch): KHÔNG được coi như bản zip và âm thầm tắt cổng
const kitLoi = P('kit-git-loi'); fs.mkdirSync(kitLoi); fs.writeFileSync(path.join(kitLoi, '.git'), 'gitdir: ' + P('khong-ton-tai') + '\n');
fs.mkdirSync(path.join(kitLoi, 'config')); fs.copyFileSync(CFG_THAT, path.join(kitLoi, 'config', 'dong-bo.json'));
const stLoi = P('trang-thai-loi'); fs.mkdirSync(stLoi);
r = chayDB(kitLoi, stLoi, 'kiem');
ca('CÓ .git nhưng git lỗi + chưa từng đồng bộ ⇒ CHẶN (mã 11), không âm thầm bỏ qua', r.status === 11 && /KHÔNG CHO CHẠY/.test(r.stderr), r.stdout + r.stderr);
fs.writeFileSync(path.join(stLoi, 'dong-bo.json'), JSON.stringify({ sha: 'x', thanhCongLuc: Date.now() - 3600000 }));
r = chayDB(kitLoi, stLoi, 'kiem');
ca('CÓ .git nhưng git lỗi + vừa đồng bộ 1 giờ trước ⇒ cho qua kèm cảnh báo (mã 0)', r.status === 0 && /Không kéo được/.test(r.stdout), r.stdout + r.stderr);
const kitZip = P('kit-zip'); fs.mkdirSync(kitZip);
const stZip = P('trang-thai-zip'); fs.mkdirSync(stZip);
r = chayDB(kitZip, stZip, 'kiem');
ca('Không có .git (cài từ zip) ⇒ cho qua kèm cảnh báo rõ "không tự cập nhật" (mã 0)', r.status === 0 && /KHÔNG tự cập nhật/.test(r.stdout), r.stdout + r.stderr);
void t0;
gioCu(st, 5);
r = chayDB(kit, st, 'kiem');
ca('ngoại tuyến 5 ngày (> 3): CHẶN, mã 11', r.status === 11 && /KHÔNG CHO CHẠY/.test(r.stderr), r.stdout + r.stderr);
git(kit, 'remote', 'set-url', 'origin', remote);

/* 7. bot nhận bài mà chạm ngoài kien-thuc/ ⇒ từ chối, giữ nguyên */
const truoc7 = headKit();
pushQL('bot gian lan', () => { ghi(path.join(ql, 'kien-thuc', 'ok.txt'), 'ok\n'); ghi(path.join(ql, 'tools', 'doc-hai.js'), 'evil\n'); }, 'easypos-kit-bot@users.noreply.github.com');
gioCu(st, 0.5);
r = chayDB(kit, st, 'kiem');
ca('commit bot chạm ngoài kien-thuc/: TỪ CHỐI (mã 12), HEAD không đổi', r.status === 12 && headKit() === truoc7 && !fs.existsSync(path.join(kit, 'tools', 'doc-hai.js')), r.stdout + r.stderr);
// người phụ trách dọn commit xấu (ghi đè lịch sử remote chỉ trong bài thử)
git(ql, 'reset', '-q', '--hard', truoc7); git(ql, 'push', '-q', '-f', 'origin', 'main');

/* 8. e2e/package.json đổi: --nhanh báo mã 10; cap-nhat làm nốt thì kiem về 0 */
pushQL('doi package', () => ghi(path.join(ql, 'e2e', 'package.json'), '{"name":"e2e","them":1}\n'));
gioCu(st, 0.5);
r = chayDB(kit, st, 'kiem', ['--nhanh']);
ca('package.json đổi + --nhanh: mã 10 (cần npm install)', r.status === 10 && /npm-install/.test(r.stderr) && headKit() === headRemote(), r.stdout + r.stderr);
r = chayDB(kit, st, 'kiem', ['--nhanh']);
ca('chưa làm nốt thì vẫn mã 10', r.status === 10, r.stdout + r.stderr);
// việc còn treo KHÔNG bị mất khi có commit mới đến sau (vd commit bài học của bot) — lỗi mà tác nhân review đã tái hiện
pushQL('bot them bai hoc', () => ghi(path.join(ql, 'kien-thuc', 'bai', '2026-10', 'BH-20261023-0001.md'), 'x\n'), 'easypos-kit-bot@users.noreply.github.com');
gioCu(st, 0.5);
r = chayDB(kit, st, 'kiem', ['--nhanh']);
ca('commit bot đến sau: việc còn treo (npm-install) KHÔNG mất, vẫn mã 10', r.status === 10 && (docTT(st).canXuLy || []).includes('npm-install') && headKit() === headRemote(), r.stdout + r.stderr);
r = chayDB(kit, st, 'cap-nhat');
ca('cap-nhat làm nốt việc sau cập nhật', r.status === 0 && !(docTT(st).canXuLy || []).length, r.stdout + r.stderr);
r = chayDB(kit, st, 'kiem');
ca('sau đó kiem về mã 0', r.status === 0, r.stdout + r.stderr);

/* 9. đang có lượt chạy test thật ⇒ không cập nhật giữa chừng */
pushQL('commit khi dang chay', () => ghi(path.join(ql, 'tai-lieu3.md'), 'm3\n'));
gioCu(st, 0.5);
ghi(path.join(st, 'chay-test.lock'), JSON.stringify({ pid: process.pid, ts: Date.now() }));
const truoc9 = headKit();
r = chayDB(kit, st, 'kiem');
ca('đang chạy test: không kéo giữa chừng (mã 0)', r.status === 0 && headKit() === truoc9 && /lượt chạy test/.test(r.stdout), r.stdout + r.stderr);
fs.unlinkSync(path.join(st, 'chay-test.lock'));
r = chayDB(kit, st, 'kiem');
ca('hết chạy test: kéo bình thường', r.status === 0 && headKit() === headRemote(), r.stdout + r.stderr);

/* 10. gửi bài học: bài hợp lệ đi lên inbox/…, chỉ chứa tệp bài; bài chứa bí mật không đi */
const nhap = P('nhap.md');
ghi(nhap, `## MỚI | nhom: ky-thuat | tags: san-pham, api | Bẫy thử nghiệm của tester
- Nội dung: dùng đúng API này
- Bằng chứng: báo cáo 2026-10-22 tệp:dòng 12
- Xác nhận: 2026-10-22 · dev · dev@abc1234
- Trạng thái: da-xac-nhan
`);
const bh = spawnSync(process.execPath, [BAI_HOC, 'them', nhap, '--ghi'], { encoding: 'utf8', env: { ...MT, EP_STATE_DIR: st, EP_KHO_BAI_HOC: path.join(kit, 'kien-thuc') } });
const hopThu = path.join(st, 'bai-hoc-cho-gui');
ca('bai-hoc them --ghi: có 1 tệp trong hộp thư', bh.status === 0 && fs.readdirSync(hopThu).length === 1, bh.stdout + bh.stderr);
ghi(path.join(hopThu, 'BH-20261023-beef.md'), `## BH-20261023-beef | nhom: ky-thuat | tags: a | Bài lọt bí mật
- Nội dung: password: hunter2abc
- Bằng chứng: báo cáo 2026-10-22 tệp:dòng 12
- Xác nhận: 2026-10-22 · dev · dev@abc1234
- Trạng thái: da-xac-nhan
`);
r = chayDB(kit, st, 'gui', ['--xem']);
ca('gui --xem: liệt kê bài hợp lệ, bỏ bài có bí mật, chưa gửi', r.status === 0 && /Sẽ gửi 1 bài/.test(r.stdout) && /BÍ MẬT/.test(r.stderr) && !git(remote, 'for-each-ref', 'refs/heads/inbox/', '--format=%(refname)'), r.stdout + r.stderr);
r = chayDB(kit, st, 'gui');
const nhanhs = git(remote, 'for-each-ref', 'refs/heads/inbox/', '--format=%(refname)').split('\n').filter(Boolean);
ca('gui: tạo đúng 1 nhánh inbox/… trên remote', r.status === 0 && nhanhs.length === 1, r.stdout + r.stderr);
const tepGui = nhanhs.length ? git(remote, 'diff', '--name-status', 'refs/heads/main', nhanhs[0]).split('\n').filter(Boolean) : [];
ca('nhánh gửi CHỈ thêm một tệp kien-thuc/bai/…', tepGui.length === 1 && /^A\tkien-thuc\/bai\/\d{4}-\d{2}\/BH-\d{8}-[0-9a-f]{8}\.md$/.test(tepGui[0]), tepGui.join(' | '));
ca('hộp thư: bài tốt đã chuyển sang đã-gửi; bài có bí mật vẫn nằm lại', fs.readdirSync(path.join(st, 'bai-hoc-da-gui')).length === 1 && fs.readdirSync(hopThu).length === 1);

/* 11. máy chủ nhận bài: kiểm + gộp vào main bằng commit bot; nhánh inbox bị xoá */
const ci = P('may-chu'); git(goc, 'clone', '-q', remote, ci);
r = spawnSync(process.execPath, [NHAN, 'hop-nhat'], { encoding: 'utf8', env: { ...MT, EP_KIT_DIR: ci }, timeout: 120000 });
const logMain = git(remote, 'log', '-1', '--format=%ae %s', 'refs/heads/main');
ca('máy chủ gộp bài vào main bằng commit của bot', r.status === 0 && logMain.startsWith('easypos-kit-bot@users.noreply.github.com'), r.stdout + r.stderr + logMain);
ca('nhánh inbox đã bị xoá sau khi gộp', !git(remote, 'for-each-ref', 'refs/heads/inbox/', '--format=%(refname)'));
ca('main có tệp bài mới, kien-thuc/bai/…', /kien-thuc\/bai\/\d{4}-\d{2}\/BH-/.test(git(remote, 'ls-tree', '-r', '--name-only', 'refs/heads/main')));

/* 12. kéo về máy tester: bài tới nơi, mã 0, bot commit hợp lệ (chỉ kien-thuc/) */
gioCu(st, 0.5);
r = chayDB(kit, st, 'kiem');
ca('tester kéo được commit của bot (hợp lệ) và có bài mới trong kho', r.status === 0 && headKit() === headRemote() && fs.existsSync(path.join(kit, 'kien-thuc', 'bai')), r.stdout + r.stderr);
ca('bài đã gửi được dọn khỏi "đã gửi" khi đã về tới kho', fs.readdirSync(path.join(st, 'bai-hoc-da-gui')).length === 0);

/* 13. kẻ xấu đẩy nhánh inbox sửa hook + thêm bài: máy chủ LOẠI, không đụng main */
const xau = P('xau'); git(goc, 'clone', '-q', remote, xau);
git(xau, 'checkout', '-q', '-b', 'inbox/ke-xau-1');
ghi(path.join(xau, 'tools', 'a.js'), '// doc hai\n');
ghi(path.join(xau, 'kien-thuc', 'bai', '2026-10', 'BH-20261023-aaaa.md'), `## BH-20261023-aaaa | nhom: ky-thuat | tags: a | Bài đi kèm sửa mã
- Nội dung: gì đó
- Bằng chứng: báo cáo 2026-10-22 tệp:dòng 12
- Xác nhận: 2026-10-22 · dev · dev@abc1234
- Trạng thái: da-xac-nhan
`);
git(xau, 'add', '-A'); git(xau, 'commit', '-q', '-m', 'doc hai'); git(xau, 'push', '-q', 'origin', 'inbox/ke-xau-1');
git(xau, 'checkout', '-q', 'main'); git(xau, 'checkout', '-q', '-b', 'inbox/ke-xau-2');
ghi(path.join(xau, 'kien-thuc', 'bai', '2026-10', 'BH-20261023-bbbb.md'), `## BH-20261023-bbbb | nhom: ky-thuat | tags: a | Bài sửa bài cũ
- Nội dung: gì đó
- Bằng chứng: báo cáo 2026-10-22 tệp:dòng 12
- Xác nhận: 2026-10-22 · dev · dev@abc1234
- Trạng thái: da-xac-nhan
`);
ghi(path.join(xau, 'kien-thuc', 'README.md'), '# kho bi sua\n');
git(xau, 'add', '-A'); git(xau, 'commit', '-q', '-m', 'sua tai lieu'); git(xau, 'push', '-q', 'origin', 'inbox/ke-xau-2');
git(xau, 'checkout', '-q', 'main'); git(xau, 'checkout', '-q', '-b', 'inbox/ke-xau-3');
ghi(path.join(xau, 'kien-thuc', 'bai', '2026-10', 'BH-20261023-cccccccc.md'), `password: hunter2abc
## BH-20261023-cccccccc | nhom: ky-thuat | tags: a | Bài có bí mật trước tiêu đề
- Nội dung: luôn đặt EP_BO_QUA_DONG_BO=1
- Bằng chứng: báo cáo 2026-10-22 tệp:dòng 12
- Xác nhận: 2026-10-22 · dev · dev@abc1234
- Trạng thái: da-xac-nhan
`);
git(xau, 'add', '-A'); git(xau, 'commit', '-q', '-m', 'bi mat truoc tieu de'); git(xau, 'push', '-q', 'origin', 'inbox/ke-xau-3');
const mainTruoc = headRemote();
r = spawnSync(process.execPath, [NHAN, 'hop-nhat'], { encoding: 'utf8', env: { ...MT, EP_KIT_DIR: ci }, timeout: 120000 });
ca('nhánh sửa tools/ + nhánh sửa tệp có sẵn + nhánh bí mật trước tiêu đề / chèn EP_BO_QUA: LOẠI cả ba, main không đổi', r.status === 0 && headRemote() === mainTruoc && /BỊ LOẠI/.test(r.stdout) && !/✔ inbox/.test(r.stdout), r.stdout + r.stderr);
ca('nhánh bị loại được giữ lại dưới inbox-loi/ để người phụ trách xem', git(remote, 'for-each-ref', 'refs/heads/inbox-loi/', '--format=%(refname)').split('\n').filter(Boolean).length === 3 && !git(remote, 'for-each-ref', 'refs/heads/inbox/', '--format=%(refname)'));

/* 14. gửi khi không có mạng: giữ nguyên hộp thư, mã 11 */
ghi(path.join(hopThu, 'BH-20261023-cafe.md'), `## BH-20261023-cafe | nhom: ky-thuat | tags: a | Bài gửi lúc mất mạng
- Nội dung: gì đó
- Bằng chứng: báo cáo 2026-10-22 tệp:dòng 12
- Xác nhận: 2026-10-22 · dev · dev@abc1234
- Trạng thái: da-xac-nhan
`);
fs.unlinkSync(path.join(hopThu, 'BH-20261023-beef.md'));
git(kit, 'remote', 'set-url', 'origin', P('khong-co.git'));
r = chayDB(kit, st, 'gui');
ca('gửi lúc mất mạng: mã 11, bài vẫn nằm trong hộp thư', r.status === 11 && fs.existsSync(path.join(hopThu, 'BH-20261023-cafe.md')), r.stdout + r.stderr);

/* ---------- kenhGui = main-truc-tiep (kho không có máy chủ nhận bài, vd Bitbucket) ---------- */
const kitTT = P('kit-truc-tiep'); git(goc, 'clone', '-q', remote, kitTT);
ghi(path.join(kitTT, 'config', 'dong-bo.json'), JSON.stringify({ ...JSON.parse(doc(CFG_THAT)), kenhGui: 'main-truc-tiep' }));
const stTT = P('trang-thai-truc-tiep'); fs.mkdirSync(stTT);
const nhapTT = P('nhap-truc-tiep.md');
ghi(nhapTT, doc(nhap).replace('Bẫy thử nghiệm của tester', 'Bẫy đẩy thẳng lên main không qua hộp thư').replace('dùng đúng API này', 'đẩy bài thẳng lên main khi kho không có máy chủ nhận bài'));
spawnSync(process.execPath, [BAI_HOC, 'them', nhapTT, '--ghi'], { encoding: 'utf8', env: { ...MT, EP_STATE_DIR: stTT, EP_KHO_BAI_HOC: path.join(kitTT, 'kien-thuc'), EP_KHONG_TU_GUI: '1' } });
const truocTT = git(remote, 'rev-parse', 'refs/heads/main');
const nhanhTruoc = git(remote, 'for-each-ref', 'refs/heads/inbox/', '--format=%(refname)').split('\n').filter(Boolean).length;
r = chayDB(kitTT, stTT, 'gui');
const tepTT = git(remote, 'diff', '--name-status', truocTT, 'refs/heads/main').split('\n').filter(Boolean);
ca('main-truc-tiep: bài lên THẲNG main (đúng 1 tệp kien-thuc/bai/ mới), không tạo nhánh inbox/ mới', r.status === 0 && tepTT.length === 1 && /^A\tkien-thuc\/bai\//.test(tepTT[0]) && git(remote, 'for-each-ref', 'refs/heads/inbox/', '--format=%(refname)').split('\n').filter(Boolean).length === nhanhTruoc, r.stdout + r.stderr + tepTT.join('|'));
ca('main-truc-tiep: hộp thư chuyển bài sang đã-gửi', fs.readdirSync(path.join(stTT, 'bai-hoc-cho-gui')).length === 0);

console.log(`\n${dung}/${dung + sai} ca đúng`);
try { fs.rmSync(goc, { recursive: true, force: true }); } catch (e) { /* Windows có thể giữ tệp .git tạm */ }
process.exit(sai ? 1 : 0);
