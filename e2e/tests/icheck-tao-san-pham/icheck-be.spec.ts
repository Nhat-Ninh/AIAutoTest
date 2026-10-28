/* Kiểm thử BE (API) — Tạo sản phẩm từ dữ liệu iCheck. Báo cáo: bao-cao/2026-10-22_icheck-tao-san-pham/.
 * Chạy:  cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-be.spec.ts --project=dev
 * API chính: GET client/page/product/suggestions (tra cứu), POST client/page/product/quick-create (lưu nhanh).
 * Mọi sản phẩm tạo ra có tên/mã bắt đầu "AUTO_ICK_" kèm dấu thời gian. Mã vạch tự sinh KHÔNG dùng tiền tố GS1 Việt Nam
 * thật (893...) để tránh trùng sản phẩm thật — dùng tiền tố "299" + số ngẫu nhiên. Kịch bản KHÔNG xóa sản phẩm. */
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { duLieu, json, thanhCong, thongBao } from '../../lib/api';
import { boSinhMa } from '../../lib/du-lieu';
import { dieuKienSanPham as dieuKien, donViCoSan, dsTheoTuKhoa, timTheoMa } from '../../lib/san-pham';

const DAU = 'AUTO_ICK_';
const { ma, hauTo: HAU_TO } = boSinhMa(DAU);
// Mã vạch THẬT đã quan sát có dữ liệu gợi ý trên dev (khám phá thủ công 22/10/2026, từ khóa "iphone"): dùng để kiểm tra có gợi ý.
const MA_VACH_CO_GOI_Y = '0194252025109'; // "Apple 12W USB Power Adapter..."
const TU_KHOA_CO_GOI_Y = 'iphone';
let soDem = 0;
const maVachMoi = () => `299${HAU_TO}${(soDem++).toString().padStart(2, '0')}`;

test.describe.configure({ mode: 'serial' });

function suggestByKeyword(api: APIRequestContext, keyword: string) {
  return api.get(`client/page/product/suggestions?keyword=${encodeURIComponent(keyword)}`);
}
function suggestByBarcode(api: APIRequestContext, barcode: string) {
  return api.get(`client/page/product/suggestions?barcodes=${encodeURIComponent(barcode)}`);
}
/** warehouseId mặc định: trước 23/10/2026 không truyền warehouseId làm BE lỗi hệ thống (417) — nay đã sửa (TC-BE-ICK-011 kiểm lại). Các ca "hợp lệ" khác
 * vẫn truyền warehouseId tường minh để độc lập với ca đó. */
// Dùng bản có thử lại khi BE giữ khoá EXCEL_IMPORTING (28/10/2026, xem TC-BE-ICK-022) để các ca không làm nhau trượt.
import { quickCreate } from './_chung';
async function timTheoMaVach(api: APIRequestContext, barcode: string): Promise<any[]> {
  return (await dsTheoTuKhoa(api, barcode)).filter(x => String(x?.barcode ?? '') === barcode);
}
/** Tạo 1 sản phẩm thường qua create1 (đã có sẵn, dùng làm "sản phẩm có trước" cho các ca trùng mã vạch). */
async function taoSpCoBarcode(api: APIRequestContext, comId: number | null, barcode: string, code2: string) {
  const dv = await donViCoSan(api);
  const multipart: Record<string, string> = { comId: String(comId), name: ma('da-co'), code2, barcode, salePrice: '15000', inventoryTracking: 'false', unit: dv.unit, unitId: String(dv.unitId) };
  const r = await api.post('client/page/product/create1', { multipart });
  expect(thanhCong(r, await json(r)), `tạo sản phẩm tiền đề (barcode=${barcode}) thất bại`).toBe(true);
}

