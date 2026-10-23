/* Gọi git an toàn cho các công cụ của kit: không dùng shell (không bị chèn lệnh), không bao giờ hiện hộp hỏi mật khẩu, có hạn chờ.
 * Dùng chung cho tools/tester/dong-bo.js và tools/ci/nhan-bai-hoc.js. */
'use strict';
const { spawnSync } = require('child_process');

const MOI_TRUONG = () => Object.assign({}, process.env, {
  GIT_TERMINAL_PROMPT: '0',        // không bao giờ hỏi mật khẩu trên console
  GCM_INTERACTIVE: 'never',        // Git Credential Manager không bật hộp đăng nhập (chạy ngầm trong hook sẽ treo)
  GIT_ASKPASS: '', SSH_ASKPASS: '',
  LC_ALL: 'C', LANG: 'C',          // thông báo git ổn định (không dịch) để phân loại lỗi
});

/** Chạy `git <args>` trong thư mục cwd. Trả { ok, status, out, err, timeout }. out / err đã cắt khoảng trắng cuối. */
function git(args, { cwd, timeoutMs = 30000, input } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: timeoutMs, env: MOI_TRUONG(), input, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return {
    ok: r.status === 0 && !r.error,
    status: r.status,
    out: String(r.stdout || '').replace(/\s+$/, ''),
    err: String(r.stderr || '').replace(/\s+$/, '') || (r.error ? String(r.error.message) : ''),
    timeout: !!(r.error && r.error.code === 'ETIMEDOUT'),
  };
}

module.exports = { git };
