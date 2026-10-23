# Sự thật về môi trường (dev / UAT, tài khoản, hệ thống ngoài) — có ngày xác nhận, môi trường đổi thì kiểm lại

## BH-008 | tags: nhanh, bitbucket, dev | Dev (8082) chạy nhánh dev của mọi repo EPOS, riêng invoice-service dùng dev_ei / dev_vte / dev_ngp
- Nội dung: Đọc code để đối chiếu với dev phải đọc nhánh `dev` (bb.js tự mặc định). `invoice-service` không có nhánh `dev`: có `dev_ei`, `dev_vte`, `dev_ngp` theo nhà cung cấp hoá đơn — hỏi tester đang test nhà cung cấp nào. UAT: nhánh chưa xác định.
- Bằng chứng: người phụ trách xác nhận 2026-10-23; `bb.js nhanh invoice-service dev` chỉ thấy dev_ei, dev_vte, dev_ngp
- Xác nhận: 2026-10-23 · dev · bitbucket EPOS
- Trạng thái: da-xac-nhan
- Áp dụng: bb.js, Bước 1 phân tích

## BH-009 | tags: cong-ty, ca, quyen, dev | Công ty 9839 "Cửa hàng test Imei" trên dev: tài khoản test KHÔNG có quyền quản lý ca
- Nội dung: Đăng nhập vào 9839 thì `phien.shiftManagement=false` nên kịch bản mở/đóng ca bị bỏ qua. Muốn test ca: chọn công ty đã cấp quyền "mở ca" cho tài khoản (đặt `EP_CONGTY_DEV=<id>`), hoặc xin cấp quyền ở màn "Quyền mở ca".
- Bằng chứng: lab 2026-10-23 (phien = comId 9839, shiftManagement false); báo cáo 2026-10-22_mo-dong-ca
- Xác nhận: 2026-10-23 · dev · công ty 9839
- Trạng thái: da-xac-nhan
- Áp dụng: kịch bản mở/đóng ca

## BH-010 | tags: jira, epb, component, loai-phieu | Jira EPB: không có component; loại tạo được là Bug (ticket tay của nhóm có thể là TechDebt)
- Nội dung: Project EPB có 0 component nên nháp có `components:` bị Jira từ chối (công cụ nay kiểm trước ở bước xem trước). `config/jira.json` chỉ cho tạo loại Bug; ticket tay EPB-24095 là loại TechDebt, nhãn "Product, auto". Cần hỏi nhóm nếu muốn tạo loại khác.
- Bằng chứng: lần tạo ticket thử 2026-10-23 báo HTTP 400 "Component name 'Sản phẩm' is not valid"; ticket thử EPB-24198 tạo được sau khi bỏ components
- Xác nhận: 2026-10-23 · jira EPB
- Trạng thái: da-xac-nhan
- Áp dụng: jira-tao.js, nháp ticket

## BH-011 | tags: bitbucket, git, tai-khoan | bb.js dùng tài khoản Bitbucket riêng — tài khoản GitHub và token Jira không dùng được
- Nội dung: Git lưu mật khẩu theo từng máy chủ. Muốn bb.js đọc được code: đăng nhập Git một lần tới `git-sds.softdreams.vn:7990` (lệnh `git ls-remote …` ở HUONG-DAN-TESTER mục 6.5) hoặc điền token Bitbucket chỉ-đọc. Thiếu thì KIEM-TRA-MAY mục 8c báo cảnh báo.
- Bằng chứng: tools/tester/bb.js (taiKhoan); tai-lieu/HUONG-DAN-TESTER.md mục 6.5
- Xác nhận: 2026-10-23 · máy tester · bitbucket
- Trạng thái: nghi-ngo
- Áp dụng: tester mới (chưa thử trên máy chưa đăng nhập Bitbucket)

## BH-012 | tags: ffmpeg, video, cai-dat | Thiếu ffmpeg của Playwright thì tắt video để test vẫn chạy
- Nội dung: Máy tester chưa tải ffmpeg (`npx playwright install ffmpeg`) làm test lỗi ngay khi bật quay video. Cấu hình nay tự tắt video nếu thiếu (cảnh báo `[kit]`); cài ffmpeg nếu muốn video khi trượt.
- Bằng chứng: e2e/playwright.config.ts (coFfmpeg); CAI-DAT.cmd; sự cố máy tester 2026-10-22
- Xác nhận: 2026-10-22 · máy tester · playwright@1.55.0
- Trạng thái: da-xac-nhan
- Áp dụng: máy tester mới
