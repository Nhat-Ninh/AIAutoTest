#!/usr/bin/env node
/* SessionStart (EasyPOS tester kit): nạp rules/RULES.md vào ngữ cảnh mỗi phiên + đặt biến EP_KIT cho các lệnh shell sau đó.
 * Giữ NGẮN (mỗi phiên đều nạp): luật chi tiết từng bước ở rules/QUY-TRINH.md (Claude đọc một lần khi bắt đầu một chức năng);
 * kho bài học KHÔNG nạp vào đây, chỉ báo số bài — tra bằng tools/tester/bai-hoc.js tim. */
'use strict';
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
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

// Đồng bộ kit với nhánh main khi mở phiên (có hạn chờ; mất mạng thì dùng bản hiện có). Chỉ ghi vào ngữ cảnh khi có điều đáng nói.
let dongBo = '';
try {
  const tool = path.join(root, 'tools', 'tester', 'dong-bo.js');
  if (fs.existsSync(tool) && !process.env.EP_SESSION_KHONG_DONG_BO) {
    const r = spawnSync(process.execPath, [tool, 'kiem', '--nhanh', '--yen-lang'], { encoding: 'utf8', timeout: 40000, windowsHide: true });
    const nd = (String(r.stdout || '') + '\n' + String(r.stderr || '')).trim().split('\n').filter(Boolean).slice(-8).join(' / ');
    if (r.error) dongBo = '⚠ Đồng bộ kit quá lâu / lỗi (' + r.error.message + ') — dùng bản hiện có; lệnh chạy test sẽ tự kiểm lại.';
    else if (r.status !== 0) dongBo = '⚠ ĐỒNG BỘ KIT (mã ' + r.status + '): ' + nd + ' — lệnh chạy test sẽ bị chặn cho tới khi xử lý.';
    else if (nd) dongBo = nd;
  }
} catch (e) { /* đồng bộ chỉ là thêm; lỗi thì bỏ qua, cổng ở lệnh chạy test vẫn kiểm */ }

// Cổng đọc mã Code-Insight (mặc định TẮT — config/code-insight.json bat=false thì không làm gì): khớp .mcp.json / chứng chỉ với cấu hình, bật thì nhắc dùng tool MCP thay bb.js.
let codeInsight = '';
try {
  const ci = require('../tools/tester/code-insight-cai');
  const bat = ci.cauHinh().bat; const viec = ci.apDung({});
  if (bat) codeInsight = 'Đọc mã nguồn: dùng tool MCP `code-insight` (phan_tich_jira · giai_thich_luong · suy_ra_nghiep_vu · liet_ke_api · bang_db_lien_quan; KHÔNG có tài liệu nghiệp vụ thì dùng suy_ra_nghiep_vu để suy quy tắc từ code) — trả BẢN TÓM TẮT, không có mã nguyên văn; KHÔNG dùng bb.js / git với Bitbucket. Ghi "bản mã" (repo@commit) trong kết quả vào báo cáo.' + (viec.length ? ' (Vừa cập nhật cấu hình MCP: nếu tool chưa hiện, mở phiên Claude MỚI.)' : '');
  else if (viec.some(x => /^gỡ/.test(x))) codeInsight = 'Cổng đọc mã Code-Insight đã TẮT: kit vừa gỡ cấu hình MCP; đọc mã bằng bb.js như trước.';
} catch (e) { /* cổng chỉ là thêm; lỗi thì bỏ qua */ }

// Bài học đã duyệt đang chờ gửi lên kho chung (hộp thư ngoài thư mục kit).
let choGui = 0;
try { choGui = fs.readdirSync(path.join(process.env.EP_STATE_DIR || path.join(os.homedir(), '.easypos-tester'), 'bai-hoc-cho-gui')).filter(f => f.endsWith('.md')).length; } catch (e) { /* chưa có hộp thư */ }

