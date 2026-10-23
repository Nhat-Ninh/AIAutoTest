# Bẫy kỹ thuật (API, giao diện, công cụ) — mỗi bài đã gặp thật

## BH-001 | tags: san-pham, api, danh-sach | Kiểm sản phẩm vừa tạo phải dùng category-get-with-paging (API của màn quản lý)
- Nội dung: Màn QUẢN LÝ sản phẩm dùng `client/page/product/category-get-with-paging` (tham số `keyword` tìm theo tên / mã). `get-with-paging` là API của màn BÁN HÀNG nên không thấy sản phẩm mới tạo. Mã hiển thị là trường `code2`.
- Bằng chứng: e2e/lib/san-pham.ts (dsTheoTuKhoa); báo cáo 2026-10-22_tao-san-pham/04-ket-qua-dev.md
- Xác nhận: 2026-10-22 · dev · easypos-product-material@dev
- Trạng thái: da-xac-nhan
- Áp dụng: easypos-product-material, màn Quản lý sản phẩm

## BH-002 | tags: san-pham, api, multipart | Tạo sản phẩm bằng form nhiều phần (multipart) tới product/create1, không phải JSON
- Nội dung: `POST client/page/product/create1` nhận `multipart` (mọi trường là chuỗi, kèm `comId`). Gửi JSON sẽ không đúng. Hàm dùng lại: `taoSP()` trong e2e/lib/san-pham.ts.
- Bằng chứng: e2e/lib/san-pham.ts; e2e/tests/tao-san-pham/tao-san-pham.spec.ts (TC-BE-001)
- Xác nhận: 2026-10-22 · dev · easypos-product-material@dev
- Trạng thái: da-xac-nhan
- Áp dụng: easypos-product-material

## BH-003 | tags: dang-nhap, api, cong-ty | Đăng nhập API EasyPOS gồm 2 bước: authenticate → chọn công ty → id_token
- Nội dung: `POST client/common/authenticate` (user + mật khẩu) trả `data.companies`; gửi lại kèm `companyId` mới được `data.id_token`. Mọi kết quả bọc trong `data`. Tài khoản nhiều công ty: chọn bằng `EP_CONGTY_<ENV>` hoặc `tester.json → congTy`; không chọn thì lấy công ty đầu (dễ test nhầm chi nhánh).
- Bằng chứng: e2e/lib/fixtures.ts (fixture api, chonOrg); tests/_kiem-moi-truong
- Xác nhận: 2026-10-22 · dev · easyposbackend@dev
- Trạng thái: da-xac-nhan
- Áp dụng: mọi kịch bản có `api`

## BH-004 | tags: dang-nhap, ui, ng-select | Đăng nhập giao diện nhiều công ty: chọn đúng công ty và đợi danh sách đóng rồi mới bấm Đăng nhập
- Nội dung: Sau bước tên + mật khẩu hiện ô chọn công ty `#companyId` (ng-select). Phải gõ tên công ty, chọn đúng dòng, đợi `.ng-dropdown-panel` biến mất rồi mới bấm Đăng nhập; bấm khi danh sách còn mở chỉ đóng danh sách. Fixture `dangNhapUI` đã làm sẵn — đừng viết lại trong kịch bản.
- Bằng chứng: e2e/lib/fixtures.ts (dangNhapUI); chạy lại 2026-10-23 có thêm chẩn đoán API lỗi
- Xác nhận: 2026-10-23 · dev · easypos-frontend@dev
- Trạng thái: da-xac-nhan
- Áp dụng: mọi kịch bản có `dangNhapUI`

## BH-005 | tags: ca, shift, api | API mở / đóng ca và điều kiện để test được
- Nội dung: `client/page/shift/open`, `close`, `check-open`; danh sách `shift/get-with-paging`. Mỗi người dùng chỉ một ca mở. Chỉ tài khoản có quyền quản lý ca (`shiftManagement=true`, bảng company_user) mới mở được — thiếu quyền thì test bỏ qua (lý do môi trường). Ca do test tạo có mô tả `AUTO_mo-dong-ca`.
- Bằng chứng: báo cáo 2026-10-22_mo-dong-ca (máy người chạy); e2e/tests/mo-dong-ca/mo-dong-ca.spec.ts
- Xác nhận: 2026-10-22 · dev · easyposbackend@dev
- Trạng thái: da-xac-nhan
- Áp dụng: easyposbackend, màn Ca làm việc

## BH-006 | tags: playwright, bao-cao, reporter | Truyền --reporter trên dòng lệnh sẽ mất tệp kết quả JSON/HTML
- Nội dung: Cấu hình đã có list + html + json (đường dẫn qua `EP_JSON`, `EP_HTML`). Thêm `--reporter=line` (hay bất kỳ) ghi đè cả ba nên không có tệp kết quả. Muốn tệp kết quả thì đừng truyền `--reporter`.
- Bằng chứng: lab 2026-10-23: chạy có --reporter=line, tệp EP_JSON không được tạo; e2e/playwright.config.ts
- Xác nhận: 2026-10-23 · máy tester · playwright@1.55.0
- Trạng thái: da-xac-nhan
- Áp dụng: lệnh chạy test

