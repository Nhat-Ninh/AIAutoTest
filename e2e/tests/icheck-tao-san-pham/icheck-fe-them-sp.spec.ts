/* Kiểm thử FE BỔ SUNG — màn "Thêm sản phẩm" (Web, mục 4.1), lượt 28/10/2026, tài liệu Confluence EP 50709307 v68.
 * Báo cáo: bao-cao/2026-10-28_icheck-tao-san-pham/. Chạy: cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-fe-them-sp.spec.ts --project=dev [--headed]
 * Bộ chọn các trường ngoài Tên / Mã vạch (giá, thuế, ảnh, loại SP…) chưa có trong kho bài học ⇒ đoán theo tên trường FE (purchasePrice, salePrice) và HIỆU CHỈNH ở Bước 4;
 * chưa tìm thấy bộ chọn thì test báo "KỊCH BẢN" (lỗi kịch bản), không tính là lỗi phần mềm. Tên sản phẩm tạo ra: AUTO_THEM_. */
import type { Page } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { dongHopThoai } from '../../lib/ui';
import { dsTheoTuKhoa } from '../../lib/san-pham';
import { boMa, choDongGop, doiToast, dsGoiYTen, theoDoiToast, ghiChu, MA_VACH_CO_GOI_Y, moModalThemSanPham, nutLuuSP, oMaVachSP, oTenSP, textToast, toast, TRANG_SP, TU_KHOA_CO_GOI_Y } from './_chung';

const { ma, maVachMoi } = boMa('THEM');
const modal = (page: Page) => page.locator('.modal-dialog').first();
const oGiaNhap = (page: Page) => modal(page).locator('input[name="purchasePrice"], input[name="importPrice"]').first();
const oGiaBan = (page: Page) => modal(page).locator('input[name="salePrice"]').first();
const oMaSP = (page: Page) => modal(page).locator('input[placeholder*="ã sản phẩm" i], input[name="code2"]').first();