/* ============================ Tra cứu gợi ý ============================ */
test.describe('BE — tra cứu gợi ý (suggestions)', { tag: ['@api', '@regression'] }, () => {
  test('[TC-BE-ICK-001] Tra cứu theo tên phổ biến: HTTP 200, status true, data là mảng sản phẩm', { tag: '@smoke' }, async ({ api }) => {
    await dieuKien(api);
    const r = await suggestByKeyword(api, TU_KHOA_CO_GOI_Y);
    const b = await json(r);
    expect(r.status(), `phản hồi: ${JSON.stringify(b).slice(0, 250)}`).toBe(200);
    expect(b.status, thongBao(b)).toBe(true);
    const ds = duLieu(b);
    expect(Array.isArray(ds), 'data phải là mảng').toBe(true);
    test.info().annotations.push({ type: 'QUAN SÁT', description: `từ khóa "${TU_KHOA_CO_GOI_Y}" → ${ds.length} kết quả, mẫu đầu: ${JSON.stringify(ds[0] ?? {}).slice(0, 200)}` });
  });

  test('[TC-BE-ICK-002] CẦN BA CHỐT: số lượng kết quả tối đa — tài liệu nói 8, cấu hình BE mặc định 10', async ({ api }) => {
    await dieuKien(api);
    const r = await suggestByKeyword(api, TU_KHOA_CO_GOI_Y);
    const ds = duLieu(await json(r));
    const soLuong = Array.isArray(ds) ? ds.length : -1;
    test.info().annotations.push({ type: 'CẦN BA CHỐT', description: `API /suggestions trả ${soLuong} kết quả cho từ khóa phổ biến (tài liệu: tối đa 8; cấu hình BE: DEFAULT_SUGGESTION_LIMIT=10). FE cắt hiển thị dropdown còn 8 bằng pipe "slice:0:8" — khớp tài liệu ở tầng UI, không khớp ở tầng API thô.` });
    expect(soLuong, 'không được vượt quá giới hạn cấu hình BE (10)').toBeLessThanOrEqual(10);
  });

  test('[TC-BE-ICK-003] Tra cứu theo mã vạch có dữ liệu gợi ý: trả về phần tử đúng mã vạch, có field source', async ({ api }) => {
    await dieuKien(api);
    const r = await suggestByBarcode(api, MA_VACH_CO_GOI_Y);
    const b = await json(r);
    expect(r.status()).toBe(200);
    const ds = duLieu(b);
    test.info().annotations.push({ type: 'QUAN SÁT', description: `barcode=${MA_VACH_CO_GOI_Y} → ${JSON.stringify(ds).slice(0, 300)}` });
    if (Array.isArray(ds) && ds.length) {
      expect(ds.some((x: any) => x?.barcode === MA_VACH_CO_GOI_Y), 'phải có phần tử đúng mã vạch').toBe(true);
      expect(['ICHECK', 'SOFTDREAMS']).toContain(ds[0]?.source);
    } else {
      test.info().annotations.push({ type: 'NGHI VẤN', description: 'mã vạch khám phá trước đó không còn dữ liệu gợi ý — dữ liệu iCheck/kho có thể đã đổi, chọn mã vạch khác khi chạy lại' });
    }
  });

  test('[TC-BE-ICK-004] Tra cứu mã vạch bịa (không tồn tại ở đâu): không chặn người dùng, trả mảng rỗng', async ({ api }) => {
    await dieuKien(api);
    const r = await suggestByBarcode(api, maVachMoi());
    const b = await json(r);
    expect(r.status(), `phản hồi: ${JSON.stringify(b).slice(0, 250)}`).toBe(200);
    expect(b.status, thongBao(b)).toBe(true);
    expect(duLieu(b)).toEqual([]);
  });

  test('[TC-BE-ICK-005] QUAN SÁT: tra cứu mã vạch đã dùng trong cửa hàng', async ({ api, phien }) => {
    await dieuKien(api);
    const barcode = maVachMoi();
    const code2 = ma('005');
    await taoSpCoBarcode(api, phien.comId, barcode, code2);
    const r = await suggestByBarcode(api, barcode);
    const b = await json(r);
    test.info().annotations.push({ type: 'QUAN SÁT', description: `mã vạch đã dùng trong cửa hàng → HTTP ${r.status()}, status=${b?.status}, ${thongBao(b)}, data=${JSON.stringify(duLieu(b)).slice(0, 200)}` });
  });
});

