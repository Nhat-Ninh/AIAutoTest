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
 * HỎI (ask):
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
const PROD_PROFILE_RE = /(spring\.profiles\.active\s*=\s*['"]?prod\b|SPRING_PROFILES_ACTIVE\s*=\s*['"]?prod\b|-Pprod\b|spring-boot\.run\.profiles\s*=\s*prod\b|--spring\.profiles\.active\s*=\s*prod\b)/i;
const PROD_FLAG_RE = /\bEP_(CHO_PHEP_PROD|PROD_CHO_GHI)\b/;
const PROTECTED_NAME_RE = /(guard-easypos(\.test)?\.js|prod-config\.js|hooks\.json|session-rules\.js|RULES\.md|moi-truong\.json|settings(\.local)?\.json|setup\.js|plugin\.json|marketplace\.json|dbq\.js|jira-tao\.js|confluence\.js|atlassian\.js|jira\.json|kiem-tra-may\.js|cai-dat\.ps1|cap-nhat\.ps1)/i;
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
  return !!r && /^(tools\/(tester|jira|confluence)\/[\w.-]+\.js|setup\.js|hooks\/[\w.-]+\.js)$/.test(r);
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

  // Tạo ticket Jira thật bằng công cụ của bộ kit: luôn HỎI lại (cổng duyệt thứ hai, sau khi tester đã duyệt nháp trong chat).
  if (/jira-tao\.js/i.test(cmd) && /(^|\s)--tao(\s|$)/.test(cmd)) return ask('Lệnh TẠO ticket thật trên Jira (jira-tao.js --tao) — cả nhóm sẽ nhìn thấy. Chỉ đồng ý khi tester đã duyệt nháp trong chat (bản xem trước đã hợp lệ).');

  for (const seg of segments(cmd)) {
    if (DB_CLIENT_RE.test(seg) && !dbqSegment(seg, cwd)) {
      return deny('Không nối CSDL / hàng đợi trực tiếp. Tra CSDL bằng: node "$EP_KIT/tools/tester/dbq.js" <môi trường> <tệp.sql> (chỉ SELECT, tự từ chối máy PROD).');
    }
  }
  const prodHost = prodHostIn(cmd, cfg);
  if (prodHost) return deny('Lệnh gọi mạng tới máy PROD (' + prodHost + '). Chỉ test trên TEST / UAT.');
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

module.exports = { decide };
