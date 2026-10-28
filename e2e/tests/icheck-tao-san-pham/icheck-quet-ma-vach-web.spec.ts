/* Kiểm thử FE — "Quét mã vạch thêm sản phẩm" (Web). Nguồn nghiệp vụ: Confluence EP "Tạo sản phẩm từ dữ liệu iCheck" (pageId 50709307, bản 67) mục 4.2
 *   (4.2.1 giao diện · 4.2.2 luồng chính 1–8 / rẽ nhánh 2a 3a 5a 5b 5c 6a / lỗi 2b 3b 6b 7a · 4.2.3 BR-01, BR-02). Báo cáo: bao-cao/2026-10-23_icheck-quet-ma-vach-web/.
 * Chạy:  cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-quet-ma-vach-web.spec.ts --project=dev [--headed]
 * Quy ước: câu chữ thông báo trích NGUYÊN VĂN từ tài liệu. Chỗ tài liệu và giao diện khác nhau về mặt chữ / nhãn (không ảnh hưởng chức năng) thì ghi annotation
 * "CẦN BA CHỐT" và test vẫn đạt; chỗ HÀNH VI khác tài liệu thì test TRƯỢT (là phát hiện cần xem). Mọi sản phẩm tạo ra có tiền tố AUTO_QMV_. */
import type { Page } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { boSinhMa } from '../../lib/du-lieu';
import { dongHopThoai } from '../../lib/ui';
import { dsTuDuLieu, duLieu, json } from '../../lib/api';
import { dsTheoTuKhoa, taoSPCoMaVach } from '../../lib/san-pham';
import { textToast, theoDoiToast } from './_chung';

const { ma, hauTo } = boSinhMa('AUTO_QMV_');
const TRANG_SP = process.env.EP_TRANG_SP || '/easy-pos/product/product';
let dem = 0;
const maVachMoi = () => `298${hauTo}${String(dem++).padStart(2, '0')}`;     // tiền tố 298 + dấu thời gian: không trùng mã vạch thật (893…) và không trùng giữa các lần chạy

const ghiChu = (type: string, description: string) => test.info().annotations.push({ type, description });
const oNhap = (page: Page) => page.locator('input.scan-input');
const dong = (page: Page) => page.locator('.scan-product-modal-body table.editing-table tbody tr.table-custom-body');
const demQuet = (page: Page) => page.locator('.scan-count-text');
const nutXacNhan = (page: Page) => page.locator('.scan-product-footer button.btn-primary');
const nutHuy = (page: Page) => page.locator('.scan-product-footer button.btn-outline-primary');
const toast = (page: Page) => page.locator('.toast-message, .toast');
const cot = { anh: 0, maVach: 1, maSP: 2, ten: 3, dvt: 4, giaNhap: 5, giaBan: 6, kho: 7, slTon: 8, xoa: 9 };
const o = (page: Page, d: number, c: number) => dong(page).nth(d).locator('td').nth(c);

async function moPopup(page: Page) {
  await dongHopThoai(page);
  const nut = page.getByRole('button', { name: /Quét mã vạch/ }).first();
  await nut.click({ timeout: 5000 }).catch(async () => { await dongHopThoai(page); await nut.click(); });
  await expect(oNhap(page)).toBeVisible();
}
async function quet(page: Page, maVach: string) {
  await oNhap(page).fill(maVach);
  await oNhap(page).press('Enter');
}
/** Đợi số dòng của bảng đạt n (không chờ cố định). */
const doiSoDong = (page: Page, n: number) => expect(dong(page), `bảng phải có ${n} dòng`).toHaveCount(n, { timeout: 15000 });
/** Chi nhánh nhiều kho ⇔ cột "Theo dõi tồn kho" là dropdown (ng-select); chi nhánh 1 kho ⇔ công tắc. */
const laNhieuKho = async (page: Page) => (await o(page, 0, cot.kho).locator('ng-select').count()) > 0;
async function sanDongHopLe(page: Page, d: number, ten: string, gia = '18000') {
  const oTen = o(page, d, cot.ten).locator('input');
  if (!(await oTen.inputValue())) await oTen.fill(ten);
  await o(page, d, cot.giaBan).locator('input').fill(gia);
}
async function timTheoMaVach(api: any, bc: string) {
  return (await dsTheoTuKhoa(api, bc)).filter((x: any) => String(x?.barcode ?? '') === bc);
}

