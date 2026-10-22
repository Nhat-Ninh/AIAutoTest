/* Đọc cấu hình môi trường + tài khoản, và CHỐT CHẶN PROD dùng chung cho cấu hình Playwright, fixture, công cụ đọc CSDL.
 * Môi trường = mỗi khoá trong config/moi-truong.json → moiTruong (vd dev, uat).
 * Sửa tệp này phải được người phụ trách đồng ý (hook hỏi). */
import fs from 'fs';
import os from 'os';
import path from 'path';

export type Env = string;
export const KIT = path.resolve(__dirname, '..', '..');

function docJson(p: string): any {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export const cauHinh: any = docJson(path.join(KIT, 'config', 'moi-truong.json')) || {};
/* Tuỳ chọn riêng từng máy (bộ cài ghi: trình duyệt đang dùng được). */
export const rieng: any = docJson(path.join(os.homedir(), '.easypos-tester', 'tester.json')) || {};
const tkChung: any = docJson(path.join(KIT, 'config', 'tai-khoan.json')) || {};
const tkRieng: any = docJson(path.join(os.homedir(), '.easypos-tester', 'tai-khoan.json')) || {};

/** Danh sách môi trường đã khai. */
export function dsMoiTruong(): string[] {
  return Object.keys(cauHinh?.moiTruong || {});
}

/** Tài khoản web / db: tệp riêng của tester (~/.easypos-tester/tai-khoan.json) thắng, rồi tới config/tai-khoan.json (nếu ai đó tạo cục bộ;
 *  tệp này không lên git). Thiếu ⇒ null. Môi trường PROD: chỉ nhận từ tệp riêng — không bao giờ có tài khoản prod trong bộ kit. */
export function taiKhoan(env: Env, loai: 'web' | 'db'): { user: string; password: string } | null {
  const prod = laMoiTruongProd(env);
  for (const [src, laRieng] of [[tkRieng, true], [tkChung, false]] as const) {
    const t = src?.[env]?.[loai];
    if (!(t?.user && t?.password)) continue;
    if (prod && !laRieng) continue;
    return t;
  }
  return null;
}

export function moiTruong(env: Env): any {
  const m = cauHinh?.moiTruong?.[env];
  if (!m) throw new Error(`Không có môi trường "${env}" trong config/moi-truong.json (có: ${dsMoiTruong().join(', ')})`);
  return m;
}

/** Cách đăng nhập của một môi trường: phần chung + phần ghi đè riêng (moiTruong.<env>.dangNhap). */
export function dangNhap(env: Env): { api: any; ui: any } {
  const m = moiTruong(env);
  return {
    api: { ...(cauHinh?.dangNhap?.api || {}), ...(m.dangNhap?.api || {}) },
    ui: { ...(cauHinh?.dangNhap?.ui || {}), ...(m.dangNhap?.ui || {}) },
  };
}

/** Một mục chặn có khớp tên máy không: kết thúc "." = dải IP (so đầu chuỗi); có "*" = MẪU tên máy ("*" = chữ / số / gạch trong MỘT
 *  nhãn — vd app*.example.vn khớp app1.example.vn, x.app2.example.vn, không khớp test.example.vn); còn lại so trùng
 *  tên máy hoặc đuôi tên miền (easypos.vn khớp easypos.vn và app.easypos.vn). GIỮ ĐỒNG BỘ với hooks/prod-config.js. */
export function khopChan(host: string, muc: string): boolean {
  const x = String(muc || '').trim().toLowerCase();
  if (!x) return false;
  if (x.endsWith('.')) return host.startsWith(x);
  if (x.includes('*')) return new RegExp('^(?:[^.]+\\.)*' + x.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]*') + '$').test(host);
  return host === x || host.endsWith('.' + x);
}

/** Máy TEST / UAT nằm dưới tên miền prod (vd testtranshub.easypos.vn): khai ở `khongPhaiProd`, so TRÙNG nguyên tên máy.
 *  Không nhận IP; tên máy khai đích danh trong prodChan thì vẫn là prod. */
export function laMayThu(host: string): boolean {
  const h = String(host || '').trim().toLowerCase();
  if (!h || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  const chuan = (a: any): string[] => (Array.isArray(a) ? a : []).map((x: any) => String(x).trim().toLowerCase());
  return chuan(cauHinh?.khongPhaiProd).includes(h) && !chuan(cauHinh?.prodChan).includes(h);
}

/** Địa chỉ có thuộc PROD không: mục kết thúc bằng "." là dải IP (so đầu chuỗi); còn lại so trùng tên máy hoặc đuôi tên miền.
 *  Máy trong `khongPhaiProd` (TEST / UAT dưới tên miền prod) không phải prod. */
export function laProd(urlOrHost: string): boolean {
  let host = String(urlOrHost || '').trim().toLowerCase();
  try { if (/^[a-z]+:\/\//i.test(host)) host = new URL(host).hostname.toLowerCase(); } catch { /* giữ nguyên */ }
  host = host.replace(/:\d+$/, '');
  if (!host) return false;
  if (laMayThu(host)) return false;
  return (cauHinh?.prodChan || []).some((p: string) => khopChan(host, p));
}

/* CHẠY VÀO PROD (giao diện / API — KHÔNG phải CSDL): chỉ khi lệnh chạy đặt EP_CHO_PHEP_PROD=1 (hook hỏi tester xác nhận từng lần).
   Trên prod, fixture `api` mặc định CHỈ ĐỌC (GET + đăng nhập); muốn ghi dữ liệu thật thêm EP_PROD_CHO_GHI=1 (hook cũng hỏi). */
export const choPhepProd = (): boolean => process.env.EP_CHO_PHEP_PROD === '1';
export const choGhiProd = (): boolean => choPhepProd() && process.env.EP_PROD_CHO_GHI === '1';

/** Câu báo thiếu tài khoản. */
export function thieuTaiKhoan(env: Env): string {
  return laMoiTruongProd(env)
    ? `Chưa có tài khoản cho PROD ${env}. Bộ kit không mang tài khoản prod: người phụ trách cấp riêng, rồi ghi vào ~/.easypos-tester/tai-khoan.json → "${env}": { "web": { "user": "…", "password": "…" } }.`
    : `Chưa có tài khoản web môi trường ${env}: mở ~/.easypos-tester/tai-khoan.json (mẫu: config/tai-khoan.example.json), điền "${env}" → "web" → user / password. KHÔNG dán mật khẩu vào chat.`;
}

/** Môi trường là prod: khai "prod": true, hoặc địa chỉ web / API khớp prodChan. */
export function laMoiTruongProd(env: Env): boolean {
  const m = cauHinh?.moiTruong?.[env] || {};
  return m.prod === true || laProd(m.webUrl) || laProd(m.apiUrl);
}

/** Bắt buộc có địa chỉ; địa chỉ prod chỉ qua khi đã bật EP_CHO_PHEP_PROD=1 — sai thì dừng cả lượt test. */
export function kiemUrl(url: string, ten: string, envProd = false): string {
  if (!url) throw new Error(`Chưa điền ${ten} trong config/moi-truong.json — báo người phụ trách.`);
  if ((envProd || laProd(url)) && !choPhepProd()) {
    throw new Error(`TỪ CHỐI: ${ten} = ${url} là địa chỉ PROD. Muốn chạy vào prod: đặt EP_CHO_PHEP_PROD=1 ngay trong lệnh chạy (tester xác nhận). CSDL prod vẫn không được chạm.`);
  }
  return url;
}

/** Máy đã tải ffmpeg của Playwright chưa? (cần để QUAY VIDEO khi test trượt). Máy chỉ dùng Edge / Chrome có sẵn (không tải được trình duyệt
 *  của Playwright) thường KHÔNG có ffmpeg ⇒ bật video sẽ làm MỌI test mở trình duyệt báo "Executable doesn't exist … ffmpeg". */
export function coFfmpeg(): boolean {
  const goc = process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0'
    ? process.env.PLAYWRIGHT_BROWSERS_PATH
    : process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright')
      : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright') : path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    return fs.readdirSync(goc).some(d => /^ffmpeg-\d+$/.test(d) && fs.readdirSync(path.join(goc, d)).some(f => /^ffmpeg/i.test(f)));
  } catch { return false; }
}
