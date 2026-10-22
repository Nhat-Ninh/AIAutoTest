/* Bộ thử bộ chuyển đổi Confluence (XHTML lưu trữ → markdown). Không cần mạng.   Chạy: node tools/confluence/confluence.test.js */
'use strict';
const assert = require('assert');
const { xhtmlSangMd } = require('./confluence.js');

let sai = 0, tong = 0;
function thu(ten, html, kiemTra) {
  tong++;
  try { const kq = xhtmlSangMd(html); kiemTra(kq.md, kq); console.log('ĐÚNG ' + ten); }
  catch (e) { sai++; console.log('SAI  ' + ten + ' — ' + e.message.split('\n')[0]); }
}
const co = (md, s) => assert.ok(md.includes(s), 'thiếu "' + s + '" trong:\n' + md);

thu('tiêu đề + đoạn + nhấn mạnh', '<h2>1. Tổng quan</h2><p>Chức năng <strong>tạo sản phẩm</strong> và <em>sửa</em>.</p>', md => { co(md, '## 1. Tổng quan'); co(md, '**tạo sản phẩm**'); co(md, '_sửa_'); });
thu('mã hoá ký tự (&amp; &nbsp; số)', '<p>A &amp; B&nbsp;C &#8211; D</p>', md => { co(md, 'A & B C – D'); });
thu('danh sách lồng nhau', '<ul><li>Mục 1<ul><li>Con 1.1</li></ul></li><li>Mục 2</li></ul>', md => { co(md, '- Mục 1'); co(md, '  - Con 1.1'); co(md, '- Mục 2'); });
thu('danh sách đánh số', '<ol><li>Bước một</li><li>Bước hai</li></ol>', md => { co(md, '1. Bước một'); co(md, '2. Bước hai'); });
thu('bảng', '<table><tbody><tr><th>Mã</th><th>Tên</th></tr><tr><td>US-01</td><td>Quét <strong>mã vạch</strong></td></tr></tbody></table>', md => { co(md, '| Mã | Tên |'); co(md, '| --- | --- |'); co(md, '| US-01 | Quét **mã vạch** |'); });
thu('bảng có ô trống và dấu |', '<table><tr><th>A</th><th>B</th></tr><tr><td>x|y</td><td></td></tr></table>', md => { co(md, 'x\\|y'); });
thu('macro code (CDATA)', '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[{"a": 1 < 2}]]></ac:plain-text-body></ac:structured-macro>', md => { co(md, '```json'); co(md, '{"a": 1 < 2}'); });
thu('khung info / warning', '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Chỉ áp dụng bán lẻ.</p></ac:rich-text-body></ac:structured-macro><ac:structured-macro ac:name="warning"><ac:rich-text-body><p>Không xoá.</p></ac:rich-text-body></ac:structured-macro>', md => { co(md, '> **Thông tin:** Chỉ áp dụng bán lẻ.'); co(md, '> **Cảnh báo:** Không xoá.'); });
thu('macro Jira ghi nhận mã', '<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">EPB-123</ac:parameter></ac:structured-macro>', (md, kq) => { co(md, '[Jira: EPB-123]'); assert.ok(kq.jira.has('EPB-123')); });
thu('ảnh đính kèm được ghi nhận', '<p><ac:image><ri:attachment ri:filename="man-hinh.png" /></ac:image></p>', (md, kq) => { co(md, '![ảnh: man-hinh.png](anh/man-hinh.png)'); assert.ok(kq.anh.has('man-hinh.png')); });
thu('liên kết tới trang khác', '<p>Xem <ac:link><ri:page ri:content-title="Quy tắc giá" /><ac:plain-text-link-body><![CDATA[bảng giá]]></ac:plain-text-link-body></ac:link>.</p>', (md, kq) => { co(md, '[bảng giá](Confluence: Quy tắc giá)'); assert.ok(kq.trang.has('Quy tắc giá')); });
thu('liên kết web', '<p><a href="https://example.com/x">tài liệu</a></p>', md => { co(md, '[tài liệu](https://example.com/x)'); });
thu('danh sách việc (task)', '<ac:task-list><ac:task><ac:task-status>complete</ac:task-status><ac:task-body>Xong</ac:task-body></ac:task><ac:task><ac:task-status>incomplete</ac:task-status><ac:task-body>Chưa</ac:task-body></ac:task></ac:task-list>', md => { co(md, '- [x] Xong'); co(md, '- [ ] Chưa'); });
thu('macro expand giữ nội dung', '<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">Chi tiết</ac:parameter><ac:rich-text-body><p>Nội dung ẩn.</p></ac:rich-text-body></ac:structured-macro>', md => { co(md, '**Chi tiết**'); co(md, 'Nội dung ẩn.'); });
thu('macro mục lục bị bỏ, macro lạ để lại dấu vết', '<ac:structured-macro ac:name="toc" /><p>A</p><ac:structured-macro ac:name="la-hoc" />', md => { assert.ok(!md.includes('toc')); co(md, '[macro la-hoc]'); });
thu('sơ đồ được cảnh báo', '<ac:structured-macro ac:name="drawio"><ac:parameter ac:name="diagramName">luong-ban</ac:parameter></ac:structured-macro>', (md, kq) => { co(md, 'Sơ đồ drawio'); assert.strictEqual(kq.sodo.length, 1); });
thu('thẻ bị đóng thiếu không làm hỏng', '<p>Một<p>Hai', md => { co(md, 'Một'); co(md, 'Hai'); });
thu('nội dung rỗng', '', md => { assert.strictEqual(md, ''); });

console.log('\n' + (tong - sai) + '/' + tong + ' ca đúng');
process.exit(sai ? 1 : 0);
