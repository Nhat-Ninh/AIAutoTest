/* Kiểm thử Mở / đóng ca làm việc (session) — EasyPOS. Báo cáo: bao-cao/2026-10-22_mo-dong-ca/ (testcase: 02-testcase.md).
 * Chạy:  cd e2e && npx playwright test tests/mo-dong-ca --project=dev [--headed]
 * Hai nhóm chạy TUẦN TỰ (mỗi người dùng chỉ có một ca mở): nhóm BE (API) rồi nhóm FE (giao diện).
 * An toàn: nếu tài khoản test đang có sẵn ca mở, hoặc không có quyền quản lý ca ⇒ test bị BỎ QUA kèm lý do (không tự đóng ca có sẵn).
 * Ca do kịch bản tạo qua API có mô tả "AUTO_mo-dong-ca"; mỗi nhóm kết thúc bằng việc đóng ca đã mở. */
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../../lib/fixtures';
import { dsTuDuLieu, duLieu, json } from '../../lib/api';
import { dongHopThoai } from '../../lib/ui';

const MO_TA = 'AUTO_mo-dong-ca';
const TRANG_CA = process.env.EP_TRANG_CA || '/easy-pos/session';   // đường dẫn màn hình ca, tính từ webUrl (xác nhận khi chạy thật)

test.describe.configure({ mode: 'serial' });

/* ---------- tiện ích ---------- */

/** Lấy danh sách ca hôm nay của người dùng (API phân trang). Trả mảng, rỗng nếu không đọc được. */
async function dsCa(api: APIRequestContext): Promise<any[]> {
  const r = await api.get('client/page/shift/get-with-paging?page=0&size=50');
  return dsTuDuLieu(duLieu(await json(r)));
}
/** Ca đang mở (end_time rỗng) mới nhất. */
async function caDangMo(api: APIRequestContext) {
  return (await dsCa(api)).filter(c => !c.endTime).sort((a, b) => (b.id || 0) - (a.id || 0))[0] || null;
}
async function checkOpen(api: APIRequestContext) {
  return duLieu(await json(await api.get('client/page/shift/check-open')));
}
const moCa = (api: APIRequestContext, data: any) => api.post('client/page/shift/open', { data });
const dongCa = (api: APIRequestContext, data: any) => api.post('client/page/shift/close', { data });

/** Điều kiện môi trường: có quyền quản lý ca và không có ca mở sẵn. Không đạt ⇒ bỏ qua (lý do môi trường, KHÔNG phải lỗi phần mềm). */
async function dieuKien(api: APIRequestContext, phien: { shiftManagement: boolean | null }) {
  test.skip(phien.shiftManagement !== true, 'MÔI TRƯỜNG: tài khoản test chưa có quyền quản lý ca (company_user.shift_management) — cấp quyền ở màn hình "Quyền mở ca" rồi chạy lại');
  const co = await checkOpen(api);
  test.skip(co?.canOpenShift === false, 'MÔI TRƯỜNG: tài khoản đang có sẵn một ca mở (không phải của kịch bản) — đóng ca đó bằng tay rồi chạy lại');
}


