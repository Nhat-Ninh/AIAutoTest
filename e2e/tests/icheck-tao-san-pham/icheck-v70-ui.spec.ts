/* Kiểm thử FE MỚI theo tài liệu v70 — màn Thêm sản phẩm (4.1) và popup Quét mã vạch thêm sản phẩm (4.2), lượt 29/10/2026.
 * Báo cáo: bao-cao/2026-10-29_icheck-tao-san-pham/ (02-testcase.md). Chạy: cd e2e && npx playwright test tests/icheck-tao-san-pham/icheck-v70-ui.spec.ts --project=dev [--headed]
 * Bộ chọn lấy từ _chung.ts (BH-20261023-af32fad6, BH-20261028-367f0698). Ô chưa có bộ chọn trong kho bài học (ĐVT, giá…) là ĐOÁN, hiệu chỉnh ở Bước 4.
 * Mỗi lô quick-create cách nhau ≥35 giây (khoá EXCEL_IMPORTING, TC-BE-ICK-022). Tên sản phẩm bắt đầu AUTO_V70U_ (luật AUTO_: không thử tên 1 ký tự). */
import type { Page } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { dongHopThoai } from '../../lib/ui';
import { duLieu, json } from '../../lib/api';
import { dsTheoTuKhoa, taoSPCoMaVach } from '../../lib/san-pham';
import { batTheoDoiTon, boMa, cot, demQuet, doiSoDong, doiToast, dongQuet, dsGoiYTen, ghiChu, moModalThemSanPham, moPopupQuet, nutLuuSP, nutXacNhan, oMaVachSP, oNhapQuet, oQuet, oTenSP, quet, sanDongHopLe, suggestTheoTen, textToast, theoDoiToast, timTheoMaVach, TRANG_SP, TU_KHOA_CO_GOI_Y } from './_chung';

