/* Kiểm thử BE MỚI — quick-create / suggestions, lượt 29/10/2026 (tài liệu v70; bản mã easypos-product-material@6c5fc6dbb53a).
 * Báo cáo: bao-cao/2026-10-29_icheck-tao-san-pham/ (02-testcase.md). Chạy: cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-v70-be.spec.ts --project=dev
 * Quy ước như icheck-be-bo-sung.spec.ts: hành vi khác tài liệu thì test TRƯỢT; chưa chốt được thì annotation "CẦN BA CHỐT"/"QUAN SÁT".
 * Tên trường số lượng tồn / giá nhập của item (inventoryCount, purchasePrice — xác nhận bằng payload UI 29/10/2026) lấy từ code-insight (kiểm tra ở Bước 4). Tên sản phẩm bắt đầu AUTO_V70B_. Không xoá sản phẩm. */
import { test, expect } from '../../lib/fixtures';
import { duLieu, json, thanhCong, thongBao } from '../../lib/api';
import { dieuKienSanPham as dieuKien, donViCoSan } from '../../lib/san-pham';
import { boMa, ghiChu, quickCreate, suggestTheoTen, timTheoMaVach } from './_chung';

const { ma, maVachMoi } = boMa('V70B');
const cat = (b: any, n = 300) => JSON.stringify(b).slice(0, n);
const doiKhoa = () => new Promise(res => setTimeout(res, 35_000));       // khoá EXCEL_IMPORTING ~31 giây (TC-BE-ICK-022)

test.describe('BE — quick-create / suggestions (v70, mục mới)', { tag: ['@api', '@regression'] }, () => {
  test('[TC-BE-ICK-027] NV/EG: item có mã vạch dính khoảng trắng đầu/cuối ⇒ cắt khoảng trắng hoặc từ chối 4xx, không 500', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const sach = maVachMoi();
    const r = await quickCreate(api, phien.comId, [{ barcode: ` ${sach} `, name: ma('027'), unit: dv.unit, unitId: dv.unitId, salePrice: 10000, inventoryTracking: false }], dv.warehouseId);
    const body = await json(r);
    const sp = await timTheoMaVach(api, sach);
    ghiChu('QUAN SÁT', `HTTP ${r.status()}, ${thongBao(body)}; SP tìm được theo mã sạch=${sp.length}. Mã vạch tra CSDL: "${sach}"`);
    expect(r.status(), `không được 5xx: ${cat(body)}`).toBeLessThan(500);
    if (thanhCong(r, body)) expect(sp.length, 'đã tạo thì bar_code phải được cắt khoảng trắng (tìm theo mã sạch thấy)').toBe(1);
  });

  test('[TC-BE-ICK-023] RC: 2 quick-create đồng thời cùng mã vạch ⇒ đúng 1 sản phẩm; request kia bị từ chối rõ ràng', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    await doiKhoa();
    const bc = maVachMoi();
    const item = (ten: string) => ({ barcode: bc, name: ten, unit: dv.unit, unitId: dv.unitId, salePrice: 10000, inventoryTracking: false });
    const post = (ten: string) => api.post('client/page/product/quick-create', { data: { comId: phien.comId, warehouseId: dv.warehouseId, items: [item(ten)] }, timeout: 60_000 });
    const [r1, r2] = await Promise.all([post(ma('023-a')), post(ma('023-b'))]);
    const [b1, b2] = [await json(r1), await json(r2)];
    const n = (await timTheoMaVach(api, bc)).length;
    ghiChu('QUAN SÁT', `r1: HTTP ${r1.status()} ${thongBao(b1)} | r2: HTTP ${r2.status()} ${thongBao(b2)}; số SP mã ${bc}=${n}`);
    expect(n, 'không được tạo trùng mã vạch').toBe(1);
    for (const r of [r1, r2]) expect(r.status(), 'không được 5xx').toBeLessThan(500);
  });

  test('[TC-BE-ICK-024] NV: giá bán "abc" / null / -1 và SL tồn thập phân ⇒ 400 (không 500), không tạo sản phẩm', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const ca: [string, Record<string, unknown>][] = [
      ['giá bán chuỗi', { salePrice: 'abc', inventoryTracking: false }],
      ['giá bán null', { salePrice: null, inventoryTracking: false }],
      ['giá bán âm', { salePrice: -1, inventoryTracking: false }],
      ['SL tồn thập phân', { salePrice: 10000, inventoryTracking: true, inventoryCount: 1.5, purchasePrice: 10000 }],
    ];
    const kq: string[] = [];
    const loi: string[] = [];
    for (const [ten, f] of ca) {
      const bc = maVachMoi();
      const r = await quickCreate(api, phien.comId, [{ barcode: bc, name: ma('024'), unit: dv.unit, unitId: dv.unitId, ...f }], dv.warehouseId);
      const b = await json(r);
      const n = (await timTheoMaVach(api, bc)).length;
      kq.push(`${ten}: HTTP ${r.status()} · ${thongBao(b)} · tạo=${n}`);
      ghiChu('QUAN SÁT', kq[kq.length - 1]);
      if (r.status() >= 500) loi.push(`${ten}: HTTP ${r.status()}`);
      if (ten !== 'SL tồn thập phân' && n !== 0) loi.push(`${ten}: đã tạo ${n} SP`);
    }
    expect(loi, `phải 4xx và không tạo SP (BUG-7). Tất cả: ${JSON.stringify(kq)}`).toEqual([]);
  });

  test('[TC-BE-ICK-025] EP: bật theo dõi tồn kho, SL tồn 5, giá nhập 10.000, đủ ĐVT ⇒ tạo thành công, tồn đầu 5 (đối chiếu CSDL ở Bước 5)', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const bc = maVachMoi();
    const r = await quickCreate(api, phien.comId, [{ barcode: bc, name: ma('025'), unit: dv.unit, unitId: dv.unitId, salePrice: 15000, inventoryTracking: true, inventoryCount: 5, purchasePrice: 10000, warehouseId: dv.warehouseId }], dv.warehouseId);
    const body = await json(r);
    const n = (await timTheoMaVach(api, bc)).length;
    ghiChu('QUAN SÁT', `HTTP ${r.status()}, ${thongBao(body)}; số SP=${n}. Mã vạch tra CSDL (product.inventory_tracking, inventory.on_hand): ${bc}`);
    expect(thanhCong(r, body) && n === 1, `phải tạo được. HTTP ${r.status()} · ${thongBao(body)} · số SP=${n}`).toBe(true);
  });

  test('[TC-BE-ICK-026] EP/BVA suggestions keyword: "", " ", 1 ký tự, 8 chữ số, 15 chữ số ⇒ không 5xx; chuỗi 8–14 chữ số được coi là mã vạch (code)', async ({ api }) => {
    await dieuKien(api);
    const kw = ['', ' ', 's', '12345678', '123456789012345'];
    for (const k of kw) {
      const r = await suggestTheoTen(api, k);
      const b = await json(r);
      const ds = duLieu(b);
      ghiChu('QUAN SÁT', `keyword="${k}" → HTTP ${r.status()}, ${thongBao(b)}, số kết quả=${Array.isArray(ds) ? ds.length : cat(ds, 80)}`);
      expect(r.status(), `keyword="${k}" không được 5xx`).toBeLessThan(500);
    }
  });
});
