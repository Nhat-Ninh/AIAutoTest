'use strict';
/* prod-config.js — danh sách PROD của EasyPOS, dùng CHUNG cho hook guard-easypos.js và công cụ dbq.js.
 * Nguồn duy nhất: config/moi-truong.json  →  prodChan (web / API / IP)  +  prodDb (máy, tên máy, CSDL, tài khoản CSDL prod).
 * GIỮ ĐỒNG BỘ cách so khớp với khopChan trong e2e/lib/moi-truong.ts (Playwright). */
const fs = require('fs');
const path = require('path');

const KIT = path.resolve(__dirname, '..');
const arr = a => (Array.isArray(a) ? a : []).map(x => String(x).trim()).filter(Boolean);

function docJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }

/* Nạp cấu hình mỗi lần gọi (hook chạy một lần cho mỗi lệnh nên không cần bộ đệm). EP_GUARD_CONFIG chỉ dành cho bộ thử. */
function load() {
  const c = docJson(process.env.EP_GUARD_CONFIG || path.join(KIT, 'config', 'moi-truong.json')) || {};
  const db = c.prodDb || {};
  return {
    prodChan: arr(c.prodChan),
    khongPhaiProd: arr(c.khongPhaiProd).map(x => x.toLowerCase()),
    prodDb: { hosts: arr(db.hosts), hostnames: arr(db.hostnames), databases: arr(db.databases), logins: arr(db.logins) },
    moiTruong: c.moiTruong || {},
  };
}

/* Mục kết thúc "." = dải IP (so đầu chuỗi); có "*" = mẫu tên máy ("*" = chữ / số / gạch trong MỘT nhãn);
   còn lại so TRÙNG tên máy hoặc đuôi tên miền (easypos.vn khớp easypos.vn và app.easypos.vn). */
function khopChan(host, muc) {
  const x = String(muc || '').trim().toLowerCase();
  if (!x) return false;
  if (x.endsWith('.')) return host.startsWith(x);
  if (x.includes('*')) return new RegExp('^(?:[^.]+\\.)*' + x.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]*') + '$').test(host);
  return host === x || host.endsWith('.' + x);
}

/* Lấy tên máy từ URL / "host:port" / tên máy trần. */
function hostOf(v) {
  let h = String(v || '').trim().toLowerCase();
  try { if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) h = new URL(h).hostname.toLowerCase(); } catch (e) { /* giữ nguyên */ }
  return h.replace(/:\d+$/, '');
}

/* Máy TEST / UAT nằm dưới tên miền prod: khai ở khongPhaiProd, so TRÙNG nguyên tên. Không nhận IP; tên khai đích danh trong prodChan vẫn là prod. */
function laMayThu(host, cfg) {
  if (!host || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return cfg.khongPhaiProd.includes(host) && !cfg.prodChan.map(x => x.toLowerCase()).includes(host);
}

/* Máy / địa chỉ này có thuộc PROD không (web, API, hay máy CSDL). */
function isProdHost(v, cfg) {
  cfg = cfg || load();
  const host = hostOf(v);
  if (!host || laMayThu(host, cfg)) return false;
  if (cfg.prodChan.some(p => khopChan(host, p))) return true;
  if (cfg.prodDb.hosts.some(p => khopChan(host, p))) return true;
  return cfg.prodDb.hostnames.some(n => host.includes(n.toLowerCase()));
}

const nameIn = (list, v) => !!v && list.map(x => x.toLowerCase()).includes(String(v).trim().toLowerCase());
const isProdDatabase = (name, cfg) => nameIn((cfg || load()).prodDb.databases, name);
const isProdLogin = (user, cfg) => nameIn((cfg || load()).prodDb.logins, user);

module.exports = { KIT, load, khopChan, hostOf, isProdHost, isProdDatabase, isProdLogin };
