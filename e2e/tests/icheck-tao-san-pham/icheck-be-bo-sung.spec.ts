/* Kiểm thử BE BỔ SUNG — Tạo sản phẩm từ dữ liệu iCheck, lượt 28/10/2026 (tài liệu Confluence EP 50709307 v68; bản mã easypos-product-material@6c5fc6dbb53a).
 * Báo cáo: bao-cao/2026-10-28_icheck-tao-san-pham/. Chạy: cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-be-bo-sung.spec.ts --project=dev
 * Quy ước: chỗ HÀNH VI khác tài liệu thì test TRƯỢT (phát hiện cần xem); chỗ chưa chốt được nghiệp vụ ghi annotation "CẦN BA CHỐT"/"QUAN SÁT".
 * Test có thể làm EasyPOS gửi dữ liệu sang iCheck thật (đóng góp, mục 4.7) chỉ chạy khi đặt EP_CHO_DONG_GOP=1. Tên sản phẩm bắt đầu AUTO_BSB_. Không xoá sản phẩm. */
import { test, expect } from '../../lib/fixtures';
import { duLieu, json, thanhCong, thongBao } from '../../lib/api';
import { dieuKienSanPham as dieuKien, donViCoSan, taoSPCoMaVach } from '../../lib/san-pham';
import { kiemUrl, laMoiTruongProd, moiTruong } from '../../lib/moi-truong';
import { boMa, choDongGop, ghiChu, MA_VACH_CO_GOI_Y, quickCreate, quickCreateValidate, suggestTheoMaVach, suggestTheoTen, timTheoMaVach, TU_KHOA_CO_GOI_Y } from './_chung';

const { ma, maVachMoi } = boMa('BSB');
const cat = (b: any, n = 300) => JSON.stringify(b).slice(0, n);

