/* Hàm dùng chung cho các kịch bản BỔ SUNG của chức năng "Tạo sản phẩm từ dữ liệu iCheck" (lượt 28/10/2026, tài liệu Confluence v68).
 * Báo cáo: bao-cao/2026-10-28_icheck-tao-san-pham/. Không sửa e2e/lib/ (tệp của kit). */
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { boSinhMa } from '../../lib/du-lieu';
import { dongHopThoai } from '../../lib/ui';
import { dsTheoTuKhoa } from '../../lib/san-pham';

export const TRANG_SP = process.env.EP_TRANG_SP || '/easy-pos/product/product';
export const TU_KHOA_CO_GOI_Y = 'iphone';
export const MA_VACH_CO_GOI_Y = '0194252025109';          // đã quan sát có dữ liệu gợi ý trên dev (22/10/2026); dữ liệu iCheck có thể đổi
/** Đóng góp dữ liệu sang iCheck THẬT (dev nối iCheck thật): các test có thể kích hoạt việc này chỉ chạy khi đặt EP_CHO_DONG_GOP=1 (tester đồng ý). */
export const choDongGop = () => process.env.EP_CHO_DONG_GOP === '1';

/** Bộ sinh mã riêng cho từng tệp: tiền tố AUTO_<ky>_ + mã vạch tiền tố 297 (không trùng mã vạch thật 893…). */
export function boMa(ky: string) {
  const { ma, hauTo } = boSinhMa(`AUTO_${ky}_`);
  let dem = 0;
  const maVachMoi = () => `297${hauTo}${String(dem++).padStart(2, '0')}`;
  return { ma, hauTo, maVachMoi };
}

export const ghiChu = (type: string, description: string) => test.info().annotations.push({ type, description });

