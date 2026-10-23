/* Kịch bản MẪU để học: đăng nhập EasyPOS (giao diện + API). Chưa chạy thử trên môi trường thật — xem lại bộ chọn / thông báo khi có môi trường.
 * Chạy:  cd e2e && npx playwright test tests/dang-nhap --project=dev --headed   (đạt trên dev rồi chạy lại với --project=uat)
 * Dùng tên đăng nhập KHÔNG tồn tại (AUTO_…) cho ca "sai" để không làm khoá tài khoản thật. */
import { test, expect } from '../../lib/fixtures';
import { dangNhap, kiemUrl, laMoiTruongProd, moiTruong, taiKhoan } from '../../lib/moi-truong';

test.describe('giao diện đăng nhập', { tag: ['@smoke', '@ui', '@regression'] }, () => {
  test.skip(({ env }) => !moiTruong(env).webUrl, 'Chưa điền webUrl cho môi trường này');

  test('[TC-FE-001] Mở trang đăng nhập thấy ô tên, ô mật khẩu, nút đăng nhập', async ({ page, env }) => {
    const ui = dangNhap(env).ui;
    await page.goto(ui.duongDan);
    await expect(page.locator(ui.oTen).first()).toBeVisible();
    await expect(page.locator(ui.oMatKhau).first()).toBeVisible();
    await expect(page.locator(ui.nutDangNhap).first()).toBeVisible();
  });

  test('[TC-FE-002] Sai tài khoản thì không vào được hệ thống', async ({ page, env }) => {
    const ui = dangNhap(env).ui;
    await page.goto(ui.duongDan);
    await page.locator(ui.oTen).first().fill('AUTO_khong_ton_tai');
    await page.locator(ui.oMatKhau).first().fill('AUTO_sai_mat_khau_123');
    await page.locator(ui.nutDangNhap).first().click();
    await page.waitForTimeout(3000);
    expect(page.url(), 'Phải còn ở trang đăng nhập').toMatch(/login/i);
    await page.screenshot({ path: test.info().outputPath('sai-tai-khoan.png') });
  });

  test.describe('có tài khoản thật', () => {
    test.skip(({ env }) => !taiKhoan(env, 'web'), 'Chưa có tài khoản web (~/.easypos-tester/tai-khoan.json)');
    test('[TC-FE-003] Đúng tài khoản thì vào được hệ thống', async ({ page, dangNhapUI }) => {
      await dangNhapUI();
      expect(page.url(), 'Vẫn ở trang đăng nhập').not.toMatch(/login/i);
      await page.screenshot({ path: test.info().outputPath('sau-dang-nhap.png') });
    });
  });
});

test.describe('API đăng nhập', { tag: ['@smoke', '@api', '@regression'] }, () => {
  test.skip(({ env }) => !(moiTruong(env).apiUrl || moiTruong(env).webUrl), 'Chưa điền apiUrl / webUrl cho môi trường này');

  test('[TC-BE-001] Sai tài khoản thì không trả id_token', async ({ playwright, env }) => {
    const m = moiTruong(env);
    const goc = kiemUrl(String(m.apiUrl || m.webUrl).replace(/\/?$/, '/'), `moiTruong.${env}.apiUrl / webUrl`, laMoiTruongProd(env));
    const dn = dangNhap(env).api;
    const ctx = await playwright.request.newContext({ baseURL: goc, ignoreHTTPSErrors: true });
    const res = await ctx.post(String(dn.duongDan), { data: { [dn.truongTen]: 'AUTO_khong_ton_tai', [dn.truongMatKhau]: 'AUTO_sai_mat_khau_123', rememberMe: false } });
    const body = await res.json().catch(() => ({}));
    expect(body?.data?.[dn.truongToken], 'Sai tài khoản mà vẫn có token').toBeFalsy();
    await ctx.dispose();
  });

  test('[TC-BE-002] Đúng tài khoản thì gọi được API cần đăng nhập', async ({ api }) => {
    const r = await api.get('client/common/introspect');
    expect(r.status(), 'GET client/common/introspect').toBeLessThan(400);
  });
});
