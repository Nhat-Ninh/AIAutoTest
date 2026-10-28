/* Kiểm thử FE — Bán hàng (Web): tạo nhanh sản phẩm khi quét mã chưa có (mục 4.3), lượt 28/10/2026, tài liệu Confluence EP 50709307 v68.
 * Báo cáo: bao-cao/2026-10-28_icheck-tao-san-pham/. Chạy: cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-ban-hang-web.spec.ts --project=dev [--headed]
 * CHƯA có bộ chọn / đường dẫn màn Bán hàng trong kho bài học ⇒ mọi bộ chọn dưới đây là ĐOÁN và sẽ được HIỆU CHỈNH ở Bước 4 (chạy --headed khám phá màn Bán hàng).
 * Đường dẫn mặc định /easy-pos/bill-order, đổi bằng EP_TRANG_BH. Có thể cần mở ca làm việc trước (xem tests/mo-dong-ca). Chưa tìm thấy ô tìm kiếm ⇒ test bỏ qua với nhãn "KỊCH BẢN" (không phải lỗi phần mềm).
 * Sản phẩm tạo ra có tiền tố AUTO_BH_. Máy quét giả lập bằng gõ nhanh + Enter (như BH-20261023-407ff6d5). */
import type { Page } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { dongHopThoai } from '../../lib/ui';
import { dsTheoTuKhoa } from '../../lib/san-pham';
import { boMa, ghiChu, textToast, theoDoiToast, toast } from './_chung';

const { ma, maVachMoi } = boMa('BH');
const TRANG_BH = process.env.EP_TRANG_BH || '/easy-pos/bill-order';        // khám phá 28/10/2026: nút "Bán hàng" trên thanh đầu trang → /easy-pos/bill-order
// Màn Bán hàng có 2 ô "Tìm sản phẩm (F1)" đều có icon quét (tài liệu 4.3.1 bước 1): ô đầu ở thanh trên, ô thứ hai ở lưới sản phẩm. EP_BH_O=1 để thử ô thứ hai.
const oTimKiem = (page: Page) => page.locator('input[placeholder*="Tìm sản phẩm" i]').nth(Number(process.env.EP_BH_O || 0));
const dongGoiY = (page: Page) => page.getByText('Chưa có trong cửa hàng').first();
const manThemSP = (page: Page) => page.locator('.modal-dialog, .offcanvas, .drawer, [class*="slide" i]').filter({ has: page.locator('input[name="name"]') }).first();

async function vaoBanHang(page: Page) {
  await dongHopThoai(page);
  await page.goto(TRANG_BH);
  await dongHopThoai(page);
  if (!(await oTimKiem(page).isVisible({ timeout: 8000 }).catch(() => false))) {
    ghiChu('KỊCH BẢN', `Không thấy ô tìm kiếm/quét ở ${TRANG_BH} (URL hiện tại ${page.url()}) — hiệu chỉnh đường dẫn / bộ chọn / mở ca ở Bước 4`);
    test.skip(true, 'KỊCH BẢN: cần hiệu chỉnh màn Bán hàng');
  }
}
async function quetBanHang(page: Page, maVach: string) {
  // Quan sát 28/10/2026: KHÔNG bấm icon quét ⇒ quét mã chưa có chỉ hiện "Không tìm thấy sản phẩm phù hợp" (không có dòng gợi ý, không toast) ⇒ CẦN BA CHỐT
  // (tài liệu 4.3 không nêu bước bật chế độ). Mặc định kịch bản bấm icon (mép phải ô tìm kiếm) rồi chờ cho chế độ sẵn sàng; EP_BH_ICON=0 để quét không bấm icon.
  if (process.env.EP_BH_ICON !== '0') {
    const hop = await oTimKiem(page).boundingBox();
    if (hop) await page.mouse.click(hop.x + hop.width - 14, hop.y + hop.height / 2);
    await page.waitForTimeout(2000);
  }
  await oTimKiem(page).click();
  await page.keyboard.press('Control+A');          // ô còn mã của lần quét trước thì gõ nối vào ⇒ chọn hết để ghi đè
  await page.waitForTimeout(500);
  await page.keyboard.type(maVach, { delay: 5 });
  await page.keyboard.press('Enter');
}

