/* Fixture dùng chung cho mọi kịch bản:
 *   env         — khoá môi trường (theo --project: dev, uat…)
 *   api         — gọi backend đã đăng nhập sẵn. Đường dẫn TƯƠNG ĐỐI với apiUrl, không có "/" đầu: api.get('client/common/introspect')
 *   dangNhapUI  — đăng nhập trên giao diện (bộ chọn trong config dangNhap.ui)
 *   page        — như Playwright, nhưng CHẶN mọi request tới địa chỉ prod (prodChan)
 * Kịch bản viết:  import { test, expect } from '../../lib/fixtures';
 * Tên test bắt đầu bằng MÃ TESTCASE để báo cáo đối chiếu được:  test('[TC-API-001] Tạo hoá đơn hợp lệ', …) */
import { test as base, expect, APIRequestContext } from '@playwright/test';
import { choGhiProd, choPhepProd, dangNhap, Env, kiemUrl, laMoiTruongProd, laProd, moiTruong, taiKhoan, thieuTaiKhoan } from './moi-truong';

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

type Fx = { env: Env; api: APIRequestContext; dangNhapUI: () => Promise<void> };

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
    let res = await tam.post(buoc1, { data: than });
    expect(res.ok(), `Đăng nhập API ${env} (${new URL(buoc1, goc)}) lỗi HTTP ${res.status()}`).toBeTruthy();
    let body = await res.json();
    body = body?.data ?? body;   // EasyPOS bọc kết quả trong "data" (data.id_token, data.companies)
    if (!body[dn.truongToken] && dn.truongDsCongTy && body[dn.truongDsCongTy]) {
      const org = chonOrg(body[dn.truongDsCongTy], dn.congTy);
      expect(org, `Đăng nhập API ${env}: tài khoản không có công ty${dn.congTy ? ' khớp "' + dn.congTy + '"' : ''}`).toBeTruthy();
      res = await tam.post(duongDan, { data: { ...than, [dn.truongOrg || 'org']: org } });
      expect(res.ok(), `Đăng nhập API ${env} bước chọn công ty lỗi HTTP ${res.status()}`).toBeTruthy();
      body = await res.json();
      body = body?.data ?? body;
    }
    const token = body[dn.truongToken];
    await tam.dispose();
    expect(token, `Đăng nhập API ${env}: không thấy trường ${dn.truongToken} trong phản hồi`).toBeTruthy();
    const ctx = await playwright.request.newContext({
      baseURL: goc, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { Authorization: 'Bearer ' + token, ...(m.headerThem || {}) },
    });
    await use(prod && !choGhiProd() ? chiDoc(ctx, env) : ctx);
    await ctx.dispose();
  },

  dangNhapUI: async ({ page, env }, use) => {
    await use(async () => {
      const tk = taiKhoan(env, 'web');
      if (!tk) throw new Error(thieuTaiKhoan(env));
      const ui = dangNhap(env).ui;
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
          await page.locator(ui.nutDangNhap).first().click();
          break;
        }
      }
      if (ui.sauDangNhap) await page.waitForURL(new RegExp(ui.sauDangNhap));
      else await page.waitForURL(u => !/login/i.test(u.toString()), { timeout: 30_000 });
      await page.waitForLoadState('networkidle').catch(() => { /* trang có kết nối giữ lâu (websocket) */ });
    });
  },
});

export { expect };
