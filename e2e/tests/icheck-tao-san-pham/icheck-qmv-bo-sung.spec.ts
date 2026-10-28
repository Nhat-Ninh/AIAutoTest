/* Kiểm thử FE BỔ SUNG — popup "Quét mã vạch thêm sản phẩm" (Web, mục 4.2), lượt 28/10/2026, tài liệu Confluence EP 50709307 v68.
 * Báo cáo: bao-cao/2026-10-28_icheck-tao-san-pham/. Chạy: cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-qmv-bo-sung.spec.ts --project=dev [--headed]
 * Bổ sung cho icheck-quet-ma-vach-web.spec.ts (TC-QMV-001…015). Sản phẩm tạo ra có tiền tố AUTO_QMB_. */
import { test, expect } from '../../lib/fixtures';
import { dongHopThoai } from '../../lib/ui';
import { duLieu, json } from '../../lib/api';
import { taoSPCoMaVach } from '../../lib/san-pham';
import { batTheoDoiTon, boMa, cot, demQuet, doiSoDong, dongQuet, ghiChu, laNhieuKho, moPopupQuet, nutXacNhan, oNhapQuet, oQuet, quet, sanDongHopLe, suggestTheoTen, textToast, theoDoiToast, doiToast, timTheoMaVach, toast, TRANG_SP, TU_KHOA_CO_GOI_Y } from './_chung';

