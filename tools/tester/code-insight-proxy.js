#!/usr/bin/env node
/* code-insight-proxy.js — máy chủ MCP "stdio" chạy CỤC BỘ trên máy tester (Claude Code tự khởi động theo .mcp.json do code-insight-cai.js ghi).
 * Nó là cầu nối mỏng: nhận yêu cầu JSON-RPC từ Claude (qua stdin), chuyển tới CỔNG Code-Insight bằng HTTPS kèm token Jira của CHÍNH tester, trả kết quả về Claude (qua stdout).
 * Vì sao dùng cầu nối thay vì nối thẳng HTTP: (1) không phụ thuộc cách từng bản Claude Code (CLI / VS Code) xử lý tiêu đề động hay chứng chỉ tự ký,
 * (2) không bao giờ kích hoạt luồng đăng nhập OAuth của MCP (chỉ xảy ra với máy chủ HTTP trả 401), (3) token Jira chỉ nằm trong tiến trình này.
 * Chứng chỉ công khai của cổng lấy từ config/code-insight-ca.pem (tin ĐÚNG chứng chỉ này cho cổng, không đụng cài đặt TLS của máy).
 * stdout CHỈ chứa JSON-RPC (mỗi dòng một thông điệp); mọi thông báo cho người dùng đi qua stderr. Token không bao giờ được in ra. */
'use strict';
const fs = require('fs');
const http = require('http');
const https = require('https');
const readline = require('readline');
const C = require('./code-insight-cai');

const HET_GIO_MS = 960000;   // một lượt phân tích có thể mất vài phút (worker chạy Claude)

const loiRpc = (id, code, msg) => ({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message: msg } });
const ra = (o) => process.stdout.write(JSON.stringify(o) + '\n');

function layToken() { try { const t = require('../lib/atlassian').layToken('jira'); return t ? t.token : null; } catch (e) { return null; } }

/** POST một thông điệp JSON-RPC tới cổng. Trả { s, d } hoặc { loi }. */
function chuyen(cfg, body, token) {
  return new Promise((resolve) => {
    let u; try { u = new URL(cfg.url); } catch (e) { return resolve({ loi: 'địa chỉ cổng sai' }); }
    const lib = u.protocol === 'http:' ? http : https;
    const opt = { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, timeout: HET_GIO_MS };
    if (u.protocol === 'https:' && cfg.caFile && fs.existsSync(cfg.caFile)) opt.ca = fs.readFileSync(cfg.caFile);
    const rq = lib.request(u, opt, (r) => { const ch = []; r.on('data', x => ch.push(x)); r.on('end', () => resolve({ s: r.statusCode, d: Buffer.concat(ch).toString('utf8') })); });
    rq.on('timeout', () => rq.destroy(Object.assign(new Error('quá thời gian chờ cổng'), { code: 'ETIMEDOUT' })));
    rq.on('error', (e) => resolve({ loi: e.code || e.message }));
    rq.end(JSON.stringify(body));
  });
}

const GOI_Y = {
  401: 'Cổng từ chối token Jira (sai / hết hạn): tạo lại PAT Jira và ghi vào jira.properties (HUONG-DAN-TESTER Phần 6.4).',
  403: 'Tài khoản Jira của bạn chưa được phép dùng cổng đọc mã: nhờ người phụ trách cấp quyền.',
  429: 'Cổng đang giới hạn tốc độ / hạn mức: chờ một lúc rồi hỏi lại.',
  502: 'Cổng không xác thực được với Jira lúc này: thử lại sau.',
};

async function xuLy(msg) {
  const laYeuCau = msg && msg.method && msg.id !== undefined;
  if (!laYeuCau && !(msg && msg.method)) return;           // phản hồi / rác: bỏ qua
  const cfg = C.cauHinh();
  const tra = (code, text) => { if (laYeuCau) ra(loiRpc(msg.id, code, text)); else process.stderr.write(text + '\n'); };
  if (!cfg.bat) return tra(-32000, 'Cổng Code-Insight đang TẮT (config/code-insight.json bat=false). Bấm CAI-CODE-INSIGHT.cmd để kiểm.');
  const token = layToken();
  if (!token) return tra(-32000, 'Chưa có token Jira — cổng dùng token Jira của bạn. Tạo PAT và ghi vào jira.properties (HUONG-DAN-TESTER Phần 6.4).');
  const r = await chuyen(cfg, msg, token);
  if (r.loi) {
    const huong = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(r.loi) ? 'Không tin chứng chỉ của cổng: thiếu / sai config/code-insight-ca.pem (báo người phụ trách).'
      : r.loi === 'ECONNREFUSED' ? 'Cổng Code-Insight chưa chạy (mạng thông nhưng không có dịch vụ nghe): báo người phụ trách.'
      : 'Không nối được cổng (' + r.loi + '): kiểm VPN / mạng; vẫn lỗi thì chạy CAI-CODE-INSIGHT.cmd.';
    return tra(-32000, huong);
  }
  if (r.s === 202 || !laYeuCau) return;                    // thông báo: không có phản hồi
  if (r.s !== 200) return tra(-32000, (GOI_Y[r.s] || 'Cổng trả lỗi ' + r.s + '.') + (r.d ? ' [' + r.d.trim().slice(0, 160) + ']' : ''));
  let j; try { j = JSON.parse(r.d); } catch (e) { return tra(-32603, 'Cổng trả phản hồi không phải JSON.'); }
  ra(j);
}

if (require.main === module) {
  const cho = new Set();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const s = line.trim(); if (!s) return;
    let msg; try { msg = JSON.parse(s); } catch (e) { return ra(loiRpc(null, -32700, 'JSON không hợp lệ')); }
    const p = xuLy(msg).catch((e) => { if (msg && msg.id !== undefined) ra(loiRpc(msg.id, -32603, 'Lỗi cầu nối: ' + String(e.message).slice(0, 120))); }).finally(() => cho.delete(p));
    cho.add(p);
  });
  rl.on('close', () => { Promise.allSettled([...cho]).then(() => process.exit(0)); });
}

module.exports = { xuLy, chuyen };
