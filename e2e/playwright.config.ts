/* Cấu hình Playwright cho bộ kit tester. Mỗi môi trường trong config/moi-truong.json = một project: --project=dev | uat.
 * CHỐT CHẶN: địa chỉ web / API prod ⇒ dừng ngay lúc nạp cấu hình (kiemUrl), trừ khi lệnh chạy đặt EP_CHO_PHEP_PROD=1.
 * Sửa tệp này phải được người phụ trách đồng ý. */
import { defineConfig } from '@playwright/test';
import { cauHinh, choPhepProd, dsMoiTruong, kiemUrl, laMoiTruongProd, rieng, Env } from './lib/moi-truong';

const trinhDuyet = rieng.trinhDuyet || cauHinh.trinhDuyet || 'chromium';   // 'msedge' khi máy không tải được chromium

function project(env: Env) {
  const m = cauHinh?.moiTruong?.[env] || {};
  const prod = laMoiTruongProd(env);
  if (m.apiUrl) kiemUrl(m.apiUrl, `moiTruong.${env}.apiUrl`, prod);
  return {
    name: env,
    metadata: { env, prod },
    use: {
      baseURL: m.webUrl ? kiemUrl(m.webUrl, `moiTruong.${env}.webUrl`, prod) : undefined,
      ...(trinhDuyet === 'msedge' ? { channel: 'msedge' } : {}),
    },
  };
}

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,          // lỗi chập chờn phải hiện ra trong báo cáo, không giấu bằng chạy lại
  workers: 1,          // môi trường TEST / UAT dùng chung — chạy tuần tự, tránh giẫm dữ liệu của nhau
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.EP_HTML || 'playwright-report', open: 'never' }],
    ['json', { outputFile: process.env.EP_JSON || 'test-results/ket-qua.json' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
  },
  // Môi trường prod chỉ có mặt khi lệnh chạy đặt EP_CHO_PHEP_PROD=1 (không thì --project=prod… báo "không có project").
  projects: dsMoiTruong().filter(e => choPhepProd() || !laMoiTruongProd(e)).map(project),
});