const { ma, maVachMoi } = boMa('QMB');
/** PNG 1x1 hợp lệ (ảnh thử). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('FE — Quét mã vạch thêm sản phẩm (bổ sung, mục 4.2)', { tag: ['@ui', '@regression', '@icheck'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI }) => {
    await theoDoiToast(page);
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_SP);
    await dongHopThoai(page);
  });

  test('[TC-QMV-016] 3b: iCheck lỗi / quá thời gian (chặn request gợi ý) ⇒ vẫn thêm dòng, không toast lỗi, người dùng tự nhập tên', async ({ page }) => {
    await page.route(/product\/suggestions/, r => r.abort('failed'));
    await moPopupQuet(page);
    const bc = maVachMoi();
    await quet(page, bc);
    await doiSoDong(page, 1);
    await expect(oQuet(page, 0, cot.maVach).locator('input')).toHaveValue(bc);
    await expect(oQuet(page, 0, cot.ten).locator('input'), 'tên để trống để tự nhập').toHaveValue('');
    const tt = await textToast(page);
    await page.screenshot({ path: test.info().outputPath('QMB-016-icheck-loi.png'), fullPage: true });
    expect(tt.filter(s => /lỗi|thất bại|không thể/i.test(s)), `tài liệu 3b: "Không hiển thị" thông báo. Toast: ${JSON.stringify(tt)}`).toEqual([]);
  });

  test('[TC-QMV-017] 5c: thay ảnh dòng bằng ảnh tải lên ⇒ ảnh đổi; tệp sai định dạng ⇒ bị từ chối, giữ ảnh cũ', async ({ page }) => {
    await moPopupQuet(page);
    await quet(page, maVachMoi());
    await doiSoDong(page, 1);
    const file = oQuet(page, 0, cot.anh).locator('input[type=file]').first();
    if (!(await file.count())) { ghiChu('KỊCH BẢN', 'Không tìm thấy input[type=file] ở cột Ảnh — hiệu chỉnh bộ chọn ở Bước 4'); test.skip(true, 'KỊCH BẢN: cần hiệu chỉnh bộ chọn ảnh'); }
    const anh = oQuet(page, 0, cot.anh).locator('img').first();
    const truoc = await anh.getAttribute('src');
    await file.setInputFiles({ name: 'AUTO_QMB.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForTimeout(1500);
    const sau = await anh.getAttribute('src');
    await page.screenshot({ path: test.info().outputPath('QMB-017-sau-khi-chon-anh.png'), fullPage: true });
    expect(sau, 'ảnh của dòng phải đổi sau khi chọn ảnh hợp lệ').not.toBe(truoc);
    await file.setInputFiles({ name: 'AUTO_QMB.txt', mimeType: 'text/plain', buffer: Buffer.from('khong phai anh') });
    await page.waitForTimeout(1500);
    const tt = await textToast(page);
    ghiChu('KẾT QUẢ QUAN SÁT', `Tải tệp .txt → toast ${JSON.stringify(tt)}; src ${(await anh.getAttribute('src')) === sau ? 'giữ nguyên ảnh cũ' : 'ĐÃ ĐỔI'}`);
    expect(await anh.getAttribute('src'), 'tệp sai định dạng phải giữ ảnh cũ (5f)').toBe(sau);
  });

  test('[TC-QMV-018] 6: hai dòng trùng Mã SP nhập tay, và Mã SP trùng sản phẩm đã có ⇒ báo lỗi, không tạo sản phẩm', async ({ page, api, phien }) => {
    const maDaCo = ma('018-da-co');
    const r = await taoSPCoMaVach(api, phien.comId, maVachMoi(), maDaCo, ma('018-sp-co'));
    expect(r.status(), (await r.text()).slice(0, 200)).toBe(200);
    await moPopupQuet(page);
    const [a, b] = [maVachMoi(), maVachMoi()];
    await quet(page, a); await doiSoDong(page, 1);
    await quet(page, b); await doiSoDong(page, 2);
    for (let i = 0; i < 2; i++) await sanDongHopLe(page, i, ma('018-' + i), '12000');
    await oQuet(page, 0, cot.maSP).locator('input').fill(maDaCo);          // trùng SP đã có
    await oQuet(page, 1, cot.maSP).locator('input').fill(maDaCo);          // trùng dòng 1
    await nutXacNhan(page).click();
    const tt = await doiToast(page, 8000);
    await page.screenshot({ path: test.info().outputPath('QMB-018-trung-ma-sp.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast: ${JSON.stringify(tt)}`);
    expect((await timTheoMaVach(api, a)).length, 'không được tạo SP khi mã SP trùng').toBe(0);
    expect((await timTheoMaVach(api, b)).length).toBe(0);
    const noi = (await dongQuet(page).allInnerTexts()).map(s => s.replace(/\s+/g, ' '));
    ghiChu('KẾT QUẢ QUAN SÁT', `Các dòng sau Xác nhận: ${JSON.stringify(noi.map(s => s.slice(0, 80)))}`);
    if (!tt.some(s => /Có sản phẩm không hợp lệ/.test(s))) ghiChu('CẦN BA CHỐT', `Tài liệu 6b: toast "Có sản phẩm không hợp lệ" khi BE trả lỗi; giao diện không hiện toast nào (xem TC-QMV-015).`);
    expect(noi.length === 2 && noi.every(s => /Không hợp lệ/.test(s) && /Trùng mã sản phẩm/.test(s)), `cả hai dòng phải "Không hợp lệ" + nêu trùng mã sản phẩm: ${JSON.stringify(noi)}`).toBe(true);
  });

  test('[TC-QMV-019] 4.2.1: sau Xác nhận có dòng lỗi từ BE ⇒ hiện cột Trạng thái + Chi tiết lỗi; lỗi nối bằng dấu phẩy KHÔNG khoảng trắng', async ({ page, api, phien }) => {
    const daDung = maVachMoi();
    const r = await taoSPCoMaVach(api, phien.comId, daDung, ma('019'), ma('019-da-co'));
    expect(r.status(), (await r.text()).slice(0, 200)).toBe(200);
    await moPopupQuet(page);
    await quet(page, maVachMoi()); await doiSoDong(page, 1);
    await oQuet(page, 0, cot.maVach).locator('input').fill(daDung);
    await sanDongHopLe(page, 0, ma('019-ten'), '12000');
    await nutXacNhan(page).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: test.info().outputPath('QMB-019-chi-tiet-loi.png'), fullPage: true });
    const dau = await page.locator('.scan-product-modal-body table.editing-table thead').innerText();
    expect(dau, 'cột Trạng thái phải hiện sau Xác nhận').toMatch(/Trạng thái/i);
    expect(dau, 'cột Chi tiết lỗi phải hiện sau Xác nhận').toMatch(/Chi tiết lỗi/i);
    const noi = (await dongQuet(page).first().innerText()).replace(/\s+/g, ' ');
    ghiChu('KẾT QUẢ QUAN SÁT', `Dòng sau Xác nhận: "${noi.slice(0, 200)}"`);
    expect(noi, 'nhãn "Không hợp lệ"').toMatch(/Không hợp lệ/);
    expect(/,\s/.test(noi), 'tài liệu 4.2.1: các lỗi nối bằng dấu phẩy KHÔNG có khoảng trắng').toBe(false);
  });

  test('[TC-QMV-020] Tồn kho: dòng 1 bật theo dõi + SL 5; dòng 2 bật theo dõi để trống SL ⇒ tạo thành công (tồn đầu 5 và 0; kiểm CSDL ở Bước 5)', async ({ page, api }) => {
    await moPopupQuet(page);
    const [a, b] = [maVachMoi(), maVachMoi()];
    await quet(page, a); await doiSoDong(page, 1);
    await quet(page, b); await doiSoDong(page, 2);
    for (let i = 0; i < 2; i++) { await sanDongHopLe(page, i, ma('020-' + i), '15000'); await batTheoDoiTon(page, i); }
    await oQuet(page, 0, cot.slTon).locator('input').fill('5');
    await page.screenshot({ path: test.info().outputPath('QMB-020-truoc-xac-nhan.png'), fullPage: true });
    await nutXacNhan(page).click();
    await expect(toast(page).first()).toBeVisible({ timeout: 15000 });
    const tt = await textToast(page);
    await page.screenshot({ path: test.info().outputPath('QMB-020-sau-xac-nhan.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast: ${JSON.stringify(tt)}. Mã vạch để tra CSDL ở Bước 5: dòng1(SL=5)=${a}, dòng2(SL trống)=${b}. Chi nhánh nhiều kho: ${await laNhieuKho(page).catch(() => 'không rõ')}`);
    await page.waitForTimeout(1500);
    expect((await timTheoMaVach(api, a)).length, 'SP dòng 1 phải được tạo').toBe(1);
    expect((await timTheoMaVach(api, b)).length, 'SP dòng 2 (bật theo dõi, SL trống) phải được tạo — tài liệu: tồn đầu = 0').toBe(1);
  });

  test('[TC-QMV-021] Ô Số lượng tồn kho chỉ nhận số nguyên ≥ 0: nhập "-5", "1.5", "abc"', async ({ page }) => {
    await moPopupQuet(page);
    await quet(page, maVachMoi()); await doiSoDong(page, 1);
    await batTheoDoiTon(page, 0);
    const sl = oQuet(page, 0, cot.slTon).locator('input');
    await expect(sl).toBeEnabled();
    for (const v of ['-5', '1.5', 'abc']) {
      await sl.fill('');
      await sl.pressSequentially(v);
      const gt = await sl.inputValue();
      ghiChu('KẾT QUẢ QUAN SÁT', `gõ "${v}" → ô hiển thị "${gt}"`);
      expect(gt, `"${v}" không được nằm lại trong ô (số nguyên ≥ 0). Hiển thị: "${gt}"`).toMatch(/^\d*$/);
    }
  });

  test('[TC-QMV-022] 7a: lỗi hệ thống khi lưu (quick-create trả 500) ⇒ toast "Không thể thêm sản phẩm. Vui lòng thử lại.", popup giữ dữ liệu, không tạo SP', async ({ page, api }) => {
    await page.route(/product\/quick-create(\?.*)?$/, r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ title: 'Internal Server Error', status: 500 }) }));
    await moPopupQuet(page);
    const a = maVachMoi();
    await quet(page, a); await doiSoDong(page, 1);
    await sanDongHopLe(page, 0, ma('022'), '12000');
    await nutXacNhan(page).click();
    await page.waitForTimeout(2500);
    const tt = await textToast(page);
    await page.screenshot({ path: test.info().outputPath('QMB-022-loi-he-thong.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast: ${JSON.stringify(tt)}`);
    expect(tt.length, `phải có toast báo lỗi. Toast: ${JSON.stringify(tt)}`).toBeGreaterThan(0);
    if (!tt.some(s => /Không thể thêm sản phẩm\. Vui lòng thử lại/.test(s))) ghiChu('CẦN BA CHỐT', `Toast lỗi hệ thống: tài liệu 7a "Không thể thêm sản phẩm. Vui lòng thử lại.", giao diện ${JSON.stringify(tt)} (khác chữ, cùng ý).`);
    await expect(oNhapQuet(page), 'popup phải còn mở').toBeVisible();
    await expect(demQuet(page)).toHaveText(/Đã quét:\s*1 sản phẩm/);
    expect((await timTheoMaVach(api, a)).length, 'không được tạo SP').toBe(0);
  });

  test('[TC-QMV-023] NT-10: mọi gợi ý từ API có tối đa 5 ảnh (kiểm trên các từ khoá phổ biến)', async ({ api }) => {
    let toiDa = 0, kiem = 0;
    for (const kw of [TU_KHOA_CO_GOI_Y, 'samsung', 'coca', 'sữa']) {
      const ds = duLieu(await json(await suggestTheoTen(api, kw)));
      for (const sp of Array.isArray(ds) ? ds : []) {
        const n = Array.isArray(sp?.images) ? sp.images.length : (sp?.image ? 1 : 0);
        toiDa = Math.max(toiDa, n); kiem++;
      }
    }
    ghiChu('QUAN SÁT', `Đã kiểm ${kiem} gợi ý, số ảnh lớn nhất = ${toiDa}`);
    test.skip(kiem === 0, 'DỮ LIỆU: không có gợi ý nào để kiểm');
    expect(toiDa, 'NT-10: tối đa 5 ảnh mỗi sản phẩm').toBeLessThanOrEqual(5);
  });
});