/* ============================ Lưu nhanh (quick-create) ============================ */
test.describe('BE — lưu nhanh (quick-create)', { tag: ['@api', '@regression'] }, () => {
  test('[TC-BE-ICK-006] Lưu nhanh 1 sản phẩm hợp lệ: thành công, có trong danh sách', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const barcode = maVachMoi();
    const r = await quickCreate(api, phien.comId, [{ barcode, name: ma('ten006'), unit: dv.unit, unitId: dv.unitId, salePrice: 15000, purchasePrice: 10000, inventoryTracking: false }], dv.warehouseId);
    const b = await json(r);
    expect(r.status(), `phản hồi: ${JSON.stringify(b).slice(0, 300)}`).toBe(200);
    expect(thanhCong(r, b), thongBao(b)).toBe(true);
    const sp = await timTheoMaVach(api, barcode);
    expect(sp.length, 'sản phẩm vừa lưu nhanh phải có trong danh sách').toBe(1);
  });

  test('[TC-BE-ICK-007] Lưu nhanh 2 sản phẩm cùng lúc: cả hai được tạo', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const bc1 = maVachMoi();
    const bc2 = maVachMoi();
    const r = await quickCreate(api, phien.comId, [
      { barcode: bc1, name: ma('ten007a'), unit: dv.unit, unitId: dv.unitId, salePrice: 12000, inventoryTracking: false },
      { barcode: bc2, name: ma('ten007b'), unit: dv.unit, unitId: dv.unitId, salePrice: 13000, inventoryTracking: false },
    ], dv.warehouseId);
    const b = await json(r);
    expect(thanhCong(r, b), `phản hồi: ${JSON.stringify(b).slice(0, 300)}`).toBe(true);
    expect((await timTheoMaVach(api, bc1)).length, 'sản phẩm 1').toBe(1);
    expect((await timTheoMaVach(api, bc2)).length, 'sản phẩm 2').toBe(1);
  });

  test('[TC-BE-ICK-008] Thiếu trường bắt buộc (tên hoặc giá bán): bị từ chối, không tạo sản phẩm', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const ca = [
      ['thiếu tên', { barcode: maVachMoi(), unit: dv.unit, unitId: dv.unitId, salePrice: 15000, inventoryTracking: false }],
      ['thiếu giá bán', { barcode: maVachMoi(), name: ma('ten008b'), unit: dv.unit, unitId: dv.unitId, inventoryTracking: false }],
    ] as const;
    for (const [ten, item] of ca) {
      const r = await quickCreate(api, phien.comId, [item as any], dv.warehouseId);
      const b = await json(r);
      expect(thanhCong(r, b), `${ten}: tạo được là SAI (HTTP ${r.status()}, ${thongBao(b)})`).toBe(false);
      test.info().annotations.push({ type: 'PHẢN HỒI', description: `${ten} → HTTP ${r.status()} · ${thongBao(b)}` });
      expect((await timTheoMaVach(api, (item as any).barcode)).length, `${ten}: không được có sản phẩm mới`).toBe(0);
    }
  });

  test('[TC-BE-ICK-009] QUAN SÁT: 2 item trùng mã vạch trong cùng request — batch xử lý từng dòng độc lập, không phải "tất cả hoặc không gì"', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const bcTrung = maVachMoi();
    const r = await quickCreate(api, phien.comId, [
      { barcode: bcTrung, name: ma('ten009a'), unit: dv.unit, unitId: dv.unitId, salePrice: 10000, inventoryTracking: false },
      { barcode: bcTrung, name: ma('ten009b'), unit: dv.unit, unitId: dv.unitId, salePrice: 11000, inventoryTracking: false },
    ], dv.warehouseId);
    const b = await json(r);
    const spTrung = await timTheoMaVach(api, bcTrung);
    test.info().annotations.push({ type: 'QUAN SÁT', description: `2 item trùng mã vạch trong cùng batch → HTTP ${r.status()}, status=${b?.status}, countSuccess=${b?.data?.countSuccess}, countFalse=${b?.data?.countFalse}, dataFalse=${JSON.stringify(b?.data?.dataFalse)}. Số sản phẩm thực có barcode đó sau khi lưu: ${spTrung.length} (kỳ vọng tài liệu 4.2.2 bước 6: "Mã vạch không trùng giữa các dòng" phải bị chặn — thực tế: dòng đầu được tạo, dòng trùng bị từ chối NGẦM mà KHÔNG trả lý do qua "dataFalse" (null dù countFalse=1) ⇒ FE sẽ không có dữ liệu để hiển thị cột "Chi tiết lỗi" như tài liệu mô tả — CẦN BA CHỐT.` });
    expect(thanhCong(r, b), `phản hồi: ${JSON.stringify(b).slice(0, 300)}`).toBe(true);
    expect(spTrung.length, 'chỉ 1 trong 2 item trùng mã vạch được tạo thực sự (xử lý từng dòng độc lập)').toBe(1);
  });

  test('[TC-BE-ICK-010] Mã vạch đã dùng trong cửa hàng: bị từ chối, vẫn chỉ 1 sản phẩm mã đó', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const barcode = maVachMoi();
    const codeGoc = ma('010-goc');
    await taoSpCoBarcode(api, phien.comId, barcode, codeGoc);
    const r = await quickCreate(api, phien.comId, [{ barcode, name: ma('ten010'), unit: dv.unit, unitId: dv.unitId, salePrice: 20000, inventoryTracking: false }], dv.warehouseId);
    const b = await json(r);
    test.info().annotations.push({ type: 'PHẢN HỒI', description: `mã vạch đã dùng → HTTP ${r.status()} · ${thongBao(b)}` });
    expect(thanhCong(r, b), 'mã vạch đã dùng mà vẫn tạo được là SAI').toBe(false);
    expect((await timTheoMaVach(api, barcode)).length, 'vẫn chỉ 1 sản phẩm mã vạch đó').toBe(1);
  });

  test('[TC-BE-ICK-011] quick-create không truyền warehouseId (null): BE phải tự chọn kho mặc định và tạo thành công (trước 23/10/2026 báo "Lỗi hệ thống" — đã sửa trên dev)', async ({ api, phien }) => {
    await dieuKien(api);
    const barcode = maVachMoi();
    const r = await quickCreate(api, phien.comId, [{ barcode, name: ma('ten011'), salePrice: 15000 }], null);
    const b = await json(r);
    test.info().annotations.push({ type: 'QUAN SÁT', description: `warehouseId=null → HTTP ${r.status()} · ${thongBao(b)}` });
    expect(r.status(), `phản hồi: ${JSON.stringify(b).slice(0, 250)}`).toBe(200);
    expect(b.status, thongBao(b)).toBe(true);
    expect((await timTheoMaVach(api, barcode)).length, 'sản phẩm phải được tạo với kho mặc định').toBe(1);
  });
});