// Không dùng serial: các ca độc lập; một ca trượt (phát hiện) không được làm các ca sau không chạy.
test.describe('BE — quick-create / validate / đóng góp (bổ sung)', { tag: ['@api', '@regression'] }, () => {
  test('[TC-BE-ICK-012] Lô 3 dòng gồm 1 dòng lỗi (thiếu tên): QUAN SÁT & CẦN BA CHỐT — tạo một phần hay không tạo gì', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const [a, b, c] = [maVachMoi(), maVachMoi(), maVachMoi()];
    const r = await quickCreate(api, phien.comId, [
      { barcode: a, name: ma('012a'), unit: dv.unit, unitId: dv.unitId, salePrice: 11000, inventoryTracking: false },
      { barcode: b, unit: dv.unit, unitId: dv.unitId, salePrice: 12000, inventoryTracking: false },                       // thiếu tên
      { barcode: c, name: ma('012c'), unit: dv.unit, unitId: dv.unitId, salePrice: 13000, inventoryTracking: false },
    ], dv.warehouseId);
    const body = await json(r);
    const [sa, sb, sc] = [(await timTheoMaVach(api, a)).length, (await timTheoMaVach(api, b)).length, (await timTheoMaVach(api, c)).length];
    ghiChu('QUAN SÁT', `HTTP ${r.status()}, status=${body?.status}, ${thongBao(body)}, data=${cat(duLieu(body))}. Số SP tạo thực: dòng hợp lệ A=${sa}, dòng lỗi B=${sb}, dòng hợp lệ C=${sc}.`);
    if (sa + sc > 0) ghiChu('CẦN BA CHỐT', 'Tài liệu 4.2.2 6b: dòng lỗi → "Không lưu"; 7a: lỗi hệ thống → không tạo sản phẩm nào. Code (qua engine import Excel): dòng hợp lệ VẪN được tạo, chỉ dòng lỗi bị loại (tạo một phần).');
    expect(sb, 'dòng thiếu tên không được tạo').toBe(0);
  });

  test('[TC-BE-ICK-022] QUAN SÁT: sau 1 quick-create thành công, lần quick-create kế của cùng công ty bị từ chối EXCEL_IMPORTING trong bao lâu', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const moi = () => ({ barcode: maVachMoi(), name: ma('022'), unit: dv.unit, unitId: dv.unitId, salePrice: 10000, inventoryTracking: false });
    const post = (item: Record<string, unknown>) => api.post('client/page/product/quick-create', { data: { comId: phien.comId, warehouseId: dv.warehouseId, items: [item] }, timeout: 60_000 });
    const r1 = await quickCreate(api, phien.comId, [moi()], dv.warehouseId);           // chờ hết khoá cũ (nếu có) rồi tạo
    expect(thanhCong(r1, await json(r1))).toBe(true);
    const t0 = Date.now();
    let lan = 0, giay = 0;
    for (; lan < 30; lan++) {
      const r = await post(moi());
      const b = await json(r);
      giay = Math.round((Date.now() - t0) / 1000);
      if (!JSON.stringify(b).includes('EXCEL_IMPORTING')) { ghiChu('QUAN SÁT', `Lần ngay sau đó: ${lan === 0 ? 'THÀNH CÔNG ngay' : `bị khoá ${lan} lần, được sau ~${giay} giây`}. Phản hồi: ${cat(b, 150)}`); break; }
      await new Promise(res => setTimeout(res, 2000));
    }
    ghiChu('CẦN BA CHỐT', 'Người dùng bấm Xác nhận ở popup Quét mã vạch hai lần liên tiếp (hoặc 2 nhân viên cùng cửa hàng) sẽ gặp "Bạn đang có tiến trình khác đang chạy. Vui lòng thử lại sau" — tài liệu không mô tả.');
    expect(lan, 'khoá không được kéo dài quá ~60 giây').toBeLessThan(30);
  });

  test('[TC-BE-ICK-013] Bật theo dõi tồn kho nhưng KHÔNG gửi số lượng tồn / giá nhập: tài liệu — vẫn tạo, tồn đầu = 0', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const bc = maVachMoi();
    const r = await quickCreate(api, phien.comId, [{ barcode: bc, name: ma('013'), unit: dv.unit, unitId: dv.unitId, salePrice: 15000, inventoryTracking: true }], dv.warehouseId);
    const body = await json(r);
    const n = (await timTheoMaVach(api, bc)).length;
    ghiChu('QUAN SÁT', `HTTP ${r.status()}, status=${body?.status}, ${thongBao(body)}; số SP tạo=${n}. Mã vạch để tra CSDL ở Bước 5: ${bc}`);
    expect(thanhCong(r, body) && n === 1, `tài liệu 4.2.1: bật theo dõi tồn kho mà để trống SL thì vẫn theo dõi, tồn đầu = 0. Thực tế: HTTP ${r.status()} · ${thongBao(body)} · số SP=${n}. (Code qua engine Excel có thể bắt buộc SL tồn + giá nhập ⇒ CẦN BA CHỐT)`).toBe(true);
  });

  test('[TC-BE-ICK-014] /quick-create/validate: dòng hợp lệ + dòng lỗi ⇒ trả trạng thái, KHÔNG tạo sản phẩm', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const [ok, loi] = [maVachMoi(), maVachMoi()];
    const r = await quickCreateValidate(api, phien.comId, [
      { barcode: ok, name: ma('014ok'), unit: dv.unit, unitId: dv.unitId, salePrice: 10000, inventoryTracking: false },
      { barcode: loi, unit: dv.unit, unitId: dv.unitId, inventoryTracking: false },                                         // thiếu tên + giá bán
    ], dv.warehouseId);
    const body = await json(r);
    ghiChu('QUAN SÁT', `validate → HTTP ${r.status()}, ${thongBao(body)}, data=${cat(duLieu(body), 500)}`);
    expect(r.status(), `phản hồi: ${cat(body)}`).toBe(200);
    expect((await timTheoMaVach(api, ok)).length, 'validate không được tạo sản phẩm').toBe(0);
    expect((await timTheoMaVach(api, loi)).length).toBe(0);
  });

  test('[TC-BE-ICK-015] warehouseId không thuộc công ty hiện tại: bị từ chối, không tạo sản phẩm', async ({ api, phien }) => {
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const bc = maVachMoi();
    const r = await quickCreate(api, phien.comId, [{ barcode: bc, name: ma('015'), unit: dv.unit, unitId: dv.unitId, salePrice: 10000, inventoryTracking: false }], 2147483000);
    const body = await json(r);
    ghiChu('PHẢN HỒI', `HTTP ${r.status()} · ${thongBao(body)}`);
    expect(thanhCong(r, body), 'kho không thuộc công ty mà vẫn tạo được là SAI').toBe(false);
    expect(r.status(), 'phải là lỗi nghiệp vụ (4xx), không phải 5xx').toBeLessThan(500);
    expect((await timTheoMaVach(api, bc)).length).toBe(0);
  });

  test('[TC-BE-ICK-016] items rỗng / thiếu: 400, không lỗi hệ thống', async ({ api, phien }) => {
    await dieuKien(api);
    for (const [ten, data] of [['items rỗng', { comId: phien.comId, warehouseId: null, items: [] }], ['thiếu items', { comId: phien.comId, warehouseId: null }]] as const) {
      const r = await api.post('client/page/product/quick-create', { data });
      const body = await json(r);
      ghiChu('PHẢN HỒI', `${ten} → HTTP ${r.status()} · ${thongBao(body)}`);
      expect(r.status(), `${ten}: phải 4xx (code-insight: "Yêu cầu không hợp lệ khi thiếu danh sách sản phẩm")`).toBeGreaterThanOrEqual(400);
      expect(r.status(), `${ten}: không được 5xx`).toBeLessThan(500);
    }
  });

  test('[TC-BE-ICK-017] suggestions: >20 mã vạch, size ngoài 1–50: không lỗi hệ thống (QUAN SÁT cách xử lý)', async ({ api }) => {
    await dieuKien(api);
    const nhieuMa = Array.from({ length: 21 }, () => maVachMoi()).map(m => `barcodes=${m}`).join('&');
    const ca: [string, string][] = [
      ['21 mã vạch', `client/page/product/suggestions?${nhieuMa}`],
      ['size=0', `client/page/product/suggestions?keyword=${TU_KHOA_CO_GOI_Y}&size=0`],
      ['size=51', `client/page/product/suggestions?keyword=${TU_KHOA_CO_GOI_Y}&size=51`],
    ];
    for (const [ten, url] of ca) {
      const r = await api.get(url);
      const body = await json(r);
      const n = Array.isArray(duLieu(body)) ? duLieu(body).length : -1;
      ghiChu('QUAN SÁT', `${ten} → HTTP ${r.status()}, ${thongBao(body)}, số kết quả=${n}`);
      expect(r.status(), `${ten}: không được 5xx (${cat(body, 200)})`).toBeLessThan(500);
    }
  });

  test('[TC-BE-ICK-018] Đóng góp (4.7): tạo SP thường dùng gợi ý nhưng sửa tên/giá ⇒ lưu thành công ngay, đóng góp chạy ngầm không ảnh hưởng [CHẠY KHI EP_CHO_DONG_GOP=1]', async ({ api, phien }) => {
    test.skip(!choDongGop(), 'Có thể gửi dữ liệu AUTO_ sang iCheck THẬT — chỉ chạy khi tester đặt EP_CHO_DONG_GOP=1');
    await dieuKien(api);
    const g = duLieu(await json(await suggestTheoMaVach(api, MA_VACH_CO_GOI_Y)));
    test.skip(!Array.isArray(g) || !g.length, 'DỮ LIỆU: mã vạch gợi ý không còn dữ liệu iCheck');
    test.skip((await timTheoMaVach(api, MA_VACH_CO_GOI_Y)).length > 0, 'MÔI TRƯỜNG: mã vạch gợi ý đã có sản phẩm trong cửa hàng');
    const t0 = Date.now();
    const r = await taoSPCoMaVach(api, phien.comId, MA_VACH_CO_GOI_Y, ma('018'), ma('018-da-sua'));
    const dt = Date.now() - t0;
    const body = await json(r);
    ghiChu('QUAN SÁT', `lưu SP có sửa dữ liệu gợi ý → HTTP ${r.status()} trong ${dt} ms; ${thongBao(body)}. Việc iCheck có nhận đóng góp hay không: KHÔNG kiểm được phía iCheck.`);
    expect(thanhCong(r, body), thongBao(body)).toBe(true);
    expect((await timTheoMaVach(api, MA_VACH_CO_GOI_Y)).length).toBe(1);
  });

  test('[TC-BE-ICK-019] quick-create có sửa dữ liệu gợi ý: QUAN SÁT (code không gắn đóng góp ở luồng này) [CHẠY KHI EP_CHO_DONG_GOP=1]', async ({ api, phien }) => {
    test.skip(!choDongGop(), 'Có thể gửi dữ liệu AUTO_ sang iCheck THẬT nếu luồng này có đóng góp — chỉ chạy khi tester đặt EP_CHO_DONG_GOP=1');
    await dieuKien(api);
    const dv = await donViCoSan(api);
    const g = duLieu(await json(await suggestTheoMaVach(api, MA_VACH_CO_GOI_Y)));
    test.skip(!Array.isArray(g) || !g.length, 'DỮ LIỆU: mã vạch gợi ý không còn dữ liệu iCheck');
    test.skip((await timTheoMaVach(api, MA_VACH_CO_GOI_Y)).length > 0, 'MÔI TRƯỜNG: mã vạch gợi ý đã có sản phẩm trong cửa hàng');
    const r = await quickCreate(api, phien.comId, [{ barcode: MA_VACH_CO_GOI_Y, name: ma('019-da-sua'), unit: dv.unit, unitId: dv.unitId, salePrice: 77000, inventoryTracking: false }], dv.warehouseId);
    const body = await json(r);
    ghiChu('QUAN SÁT', `quick-create có sửa dữ liệu gợi ý → HTTP ${r.status()}, ${thongBao(body)}. CẦN BA CHỐT: 4.7 nói chung "lưu sản phẩm"; code-insight: đóng góp chỉ gắn ở saveProduct/updateProduct, không thấy ở quick-create.`);
    expect(thanhCong(r, body), thongBao(body)).toBe(true);
  });

  test('[TC-BE-ICK-020] NT-09: SP đã tạo độc lập với kho gợi ý — tra gợi ý theo mã vạch của SP vừa tạo không làm đổi SP', async ({ api, phien }) => {
    await dieuKien(api);
    const bc = maVachMoi();
    const ten = ma('020');
    const r0 = await taoSPCoMaVach(api, phien.comId, bc, ma('020-ma'), ten);
    expect(thanhCong(r0, await json(r0))).toBe(true);
    await suggestTheoMaVach(api, bc);
    await suggestTheoTen(api, ten);
    const sp = await timTheoMaVach(api, bc);
    expect(sp.length).toBe(1);
    expect(sp[0].name, 'tên SP không được đổi sau khi tra gợi ý').toBe(ten);
  });

  test('[TC-BE-ICK-021] Gọi suggestions và quick-create KHÔNG token: 401, không lộ dữ liệu', async ({ playwright, env }) => {
    const m = moiTruong(env);
    const goc = kiemUrl(m.apiUrl || m.webUrl, `moiTruong.${env}.apiUrl / webUrl`, laMoiTruongProd(env));
    const ctx = await playwright.request.newContext({ baseURL: goc.endsWith('/') ? goc : goc + '/', ignoreHTTPSErrors: true, extraHTTPHeaders: { ...(m.headerThem || {}) } });
    try {
      const g = await ctx.get('client/page/product/suggestions?keyword=iphone');
      const p = await ctx.post('client/page/product/quick-create', { data: { comId: null, warehouseId: null, items: [] } });
      ghiChu('PHẢN HỒI', `suggestions không token → HTTP ${g.status()}; quick-create không token → HTTP ${p.status()}`);
      for (const s of [g.status(), p.status()]) expect([401, 403], `HTTP ${s} không phải 401/403`).toContain(s);
      expect((await g.text()).includes('Apple'), 'không được lộ dữ liệu sản phẩm').toBe(false);
    } finally { await ctx.dispose(); }
  });
});