/* ============================ NHÓM BE (API) ============================ */
test.describe('BE — API mở / đóng ca', { tag: ['@api', '@regression'] }, () => {
  let idCa: number | null = null;

  test('[TC-BE-001] check-open khi chưa có ca mở: canOpenShift = true', async ({ api, phien }) => {
    await dieuKien(api, phien);
    const co = await checkOpen(api);
    expect(co.canOpenShift, 'canOpenShift khi chưa có ca').toBe(true);
    expect(co.overtimeShiftId ?? null, 'không có ca quá 24h').toBeNull();
  });

  test('[TC-BE-002] Mở ca hợp lệ: 200, status true; check-open sau đó = false', { tag: '@smoke' }, async ({ api, phien }) => {
    await dieuKien(api, phien);
    const r = await moCa(api, { money: 100000, comId: phien.comId, description: MO_TA });
    const b = await json(r);
    expect(r.status(), 'HTTP mở ca').toBe(200);
    expect(b.status, `phản hồi: ${JSON.stringify(b).slice(0, 200)}`).toBe(true);
    const ca = await caDangMo(api);
    expect(ca, 'sau khi mở phải thấy ca đang mở trong danh sách').toBeTruthy();
    idCa = ca.id;
    expect(Number(ca.openingCash), 'tiền đầu ca').toBe(100000);
    expect((await checkOpen(api)).canOpenShift, 'check-open sau khi mở').toBe(false);
  });

  test('[TC-BE-003] Mở ca lần 2 khi đang có ca mở: bị từ chối, không thêm ca', async ({ api, phien }) => {
    test.skip(idCa === null, 'Phụ thuộc TC-BE-002 (chưa mở được ca)');
    const truoc = (await dsCa(api)).length;
    const r = await moCa(api, { money: 5000, comId: phien.comId, description: MO_TA });
    const b = await json(r);
    expect(`${r.status()} ${JSON.stringify(b)}`, 'phải báo lỗi không mở nhiều ca').toMatch(/SHIFT_DOING_IN_VALID|nhiều hơn 1 ca|more than one shift|400/i);
    expect(b.status === true, 'mở được lần 2 là SAI').toBe(false);
    expect((await dsCa(api)).length, 'số ca không đổi').toBe(truoc);
  });

  test('[TC-BE-004] Đóng ca hợp lệ: 200; ca có giờ kết và tiền kết ca', async ({ api, phien }) => {
    test.skip(idCa === null, 'Phụ thuộc TC-BE-002');
    const r = await dongCa(api, { id: idCa, money: 150000, comId: phien.comId });
    const b = await json(r);
    expect(r.status(), 'HTTP đóng ca').toBe(200);
    expect(b.status, `phản hồi: ${JSON.stringify(b).slice(0, 200)}`).toBe(true);
    const ca = (await dsCa(api)).find(c => c.id === idCa);
    expect(ca?.endTime, 'ca phải có giờ kết').toBeTruthy();
    expect(Number(ca?.closingCash), 'tiền kết ca').toBe(150000);
  });

  test('[TC-BE-005] Đóng lại ca đã đóng: bị từ chối, dữ liệu không đổi', async ({ api, phien }) => {
    test.skip(idCa === null, 'Phụ thuộc TC-BE-004');
    const r = await dongCa(api, { id: idCa, money: 999, comId: phien.comId });
    const b = await json(r);
    expect(b.status === true, `đóng lần 2 mà vẫn thành công là SAI (${r.status()})`).toBe(false);
    const ca = (await dsCa(api)).find(c => c.id === idCa);
    expect(Number(ca?.closingCash), 'tiền kết ca không bị ghi đè').toBe(150000);
  });

  test('[TC-BE-006] Mở ca sai dữ liệu: thiếu tiền, tiền âm đều bị từ chối', async ({ api, phien }) => {
    await dieuKien(api, phien);
    const truoc = (await dsCa(api)).length;
    for (const [ten, data] of [['thiếu money', { comId: phien.comId, description: MO_TA }], ['money = -1', { money: -1, comId: phien.comId, description: MO_TA }]] as const) {
      const r = await moCa(api, data);
      const b = await json(r);
      expect(b.status === true, `${ten}: mở được là SAI`).toBe(false);
    }
    expect((await dsCa(api)).length, 'không có ca mới').toBe(truoc);
  });

  test('[TC-BE-007] QUAN SÁT: mở ca với tiền = 0 (thông báo nói "lớn hơn 0", code cho ≥ 0)', async ({ api, phien }) => {
    await dieuKien(api, phien);
    const r = await moCa(api, { money: 0, comId: phien.comId, description: MO_TA });
    const b = await json(r);
    const duoc = b.status === true;
    test.info().annotations.push({ type: 'CẦN BA CHỐT', description: `money=0 ${duoc ? 'ĐƯỢC chấp nhận' : 'BỊ từ chối'} (${r.status()}); thông báo validate nói "phải lớn hơn 0"` });
    if (duoc) {   // dọn: đóng ngay ca vừa mở
      const ca = await caDangMo(api);
      if (ca) await dongCa(api, { id: ca.id, money: 0, comId: phien.comId });
    }
    expect((await checkOpen(api)).canOpenShift, 'sau dọn phải mở lại được').toBe(true);
  });

  test('[DỌN-BE] Không còn ca mở do kịch bản tạo', async ({ api, phien }) => {
    const ca = await caDangMo(api);
    if (ca && ca.description === MO_TA) await dongCa(api, { id: ca.id, money: 0, comId: phien.comId });
    const con = await caDangMo(api);
    expect(con && con.description === MO_TA, 'còn ca AUTO_ chưa đóng').toBeFalsy();
  });
});

