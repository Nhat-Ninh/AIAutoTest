#!/usr/bin/env node
/* guard-easypos.js (EasyPOS tester kit) — chốt chặn PreToolUse cho Claude trên máy tester.
 *
 * Triết lý: tester KHÔNG tự nối CSDL / hàng đợi bằng lệnh của Claude. Mọi truy vấn CSDL đi qua tools/tester/dbq.js (chỉ SELECT,
 * từ chối máy PROD) — nhờ vậy hook không cần biết hết máy CSDL prod mới an toàn.
 *
 * CHẶN (deny):
 *   - đọc / in / chép / ghi tệp mật khẩu: tai-khoan*.json (trừ .example), jira.properties, git.properties, password.json, .env,
 *     application-prod*.yml, bootstrap-prod.yml; biến mật khẩu / token (EP_*PASSWORD, EP_*TOKEN, SQLCMDPASSWORD…); đổ toàn bộ biến môi trường.
 *   - client CSDL / hàng đợi chạy trực tiếp (sqlcmd, Invoke-Sqlcmd, pyodbc, jdbc, mongosh, redis-cli, kafka-*…) — kể cả trong tệp
 *     script được chạy hoặc tệp code được ghi (kịch bản e2e không được tự nối CSDL). Chỉ dbq.js được nối CSDL.
 *   - gọi HTTP / ssh tới máy PROD (config/moi-truong.json → prodChan, prodDb).
 *   - chạy ứng dụng với profile prod.
 *   - CỔNG CẬP NHẬT: lệnh chạy bộ test (playwright test / npm test) chỉ được qua khi kit đã mới theo nhánh main (tools/tester/dong-bo.js kiem,
 *     tự kéo main về nếu cũ; chặn nếu không kéo được và đã quá hạn ngoại tuyến, hoặc cần cài thêm sau cập nhật, hoặc cập nhật đáng ngờ).
 * HỎI (ask):
 *   - EP_BO_QUA_DONG_BO (tắt cổng cập nhật) · dong-bo.js gui (gửi bài học lên kho chung) · dong-bo.js --chap-nhan-sao-luu (ghi đè kit sau sao lưu) · git ghi tay.
 *   - EP_CHO_PHEP_PROD=1 / EP_PROD_CHO_GHI=1 (chạy giao diện / API vào prod).
 *   - ghi (POST / PUT / DELETE) tới Jira / Bitbucket / Confluence bằng curl / script.
 *   - sửa hook, luật, công cụ, cấu hình môi trường, setup, settings của Claude.
 *   - đọc tệp cấu hình ứng dụng có mật khẩu TEST (application-dev.yml, application-prodTest.yml…).
 * Thử: node hooks/guard-easypos.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const prod = require('./prod-config.js');

const KIT = prod.KIT;
const CFG_DIR = path.join(os.homedir(), '.easypos-tester');
const fwd = p => String(p || '').replace(/\\/g, '/');
const KIT_F = fwd(KIT).replace(/\/+$/, '').toLowerCase();

/* ---------------- mẫu nhận dạng ---------------- */
const SECRET_NAME = '(tai-khoan(?!\\.example)[\\w.-]*\\.json|jira\\.properties|confluence\\.properties|git\\.properties|git-doc-code\\.properties|password\\.json|application-prod(?!test)[\\w.-]*\\.ya?ml|bootstrap-prod(?!test)[\\w.-]*\\.ya?ml|id_rsa[\\w.-]*|\\.npmrc)';
const SECRET_FILE_RE = new RegExp('^(' + SECRET_NAME.slice(1, -1) + '|\\.env(\\.[\\w.-]+)?)$', 'i');
const SECRET_MENTION_RE = new RegExp(SECRET_NAME + '|(^|[\\s"\'=/\\\\])\\.env(\\.[\\w-]+)?(?=$|[\\s"\';|&])', 'i');
const TEST_CRED_FILE_RE = /^(application-(dev|prodTest|staging|tls|test\w*)|bootstrap(-\w+)?)\.ya?ml$/i;
const SECRET_ENV_RE = /\b(EP_[A-Z0-9_]*(PASSWORD|TOKEN)|SQLCMDPASSWORD|PGPASSWORD|MYSQL_PWD)\b/i;
const ENV_DUMP_RE = /(^|[;&|`(]\s*|\s)(printenv|export\s+-p)\b|(^|[;&|]\s*)(env|set)\s*($|[;&|>])|\b(Get-ChildItem|gci|ls|dir)\s+env:|GetEnvironmentVariables|\bos\.environ\b(?!\s*[\[.])|(JSON\.stringify|console\.log|print)\(\s*(process\.env|os\.environ)\s*\)/i;
const DB_CLIENT_RE = /\b(sqlcmd|osql|bcp|Invoke-Sqlcmd|SqlConnection|SqlClient|mssql-jdbc|pyodbc|pymssql|sqlalchemy|tedious|psycopg2?|mysql2?|DriverManager|mongosh|mongodump|mongorestore|mongoexport|mongoimport|redis-cli|rabbitmqadmin|kafka-console-producer|kafka-topics|kafka-consumer-groups)\b|jdbc:[a-z]+:|\bmongo\s|mongodb(\+srv)?:\/\/|sqlserver:\/\/|from\s+['"]mssql['"]|require\(\s*['"]mssql['"]\s*\)/i;
const HTTP_WORD_RE = /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|requests|urllib|axios|fetch|httpie|ncat|telnet|Test-NetConnection|ssh|scp|sftp|ftp)\b|\bnc\s/i;
const WRITE_HTTP_RE = /(-X\s*['"]?(POST|PUT|DELETE|PATCH)\b|--request\s+['"]?(POST|PUT|DELETE|PATCH)\b|\s-(d|F)\s|--data(-raw|-binary|-urlencode)?\b|-Method\s+['"]?(Post|Put|Delete|Patch)\b|requests\.(post|put|delete|patch)\b|method\s*[:=]\s*['"](POST|PUT|DELETE|PATCH)['"])/i;
const TEAM_TOOL_HOST_RE = /(jira-sds|git-sds|confluence-sds)\.softdreams\.vn/i;
// CỔNG ĐỌC MÃ Code-Insight (tools/code-insight): khi đã BẬT, mã nguồn chỉ được đọc qua tool MCP `code-insight` (có lọc, hạn mức, nhật ký). Claude KHÔNG
// được gọi thẳng máy chủ Bitbucket (curl / git clone / script) — làm vậy là lách cổng. Cổng tắt (mặc định) thì không áp luật này.
const BITBUCKET_HOST_RE = /git-sds\.softdreams\.vn/i;
const GIT_DOC_TU_XA_RE = /\bgit(\.exe)?\s+(-\S+\s+(\S+\s+)?)*(clone|ls-remote|fetch|archive|remote\s+add|submodule)\b/i;
function codeInsightBat() {
  try {
    const c = JSON.parse(fs.readFileSync(process.env.EP_CI_CAU_HINH || path.join(KIT, 'config', 'code-insight.json'), 'utf8').replace(/^﻿/, ''));
    return c.bat === true && !!String(c.url || '').trim();
  } catch (e) { return false; }
}
const PROD_PROFILE_RE = /(spring\.profiles\.active\s*=\s*['"]?prod\b|SPRING_PROFILES_ACTIVE\s*=\s*['"]?prod\b|-Pprod\b|spring-boot\.run\.profiles\s*=\s*prod\b|--spring\.profiles\.active\s*=\s*prod\b)/i;
const PROD_FLAG_RE = /\bEP_(CHO_PHEP_PROD|PROD_CHO_GHI)\b/;
// Đồng bộ kit tự động (tools/tester/dong-bo.js): chặn đường vòng. Bỏ qua cổng cập nhật, git ghi tay, gửi bài / ghi đè kit đều phải được hỏi.
const BO_QUA_DONG_BO_RE = /\bEP_BO_QUA_DONG_BO\b/;
const GIT_GHI_RE = /\bgit(\.exe)?\s+(-\S+\s+(\S+\s+)?)*(commit|push|merge|rebase|reset|clean|cherry-pick|am|revert|stash|tag|pull|restore|checkout\s+(-f|--force)|branch\s+-[dD]|update-ref|gc|worktree\s+remove)\b/i;
// Lệnh chạy bộ test: trước khi cho chạy phải kiểm kit đã mới (cổng đồng bộ ở cuối tệp này). --list chỉ liệt kê, không chạy.
const CHAY_TEST_RE = /\b(playwright(@[\w.-]+)?(\.cmd)?\s+test|node\s+\S*playwright\S*[\\/]cli\.js\s+test|npm(\.cmd)?\s+(run\s+)?test(:\w+)?)\b/i;
// Chỉ áp cổng cho bộ test CỦA KIT: thư mục làm việc nằm trong kit, hoặc lệnh nhắc tới đường dẫn kit / EP_KIT. Chạy `npm test` ở dự án khác (vd easypos-frontend) không bị vướng.
const canDongBo = (cmd, cwd) => {
  const c = String(cmd || '');
  // Tách theo ; & | để `--list` ở một lệnh con không miễn cổng cho lệnh con khác (vd `npx playwright test; npx playwright test --list`).
  if (!c.split(/[;&|\n]+/).some(s => CHAY_TEST_RE.test(s) && !/\s--list\b/.test(s))) return false;
  const trongKit = (p) => { const f = fwd(p).toLowerCase(); return f === KIT_F || f.startsWith(KIT_F + '/'); };
  return trongKit(cwd || '') || fwd(c).toLowerCase().includes(KIT_F) || /\$EP_KIT|%EP_KIT%|\$env:EP_KIT/i.test(c) || /easypos-tester/i.test(c);
};
const PROTECTED_NAME_RE = /(guard-easypos(\.test)?\.js|prod-config\.js|hooks\.json|session-rules\.js|RULES\.md|moi-truong\.json|settings(\.local)?\.json|setup\.js|plugin\.json|marketplace\.json|dbq\.js|bai-hoc\.js|bai-hoc-lib\.js|bi-mat\.js|dong-bo\.js|dong-bo\.json|nhan-bai-hoc\.(js|yml)|toan-cuc\.ts|QUY-TRINH\.md|jira-tao\.js|confluence\.js|atlassian\.js|jira\.json|kiem-tra-may\.js|cai-dat\.ps1|cap-nhat\.ps1|code-insight)/i;
const SHELL_WRITE_RE = /(\bsed\s+-i|\btee\b|>>?\s*["']?[\w./\\$~-]|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bRemove-Item\b|\brm\s|\bdel\s|\bmv\s|\bmove\s|\bcp\s|\bcopy\s|\bcopy-item\b|\bmove-item\b|\bgit\s+(checkout|restore|reset)\b|disableAllHooks)/i;
const CODE_FILE_RE = /\.(ts|tsx|js|mjs|cjs|py|sh|ps1|cmd|bat|java|rb|pl)$/i;
const SCRIPT_RUN_RE = /\b(?:python3?|py|node|bash|sh|pwsh|powershell(?:\.exe)?|ruby|perl)\b(?:\s+-[A-Za-z]+)*\s+["']?([^\s"'|;&<>]+\.(?:py|js|mjs|cjs|sh|ps1|rb|pl))["']?/gi;
const KIT_VAR_RE = /^(\$\{?EP_KIT\}?|\$env:EP_KIT|%EP_KIT%)[\\/]/i;

const lower = a => (a || []).map(x => String(x).toLowerCase());

/* ---------------- vào / ra ---------------- */
function out(decision, reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: '[guard-easypos] ' + reason } };
}
const deny = r => out('deny', r);
const ask = r => out('ask', r);

/* ---------------- tiện ích ---------------- */
function resolvePath(p, cwd) {
  const s = String(p || '').replace(/^~(?=[\\/]|$)/, os.homedir());
  return fwd(path.isAbsolute(s) ? path.normalize(s) : path.resolve(cwd || process.cwd(), s));
}
/* Đường dẫn tương đối trong bộ kit (chữ thường, dấu /); null nếu nằm ngoài bộ kit. */
function kitRel(abs) {
  const a = fwd(abs).toLowerCase();
  return a.startsWith(KIT_F + '/') ? a.slice(KIT_F.length + 1) : null;
}
const isDbq = (tok, cwd) => KIT_VAR_RE.test(tok) ? /tools[\\/]tester[\\/]dbq\.js$/i.test(tok) : kitRel(resolvePath(tok, cwd)) === 'tools/tester/dbq.js';
function isTrustedScript(tok, cwd) {
  if (KIT_VAR_RE.test(tok)) return true;
  const r = kitRel(resolvePath(tok, cwd));
  return !!r && /^(tools\/(tester|jira|confluence|code-insight)\/[\w.-]+\.js|setup\.js|hooks\/[\w.-]+\.js)$/.test(r);
}
function readText(f) {
  try { if (fs.statSync(f).size > 2 * 1024 * 1024) return null; return fs.readFileSync(f, 'utf8'); } catch (e) { return null; }
}

/* ---------------- tệp (Read / Grep / Edit / Write) ---------------- */
function decideRead(tool, ti) {
  const f = ti.file_path || ti.path || '';
  const base = path.basename(fwd(f));
  if (f && SECRET_FILE_RE.test(base)) return deny('Không đọc tệp mật khẩu (' + base + '). Công cụ của bộ kit tự đọc tệp này; Claude KHÔNG được xem. Mật khẩu do người dùng tự gõ.');
  if (tool === 'Grep' && f && fwd(f).toLowerCase().startsWith(fwd(CFG_DIR).toLowerCase()) && /pass|token|secret|user/i.test(String(ti.pattern || ''))) {
    return deny('Không tìm mật khẩu / token trong thư mục cấu hình riêng của tester (~/.easypos-tester).');
  }
  if (f && TEST_CRED_FILE_RE.test(base)) return ask('Tệp cấu hình ứng dụng (' + base + ') thường chứa mật khẩu CSDL / dịch vụ TEST. Đọc để hiểu cấu trúc thì được, nhưng KHÔNG chép giá trị mật khẩu vào báo cáo, kịch bản hay chat.');
  return null;
}

function protectedWrite(abs) {
  const r = kitRel(abs);
  const a = fwd(abs).toLowerCase();
  if (/\/\.claude\/settings(\.local)?\.json$/.test(a)) return 'settings của Claude Code (hook, quyền)';
  if (!r) return null;
  if (/^(hooks|rules|tools|lib|\.claude-plugin)\//.test(r) || r === 'setup.js') return 'hook / luật / công cụ của bộ kit';
  if (/^e2e\/(lib\/|playwright\.config\.ts$|package\.json$)/.test(r)) return 'chốt chặn prod và fixture của Playwright';
  if (r === 'config/moi-truong.json') return 'cấu hình môi trường và danh sách PROD';
  if (r === 'config/code-insight.json' || r === 'config/code-insight-ca.pem') return 'cấu hình cổng đọc mã (địa chỉ / chứng chỉ của cổng)';
  if (r === '.mcp.json') return 'cấu hình MCP của kit (cổng đọc mã)';
  return null;
}

function decideWrite(tool, ti, cwd) {
  const f = ti.file_path || ti.notebook_path || '';
  if (!f) return null;
  const abs = resolvePath(f, cwd);
  const base = path.basename(abs);
  if (SECRET_FILE_RE.test(base)) return deny('Không ghi tệp mật khẩu (' + base + ') bằng Claude. Người dùng tự mở tệp và gõ mật khẩu.');
  const why = protectedWrite(abs);
  if (why) return ask('Sắp sửa ' + why + ' (' + base + '). Chỉ người phụ trách bộ kit mới nên đổi — xác nhận?');
  const content = [ti.content, ti.new_string, ti.new_source, ...((ti.edits || []).map(e => e && e.new_string))].filter(Boolean).join('\n');
  if (content && CODE_FILE_RE.test(base) && DB_CLIENT_RE.test(content) && !isTrustedScript(abs, cwd)) {
    return deny('Mã được ghi có nối CSDL / hàng đợi trực tiếp (' + base + '). Kịch bản kiểm thử không tự nối CSDL: dùng node tools/tester/dbq.js (chỉ SELECT) để tra dữ liệu.');
  }
  return null;
}

/* ---------------- lệnh shell (Bash / PowerShell) ---------------- */
function segments(cmd) { return String(cmd).split(/\r?\n|;|&&|\|\||\|/).map(s => s.trim()).filter(Boolean); }

function dbqSegment(seg, cwd) {
  const m = seg.match(/(?:^|\s)node(?:\.exe)?\s+["']?([^\s"']*dbq\.js)["']?(?:\s|$)/i);
  return !!m && isDbq(m[1], cwd);
}

/* Địa chỉ PROD xuất hiện trong lệnh có dùng công cụ mạng. */
function prodHostIn(cmd, cfg) {
  if (!HTTP_WORD_RE.test(cmd)) return null;
  const tokens = cmd.match(/[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}|\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];
  return tokens.find(t => prod.isProdHost(t, cfg)) || null;
}

function scanScripts(cmd, cwd) {
  let m;
  SCRIPT_RUN_RE.lastIndex = 0;
  while ((m = SCRIPT_RUN_RE.exec(cmd))) {
    if (isTrustedScript(m[1], cwd)) continue;
    const text = readText(resolvePath(m[1], cwd));
    if (text && DB_CLIENT_RE.test(text)) return deny('Tệp chạy (' + path.basename(m[1]) + ') có nối CSDL / hàng đợi trực tiếp. Chỉ node tools/tester/dbq.js được nối CSDL.');
    if (text && SECRET_MENTION_RE.test(text)) return deny('Tệp chạy (' + path.basename(m[1]) + ') nhắc tới tệp mật khẩu. Không đọc mật khẩu bằng mã tự viết.');
    const cfg = prod.load();
    const host = text && prodHostIn(text, cfg);
    if (host) return deny('Tệp chạy (' + path.basename(m[1]) + ') gọi mạng tới máy PROD (' + host + ').');
  }
  return null;
}

function decideShell(cmd, cwd) {
  if (!cmd) return null;
  if (SECRET_MENTION_RE.test(cmd)) return deny('Lệnh nhắc tới tệp mật khẩu (tai-khoan.json, jira.properties, application-prod.yml, .env…). Công cụ của bộ kit tự đọc; Claude không đọc / in / chép / sửa các tệp đó.');
  if (SECRET_ENV_RE.test(cmd)) return deny('Lệnh nhắc tới biến mật khẩu / token. Công cụ tự đọc; không đưa mật khẩu qua dòng lệnh.');
  if (ENV_DUMP_RE.test(cmd)) return deny('Không đổ toàn bộ biến môi trường (có thể chứa mật khẩu).');
  if (PROD_PROFILE_RE.test(cmd)) return deny('Không chạy ứng dụng với profile prod (nối thẳng CSDL prod bằng tài khoản của app). Dùng prodTest / dev.');

  const cfg = prod.load();
  if (PROD_FLAG_RE.test(cmd)) return ask('Lệnh bật chạy giao diện / API vào PROD (EP_CHO_PHEP_PROD / EP_PROD_CHO_GHI). Chỉ làm khi người phụ trách đồng ý; CSDL prod vẫn không được chạm.');

  if (BO_QUA_DONG_BO_RE.test(cmd)) return ask('Lệnh TẮT cổng "kit phải mới" (EP_BO_QUA_DONG_BO). Bạn có thể đang chạy mã kit cũ / thiếu bản vá an toàn. Chỉ làm khi người phụ trách đồng ý (vd mất mạng khẩn cấp).');
  if (/dong-bo\.js/i.test(cmd) && /(^|[\s"'])gui([\s"']|$)/.test(cmd) && !/--xem\b/.test(cmd)) return ask('Lệnh GỬI bài học lên kho chung của cả nhóm (dong-bo.js gui) — bài sẽ được máy chủ kiểm lại rồi gộp vào main. Chỉ đồng ý khi tester đã duyệt nháp bài học trong chat.');
  if (/dong-bo\.js/i.test(cmd) && /--chap-nhan-sao-luu\b/.test(cmd)) return ask('Lệnh ĐƯA kit về đúng main bằng cách ghi đè thay đổi cục bộ (có sao lưu trước). Chỉ đồng ý khi bạn không có công việc dở trong thư mục kit.');
  if (GIT_GHI_RE.test(cmd)) return ask('Lệnh git GHI / đổi trạng thái kho (commit, push, pull, reset, merge…). Bộ kit tự đồng bộ bằng tools/tester/dong-bo.js — tester không cần dùng git; Claude không commit / push nhánh của dự án. Chỉ người phụ trách mới nên đồng ý.');

  // Tạo ticket Jira thật bằng công cụ của bộ kit: luôn HỎI lại (cổng duyệt thứ hai, sau khi tester đã duyệt nháp trong chat).
  if (/jira-tao\.js/i.test(cmd) && /(^|\s)--tao(\s|$)/.test(cmd)) return ask('Lệnh TẠO ticket thật trên Jira (jira-tao.js --tao) — cả nhóm sẽ nhìn thấy. Chỉ đồng ý khi tester đã duyệt nháp trong chat (bản xem trước đã hợp lệ).');

  // Ghi bài học vào kho chung (kien-thuc/, nằm trong git): HỎI lại — cổng duyệt thứ hai sau khi tester đã duyệt nháp bài học trong chat.
  if (/bai-hoc\.js/i.test(cmd) && /(^|\s)them(\s|$)/.test(cmd) && /(^|\s)--ghi(\s|$)/.test(cmd)) return ask('Lệnh GHI bài học vào kho chung kien-thuc/ (bai-hoc.js them --ghi) — sẽ vào git và cả nhóm dùng. Chỉ đồng ý khi tester đã duyệt nháp bài học trong chat (bản xem trước đã hợp lệ).');

  for (const seg of segments(cmd)) {
    if (DB_CLIENT_RE.test(seg) && !dbqSegment(seg, cwd)) {
      return deny('Không nối CSDL / hàng đợi trực tiếp. Tra CSDL bằng: node "$EP_KIT/tools/tester/dbq.js" <môi trường> <tệp.sql> (chỉ SELECT, tự từ chối máy PROD).');
    }
  }
  const prodHost = prodHostIn(cmd, cfg);
  if (prodHost) return deny('Lệnh gọi mạng tới máy PROD (' + prodHost + '). Chỉ test trên TEST / UAT.');
  if (BITBUCKET_HOST_RE.test(cmd) && (HTTP_WORD_RE.test(cmd) || GIT_DOC_TU_XA_RE.test(cmd)) && codeInsightBat()) {
    return deny('Cổng đọc mã Code-Insight đang BẬT: không gọi thẳng máy chủ Bitbucket (git-sds) bằng curl / git / script. Đọc mã bằng tool MCP code-insight (phan_tich_jira, giai_thich_luong, suy_ra_nghiep_vu, liet_ke_api, bang_db_lien_quan).');
  }
  if (TEAM_TOOL_HOST_RE.test(cmd) && HTTP_WORD_RE.test(cmd) && WRITE_HTTP_RE.test(cmd)) {
    return ask('Lệnh GHI (POST / PUT / DELETE) lên Jira / Bitbucket / Confluence — người cả nhóm nhìn thấy. Soạn nháp, người dùng duyệt trước khi tạo / sửa.');
  }
  const run = scanScripts(cmd, cwd);
  if (run) return run;
  if (PROTECTED_NAME_RE.test(cmd) && SHELL_WRITE_RE.test(cmd)) return ask('Lệnh có vẻ sửa / xoá hook, luật, công cụ hoặc cấu hình của bộ kit. Chỉ người phụ trách bộ kit mới nên đổi — xác nhận?');
  return null;
}

/* ---------------- quyết định ---------------- */
function decide(input) {
  const tool = (input && input.tool_name) || '';
  const ti = (input && input.tool_input) || {};
  const cwd = (input && input.cwd) || process.cwd();
  if (tool === 'Read' || tool === 'Grep') return decideRead(tool, ti);
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return decideWrite(tool, ti, cwd);
  if (tool === 'Bash' || tool === 'PowerShell') return decideShell(String(ti.command || ''), cwd);
  return null;
}

/* Cổng cập nhật kit: chạy tools/tester/dong-bo.js kiem --nhanh (kéo main về nếu cũ). Trả null = cho qua; ngược lại là quyết định chặn.
 * Đặt EP_GUARD_KHONG_DONG_BO=1 chỉ dành cho bộ thử của hook (không có ở máy tester). */
function congDongBo() {
  const tool = path.join(KIT, 'tools', 'tester', 'dong-bo.js');
  if (process.env.EP_GUARD_KHONG_DONG_BO || !fs.existsSync(tool)) return null;
  const r = spawnSync(process.execPath, [tool, 'kiem', '--nhanh', '--yen-lang'], { encoding: 'utf8', timeout: 55000, windowsHide: true });
  if (r.status === 0) return null;
  const noi = (String(r.stderr || '') + '\n' + String(r.stdout || '')).trim().split('\n').slice(-6).join(' ').slice(0, 700);
  const huong = r.status === 10 ? ' → chạy MỘT lần: node "' + KIT_F + '/tools/tester/dong-bo.js" cap-nhat (1–2 phút) rồi chạy lại test.'
    : r.status === 11 ? ' → kiểm mạng / đăng nhập GitHub (git fetch một lần trong thư mục kit), rồi chạy lại.'
    : r.status === 12 ? ' → KHÔNG tự xử lý: báo người phụ trách kit.' : ' → chạy: node "' + KIT_F + '/tools/tester/dong-bo.js" trang-thai và báo người phụ trách nếu vẫn lỗi.';
  return deny('CỔNG CẬP NHẬT KIT — không cho chạy test vì kit chưa mới / chưa an toàn: ' + (r.error ? 'đồng bộ quá lâu hoặc lỗi (' + r.error.message + ')' : noi) + huong);
}

function maskSecrets(s) {
  return String(s || '').replace(/((password|passwd|token|secret|pwd)\s*[=:]\s*)\S+/gi, '$1***');
}
function logDecision(input, res) {
  if (process.env.EP_GUARD_NOLOG) return;
  try {
    fs.mkdirSync(CFG_DIR, { recursive: true });
    const cmd = (input.tool_input && (input.tool_input.command || input.tool_input.file_path || input.tool_input.path)) || '';
    const line = new Date().toISOString() + '\t' + res.hookSpecificOutput.permissionDecision + '\t' + (input.tool_name || '') + '\t'
      + maskSecrets(cmd).replace(/\s+/g, ' ').slice(0, 300) + '\t' + res.hookSpecificOutput.permissionDecisionReason.replace(/\s+/g, ' ') + '\n';
    fs.appendFileSync(path.join(CFG_DIR, 'guard.log'), line);
  } catch (e) { /* không ghi được nhật ký thì thôi */ }
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', d => (raw += d));
  process.stdin.on('end', () => {
    let input = {};
    try { input = JSON.parse((raw || '{}').replace(/^﻿/, '')); } catch (e) { process.exit(0); }
    let res = null;
    try {
      res = decide(input);
      if (!res && (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') && canDongBo(String((input.tool_input && input.tool_input.command) || ''), input.cwd)) res = congDongBo();
    } catch (e) {
      // Lỗi trong hook: lệnh có dấu hiệu chạm mật khẩu / CSDL / prod ⇒ chặn (đóng khi không chắc); còn lại cho qua.
      const c = JSON.stringify(input.tool_input || {});
      if (SECRET_MENTION_RE.test(c) || SECRET_ENV_RE.test(c) || DB_CLIENT_RE.test(c) || PROD_PROFILE_RE.test(c)) res = deny('Hook lỗi khi kiểm (' + e.message + ') — chặn để an toàn.');
    }
    if (res) {
      logDecision(input, res);
      process.stdout.write(JSON.stringify(res));
    }
    process.exit(0);
  });
}

module.exports = { decide, canDongBo, congDongBo };
