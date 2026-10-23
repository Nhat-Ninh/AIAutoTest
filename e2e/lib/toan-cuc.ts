/* globalSetup của Playwright — chạy MỘT lần trước mọi test, kể cả khi tester gõ `npx playwright test` tay (không qua Claude / hook).
 *  1. CỔNG CẬP NHẬT: kit phải mới theo nhánh main (tools/tester/dong-bo.js kiem). Cũ ⇒ tự kéo về; không kéo được và quá hạn ngoại tuyến / cần cài thêm ⇒ DỪNG, không chạy test.
 *     (Cấu hình Playwright đã nạp trước bước này nên nếu kit vừa cập nhật, lượt chạy này vẫn dùng cấu hình cũ — hook của Claude kiểm TRƯỚC khi gọi nên thường đã mới.)
 *  2. Ghi khoá "đang chạy test" để dong-bo.js không kéo mã mới giữa chừng một lượt chạy; teardown gỡ khoá.
 * Tắt cổng (chỉ khi người phụ trách đồng ý, hook sẽ hỏi): EP_BO_QUA_DONG_BO=1. */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const KIT = path.resolve(__dirname, '..', '..');
const STATE = process.env.EP_STATE_DIR || path.join(os.homedir(), '.easypos-tester');

export default async function globalSetup() {
  const tool = path.join(KIT, 'tools', 'tester', 'dong-bo.js');
  if (process.env.EP_BO_QUA_DONG_BO !== '1' && fs.existsSync(tool)) {      // chỉ đúng "1" mới tắt cổng (cùng quy ước với dong-bo.js)
    const r = spawnSync(process.execPath, [tool, 'kiem', '--nhanh', '--yen-lang'], { encoding: 'utf8', timeout: 60_000, windowsHide: true });
    if (r.status !== 0) {
      const noi = (String(r.stderr || '') + '\n' + String(r.stdout || '')).trim().split('\n').slice(-6).join('\n');
      throw new Error(`CỔNG CẬP NHẬT KIT — không chạy test vì kit chưa mới / chưa an toàn (mã ${r.status ?? 'timeout'}):\n${noi}\n` +
        'Xử lý: node tools/tester/dong-bo.js cap-nhat   (mã 10) · kiểm mạng / đăng nhập GitHub (mã 11) · báo người phụ trách (mã 12).');
    }
  }
  // Dọn tệp tạm của các lần chạy trước (cờ "đăng nhập giao diện hỏng"): của chính lượt này (số tiến trình có thể trùng lần cũ) và mọi tệp quá 1 giờ.
  try {
    for (const f of fs.readdirSync(os.tmpdir())) {
      if (!f.startsWith('ep-ui-hong-')) continue;
      const p = path.join(os.tmpdir(), f);
      if (f.startsWith(`ep-ui-hong-${process.pid}-`) || Date.now() - fs.statSync(p).mtimeMs > 3600_000) fs.unlinkSync(p);
    }
  } catch { /* dọn không được cũng không sao */ }
  const khoa = path.join(STATE, 'chay-test.lock');
  try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(khoa, JSON.stringify({ pid: process.pid, ts: Date.now() })); } catch { /* không ghi được khoá thì chỉ mất phần "không kéo giữa chừng" */ }
  return async () => { try { fs.unlinkSync(khoa); } catch { /* đã gỡ */ } };
}