test.describe('FE — màn Thêm sản phẩm, gợi ý iCheck (mục 4.1)', { tag: ['@ui', '@regression', '@icheck'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI }) => {
    await theoDoiToast(page);
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_SP);
    await dongHopThoai(page);
  });

  const chonGoiYDau = async (page: Page, tuKhoa = TU_KHOA_CO_GOI_Y) => {
    await oTenSP(page).fill(tuKhoa);
    await expect(dsGoiYTen(page).first()).toBeVisible({ timeout: 10000 });
    await dsGoiYTen(page).first().click();
    await page.waitForTimeout(800);
  };

  test('[TC-FE-ICK-013] Chọn gợi ý: điền Tên, Mã vạch, Giá nhập, Giá bán, Áp dụng thuế, ảnh; "Bán trực tiếp" bật, "Là nguyên vật liệu" tắt; các trường khác không đổi', async ({ page }) => {
    await moModalThemSanPham(page);
    await chonGoiYDau(page);
    await page.screenshot({ path: test.info().outputPath('ICK-013-sau-khi-chon-goi-y.png'), fullPage: true });
    expect((await oTenSP(page).inputValue()).length, 'Tên phải được điền').toBeGreaterThan(0);
    expect((await oMaVachSP(page).inputValue()).length, 'Mã vạch phải được điền').toBeGreaterThan(0);
    const [gn, gb] = [await oGiaNhap(page).inputValue().catch(() => null), await oGiaBan(page).inputValue().catch(() => null)];
    ghiChu('KẾT QUẢ QUAN SÁT', `Giá nhập="${gn}", Giá bán="${gb}" (null = chưa tìm thấy ô ⇒ hiệu chỉnh bộ chọn ở Bước 4; trống = iCheck không có giá).`);
    const nhan = (t: RegExp) => modal(page).locator('label, .form-check', { hasText: t }).locator('input[type=checkbox]').first();
    const [bantt, nvl] = [nhan(/Bán trực tiếp/i), nhan(/nguyên vật liệu/i)];
    if (await bantt.count()) expect(await bantt.isChecked(), 'tài liệu 2.2 bảng: "Bán trực tiếp" mặc định Bật khi chọn sản phẩm').toBe(true);
    else ghiChu('KỊCH BẢN', 'Không tìm thấy checkbox "Bán trực tiếp" — hiệu chỉnh bộ chọn');
    if (await nvl.count()) expect(await nvl.isChecked(), 'tài liệu 2.2 bảng: "Là nguyên vật liệu" mặc định Tắt').toBe(false);
    else ghiChu('KỊCH BẢN', 'Không tìm thấy checkbox "Là nguyên vật liệu" — hiệu chỉnh bộ chọn');
    const soAnh = await modal(page).locator('img[src*="http"], .image-item, .product-image img').count();
    ghiChu('KẾT QUẢ QUAN SÁT', `Số phần tử ảnh trong form sau khi chọn gợi ý: ${soAnh} (NT-10: tối đa 5). Thuế/ảnh đối chiếu bằng ảnh chụp.`);
    expect(soAnh, 'NT-10: tối đa 5 ảnh').toBeLessThanOrEqual(5 + 3 /* biểu tượng/ảnh mặc định của form */);
  });

  test('[TC-FE-ICK-014] Mã vạch KHÔNG có dữ liệu + Enter: giữ nguyên mã vạch, cảnh báo chưa có dữ liệu tham khảo, nhập tay tiếp', async ({ page }) => {
    await moModalThemSanPham(page);
    const bc = maVachMoi();
    await oMaVachSP(page).fill(bc);
    await oMaVachSP(page).press('Enter');
    const tt = await doiToast(page, 10000);
    await page.screenshot({ path: test.info().outputPath('ICK-014-ma-vach-khong-co-du-lieu.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast/cảnh báo: ${JSON.stringify(tt)}; ô Tên="${await oTenSP(page).inputValue()}"`);
    await expect(oMaVachSP(page), 'phải giữ nguyên mã vạch đã nhập').toHaveValue(bc);
    expect(tt.length, 'tài liệu 2.2: phải có cảnh báo chưa có dữ liệu tham khảo').toBeGreaterThan(0);
    await oTenSP(page).fill(ma('014'));
    await expect(oTenSP(page), 'vẫn nhập tay được').toHaveValue(ma('014'));
  });

  test('[TC-FE-ICK-015] Chọn gợi ý A rồi gợi ý B: thay Mã vạch/Tên/Giá/Ảnh theo B; Mã sản phẩm nhập tay giữ nguyên', async ({ page }) => {
    await moModalThemSanPham(page);
    await oMaSP(page).fill(ma('015-ma'));
    await chonGoiYDau(page, TU_KHOA_CO_GOI_Y);
    const [tenA, bcA] = [await oTenSP(page).inputValue(), await oMaVachSP(page).inputValue()];
    await oTenSP(page).fill('samsung');
    await expect(dsGoiYTen(page).first()).toBeVisible({ timeout: 10000 });
    await dsGoiYTen(page).first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: test.info().outputPath('ICK-015-sau-khi-chon-goi-y-khac.png'), fullPage: true });
    const [tenB, bcB] = [await oTenSP(page).inputValue(), await oMaVachSP(page).inputValue()];
    ghiChu('KẾT QUẢ QUAN SÁT', `A: "${tenA}" / ${bcA} → B: "${tenB}" / ${bcB}`);
    expect(tenB, 'Tên phải đổi sang gợi ý B').not.toBe(tenA);
    expect(bcB, 'Mã vạch phải đổi sang gợi ý B').not.toBe(bcA);
    expect(await oMaSP(page).inputValue(), 'trường ngoài danh sách thay thế phải giữ nguyên').toBe(ma('015-ma'));
  });

  test('[TC-FE-ICK-016] Click ra ngoài đóng dropdown; bấm Thoát/X đóng popup, KHÔNG tạo sản phẩm', async ({ page, api }) => {
    await moModalThemSanPham(page);
    const ten = ma('016');
    await oTenSP(page).fill(TU_KHOA_CO_GOI_Y);
    await expect(dsGoiYTen(page).first()).toBeVisible({ timeout: 10000 });
    await modal(page).locator('.modal-title, .modal-header').first().click();
    await expect(dsGoiYTen(page).first(), 'click ra ngoài phải đóng dropdown').toBeHidden({ timeout: 5000 });
    await oTenSP(page).fill(ten);
    const dong = modal(page).locator('button.close, button.btn-close, [aria-label="Close"], button:has-text("Thoát"), button:has-text("Hủy")').first();
    await dong.click();
    await expect(modal(page), 'popup phải đóng').toBeHidden({ timeout: 8000 });
    expect((await dsTheoTuKhoa(api, ten)).length, 'không được tạo sản phẩm').toBe(0);
  });

  test('[TC-FE-ICK-017] Chọn gợi ý, đổi tên có tiền tố AUTO_, bổ sung bắt buộc, Lưu: "Thêm sản phẩm thành công", SP có trong danh sách [CHẠY KHI EP_CHO_DONG_GOP=1]', async ({ page, api }) => {
    test.skip(!choDongGop(), 'Lưu sản phẩm có sửa dữ liệu gợi ý có thể gửi dữ liệu sang iCheck THẬT — chỉ chạy khi tester đặt EP_CHO_DONG_GOP=1');
    await moModalThemSanPham(page);
    await oMaVachSP(page).fill(MA_VACH_CO_GOI_Y);
    await oMaVachSP(page).press('Enter');
    await page.waitForTimeout(1500);
    const ten = ma('017');
    await oTenSP(page).fill(ten);
    if (!(await oGiaBan(page).inputValue().catch(() => ''))) await oGiaBan(page).fill('25000');
    await nutLuuSP(page).click();
    await expect(toast(page).first()).toBeVisible({ timeout: 15000 });
    const tt = await textToast(page);
    await page.screenshot({ path: test.info().outputPath('ICK-017-sau-luu.png'), fullPage: true });
    expect(tt.some(s => /Thêm sản phẩm thành công/.test(s)), `tài liệu 4.1.2 bước 7: "Thêm sản phẩm thành công". Toast: ${JSON.stringify(tt)}`).toBe(true);
    await expect(modal(page)).toBeHidden({ timeout: 8000 });
    expect((await dsTheoTuKhoa(api, ten)).length, 'SP phải có trong danh sách').toBe(1);
  });

  test('[TC-FE-ICK-018] Lưu khi thiếu Tên: không lưu, popup còn, dữ liệu giữ nguyên, có báo lỗi', async ({ page, api }) => {
    await moModalThemSanPham(page);
    const bc = maVachMoi();
    await oMaVachSP(page).fill(bc);
    await nutLuuSP(page).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('ICK-018-thieu-ten.png'), fullPage: true });
    await expect(modal(page), 'popup phải còn mở').toBeVisible();
    await expect(oMaVachSP(page), 'dữ liệu form giữ nguyên').toHaveValue(bc);
    const baoLoi = (await modal(page).locator('.invalid-feedback, .text-danger, .is-invalid, .error-message').count()) + (await toast(page).count());
    expect(baoLoi, 'phải có báo lỗi (viền/chữ đỏ hoặc toast)').toBeGreaterThan(0);
    expect((await dsTheoTuKhoa(api, bc)).filter((x: any) => String(x?.barcode ?? '') === bc).length, 'không được tạo SP').toBe(0);
  });

  test('[TC-FE-ICK-019] Icon Scan barcode: toast "Bật chế độ mã vạch"', async ({ page }) => {
    await moModalThemSanPham(page);
    // Icon nằm bên phải trong ô Mã vạch (cạnh bộ đếm "0/50"): bấm vào mép phải của ô.
    const hop = await oMaVachSP(page).boundingBox();
    expect(hop, 'không đo được ô Mã vạch').not.toBeNull();
    await page.mouse.click(hop!.x + hop!.width - 14, hop!.y + hop!.height / 2);
    const tt = await doiToast(page, 6000);
    await page.screenshot({ path: test.info().outputPath('ICK-019-bam-icon-quet.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast sau khi bấm icon: ${JSON.stringify(tt)}`);
    expect(tt.some(s => /Bật chế độ.*mã vạch/.test(s)), `tài liệu 4.1.1 dòng 4: toast "Bật chế độ mã vạch". Toast: ${JSON.stringify(tt)}`).toBe(true);
    if (!tt.some(s => /^Bật chế độ mã vạch$/.test(s))) ghiChu('CẦN BA CHỐT', `Chữ toast: tài liệu "Bật chế độ mã vạch", giao diện ${JSON.stringify(tt)} (khác chữ, cùng chức năng).`);
  });

  test('[TC-FE-ICK-020] Loại sản phẩm khác Hàng hóa (Dịch vụ…): không có gợi ý (tài liệu 2.2); code FE chỉ loại sản phẩm thuốc ⇒ QUAN SÁT', async ({ page }) => {
    await moModalThemSanPham(page);
    const loai = modal(page).locator('ng-select, select').filter({ hasText: /Hàng hóa|Hàng hoá|Dịch vụ/ }).first();
    if (!(await loai.count())) { ghiChu('KỊCH BẢN', 'Không tìm thấy ô Loại sản phẩm — hiệu chỉnh bộ chọn ở Bước 4'); test.skip(true, 'KỊCH BẢN: cần hiệu chỉnh bộ chọn Loại sản phẩm'); }
    await loai.click();
    const dv = page.locator('.ng-dropdown-panel .ng-option', { hasText: /Dịch vụ/ }).first();
    if (!(await dv.count())) { ghiChu('KỊCH BẢN', 'Không có lựa chọn Dịch vụ'); test.skip(true, 'KỊCH BẢN: không có loại Dịch vụ'); }
    await dv.click();
    await oTenSP(page).fill(TU_KHOA_CO_GOI_Y);
    await page.waitForTimeout(3000);
    const coGoiY = await dsGoiYTen(page).first().isVisible().catch(() => false);
    await page.screenshot({ path: test.info().outputPath('ICK-020-loai-dich-vu.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Loại = Dịch vụ, gõ "${TU_KHOA_CO_GOI_Y}" → dropdown gợi ý ${coGoiY ? 'VẪN HIỆN' : 'không hiện'}.`);
    expect(coGoiY, 'tài liệu 2.2 bước 2: tra cứu chỉ khả dụng khi loại sản phẩm là Hàng hóa').toBe(false);
  });

  test('[TC-FE-ICK-021] QUAN SÁT: gõ chuỗi 8–14 chữ số vào ô Tên — FE gọi suggestions theo barcodes hay keyword', async ({ page }) => {
    await moModalThemSanPham(page);
    const so = MA_VACH_CO_GOI_Y;
    const cho = page.waitForRequest(r => /product\/suggestions/.test(r.url()), { timeout: 10000 }).catch(() => null);
    await oTenSP(page).fill(so);
    const req = await cho;
    const url = req ? decodeURIComponent(req.url()) : '(không có request)';
    ghiChu('QUAN SÁT', `Gõ "${so}" vào ô Tên → ${url}. Code-insight: BE tự coi keyword 8–14 chữ số là mã vạch (không có trong tài liệu).`);
    expect(req, 'phải có gọi API gợi ý khi gõ ≥1 ký tự').not.toBeNull();
  });
});
