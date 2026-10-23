/* Kiểm thử Báo cáo lợi nhuận theo sản phẩm — EasyPOS. Báo cáo: bao-cao/2026-10-23_loi-nhuan-san-pham/ (testcase: 02-testcase.md).
 * Chạy:  cd e2e && npx playwright test tests/loi-nhuan-san-pham/loi-nhuan-san-pham.spec.ts --project=dev [--headed]
 * Báo cáo CHỈ ĐỌC — kịch bản không tạo / sửa / xoá dữ liệu nào. Hai nhóm chạy tuần tự: BE (API) rồi FE (giao diện).
 *
 * Màn hình thật trên dev (khảo sát 23/10/2026): Báo cáo › thẻ "Lợi nhuận sản phẩm" ⇒ hộp thoại bộ lọc ⇒ /easy-pos/report/product-profit.
 * API UI gọi:  POST client/page/report2/product-profit/overview (tổng + count)  và  …/data (danh sách; count luôn 0).
 * Báo cáo chi tiết theo đơn: POST …/product-profit/detail.
 *
 * Số liệu đối chiếu CSDL: kịch bản ghi bằng chứng JSON vào bao-cao/<…>/du-lieu/ để Bước 5 tính lại bằng SQL (dbq.js) — kịch bản KHÔNG nối CSDL.
 * Dữ liệu dev dùng chung: khoảng ngày cố định bên dưới có bill sẵn của công ty test; bill mới của người khác thêm vào có thể làm số đổi (lỗi môi trường, chạy lại). */
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../lib/fixtures';
import { json } from '../../lib/api';
import { dongHopThoai } from '../../lib/ui';
import { moiTruong } from '../../lib/moi-truong';

const THU_MUC = path.resolve(__dirname, '../../../bao-cao/2026-10-23_loi-nhuan-san-pham');
const ANH = path.join(THU_MUC, 'anh');
const DU_LIEU = path.join(THU_MUC, 'du-lieu');
fs.mkdirSync(ANH, { recursive: true });
fs.mkdirSync(DU_LIEU, { recursive: true });

const P = 'client/page/report2/product-profit/';
/** Khoảng ngày cố định có bill của công ty test (CSDL: 07/04/2026 → 08/07/2026; đủ trạng thái 1, 2, 4, 5, 6; chưa có 3, feature 2/5, combo, ĐVT quy đổi). */
const KY = { fromDate: '2026-01-01', toDate: '2026-07-31' };

// Không dùng chế độ serial: các test độc lập, một test trượt không được làm các test sau không chạy (workers=1 nên vẫn tuần tự).

/* ---------- tiện ích ---------- */
const so = (v: any) => Number(v ?? 0);
const gan = (a: number, b: number, dung = 0.01) => Math.abs(a - b) <= dung;
const luu = (ten: string, v: any) => fs.writeFileSync(path.join(DU_LIEU, ten + '.json'), JSON.stringify(v, null, 1));
const ghiChu = (type: string, description: string) => test.info().annotations.push({ type, description });

const bodyMau = (comIds: number[], extra: Record<string, any> = {}) =>
  ({ comIds, ...KY, ppuIds: [], page: 0, size: 100, isTypeCombo: false, paramCheckAll: true, ...extra });

/** Gọi overview + lấy mọi trang của data (size 100) — trả { tongSo, dong[] }. */
async function layHet(api: APIRequestContext, body: any) {
  const ov = await api.post(P + 'overview', { data: { ...body, page: 0, size: 20 } });
  const ob = await json(ov);
  const dong: any[] = [];
  for (let p = 0; p < 50; p++) {
    const r = await api.post(P + 'data', { data: { ...body, page: p, size: 100 } });
    const b = await json(r);
    expect(r.status(), 'data HTTP').toBe(200);
    const ds: any[] = b?.data?.products ?? [];
    dong.push(...ds);
    if (ds.length < 100) break;
  }
  return { status: ov.status(), tong: ob?.data ?? {}, count: ob?.count, dong };
}
const tongTu = (ds: any[], k: string) => ds.reduce((s, x) => s + so(x[k]), 0);

async function dsChiNhanh(api: APIRequestContext): Promise<{ id: number; name: string }[]> {
  const r = await api.get('page/company/get-with-paging?page=0&size=100&isCountAll=true');
  const b = await json(r);
  const out: { id: number; name: string }[] = [];
  for (const t of b?.data ?? []) for (const c of t?.companies ?? []) out.push({ id: c.id, name: c.name });
  return out;
}