// Không dùng serial: các test độc lập (mỗi test mở popup riêng), một test trượt không được làm các test sau không chạy (BH-017).

test.describe('FE — Quét mã vạch thêm sản phẩm (Web, mục 4.2)', { tag: ['@ui', '@regression', '@icheck'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI }) => {
    await theoDoiToast(page);
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_SP);
    await dongHopThoai(page);
  });

  test('[TC-QMV-001] 4.2.1/bước 1: bấm nút mở popup — bảng trống, con trỏ ở ô nhập, "Đã quét: 0 sản phẩm", nút Xác nhận bị vô hiệu', { tag: '@smoke' }, async ({ page }) => {
    await moPopup(page);
    await expect(dong(page)).toHaveCount(0);
    await expect(oNhap(page), 'con trỏ phải đặt sẵn ở ô nhập mã vạch').toBeFocused();
    await expect(demQuet(page)).toHaveText(/Đã quét:\s*0 sản phẩm/);
    await expect(nutXacNhan(page), 'nút Thêm / Xác nhận phải disable khi bảng trống').toBeDisabled();
    const ph = await oNhap(page).getAttribute('placeholder');
    if (ph !== 'Quét mã vạch hoặc nhập mã vạch rồi nhấn Enter') ghiChu('CẦN BA CHỐT', `Placeholder ô nhập: tài liệu "Quét mã vạch hoặc nhập mã vạch rồi nhấn Enter", giao diện "${ph}".`);
    const nhanNut = (await page.locator('.scan-product-footer button').allInnerTexts()).map(s => s.trim());
    if (!nhanNut.includes('Thêm vào danh sách')) ghiChu('CẦN BA CHỐT', `Nút cuối popup: tài liệu (bảng 4.2.1) "Thêm vào danh sách", giao diện ${JSON.stringify(nhanNut)} (luồng 4.2.2 bước 6 của tài liệu lại gọi là "Xác nhận").`);
    await page.screenshot({ path: test.info().outputPath('QMV-001-popup-mo.png'), fullPage: true });
  });

  test('[TC-QMV-002] Bước 2–3: quét 1 mã mới ⇒ thêm 1 dòng, mã vạch đúng, Mã sản phẩm trống, ô nhập xoá trắng và giữ con trỏ, "Đã quét: 1 sản phẩm"', async ({ page }) => {
    await moPopup(page);
    const bc = maVachMoi();
    await quet(page, bc);
    await doiSoDong(page, 1);
    await expect(o(page, 0, cot.maVach).locator('input')).toHaveValue(bc);
    await expect(o(page, 0, cot.maSP).locator('input'), 'Mã sản phẩm phải để trống (tự sinh khi lưu)').toHaveValue('');
    await expect(oNhap(page), 'ô nhập phải được xoá trắng sau mỗi lần xử lý').toHaveValue('');
    await expect(oNhap(page), 'phải giữ con trỏ để quét tiếp').toBeFocused();
    await expect(demQuet(page)).toHaveText(/Đã quét:\s*1 sản phẩm/);
    await page.screenshot({ path: test.info().outputPath('QMV-002-quet-1-ma.png'), fullPage: true });
  });

  test('[TC-QMV-003] Bước 4: quét liên tiếp 3 mã khác nhau ⇒ 3 dòng đúng thứ tự quét, "Đã quét: 3 sản phẩm" (BR-01: danh sách cuộn dọc, không phân trang)', async ({ page }) => {
    await moPopup(page);
    const ds = [maVachMoi(), maVachMoi(), maVachMoi()];
    for (let i = 0; i < ds.length; i++) { await quet(page, ds[i]); await doiSoDong(page, i + 1); }
    for (let i = 0; i < ds.length; i++) await expect(o(page, i, cot.maVach).locator('input')).toHaveValue(ds[i]);
    await expect(demQuet(page)).toHaveText(/Đã quét:\s*3 sản phẩm/);
    expect(await page.locator('.scan-product-modal-body .pagination, .scan-product-modal-body ngb-pagination').count(), 'BR-01: không phân trang').toBe(0);
    const stt = await page.locator('.scan-product-modal-body table.editing-table thead').innerText();
    ghiChu('KẾT QUẢ QUAN SÁT', `Cột STT / Trạng thái / Chi tiết lỗi ${/STT/i.test(stt) ? 'ĐÃ hiện' : 'CHƯA hiện'} trước khi bấm Xác nhận (tài liệu: ẩn cho tới khi bấm Xác nhận).`);
    expect(/STT/i.test(stt), 'tài liệu: các cột STT / Trạng thái / Chi tiết lỗi chỉ hiện khi bấm Xác nhận').toBe(false);
  });

  test('[TC-QMV-004] 2a: quét lại mã đã có trong bảng ⇒ toast "Mã vạch vừa quét đã có trong danh sách", không thêm dòng, không đổi dữ liệu dòng cũ, ô nhập xoá trắng', async ({ page }) => {
    await moPopup(page);
    const bc = maVachMoi();
    await quet(page, bc);
    await doiSoDong(page, 1);
    await o(page, 0, cot.ten).locator('input').fill(ma('004-ten-da-sua'));
    await o(page, 0, cot.giaBan).locator('input').fill('12345');
    await quet(page, bc);
    await expect(toast(page).filter({ hasText: 'Mã vạch vừa quét đã có trong danh sách' }).first()).toBeVisible({ timeout: 8000 });
    await expect(dong(page)).toHaveCount(1);
    await expect(o(page, 0, cot.ten).locator('input'), 'không được đổi dữ liệu dòng đã có').toHaveValue(ma('004-ten-da-sua'));
    await expect(oNhap(page)).toHaveValue('');
    await expect(demQuet(page)).toHaveText(/Đã quét:\s*1 sản phẩm/);
  });

  test('[TC-QMV-005] 2b: quét mã vạch đã được dùng cho sản phẩm trong cửa hàng ⇒ có toast báo mã vạch đã dùng (nêu tên sản phẩm), không thêm dòng', async ({ page, api, phien }) => {
    const bc = maVachMoi();
    const r = await taoSPCoMaVach(api, phien.comId, bc, ma('005'), ma('005-da-co'));
    expect(r.status(), `tạo sản phẩm tiền đề lỗi: ${(await r.text()).slice(0, 200)}`).toBe(200);
    await moPopup(page);
    await quet(page, bc);
    // Giao diện thật: "Mã vạch đã được dùng cho sản phẩm <tên sản phẩm>". Tài liệu: "Mã vạch đã được sử dụng cho sản phẩm khác." ⇒ khác chữ (hành vi đúng) → CẦN BA CHỐT.
    const tChung = toast(page).filter({ hasText: /Mã vạch đã được (dùng|sử dụng) cho sản phẩm/ }).first();
    await expect(tChung, 'phải báo mã vạch đã dùng').toBeVisible({ timeout: 10000 });
    const chu = (await tChung.innerText()).trim();
    if (!/Mã vạch đã được sử dụng cho sản phẩm khác/.test(chu)) ghiChu('CẦN BA CHỐT', `Thông báo mã vạch đã dùng (2b): tài liệu "Mã vạch đã được sử dụng cho sản phẩm khác.", giao diện "${chu.slice(0, 100)}".`);
    await expect(dong(page), 'không được thêm dòng').toHaveCount(0);
    await expect(oNhap(page)).toHaveValue('');
    await page.screenshot({ path: test.info().outputPath('QMV-005-ma-vach-da-dung.png'), fullPage: true });
  });

  test('[TC-QMV-006] 3a: mã vạch không có dữ liệu iCheck ⇒ vẫn thêm dòng với mã đã quét, ảnh mặc định, Tên sản phẩm để trống', async ({ page }) => {
    await moPopup(page);
    const bc = maVachMoi();
    await quet(page, bc);
    await doiSoDong(page, 1);
    await expect(o(page, 0, cot.maVach).locator('input')).toHaveValue(bc);
    await expect(o(page, 0, cot.ten).locator('input')).toHaveValue('');
    await expect(o(page, 0, cot.anh).locator('.no-image-placeholder'), 'ảnh mặc định').toBeVisible();
  });

  test('[TC-QMV-007] 5b: xoá dòng ⇒ "Đã quét" giảm; hết dòng thì nút Xác nhận bị vô hiệu', async ({ page }) => {
    await moPopup(page);
    await quet(page, maVachMoi()); await doiSoDong(page, 1);
    await quet(page, maVachMoi()); await doiSoDong(page, 2);
    await expect(demQuet(page)).toHaveText(/Đã quét:\s*2/);
    await o(page, 0, cot.xoa).locator('.icon-trash').click();
    await doiSoDong(page, 1);
    await expect(demQuet(page)).toHaveText(/Đã quét:\s*1/);
    await expect(nutXacNhan(page)).toBeEnabled();
    await o(page, 0, cot.xoa).locator('.icon-trash').click();
    await doiSoDong(page, 0);
    await expect(demQuet(page)).toHaveText(/Đã quét:\s*0/);
    await expect(nutXacNhan(page)).toBeDisabled();
  });

  test('[TC-QMV-008] 6a: bấm Hủy ⇒ đóng popup, KHÔNG lưu gì (sản phẩm đã quét không được tạo)', async ({ page, api }) => {
    await moPopup(page);
    const bc = maVachMoi();
    await quet(page, bc); await doiSoDong(page, 1);
    await sanDongHopLe(page, 0, ma('008'));
    await nutHuy(page).click();
    await expect(oNhap(page), 'popup phải đóng').toBeHidden({ timeout: 8000 });
    await page.waitForTimeout(800);
    expect((await timTheoMaVach(api, bc)).length, 'Hủy không được tạo sản phẩm').toBe(0);
  });

  test('[TC-QMV-009] 6: bấm Xác nhận khi dòng thiếu Tên + Giá bán ⇒ toast "Vui lòng kiểm tra lại thông tin sản phẩm", không tạo sản phẩm, ô lỗi được tô', async ({ page, api }) => {
    await moPopup(page);
    const bc = maVachMoi();
    await quet(page, bc); await doiSoDong(page, 1);
    await nutXacNhan(page).click();
    await expect(toast(page).filter({ hasText: 'Vui lòng kiểm tra lại thông tin sản phẩm' }).first()).toBeVisible({ timeout: 8000 });
    const loi = await dong(page).first().locator('.is-invalid, .ng-invalid.ng-touched, .error, .invalid-input, input.ng-invalid').count();
    expect(loi, 'ô bắt buộc còn trống phải được đánh dấu lỗi (viền đỏ)').toBeGreaterThan(0);
    await page.waitForTimeout(800);
    expect((await timTheoMaVach(api, bc)).length).toBe(0);
    await page.screenshot({ path: test.info().outputPath('QMV-009-thieu-ten-gia.png'), fullPage: true });
  });

  /** Sau khi sửa Mã vạch: ghi nhận có báo lỗi NGAY tại ô không (tài liệu 4.2.1 / 5a nói có); rồi điền đủ Tên + Giá bán và bấm Xác nhận để kiểm chặn cuối cùng. */
  async function suaMaVachRoiXacNhan(page: Page, dongSo: number, maMoi: string) {
    const oMV = o(page, dongSo, cot.maVach).locator('input');
    await oMV.fill(maMoi);
    await oMV.press('Tab');
    await page.waitForTimeout(1500);
    const ngay = ((await dong(page).nth(dongSo).locator('.invalid-feedback, .text-danger, .error-message, .is-invalid').count()) > 0)
      || /Mã vạch đã được|đã có trong danh sách|trùng/i.test((await toast(page).allInnerTexts()).join(' '));
    ghiChu('KẾT QUẢ QUAN SÁT', `Sửa Mã vạch thành mã trùng: ${ngay ? 'CÓ báo lỗi ngay tại ô' : 'KHÔNG báo lỗi ngay (chỉ kiểm khi bấm Xác nhận)'}.`);
    if (!ngay) ghiChu('CẦN BA CHỐT', 'Tài liệu 4.2.1 / 5a: sửa Mã vạch thì hệ thống kiểm tra lại và báo "Mã vạch đã được sử dụng cho sản phẩm khác" ngay tại ô; giao diện không báo cho tới khi bấm Xác nhận.');
    await sanDongHopLe(page, dongSo, ma('sua-' + dongSo), '12000');
    await nutXacNhan(page).click();
    await page.waitForTimeout(2500);
    return ngay;
  }

  test('[TC-QMV-010] 5a/6: sửa Mã vạch của một dòng thành mã ĐÃ DÙNG trong cửa hàng rồi Xác nhận ⇒ dòng "Không hợp lệ" + "Chi tiết lỗi" nêu trùng mã vạch, KHÔNG tạo sản phẩm, popup còn mở', async ({ page, api, phien }) => {
    const daDung = maVachMoi();
    const r = await taoSPCoMaVach(api, phien.comId, daDung, ma('010'), ma('010-da-co'));
    expect(r.status(), `tạo sản phẩm tiền đề lỗi: ${(await r.text()).slice(0, 200)}`).toBe(200);
    await moPopup(page);
    await quet(page, maVachMoi()); await doiSoDong(page, 1);
    await suaMaVachRoiXacNhan(page, 0, daDung);
    const noiDong = (await dong(page).first().innerText()).replace(/\s+/g, ' ');
    await page.screenshot({ path: test.info().outputPath('QMV-010-sua-ma-vach-da-dung.png'), fullPage: true });
    expect(noiDong, `dòng phải ghi "Không hợp lệ" kèm lý do trùng mã vạch. Dòng: "${noiDong.slice(0, 160)}"`).toMatch(/Không hợp lệ/);
    expect(noiDong, 'Chi tiết lỗi phải nêu trùng mã vạch').toMatch(/mã vạch/i);
    await expect(oNhap(page), 'popup phải còn mở để người dùng sửa').toBeVisible();
    expect((await timTheoMaVach(api, daDung)).length, 'vẫn chỉ có đúng 1 sản phẩm mang mã vạch này (không tạo thêm)').toBe(1);
  });

  /** Viền ô có đỏ (dấu hiệu "highlight ô lỗi")? Đọc màu viền thật của ô: R cao, G và B thấp. */
  const vienDo = (loc: ReturnType<Page['locator']>) => loc.evaluate(el => {
    const m = getComputedStyle(el).borderTopColor.match(/\d+/g) || [];
    return +m[0] > 150 && +m[1] < 110 && +m[2] < 110;
  });

  test('[TC-QMV-011] 6 (kiểm phía giao diện): dòng 2 có Mã vạch trùng dòng 1 rồi Xác nhận ⇒ toast "Vui lòng kiểm tra lại thông tin sản phẩm", ô Mã vạch trùng viền đỏ, KHÔNG tạo sản phẩm', async ({ page, api }) => {
    await moPopup(page);
    const a = maVachMoi(), b = maVachMoi();
    await quet(page, a); await doiSoDong(page, 1);
    await quet(page, b); await doiSoDong(page, 2);
    await sanDongHopLe(page, 0, ma('011-0'), '11000');
    await suaMaVachRoiXacNhan(page, 1, a);
    await page.screenshot({ path: test.info().outputPath('QMV-011-sua-ma-vach-trung-dong.png'), fullPage: true });
    const tt = (await toast(page).allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
    expect(tt.some(s => /Vui lòng kiểm tra lại thông tin sản phẩm/.test(s)), `tài liệu bước 6: thông báo "Vui lòng kiểm tra lại thông tin sản phẩm". Toast: ${JSON.stringify(tt)}`).toBe(true);
    expect(await vienDo(o(page, 1, cot.maVach).locator('input')), 'ô Mã vạch của dòng trùng phải được tô viền đỏ').toBe(true);
    expect((await timTheoMaVach(api, a)).length, 'không tạo sản phẩm nào khi còn dòng lỗi (tài liệu: "không lưu")').toBe(0);
  });

  test('[TC-QMV-015] 6b (lỗi do BE): dòng có Mã vạch đã dùng trong cửa hàng ⇒ Xác nhận ⇒ toast "Có sản phẩm không hợp lệ" (không được báo thành công); dòng "Không hợp lệ"', async ({ page, api, phien }) => {
    const daDung = maVachMoi();
    const r = await taoSPCoMaVach(api, phien.comId, daDung, ma('015'), ma('015-da-co'));
    expect(r.status(), `tạo sản phẩm tiền đề lỗi: ${(await r.text()).slice(0, 200)}`).toBe(200);
    await moPopup(page);
    await quet(page, maVachMoi()); await doiSoDong(page, 1);
    await suaMaVachRoiXacNhan(page, 0, daDung);
    const tt = await textToast(page);       // toast đã ghi lại từ đầu (theoDoiToast) — đọc tại một thời điểm cố định dễ hụt
    await page.screenshot({ path: test.info().outputPath('QMV-015-toast-khi-co-dong-loi-tu-BE.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast sau Xác nhận khi BE báo dòng lỗi: ${JSON.stringify(tt)}.`);
    expect(tt.some(s => /thành công/i.test(s)), `KHÔNG được báo "thành công" khi còn dòng không hợp lệ. Toast: ${JSON.stringify(tt)}`).toBe(false);
    expect(tt.some(s => /Có sản phẩm không hợp lệ/.test(s)), `tài liệu 6b: toast "Có sản phẩm không hợp lệ". Giao diện hiện: ${JSON.stringify(tt)}`).toBe(true);
  });


  test('[TC-QMV-012] Hiển thị theo số kho: nhiều kho ⇒ dropdown "Chọn kho"; 1 kho ⇒ công tắc tắt; Số lượng tồn kho bị vô hiệu (hiện 0) tới khi chọn kho / bật công tắc', async ({ page }) => {
    await moPopup(page);
    await quet(page, maVachMoi()); await doiSoDong(page, 1);
    const nhieu = await laNhieuKho(page);
    ghiChu('KẾT QUẢ QUAN SÁT', `Chi nhánh đang test có ${nhieu ? 'từ 2 kho trở lên (luồng 1: dropdown)' : '1 kho (luồng 2: công tắc)'}.`);
    const sl = o(page, 0, cot.slTon).locator('input');
    await expect(sl, 'Số lượng tồn kho phải disable khi chưa chọn kho / chưa bật theo dõi').toBeDisabled();
    if (nhieu) {
      await expect(o(page, 0, cot.kho)).toContainText(/Chọn kho/);
      await o(page, 0, cot.kho).locator('ng-select').click();
      const opt = page.locator('.ng-dropdown-panel .ng-option').first();
      await expect(opt, 'dropdown kho phải có ít nhất một kho đang hoạt động').toBeVisible();
      await opt.click();
    } else {
      const congTac = o(page, 0, cot.kho).locator('input[type=checkbox], .form-check-input, .custom-control-input, .switch').first();
      await congTac.click({ force: true });
    }
    await expect(sl, 'sau khi chọn kho / bật công tắc: ô Số lượng tồn kho phải nhập được').toBeEnabled();
    await sl.fill('5');
    await expect(sl).toHaveValue('5');
    await page.screenshot({ path: test.info().outputPath('QMV-012-ton-kho.png'), fullPage: true });
  });

  test('[TC-QMV-013] BR-02: máy quét gõ nhanh khi con trỏ đang ở ô Tên của một dòng ⇒ vẫn thêm dòng mới, KHÔNG ghi ký tự vào ô đang chọn', async ({ page }) => {
    await moPopup(page);
    await quet(page, maVachMoi()); await doiSoDong(page, 1);
    const oTen = o(page, 0, cot.ten).locator('input');
    await oTen.fill(ma('013-dang-go'));
    await oTen.click();
    const bc = maVachMoi();
    await page.keyboard.type(bc, { delay: 5 });      // máy quét: chuỗi ký tự rất nhanh rồi Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const tenSau = await oTen.inputValue();
    const soDong = await dong(page).count();
    await page.screenshot({ path: test.info().outputPath('QMV-013-quet-khi-dang-go.png'), fullPage: true });
    expect(tenSau, `ô Tên đang chọn bị ghi chen ký tự của máy quét: "${tenSau}"`).toBe(ma('013-dang-go'));
    expect(soDong, 'phải thêm một dòng mới cho mã vừa quét').toBe(2);
  });

  test('[TC-QMV-014] Bước 6–8: 2 dòng hợp lệ ⇒ Xác nhận ⇒ thông báo "Đã thêm 2 sản phẩm", đóng popup, cả hai sản phẩm có trong danh sách (mã SP trống ⇒ tự sinh)', { tag: '@smoke' }, async ({ page, api }) => {
    await moPopup(page);
    const a = maVachMoi(), b = maVachMoi();
    await quet(page, a); await doiSoDong(page, 1);
    await quet(page, b); await doiSoDong(page, 2);
    const nhieu = await laNhieuKho(page);
    for (let i = 0; i < 2; i++) await sanDongHopLe(page, i, ma('014-' + i), '19000');
    await page.screenshot({ path: test.info().outputPath('QMV-014-truoc-xac-nhan.png'), fullPage: true });
    await nutXacNhan(page).click();
    const thongBao = toast(page).first();
    await expect(thongBao, 'phải có thông báo kết quả').toBeVisible({ timeout: 15000 });
    const noiToast = (await toast(page).allInnerTexts()).join(' | ');
    await page.screenshot({ path: test.info().outputPath('QMV-014-sau-xac-nhan.png'), fullPage: true });
    if (!/Đã thêm 2 sản phẩm/.test(noiToast)) ghiChu('CẦN BA CHỐT', `Thông báo thành công: tài liệu "Đã thêm X sản phẩm" (X=2), giao diện: "${noiToast.slice(0, 120)}"${nhieu ? ' — chi nhánh nhiều kho, chưa chọn kho vẫn lưu được (tài liệu bước 6 yêu cầu "Kho đã chọn")' : ''}.`);
    if (nhieu) ghiChu('CẦN BA CHỐT', 'Chi nhánh nhiều kho: lưu được dù CHƯA chọn kho. Tài liệu tự mâu thuẫn: bước 6 liệt kê "Kho đã chọn" trong các điều kiện kiểm, nhưng bảng 4.2.1 ghi cột "Theo dõi tồn kho" Bắt buộc = Không.');
    await page.waitForTimeout(1500);
    const sa = await timTheoMaVach(api, a), sb = await timTheoMaVach(api, b);
    expect(sa.length, 'sản phẩm 1 phải được tạo').toBe(1);
    expect(sb.length, 'sản phẩm 2 phải được tạo').toBe(1);
    expect(String(sa[0].code2 || '').length, 'Mã sản phẩm để trống phải được tự sinh').toBeGreaterThan(0);
    const gia = Number(sa[0].salePrice ?? sa[0].outPrice ?? sa[0].price);
    expect(gia, 'giá bán đã nhập').toBe(19000);
    await expect(oNhap(page), 'popup phải đóng sau khi thêm thành công').toBeHidden({ timeout: 8000 });
  });
});
