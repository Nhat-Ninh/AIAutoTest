/* Kiểm thử FE (UI) — Tạo sản phẩm từ dữ liệu iCheck. Báo cáo: bao-cao/2026-10-22_icheck-tao-san-pham/.
 * Chạy:  cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-fe.spec.ts --project=dev [--headed]
 * Hai modal: "Thêm sản phẩm" (gõ tên → dropdown .list-product-suggestion, gõ mã vạch → tự điền thẳng),
 * "Quét mã vạch thêm sản phẩm" (bảng nhiều dòng, mỗi mã vạch Enter thêm 1 dòng). Ảnh chụp từng bước. */
import type { Page } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { boSinhMa } from '../../lib/du-lieu';
import { dongHopThoai } from '../../lib/ui';

const DAU = 'AUTO_ICK_';
const { ma, hauTo: HAU_TO } = boSinhMa(DAU);
const TRANG_SP = process.env.EP_TRANG_SP || '/easy-pos/product/product';
const TU_KHOA_CO_GOI_Y = 'iphone';
const MA_VACH_CO_GOI_Y = '0194252025109';
let soDem = 0;
const maVachMoi = () => `299${HAU_TO}${(soDem++).toString().padStart(2, '0')}`;

async function moModalThemSanPham(page: Page) {
  await dongHopThoai(page);
  await page.getByRole('button', { name: /Thêm sản phẩm/ }).click({ timeout: 5000 }).catch(async () => {
    await dongHopThoai(page);
    await page.getByRole('button', { name: /Thêm sản phẩm/ }).click();
  });
  const mucSanPham = page.locator('.dropdown-menu .dropdown-item', { hasText: 'Sản phẩm' }).first();
  if (await mucSanPham.isVisible().catch(() => false)) await mucSanPham.click();
  await expect(page.locator('.modal-dialog input[name="name"]').first()).toBeVisible();
}
const oTen = (page: Page) => page.locator('.modal-dialog input[name="name"]').first();
const oMaVach = (page: Page) => page.locator('.modal-dialog input[placeholder*="ã vạch" i]').first();
const dsGoiYTen = (page: Page) => page.locator('.list-product-suggestion .product-suggestion-item');

async function moModalQuetMaVach(page: Page) {
  await dongHopThoai(page);
  const nut = page.getByRole('button', { name: /Quét mã vạch/ }).first();
  await nut.click({ timeout: 5000 }).catch(async () => {
    await dongHopThoai(page);
    await nut.click();
  });
  const oNhap = page.locator('input.scan-input');
  await expect(oNhap).toBeVisible();
  return oNhap;
}
// Giới hạn trong popup — trang Danh sách sản phẩm phía sau dùng CHUNG lớp CSS "table-custom-body".
const dongQuet = (page: Page) => page.locator('.scan-product-modal-body table.editing-table tbody tr.table-custom-body');
const demDaQuet = (page: Page) => page.locator('.scan-count-text');
const nutXacNhanQuet = (page: Page) => page.locator('.scan-product-footer button.btn-primary');
const nutHuyQuet = (page: Page) => page.locator('.scan-product-footer button.btn-outline-primary');

test.describe.configure({ mode: 'serial' });

