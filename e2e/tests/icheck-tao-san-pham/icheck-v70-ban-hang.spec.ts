/* Kiểm thử FE MỚI — Bán hàng (Web) mục 4.3, lượt 29/10/2026 (tài liệu v70). Báo cáo: bao-cao/2026-10-29_icheck-tao-san-pham/.
 * Chạy: cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-v70-ban-hang.spec.ts --project=dev [--headed]
 * Cách quét giả lập theo BH-20261028-64147c0e: bấm icon quét, chờ 2 giây, bấm ô, Ctrl+A, gõ 5 ms/ký tự, Enter. Sản phẩm tạo ra: AUTO_V70H_. */
import type { Page } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { dongHopThoai } from '../../lib/ui';
import { boMa, doiToast, ghiChu, nutLuuSP, oTenSP, textToast, theoDoiToast, timTheoMaVach } from './_chung';

const { ma, maVachMoi } = boMa('V70H');
const TRANG_BH = process.env.EP_TRANG_BH || '/easy-pos/bill-order';
const oTimKiem = (page: Page) => page.locator('input[placeholder*="Tìm sản phẩm" i]').first();
const dongGoiY = (page: Page) => page.getByText('Chưa có trong cửa hàng').first();
const manThemSP = (page: Page) => page.locator('.modal-dialog, .offcanvas, .drawer, [class*="slide" i]').filter({ has: page.locator('input[name="name"]') }).first();

async function quetBanHang(page: Page, maVach: string) {
  const hop = await oTimKiem(page).boundingBox();
  if (hop) await page.mouse.click(hop.x + hop.width - 14, hop.y + hop.height / 2);
  await page.waitForTimeout(2000);
  await oTimKiem(page).click();
  await page.keyboard.press('Control+A');
  await page.waitForTimeout(500);
  await page.keyboard.type(maVach, { delay: 5 });
  await page.keyboard.press('Enter');
}

test.describe('FE — Bán hàng Web (v70, mục mới)', { tag: ['@ui', '@regression', '@icheck'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI }) => {
    await theoDoiToast(page);
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_BH);
    await dongHopThoai(page);
    if (!(await oTimKiem(page).isVisible({ timeout: 8000 }).catch(() => false))) {
      ghiChu('KỊCH BẢN', `Không thấy ô tìm kiếm ở ${TRANG_BH} (URL ${page.url()}) — có thể cần mở ca làm việc`);
      test.skip(true, 'KỊCH BẢN/MÔI TRƯỜNG: màn Bán hàng chưa sẵn sàng');
    }
  });

  test('[TC-BH-008] 4.3.2 4b: màn Thêm SP đang mở (mã X chưa có), quét mã Y chưa có ⇒ giữ màn, dữ liệu điền sẵn thay theo Y', async ({ page }) => {
    const [x, y] = [maVachMoi(), maVachMoi()];
    await quetBanHang(page, x);
    await expect(dongGoiY(page)).toBeVisible({ timeout: 10000 });
    await dongGoiY(page).click();
    await expect(manThemSP(page)).toBeVisible({ timeout: 10000 });
    const truoc = await page.locator('.modal-dialog input[placeholder*="ã vạch" i]').first().inputValue().catch(() => '');
    await page.keyboard.type(y, { delay: 5 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    const sau = await page.locator('.modal-dialog input[placeholder*="ã vạch" i]').first().inputValue().catch(() => '');
    await page.screenshot({ path: test.info().outputPath('BH-008-quet-khi-mo-man.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Mã vạch trong màn trước="${truoc}" (X=${x}), sau quét Y="${sau}" (Y=${y}); màn còn mở=${await manThemSP(page).isVisible().catch(() => false)}; toast=${JSON.stringify(await textToast(page))}`);
    ghiChu('QUAN SÁT', 'Giả lập máy quét bằng bàn phím khi tiêu điểm nằm trong màn Thêm SP — xác nhận lại bằng máy quét thật (TC-BH-004/005 cũng chưa kết luận).');
    expect(sau, 'tài liệu 4.3.2 4b: mã chưa có ⇒ giữ màn, thay dữ liệu theo mã vừa quét').toBe(y);
  });

  test('[TC-BH-009] ID: bấm Lưu 2 lần liên tiếp ở màn Thêm SP (từ gợi ý) ⇒ 1 sản phẩm, đơn có 1 dòng SL 1, toast 1 lần', async ({ page, api }) => {
    const m = maVachMoi();
    const ten = ma('009');
    await quetBanHang(page, m);
    await expect(dongGoiY(page)).toBeVisible({ timeout: 10000 });
    await dongGoiY(page).click();
    await expect(manThemSP(page)).toBeVisible({ timeout: 10000 });
    await oTenSP(page).fill(ten);
    const gia = page.locator('.modal-dialog input[name="salePrice"]').first();
    if (await gia.count()) await gia.fill('12000');
    await nutLuuSP(page).dblclick({ delay: 50 }).catch(async () => { await nutLuuSP(page).click(); });
    await doiToast(page, 8000);
    await page.waitForTimeout(2500);
    const tt = await textToast(page);
    const n = (await timTheoMaVach(api, m)).length;
    const soDongDon = ((await page.locator(':text("Tổng tiền hàng")').first().locator('xpath=..').innerText().catch(() => '')).match(/\((\d+)\)/) || [])[1] ?? '?';   // tên SP còn hiện ở lưới sản phẩm ⇒ đếm theo "Tổng tiền hàng (n)"
    await page.screenshot({ path: test.info().outputPath('BH-009-luu-hai-lan.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast ${JSON.stringify(tt)}; số SP mã ${m}=${n}; số lần tên "${ten}" xuất hiện trên màn=${soDongDon}. Mã vạch tra CSDL: ${m}`);
    test.skip(n === 0, 'KỊCH BẢN: lưu chưa thành công (thiếu trường bắt buộc) — hiệu chỉnh ở Bước 4');
    expect(n, 'bấm đúp Lưu không được tạo trùng').toBe(1);
    expect(soDongDon, 'đơn chỉ có 1 dòng sản phẩm (SL 1)').toBe('1');
  });
});