## BH-007 | tags: hook, dbq, duong-dan | Gọi dbq.js bằng đường dẫn tuyệt đối thì hook mới cho qua
- Nội dung: Hook chỉ tin lệnh có dạng `node "<đường dẫn tuyệt đối tới kit>/tools/tester/dbq.js" <dev|uat> …`; đường dẫn tương đối bị chặn. Cũng không đưa tên tệp mật khẩu cá nhân vào lệnh shell (hook chặn); viết script dùng placeholder.
- Bằng chứng: hooks/guard-easypos.js; hooks/guard-easypos.test.js (121 ca)
- Xác nhận: 2026-10-22 · máy tester · kit
- Trạng thái: da-xac-nhan
- Áp dụng: Claude khi gọi công cụ kit

## BH-015 | tags: playwright, worker, trang-thai, toi-uu | Playwright khởi động lại tiến trình sau mỗi test trượt — biến trong bộ nhớ không sống qua các test
- Nội dung: Sau khi một test trượt, Playwright dùng tiến trình worker mới nên biến cấp module (phiên đăng nhập API, cờ "đăng nhập giao diện hỏng") bị mất. Muốn nhớ giữa các worker trong CÙNG lần chạy: ghi tệp tạm đặt tên theo `process.ppid` (tiến trình cha chung) và chỉ chứa thông tin không nhạy cảm; token / mật khẩu thì không ghi ra tệp, chấp nhận đăng nhập lại mỗi worker.
- Bằng chứng: lab 2026-10-23: 10 lần đăng nhập API còn 3 (mỗi worker một lần); chạy 187 giây còn 44 giây nhờ cờ ui-hong theo ppid; e2e/lib/fixtures.ts
- Xác nhận: 2026-10-23 · dev · playwright@1.55.0
- Trạng thái: da-xac-nhan
- Áp dụng: e2e/lib/fixtures.ts, kịch bản mới cần nhớ trạng thái giữa các test

## BH-016 | tags: cong-cu, shell, dau-gach-cheo, sua-ma | Chèn mã có dấu \ (regex, \n) vào tệp qua shell / heredoc dễ bị hỏng — dùng Edit / Write
- Nội dung: Khi sửa tệp mã bằng script nhúng trong lệnh shell (heredoc, chuỗi JS lồng), dấu `\` trong regex hoặc `\n` bị nuốt hoặc đổi thành xuống dòng thật, sinh lỗi cú pháp hoặc quy tắc chạy sai nhưng không báo (vd hook không hỏi vì regex mất `\s`). Dùng công cụ Edit / Write cho thay đổi có `\`; sau đó LUÔN chạy `node --check <tệp>` và bộ thử của tệp (hook: `node hooks/guard-easypos.test.js`).
- Bằng chứng: gặp 4 lần ngày 2026-10-22 / 23: confluence.js, guard-easypos.js (2 chỗ), session-rules.js; bộ thử hook báo SAI ở ca bai-hoc.js them --ghi
- Xác nhận: 2026-10-23 · máy tester · node@24
- Trạng thái: da-xac-nhan
- Áp dụng: mọi lần Claude sửa tệp công cụ / hook

## BH-017 | tags: playwright, serial, timeout, dev | Nhóm test tuần tự (serial): một test hết hạn chờ làm MỌI test sau không chạy
- Nội dung: Spec dùng `test.describe.configure({ mode: 'serial' })` (tao-san-pham, mo-dong-ca) — một test trượt hoặc hết hạn chờ thì các test còn lại của nhóm hiển thị "did not run". Dev dùng chung có lúc chậm làm `api.get` quá 15 giây (hạn mặc định) ngay ở bước kiểm điều kiện. Cách giảm: đặt hạn chờ riêng 45 giây cho lời gọi kiểm điều kiện (đã làm ở `dieuKienSanPham`); khi thấy nhiều "did not run", tìm test trượt ĐẦU TIÊN và chạy lại riêng spec trước khi kết luận.
- Bằng chứng: lab 2026-10-23: tao-san-pham TC-BE-004 timeout 15s ⇒ 10 test did not run; chạy lại riêng cùng spec: 12 đạt, 2 bỏ qua (84 giây); e2e/lib/san-pham.ts
- Xác nhận: 2026-10-23 · dev · playwright@1.55.0
- Trạng thái: da-xac-nhan
- Áp dụng: kịch bản dùng serial

## BH-018 | tags: ui, hop-thoai, huong-dan, dong-hop-thoai | Hộp "Hướng dẫn sử dụng" hiện TRỄ sau đăng nhập — phải chờ ~2 giây mới chắc là không có
- Nội dung: Sau khi trang tải xong, hộp `.modal.show` có chữ "Hướng dẫn sử dụng" vẫn có thể hiện ra muộn và che mọi nút. Hàm dùng chung `dongHopThoai(page)` trong `e2e/lib/ui.ts` đã chờ tới khi 3 lần liên tiếp không thấy hộp nào rồi mới thôi (cộng cả swal2 / nút Đóng). Đừng tự viết lại ở từng spec.
- Bằng chứng: e2e/lib/ui.ts; hai spec icheck và loi-nhuan từng có bản riêng cùng lý do (đã gộp 2026-10-23); lab 2026-10-23 giao diện đạt
- Xác nhận: 2026-10-23 · dev · easypos-frontend@dev
- Trạng thái: da-xac-nhan
- Áp dụng: mọi kịch bản giao diện sau đăng nhập
