/* Kiểm thử Tạo sản phẩm (hàng hóa thường) — EasyPOS. Báo cáo: bao-cao/2026-10-22_tao-san-pham/ (testcase: 02-testcase.md).
 * Chạy:  cd e2e && npx playwright test tests/tao-san-pham --project=dev [--headed]
 * Hai nhóm chạy TUẦN TỰ: BE (API, form nhiều phần) rồi FE (giao diện). Mọi sản phẩm tạo ra có tên / mã bắt đầu "AUTO_SP_"
 * kèm dấu thời gian. Kịch bản KHÔNG xóa sản phẩm — dọn là test riêng `[DỌN]` chỉ chạy khi đặt EP_DON=1 (và chỉ xóa mềm sản phẩm AUTO_SP_ tạo trong lần chạy này). */
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';

const DAU = 'AUTO_SP_';
const HAU_TO = new Date().toISOString().replace(/\D/g, '').slice(4, 14);          // MMddHHmmss — mỗi lần chạy một mã riêng
const ma = (s: string) => `${DAU}${s}_${HAU_TO}`;
const TRANG_SP = process.env.EP_TRANG_SP || '/easy-pos/product/product';          // đường dẫn màn hình sản phẩm (xác nhận khi chạy thật)

test.describe.configure({ mode: 'serial' });

/* ---------- tiện ích ---------- */
async function json(r: APIResponse) { return r.json().catch(() => ({})); }
const duLieu = (b: any) => b?.data ?? b;
const thanhCong = (r: APIResponse, b: any) => r.status() === 200 && b?.status === true;
const thongBao = (b: any) => (Array.isArray(b?.message) ? b.message.map((m: any) => m?.message || m?.code).join('; ') : String(b?.message ?? b?.title ?? ''));

/** Tạo sản phẩm qua API (form nhiều phần). Trường undefined bị bỏ. */
function taoSP(api: APIRequestContext, comId: number | null, f: Record<string, string | number | boolean | undefined>) {
  const multipart: Record<string, string> = { comId: String(comId) };
  for (const [k, v] of Object.entries(f)) if (v !== undefined) multipart[k] = String(v);
  return api.post('client/page/product/create1', { multipart });
}
/** Tìm sản phẩm bằng đúng API mà MÀN HÌNH SẢN PHẨM dùng (`category-get-with-paging`, tham số `keyword` tìm theo tên / mã). Trả các dòng có `code2` khớp. */
async function dsTheoTuKhoa(api: APIRequestContext, tuKhoa: string): Promise<any[]> {
  const r = await api.get(`client/page/product/category-get-with-paging?page=0&size=20&isWebCall=true&isCountAll=false&keyword=${encodeURIComponent(tuKhoa)}`);
  const d = duLieu(await json(r));
  return Array.isArray(d) ? d : (d?.content ?? d?.items ?? []);
}
async function timTheoMa(api: APIRequestContext, code2: string): Promise<any[]> {
  return (await dsTheoTuKhoa(api, code2)).filter(x => String(x?.code2 ?? x?.productCode ?? '') === code2);
}
const gia = (sp: any) => Number(sp?.salePrice ?? sp?.outPrice ?? sp?.price);
const idSP = (sp: any) => sp?.productId ?? sp?.id;

/** Một đơn vị tính CÓ SẴN của công ty (lấy từ sản phẩm đang có) — sản phẩm tạo mới cần đơn vị thì mới hiện trong danh sách. */
async function donViCoSan(api: APIRequestContext): Promise<{ unit: string; unitId: number }> {
  const r = await api.get('client/page/product/get-with-paging?page=0&size=50');
  const d = duLieu(await json(r));
  const ds: any[] = Array.isArray(d) ? d : (d?.content ?? []);
  const x = ds.find(s => s?.unit && s?.unitId);
  test.skip(!x, 'MÔI TRƯỜNG: công ty chưa có sản phẩm nào có đơn vị tính để dùng lại');
  return { unit: String(x.unit), unitId: Number(x.unitId) };
}

/** Điều kiện môi trường: đăng nhập API được và gọi được API danh sách sản phẩm (có quyền xem). */
async function dieuKien(api: APIRequestContext) {
  const r = await api.get('client/page/product/get-with-paging?page=0&size=1');
  test.skip(r.status() === 401 || r.status() === 403, `MÔI TRƯỜNG: tài khoản không có quyền với API sản phẩm (HTTP ${r.status()})`);
}
const idDaTao: number[] = [];   // id sản phẩm do kịch bản tạo (để dọn nếu được phép)
async function ghiNhan(api: APIRequestContext, code2: string) {
  for (const sp of await timTheoMa(api, code2)) if (idSP(sp) && !idDaTao.includes(idSP(sp))) idDaTao.push(idSP(sp));
}

