#!/usr/bin/env node
/* kiem-trinh-duyet.js — bộ cài gọi: mở thử trình duyệt Playwright (chromium tải về, không được thì Edge có sẵn trên Windows),
 * ghi lựa chọn vào ~/.easypos-tester/tester.json. Thoát mã 1 nếu không mở được trình duyệt nào. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const KIT = path.resolve(__dirname, '..', '..');

(async () => {
  let pw;
  try { pw = require(path.join(KIT, 'e2e', 'node_modules', '@playwright', 'test')); }
  catch (e) { console.error('Chua cai @playwright/test (npm install trong e2e loi).'); process.exit(1); }
  const thu = [['chromium', {}], ['msedge', { channel: 'msedge' }], ['chrome', { channel: 'chrome' }]];
  for (const [ten, o] of thu) {
    try {
      const b = await pw.chromium.launch(Object.assign({ headless: true }, o));
      const p = await b.newPage();
      await p.setContent('<title>ok</title>');
      await b.close();
      const f = path.join(os.homedir(), '.easypos-tester', 'tester.json');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      let cur = {}; try { cur = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* chưa có */ }
      cur.trinhDuyet = ten;
      fs.writeFileSync(f, JSON.stringify(cur, null, 2) + '\n');
      console.log('OK trinh duyet: ' + ten);
      process.exit(0);
    } catch (e) { console.log('  thu ' + ten + ': khong mo duoc (' + String(e.message).split('\n')[0].slice(0, 120) + ')'); }
  }
  process.exit(1);
})();
