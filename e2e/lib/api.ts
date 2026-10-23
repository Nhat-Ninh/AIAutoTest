/* Tiện ích đọc phản hồi API EasyPOS — DÙNG CHUNG cho mọi kịch bản (trước đây mỗi tệp chép lại một bản).
 * Quy ước của EasyPOS: kết quả bọc trong `data`; lỗi nghiệp vụ nằm ở `message: [{ code, message }]` kèm `status: false`. */
import type { APIResponse } from '@playwright/test';

/** Đọc JSON của phản hồi; không phải JSON (vd HTML lỗi) thì trả {} thay vì ném lỗi. */
export async function json(r: { json: () => Promise<any> }): Promise<any> { return r.json().catch(() => ({})); }

/** Bóc lớp `data` (nếu có). */
export const duLieu = (b: any) => b?.data ?? b;

/** Danh sách từ phản hồi phân trang: nhận mảng trần, hoặc `{content}` / `{items}`. Không đọc được ⇒ []. */
export const dsTuDuLieu = (d: any): any[] => (Array.isArray(d) ? d : (d?.content ?? d?.items ?? []));

/** HTTP 200 và `status: true`. */
export const thanhCong = (r: APIResponse, b: any) => r.status() === 200 && b?.status === true;

/** Gộp thông báo lỗi của backend thành một chuỗi để đưa vào thông báo kiểm tra. */
export const thongBao = (b: any) => (Array.isArray(b?.message) ? b.message.map((m: any) => m?.message || m?.code).join('; ') : String(b?.message ?? b?.title ?? ''));