/** Đóng hộp thoại chào / cảnh báo che màn hình sau đăng nhập. */
async function dongHopThoai(page: Page) {
  for (let i = 0; i < 4; i++) {
    const nut = page.locator('.swal2-confirm, .modal.show .btn-close, .modal.show button:has-text("Đóng")').first();
    if (!(await nut.isVisible().catch(() => false))) break;
    await nut.click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

/* ============================ NHÓM BE (API) ============================ */
test.describe('BE — API tạo sản phẩm', () => {
  const maChinh = ma('001');

  test('[TC-BE-001] Tạo sản phẩm hợp lệ: 200, status true, có trong danh sách', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const r = await taoSP(api, phien.comId, { name: ma('ten001'), code2: maChinh, salePrice: 15000, inventoryTracking: false, ...dv });
    const b = await json(r);
    expect(r.status(), `HTTP (phản hồi: ${JSON.stringify(b).slice(0, 250)})`).toBe(200);
    expect(b.status, thongBao(b)).toBe(true);
    const sp = await timTheoMa(api, maChinh);
    expect(sp.length, 'sản phẩm vừa tạo phải có đúng 1 dòng trong danh sách').toBe(1);
    expect(gia(sp[0]), 'giá bán').toBe(15000);
    await ghiNhan(api, maChinh);
  });

  test('[TC-BE-002] QUAN SÁT: tạo không nhập mã sản phẩm (code2) — mã được tự sinh?', async ({ api, phien }) => {
    await dieuKien(api);
    const ten = ma('ten002');
    const dv = await donViCoSan(api);
    const r = await taoSP(api, phien.comId, { name: ten, salePrice: 15000, inventoryTracking: false, ...dv });
    const b = await json(r);
    test.info().annotations.push({ type: 'QUAN SÁT', description: `không gửi code2 → HTTP ${r.status()}, status=${b?.status}, ${thongBao(b)}` });
    expect(thanhCong(r, b), `tạo không mã phải thành công (phản hồi: ${JSON.stringify(b).slice(0, 250)})`).toBe(true);
    const sp = (await dsTheoTuKhoa(api, ten)).find(x => x?.name === ten || x?.productName === ten);
    test.info().annotations.push({ type: 'QUAN SÁT', description: `mã tự sinh: code2="${sp?.code2 ?? ''}" code="${sp?.code ?? sp?.productCode ?? ''}"` });
    if (idSP(sp)) idDaTao.push(idSP(sp));
  });

  test('[TC-BE-003] Thiếu / sai trường bắt buộc bị từ chối, không tạo sản phẩm', async ({ api, phien }) => {
    await dieuKien(api);
    const ca = [
      ['thiếu tên', { code2: ma('003a'), salePrice: 15000, inventoryTracking: false }],
      ['thiếu giá bán', { name: ma('ten003b'), code2: ma('003b'), inventoryTracking: false }],
      ['giá bán = -1', { name: ma('ten003c'), code2: ma('003c'), salePrice: -1, inventoryTracking: false }],
    ] as const;
    for (const [ten, f] of ca) {
      const r = await taoSP(api, phien.comId, f as any);
      const b = await json(r);
      expect(thanhCong(r, b), `${ten}: tạo được là SAI (HTTP ${r.status()}, ${thongBao(b)})`).toBe(false);
      test.info().annotations.push({ type: 'PHẢN HỒI', description: `${ten} → HTTP ${r.status()} · ${thongBao(b)}` });
      expect((await timTheoMa(api, String((f as any).code2))).length, `${ten}: không được có sản phẩm mới`).toBe(0);
    }
  });

  test('[TC-BE-004] Trùng mã sản phẩm bị từ chối "Trùng mã sản phẩm"; ghi lại HTTP status', async ({ api, phien }) => {
    await dieuKien(api);
    const truoc = (await timTheoMa(api, maChinh)).length;
    test.skip(truoc !== 1, 'Phụ thuộc TC-BE-001 (chưa có sản phẩm mã gốc)');
    const dv = await donViCoSan(api);
    const r = await taoSP(api, phien.comId, { name: ma('ten004'), code2: maChinh, salePrice: 20000, inventoryTracking: false, ...dv });
    const b = await json(r);
    test.info().annotations.push({ type: 'PHẢN HỒI', description: `trùng mã → HTTP ${r.status()} · ${thongBao(b)}` });
    if (r.status() >= 500) test.info().annotations.push({ type: 'NGHI VẤN', description: 'trùng mã trả HTTP 5xx (lỗi nghiệp vụ lẽ ra phải 400) — xem 01-phan-tich.md mục c' });
    expect(thanhCong(r, b), `trùng mã mà vẫn tạo được là SAI`).toBe(false);
    expect((await timTheoMa(api, maChinh)).length, 'vẫn chỉ 1 sản phẩm mã đó').toBe(1);
  });

  test('[TC-BE-005] Tên chứa emoji bị từ chối', async ({ api, phien }) => {
    await dieuKien(api);
    const code2 = ma('005');
    const r = await taoSP(api, phien.comId, { name: `${DAU}SP \u{1F600} ${HAU_TO}`, code2, salePrice: 15000, inventoryTracking: false });
    const b = await json(r);
    test.info().annotations.push({ type: 'PHẢN HỒI', description: `emoji → HTTP ${r.status()} · ${thongBao(b)}` });
    expect(thanhCong(r, b), 'tên có emoji mà tạo được là SAI').toBe(false);
    expect((await timTheoMa(api, code2)).length, 'không được có sản phẩm mới').toBe(0);
  });

  test('[TC-BE-006] Theo dõi tồn kho mà thiếu đơn vị tính bị từ chối', async ({ api, phien }) => {
    await dieuKien(api);
    const code2 = ma('006');
    const r = await taoSP(api, phien.comId, { name: ma('ten006'), code2, salePrice: 15000, inventoryTracking: true, inventoryCount: 5, purchasePrice: 10000 });
    const b = await json(r);
    test.info().annotations.push({ type: 'PHẢN HỒI', description: `tồn kho thiếu đơn vị → HTTP ${r.status()} · ${thongBao(b)}` });
    expect(thanhCong(r, b), 'thiếu đơn vị tính mà tạo được là SAI').toBe(false);
    expect((await timTheoMa(api, code2)).length, 'không được có sản phẩm mới').toBe(0);
  });

  test('[TC-BE-007] QUAN SÁT: giá bán = 0 (thông báo nói "lớn hơn 0", code cho ≥ 0)', async ({ api, phien }) => {
    await dieuKien(api);
    const code2 = ma('007');
    const dv = await donViCoSan(api);
    const r = await taoSP(api, phien.comId, { name: ma('ten007'), code2, salePrice: 0, inventoryTracking: false, ...dv });
    const b = await json(r);
    const duoc = thanhCong(r, b);
    test.info().annotations.push({ type: 'CẦN BA CHỐT', description: `giá bán=0 ${duoc ? 'ĐƯỢC chấp nhận' : 'BỊ từ chối'} (HTTP ${r.status()}, ${thongBao(b)}); thông báo validate nói "phải lớn hơn 0"` });
    if (duoc) await ghiNhan(api, code2);
  });

  test('[TC-BE-008] QUAN SÁT: mã sản phẩm dài 60 ký tự (thông báo nói tối đa 50, code cho 100)', async ({ api, phien }) => {
    await dieuKien(api);
    const code2 = `${DAU}${HAU_TO}_`.padEnd(60, 'X');
    const dv = await donViCoSan(api);
    const r = await taoSP(api, phien.comId, { name: ma('ten008'), code2, salePrice: 15000, inventoryTracking: false, ...dv });
    const b = await json(r);
    const duoc = thanhCong(r, b);
    test.info().annotations.push({ type: 'CẦN BA CHỐT', description: `code2 dài ${code2.length} ký tự ${duoc ? 'ĐƯỢC chấp nhận' : 'BỊ từ chối'} (HTTP ${r.status()}, ${thongBao(b)}); thông báo nói tối đa 50` });
    if (duoc) {
      const sp = await timTheoMa(api, code2);
      test.info().annotations.push({ type: 'CẦN BA CHỐT', description: `sau khi lưu, tìm theo đủ 60 ký tự ${sp.length ? 'THẤY' : 'KHÔNG thấy (có thể bị cắt)'}` });
      await ghiNhan(api, code2);
    }
  });
});

test.describe('BE — quan sát thêm', () => {
  test('[TC-BE-009] QUAN SÁT: tạo sản phẩm KHÔNG có đơn vị tính (không theo dõi tồn kho) — có được chấp nhận không? (chỉ chạy khi EP_QUAN_SAT_DON_VI=1)', async ({ api, phien }) => {
    test.skip(process.env.EP_QUAN_SAT_DON_VI !== '1', 'Đã quan sát ở lần chạy đầu: tạo không có đơn vị vẫn thành công (đơn vị = rỗng trong CSDL, sản phẩm SP30). Bật EP_QUAN_SAT_DON_VI=1 để tái hiện — sẽ tạo thêm một sản phẩm AUTO_SP_');
    await dieuKien(api);
    const code2 = ma('009');
    const r = await taoSP(api, phien.comId, { name: ma('ten009'), code2, salePrice: 15000, inventoryTracking: false });
    const b = await json(r);
    const hien = (await timTheoMa(api, code2)).length;
    test.info().annotations.push({ type: 'NGHI VẤN', description: `không gửi đơn vị: tạo ${thanhCong(r, b) ? 'THÀNH CÔNG' : 'bị từ chối'} (HTTP ${r.status()}); trong danh sách quản lý: ${hien ? 'có' : 'KHÔNG thấy'}` });
  });
});

/* ============================ NHÓM FE (giao diện) ============================ */
test.describe('FE — màn hình sản phẩm', () => {
  const maFE = ma('FE002');

  test.beforeEach(async ({ page, dangNhapUI, api }) => {
    await dieuKien(api);
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_SP);
    await dongHopThoai(page);
  });

  /** Mở hộp thoại tạo sản phẩm "Thường": nút "Thêm sản phẩm" → mục "Sản phẩm". */
  async function moHopThoaiTao(page: Page) {
    await page.getByRole('button', { name: /Thêm sản phẩm/ }).click();
    await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Sản phẩm' }).first().click();
    await expect(page.locator('.modal-dialog input[name="name"]').first()).toBeVisible();
  }
  const oMa = (page: Page) => page.locator('.modal-dialog input[placeholder="Mã sản phẩm"]').first();
  const oGia = (page: Page) => page.locator('.modal-dialog input[name="salePrice"]').first();
  const nutLuu = (page: Page) => page.locator('.modal-footer button', { hasText: 'Lưu' }).first();

  test('[TC-FE-001] Màn hình sản phẩm có nút thêm; hộp thoại tạo có ô tên, mã, giá bán', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Thêm sản phẩm/ }), 'không thấy nút thêm sản phẩm — có thể thiếu quyền thêm').toBeVisible();
    await moHopThoaiTao(page);
    await expect(oMa(page)).toBeVisible();
    await expect(oGia(page)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('hop-thoai-tao-sp.png') });
  });

  test('[TC-FE-002] Tạo sản phẩm bằng giao diện: tên + mã + giá 15000 → thành công, tìm thấy', async ({ page, api }) => {
    await moHopThoaiTao(page);
    await page.locator('.modal-dialog input[name="name"]').first().fill(ma('tenFE002'));
    await oMa(page).fill(maFE);
    await oGia(page).fill('15000');
    await page.screenshot({ path: test.info().outputPath('1-truoc-khi-luu.png') });
    await nutLuu(page).click();
    await expect(page.locator('.toast-success, .toast-message').first(), 'phải có thông báo thành công').toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: test.info().outputPath('2-sau-khi-luu.png') });
    const sp = await timTheoMa(api, maFE);
    expect(sp.length, 'sản phẩm tạo bằng giao diện phải có trong danh sách').toBe(1);
    expect(gia(sp[0]), 'giá bán').toBe(15000);
    await ghiNhan(api, maFE);
  });

  test('[TC-FE-003] Bỏ trống tên rồi Lưu: bị chặn, không tạo sản phẩm', async ({ page, api }) => {
    const code2 = ma('FE003');
    await moHopThoaiTao(page);
    await oMa(page).fill(code2);
    await oGia(page).fill('15000');
    await nutLuu(page).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: test.info().outputPath('bo-trong-ten.png') });
    expect((await timTheoMa(api, code2)).length, 'không được tạo sản phẩm khi thiếu tên').toBe(0);
  });

  test('[TC-FE-004] Tạo trùng mã bằng giao diện: có thông báo "Trùng mã sản phẩm", không thêm', async ({ page, api }) => {
    test.skip((await timTheoMa(api, maFE)).length !== 1, 'Phụ thuộc TC-FE-002 (chưa có sản phẩm mã gốc)');
    await moHopThoaiTao(page);
    await page.locator('.modal-dialog input[name="name"]').first().fill(ma('tenFE004'));
    await oMa(page).fill(maFE);
    await oGia(page).fill('20000');
    await nutLuu(page).click();
    await expect(page.getByText(/Trùng mã sản phẩm/).first(), 'phải báo trùng mã').toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: test.info().outputPath('trung-ma.png') });
    expect((await timTheoMa(api, maFE)).length, 'vẫn chỉ 1 sản phẩm mã đó').toBe(1);
  });
});

/* ============================ DỌN (tùy chọn) ============================ */
test('[DỌN] Xóa mềm các sản phẩm AUTO_SP_ do lần chạy này tạo (chỉ khi EP_DON=1)', async ({ api }) => {
  test.skip(process.env.EP_DON !== '1', 'Giữ lại dữ liệu AUTO_SP_ để tra CSDL; đặt EP_DON=1 khi muốn dọn');
  for (const id of idDaTao) {
    const r = await api.put(`client/page/product/delete/${id}`);
    test.info().annotations.push({ type: 'DỌN', description: `xóa mềm sản phẩm id ${id} → HTTP ${r.status()}` });
  }
});
