/* Bộ thử code-insight-cai.js + code-insight-header.js: máy tester khớp cấu hình cổng, tắt thì gỡ sạch, không đụng mục của người dùng, không ghi token.
 * Mọi tệp dùng là tệp TẠM (biến EP_CI_CAU_HINH / EP_CI_MCP / EP_CI_SETTINGS). Chạy: node tools/tester/code-insight-cai.test.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

let dung = 0, sai = 0;
const ca = (ten, ok, ct) => { if (ok) { dung++; console.log('ĐÚNG ' + ten); } else { sai++; console.log('SAI  ' + ten + (ct ? '\n     ' + String(ct).slice(0, 300) : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-cai-'));
const F = { cfg: path.join(tmp, 'code-insight.json'), mcp: path.join(tmp, 'mcp.json'), st: path.join(tmp, 'settings.json'), ca: path.join(tmp, 'code-insight-ca.pem') };
process.env.EP_CI_CAU_HINH = F.cfg; process.env.EP_CI_MCP = F.mcp; process.env.EP_CI_SETTINGS = F.st;
const C = require('./code-insight-cai');
const dat = (o) => fs.writeFileSync(F.cfg, JSON.stringify(o));
const doc = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const reset = () => { for (const f of fs.readdirSync(tmp)) if (f !== 'code-insight-ca.pem') fs.rmSync(path.join(tmp, f), { force: true }); };
fs.writeFileSync(F.ca, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
const BAT = { bat: true, url: 'https://10.0.0.5:8100/mcp', caFile: F.ca };

/* 1. tắt */
reset(); dat({ bat: false, url: '' });
ca('bat=false, máy sạch ⇒ không làm gì, không tạo tệp nào', C.apDung().length === 0 && !fs.existsSync(F.mcp) && !fs.existsSync(F.st));
reset();
ca('không có tệp cấu hình cổng ⇒ coi như tắt, không lỗi', (() => { try { return C.apDung().length === 0; } catch (e) { return false; } })());

/* 2. bật */
reset(); dat(BAT);
let v = C.apDung();
ca('bat=true ⇒ ghi mục code-insight vào .mcp.json dạng stdio (cầu nối cục bộ), lệnh Node tuyệt đối', doc(F.mcp).mcpServers['code-insight'].type === 'stdio' && doc(F.mcp).mcpServers['code-insight'].command === process.execPath.replace(/\\/g, '/'), JSON.stringify(v));
ca('.mcp.json trỏ code-insight-proxy.js, KHÔNG có token / Authorization / url của cổng (cầu nối tự đọc cấu hình)', /code-insight-proxy\.js/.test(doc(F.mcp).mcpServers['code-insight'].args[0]) && !/Bearer|Authorization|token|https?:/i.test(fs.readFileSync(F.mcp, 'utf8')));
ca('KHÔNG đặt NODE_EXTRA_CA_CERTS (cầu nối tự dùng chứng chỉ của cổng, không đụng TLS toàn máy)', !fs.existsSync(F.st));
ca('chạy lại ⇒ không đổi gì (idempotent)', C.apDung().length === 0);

/* 3. giữ mục của người dùng */
reset(); dat(BAT);
fs.writeFileSync(F.mcp, JSON.stringify({ mcpServers: { cua_toi: { type: 'http', url: 'https://x/mcp' } }, khac: 1 }));
fs.writeFileSync(F.st, JSON.stringify({ hooks: { PreToolUse: [{ a: 1 }] }, env: { EP_KIT: 'C:/kit' }, permissions: { allow: ['Read'] } }));
C.apDung();
ca('.mcp.json có sẵn mục khác ⇒ giữ nguyên, chỉ thêm mục của kit', doc(F.mcp).mcpServers.cua_toi.url === 'https://x/mcp' && doc(F.mcp).khac === 1 && !!doc(F.mcp).mcpServers['code-insight']);
ca('settings.json của người dùng KHÔNG bị đụng (hook / quyền / biến giữ nguyên, không thêm gì)', doc(F.st).hooks.PreToolUse.length === 1 && doc(F.st).permissions.allow[0] === 'Read' && doc(F.st).env.EP_KIT === 'C:/kit' && !doc(F.st).env.NODE_EXTRA_CA_CERTS);
ca('sửa .mcp.json có sẵn thì SAO LƯU trước', fs.readdirSync(tmp).filter(f => /\.bak-easypos-tester-/.test(f)).length >= 1);