/* ============================ NHÓM FE (giao diện) ============================ */
test.describe('FE — màn hình ca làm việc', { tag: ['@ui', '@regression'] }, () => {
  test.beforeEach(async ({ page, dangNhapUI, api, phien }) => {
    // Kiểm quyền bằng API TRƯỚC khi đăng nhập giao diện — thiếu quyền thì bỏ qua ngay (khỏi mất ~30 giây mỗi test).
    void api;
    test.skip(phien.shiftManagement !== true, 'MÔI TRƯỜNG: tài khoản test chưa có quyền quản lý ca (company_user.shift_management) — không có nút "Thêm mới ca"');
    await dangNhapUI();
    await dongHopThoai(page);
    await page.goto(TRANG_CA);
    await dongHopThoai(page);
  });

  test('[TC-FE-001] Màn hình ca có tiêu đề, nút "Thêm mới ca" và bảng', async ({ page, api }) => {
    await expect(page.getByText('Danh sách ca làm việc').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Thêm mới ca/ })).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('ca-man-hinh.png') });
    void api;
  });

  test('[TC-FE-002] Mở ca bằng giao diện: nhập tiền đầu ca 200000 → thông báo thành công', async ({ page, api, phien }) => {
    await dieuKien(api, phien);
    await page.getByRole('button', { name: /Thêm mới ca/ }).click();
    await expect(page.getByText('Thông tin vào ca')).toBeVisible();
    await page.locator('.modal-body input.input-value').fill('200000');
    await page.screenshot({ path: test.info().outputPath('1-hop-thoai-vao-ca.png') });
    await page.locator('.modal-footer .save-button-dialog').click();
    await expect(page.getByText('Tạo mới ca làm việc thành công!')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('2-sau-mo-ca.png') });
    const ca = await caDangMo(api);
    expect(ca, 'ca mới phải có trong danh sách').toBeTruthy();
    expect(Number(ca.openingCash), 'tiền đầu ca').toBe(200000);
  });

  test('[TC-FE-003] Mở ca lần 2 khi đang có ca: cảnh báo, không mở hộp thoại', async ({ page, api }) => {
    test.skip(!(await caDangMo(api)), 'Phụ thuộc TC-FE-002 (chưa có ca đang mở)');
    await page.getByRole('button', { name: /Thêm mới ca/ }).click();
    await expect(page.getByText('Không thể mở nhiều hơn 1 ca làm việc tại cùng thời điểm')).toBeVisible();
    await expect(page.getByText('Thông tin vào ca')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('canh-bao-2-ca.png') });
  });

  test('[TC-FE-004] Đóng ca bằng giao diện: nhập tiền kết ca 250000 → thông báo thành công', async ({ page, api }) => {
    const ca = await caDangMo(api);
    test.skip(!ca, 'Phụ thuộc TC-FE-002 (chưa có ca đang mở)');
    await page.locator('[data-action-key="stop"]').first().click();
    await expect(page.getByText('Thông tin kết ca')).toBeVisible();
    await page.locator('.modal-body input.input-value').fill('250000');
    await page.locator('.modal-footer .save-button-dialog').click();
    await expect(page.getByText('Kết thúc ca làm việc thành công!')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('sau-dong-ca.png') });
    const sau = (await dsCa(api)).find(c => c.id === ca.id);
    expect(sau?.endTime, 'ca phải có giờ kết').toBeTruthy();
    expect(Number(sau?.closingCash), 'tiền kết ca').toBe(250000);
  });
});