// Bài đã duyệt mà lần trước chưa gửi được (mất mạng…): TỰ GỬI lại ở nền, không làm chậm việc mở phiên. Bài trong hộp thư chỉ có sau khi tester đã duyệt (bai-hoc.js them --ghi).
let tuGui = false;
if (choGui && !process.env.EP_SESSION_KHONG_DONG_BO && !process.env.EP_KHONG_TU_GUI) {
  try {
    require('child_process').spawn(process.execPath, [path.join(root, 'tools', 'tester', 'dong-bo.js'), 'gui', '--yen-lang'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    tuGui = true;
  } catch (e) { /* không chạy được thì bài vẫn nằm trong hộp thư */ }
}

// Số bài trong kho bài học chung (chỉ đếm dòng mục lục).
let soBai = 0;
try { soBai = require('../tools/lib/bai-hoc-lib').docKho(path.join(root, 'kien-thuc')).length; } catch (e) { /* chưa có kho */ }

const dong = [
  '',
  '## Đường dẫn và công cụ (máy này)',
  '- EP_KIT = `' + rootF + '` (thư mục bộ kit). Chạy công cụ không đối số để xem cách dùng.',
  '- Bản đồ hệ thống (service, route, màn hình, bảng CSDL, đăng nhập): `' + rootF + '/tai-lieu/EASYPOS-BAN-DO.md` — đọc khi cần, MỘT lần.',
  '- Môi trường: `config/moi-truong.json` (`dev` mặc định; `dev_bia` = nhánh dev-bia trên máy Windows .78:8888; `uat` / `uat_bia` tuỳ chọn — HỎI tester ở Bước 6b, không tự chạy; dev ↔ dev_bia dùng chung CSDL: không chạy cùng lúc).',
  '- Kịch bản: `$EP_KIT/e2e` — `cd e2e && npx playwright test tests/<thư mục> --project=dev [--grep @smoke|@api|@ui|@regression]`. Thư viện dùng chung `e2e/lib/` (fixtures, api, ui, du-lieu, san-pham): DÙNG LẠI, đừng chép hàm vào kịch bản.',
  '- CSDL (chỉ SELECT): `node "$EP_KIT/tools/tester/dbq.js" <môi trường> <tệp.sql>` (viết SQL vào tệp ở một lệnh, chạy ở lệnh sau).',
  '- Jira `tools/jira/jira.js <MÃ>` (đọc), `jira-tao.js <nháp>` (xem trước; `--tao` sau khi tester duyệt) · Confluence `tools/confluence/confluence.js` · Bitbucket `tools/tester/bb.js` (DEV = nhánh `dev`) · Kho bài học `tools/tester/bai-hoc.js`.',
  '- Kho bài học chung: ' + soBai + ' bài (bẫy kỹ thuật, sự thật môi trường, lỗi đã biết, nghiệp vụ). TRA bằng `bai-hoc.js tim <từ khoá>`, đừng đọc cả `kien-thuc/`.',
  '- Báo cáo: `$EP_KIT/bao-cao/<ngày>_<chức năng>/` theo mẫu `mau-bao-cao/`.',
  '- Kit TỰ ĐỒNG BỘ với nhánh main (tester không dùng git): mọi lệnh chạy test đều qua cổng "kit phải mới"; bài học đã duyệt TỰ lên kho chung (không cần chạy lệnh). Đừng chạy git commit / push / pull.',
  codeInsight ? '- ' + codeInsight : '',
  dongBo ? '- Đồng bộ kit lúc mở phiên: ' + dongBo : '',
  choGui ? '- Có ' + choGui + ' bài học đã duyệt chưa lên kho chung: kit ' + (tuGui ? 'đang TỰ GỬI ở nền (không cần hỏi, không cần chạy lệnh)' : 'sẽ tự gửi lần sau') + '. Không chạy `dong-bo.js gui` bằng tay.' : '',
  '',
];
const ctx = rules + '\n' + dong.join('\n');

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }));