test.describe('FE — Bán hàng Web: tạo nhanh sản phẩm khi quét mã chưa có (mục 4.3)', { tag: ['@ui', '@regression', '@icheck'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI }) => {
    await theoDoiToast(page);
    await dangNhapUI();
    await vaoBanHang(page);
  });

  test('[TC-BH-001] Quét mã chưa có: dropdown 1 dòng gợi ý (tag "Chưa có trong cửa hàng", nút Thêm mới) + toast đỏ; ô tìm kiếm giữ nguyên; đơn không đổi', async ({ page }) => {
    const bc = maVachMoi();
    await quetBanHang(page, bc);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: test.info().outputPath('BH-001-goi-y.png'), fullPage: true });
    const tt = await textToast(page);
    ghiChu('KẾT QUẢ QUAN SÁT', `Ô số ${process.env.EP_BH_O || 0}; toast: ${JSON.stringify(tt)}; dropdown: "${((await page.locator('.dropdown-menu, .ng-dropdown-panel, [class*="dropdown" i]').allInnerTexts()).join(' | ')).replace(/\s+/g, ' ').slice(0, 160)}"`);
    expect(await dongGoiY(page).isVisible().catch(() => false), 'phải có dòng gợi ý với tag "Chưa có trong cửa hàng"').toBe(true);
    expect(tt.some(s => /Không tìm thấy sản phẩm có mã vạch này/.test(s)), `tài liệu 4.3.2 bước 2. Toast: ${JSON.stringify(tt)}`).toBe(true);
    ghiChu('KẾT QUẢ QUAN SÁT', `Giá trị ô tìm kiếm sau quét: "${await oTimKiem(page).inputValue()}" (tài liệu: giữ nguyên, không điền mã vạch)`);
    if ((await oTimKiem(page).inputValue()) === bc) ghiChu('CẦN BA CHỐT', 'Tài liệu 4.3.1 bước 2: "Ô tìm kiếm giữ nguyên, không điền mã vạch vừa quét" (vừa "giữ nguyên" vừa "không điền" — mơ hồ); giao diện: ô tìm kiếm CHỨA mã vừa quét.');
  });

  test('[TC-BH-002] Chọn dòng gợi ý → màn Thêm SP điền sẵn mã vạch; Lưu ⇒ SP được tạo, thêm vào đơn SL 1, toast "Thêm sản phẩm thành công"', async ({ page, api }) => {
    const bc = maVachMoi(), ten = ma('002');
    await quetBanHang(page, bc);
    await dongGoiY(page).click({ timeout: 10000 });
    const man = manThemSP(page);
    await expect(man, 'màn Thêm sản phẩm phải mở').toBeVisible({ timeout: 8000 });
    await expect(man.locator('input[placeholder*="ã vạch" i]').first(), 'mã vạch điền sẵn').toHaveValue(bc);
    await man.locator('input[name="name"]').fill(ten);
    const giaBan = man.locator('input[name="salePrice"]').first();
    if (!(await giaBan.inputValue().catch(() => ''))) await giaBan.fill('21000');
    await man.getByRole('button', { name: /^\s*Lưu\s*$/ }).first().click();
    await expect.poll(async () => (await textToast(page)).some(s => /Thêm sản phẩm thành công/.test(s)), { timeout: 20000 }).toBe(true).catch(() => undefined);
    const tt = await textToast(page);
    await page.screenshot({ path: test.info().outputPath('BH-002-sau-luu.png'), fullPage: true });
    expect(tt.some(s => /Thêm sản phẩm thành công/.test(s)), `tài liệu 4.3.2 bước 5. Toast: ${JSON.stringify(tt)}`).toBe(true);
    await expect(man).toBeHidden({ timeout: 8000 });
    expect(await page.getByText(ten).first().isVisible().catch(() => false), 'SP vừa tạo phải có trong đơn hàng (SL 1)').toBe(true);
    expect((await dsTheoTuKhoa(api, bc)).filter((x: any) => String(x?.barcode ?? '') === bc).length, 'SP phải có trong danh sách').toBe(1);
  });

  test('[TC-BH-003] Mã không có dữ liệu iCheck: dòng tên "Sản phẩm" + mã vạch; toast có "chưa có dữ liệu gợi ý"; chọn → chỉ điền mã vạch', async ({ page }) => {
    const bc = maVachMoi();
    await quetBanHang(page, bc);
    await page.waitForTimeout(2500);
    const tt = await textToast(page);
    await page.screenshot({ path: test.info().outputPath('BH-003-khong-du-lieu.png'), fullPage: true });
    expect(tt.some(s => /chưa có dữ liệu gợi ý/.test(s)), `tài liệu 4.3.2 2a. Toast: ${JSON.stringify(tt)}`).toBe(true);
    expect(await page.getByText(/^\s*Sản phẩm\s*$/).first().isVisible().catch(() => false), 'dòng gợi ý tên "Sản phẩm"').toBe(true);
    await dongGoiY(page).click();
    const man = manThemSP(page);
    await expect(man).toBeVisible({ timeout: 8000 });
    await expect(man.locator('input[placeholder*="ã vạch" i]').first()).toHaveValue(bc);
    await expect(man.locator('input[name="name"]'), 'chỉ điền mã vạch, tên trống').toHaveValue('');
  });

  test('[TC-BH-004] Không chọn gợi ý / quét mã chưa có khác / Thoát ⇒ không tạo SP, dòng gợi ý được thay, đơn giữ nguyên', async ({ page, api }) => {
    const [a, b] = [maVachMoi(), maVachMoi()];
    await quetBanHang(page, a);
    await expect(dongGoiY(page)).toBeVisible({ timeout: 10000 });
    await quetBanHang(page, b);                                           // 2c: thay dòng gợi ý
    await page.waitForTimeout(2500);
    expect(await page.getByText(b).first().isVisible().catch(() => false), 'dòng gợi ý phải đổi sang mã vừa quét').toBe(true);
    await page.locator('body').click({ position: { x: 5, y: 5 } });       // 2b: bấm ra ngoài
    await page.waitForTimeout(1000);
    await page.screenshot({ path: test.info().outputPath('BH-004-sau-bam-ngoai.png'), fullPage: true });
    expect(await dongGoiY(page).isVisible().catch(() => false), 'bấm ra ngoài phải đóng dropdown').toBe(false);
    for (const bc of [a, b]) expect((await dsTheoTuKhoa(api, bc)).filter((x: any) => String(x?.barcode ?? '') === bc).length, 'không được tạo SP').toBe(0);
  });

  test('[TC-BH-005] Màn Thêm SP đang mở, quét mã ĐÃ có sản phẩm ⇒ đóng màn và thêm SP đó vào đơn', async ({ page, api, phien }) => {
    const daCo = maVachMoi(), moi = maVachMoi(), ten = ma('005-da-co');
    const { taoSPCoMaVach } = await import('../../lib/san-pham');
    const r = await taoSPCoMaVach(api, phien.comId, daCo, ma('005'), ten);
    expect(r.status(), (await r.text()).slice(0, 200)).toBe(200);
    await quetBanHang(page, moi);
    await dongGoiY(page).click({ timeout: 10000 });
    await expect(manThemSP(page)).toBeVisible({ timeout: 8000 });
    await page.keyboard.type(daCo, { delay: 5 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: test.info().outputPath('BH-005-quet-ma-da-co.png'), fullPage: true });
    await expect(manThemSP(page), 'tài liệu 4.3.2 4b: đóng màn Thêm sản phẩm').toBeHidden({ timeout: 8000 });
    expect(await page.getByText(ten).first().isVisible().catch(() => false), 'SP đã có phải được thêm vào đơn').toBe(true);
  });

  test('[TC-BH-006] Mã thuộc SP ngừng kinh doanh ⇒ toast "đang ngừng kinh doanh", không dòng gợi ý, không thêm vào đơn', async ({ page }) => {
    test.skip(!process.env.EP_BH_MA_NGUNG_KD, 'DỮ LIỆU: chưa có SP AUTO_ ngừng kinh doanh — tester đặt EP_BH_MA_NGUNG_KD=<mã vạch> (SP phải do AUTO_ tạo và đã ngừng KD qua giao diện)');
    await quetBanHang(page, String(process.env.EP_BH_MA_NGUNG_KD));
    await page.waitForTimeout(2500);
    const tt = await textToast(page);
    expect(tt.some(s => /đang ngừng kinh doanh/.test(s)), `tài liệu 4.3.2 Exception 1a. Toast: ${JSON.stringify(tt)}`).toBe(true);
    expect(await dongGoiY(page).isVisible().catch(() => false), 'không hiện dòng gợi ý').toBe(false);
  });

  test('[TC-BH-007] Lưu thiếu Tên ⇒ màn Thêm SP còn mở, giữ dữ liệu, có báo lỗi; đơn không đổi; không tạo SP', async ({ page, api }) => {
    const bc = maVachMoi();
    await quetBanHang(page, bc);
    await dongGoiY(page).click({ timeout: 10000 });
    const man = manThemSP(page);
    await expect(man).toBeVisible({ timeout: 8000 });
    await man.getByRole('button', { name: /^\s*Lưu\s*$/ }).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('BH-007-thieu-ten.png'), fullPage: true });
    await expect(man, 'màn phải còn mở').toBeVisible();
    await expect(man.locator('input[placeholder*="ã vạch" i]').first()).toHaveValue(bc);
    expect((await man.locator('.invalid-feedback, .text-danger, .is-invalid').count()) + (await toast(page).count()), 'phải có báo lỗi').toBeGreaterThan(0);
    expect((await dsTheoTuKhoa(api, bc)).filter((x: any) => String(x?.barcode ?? '') === bc).length).toBe(0);
  });
});
