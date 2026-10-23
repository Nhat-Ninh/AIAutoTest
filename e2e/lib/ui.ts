/* Tiện ích giao diện EasyPOS dùng chung. */
import type { Page } from '@playwright/test';

/** Đóng các hộp thoại che màn hình sau đăng nhập (không đóng thì thao tác kế tiếp bị chặn): hộp "Hướng dẫn sử dụng", swal2, hộp có nút Đóng.
 *  Bẫy đã gặp (23/10/2026): hộp "Hướng dẫn sử dụng" hiện TRỄ — sau khi trang đã tải xong — nên không thấy ngay không có nghĩa là không có;
 *  hàm chờ tối đa ~2 giây cho tới khi 3 lần liên tiếp không thấy gì rồi mới thôi. */
export async function dongHopThoai(page: Page) {
  const huongDan = page.locator('.modal.show').filter({ hasText: 'Hướng dẫn sử dụng' });
  const chung = page.locator('.swal2-confirm, .modal.show .btn-close, .modal.show button:has-text("Đóng")');
  let khongThay = 0;
  for (let i = 0; i < 12 && khongThay < 3; i++) {
    if (await huongDan.first().isVisible().catch(() => false)) {
      await huongDan.first().locator('.modal-header button, .btn-close, button.close').first().click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(600);
      khongThay = 0;
    } else if (await chung.first().isVisible().catch(() => false)) {
      await chung.first().click().catch(() => undefined);
      await page.waitForTimeout(500);
      khongThay = 0;
    } else {
      khongThay++;
      await page.waitForTimeout(700);
    }
  }
}