/* ---------- Popup "Quét mã vạch thêm sản phẩm" (bộ chọn theo BH-20261023-af32fad6) ---------- */
export const oNhapQuet = (page: Page) => page.locator('input.scan-input');
export const dongQuet = (page: Page) => page.locator('.scan-product-modal-body table.editing-table tbody tr.table-custom-body');
export const demQuet = (page: Page) => page.locator('.scan-count-text');
export const nutXacNhan = (page: Page) => page.locator('.scan-product-footer button.btn-primary');
export const nutHuyQuet = (page: Page) => page.locator('.scan-product-footer button.btn-outline-primary');
export const toast = (page: Page) => page.locator('.toast-message, .toast');
export const cot = { anh: 0, maVach: 1, maSP: 2, ten: 3, dvt: 4, giaNhap: 5, giaBan: 6, kho: 7, slTon: 8, xoa: 9 };
export const oQuet = (page: Page, d: number, c: number) => dongQuet(page).nth(d).locator('td').nth(c);
export const doiSoDong = (page: Page, n: number) => expect(dongQuet(page), `bảng phải có ${n} dòng`).toHaveCount(n, { timeout: 15000 });
/** Toast biến mất sau vài giây nên đọc sau một khoảng chờ cố định dễ hụt (lỗi kịch bản, 28/10/2026). Gọi theoDoiToast(page) ĐẦU beforeEach: mọi toast xuất hiện được ghi lại. */
export async function theoDoiToast(page: Page) {
  await page.addInitScript(() => {
    (window as any).__toasts = [];
    const ghi = () => document.querySelectorAll('.toast-message, .toast').forEach(e => {
      const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && !(window as any).__toasts.includes(t)) (window as any).__toasts.push(t);
    });
    new MutationObserver(ghi).observe(document, { childList: true, subtree: true, characterData: true });
  });
}
export const textToast = async (page: Page) => {
  const hienTai = (await toast(page).allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
  const daGhi: string[] = await page.evaluate(() => (window as any).__toasts || []).catch(() => []);
  return [...new Set([...daGhi, ...hienTai])].filter(Boolean);
};
/** Đợi tới khi có ít nhất một toast (tối đa ms) rồi trả toàn bộ toast đã thấy. */
export async function doiToast(page: Page, ms = 8000) {
  const han = Date.now() + ms;
  while (Date.now() < han) { if ((await textToast(page)).length) break; await page.waitForTimeout(250); }
  return textToast(page);
}

export async function moPopupQuet(page: Page) {
  await dongHopThoai(page);
  const nut = page.getByRole('button', { name: /Quét mã vạch/ }).first();
  await nut.click({ timeout: 5000 }).catch(async () => { await dongHopThoai(page); await nut.click(); });
  await expect(oNhapQuet(page)).toBeVisible();
}
export async function quet(page: Page, maVach: string) {
  await oNhapQuet(page).fill(maVach);
  await oNhapQuet(page).press('Enter');
}
export async function sanDongHopLe(page: Page, d: number, ten: string, gia = '18000') {
  const oTen = oQuet(page, d, cot.ten).locator('input');
  if (!(await oTen.inputValue())) await oTen.fill(ten);
  await oQuet(page, d, cot.giaBan).locator('input').fill(gia);
}
/** Chi nhánh nhiều kho ⇔ cột kho là ng-select; 1 kho ⇔ công tắc. */
export const laNhieuKho = async (page: Page) => (await oQuet(page, 0, cot.kho).locator('ng-select').count()) > 0;
/** Bật theo dõi tồn kho cho một dòng: chọn kho đầu tiên (nhiều kho) hoặc bật công tắc (1 kho). */
export async function batTheoDoiTon(page: Page, d: number) {
  if (await oQuet(page, d, cot.kho).locator('ng-select').count()) {
    await oQuet(page, d, cot.kho).locator('ng-select').click();
    await page.locator('.ng-dropdown-panel .ng-option').first().click();
  } else {
    await oQuet(page, d, cot.kho).locator('input[type=checkbox], .form-check-input, .custom-control-input, .switch').first().click({ force: true });
  }
}

/* ---------- Modal "Thêm sản phẩm" (bộ chọn theo icheck-fe.spec.ts) ---------- */
export async function moModalThemSanPham(page: Page) {
  await dongHopThoai(page);
  await page.getByRole('button', { name: /Thêm sản phẩm/ }).click({ timeout: 5000 }).catch(async () => {
    await dongHopThoai(page);
    await page.getByRole('button', { name: /Thêm sản phẩm/ }).click();
  });
  const muc = page.locator('.dropdown-menu .dropdown-item', { hasText: 'Sản phẩm' }).first();
  if (await muc.isVisible().catch(() => false)) await muc.click();
  await expect(page.locator('.modal-dialog input[name="name"]').first()).toBeVisible();
}
export const oTenSP = (page: Page) => page.locator('.modal-dialog input[name="name"]').first();
export const oMaVachSP = (page: Page) => page.locator('.modal-dialog input[placeholder*="ã vạch" i]').first();
export const dsGoiYTen = (page: Page) => page.locator('.list-product-suggestion .product-suggestion-item');
export const nutLuuSP = (page: Page) => page.locator('.modal-dialog').getByRole('button', { name: /^\s*Lưu\s*$/ }).first();

/* ---------- API ---------- */
export const suggestTheoTen = (api: APIRequestContext, keyword: string) => api.get(`client/page/product/suggestions?keyword=${encodeURIComponent(keyword)}`);
export const suggestTheoMaVach = (api: APIRequestContext, barcode: string) => api.get(`client/page/product/suggestions?barcodes=${encodeURIComponent(barcode)}`);
/** Sau một lần quick-create, BE giữ khoá chống nhập đồng thời một lúc: lần kế bị từ chối EXCEL_IMPORTING ("Bạn đang có tiến trình khác đang chạy").
 *  Đã quan sát 28/10/2026 (xem TC-BE-ICK-022). Hàm này thử lại sau mỗi 3 giây (tối đa 25 lần) và ghi thời gian đã chờ vào annotation. */
export async function quickCreate(api: APIRequestContext, comId: number | null, items: Record<string, unknown>[], warehouseId: number | null = null) {
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    const r = await api.post('client/page/product/quick-create', { data: { comId, warehouseId, items }, timeout: 60_000 });
    const b = await r.json().catch(() => ({}));
    const biKhoa = JSON.stringify(b).includes('EXCEL_IMPORTING');
    if (!biKhoa || i >= 25) {
      if (i > 0) test.info().annotations.push({ type: 'KHOÁ IMPORT', description: `quick-create bị từ chối EXCEL_IMPORTING ${i} lần, chờ ${Math.round((Date.now() - t0) / 1000)} giây mới được` });
      return r;
    }
    await new Promise(res => setTimeout(res, 3000));
  }
}
export function quickCreateValidate(api: APIRequestContext, comId: number | null, items: Record<string, unknown>[], warehouseId: number | null = null) {
  return api.post('client/page/product/quick-create/validate', { data: { comId, warehouseId, items } });
}
export async function timTheoMaVach(api: APIRequestContext, barcode: string): Promise<any[]> {
  return (await dsTheoTuKhoa(api, barcode)).filter(x => String(x?.barcode ?? '') === barcode);
}