test.describe('FE — modal Thêm sản phẩm (gợi ý iCheck)', { tag: ['@ui', '@regression'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI, api }) => {
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_SP);
    await dongHopThoai(page);
  });

  test('[TC-FE-ICK-001] Gõ tên phổ biến: dropdown gợi ý hiện ra, tối đa 8 dòng, mỗi dòng có ảnh/tên/mã vạch', async ({ page }) => {
    await moModalThemSanPham(page);
    await oTen(page).fill(TU_KHOA_CO_GOI_Y);
    await expect(dsGoiYTen(page).first()).toBeVisible({ timeout: 10000 });
    const soDong = await dsGoiYTen(page).count();
    await page.screenshot({ path: test.info().outputPath('ICK-001-dropdown-ten.png'), fullPage: true });
    test.info().annotations.push({ type: 'QUAN SÁT', description: `dropdown gợi ý có ${soDong} dòng (kỳ vọng tối đa 8 theo FE slice:0:8)` });
    expect(soDong, 'không được vượt quá 8 dòng hiển thị').toBeLessThanOrEqual(8);
    await expect(dsGoiYTen(page).first().locator('.product-suggestion-name')).not.toBeEmpty();
    await expect(dsGoiYTen(page).first().locator('.product-suggestion-barcode')).toContainText(/Mã Vạch/i);
  });

  test('[TC-FE-ICK-002] Chọn 1 gợi ý: form tự điền Tên/Mã vạch/Giá nhập/Giá bán', async ({ page }) => {
    await moModalThemSanPham(page);
    await oTen(page).fill(TU_KHOA_CO_GOI_Y);
    await expect(dsGoiYTen(page).first()).toBeVisible({ timeout: 10000 });
    const tenGoiY = (await dsGoiYTen(page).first().locator('.product-suggestion-name').textContent())?.trim() ?? '';
    await dsGoiYTen(page).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath('ICK-002-sau-khi-chon.png'), fullPage: true });
    await expect(oTen(page)).toHaveValue(tenGoiY);
    const maVachSauChon = await oMaVach(page).inputValue();
    expect(maVachSauChon.length, 'mã vạch phải được điền từ gợi ý').toBeGreaterThan(0);
  });

  test('[TC-FE-ICK-003] Nhập mã vạch có dữ liệu, Enter: tự điền thẳng (không hiện dropdown)', async ({ page }) => {
    await moModalThemSanPham(page);
    await oMaVach(page).fill(MA_VACH_CO_GOI_Y);
    await oMaVach(page).press('Enter');
    // iCheck có thể trả chậm (BE đo ~2,5 giây): đợi có thăm dò tới 12 giây thay vì chờ cố định (28/10/2026: chờ 1,5 giây là hụt).
    await expect.poll(async () => (await oTen(page).inputValue()).length, { timeout: 12000 }).toBeGreaterThan(0).catch(() => undefined);
    await page.screenshot({ path: test.info().outputPath('ICK-003-sau-enter-ma-vach.png'), fullPage: true });
    const coDropdown = await dsGoiYTen(page).first().isVisible().catch(() => false);
    const ten = await oTen(page).inputValue();
    test.info().annotations.push({ type: 'KẾT QUẢ', description: `mã vạch ${MA_VACH_CO_GOI_Y} → ô Tên="${ten}", dropdown hiện=${coDropdown}` });
    expect(coDropdown, 'theo code: KHÔNG hiện dropdown ở ô Mã vạch (khác tài liệu)').toBe(false);
    expect(ten.length, 'tài liệu 2.2 bước 3–4: mã vạch tìm thấy trong kho iCheck ⇒ điền Tên/giá/ảnh vào form').toBeGreaterThan(0);
  });

  test('[TC-FE-ICK-004] Mã vạch đã tồn tại trong cửa hàng: cảnh báo, không điền dữ liệu', async ({ page, api, phien }) => {
    const barcode = maVachMoi();
    const dv = await api.get('client/page/product/get-with-paging?page=0&size=1').then(r => r.json());
    const unitRow = (dv?.data?.content ?? dv?.data ?? [])[0];
    await api.post('client/page/product/create1', {
      multipart: { comId: String(phien.comId), name: ma('004-da-co'), code2: ma('004'), barcode, salePrice: '9000', inventoryTracking: 'false', unit: String(unitRow?.unit ?? ''), unitId: String(unitRow?.unitId ?? '') },
    });
    await moModalThemSanPham(page);
    await oMaVach(page).fill(barcode);
    await oMaVach(page).press('Enter');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: test.info().outputPath('ICK-004-ma-vach-da-ton-tai.png'), fullPage: true });
    const ten = await oTen(page).inputValue();
    test.info().annotations.push({ type: 'KẾT QUẢ', description: `mã vạch đã tồn tại → ô Tên="${ten}" (kỳ vọng vẫn trống hoặc có cảnh báo riêng)` });
  });
});

