/* Fixture dùng chung cho mọi kịch bản:
 *   env         — khoá môi trường (theo --project: dev, uat…)
 *   api         — gọi backend đã đăng nhập sẵn. Đường dẫn TƯƠNG ĐỐI với apiUrl, không có "/" đầu: api.get('client/common/introspect')
 *   dangNhapUI  — đăng nhập trên giao diện (bộ chọn trong config dangNhap.ui)
 *   page        — như Playwright, nhưng CHẶN mọi request tới địa chỉ prod (prodChan)
 * Kịch bản viết:  import { test, expect } from '../../lib/fixtures';
 * Tên test bắt đầu bằng MÃ TESTCASE để báo cáo đối chiếu được:  test('[TC-API-001] Tạo hoá đơn hợp lệ', …) */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test as base, expect, APIRequestContext } from '@playwright/test';
import { choGhiProd, choPhepProd, dangNhap, Env, kiemUrl, laMoiTruongProd, laProd, moiTruong, rieng, taiKhoan, thieuTaiKhoan } from './moi-truong';

/* Trên prod (khi chưa bật EP_PROD_CHO_GHI=1): mọi lời gọi ghi qua fixture `api` bị từ chối trước khi gửi. */
function chiDoc(ctx: APIRequestContext, env: Env): APIRequestContext {
  const tuChoi = (cach: string) => { throw new Error(`TỪ CHỐI: ${cach} trên PROD (${env}) — prod mặc định chỉ đọc. Ghi dữ liệu thật: thêm EP_PROD_CHO_GHI=1 vào lệnh chạy (tester xác nhận).`); };
  return new Proxy(ctx, {
    get(t, k, r) {
      if (k === 'post' || k === 'put' || k === 'patch' || k === 'delete') return () => tuChoi(String(k).toUpperCase());
      if (k === 'fetch') return (url: any, o: any = {}) => {
        const m = String(o?.method || (typeof url === 'object' && url?.method?.()) || 'GET').toUpperCase();
        return m === 'GET' || m === 'HEAD' ? t.fetch(url, o) : tuChoi(m);
      };
      const v = Reflect.get(t, k, r);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

/* Thông tin KHÔNG nhạy cảm của phiên đăng nhập API vừa tạo (không chứa token / mật khẩu): công ty đang vào, người dùng, quyền quản lý ca. */
export type Phien = { comId: number | null; userId: number | null; shiftManagement: boolean | null; tenCongTy: string | null };
let phienHienTai: Phien = { comId: null, userId: null, shiftManagement: null, tenCongTy: null };

/* Phiên đăng nhập API dùng lại trong một tiến trình test. Hết hạn sau 8 phút để token (có hạn) không chết giữa chừng; đặt EP_PHIEN_MOI=1 để mỗi test đăng nhập lại như cũ. */
const HAN_PHIEN_MS = process.env.EP_PHIEN_MOI === '1' ? 0 : 8 * 60_000;
let phienDem: { khoa: string; token: string; phien: Phien; luc: number } | null = null;

/* Môi trường nào đã bị phát hiện "đăng nhập giao diện hỏng do API lỗi" trong lần chạy này. Playwright khởi động lại tiến trình test sau mỗi test trượt
 * nên không thể giữ trong bộ nhớ: ghi tệp tạm theo tiến trình chạy (cha của worker), chỉ chứa thông báo lỗi — KHÔNG chứa token / mật khẩu. */
const tepHong = (env: string) => path.join(os.tmpdir(), `ep-ui-hong-${process.ppid}-${env}.txt`);
const uiHong = {
  // Chỉ tin tệp còn "tươi" (≤ 30 phút): Windows tái sử dụng số tiến trình, tệp của lần chạy cũ không được làm test lần này thất bại oan.
  get(env: string): string | undefined {
    try { const f = tepHong(env); if (Date.now() - fs.statSync(f).mtimeMs > 30 * 60_000) return undefined; return fs.readFileSync(f, 'utf8') || undefined; } catch { return undefined; }
  },
  set(env: string, msg: string) { try { fs.writeFileSync(tepHong(env), msg); } catch { /* không ghi được thì chỉ mất phần tăng tốc */ } },
};

/* Đếm số lần đăng nhập API trong tiến trình test (in khi đặt EP_THONG_KE=1) — để đo việc dùng lại phiên có hiệu quả không. */
let demDangNhap = 0;
if (process.env.EP_THONG_KE === '1') process.on('exit', () => console.error(`[thong-ke] dang nhap API: ${demDangNhap} lan`));

type Fx = { env: Env; api: APIRequestContext; phien: Phien; dangNhapUI: () => Promise<void> };

/* Gốc backend luôn kết thúc bằng "/" để đường dẫn tương đối nối đúng (…/api/ + client/common/introspect). */
const goiCuoi = (u: string) => (u.endsWith('/') ? u : u + '/');

/* EasyPOS: authenticate (user + mật khẩu) ⇒ data.companies = [{ id, name, taxCode… }]; gửi lại kèm companyId ⇒ data.id_token. */
function chonOrg(ds: any[], congTy: string): string | null {
  const phang: any[] = [];
  for (const n of ds || []) { if (n?.id !== undefined) phang.push(n); }   // EasyPOS: { id, name, address, taxCode }
  const ma = String(congTy || '').trim().toLowerCase();
  const hit = ma ? phang.find(x => [x?.id, x?.taxCode, x?.name].some(v => String(v || '').toLowerCase() === ma)) : phang[0];
  return hit ? (hit.id ?? null) : null;
}

export const test = base.extend<Fx>({
  env: async ({}, use, testInfo) => { await use((testInfo.project.metadata as any).env as Env); },

  page: async ({ page }, use, testInfo) => {
    await page.route('**/*', route => {
      const u = route.request().url();
      if (/^https?:/i.test(u) && laProd(u) && !choPhepProd()) {
        testInfo.annotations.push({ type: 'CHẶN PROD', description: u });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    await use(page);
  },

  api: async ({ playwright, env }, use) => {
    const m = moiTruong(env);
    const prod = laMoiTruongProd(env);
    const goc = goiCuoi(kiemUrl(m.apiUrl || m.webUrl, `moiTruong.${env}.apiUrl / webUrl`, prod));
    // Dùng lại phiên đăng nhập trong cùng tiến trình test: đăng nhập MỘT lần rồi chia cho mọi test (trước đây mỗi test đăng nhập lại 1–2 lần ⇒ chậm, và nhiều lần sai/lặp dễ khoá tài khoản).
    const khoa = `${env}|${process.env['EP_CONGTY_' + String(env).toUpperCase()] || ''}`;
    let token = '';
    if (phienDem && phienDem.khoa === khoa && Date.now() - phienDem.luc < HAN_PHIEN_MS) {
      token = phienDem.token; phienHienTai = phienDem.phien;
    } else {
    const tk = taiKhoan(env, 'web');
    if (!tk) throw new Error(thieuTaiKhoan(env));
    const dn = dangNhap(env).api;
    // "client/common/authenticate" = tính từ gốc API (apiUrl); "/api/…" (hoặc https://…) = tính từ gốc MÁY CHỦ web.
    // Địa chỉ đầy đủ cũng qua chốt chặn prod như mọi địa chỉ khác.
    const diaChi = (dd: string, ten: string) => /^https?:\/\//i.test(dd) || dd.startsWith('/')
      ? kiemUrl(new URL(dd, goc).toString(), `moiTruong.${env}.dangNhap.api.${ten}`, prod) : dd;
    const duongDan = diaChi(String(dn.duongDan || 'client/common/authenticate'), 'duongDan');
    // Bước 1 (lấy danh sách công ty) có thể là API KHÁC bước 2 (khai duongDanBuoc1). EasyPOS: cùng một API ⇒ không khai.
    const buoc1 = dn.duongDanBuoc1 ? diaChi(String(dn.duongDanBuoc1), 'duongDanBuoc1') : duongDan;
    // Header thêm của môi trường (headerThem) gửi cả ở bước đăng nhập.
    const tam = await playwright.request.newContext({ baseURL: goc, ignoreHTTPSErrors: true, extraHTTPHeaders: { ...(m.headerThem || {}) } });
    const than = { ...(dn.themVaoThan || {}), [dn.truongTen]: tk.user, [dn.truongMatKhau]: tk.password };
    demDangNhap++;
    let res = await tam.post(buoc1, { data: than });
    expect(res.ok(), `Đăng nhập API ${env} (${new URL(buoc1, goc)}) lỗi HTTP ${res.status()}`).toBeTruthy();
    let body = await res.json();
    body = body?.data ?? body;   // EasyPOS bọc kết quả trong "data" (data.id_token, data.companies)
    if (!body[dn.truongToken] && dn.truongDsCongTy && body[dn.truongDsCongTy]) {
      // Công ty muốn vào: biến môi trường EP_CONGTY_<ENV> (vd EP_CONGTY_DEV) > ~/.easypos-tester/tester.json → "congTy": { "dev": "…" } > config/moi-truong.json.
      const congTy = process.env['EP_CONGTY_' + String(env).toUpperCase()] || (rieng as any)?.congTy?.[env] || dn.congTy;
      const dsCty: any[] = body[dn.truongDsCongTy] || [];
      const org = chonOrg(dsCty, congTy);
      const coSan = dsCty.map(c => `${c?.id} = ${c?.name}`).slice(0, 15).join(' | ') + (dsCty.length > 15 ? ` … (+${dsCty.length - 15} công ty nữa)` : '');
      expect(org, `Đăng nhập API ${env}: tài khoản này KHÔNG thuộc công ty "${congTy}" (cấu hình trong config/moi-truong.json). ` +
        `Công ty tài khoản có: ${coSan || '(không có)'}. Cách xử lý: đặt công ty của bạn trong ~/.easypos-tester/tester.json → "congTy": { "${env}": "<id>" } ` +
        `hoặc chạy với biến EP_CONGTY_${String(env).toUpperCase()}=<id>.`).toBeTruthy();
      res = await tam.post(duongDan, { data: { ...than, [dn.truongOrg || 'org']: org } });
      expect(res.ok(), `Đăng nhập API ${env} bước chọn công ty lỗi HTTP ${res.status()}`).toBeTruthy();
      body = await res.json();
      body = body?.data ?? body;
    }
    token = body[dn.truongToken];
    phienHienTai = { comId: body.companyId ?? null, userId: body.id ?? null, shiftManagement: body.shiftManagement ?? null, tenCongTy: body.companyName ?? null };
    await tam.dispose();
    expect(token, `Đăng nhập API ${env}: không thấy trường ${dn.truongToken} trong phản hồi`).toBeTruthy();
      phienDem = { khoa, token, phien: phienHienTai, luc: Date.now() };
    }
    const ctx = await playwright.request.newContext({
      baseURL: goc, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { Authorization: 'Bearer ' + token, ...(m.headerThem || {}) },
    });
    await use(prod && !choGhiProd() ? chiDoc(ctx, env) : ctx);
    await ctx.dispose();
  },

  /* Dùng trong kịch bản: test('…', async ({ api, phien }) => … phien.comId …). Phụ thuộc `api` để đăng nhập xong trước. */
  phien: async ({ api }, use) => { void api; await use(phienHienTai); },

  /* Phụ thuộc `phien` (⇒ đã đăng nhập API) để biết TÊN công ty cần vào (theo dangNhap.api.congTy) và chọn đúng công ty đó trên màn hình đăng nhập,
   * thay vì để mặc định công ty đầu tiên — nhờ vậy kịch bản UI và API làm việc trên CÙNG một công ty. */
  dangNhapUI: async ({ page, env, phien }, use) => {
    await use(async () => {
      const daHong = uiHong.get(env);
      if (daHong) throw new Error(`${daHong} [Đã gặp ở test giao diện trước trong cùng lần chạy nên không thử lại, khỏi chờ ~15–35 giây mỗi test.]`);
      const tk = taiKhoan(env, 'web');
      if (!tk) throw new Error(thieuTaiKhoan(env));
      const ui = dangNhap(env).ui;
      // Ghi lại các lời gọi API lỗi trong lúc đăng nhập: nếu giao diện kẹt ở trang đăng nhập thì nói ĐÚNG API nào lỗi (đỡ đoán mò).
      const apiLoi: string[] = [];
      page.on('response', r => {
        if (r.status() >= 400 && /\/api\//.test(r.url())) apiLoi.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      });
      await page.goto(ui.duongDan);
      await page.locator(ui.oTen).first().fill(tk.user);
      await page.locator(ui.oMatKhau).first().fill(tk.password);
      await page.locator(ui.nutDangNhap).first().click();
      // EasyPOS: tài khoản thuộc nhiều công ty ⇒ ô tên / mật khẩu biến mất, hiện ô chọn công ty (mặc định công ty đầu) rồi bấm Đăng nhập lần nữa.
      const conOMatKhau = () => page.locator(ui.oMatKhau).first().isVisible().catch(() => false);
      const dangOTrangDangNhap = () => /login/i.test(page.url());
      for (let i = 0; i < 20 && dangOTrangDangNhap(); i++) {
        await page.waitForTimeout(500);
        if (!(await conOMatKhau()) && await page.locator(ui.nutDangNhap).first().isVisible().catch(() => false)) {
          const ten = phien.tenCongTy;
          const oCty = page.locator('#companyId').first();
          if (ten && await oCty.isVisible().catch(() => false)) {   // ng-select "Chọn công ty": tìm theo tên rồi chọn đúng dòng
            await oCty.click();
            await page.locator('#companyId input[type="text"]').first().fill(ten).catch(() => undefined);
            await page.locator('.ng-dropdown-panel .ng-option', { hasText: ten }).first().click().catch(() => undefined);
            // Đợi danh sách đóng hẳn: nếu bấm "Đăng nhập" khi danh sách còn mở thì cú bấm chỉ để đóng danh sách (dev 23/10/2026: kẹt ở màn chọn công ty).
            await page.locator('.ng-dropdown-panel').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined);
          }
          await page.locator(ui.nutDangNhap).first().click();
          // Bấm lần nữa một lần nếu sau 4 giây vẫn ở trang đăng nhập (cú bấm đầu bị nuốt do giao diện chưa kịp nhận công ty).
          await page.waitForURL(u => !/login/i.test(u.toString()), { timeout: 4000 }).catch(async () => {
            if (/login/i.test(page.url()) && await page.locator(ui.nutDangNhap).first().isVisible().catch(() => false)) await page.locator(ui.nutDangNhap).first().click().catch(() => undefined);
          });
          break;
        }
      }
      // Chờ vào được hệ thống tối đa 30 giây; NHƯNG nếu đã có API lỗi và 8 giây vẫn ở trang đăng nhập thì dừng sớm (đợi tiếp cũng vô ích).
      const dauCho = Date.now();
      const daVao = () => ui.sauDangNhap ? new RegExp(ui.sauDangNhap).test(page.url()) : !/login/i.test(page.url());
      while (!daVao() && Date.now() - dauCho < 30_000 && !(apiLoi.length && Date.now() - dauCho > 8000)) await page.waitForTimeout(400);
      if (!daVao()) {
        const dsLoi = [...new Set(apiLoi)].slice(0, 5).join(' ; ');
        if (!dsLoi) throw new Error(`Đăng nhập giao diện ${env}: sau 30 giây vẫn ở ${page.url()} (không có API nào trả lỗi) — kiểm tài khoản / công ty / có hộp thoại chặn không (xem ảnh chụp, trace).`);
        const thongBaoLoi = `Đăng nhập giao diện ${env} kẹt ở trang đăng nhập, trong lúc đó các API sau trả lỗi: ${dsLoi}. ` +
          'Đây thường là LỖI MÔI TRƯỜNG / PHẦN MỀM (API sau đăng nhập hỏng), không phải lỗi kịch bản — gọi thử API đó bằng fixture `api` để xem nội dung lỗi, rồi báo người phụ trách / Jira.';
        uiHong.set(env, thongBaoLoi);   // các test giao diện sau trong CÙNG lần chạy không chờ lại
        throw new Error(thongBaoLoi);
      }
      await page.waitForLoadState('networkidle').catch(() => { /* trang có kết nối giữ lâu (websocket) */ });
    });
  },
});

export { expect };