/* ============================ NHÓM BE (API) ============================ */
test.describe('BE — API báo cáo lợi nhuận theo sản phẩm', { tag: ['@api', '@regression'] }, () => {
  test('[TC-BE-001] Gọi hợp lệ trả 200, đủ trường tổng + danh sách', { tag: '@smoke' }, async ({ api, phien }) => {
    const body = bodyMau([phien.comId!]);
    const ov = await api.post(P + 'overview', { data: body });
    const ob = await json(ov);
    expect(ov.status()).toBe(200);
    expect(ob.status).toBe(true);
    for (const k of ['totalQuantity', 'totalRevenue', 'totalPurchasePrice', 'totalProfit']) expect(ob.data, `overview thiếu ${k}`).toHaveProperty(k);
    const da = await api.post(P + 'data', { data: body });
    const db = await json(da);
    expect(da.status()).toBe(200);
    expect(Array.isArray(db?.data?.products)).toBeTruthy();
    const x = db.data.products[0];
    for (const k of ['ppuId', 'productCode', 'productName', 'unitName', 'quantity', 'purchasePrice', 'revenue', 'profit', 'profitMarginRevenue', 'profitMarginCost']) expect(x, `dòng thiếu ${k}`).toHaveProperty(k);
    luu('TC-BE-001', { overview: ob, dataMau: db.data.products.slice(0, 3) });
  });

  test('[TC-BE-002] Không token / token sai ⇒ 401', async ({ playwright, env }) => {
    const goc = String(moiTruong(env).apiUrl || '').replace(/\/?$/, '/');
    for (const auth of [undefined, 'Bearer sai.token.hoan.toan']) {
      const ctx = await playwright.request.newContext({ baseURL: goc, ignoreHTTPSErrors: true, extraHTTPHeaders: auth ? { Authorization: auth } : {} });
      const r = await ctx.post(P + 'overview', { data: bodyMau([1]) });
      expect([401, 403], `${auth ? 'token sai' : 'không token'} ⇒ HTTP ${r.status()}`).toContain(r.status());
      await ctx.dispose();
    }
  });

  test('[TC-BE-003] Thiếu ngày / ngày sai định dạng ⇒ không 500', async ({ api, phien }) => {
    const ca: [string, any][] = [
      ['thiếu fromDate', { ...bodyMau([phien.comId!]), fromDate: undefined }],
      ['thiếu toDate', { ...bodyMau([phien.comId!]), toDate: undefined }],
      ['sai định dạng', { ...bodyMau([phien.comId!]), fromDate: '31/12/2026' }],
      ['ngày không tồn tại', { ...bodyMau([phien.comId!]), toDate: '2026-02-30' }],
      ['chuỗi bậy', { ...bodyMau([phien.comId!]), fromDate: 'abc' }],
    ];
    const kq: any[] = [];
    for (const [ten, body] of ca) {
      const r = await api.post(P + 'overview', { data: body });
      kq.push({ ten, http: r.status(), thongBao: (await json(r))?.message });
    }
    luu('TC-BE-003', kq);
    const loi5xx = kq.filter(k => k.http >= 500);
    expect(loi5xx, `Trả 5xx thay vì 400 cho: ${loi5xx.map(k => k.ten).join(', ')} — ${JSON.stringify(loi5xx)}`).toHaveLength(0);
  });

  test('[TC-BE-004] Chỉ tính bill status 1,3,4,6 (bằng chứng cho đối chiếu SQL ở Bước 5)', async ({ api, phien }) => {
    const kq = await layHet(api, bodyMau([phien.comId!]));
    expect(kq.status).toBe(200);
    expect(kq.dong.length).toBeGreaterThan(0);
    luu('TC-BE-004_ky-day-du', kq);
    ghiChu('ĐỐI CHIẾU SQL (Bước 5)', 'status IN (1,3,4,6) — so SL / doanh thu / tiền vốn từng SP trong du-lieu/TC-BE-004_ky-day-du.json');
  });

  test('[TC-BE-005] Feature 1,2,5 (bằng chứng; dữ liệu hiện chỉ có feature 1 và 3)', async ({ api, phien }) => {
    const kq = await layHet(api, bodyMau([phien.comId!]));
    luu('TC-BE-005', kq);
    ghiChu('DỮ LIỆU', 'Công ty test chưa có bill_product feature 2 / 5 — loại feature 3 kiểm bằng SQL ở Bước 5 (đã có feature 3 trong CSDL).');
  });

  test('[TC-BE-006] Hàng khuyến mãi feature=2: doanh thu 0', async () => {
    test.skip(true, 'THIẾU DỮ LIỆU: công ty test chưa có dòng bill_product feature=2 — cần bán hàng KM (AUTO_) qua giao diện, tester quyết định ở Bước 3');
  });

  test('[TC-BE-007] Đơn trả hàng (status 4) trừ ra; tổng = 1+3−4+6', async ({ api, phien }) => {
    // Bill status 4 có ngày 10–13/04/2026 (CSDL). Gọi kỳ hẹp để đối chiếu SQL từng SP.
    const kq = await layHet(api, bodyMau([phien.comId!], { fromDate: '2026-04-10', toDate: '2026-04-13' }));
    luu('TC-BE-007_10-13-04', kq);
    expect(kq.status).toBe(200);
    ghiChu('ĐỐI CHIẾU SQL (Bước 5)', 'kỳ 10–13/04/2026 có status 1,4,5,6: kiểm dấu âm của status 4 và loại 5');
  });

  test('[TC-BE-008] Đơn thay thế (6) tính, đơn bị thay thế (5) loại', async ({ api, phien }) => {
    const kq = await layHet(api, bodyMau([phien.comId!], { fromDate: '2026-04-10', toDate: '2026-04-13' }));
    luu('TC-BE-008_10-13-04', kq);
    expect(kq.dong.length).toBeGreaterThan(0);
  });

  test('[TC-BE-009] Biên ngày: ngày có bill vs ngày liền sau', async ({ api, phien }) => {
    const co = await layHet(api, bodyMau([phien.comId!], { fromDate: '2026-07-08', toDate: '2026-07-08' }));
    const khong = await layHet(api, bodyMau([phien.comId!], { fromDate: '2026-07-09', toDate: '2026-07-09' }));
    luu('TC-BE-009', { '08/07': co, '09/07': khong });
    expect(so(co.tong.totalQuantity), 'ngày 08/07/2026 có bill hoàn thành').not.toBe(0);
    expect(khong.dong, 'ngày 09/07/2026 không có bill').toHaveLength(0);
    expect(so(khong.tong.totalRevenue)).toBe(0);
    const chung = await layHet(api, bodyMau([phien.comId!], { fromDate: '2026-07-08', toDate: '2026-07-09' }));
    expect(gan(so(chung.tong.totalRevenue), so(co.tong.totalRevenue))).toBeTruthy();
  });

  test('[TC-BE-010] SL bán từng SP (bằng chứng SQL)', async ({ api, phien }) => {
    const kq = await layHet(api, bodyMau([phien.comId!]));
    luu('TC-BE-010', kq.dong.map(x => ({ ppuId: x.ppuId, code: x.productCode, name: x.productName, quantity: x.quantity })));
    expect(kq.dong.every(x => x.quantity !== undefined)).toBeTruthy();
  });

  test('[TC-BE-011] Doanh thu từng SP (bằng chứng SQL)', async ({ api, phien }) => {
    const kq = await layHet(api, bodyMau([phien.comId!]));
    luu('TC-BE-011', kq.dong.map(x => ({ ppuId: x.ppuId, code: x.productCode, revenue: x.revenue })));
    expect(kq.dong.every(x => x.revenue !== undefined)).toBeTruthy();
  });

  test('[TC-BE-012] Tiền vốn từng SP (tài liệu purchase_price, code total_cogs) (bằng chứng SQL)', async ({ api, phien }) => {
    const kq = await layHet(api, bodyMau([phien.comId!]));
    luu('TC-BE-012', kq.dong.map(x => ({ ppuId: x.ppuId, code: x.productCode, purchasePrice: x.purchasePrice })));
    expect(kq.dong.every(x => x.purchasePrice !== undefined)).toBeTruthy();
  });

  test('[TC-BE-013] Lợi nhuận = DT − TV; LN/DT, LN/TV ×100; chia 0 ⇒ 0', async ({ api, phien }) => {
    const kq = await layHet(api, bodyMau([phien.comId!]));
    const sai: string[] = [];
    for (const x of kq.dong) {
      const dt = so(x.revenue), tv = so(x.purchasePrice), ln = so(x.profit);
      if (!gan(ln, dt - tv, 0.01)) sai.push(`${x.productCode}: LN ${ln} ≠ DT ${dt} − TV ${tv}`);
      const mDT = dt !== 0 ? ((dt - tv) / dt) * 100 : 0;
      const mTV = tv !== 0 ? ((dt - tv) / tv) * 100 : 0;
      if (!gan(so(x.profitMarginRevenue), mDT, 0.01)) sai.push(`${x.productCode}: LN/DT ${x.profitMarginRevenue} ≠ ${mDT.toFixed(4)}`);
      if (!gan(so(x.profitMarginCost), mTV, 0.01)) sai.push(`${x.productCode}: LN/TV ${x.profitMarginCost} ≠ ${mTV.toFixed(4)}`);
    }
    luu('TC-BE-013', { soDong: kq.dong.length, sai });
    expect(sai, sai.join('\n')).toHaveLength(0);
  });

  test('[TC-BE-014] Dòng Tổng = tổng toàn kỳ, không phụ thuộc page/size', async ({ api, phien }) => {
    const body = bodyMau([phien.comId!]);
    const kq = await layHet(api, body);
    expect(gan(so(kq.tong.totalQuantity), tongTu(kq.dong, 'quantity'), 0.01), `Σ SL: tổng ${kq.tong.totalQuantity} vs ${tongTu(kq.dong, 'quantity')}`).toBeTruthy();
    expect(gan(so(kq.tong.totalRevenue), tongTu(kq.dong, 'revenue'), 0.01), `Σ DT: tổng ${kq.tong.totalRevenue} vs ${tongTu(kq.dong, 'revenue')}`).toBeTruthy();
    expect(gan(so(kq.tong.totalPurchasePrice), tongTu(kq.dong, 'purchasePrice'), 0.01), `Σ TV`).toBeTruthy();
    expect(gan(so(kq.tong.totalProfit), tongTu(kq.dong, 'profit'), 0.01), `Σ LN`).toBeTruthy();
    expect(kq.count, 'count = số SP').toBe(kq.dong.length);
    const nho = await api.post(P + 'overview', { data: { ...body, page: 1, size: 5 } });
    expect(gan(so((await json(nho))?.data?.totalRevenue), so(kq.tong.totalRevenue))).toBeTruthy();
  });

  test('[TC-BE-015] Quy đổi ĐVT (SP có ĐVT quy đổi)', async () => {
    test.skip(true, 'THIẾU DỮ LIỆU: công ty test không có đơn vị quy đổi (product_product_unit.parent_id) — cần tạo SP AUTO_ có ĐVT quy đổi + bán qua POS, tester quyết định ở Bước 3');
  });

  test('[TC-BE-016] Quy đổi ĐVT giữa hai ĐVT quy đổi (3 ĐVT)', async () => {
    test.skip(true, 'THIẾU DỮ LIỆU: như TC-BE-015, cần SP có 3 ĐVT');
  });

  test('[TC-BE-017] ppuIds rỗng = mọi SP (ĐVT chính); chọn vài SP = đúng các SP đó', async ({ api, phien }) => {
    const tatCa = await layHet(api, bodyMau([phien.comId!]));
    expect(tatCa.dong.length).toBeGreaterThan(2);
    const chon = tatCa.dong.slice(0, 2).map(x => x.ppuId);
    const rieng = await layHet(api, bodyMau([phien.comId!], { ppuIds: chon, paramCheckAll: false }));
    expect(rieng.dong.map(x => x.ppuId).sort()).toEqual([...chon].sort());
    for (const x of rieng.dong) {
      const goc = tatCa.dong.find(y => y.ppuId === x.ppuId)!;
      expect(gan(so(x.revenue), so(goc.revenue)) && gan(so(x.quantity), so(goc.quantity))).toBeTruthy();
    }
    luu('TC-BE-017', { chon, rieng });
  });

  test('[TC-BE-018] Tách combo (isTypeCombo) — dữ liệu chưa có combo, chỉ kiểm hai chế độ nhất quán', async ({ api, phien }) => {
    const tat = await layHet(api, bodyMau([phien.comId!], { isTypeCombo: false }));
    const bat = await layHet(api, bodyMau([phien.comId!], { isTypeCombo: true }));
    luu('TC-BE-018', { tat: tat.tong, bat: bat.tong });
    // Không có combo: hai chế độ phải cho cùng số liệu.
    expect(gan(so(tat.tong.totalRevenue), so(bat.tong.totalRevenue)), `tắt tách: ${tat.tong.totalRevenue}, bật tách: ${bat.tong.totalRevenue} (không có combo mà khác nhau)`).toBeTruthy();
    ghiChu('DỮ LIỆU', 'Chưa có combo trong công ty test — kiểm đúng SP01/Combo ở BR-05 cần dữ liệu combo AUTO_.');
  });

  test('[TC-BE-019] sortByRevenueDesc: true giảm dần, false tăng dần, null (mặc định)', async ({ api, phien }) => {
    const lay = async (v: any) => (await layHet(api, bodyMau([phien.comId!], { sortByRevenueDesc: v }))).dong;
    const giam = await lay(true), tang = await lay(false), mac = await lay(null);
    const kiem = (ds: any[], k: string, chieu: 1 | -1) => ds.every((x, i) => i === 0 || (so(ds[i - 1][k]) - so(x[k])) * chieu <= 0.0001);
    expect(kiem(giam, 'revenue', -1), 'true ⇒ doanh thu giảm dần').toBeTruthy();
    expect(kiem(tang, 'revenue', 1), 'false ⇒ doanh thu tăng dần').toBeTruthy();
    const macTheoLN = kiem(mac, 'profit', -1), macTheoDT = kiem(mac, 'revenue', -1);
    luu('TC-BE-019', { macTheoLoiNhuanGiam: macTheoLN, macTheoDoanhThuGiam: macTheoDT });
    ghiChu('LỆCH TÀI LIỆU?', `không truyền sortByRevenueDesc: sắp theo lợi nhuận giảm dần=${macTheoLN}, doanh thu giảm dần=${macTheoDT}. Tài liệu: mặc định doanh thu giảm dần + có "doanh số" (API không có) ⇒ ⚠️ Cần BA chốt.`);
  });

  test('[TC-BE-026] Nhiều chi nhánh: tổng = Σ từng chi nhánh', async ({ api, phien }) => {
    const ds = await dsChiNhanh(api);
    test.skip(ds.length < 2, 'MÔI TRƯỜNG: tài khoản chỉ có 1 chi nhánh');
    const rieng: Record<number, any> = {};
    let coDuLieu = 0;
    for (const c of ds.slice(0, 8)) {
      const r = await api.post(P + 'overview', { data: bodyMau([c.id]) });
      rieng[c.id] = (await json(r))?.data ?? {};
      if (r.status() === 200 && so(rieng[c.id].totalRevenue) !== 0) coDuLieu++;
    }
    const ids = ds.slice(0, 8).map(c => c.id);
    const chung = (await json(await api.post(P + 'overview', { data: bodyMau(ids) })))?.data ?? {};
    const cong = Object.values(rieng).reduce((s: number, x: any) => s + so(x.totalRevenue), 0);
    luu('TC-BE-026', { ids, rieng, chung, cong, soChiNhanhCoDuLieu: coDuLieu });
    expect(gan(so(chung.totalRevenue), cong, 0.01), `tổng nhiều chi nhánh ${chung.totalRevenue} ≠ Σ từng chi nhánh ${cong}`).toBeTruthy();
    const dongChung = (await layHet(api, bodyMau(ids))).dong;
    ghiChu('KIỂM CỘT CHI NHÁNH', `dòng có trường chi nhánh? ${dongChung.length ? Object.keys(dongChung[0]).join(',') : '(không có dòng)'} — tài liệu yêu cầu cột Chi nhánh theo dòng`);
  });

  test('[TC-BE-027] comIds của công ty KHÔNG thuộc quyền ⇒ không lộ dữ liệu', async ({ api, phien }) => {
    const la = Number(process.env.EP_COMID_LA || 0);
    test.skip(!la, 'CHƯA CÓ ID: cần id công ty có bill nhưng không thuộc tài khoản (tra bằng SQL ở Bước 5 rồi đặt EP_COMID_LA=<id>)');
    const ds = await dsChiNhanh(api);
    expect(ds.map(c => c.id), 'id này thuộc quyền tài khoản — chọn id khác').not.toContain(la);
    const r = await api.post(P + 'overview', { data: bodyMau([la]) });
    const b = await json(r);
    luu('TC-BE-027', { http: r.status(), tong: b?.data, count: b?.count });
    const lo = r.status() === 200 && (so(b?.data?.totalRevenue) !== 0 || so(b?.count) > 0);
    expect(lo, 'Lỗi phân quyền: trả số liệu của công ty không thuộc tài khoản (che mã công ty khi ghi báo cáo)').toBeFalsy();
  });

  test('[TC-BE-028] page âm / size 0 / size rất lớn ⇒ không 500', async ({ api, phien }) => {
    const kq: any[] = [];
    for (const [ten, extra] of [['page âm', { page: -1 }], ['size 0', { size: 0 }], ['size âm', { size: -5 }], ['size 100000', { size: 100000 }]] as [string, any][]) {
      for (const ep of ['data', 'overview']) {
        const r = await api.post(P + ep, { data: bodyMau([phien.comId!], extra) });
        kq.push({ ten, ep, http: r.status() });
      }
    }
    luu('TC-BE-028', kq);
    const loi = kq.filter(k => k.http >= 500);
    expect(loi, `5xx: ${JSON.stringify(loi)}`).toHaveLength(0);
  });

  /* ---- báo cáo chi tiết theo đơn ---- */
  async function chiTiet(api: APIRequestContext, comId: number, ppuId: number | undefined, extra: Record<string, any> = {}) {
    const r = await api.post(P + 'detail', { data: { comIds: [comId], ...KY, ppuId, page: 0, size: 100, isTypeCombo: false, ...extra } });
    return { http: r.status(), b: await json(r) };
  }
  const dongCT = (b: any): any[] => b?.data?.details ?? [];

  test('[TC-BE-020] Chi tiết một SP: đủ cột theo đơn', async ({ api, phien }) => {
    const tc = await layHet(api, bodyMau([phien.comId!]));
    const ppu = tc.dong.find(x => x.productCode === 'SP13')?.ppuId ?? tc.dong[0].ppuId;
    const { http, b } = await chiTiet(api, phien.comId!, ppu);
    expect(http).toBe(200);
    const ds = dongCT(b);
    expect(ds.length).toBeGreaterThan(0);
    for (const k of ['billCode', 'billDate', 'quantity', 'unitName', 'unitPrice', 'amount', 'discountAmount', 'totalPreTax', 'vatAmount', 'totalAmount', 'discountAllocated', 'totalAmountAfterDiscount', 'profit', 'description', 'billStatus']) expect(ds[0], `thiếu ${k}`).toHaveProperty(k);
    for (const x of ds) expect(gan(so(x.totalAmountAfterDiscount), so(x.totalAmount) - so(x.discountAllocated)), `${x.billCode}: sau CK ≠ total_amount − CK`).toBeTruthy();
    luu('TC-BE-020', { ppu, b });
  });

  test('[TC-BE-021] Giá vốn đơn vị và Lợi nhuận theo đơn (bằng chứng SQL)', async ({ api, phien }) => {
    const tc = await layHet(api, bodyMau([phien.comId!]));
    const ppu = tc.dong[0].ppuId;
    const { b } = await chiTiet(api, phien.comId!, ppu);
    luu('TC-BE-021', { ppu, dong: dongCT(b).map(x => ({ billCode: x.billCode, quantity: x.quantity, purchasePriceUnit: x.purchasePriceUnit, totalAmountAfterDiscount: x.totalAmountAfterDiscount, profit: x.profit, billStatus: x.billStatus })) });
    ghiChu('ĐỐI CHIẾU SQL (Bước 5)', 'giá vốn = purchase_price/quantity (tài liệu) vs purchase_price (code); lợi nhuận = sau CK − total_cogs');
    expect(dongCT(b).length).toBeGreaterThan(0);
  });

  test('[TC-BE-022] Chi tiết có đủ trạng thái 1–6 và Diễn giải đúng, đơn 4 số âm', async ({ api, phien }) => {
    const tc = await layHet(api, bodyMau([phien.comId!]));
    const thay = new Map<number, any>();
    const gom: any[] = [];
    for (const sp of tc.dong) {
      const { b } = await chiTiet(api, phien.comId!, sp.ppuId);
      for (const x of dongCT(b)) { gom.push({ ppuId: sp.ppuId, ...x }); if (!thay.has(x.billStatus)) thay.set(x.billStatus, x); }
    }
    luu('TC-BE-022', gom);
    const tenDung: Record<number, string> = { 1: 'Đã hoàn thành', 2: 'Đã huỷ', 3: 'Bị trả hàng', 4: 'Trả hàng', 5: 'Bị thay thế', 6: 'Thay thế' };
    const sai = gom.filter(x => tenDung[x.billStatus] !== undefined && !String(x.description || '').toLowerCase().includes(tenDung[x.billStatus].toLowerCase().replace('huỷ', 'h').slice(0, 5)));
    ghiChu('TRẠNG THÁI CÓ TRONG CHI TIẾT', [...thay.keys()].sort().join(','));
    const am = gom.filter(x => x.billStatus === 4);
    if (am.length) expect(am.every(x => so(x.quantity) < 0), 'đơn trả hàng (4) phải có số lượng âm').toBeTruthy();
    expect(sai.map(x => `${x.billCode}:${x.billStatus}:${x.description}`), 'Diễn giải không khớp trạng thái').toHaveLength(0);
  });

  test('[TC-BE-023] Dòng Tổng chi tiết chỉ lấy 1+3−4+6 (không cộng đơn huỷ 2 / bị thay thế 5)', async ({ api, phien }) => {
    const tc = await layHet(api, bodyMau([phien.comId!]));
    const kq: any[] = [];
    for (const sp of tc.dong) {
      const { b } = await chiTiet(api, phien.comId!, sp.ppuId);
      const ds = dongCT(b);
      const mongDoi = ds.filter(x => [1, 3, 6].includes(x.billStatus)).reduce((s, x) => s + so(x.totalAmountAfterDiscount), 0)
        - ds.filter(x => x.billStatus === 4).reduce((s, x) => s + Math.abs(so(x.totalAmountAfterDiscount)), 0);
      kq.push({ code: sp.productCode, tongTraVe: b?.data?.totalAfterDiscount ?? null, mongDoiTheoTaiLieu: mongDoi, cacTrangThai: [...new Set(ds.map(x => x.billStatus))], tongSummary: sp.revenue });
    }
    luu('TC-BE-023', kq);
    const lech = kq.filter(k => k.tongTraVe !== null && !gan(so(k.tongTraVe), k.mongDoiTheoTaiLieu, 0.01));
    expect(lech, `Tổng chi tiết ≠ 1+3−4+6: ${JSON.stringify(lech)}`).toHaveLength(0);
  });

  test('[TC-BE-024] Hàng KM trong chi tiết: doanh thu 0', async () => {
    test.skip(true, 'THIẾU DỮ LIỆU: cần dòng feature=2 (như TC-BE-006)');
  });

  test('[TC-BE-025] Chi tiết theo ĐVT quy đổi', async () => {
    test.skip(true, 'THIẾU DỮ LIỆU: cần SP có ĐVT quy đổi (như TC-BE-015)');
  });

  test('[TC-BE-030] Chi tiết KHÔNG truyền ppuId: không được trả mọi bill_product của công ty', async ({ api, phien }) => {
    const { http, b } = await chiTiet(api, phien.comId!, undefined, { size: 100 });
    const ds = dongCT(b);
    luu('TC-BE-030', { http, soDong: ds.length, thongBao: b?.message, mau: ds.slice(0, 3) });
    const tc = await layHet(api, bodyMau([phien.comId!]));
    const maSP = new Set(ds.map((x: any) => x.productCode ?? x.billCode));
    expect(http >= 400 || ds.length === 0, `Chi tiết không có ppuId vẫn trả ${ds.length} dòng của nhiều SP (tổng hợp có ${tc.dong.length} SP) — nghi lỗi lọc`).toBeTruthy();
    void maSP;
  });

  test('[TC-BE-031] Chi tiết isTypeCombo true/false nhất quán', async ({ api, phien }) => {
    const tc = await layHet(api, bodyMau([phien.comId!]));
    const ppu = tc.dong[0].ppuId;
    const a = await chiTiet(api, phien.comId!, ppu, { isTypeCombo: false });
    const c = await chiTiet(api, phien.comId!, ppu, { isTypeCombo: true });
    expect(dongCT(a.b).length).toBe(dongCT(c.b).length);
  });

  test('[TC-BE-032] Phân trang chi tiết: count đúng, tổng không đổi giữa trang', async ({ api, phien }) => {
    const tc = await layHet(api, bodyMau([phien.comId!]));
    const sp = [...tc.dong].sort((x, y) => so(y.quantity) - so(x.quantity))[0];
    const trang0 = await chiTiet(api, phien.comId!, sp.ppuId, { page: 0, size: 3 });
    const trang1 = await chiTiet(api, phien.comId!, sp.ppuId, { page: 1, size: 3 });
    const het = await chiTiet(api, phien.comId!, sp.ppuId, { page: 0, size: 100 });
    expect(so(trang0.b?.count)).toBe(so(het.b?.count));
    expect(so(trang0.b?.count), 'count = số dòng thực').toBe(dongCT(het.b).length);
    expect(gan(so(trang0.b?.data?.totalProfit), so(trang1.b?.data?.totalProfit))).toBeTruthy();
    const ma0 = dongCT(trang0.b).map(x => x.billCode), ma1 = dongCT(trang1.b).map(x => x.billCode);
    expect(ma0.filter(m => ma1.includes(m))).toHaveLength(0);
  });
});

