/* Bộ thử code-insight-proxy.js (cầu nối MCP stdio): chạy tiến trình THẬT qua stdin / stdout, cổng giả trong cùng tiến trình. Chạy: node tools/tester/code-insight-proxy.test.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let dung = 0, sai = 0;
const ca = (ten, ok, ct) => { if (ok) { dung++; console.log('ĐÚNG ' + ten); } else { sai++; console.log('SAI  ' + ten + (ct ? '\n     ' + String(ct).slice(0, 300) : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-proxy-'));
const cfgF = path.join(tmp, 'code-insight.json');
const TOKEN = 'jira-pat-thu-proxy-1234567890';

let ma = 200, nhan = [], chamMs = 0;
const gia = http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    let rpc = {}; try { rpc = JSON.parse(b); } catch (e) { /* rác */ }
    nhan.push({ auth: req.headers.authorization, method: rpc.method });
    const tra = () => {
      if (rpc.id === undefined) { res.writeHead(202); return res.end(); }
      res.writeHead(ma, { 'Content-Type': 'application/json' });
      res.end(ma === 200 ? JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools: [{ name: 'a' }], echo: rpc.method } }) : 'thông báo lỗi của cổng');
    };
    chamMs ? setTimeout(tra, chamMs) : tra();
  });
});

function chay(dong, env, doiMs) {
  return new Promise((res) => {
    const c = spawn(process.execPath, [path.join(__dirname, 'code-insight-proxy.js')], { env: Object.assign({}, process.env, { EP_CI_CAU_HINH: cfgF, HOME: tmp, USERPROFILE: tmp }, env || {}), stdio: ['pipe', 'pipe', 'pipe'] });
    let so = '', se = ''; c.stdout.on('data', d => so += d); c.stderr.on('data', d => se += d);
    for (const d of dong) c.stdin.write((typeof d === 'string' ? d : JSON.stringify(d)) + '\n');
    setTimeout(() => c.stdin.end(), doiMs || 800);
    c.on('close', () => res({ out: so.trim() ? so.trim().split('\n').map(l => { try { return JSON.parse(l); } catch (e) { return { khongJson: l }; } }) : [], err: se }));
  });
}

(async () => {
  await new Promise(r => gia.listen(0, '127.0.0.1', r)); const port = gia.address().port;
  const bat = (o) => fs.writeFileSync(cfgF, JSON.stringify(Object.assign({ bat: true, url: 'http://127.0.0.1:' + port + '/mcp' }, o || {})));
  bat();
  let r = await chay([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }], { EP_JIRA_TOKEN: TOKEN });
  ca('yêu cầu có id ⇒ chuyển tới cổng và trả đúng phản hồi (đúng id)', r.out.length === 2 && r.out[0].id === 1 && r.out[1].id === 2 && r.out[1].result.tools[0].name === 'a', JSON.stringify(r.out));
  ca('thông báo (không có id) ⇒ chuyển đi nhưng KHÔNG có dòng phản hồi nào', r.out.length === 2 && nhan.some(x => x.method === 'notifications/initialized'));
  ca('cầu nối gửi token Jira của tester làm Bearer tới cổng', nhan.every(x => x.auth === 'Bearer ' + TOKEN));
  ca('stdout chỉ chứa JSON-RPC (không lẫn chữ nào khác), không in token ra stdout / stderr', r.out.every(o => !o.khongJson && o.jsonrpc === '2.0') && !JSON.stringify(r.out).includes(TOKEN) && !r.err.includes(TOKEN));

  r = await chay([{ jsonrpc: '2.0', id: 7, method: 'tools/list' }], { EP_JIRA_TOKEN: '' });
  ca('chưa có token Jira ⇒ trả lỗi JSON-RPC có hướng dẫn Phần 6.4, KHÔNG gọi cổng', r.out[0].error && /token Jira/.test(r.out[0].error.message) && /6\.4/.test(r.out[0].error.message), JSON.stringify(r.out));

  for (const [m, re] of [[401, /từ chối token Jira/], [403, /chưa được phép/], [429, /giới hạn/], [500, /lỗi 500/]]) {
    ma = m; r = await chay([{ jsonrpc: '2.0', id: 9, method: 'tools/list' }], { EP_JIRA_TOKEN: TOKEN });
    ca('cổng trả HTTP ' + m + ' ⇒ lỗi JSON-RPC dễ hiểu (không treo Claude, không kích hoạt OAuth)', r.out[0].id === 9 && r.out[0].error && re.test(r.out[0].error.message), JSON.stringify(r.out));
  }
  ma = 200;

  bat({ url: 'http://127.0.0.1:1/mcp' });
  r = await chay([{ jsonrpc: '2.0', id: 3, method: 'tools/list' }], { EP_JIRA_TOKEN: TOKEN });
  ca('cổng không chạy (ECONNREFUSED) ⇒ lỗi nói rõ "chưa chạy, báo người phụ trách"', r.out[0].error && /chưa chạy/.test(r.out[0].error.message), JSON.stringify(r.out));

  fs.writeFileSync(cfgF, JSON.stringify({ bat: false }));
  r = await chay([{ jsonrpc: '2.0', id: 4, method: 'tools/list' }], { EP_JIRA_TOKEN: TOKEN });
  ca('cấu hình bat=false ⇒ lỗi "đang TẮT", không gọi mạng', r.out[0].error && /TẮT/.test(r.out[0].error.message), JSON.stringify(r.out));

  bat(); nhan = [];
  r = await chay(['{khong phai json', { jsonrpc: '2.0', id: 5, method: 'ping' }], { EP_JIRA_TOKEN: TOKEN });
  ca('dòng rác ⇒ lỗi -32700 nhưng cầu nối KHÔNG chết, yêu cầu sau vẫn được xử lý', r.out.some(o => o.error && o.error.code === -32700) && r.out.some(o => o.id === 5 && o.result), JSON.stringify(r.out));

  chamMs = 1200;
  r = await chay([{ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'x' } }], { EP_JIRA_TOKEN: TOKEN }, 100);
  ca('đóng stdin khi cổng còn đang trả lời ⇒ cầu nối CHỜ xong yêu cầu rồi mới thoát (không mất phản hồi)', r.out.length === 1 && r.out[0].id === 6, JSON.stringify(r.out));
  chamMs = 0;

  console.log('\n' + dung + '/' + (dung + sai) + ' ca đúng');
  gia.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* dọn tạm */ }
  process.exit(sai ? 1 : 0);
})();
