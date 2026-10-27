#!/usr/bin/env node
/* dung-chi-muc.js — dựng chỉ mục n-gram của MỘT bản chụp mã nguồn rồi lưu ra tệp (cổng gọi tiến trình này để khỏi chặn vòng lặp sự kiện;
 * quản trị cũng chạy tay được sau khi xuất bản chụp):  node dung-chi-muc.js <thư-mục-bản-chụp> <tệp-ra.idx> [n] */
'use strict';
const CM = require('./chi-muc');
const [, , thuMuc, tepRa, n] = process.argv;
if (!thuMuc || !tepRa) { console.error('Cách dùng: node dung-chi-muc.js <thư-mục-bản-chụp> <tệp-ra.idx> [n]'); process.exit(2); }
// Chỉ ghi tệp .idx (đối số này do cổng truyền; không để công cụ này thành đường ghi đè tệp tuỳ ý).
if (!/\.idx$/i.test(tepRa)) { console.error('Tệp ra phải có đuôi .idx'); process.exit(2); }
const cm = CM.dung(thuMuc, { n: parseInt(n, 10) || CM.N_MAC_DINH });
CM.luu(cm, tepRa);
console.log('Đã dựng chỉ mục: ' + cm.kichThuoc + ' cửa sổ, ' + cm.thongKe.soTep + ' tệp, ' + cm.thongKe.tongByte + ' byte' + (cm.thongKe.catBot ? ' (CẮT BỚT do vượt giới hạn tổng)' : ''));