/* 4. tắt lại ⇒ gỡ đúng phần của kit */
dat({ bat: false, url: '' }); v = C.apDung();
ca('bat=false ⇒ gỡ mục code-insight của kit, GIỮ mục của người dùng', !doc(F.mcp).mcpServers['code-insight'] && doc(F.mcp).mcpServers.cua_toi.url === 'https://x/mcp', JSON.stringify(v));
reset(); dat(BAT); C.apDung(); dat({ bat: false }); C.apDung();
ca('.mcp.json chỉ có mục của kit, tắt ⇒ xoá luôn tệp', !fs.existsSync(F.mcp));
// Dọn dấu vết của cách nối CŨ (bản trước đặt NODE_EXTRA_CA_CERTS + mục HTTP/headersHelper)
reset(); dat(BAT);
fs.writeFileSync(F.st, JSON.stringify({ env: { NODE_EXTRA_CA_CERTS: F.ca.replace(/\\/g, '/'), EP_KIT: 'C:/kit' } }));
fs.writeFileSync(F.mcp, JSON.stringify({ mcpServers: { 'code-insight': { type: 'http', url: 'https://cu/mcp', headersHelper: 'node "C:/kit/tools/tester/code-insight-header.js"' } } }));
v = C.apDung();
ca('nâng cấp từ cách nối cũ: mục HTTP + headersHelper của kit được THAY bằng mục stdio', doc(F.mcp).mcpServers['code-insight'].type === 'stdio' && !('headersHelper' in doc(F.mcp).mcpServers['code-insight']) && v.some(x => /cập nhật/.test(x)), JSON.stringify(v));
ca('nâng cấp từ cách nối cũ: NODE_EXTRA_CA_CERTS cũ của kit được GỠ, biến khác giữ nguyên', !doc(F.st).env.NODE_EXTRA_CA_CERTS && doc(F.st).env.EP_KIT === 'C:/kit');