/* ============================ NHÓM FE (giao diện) ============================ */
const chup = (page: Page, ten: string) => page.screenshot({ path: path.join(ANH, ten + '.png'), fullPage: false });

/** Báo cáo › thẻ "Lợi nhuận sản phẩm" ⇒ hộp thoại bộ lọc. */
async function moBoLoc(page: Page) {
  await dongHopThoai(page);
  await page.getByText(/^\s*Báo cáo\s*$/i).first().click();
  await page.waitForTimeout(700);
  await dongHopThoai(page);
  await page.getByText(/^\s*Lợi nhuận sản phẩm\s*$/i).first().click();
  await expect(page.locator('.modal.show').getByText('Báo cáo lợi nhuận theo sản phẩm')).toBeVisible();
}
const oKy = (page: Page) => page.locator('.modal.show input[placeholder*="Từ ngày"]').first();
async function chonKy(page: Page, ten: RegExp) {
  await oKy(page).click({ force: true });
  await page.waitForTimeout(500);
  await page.getByText(ten).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Đóng$/ }).first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(400);
}
async function chonTatCaSP(page: Page) {
  await page.locator('.modal.show').getByText(/Đã chọn \d+ sản phẩm/).first().click({ force: true });
  await page.waitForTimeout(1500);
  const tc = page.getByText(/^\s*Chọn tất cả\s*$/i).first();
  if (await tc.isVisible().catch(() => false)) await tc.click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Xác nhận/ }).click();
  await page.waitForTimeout(600);
}
async function docBang(page: Page): Promise<string[][]> {
  return page.locator('table').first().evaluate(t => [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(c => (c as HTMLElement).innerText.trim())));
}
const chuSo = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, ''));
/** Chạy báo cáo, trả phản hồi API overview/data mà chính giao diện nhận. */
async function xemBaoCao(page: Page) {
  const ov = page.waitForResponse(r => /product-profit\/overview/.test(r.url()));
  const da = page.waitForResponse(r => /product-profit\/data/.test(r.url()));
  await page.getByRole('button', { name: /Xem báo cáo/ }).click();
  const [o, d] = await Promise.all([ov, da]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  return { body: JSON.parse(o.request().postData() || '{}'), ov: (await o.json())?.data, dsApi: (await d.json())?.data?.products ?? [] };
}

test.describe('FE — giao diện báo cáo lợi nhuận theo sản phẩm', { tag: ['@ui', '@regression'] }, () => {
  test('[TC-FE-001] Mở menu Báo cáo › Lợi nhuận sản phẩm: màn hình đúng, không lỗi', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await chup(page, 'TC-FE-001-bo-loc');
    for (const t of ['Kỳ báo cáo', 'Chọn chi nhánh', 'Chọn sản phẩm', 'Sắp xếp theo', 'Tách doanh thu Combo theo từng thành phần']) await expect(page.locator('.modal.show').getByText(t).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Xem báo cáo/ })).toBeVisible();
    ghiChu('KIỂM TRA', 'Hộp thoại bộ lọc mở từ thẻ trên trang /easy-pos/report/report-dashboard; kết quả ở /easy-pos/report/product-profit');
  });

  test('[TC-FE-002] Mặc định kỳ báo cáo', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    const v = await oKy(page).inputValue();
    const h = new Date();
    const hom = `${String(h.getDate()).padStart(2, '0')}/${String(h.getMonth() + 1).padStart(2, '0')}/${h.getFullYear()}`;
    const thang = `01/${String(h.getMonth() + 1).padStart(2, '0')}/${h.getFullYear()} - ${hom}`;
    await chup(page, 'TC-FE-002-ky-mac-dinh');
    luu('TC-FE-002', { giaTri: v, homNay: `${hom} - ${hom}`, thangNay: thang });
    ghiChu('GIÁ TRỊ MẶC ĐỊNH', v);
    // Tài liệu ghi "Tháng này" và cũng ghi "mặc định: hôm nay" ⇒ chấp nhận một trong hai, nhưng ghi lệch để BA chốt.
    expect([`${hom} - ${hom}`, thang], `kỳ mặc định "${v}" không phải tháng này / hôm nay`).toContain(v);
    if (v === `${hom} - ${hom}`) ghiChu('⚠️ CẦN BA CHỐT', 'Mặc định là "Hôm nay"; ô "GT mặc định" của tài liệu ghi "Tháng này", ô mô tả ghi "hôm nay".');
  });

  test('[TC-FE-003] Danh sách kỳ báo cáo', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await oKy(page).click({ force: true });
    await page.waitForTimeout(700);
    await chup(page, 'TC-FE-003-danh-sach-ky');
    const chu = await page.locator('body').innerText();
    const co = ['Hôm nay', 'Hôm qua', 'Tùy chỉnh'].filter(t => chu.includes(t));
    expect(co).toEqual(['Hôm nay', 'Hôm qua', 'Tùy chỉnh']);
    const taiLieu = ['tuần này', 'tuần trước', 'tháng này', 'tháng trước', '30 ngày qua', 'quý này', 'quý trước', 'năm nay', 'năm trước', 'Tháng 1'];
    const thieu = taiLieu.filter(t => !chu.toLowerCase().includes(t.toLowerCase()));
    luu('TC-FE-003', { uiCo: ['Hôm nay', 'Hôm qua', '7 ngày trước', '30 ngày trước', 'Theo tuần', 'Theo tháng', 'Theo quý', 'Theo năm', 'Tùy chỉnh'], taiLieuKhongThayTrenMenuCap1: thieu });
    ghiChu('LỆCH TÀI LIỆU (cấp 1)', `Không thấy ở cấp 1: ${thieu.join(', ')} — UI dùng "7 ngày trước / 30 ngày trước / Theo tuần-tháng-quý-năm (có menu con)". Cần xem menu con để kết luận.`);
    for (const m of ['Theo tuần', 'Theo tháng', 'Theo quý', 'Theo năm']) {
      await page.getByText(new RegExp(`^\\s*${m}\\s*$`)).first().click({ force: true });
      await page.waitForTimeout(500);
      await chup(page, `TC-FE-003-${m.replace(/\s/g, '-')}`);
    }
  });

  test('[TC-FE-004] Không chọn được ngày tương lai (Từ ngày <= hôm nay)', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await oKy(page).click({ force: true });
    await page.getByText(/^\s*Tùy chỉnh\s*$/).first().click({ force: true });
    await page.waitForTimeout(500);
    await chup(page, 'TC-FE-004-lich');
    const homNay = new Date();
    const ngay = homNay.getDate();
    // Ô lịch của ngày liền sau hôm nay (nếu cùng tháng) phải ở trạng thái không chọn được.
    test.skip(ngay >= 28, 'Cuối tháng: ngày tương lai nằm ở tháng sau, kiểm tay');
    const o = page.locator('td, .day, [class*=day]').filter({ hasText: new RegExp(`^\\s*${ngay + 1}\\s*$`) }).first();
    const lop = await o.getAttribute('class').catch(() => '') ?? '';
    const dis = (await o.getAttribute('aria-disabled').catch(() => null)) === 'true' || /disabled|off|unavailable|muted/i.test(lop);
    const truoc = await oKy(page).inputValue();
    await o.click({ force: true }).catch(() => undefined);
    const sau = await oKy(page).inputValue();
    luu('TC-FE-004', { ngayThu: ngay + 1, lop, dis, truoc, sau });
    expect(dis || truoc === sau, `Ngày tương lai ${ngay + 1} chọn được (class="${lop}", kỳ "${truoc}" → "${sau}")`).toBeTruthy();
  });

  test('[TC-FE-005] Popup chọn chi nhánh: tìm tên / SĐT, chọn nhiều, Chọn tất cả, Đã chọn n, phân trang', async ({ page, dangNhapUI, phien }) => {
    await dangNhapUI();
    await moBoLoc(page);
    const mo = page.locator('.modal.show');
    await mo.locator('ng-select').filter({ hasText: new RegExp(phien.tenCongTy || 'Cửa hàng') }).first().click();
    await page.waitForTimeout(1200);
    const pop = page.locator('.modal.show').last();
    await expect(pop.getByText('Chọn chi nhánh').first()).toBeVisible();
    await chup(page, 'TC-FE-005-popup-chi-nhanh');
    for (const t of ['STT', 'Tên chi nhánh']) await expect(pop.getByText(t).first()).toBeVisible();
    const tong = Number((await pop.getByText(/Tổng:\s*\d+/).first().innerText()).replace(/\D/g, ''));
    expect(tong, 'tài khoản có nhiều chi nhánh').toBeGreaterThan(1);
    const macDinh = Number((await pop.getByText(/Đã chọn:?\s*\d+/).first().innerText()).replace(/\D/g, ''));
    // tìm theo tên
    const oTim = pop.getByPlaceholder(/Nhập tên cửa hàng/);
    await oTim.fill('Chi nhánh 123');
    await page.waitForTimeout(1200);
    const theoTen = await pop.locator('tbody tr').count();
    // tìm theo SĐT (tài liệu: tìm theo tên chi nhánh, SĐT chi nhánh) — Chi nhánh 123 có SĐT 0337212814
    await oTim.fill('0337212814');
    await page.waitForTimeout(1200);
    const theoSdt = await pop.locator('tbody tr').count();
    await chup(page, 'TC-FE-005-tim-theo-sdt');
    await oTim.fill('');
    await page.waitForTimeout(1000);
    await pop.getByText(/^\s*Chọn tất cả\s*$/i).first().click();
    await page.waitForTimeout(600);
    const daChonTatCa = Number((await pop.getByText(/Đã chọn:?\s*\d+/).first().innerText()).replace(/\D/g, ''));
    await chup(page, 'TC-FE-005-chon-tat-ca');
    luu('TC-FE-005', { tong, macDinhDaChon: macDinh, theoTen, theoSdt, daChonTatCa });
    expect(macDinh, 'mặc định đã chọn đúng 1 chi nhánh hiện tại').toBe(1);
    expect(theoTen, 'tìm theo tên có kết quả').toBeGreaterThan(0);
    expect(daChonTatCa, '"Đã chọn" sau Chọn tất cả = tổng').toBe(tong);
    expect(theoSdt, 'Tìm theo SĐT chi nhánh (tài liệu yêu cầu tên + SĐT) phải có kết quả cho "0337212814"').toBeGreaterThan(0);
  });

  test('[TC-FE-006] Popup chọn sản phẩm: cột, tìm kiếm, chọn tất cả / bỏ chọn, Đã chọn n, ĐVT mặc định', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await page.locator('.modal.show').getByText(/Đã chọn 0 sản phẩm/).first().click({ force: true });
    await page.waitForTimeout(1500);
    await chup(page, 'TC-FE-006-popup');
    const pop = page.locator('.modal.show').last();
    for (const t of ['STT', 'Mã sản phẩm', 'Tên sản phẩm', 'Đơn vị tính']) await expect(pop.getByText(t).first()).toBeVisible();
    const tongText = await pop.getByText(/Tổng:\s*\d+/).first().innerText();
    const tong = Number(tongText.replace(/\D/g, ''));
    // tìm theo tên
    const oTim = pop.locator('input').first();
    // Đọc cột Mã / Tên của các dòng đang hiện (sau khi gõ + Enter, chờ lọc xong).
    const dongHien = async () => pop.locator('tbody tr').evaluateAll(rs => rs.map(r => [...r.children].map(c => (c as HTMLElement).innerText.trim()).slice(2, 4)));
    await oTim.fill('imei ck');
    await oTim.press('Enter');
    await page.waitForTimeout(2000);
    const theoTen = await dongHien();
    const tongSauTen = Number((await pop.getByText(/Tổng:\s*\d+/).first().innerText()).replace(/\D/g, ''));
    // tìm theo mã (tài liệu yêu cầu tìm cả mã)
    await oTim.fill('SP13');
    await oTim.press('Enter');
    await page.waitForTimeout(2000);
    const theoMa = await dongHien();
    const tongSauMa = Number((await pop.getByText(/Tổng:\s*\d+/).first().innerText()).replace(/\D/g, ''));
    const soTheoTen = theoTen.length, soTheoMa = theoMa.length;
    await chup(page, 'TC-FE-006-tim-theo-ma');
    await oTim.fill('');
    await page.waitForTimeout(1000);
    await pop.getByText(/^\s*Chọn tất cả\s*$/i).first().click().catch(() => pop.locator('thead input[type=checkbox]').first().click());
    await page.waitForTimeout(600);
    const daChon = Number((await pop.getByText(/Đã chọn:?\s*\d+/).first().innerText()).replace(/\D/g, ''));
    await chup(page, 'TC-FE-006-da-chon-tat-ca');
    await pop.getByText(/Bỏ chọn tất cả/i).first().click();
    await page.waitForTimeout(500);
    const conLai = await pop.getByText(/Đã chọn:?\s*\d+/).first().isVisible().catch(() => false);
    const dvt = await pop.locator('tbody tr').first().innerText();
    luu('TC-FE-006', { tong, tongSauTen, tongSauMa, theoTen, theoMa, daChon, hienDaChonSauBoChon: conLai, dongDau: dvt });
    expect(daChon, '"Đã chọn" sau Chọn tất cả = tổng số sản phẩm').toBe(tong);
    expect(dvt, 'ĐVT mặc định hiển thị').toMatch(/Cái|Chiếc|[A-Za-zÀ-ỹ]+/);
    expect(soTheoTen, 'tìm theo tên có kết quả').toBeGreaterThan(0);
    expect(theoTen.every(r => r.join(' ').toLowerCase().includes('imei ck')), `tìm "imei ck" phải lọc đúng; các dòng: ${JSON.stringify(theoTen.slice(0, 5))}`).toBeTruthy();
    expect(tongSauTen, 'tìm theo tên phải thu hẹp danh sách').toBeLessThan(tong);
    expect(soTheoMa, 'Tìm theo MÃ sản phẩm (tài liệu: tìm theo mã + tên) phải có kết quả cho "SP13"').toBeGreaterThan(0);
    expect(theoMa.every(r => r.join(' ').toLowerCase().includes('sp13')) && tongSauMa < tong, `tìm mã "SP13" không lọc theo mã: ${soTheoMa} dòng, tổng ${tongSauMa}/${tong}; dòng: ${JSON.stringify(theoMa.slice(0, 5))}`).toBeTruthy();
  });

  test('[TC-FE-007] Checkbox "Tách doanh thu Combo": mặc định tắt, bật/tắt được', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    const cb = page.locator('.modal.show input[type=checkbox]').first();
    expect(await cb.isChecked(), 'mặc định OFF').toBeFalsy();
    await cb.check({ force: true });
    expect(await cb.isChecked()).toBeTruthy();
    await chup(page, 'TC-FE-007-bat');
    await cb.uncheck({ force: true });
    expect(await cb.isChecked()).toBeFalsy();
    ghiChu('DỮ LIỆU', 'Chưa có SP combo: chưa kiểm được "bật ⇒ tự bỏ tích SP combo" và "tắt ⇒ popup không hiện SP combo" (BR-06).');
  });

  test('[TC-FE-008] Sắp xếp: tuỳ chọn và mặc định', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    const mo = page.locator('.modal.show');
    const macDinh = await mo.locator('ng-select').filter({ hasText: /Doanh thu/ }).first().innerText();
    await mo.locator('ng-select').filter({ hasText: /Doanh thu/ }).first().click();
    await page.waitForTimeout(500);
    const ds = await page.locator('.ng-option').allInnerTexts();
    await chup(page, 'TC-FE-008-sap-xep');
    luu('TC-FE-008', { macDinh, tuyChon: ds });
    ghiChu('MẶC ĐỊNH SẮP XẾP', macDinh.trim());
    expect(ds.map(s => s.trim())).toEqual(expect.arrayContaining(['Doanh thu tăng dần', 'Doanh thu giảm dần']));
    if (!/giảm/.test(macDinh)) ghiChu('LỆCH TÀI LIỆU', `Mặc định "${macDinh.trim()}"; tài liệu: mặc định "Doanh thu giảm dần"; tài liệu còn có "Doanh số giảm dần" — UI không có ⇒ ⚠️ Cần BA chốt.`);
    expect(macDinh, 'Tài liệu: mặc định Doanh thu GIẢM dần').toMatch(/giảm/);
  });

  test('[TC-FE-009] Báo cáo tổng hợp: cột, dòng Tổng, số trên UI = số API', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await chonKy(page, /^\s*Theo năm\s*$/);
    await chonTatCaSP(page);
    const kq = await xemBaoCao(page);
    await chup(page, 'TC-FE-009-ket-qua');
    const bang = await docBang(page);
    const tieuDe = bang[0].map(s => s.replace(/\s+/g, ' '));
    for (const t of ['STT', 'Mã SP', 'Tên SP', 'ĐVT', 'SL bán', 'Doanh thu', 'Tiền vốn', 'Lợi nhuận', 'Tỷ lệ LN/DT', 'Tỷ lệ LN/TV', 'Chi nhánh']) expect(tieuDe.join('|'), `thiếu cột ${t}`).toContain(t);
    const dongTong = bang.find(r => r[0] === 'Tổng')!;
    expect(dongTong, 'có dòng Tổng').toBeTruthy();
    const so4 = dongTong.filter(c => /\d/.test(c)).map(chuSo);
    expect(so4, 'Tổng UI = overview API').toEqual([kq.ov.totalQuantity, kq.ov.totalRevenue, kq.ov.totalPurchasePrice, kq.ov.totalProfit].map(Number));
    const dongDL = bang.filter(r => /^\d+$/.test(r[0]));
    expect(dongDL.length).toBe(Math.min(kq.dsApi.length, 20));
    kq.dsApi.slice(0, dongDL.length).forEach((x: any, i: number) => {
      expect(dongDL[i][1], `dòng ${i + 1} mã SP`).toBe(x.productCode);
      expect(chuSo(dongDL[i][5]), `dòng ${i + 1} doanh thu`).toBe(Number(x.revenue));
      expect(chuSo(dongDL[i][6]), `dòng ${i + 1} tiền vốn`).toBe(Number(x.purchasePrice));
      expect(chuSo(dongDL[i][7]), `dòng ${i + 1} lợi nhuận`).toBe(Number(x.profit));
    });
    luu('TC-FE-009', { bodyGui: kq.body, tongApi: kq.ov, soDongUI: dongDL.length, soDongApi: kq.dsApi.length });
    ghiChu('BODY UI GỬI', JSON.stringify(kq.body));
    ghiChu('KIỂM CỘT CHI NHÁNH', `dòng đầu cột Chi nhánh: "${dongDL[0]?.[10]}" (API dòng không có trường chi nhánh)`);
  });

  test('[TC-FE-010] Từ báo cáo tổng hợp mở báo cáo chi tiết theo đơn', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await chonKy(page, /^\s*Theo năm\s*$/);
    await chonTatCaSP(page);
    await xemBaoCao(page);
    const goiChiTiet: string[] = [];
    page.on('request', r => { if (/product-profit\/detail/.test(r.url())) goiChiTiet.push(r.postData() || ''); });
    const dong = page.locator('table tbody tr').filter({ hasText: /SP\d+/ }).first();
    await dong.getByText(/^SP\d+/).first().click().catch(() => dong.click());
    await page.waitForTimeout(3000);
    await chup(page, 'TC-FE-010-chi-tiet');
    luu('TC-FE-010', { yeuCauChiTiet: goiChiTiet, url: page.url() });
    expect(goiChiTiet.length, 'Không tìm thấy lối vào báo cáo chi tiết theo đơn từ dòng sản phẩm (tài liệu có báo cáo chi tiết) — kiểm tay / hỏi dev').toBeGreaterThan(0);
    const chu = await page.locator('body').innerText();
    for (const t of ['DH', 'Diễn giải']) expect(chu, `chi tiết thiếu "${t}"`).toContain(t);
  });

  test('[TC-FE-011] Kỳ không có bill (Hôm nay) ⇒ rỗng, tổng 0, không lỗi', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await chonTatCaSP(page);
    const kq = await xemBaoCao(page);
    await chup(page, 'TC-FE-011-ky-rong');
    expect(kq.dsApi).toHaveLength(0);
    expect(Number(kq.ov.totalRevenue ?? 0)).toBe(0);
    const bang = await docBang(page).catch(() => []);
    expect(bang.filter(r => /^\d+$/.test(r[0]))).toHaveLength(0);
  });

  test('[TC-FE-012] Xuất Excel / PDF tải được', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await chonKy(page, /^\s*Theo năm\s*$/);
    await chonTatCaSP(page);
    await xemBaoCao(page);
    const nut = page.getByRole('button', { name: /Excel/i }).first();
    expect(await nut.isVisible().catch(() => false), 'có nút Xuất Excel').toBeTruthy();
    const [tai] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), nut.click()]);
    const ten = tai.suggestedFilename();
    await tai.saveAs(path.join(DU_LIEU, 'TC-FE-012-' + ten));
    luu('TC-FE-012', { excel: ten });
    expect(ten).toMatch(/\.xlsx?$/i);
    expect(fs.statSync(path.join(DU_LIEU, 'TC-FE-012-' + ten)).size).toBeGreaterThan(1000);
    const pdf = page.getByRole('button', { name: /PDF/i }).first();
    if (await pdf.isVisible().catch(() => false)) {
      const r = page.waitForResponse(x => /export-pdf|dynamic-report|product-profit/.test(x.url()) && /pdf/i.test(x.url()), { timeout: 60_000 }).catch(() => null);
      await pdf.click();
      const resp = await r;
      ghiChu('PDF', resp ? `HTTP ${resp.status()} ${resp.url().replace(/^https?:\/\/[^/]+/, '')}` : 'không bắt được phản hồi PDF (có thể mở tab mới)');
      await chup(page, 'TC-FE-012-sau-bam-PDF');
      luu('TC-FE-012-pdf', { http: resp?.status() ?? null, url: resp?.url().replace(/^https?:\/\/[^/]+/, '') ?? null });
      expect(resp, 'bấm Kết xuất PDF phải có phản hồi export-pdf').toBeTruthy();
      expect(resp!.status(), `Kết xuất PDF trả HTTP ${resp!.status()}`).toBe(200);
    } else ghiChu('PDF', 'không thấy nút PDF');
  });

  test('[TC-FE-013] Phân trang: đổi kích thước, chuyển trang, tổng không đổi', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await chonKy(page, /^\s*Theo năm\s*$/);
    await chonTatCaSP(page);
    const kq = await xemBaoCao(page);
    test.skip(Number(kq.ov.totalQuantity) === 0, 'không có dữ liệu để phân trang');
    const b1 = await docBang(page);
    const tong1 = b1.find(r => r[0] === 'Tổng');
    const ma1 = b1.filter(r => /^\d+$/.test(r[0])).map(r => r[1] + r[2]);
    await page.getByText('2', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    await chup(page, 'TC-FE-013-trang-2');
    const b2 = await docBang(page);
    const tong2 = b2.find(r => r[0] === 'Tổng');
    const ma2 = b2.filter(r => /^\d+$/.test(r[0])).map(r => r[1] + r[2]);
    luu('TC-FE-013', { ma1, ma2, tong1, tong2 });
    expect(ma2.length).toBeGreaterThan(0);
    expect(ma2.filter(m => ma1.includes(m)), 'trang 2 không trùng trang 1').toHaveLength(0);
    expect(tong2, 'Tổng không đổi khi sang trang').toEqual(tong1);
  });

  test('[TC-FE-015] Chọn 2 chi nhánh: cột Chi nhánh của từng dòng đúng chi nhánh sở hữu SP', async ({ page, dangNhapUI, phien }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await chonKy(page, /^\s*Theo năm\s*$/);
    const mo = page.locator('.modal.show');
    await mo.locator('ng-select').filter({ hasText: new RegExp(phien.tenCongTy || 'Cửa hàng') }).first().click();
    await page.waitForTimeout(1200);
    const pop = page.locator('.modal.show').last();
    await pop.getByPlaceholder(/Nhập tên cửa hàng/).fill('Long test');
    await page.waitForTimeout(1500);
    await pop.locator('tbody tr').filter({ hasText: /^\s*\d+\s*Long test\s*$/ }).first().locator('input[type=checkbox], .checkbox, label').first().click({ force: true }).catch(() => pop.locator('tbody tr').first().click());
    await page.waitForTimeout(500);
    await pop.getByPlaceholder(/Nhập tên cửa hàng/).fill('');
    await page.waitForTimeout(1000);
    const daChon = Number((await pop.getByText(/Đã chọn:?\s*\d+/).first().innerText()).replace(/\D/g, ''));
    await chup(page, 'TC-FE-015-chon-2-chi-nhanh');
    await pop.getByRole('button', { name: /Xác nhận/ }).click();
    await page.waitForTimeout(800);
    await chonTatCaSP(page);
    const kq = await xemBaoCao(page);
    await chup(page, 'TC-FE-015-ket-qua');
    const bang = await docBang(page);
    const dong = bang.filter(r => /^\d+$/.test(r[0]));
    const cotCN = dong.map(r => r[10]);
    const khac = [...new Set(cotCN)];
    luu('TC-FE-015', { daChon, comIdsGui: kq.body.comIds, cacGiaTriCotChiNhanh: khac, soDong: dong.length, tongApi: kq.ov });
    ghiChu('BODY UI GỬI', JSON.stringify(kq.body));
    expect(daChon, 'đã chọn 2 chi nhánh').toBe(2);
    expect(kq.body.comIds.length, 'UI gửi 2 comIds').toBe(2);
    expect(khac.length, `Cột Chi nhánh chỉ có ${JSON.stringify(khac)} dù chọn 2 chi nhánh — mỗi dòng phải ghi chi nhánh sở hữu SP (BR-13)`).toBeGreaterThan(1);
  });

  test('[TC-FE-014] Validate: không chọn sản phẩm ⇒ báo "Vui lòng chọn sản phẩm" (tài liệu: mặc định tất cả SP)', async ({ page, dangNhapUI }) => {
    await dangNhapUI();
    await moBoLoc(page);
    await page.getByRole('button', { name: /Xem báo cáo/ }).click();
    await page.waitForTimeout(1200);
    await chup(page, 'TC-FE-014-khong-chon-sp');
    const thongBao = await page.locator('.toast, .toast-message, [role=alert]').allInnerTexts();
    luu('TC-FE-014', { thongBao });
    ghiChu('⚠️ LỆCH TÀI LIỆU', 'BR-04: "GT mặc định: Tất cả sản phẩm thuộc chi nhánh đã chọn" — UI bắt buộc chọn sản phẩm. Cần BA chốt (thiết kế đã đổi?).');
    expect(thongBao.join(' ')).toMatch(/chọn sản phẩm/i);
  });
});
