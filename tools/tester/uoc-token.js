#!/usr/bin/env node
/* uoc-token.js — ĐO token THẬT của một phiên Claude Code (số liệu nhà cung cấp ghi trong tệp phiên), chia theo từng lượt giao việc.
 * Dùng để trả lời: "kiểm thử một chức năng tốn bao nhiêu token, % nằm ở đâu?" và so sánh trước / sau khi tối ưu kit.
 * Chỉ ĐỌC tệp phiên của chính bạn (~/.claude/projects/<thư-mục-dự-án>/<mã-phiên>.jsonl); không gửi đi đâu; chỉ in số liệu + 60 ký tự đầu của câu bạn giao việc.
 *
 *   node uoc-token.js                       liệt kê các lượt giao việc trong phiên mới nhất của thư mục dự án (số thứ tự, giờ, số token)
 *   node uoc-token.js <số|số-số> [...]      chi tiết một lượt hoặc một đoạn liên tiếp (vd 12   hoặc   12-19)
 *   --file <tệp.jsonl>                      chỉ định tệp phiên (mặc định: tệp mới nhất của thư mục dự án theo thư mục hiện tại)
 *   --sau <ISO> / --truoc <ISO>             chỉ tính các lần gọi trong khoảng giờ (UTC), để đo riêng một đoạn việc trong lượt
 *   --ngu-canh <số>                         cỡ cửa sổ ngữ cảnh để tính % (mặc định 1000000 — các phiên dài ở đây vượt 500.000)
 *
 * Giải thích số: "mới" = token đưa vào lần đầu (input + ghi bộ nhớ đệm); "đọc lại" = ngữ cảnh cũ đọc từ bộ nhớ đệm mỗi lần gọi (rẻ hơn nhiều);
 * "ra" = token Claude viết (kể cả suy nghĩ). "Quy đổi" = mới + 0,1×đọc lại + 5×ra  (tỉ lệ giá phổ biến: đọc đệm ≈ 0,1× đầu vào, đầu ra ≈ 5× đầu vào) — ƯỚC LƯỢNG
 * để so sánh với nhau, không phải hoá đơn. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const lay = (k, mac) => { const i = args.indexOf(k); if (i < 0) return mac; const v = args[i + 1]; args.splice(i, 2); return v; };
const tep = lay('--file', null);
const cuaSo = parseInt(lay('--ngu-canh', '1000000'), 10) || 1000000;
const sau = lay('--sau', null), truoc = lay('--truoc', null);   // chỉ tính các lần gọi trong khoảng thời gian (ISO, UTC)
const die = (s, c) => { console.error(s); process.exit(c || 1); };

function timTepPhien() {
  if (tep) return path.resolve(tep);
  const goc = path.join(os.homedir(), '.claude', 'projects');
  const ten = process.cwd().replace(/[:\\/]/g, '-');            // C:\a\b → C--a-b
  let dir = path.join(goc, ten);
  if (!fs.existsSync(dir)) {
    const ds = fs.existsSync(goc) ? fs.readdirSync(goc).filter(d => ten.toLowerCase().startsWith(d.toLowerCase()) || d.toLowerCase().startsWith(ten.toLowerCase())) : [];
    if (!ds.length) die('Không thấy thư mục phiên cho ' + process.cwd() + ' trong ' + goc + ' — dùng --file <tệp.jsonl>');
    dir = path.join(goc, ds[0]);
  }
  const f = fs.readdirSync(dir).filter(x => x.endsWith('.jsonl')).map(x => [x, fs.statSync(path.join(dir, x)).mtimeMs]).sort((a, b) => b[1] - a[1])[0];
  if (!f) die('Thư mục ' + dir + ' không có tệp phiên .jsonl');
  return path.join(dir, f[0]);
}

const BO_QUA = /^\s*<(system-reminder|command-|local-command|side-sessions|ci-monitor|task-notification)|^This session is being continued|^\[Request interrupted/;
function vanBanNguoiDung(o) {
  const m = o.message; if (!m || m.role !== 'user') return null;
  const c = m.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    if (c.some(b => b && b.type === 'tool_result')) return null;     // kết quả công cụ, không phải câu giao việc
    const t = c.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
    return t || null;
  }
  return null;
}

function doc(f) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const luot = [];                       // mỗi lượt: { prompt, ts, goi: Map<id, usage> }
  let cur = null;
  for (const l of lines) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch (e) { continue; }
    if (o.type === 'user') {
      const t = vanBanNguoiDung(o);
      if (t !== null && !BO_QUA.test(t) && t.trim()) { cur = { prompt: t.trim().replace(/\s+/g, ' ').slice(0, 60), ts: o.timestamp, goi: new Map() }; luot.push(cur); }
    } else if (o.type === 'assistant' && cur && o.message && o.message.usage) {
      const id = o.message.id || o.requestId || o.uuid;
      if ((!sau || o.timestamp >= sau) && (!truoc || o.timestamp <= truoc)) cur.goi.set(id, o.message.usage);                                // cùng một lời gọi được ghi nhiều dòng: giữ bản cuối
    }
  }
  return luot;
}

function tong(luot) {
  let goi = 0, moi = 0, doc_ = 0, ra = 0, suyNghi = 0, nguCanhToiDa = 0;
  for (const l of luot) for (const u of l.goi.values()) {
    goi++;
    moi += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    doc_ += u.cache_read_input_tokens || 0;
    ra += u.output_tokens || 0;
    suyNghi += (u.output_tokens_details && u.output_tokens_details.thinking_tokens) || 0;
    nguCanhToiDa = Math.max(nguCanhToiDa, (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0));
  }
  return { goi, moi, doc: doc_, ra, suyNghi, nguCanhToiDa, quyDoi: Math.round(moi + 0.1 * doc_ + 5 * ra) };
}
const n = x => x.toLocaleString('vi-VN');
const pc = (a, b) => (b ? (100 * a / b).toFixed(1) : '0') + '%';

const f = timTepPhien();
const luot = doc(f);
if (!luot.length) die('Không thấy lượt giao việc nào trong ' + f);
const yeuCau = args.filter(a => /^\d+(-\d+)?$/.test(a));

if (!yeuCau.length) {
  console.log('Phiên: ' + f + '\n');
  console.log('  #  giờ (UTC)         gọi       mới      đọc lại        ra     quy đổi   câu giao việc');
  luot.forEach((l, i) => {
    const t = tong([l]);
    console.log(String(i + 1).padStart(3) + '  ' + String(l.ts || '').slice(5, 16).replace('T', ' ').padEnd(16) + String(t.goi).padStart(5) + n(t.moi).padStart(10) + n(t.doc).padStart(13) + n(t.ra).padStart(10) + n(t.quyDoi).padStart(12) + '   ' + l.prompt);
  });
  const T = tong(luot);
  console.log('\nCả phiên: ' + T.goi + ' lần gọi · mới ' + n(T.moi) + ' · đọc lại ' + n(T.doc) + ' · ra ' + n(T.ra) + ' (suy nghĩ ' + n(T.suyNghi) + ') · quy đổi ' + n(T.quyDoi));
  console.log('Xem chi tiết một lượt / đoạn:  node tools/tester/uoc-token.js <số>  hoặc  <số-số>');
  process.exit(0);
}

for (const y of yeuCau) {
  const [a, b] = y.split('-').map(Number);
  const dau = a, cuoi = b || a;
  if (dau < 1 || cuoi > luot.length || cuoi < dau) die('Lượt ' + y + ' không có (phiên có ' + luot.length + ' lượt)');
  const doan = luot.slice(dau - 1, cuoi);
  const T = tong(doan);
  console.log('═══ Lượt ' + y + (cuoi > dau ? ' (' + (cuoi - dau + 1) + ' lượt)' : '') + ': "' + doan[0].prompt + '"');
  console.log('  Số lần gọi mô hình         : ' + T.goi);
  console.log('  Token ra (Claude viết)     : ' + n(T.ra) + '   (trong đó suy nghĩ ' + n(T.suyNghi) + ')');
  console.log('  Token mới đưa vào          : ' + n(T.moi));
  console.log('  Token đọc lại từ bộ nhớ đệm: ' + n(T.doc) + '   (≈ ' + n(Math.round(T.doc / Math.max(1, T.goi))) + ' / lần gọi)');
  console.log('  Ngữ cảnh lớn nhất          : ' + n(T.nguCanhToiDa) + ' = ' + pc(T.nguCanhToiDa, cuaSo) + ' của cửa sổ ' + n(cuaSo));
  const tongBa = T.moi + T.doc + T.ra;
  console.log('  Quy đổi (ước lượng giá)    : ' + n(T.quyDoi) + '   → phần ra ' + pc(5 * T.ra, T.quyDoi) + ' · phần mới ' + pc(T.moi, T.quyDoi) + ' · phần đọc lại ' + pc(0.1 * T.doc, T.quyDoi));
  console.log('  Mỗi lần gọi trung bình     : ra ' + n(Math.round(T.ra / Math.max(1, T.goi))) + ' · mới ' + n(Math.round(T.moi / Math.max(1, T.goi))));
  void tongBa;
  console.log('');
}