/* 5. không ghi đè của người dùng / tệp hỏng */
reset(); dat(BAT); fs.writeFileSync(F.mcp, JSON.stringify({ mcpServers: { 'code-insight': { type: 'http', url: 'https://nguoi-dung/mcp' } } }));
v = C.apDung(); ca('mục "code-insight" KHÔNG phải của kit ⇒ không ghi đè, có cảnh báo', doc(F.mcp).mcpServers['code-insight'].url === 'https://nguoi-dung/mcp' && v.some(x => /KHÔNG phải của kit/.test(x)), JSON.stringify(v));
dat({ bat: false }); C.apDung(); ca('tắt cổng không gỡ mục "code-insight" của người dùng', doc(F.mcp).mcpServers['code-insight'].url === 'https://nguoi-dung/mcp');
reset(); dat(BAT); fs.writeFileSync(F.mcp, '{hong'); v = C.apDung();
ca('.mcp.json hỏng (JSON sai) ⇒ KHÔNG sửa, có cảnh báo', fs.readFileSync(F.mcp, 'utf8') === '{hong' && v.some(x => /không đọc được/.test(x)));
reset(); dat(BAT); fs.writeFileSync(F.st, '{hong'); v = C.apDung(); ca('settings.json hỏng ⇒ KHÔNG sửa, không làm hỏng việc nối', fs.readFileSync(F.st, 'utf8') === '{hong' && fs.existsSync(F.mcp));
reset(); dat(Object.assign({}, BAT, { url: 'http://10.0.0.5:8100/mcp' })); v = C.apDung();
ca('url http:// (token Jira đi rõ chữ) ⇒ KHÔNG bật, có cảnh báo', !fs.existsSync(F.mcp) && v.some(x => /https/.test(x)), JSON.stringify(v));
reset(); dat({ bat: true, url: 'http://127.0.0.1:8100/mcp', caFile: F.ca }); v = C.apDung();
ca('url http:// nhưng trỏ về CHÍNH máy này (127.0.0.1) ⇒ được bật không cần cờ (chạy thử trên máy người phụ trách)', fs.existsSync(F.mcp) && doc(F.mcp).mcpServers['code-insight'].type === 'stdio', JSON.stringify(v));
ca('http loopback: KHÔNG đặt NODE_EXTRA_CA_CERTS và KHÔNG cảnh báo thiếu chứng chỉ (không cần)', !fs.existsSync(F.st) && !v.some(x => /chứng chỉ|NODE_EXTRA/.test(x)), JSON.stringify(v));
reset(); dat({ bat: true, url: 'http://127.0.0.1.evil.example:8100/mcp', caFile: F.ca }); v = C.apDung();
ca('"127.0.0.1.evil.example" KHÔNG bị coi là loopback', !fs.existsSync(F.mcp) && v.some(x => /https/.test(x)), JSON.stringify(v));
reset(); dat(BAT); fs.writeFileSync(F.st, JSON.stringify({ env: { NODE_EXTRA_CA_CERTS: 'C:/cua-cong-ty.pem' } })); v = C.apDung();
ca('NODE_EXTRA_CA_CERTS của người dùng (tệp khác tên) KHÔNG bị đụng', doc(F.st).env.NODE_EXTRA_CA_CERTS === 'C:/cua-cong-ty.pem');
dat({ bat: false }); C.apDung(); ca('tắt cổng không gỡ NODE_EXTRA_CA_CERTS của người dùng', doc(F.st).env.NODE_EXTRA_CA_CERTS === 'C:/cua-cong-ty.pem');
reset(); dat(Object.assign({}, BAT, { caFile: path.join(tmp, 'khong-co.pem') })); v = C.apDung();
ca('thiếu tệp chứng chỉ ⇒ cảnh báo (vẫn ghi mục MCP)', v.some(x => /thiếu/.test(x)) && fs.existsSync(F.mcp));
reset(); dat(BAT); v = C.apDung({ dry: true }); ca('--dry-run: nói sẽ làm gì nhưng KHÔNG ghi tệp nào', v.length >= 1 && !fs.existsSync(F.mcp) && !fs.existsSync(F.st));