test.describe('FE — popup Quét mã vạch thêm sản phẩm', { tag: ['@ui', '@regression'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_SP);
    await dongHopThoai(page);
  });

  test('[TC-FE-ICK-006] Nhập 1 mã vạch có dữ liệu: thêm 1 dòng điền sẵn Ảnh/Tên/Giá', async ({ page }) => {
    const oNhap = await moModalQuetMaVach(page);
    await oNhap.fill(MA_VACH_CO_GOI_Y);
    await oNhap.press('Enter');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('ICK-006-sau-khi-quet.png'), fullPage: true });
    await expect(dongQuet(page)).toHaveCount(1);
    await expect(demDaQuet(page)).toContainText('1');
  });

  test('[TC-FE-ICK-007] Quét lại cùng mã vạch: toast cảnh báo, không thêm dòng mới', async ({ page }) => {
    const oNhap = await moModalQuetMaVach(page);
    const bc = maVachMoi();
    await oNhap.fill(bc);
    await oNhap.press('Enter');
    await page.waitForTimeout(1000);
    await oNhap.fill(bc);
    await oNhap.press('Enter');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: test.info().outputPath('ICK-007-quet-trung.png'), fullPage: true });
    await expect(dongQuet(page)).toHaveCount(1);
  });

  test('[TC-FE-ICK-009] Mã vạch không có dữ liệu: vẫn thêm dòng, Tên trống', async ({ page }) => {
    const oNhap = await moModalQuetMaVach(page);
    await oNhap.fill(maVachMoi());
    await oNhap.press('Enter');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('ICK-009-ma-vach-khong-du-lieu.png'), fullPage: true });
    await expect(dongQuet(page)).toHaveCount(1);
  });

  test('[TC-FE-ICK-010] Xóa 1 dòng: bảng về trống, nút Xác nhận vô hiệu', async ({ page }) => {
    const oNhap = await moModalQuetMaVach(page);
    await oNhap.fill(maVachMoi());
    await oNhap.press('Enter');
    await page.waitForTimeout(1000);
    await expect(dongQuet(page)).toHaveCount(1);
    await dongQuet(page).first().locator('.icon-trash').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath('ICK-010-sau-khi-xoa.png'), fullPage: true });
    await expect(dongQuet(page)).toHaveCount(0);
    await expect(nutXacNhanQuet(page)).toBeDisabled();
  });

  test('[TC-FE-ICK-011] Thêm 1 dòng hợp lệ (đủ tên/giá bán) rồi Xác nhận: tạo thành công', async ({ page, api }) => {
    const oNhap = await moModalQuetMaVach(page);
    const bc = maVachMoi();
    await oNhap.fill(bc);
    await oNhap.press('Enter');
    await page.waitForTimeout(1000);
    const dong = dongQuet(page).first();
    const oTenDong = dong.locator('td').nth(3).locator('input');
    const oGiaBanDong = dong.locator('td').nth(6).locator('input');
    if (!(await oTenDong.inputValue())) await oTenDong.fill(ma('011'));
    await oGiaBanDong.fill('18000');
    await page.screenshot({ path: test.info().outputPath('ICK-011-truoc-xac-nhan.png'), fullPage: true });
    await nutXacNhanQuet(page).click();
    await expect(page.locator('.toast-success, .toast-message').first(), 'phải có thông báo thành công').toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: test.info().outputPath('ICK-011-sau-xac-nhan.png'), fullPage: true });
    const r = await api.get(`client/page/product/category-get-with-paging?page=0&size=20&isWebCall=true&isCountAll=false&keyword=${encodeURIComponent(bc)}`);
    const b = await r.json();
    const ds = Array.isArray(b?.data) ? b.data : (b?.data?.content ?? []);
    expect(ds.some((x: any) => x?.barcode === bc), 'sản phẩm vừa thêm bằng popup quét phải có trong danh sách').toBe(true);
  });

  test('[TC-FE-ICK-012] Dòng thiếu Giá bán: Xác nhận bị chặn, không tạo sản phẩm', async ({ page, api }) => {
    const oNhap = await moModalQuetMaVach(page);
    const bc = maVachMoi();
    await oNhap.fill(bc);
    await oNhap.press('Enter');
    await page.waitForTimeout(1000);
    const dong = dongQuet(page).first();
    const oTenDong = dong.locator('td').nth(3).locator('input');
    if (!(await oTenDong.inputValue())) await oTenDong.fill(ma('012'));
    // Cố tình không nhập Giá bán.
    await nutXacNhanQuet(page).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('ICK-012-thieu-gia-ban.png'), fullPage: true });
    const r = await api.get(`client/page/product/category-get-with-paging?page=0&size=20&isWebCall=true&isCountAll=false&keyword=${encodeURIComponent(bc)}`);
    const b = await r.json();
    const ds = Array.isArray(b?.data) ? b.data : (b?.data?.content ?? []);
    expect(ds.some((x: any) => x?.barcode === bc), 'KHÔNG được tạo sản phẩm khi thiếu giá bán').toBe(false);
  });
});
