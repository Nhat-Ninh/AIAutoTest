/* Hàm dùng chung cho các kịch bản về SẢN PHẨM (tạo, tìm, kiểm). Bẫy đã gặp, nhớ khi viết kịch bản mới:
 *  - Màn hình QUẢN LÝ sản phẩm dùng `category-get-with-paging` (tham số keyword); `get-with-paging` là API của màn BÁN HÀNG — kiểm sản phẩm vừa tạo phải dùng cái thứ nhất.
 *  - Tạo sản phẩm là form nhiều phần (multipart) tới `product/create1`, không phải JSON.
 *  - Trường mã hiển thị là `code2`. */
import type { APIRequestContext } from '@playwright/test';
import { test } from './fixtures';
import { dsTuDuLieu, duLieu, json } from './api';

/** Tạo sản phẩm qua API (form nhiều phần). Trường undefined bị bỏ. */
export function taoSP(api: APIRequestContext, comId: number | null, f: Record<string, string | number | boolean | undefined>) {
  const multipart: Record<string, string> = { comId: String(comId) };
  for (const [k, v] of Object.entries(f)) if (v !== undefined) multipart[k] = String(v);
  return api.post('client/page/product/create1', { multipart });
}

/** Tìm sản phẩm bằng đúng API mà MÀN HÌNH SẢN PHẨM dùng. Trả các dòng khớp từ khoá (tên / mã). */
export async function dsTheoTuKhoa(api: APIRequestContext, tuKhoa: string): Promise<any[]> {
  const r = await api.get(`client/page/product/category-get-with-paging?page=0&size=20&isWebCall=true&isCountAll=false&keyword=${encodeURIComponent(tuKhoa)}`);
  return dsTuDuLieu(duLieu(await json(r)));
}

/** Các dòng có `code2` đúng bằng mã đã cho. */
export async function timTheoMa(api: APIRequestContext, code2: string): Promise<any[]> {
  return (await dsTheoTuKhoa(api, code2)).filter(x => String(x?.code2 ?? x?.productCode ?? '') === code2);
}

export const gia = (sp: any) => Number(sp?.salePrice ?? sp?.outPrice ?? sp?.price);
export const idSP = (sp: any) => sp?.productId ?? sp?.id;

/** Một đơn vị tính CÓ SẴN của công ty (lấy từ sản phẩm đang có) — sản phẩm tạo mới cần đơn vị thì mới hiện trong danh sách. Không có ⇒ bỏ qua test (lý do môi trường). */
export async function donViCoSan(api: APIRequestContext): Promise<{ unit: string; unitId: number; warehouseId: number | null }> {
  const r = await api.get('client/page/product/get-with-paging?page=0&size=50');
  const x = dsTuDuLieu(duLieu(await json(r))).find(s => s?.unit && s?.unitId);
  test.skip(!x, 'MÔI TRƯỜNG: công ty chưa có sản phẩm nào có đơn vị tính để dùng lại');
  return { unit: String(x.unit), unitId: Number(x.unitId), warehouseId: x.warehouseId != null ? Number(x.warehouseId) : null };
}

/** Điều kiện môi trường: gọi được API danh sách sản phẩm (có quyền xem). 401 / 403 ⇒ bỏ qua test. */
export async function dieuKienSanPham(api: APIRequestContext) {
  // Hạn chờ 45 giây (mặc định 15 giây): dev dùng chung có lúc chậm; kiểm điều kiện hết hạn chờ ở nhóm test tuần tự (serial) sẽ làm MỌI test sau không chạy (23/10/2026: 10 test).
  const r = await api.get('client/page/product/get-with-paging?page=0&size=1', { timeout: 45_000 });
  test.skip(r.status() === 401 || r.status() === 403, `MÔI TRƯỜNG: tài khoản không có quyền với API sản phẩm (HTTP ${r.status()})`);
}

/** Tạo nhanh một sản phẩm thường CÓ mã vạch (qua create1) để làm "sản phẩm có trước" cho các ca trùng mã vạch. Mã sản phẩm = code2, tên = ten. */
export async function taoSPCoMaVach(api: APIRequestContext, comId: number | null, barcode: string, code2: string, ten: string) {
  const dv = await donViCoSan(api);
  return taoSP(api, comId, { name: ten, code2, barcode, salePrice: 15000, inventoryTracking: false, unit: dv.unit, unitId: dv.unitId });
}