/* 6. header helper */
{
  const hdr = (env) => spawnSync(process.execPath, [path.join(__dirname, 'code-insight-header.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { HOME: tmp, USERPROFILE: tmp }, env) });
  const tok = 'jira-pat-thu-nghiem-1234567890';
  let r = hdr({ EP_JIRA_TOKEN: tok });
  ca('header: có token Jira ⇒ in JSON {"Authorization":"Bearer …"} ra stdout', r.status === 0 && JSON.parse(r.stdout).Authorization === 'Bearer ' + tok, r.stdout + r.stderr);
  ca('header: KHÔNG in token ra stderr', !r.stderr.includes(tok));
  r = hdr({ EP_JIRA_TOKEN: '' });
  ca('header: chưa có token ⇒ in {} (mã 0), báo hướng dẫn ở stderr, không làm hỏng việc nối', r.status === 0 && r.stdout === '{}' && /token Jira/.test(r.stderr), r.stdout + '|' + r.stderr);
}

/* 7. kiem: cổng giả */
(async () => {
  let tkNhan = ''; let ma = 200;
  const gia = http.createServer((req, res) => { tkNhan = String(req.headers.authorization || ''); let b = ''; req.on('data', d => b += d); req.on('end', () => { res.writeHead(ma, { 'Content-Type': 'application/json' }); res.end(ma === 200 ? JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'a' }, { name: 'b' }] } }) : 'loi'); }); });
  await new Promise(r => gia.listen(0, '127.0.0.1', r)); const port = gia.address().port;
  process.env.EP_CODE_INSIGHT_HTTP = '1'; process.env['EP_JIRA' + '_TOKEN'] = 'jira-pat-kiem-9876543210abcd';
  dat({ bat: false }); let r = await C.kiem(); ca('kiem: cổng tắt ⇒ báo TẮT (không phải lỗi)', r.tat === true && !r.ok);
  dat({ bat: true, url: 'http://127.0.0.1:' + port + '/mcp' });
  r = await C.kiem(); ca('kiem: cổng trả 200 ⇒ OK, nêu số tool, gửi đúng Bearer token Jira', r.ok && /2 tool/.test(r.thongBao) && tkNhan === 'Bearer ' + process.env['EP_JIRA' + '_TOKEN'], JSON.stringify(r));
  for (const [m, re] of [[401, /từ chối token Jira/], [403, /chưa được phép/], [429, /giới hạn/], [500, /lỗi 500/]]) { ma = m; r = await C.kiem(); ca('kiem: HTTP ' + m + ' ⇒ thông báo dễ hiểu + cách xử lý', !r.ok && re.test(r.thongBao) && !!r.cach, JSON.stringify(r)); }
  dat({ bat: true, url: 'http://127.0.0.1:1/mcp' }); r = await C.kiem(); ca('kiem: cổng không chạy ⇒ "Không nối được" + kiểm VPN', !r.ok && /Không nối được/.test(r.thongBao) && /VPN/.test(r.cach));
  // Chưa có token: chạy trong TIẾN TRÌNH CON với HOME tạm (thư viện đọc ~/.easypos-tester khi nạp, nên không cô lập được trong tiến trình này — tránh đọc nhầm token thật của người chạy bộ thử).
  dat({ bat: true, url: 'http://127.0.0.1:' + port + '/mcp' });
  const cc = require('child_process').spawn(process.execPath, [path.join(__dirname, 'code-insight-cai.js'), 'kiem'], { env: Object.assign({}, process.env, { HOME: tmp, USERPROFILE: tmp, EP_JIRA_TOKEN: '' }) });
  let so = ''; cc.stdout.on('data', d => { so += d; }); cc.stderr.on('data', d => { so += d; });
  const ma2 = await new Promise(res => cc.on('close', res));
  ca('kiem: chưa có token Jira ⇒ mã 1 + hướng dẫn tạo PAT (6.4)', ma2 === 1 && /token Jira/i.test(so) && /6\.4/.test(so), ma2 + ' ' + so);
  // ---- "nút bấm" CAI-CODE-INSIGHT: caiDat() với các chặng giả ----
  {
    process.env.EP_CI_LOG = path.join(tmp, 'cai.log');
    const chayCai = async (o) => { const lg = console.log; const buf = []; console.log = (s) => buf.push(String(s)); try { const r = await C.caiDat(o); return { r, out: buf.join('\n') }; } finally { console.log = lg; } };
    const tot = { kit: () => ({ status: 0, vaiTro: 'tester' }), claude: () => '2.1.0', coToken: () => true };
    reset(); fs.writeFileSync(F.ca, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
    dat({ bat: false }); let x = await chayCai(tot);
    ca('cai-dat: cổng TẮT ⇒ báo "không cần làm gì", 0 lỗi, không ghi .mcp.json', x.r.loi === 0 && /TẮT/.test(x.out) && !fs.existsSync(F.mcp));
    dat(BAT); x = await chayCai(Object.assign({}, tot, { tcp: async () => ({ ok: false, ma: 'refused' }) }));
    ca('cai-dat: cổng không chạy (refused) ⇒ [X] nói rõ "không phải lỗi máy bạn" + báo người phụ trách', x.r.loi >= 1 && /KHÔNG chạy/.test(x.out) && /không phải lỗi máy bạn/.test(x.out), x.out.slice(-400));
    x = await chayCai(Object.assign({}, tot, { tcp: async () => ({ ok: false, ma: 'timeout' }) }));
    ca('cai-dat: hết giờ (timeout) ⇒ gợi ý bật VPN / nhờ admin mở cổng', x.r.loi >= 1 && /VPN/.test(x.out) && /mở cổng 8100/.test(x.out), x.out.slice(-300));
    x = await chayCai(Object.assign({}, tot, { coToken: () => false, tcp: async () => ({ ok: true }) }));
    ca('cai-dat: chưa có token Jira ⇒ [X] + hướng dẫn Phần 6.4', x.r.loi >= 1 && /Chưa có token Jira/.test(x.out) && /6\.4/.test(x.out));
    x = await chayCai(Object.assign({}, tot, { claude: () => null, tcp: async () => ({ ok: true }) })); ca('cai-dat: không thấy lệnh claude ⇒ chỉ cảnh báo [!] (tester dùng Claude trong VS Code vẫn ổn)', x.out.includes('[!]  Không thấy lệnh claude') && !x.out.includes('[X]  Không thấy lệnh claude'));
    x = await chayCai(Object.assign({}, tot, { kit: () => ({ status: 10, vaiTro: 'tester' }), tcp: async () => ({ ok: true }) })); ca('cai-dat: máy tester, kit chưa mới ⇒ [X] "bấm CAP-NHAT.cmd"', x.r.loi >= 1 && /CAP-NHAT\.cmd/.test(x.out));
    x = await chayCai(Object.assign({}, tot, { kit: () => ({ status: 10, vaiTro: 'phu-trach' }), tcp: async () => ({ ok: true }) })); ca('cai-dat: máy người phụ trách, kit khác main ⇒ chỉ cảnh báo [!], không phải lỗi', /\[!\]  Kit chưa mới/.test(x.out));
    fs.unlinkSync(F.ca); fs.writeFileSync(F.ca + '.crt', 'x');
    x = await chayCai(Object.assign({}, tot, { tcp: async () => ({ ok: true }) })); ca('cai-dat: chứng chỉ bị đặt tên ".pem.crt" ⇒ nói đúng lỗi đặt tên', /đặt sai tên/.test(x.out) && x.r.loi >= 1, x.out.slice(-300));
    fs.unlinkSync(F.ca + '.crt'); fs.writeFileSync(F.ca, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
    // chạy thật tới cổng giả (http loopback) ⇒ mọi thứ OK
    process.env['EP_JIRA' + '_TOKEN'] = 'jira-pat-kiem-9876543210abcd'; ma = 200;
    dat({ bat: true, url: 'http://127.0.0.1:' + port + '/mcp', caFile: F.ca });
    x = await chayCai(tot);
    ca('cai-dat: mọi chặng đạt (cổng giả 200) ⇒ 0 lỗi, có .mcp.json, nhắc mở phiên Claude MỚI + duyệt MCP', x.r.loi === 0 && fs.existsSync(F.mcp) && /Cổng Code-Insight nối được/.test(x.out) && /phiên Claude MỚI/.test(x.out), x.out.slice(-500));
    ca('cai-dat: ghi nhật ký cho người phụ trách và nhật ký KHÔNG chứa token', fs.existsSync(process.env.EP_CI_LOG) && !fs.readFileSync(process.env.EP_CI_LOG, 'utf8').includes(process.env['EP_JIRA' + '_TOKEN']));
    x = await chayCai(tot); ca('cai-dat: chạy lại lần hai vẫn 0 lỗi (idempotent)', x.r.loi === 0);
  }
  gia.close();

  console.log('\n' + dung + '/' + (dung + sai) + ' ca đúng');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* dọn tạm */ }
  process.exit(sai ? 1 : 0);
})();
