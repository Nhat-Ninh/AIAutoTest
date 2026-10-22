/* Kiểm môi trường sẵn sàng (chạy đầu tiên khi nhận bộ kit / khi nghi môi trường hỏng): mở được giao diện, đăng nhập API được.
 * Chạy:  npx playwright test tests/_kiem-moi-truong --project=dev   (rồi --project=uat) */
import { test, expect } from '../../lib/fixtures';
import { moiTruong, taiKhoan } from '../../lib/moi-truong';

test.describe('giao diện', () => {
  test.skip(({ env }) => !moiTruong(env).webUrl, 'Chưa điền webUrl cho môi trường này');
  test('[KIEM-01] Mở được trang giao diện', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status() ?? 0, 'Trang chủ trả lỗi HTTP').toBeLessThan(400);
  });
});

test.describe('đăng nhập giao diện', () => {
  test.skip(({ env }) => !moiTruong(env).webUrl || !taiKhoan(env, 'web'), 'Chưa có địa chỉ / tài khoản web cho môi trường này');
  test('[KIEM-03] Đăng nhập giao diện được (tài khoản → chọn công ty nếu có nhiều)', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    expect(page.url(), 'Vẫn ở trang đăng nhập').not.toMatch(/login/i);
  });
});

test.describe('backend', () => {
  test.skip(({ env }) => !taiKhoan(env, 'web') || !(moiTruong(env).apiUrl || moiTruong(env).webUrl), 'Chưa có địa chỉ / tài khoản web cho môi trường này');
  test('[KIEM-02] Đăng nhập API được', async ({ api }) => {
    const r = await api.get('client/common/introspect');
    expect(r.status(), 'GET client/common/introspect sau đăng nhập').toBeLessThan(400);
  });
});
