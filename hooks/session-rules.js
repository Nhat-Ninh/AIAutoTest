#!/usr/bin/env node
/* SessionStart (EasyPOS tester kit): nạp rules/RULES.md vào ngữ cảnh mỗi phiên + đặt biến EP_KIT cho các lệnh shell sau đó. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rootF = root.replace(/\\/g, '/');
let rules = '';
try { rules = fs.readFileSync(path.join(root, 'rules', 'RULES.md'), 'utf8'); }
catch (e) { rules = '(Không đọc được rules/RULES.md — vẫn áp: chỉ test trên TEST / UAT, CSDL chỉ SELECT qua dbq.js, không in mật khẩu.)'; }

// Biến EP_KIT cho mọi lệnh Bash trong phiên (Claude Code đọc tệp CLAUDE_ENV_FILE).
try {
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (envFile) fs.appendFileSync(envFile, 'export EP_KIT="' + rootF + '"\n');
} catch (e) { /* không đặt được thì ngữ cảnh vẫn ghi đường dẫn */ }

const ctx = rules
  + '\n\n## Đường dẫn bộ công cụ (máy này)\n'
  + '- EP_KIT = `' + rootF + '` (thư mục bộ kit EasyPOS tester).\n'
  + '- Bản đồ hệ thống EasyPOS (service, cổng, route gateway, màn hình, bảng CSDL, đăng nhập): `' + rootF + '/tai-lieu/EASYPOS-BAN-DO.md` — đọc trước khi phân tích chức năng.\n'
  + '- Môi trường: `config/moi-truong.json` (mỗi khoá = một project Playwright: `dev` = môi trường dev, mặc định; `uat` = https://uat.easypos.vn, TÙY CHỌN: sau khi kiểm thử xong trên dev phải HỎI tester có chạy lại trên UAT không — Bước 6b trong rules/RULES.md, không tự chạy). Tài khoản: `~/.easypos-tester/tai-khoan.json` — người dùng TỰ gõ, Claude KHÔNG đọc / ghi / hỏi mật khẩu trong chat.\n'
  + '- Kịch bản UI + API: Playwright `$EP_KIT/e2e` (`cd e2e && npx playwright test tests/<thư mục> --project=<môi trường>`; fixture `api`, `dangNhapUI`, `page`). Kiểm môi trường sẵn sàng: `tests/_kiem-moi-truong`.\n'
  + '- CSDL TEST / UAT (chỉ SELECT): `node "$EP_KIT/tools/tester/dbq.js" <môi trường> <tệp.sql>` — viết câu SQL vào tệp ở một lệnh, chạy ở lệnh sau; không dùng sqlcmd / driver tự viết.\n'
  + '- Jira (mã `EPB-…`): `node "$EP_KIT/tools/jira/jira.js" <MÃ>` (PAT riêng trong `~/.easypos-tester/jira.properties`). Tạo / sửa ticket: soạn nháp, người dùng duyệt.\n'
  + '- Đọc code mọi repo của project Bitbucket `EPOS` không tải về: `node "$EP_KIT/tools/tester/bb.js" jira <MÃ> · pr <repo> <số> · so-sanh <repo> <từ> <đến> · tep <repo> <đường-dẫn> <nhánh> · nhanh <repo>`.\n'
  + '- Mẫu báo cáo từng bước: `$EP_KIT/mau-bao-cao/00…06`; báo cáo ghi vào `$EP_KIT/bao-cao/<ngày>_<chức năng>/`.\n';

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }));