const { ma, maVachMoi, hauTo } = boMa('V70U');
const modal = (page: Page) => page.locator('.modal-dialog').first();
const oGiaBanSP = (page: Page) => modal(page).locator('input[name="salePrice"]').first();
const noiDong = async (page: Page) => (await dongQuet(page).allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
const GIAN_CACH_KHOA = 35_000;

async function chonDVT(page: Page, d: number) {
  const o = oQuet(page, d, cot.dvt).locator('ng-select').first();
  if (!(await o.count())) { ghiChu('KỊCH BẢN', 'Không tìm thấy ng-select ở cột ĐVT — hiệu chỉnh bộ chọn'); return; }
  await o.click();
  await page.locator('.ng-dropdown-panel .ng-option').first().click();
}
async function nhapSo(page: Page, d: number, c: number, v: string) {
  const o = oQuet(page, d, c).locator('input');
  await o.fill('');
  await o.pressSequentially(v);
  return o.inputValue();
}

test.describe('FE — màn Thêm sản phẩm (v70, mục mới)', { tag: ['@ui', '@regression', '@icheck'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI }) => {
    await theoDoiToast(page);
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_SP);
    await dongHopThoai(page);
  });

  test('[TC-FE-ICK-022] 4.1.2 bước 3 / Exception 2b: chọn gợi ý có mã vạch ĐÃ TỒN TẠI ⇒ toast "Mã vạch [mã] đã tồn tại" ngay khi chọn, form VẪN điền dữ liệu', async ({ page, api, phien }) => {
    await moModalThemSanPham(page);
    await oTenSP(page).fill(TU_KHOA_CO_GOI_Y);
    await expect(dsGoiYTen(page).first()).toBeVisible({ timeout: 10000 });
    test.skip((await dsGoiYTen(page).count()) < 2, 'DỮ LIỆU: dropdown có <2 gợi ý');
    const bc = ((await dsGoiYTen(page).nth(1).innerText()).match(/\d{8,14}/) || [])[0] ?? '';   // gợi ý thứ 2 (không dùng gợi ý đầu = MA_VACH_CO_GOI_Y)
    test.skip(!bc, 'DỮ LIỆU: dòng gợi ý thứ 2 không có mã vạch dạng số');
    if (!(await timTheoMaVach(api, bc)).length) {
      const r = await taoSPCoMaVach(api, phien.comId, bc, ma('022-ma'), ma('022-da-co'));
      expect(r.status(), (await r.text()).slice(0, 200)).toBe(200);
      await oTenSP(page).fill('');
      await oTenSP(page).fill(TU_KHOA_CO_GOI_Y);
      await expect(dsGoiYTen(page).first()).toBeVisible({ timeout: 10000 });
    }
    const dong = dsGoiYTen(page).filter({ hasText: bc }).first();
    test.skip(!(await dong.isVisible().catch(() => false)), `DỮ LIỆU: dropdown (≤8) không chứa gợi ý mã ${bc}`);
    await dong.click();
    const tt = await doiToast(page, 8000);
    await page.screenshot({ path: test.info().outputPath('ICK-022-chon-goi-y-trung-ma.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Mã ${bc}; toast ${JSON.stringify(tt)}; Tên="${await oTenSP(page).inputValue()}"`);
    expect(tt.some(s => /Mã vạch.*đã tồn tại/i.test(s)), `tài liệu 4.1.2 bước 3: toast khi chọn. Toast: ${JSON.stringify(tt)}`).toBe(true);
    expect((await oTenSP(page).inputValue()).length, 'tài liệu 4.1.2 Exception 2b: vẫn điền dữ liệu (⚠ 2.2 nói "không điền")').toBeGreaterThan(0);
  });

  test('[TC-FE-ICK-023] 4.1.1: placeholder ô Mã vạch = "Nhập/quét mã vạch, nhấn Enter để xem gợi ý"', async ({ page }) => {
    await moModalThemSanPham(page);
    const ph = (await oMaVachSP(page).getAttribute('placeholder')) ?? '';
    ghiChu('KẾT QUẢ QUAN SÁT', `placeholder thực tế: "${ph}"`);
    expect(ph, 'tài liệu 4.1.1 tóm tắt thay đổi').toBe('Nhập/quét mã vạch, nhấn Enter để xem gợi ý');
  });

  test('[TC-FE-ICK-024] BVA ô Tên: 1 ký tự có gợi ý (≤8); xoá hết / chỉ khoảng trắng không hiện gợi ý, không lỗi', async ({ page }) => {
    await moModalThemSanPham(page);
    await oTenSP(page).fill('s');
    await expect(dsGoiYTen(page).first(), '1 ký tự đã phải có gợi ý (4.1.1 dòng 1)').toBeVisible({ timeout: 10000 });
    expect(await dsGoiYTen(page).count(), 'tối đa 8').toBeLessThanOrEqual(8);
    await oTenSP(page).fill('');
    await page.waitForTimeout(1500);
    const sauXoa = await dsGoiYTen(page).count();
    await oTenSP(page).fill('   ');
    await page.waitForTimeout(2500);
    const sauCach = await dsGoiYTen(page).count();
    await page.screenshot({ path: test.info().outputPath('ICK-024-khoang-trang.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `số gợi ý: sau xoá hết=${sauXoa}; chỉ khoảng trắng=${sauCach}`);
    expect(sauXoa, 'ô rỗng không được hiện gợi ý').toBe(0);
    expect(sauCach, 'chỉ khoảng trắng không được hiện gợi ý (QUAN SÁT nếu >0)').toBe(0);
  });

  test('[TC-FE-ICK-025] EG: tên có ký tự đặc biệt + khoảng trắng cuối ⇒ gõ không lỗi, lưu giữ đúng ký tự (kiểm CSDL Bước 5)', async ({ page, api }) => {
    const co = `${ma('025')}'<%\\é`;
    await moModalThemSanPham(page);
    await oTenSP(page).fill(co + '😀 ');
    const sauNhap = await oTenSP(page).inputValue();
    ghiChu('KẾT QUẢ QUAN SÁT', `Nhập tên có emoji → ô hiển thị "${sauNhap}" (giữ emoji=${sauNhap.includes('😀')})`);
    if (!sauNhap) await oTenSP(page).fill(co);       // ô bị xoá sạch khi có emoji ⇒ thử lại không emoji để kiểm các ký tự còn lại
    await page.waitForTimeout(1500);
    if (await oGiaBanSP(page).count()) await oGiaBanSP(page).fill('12000');
    await nutLuuSP(page).click();
    const tt = await doiToast(page, 8000);
    await page.screenshot({ path: test.info().outputPath('ICK-025-ky-tu-dac-biet.png'), fullPage: true });
    const ds = (await dsTheoTuKhoa(api, ma('025'))).filter(x => String(x?.name).startsWith(ma('025')));
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast ${JSON.stringify(tt)}; tên lưu: ${JSON.stringify(ds.map(x => x?.name))}. Tra CSDL Bước 5: tên bắt đầu ${ma('025')}`);
    expect(ds.length, `phải lưu được. Toast: ${JSON.stringify(tt)}`).toBeGreaterThan(0);
    expect(ds.some(x => String(x?.name).trim() === co || String(x?.name).trim() === co + '😀'), `tên phải giữ đúng ký tự: ${JSON.stringify(ds.map(x => x?.name))}`).toBe(true);
    expect(sauNhap, 'ô Tên không được tự xoá sạch khi nhập tên có emoji').not.toBe('');
  });

  test('[TC-FE-ICK-026] ID: bấm Lưu 2 lần liên tiếp ⇒ chỉ 1 sản phẩm', async ({ page, api }) => {
    const ten = ma('026');
    await moModalThemSanPham(page);
    await oTenSP(page).fill(ten);
    if (await oGiaBanSP(page).count()) await oGiaBanSP(page).fill('12000');
    await nutLuuSP(page).dblclick({ delay: 50 }).catch(async () => { await nutLuuSP(page).click(); });
    await doiToast(page, 8000);
    await page.waitForTimeout(2500);
    const ds = (await dsTheoTuKhoa(api, ten)).filter(x => String(x?.name) === ten);
    await page.screenshot({ path: test.info().outputPath('ICK-026-luu-hai-lan.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Số SP tên ${ten}: ${ds.length}`);
    test.skip(ds.length === 0, 'KỊCH BẢN: lưu chưa thành công (thiếu trường bắt buộc) — hiệu chỉnh ở Bước 4');
    expect(ds.length, 'bấm đúp Lưu không được tạo trùng').toBe(1);
  });
});

test.describe('FE — popup Quét mã vạch thêm sản phẩm (v70, mục mới)', { tag: ['@ui', '@regression', '@icheck'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI }) => {
    await theoDoiToast(page);
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_SP);
    await dongHopThoai(page);
  });

  test('[TC-QMV-024] 4.2.1/4.2.2 bước 3: dòng mới — Kho hàng = "Kho bán hàng", Mã SP placeholder "Tự động tạo", nhãn ghi chú tồn kho', async ({ page }) => {
    await moPopupQuet(page);
    await quet(page, maVachMoi());
    await doiSoDong(page, 1);
    const phMaSP = (await oQuet(page, 0, cot.maSP).locator('input').getAttribute('placeholder')) ?? '';
    const cellKho = (await oQuet(page, 0, cot.kho).innerText()).replace(/\s+/g, ' ');
    const body = (await page.locator('.scan-product-modal-body').innerText()).replace(/\s+/g, ' ');
    await page.screenshot({ path: test.info().outputPath('QMV-024-dong-moi.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `placeholder Mã SP="${phMaSP}"; ô kho="${cellKho}"; có nhãn ghi chú=${/Chọn kho \(hoặc bật theo dõi\)/.test(body)}`);
    expect(phMaSP, '4.2.1 Mã sản phẩm').toBe('Tự động tạo');
    expect(body, '4.2.1 dòng Ghi chú').toContain('Chọn kho (hoặc bật theo dõi) và nhập số lượng để quản lý tồn kho.');
    ghiChu('CẦN BA CHỐT', `4.2.2 bước 3 nói "Kho hàng: Kho bán hàng" nhưng không có cột "Kho hàng" riêng ở 4.2.1 (chỉ cột Theo dõi tồn kho). Ô kho thực tế: "${cellKho}"`);
  });

  test('[TC-QMV-025] 4.2.1 dropdown "Trạng thái": ẩn lúc đầu, hiện khi có SP không hợp lệ; lọc "Không hợp lệ" chỉ còn dòng lỗi', async ({ page, api, phien }) => {
    const daDung = maVachMoi();
    const r0 = await taoSPCoMaVach(api, phien.comId, daDung, ma('025a'), ma('025a-da-co'));
    expect(r0.status(), (await r0.text()).slice(0, 200)).toBe(200);
    await moPopupQuet(page);
    const boLoc = page.locator('.scan-product-modal-body').getByText(/^\s*Tất cả\s*$/);        // 4.2.1: dropdown "Trạng thái" mặc định "Tất cả" (khám phá 29/10: chưa thấy dropdown nào)
    const [a, b] = [maVachMoi(), maVachMoi()];
    await quet(page, a); await doiSoDong(page, 1);
    await quet(page, b); await doiSoDong(page, 2);
    const truoc = await boLoc.count();
    await sanDongHopLe(page, 0, ma('025-0'));
    await sanDongHopLe(page, 1, ma('025-1'));
    await oQuet(page, 1, cot.maVach).locator('input').fill(daDung);       // dòng 2 lỗi do BE (mã đã dùng)
    await nutXacNhan(page).click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: test.info().outputPath('QMV-025-trang-thai.png'), fullPage: true });
    const sau = await boLoc.count();
    ghiChu('KẾT QUẢ QUAN SÁT', `Số bộ lọc: trước=${truoc}, sau=${sau}; dòng: ${JSON.stringify((await noiDong(page)).map(s => s.slice(0, 90)))}`);
    expect(truoc, 'trước khi có lỗi dropdown Trạng thái phải ẩn').toBe(0);
    expect(sau, 'có SP không hợp lệ ⇒ dropdown Trạng thái hiện').toBeGreaterThan(0);
    await boLoc.first().click();
    await page.locator('.ng-dropdown-panel .ng-option', { hasText: /Không hợp lệ/ }).first().click().catch(() => ghiChu('KỊCH BẢN', 'Không tìm thấy lựa chọn "Không hợp lệ" trong bộ lọc — hiệu chỉnh'));
    await page.waitForTimeout(800);
    const loc = await noiDong(page);
    expect(loc.length, 'lọc "Không hợp lệ" ⇒ chỉ dòng lỗi').toBeGreaterThan(0);
    expect(loc.every(s => /Không hợp lệ/.test(s)), JSON.stringify(loc)).toBe(true);
  });

  test('[TC-QMV-026] 4.2.2 bước 6–7: Xác nhận ⇒ popup "Xác nhận thêm sản phẩm" hiển thị trạng thái từng sản phẩm (⚠ nhãn nút)', async ({ page, api }) => {
    await moPopupQuet(page);
    const [a, b] = [maVachMoi(), maVachMoi()];
    await quet(page, a); await doiSoDong(page, 1);
    await quet(page, b); await doiSoDong(page, 2);
    for (let i = 0; i < 2; i++) await sanDongHopLe(page, i, ma('026-' + i));
    const nhan = (await nutXacNhan(page).innerText()).trim();
    await nutXacNhan(page).click();
    await page.waitForTimeout(3000);
    const popupXN = page.locator('.modal-dialog', { hasText: /Xác nhận thêm sản phẩm/ });
    const co = await popupXN.count();
    await page.screenshot({ path: test.info().outputPath('QMV-026-popup-xac-nhan.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Nhãn nút cuối="${nhan}"; popup "Xác nhận thêm sản phẩm" xuất hiện=${co > 0}; toast=${JSON.stringify(await textToast(page))}; số SP tạo: a=${(await timTheoMaVach(api, a)).length}, b=${(await timTheoMaVach(api, b)).length}`);
    ghiChu('CẦN BA CHỐT', `Nút cuối: bảng 4.2.1 "Thêm vào danh sách" / luồng 4.2.2 "Xác nhận" / thực tế "${nhan}".`);
    expect(co, 'tài liệu 4.2.2 bước 7: chuyển sang popup "Xác nhận thêm sản phẩm"').toBeGreaterThan(0);
  });

  test('[TC-QMV-027] BVA Số lượng tồn: 0, 1, 2147483647, 2147483648, 999999999999 (bật theo dõi, giá nhập 1.000.000) ⇒ không lỗi hệ thống, lỗi nêu rõ tại dòng', async ({ page, api }) => {
    await moPopupQuet(page);
    const sl = ['0', '1', '2147483647', '2147483648', '999999999999'];
    const bc: string[] = [];
    for (let i = 0; i < sl.length; i++) { bc.push(maVachMoi()); await quet(page, bc[i]); await doiSoDong(page, i + 1); }
    for (let i = 0; i < sl.length; i++) {
      await sanDongHopLe(page, i, ma('027-' + i));
      await batTheoDoiTon(page, i);
      await chonDVT(page, i);
      await oQuet(page, i, cot.giaNhap).locator('input').fill('1000000');
      await nhapSo(page, i, cot.slTon, sl[i]);
    }
    await page.screenshot({ path: test.info().outputPath('QMV-027-truoc.png'), fullPage: true });
    await nutXacNhan(page).click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: test.info().outputPath('QMV-027-sau.png'), fullPage: true });
    const tt = await textToast(page);
    const dong = await noiDong(page);
    const tao = await Promise.all(bc.map(async m => (await timTheoMaVach(api, m)).length));
    ghiChu('KẾT QUẢ QUAN SÁT', `SL→số SP tạo: ${sl.map((s, i) => `${s}:${tao[i]}`).join(', ')}; toast=${JSON.stringify(tt)}; dòng=${JSON.stringify(dong.map(s => s.slice(0, 110)))}. Mã vạch để tra CSDL: ${bc.join(',')}`);
    expect(tt.filter(s => /Không thể thêm sản phẩm|lỗi hệ thống|500/i.test(s)), 'không được lỗi hệ thống khi SL biên').toEqual([]);
    expect(tao[3] + tao[4], 'SL vượt giới hạn int/tràn thì không được tạo SP với tồn sai (nếu tạo ⇒ ghi lại, kiểm CSDL)').toBe(0);
  });

  test('[TC-QMV-028] EP/BVA/EG Giá bán: 0, -1, 3.5, 1000000000, "abc" ⇒ ô không nhận giá trị sai; ghi hành vi giá 0 và thập phân', async ({ page, api }) => {
    await moPopupQuet(page);
    const gia = ['0', '-1', '3.5', '1000000000', 'abc'];
    const bc: string[] = [];
    for (let i = 0; i < gia.length; i++) { bc.push(maVachMoi()); await quet(page, bc[i]); await doiSoDong(page, i + 1); }
    const hienThi: string[] = [];
    for (let i = 0; i < gia.length; i++) {
      const oTen = oQuet(page, i, cot.ten).locator('input');
      if (!(await oTen.inputValue())) await oTen.fill(ma('028-' + i));
      hienThi.push(await nhapSo(page, i, cot.giaBan, gia[i]));
    }
    await nutXacNhan(page).click();
    await page.waitForTimeout(4500);
    await page.screenshot({ path: test.info().outputPath('QMV-028-gia-ban.png'), fullPage: true });
    const tao = await Promise.all(bc.map(async m => (await timTheoMaVach(api, m)).length));
    ghiChu('KẾT QUẢ QUAN SÁT', `giá gõ→ô hiển thị→số SP tạo: ${gia.map((g, i) => `"${g}"→"${hienThi[i]}"→${tao[i]}`).join('; ')}. Mã vạch tra CSDL: ${bc.join(',')}`);
    ghiChu('CẦN BA CHỐT', 'Giá bán 0 và giá thập phân ở popup Web: tài liệu chỉ nêu Mobile "Số nguyên ≥ 0"; Web chưa nêu.');
    expect(hienThi[1], 'giá âm không được nằm lại trong ô').not.toMatch(/-/);
    expect(hienThi[4], 'chữ không được nằm lại trong ô').not.toMatch(/[a-z]/i);
    expect(tao[1] + tao[4], 'giá âm / chữ không được tạo SP').toBe(0);
  });

  test('[TC-QMV-029] BVA độ dài: Tên 5 (AUTO_), 255, 256, 300 ký tự; Mã vạch 8, 14, 30, 51 ký tự ⇒ ghi giới hạn thật FE vs BE, vượt biên báo lỗi tại dòng, không lỗi hệ thống', async ({ page, api }) => {
    await moPopupQuet(page);
    const dai = (n: number) => 'AUTO_V70U_'.padEnd(n, 'x').slice(0, n);
    const tenLen = [5, 255, 256, 300];
    const mvLen = [8, 14, 30, 51];
    const bc: string[] = [];
    const tong = tenLen.length + mvLen.length;
    for (let i = 0; i < tong; i++) { bc.push(maVachMoi()); await quet(page, bc[i]); await doiSoDong(page, i + 1); }
    const mvThucTe: string[] = [];
    for (let i = 0; i < tong; i++) {
      const oTen = oQuet(page, i, cot.ten).locator('input');
      const oMv = oQuet(page, i, cot.maVach).locator('input');
      if (i < tenLen.length) await oTen.fill(tenLen[i] === 5 ? 'AUTO_' : dai(tenLen[i]));
      else { await oTen.fill(ma('029-' + i)); const n = mvLen[i - tenLen.length]; const m = ('297' + hauTo + '9999999999999999999999999999999999999999999999999').slice(0, n); await oMv.fill(m); bc[i] = m; }
      await oQuet(page, i, cot.giaBan).locator('input').fill('10000');
      mvThucTe.push(await oMv.inputValue());
    }
    await nutXacNhan(page).click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: test.info().outputPath('QMV-029-do-dai.png'), fullPage: true });
    const tt = await textToast(page);
    const tao = await Promise.all(bc.map(async m => (await timTheoMaVach(api, m)).length));
    const dong = await noiDong(page);
    ghiChu('KẾT QUẢ QUAN SÁT', `toast=${JSON.stringify(tt)}; tạo=${JSON.stringify(tao)}; ô mã vạch nhận=${JSON.stringify(mvThucTe.map(s => s.length))}; dòng=${JSON.stringify(dong.map(s => s.slice(0, 100)))}`);
    ghiChu('CẦN BA CHỐT', 'Tài liệu nêu "theo quy tắc hiện có" nhưng không ghi số giới hạn độ dài tên / mã vạch.');
    expect(tt.filter(s => /Không thể thêm sản phẩm|lỗi hệ thống|500/i.test(s)), 'không được lỗi hệ thống khi vượt độ dài').toEqual([]);
    expect(tao[3], 'tên 300 ký tự (vượt mọi giới hạn thường gặp) không được tạo nếu chưa có giới hạn rõ — ghi lại nếu tạo').toBe(0);
  });

  test('[TC-QMV-030] ID: bấm nút cuối 2 lần liên tiếp ⇒ chỉ tạo 1 sản phẩm', async ({ page, api }) => {
    await moPopupQuet(page);
    const a = maVachMoi();
    await quet(page, a); await doiSoDong(page, 1);
    await sanDongHopLe(page, 0, ma('030'));
    await nutXacNhan(page).dblclick({ delay: 50 }).catch(async () => { await nutXacNhan(page).click(); });
    await page.waitForTimeout(5000);
    const tt = await textToast(page);
    await page.screenshot({ path: test.info().outputPath('QMV-030-bam-hai-lan.png'), fullPage: true });
    const n = (await timTheoMaVach(api, a)).length;
    ghiChu('KẾT QUẢ QUAN SÁT', `Toast ${JSON.stringify(tt)}; số SP mã ${a} = ${n}`);
    expect(n, 'bấm đúp không được tạo trùng').toBe(1);
    expect(tt.filter(s => /Bạn đang có tiến trình khác/.test(s)), 'người dùng không được thấy báo tiến trình khác chạy do chính mình bấm đúp (BUG-6)').toEqual([]);
  });

  test('[TC-QMV-031] EG (dán từ Excel): quét mã dính khoảng trắng đầu/cuối khi mã sạch đã có trong bảng ⇒ xử lý như mã sạch, không thêm dòng', async ({ page }) => {
    await moPopupQuet(page);
    const m = maVachMoi();
    await quet(page, m); await doiSoDong(page, 1);
    await quet(page, ` ${m} `);
    await page.waitForTimeout(1500);
    const soDong = await dongQuet(page).count();
    const tt = await textToast(page);
    await page.screenshot({ path: test.info().outputPath('QMV-031-khoang-trang.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Số dòng=${soDong}; toast=${JSON.stringify(tt)}; ô mã vạch dòng 1="${await oQuet(page, 0, cot.maVach).locator('input').inputValue()}"`);
    expect(soDong, 'mã dính khoảng trắng phải bị coi là trùng mã đã có trong bảng').toBe(1);
    expect(tt.some(s => /đã có trong danh sách/.test(s)), `toast. ${JSON.stringify(tt)}`).toBe(true);
  });

  test('[TC-QMV-032] ST: lô A hợp lệ + B mã đã dùng ⇒ B "Không hợp lệ"; sửa B sang mã mới, Xác nhận lại ⇒ B tạo, không tạo trùng A', async ({ page, api, phien }) => {
    const daDung = maVachMoi();
    const r0 = await taoSPCoMaVach(api, phien.comId, daDung, ma('032z'), ma('032z-da-co'));
    expect(r0.status(), (await r0.text()).slice(0, 200)).toBe(200);
    await moPopupQuet(page);
    const [a, b, bMoi] = [maVachMoi(), maVachMoi(), maVachMoi()];
    await quet(page, a); await doiSoDong(page, 1);
    await quet(page, b); await doiSoDong(page, 2);
    await sanDongHopLe(page, 0, ma('032-a'));
    await sanDongHopLe(page, 1, ma('032-b'));
    await oQuet(page, 1, cot.maVach).locator('input').fill(daDung);
    await nutXacNhan(page).click();
    await page.waitForTimeout(4000);
    const lan1 = await noiDong(page);
    const soA1 = (await timTheoMaVach(api, a)).length;
    await page.screenshot({ path: test.info().outputPath('QMV-032-lan-1.png'), fullPage: true });
    ghiChu('KẾT QUẢ QUAN SÁT', `Lần 1: dòng=${JSON.stringify(lan1.map(s => s.slice(0, 100)))}; số SP A=${soA1} (code: tạo một phần; tài liệu 6b: "Không lưu")`);
    if (soA1 > 0) ghiChu('CẦN BA CHỐT', 'Lô có dòng lỗi: A hợp lệ đã được tạo ngay lần 1 (tạo một phần), tài liệu 6b nói "Không lưu".');
    await page.waitForTimeout(GIAN_CACH_KHOA);
    const dongB = dongQuet(page).filter({ hasText: /Không hợp lệ/ }).first();
    const viTri = await dongB.locator('input').evaluateAll((els, v) => els.findIndex(e => (e as HTMLInputElement).value === v), daDung);
    await dongB.locator('input').nth(viTri).fill(bMoi);       // sau Xác nhận bảng thêm cột STT / Trạng thái / Chi tiết lỗi ⇒ tìm ô theo giá trị, không theo chỉ số cột
    await nutXacNhan(page).click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: test.info().outputPath('QMV-032-lan-2.png'), fullPage: true });
    const [nA, nB] = [(await timTheoMaVach(api, a)).length, (await timTheoMaVach(api, bMoi)).length];
    ghiChu('KẾT QUẢ QUAN SÁT', `Lần 2: toast=${JSON.stringify(await textToast(page))}; A=${nA}, B(mã mới)=${nB}. Mã vạch tra CSDL: A=${a}, B=${bMoi}`);
    expect(nA, 'A không được bị tạo trùng').toBe(1);
    expect(nB, 'B sau khi sửa phải được tạo').toBe(1);
  });

  test('[TC-QMV-033] DT tồn kho: (a) không theo dõi ⇒ SL disable; (b) theo dõi + SL 5 (đủ ĐVT, giá nhập) ⇒ tồn đầu 5; (c) theo dõi + SL trống (đủ ĐVT, giá nhập) ⇒ tồn đầu 0', async ({ page, api }) => {
    await moPopupQuet(page);
    const bc = [maVachMoi(), maVachMoi(), maVachMoi()];
    for (let i = 0; i < 3; i++) { await quet(page, bc[i]); await doiSoDong(page, i + 1); await sanDongHopLe(page, i, ma('033-' + 'abc'[i]), '20000'); }
    await expect(oQuet(page, 0, cot.slTon).locator('input'), '(a) chưa theo dõi: SL tồn disable').toBeDisabled();
    for (const i of [1, 2]) { await batTheoDoiTon(page, i); await chonDVT(page, i); await oQuet(page, i, cot.giaNhap).locator('input').fill('10000'); }
    await expect(oQuet(page, 1, cot.slTon).locator('input'), '(b) đã theo dõi: SL tồn enable').toBeEnabled();
    await oQuet(page, 1, cot.slTon).locator('input').fill('5');
    await page.screenshot({ path: test.info().outputPath('QMV-033-truoc.png'), fullPage: true });
    await nutXacNhan(page).click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: test.info().outputPath('QMV-033-sau.png'), fullPage: true });
    const tao = await Promise.all(bc.map(async m => (await timTheoMaVach(api, m)).length));
    ghiChu('KẾT QUẢ QUAN SÁT', `Số SP tạo (a,b,c)=${JSON.stringify(tao)}; toast=${JSON.stringify(await textToast(page))}. Mã vạch tra CSDL (inventory_tracking, on_hand): a=${bc[0]}, b=${bc[1]}, c=${bc[2]}`);
    expect(tao, 'cả 3 phải được tạo (tài liệu 4.2.1); tồn đầu đối chiếu CSDL ở Bước 5').toEqual([1, 1, 1]);
  });
});
