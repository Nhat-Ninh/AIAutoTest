#!/usr/bin/env node
/* dbq.js — tra CSDL SQL Server của môi trường TEST / UAT EasyPOS, CHỈ ĐỌC (SELECT) để đối chiếu dữ liệu sau khi test.
 *
 *   node "$EP_KIT/tools/tester/dbq.js" <môi trường> <tệp.sql> [maxDòng]      (môi trường: khoá trong config/moi-truong.json, vd dev, uat)
 *
 * - Máy / CSDL: config/moi-truong.json → moiTruong.<env>.db. Tài khoản: ~/.easypos-tester/tai-khoan.json → <env>.db (tài khoản chỉ-đọc; `sa` được nhận ở máy không phải prod, vẫn chỉ chạy SELECT).
 * - Biến môi trường ghi đè (người dùng tự đặt, Claude không đặt): EP_<ENV>_DB_HOST, _PORT, _DATABASE, _USER, _PASSWORD (ENV = khoá viết hoa, vd UAT).
 * - TỪ CHỐI: máy là PROD (config/moi-truong.json → prodChan, prodDb), CSDL / tài khoản nằm trong prodDb, tệp có câu GHI hoặc câu nhiều lệnh nguy hiểm.
 * - Tệp .sql: nhiều câu ngăn bằng dòng chỉ có ";;". Mỗi câu chạy riêng. Phiên chỉ đọc (ApplicationIntent=ReadOnly, READ UNCOMMITTED).
 * - Mỗi câu tối đa 120 giây, tối đa maxDòng dòng mỗi bảng kết quả (mặc định 200).
 * - Quy ước EasyPOS khi viết câu SQL: luôn lọc công ty (company_id / com_id), bảng có cờ xoá mềm thì thêm deleted = 0, luôn TOP / khoảng ngày.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const prod = require(path.join(__dirname, '..', '..', 'hooks', 'prod-config.js'));
const KIT = prod.KIT;

function die(m) { console.error(m); process.exit(2); }
const [env, file, maxArg] = process.argv.slice(2);
const docJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const cfg = docJson(path.join(KIT, 'config', 'moi-truong.json')) || {};
const dsEnv = Object.keys(cfg.moiTruong || {});
if (!/^[A-Za-z0-9_]+$/.test(env || '') || !file) die('dung: node dbq.js <' + (dsEnv.join('|') || 'moi-truong') + '> <tep.sql> [maxDong]');
if (!dsEnv.includes(env)) die('Khong co moi truong "' + env + '" trong config/moi-truong.json (co: ' + dsEnv.join(', ') + ').');
const maxRows = Math.max(1, Math.min(parseInt(maxArg || '200', 10) || 200, 5000));
const ENVU = env.toUpperCase();
const E = k => { const v = process.env['EP_' + ENVU + '_DB_' + k]; return v && v.trim() ? v.trim() : null; };
const dbCfg = (cfg.moiTruong && cfg.moiTruong[env] && cfg.moiTruong[env].db) || {};
const db = { host: E('HOST') || dbCfg.host, port: E('PORT') || dbCfg.port, database: E('DATABASE') || dbCfg.database };
if (!db.host || !db.database) die('Chua co may / CSDL ' + env + ': dien moiTruong.' + env + '.db (host, database) trong config/moi-truong.json hoac dat EP_' + ENVU + '_DB_HOST / _DATABASE.');

// Chốt chặn prod: cùng danh sách với hook (prodChan + prodDb) — hooks/prod-config.js.
const pc = prod.load();
if (prod.isProdHost(db.host, pc)) die('TU CHOI: may ' + db.host + ' la PROD. dbq chi chay tren CSDL TEST / UAT.');
if (prod.isProdDatabase(db.database, pc)) die('TU CHOI: CSDL ' + db.database + ' nam trong danh sach PROD (prodDb.databases).');

let tk = null;
if (E('USER') && E('PASSWORD')) tk = { user: E('USER'), password: process.env['EP_' + ENVU + '_DB_PASSWORD'] };
for (const f of [path.join(os.homedir(), '.easypos-tester', 'tai-khoan.json'), path.join(KIT, 'config', 'tai-khoan.json')]) {
  if (tk) break;
  const t = docJson(f); const x = t && t[env] && t[env].db;
  if (x && x.user && x.password) tk = x;
}
if (!tk) die('Chua co tai khoan CSDL moi truong ' + env + ': dien ~/.easypos-tester/tai-khoan.json -> ' + env + '.db (user, password; tai khoan CHI DOC) - tu go, khong dan vao chat.');
// sa chỉ được nhận ở máy KHÔNG phải prod (đã chặn prod ở trên) — dev / UAT EasyPOS hiện chỉ có tài khoản sa của ứng dụng. Vẫn chỉ chạy câu SELECT (xem bên dưới).
if (/^sa$/i.test(tk.user)) console.error('# CANH BAO: dang dung tai khoan sa tren ' + db.host + '/' + db.database + ' (may khong phai prod). Chi chay cau doc. Nen xin DBA tai khoan chi-doc.');
if (prod.isProdLogin(tk.user, pc)) die('TU CHOI: ' + tk.user + ' la tai khoan cua PROD (prodDb.logins).');

// Chỉ nhận câu ĐỌC: bỏ chú thích và chuỗi rồi tìm từ khoá ghi / đổi trạng thái.
const WRITE = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|EXEC|EXECUTE|INTO|BULK|GRANT|REVOKE|DENY|DBCC|KILL|BACKUP|RESTORE|SHUTDOWN|RECONFIGURE|sp_configure|xp_cmdshell|OPENROWSET|OPENQUERY|OPENDATASOURCE|WAITFOR)\b/i;
const all = fs.readFileSync(file, 'utf8');
const stmts = all.split(/^;;\s*$/m).map(s => s.trim()).filter(Boolean);
if (!stmts.length) die('Tep SQL rong.');
for (const s of stmts) {
  const noStr = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/N?'(?:[^']|'')*'/g, "''");
  const m = noStr.match(WRITE);
  if (m) die('TU CHOI: dbq chi chay cau DOC (SELECT). Cau co tu khoa "' + m[1].toUpperCase() + '": ' + s.slice(0, 120).replace(/\s+/g, ' '));
  if (!/^\s*(WITH|SELECT|SET\s+NOCOUNT)\b/i.test(noStr)) die('TU CHOI: cau phai bat dau bang SELECT / WITH: ' + s.slice(0, 120).replace(/\s+/g, ' '));
}

let mssql;
try { mssql = require(path.join(KIT, 'e2e', 'node_modules', 'mssql')); }
catch (e) { die('Chua cai thu vien mssql - bam CAI-DAT.cmd (hoac chay npm install trong thu muc e2e) truoc.'); }

(async () => {
  const pool = await mssql.connect({
    server: db.host, port: Number(db.port || 1433), database: db.database, user: tk.user, password: tk.password,
    options: { encrypt: false, trustServerCertificate: true, readOnlyIntent: true, appName: 'EasyPOS-Tester-DbQ' },
    connectionTimeout: 15000, requestTimeout: 120000,
  });
  try {
    // Sau khi nối: tên máy thật (@@SERVERNAME) cũng không được là máy prod — chặn trường hợp IP / tên trỏ nhầm.
    const sv = (await pool.request().query('SELECT @@SERVERNAME AS s')).recordset[0].s;
    if (sv && prod.isProdHost(sv, pc)) { console.error('TU CHOI sau khi noi: @@SERVERNAME = ' + sv + ' la may PROD.'); process.exitCode = 2; return; }
    await pool.request().batch('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; SET LOCK_TIMEOUT 5000;');
    console.log('# ' + ENVU + ' ' + db.host + '/' + db.database + ' (' + sv + ') - chi doc');
    let i = 0;
    for (const s of stmts) {
      i++;
      const t0 = Date.now();
      console.log('## cau ' + i);
      try {
        const r = await pool.request().batch('SET ROWCOUNT ' + (maxRows + 1) + ';\n' + s);
        for (const rs of r.recordsets) {
          const cols = rs.columns ? Object.keys(rs.columns) : (rs[0] ? Object.keys(rs[0]) : []);
          console.log(cols.join('\t'));
          rs.slice(0, maxRows).forEach(row => console.log(cols.map(c => row[c] == null ? 'NULL' : String(row[c] instanceof Date ? row[c].toISOString() : row[c]).replace(/[\t\r\n]/g, ' ')).join('\t')));
          console.log(rs.length > maxRows ? '#rows >' + maxRows + ' (bi cat)' : '#rows ' + rs.length);
        }
      } catch (e) { console.log('LOI ' + e.message); }
      console.log('#ms ' + (Date.now() - t0));
    }
  } finally { await pool.close(); }
})().catch(e => { console.error('LOI ket noi: ' + e.message); process.exit(1); });
