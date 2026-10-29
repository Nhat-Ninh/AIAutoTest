# EasyPOS tester kit — kiểm thử tự động EasyPOS cùng Claude

Claude đọc code, viết testcase, viết kịch bản Playwright, chạy trên **DEV trước, UAT sau** (project `dev`, `uat`) bằng thao tác người dùng, tra CSDL (chỉ đọc) rồi viết
báo cáo + lỗi theo mẫu Jira (`EPB-…`). Hook chặn nối CSDL trực tiếp, gọi prod và lộ mật khẩu.

> **Trạng thái:** bản khung đã đổi sang EasyPOS (đã đọc `application*.yml`, gateway, frontend). Còn thiếu thông tin môi trường —
> xem [tai-lieu/EASYPOS-BAN-DO.md](tai-lieu/EASYPOS-BAN-DO.md) mục 8 và làm theo
> [tai-lieu/HUONG-DAN-AP-DUNG-EASYPOS.md](tai-lieu/HUONG-DAN-AP-DUNG-EASYPOS.md). Tester đọc [tai-lieu/HUONG-DAN-TESTER.md](tai-lieu/HUONG-DAN-TESTER.md).

## Cấu trúc

| Thư mục / tệp | Việc |
|---|---|
| `config/moi-truong.json` | Môi trường (web, API, CSDL), cách đăng nhập EasyPOS, danh sách PROD bị chặn (`prodChan`, `prodDb`) |
| `config/tai-khoan.example.json` | Mẫu tài khoản. Tài khoản thật: `~/.easypos-tester/tai-khoan.json` (tự gõ, ngoài repo) |
| `e2e/` | Playwright: `lib/fixtures.ts` (đăng nhập, chặn prod), `tests/` (kịch bản) |
| `hooks/` | `guard-easypos.js` (hook chặn) + `guard-easypos.test.js` (bộ thử), `prod-config.js` (danh sách prod dùng chung), `session-rules.js` (nạp luật) |
| `rules/RULES.md` | Luật làm việc + quy trình 7 bước |
| `mau-bao-cao/` | Mẫu báo cáo từng bước 00 → 06 |
| `tools/tester/` | `dbq.js` (đọc CSDL, chỉ SELECT), `bb.js` (đọc Bitbucket project EPOS; khi bật Code-Insight thì dùng tool MCP thay thế), `code-insight-cai.js` / `code-insight-header.js` (nối cổng đọc mã cho máy tester), `kiem-trinh-duyet.js` |
| `CAI-CODE-INSIGHT.cmd` | Bấm đúp để cài / kiểm cổng Code-Insight trên máy tester (tự kiểm, tự nối cấu hình, báo OK / cảnh báo / lỗi + việc cần làm) |
| `tools/code-insight/` | Code-Insight: cổng MCP + worker + bộ lọc để tester dùng AI phân tích mã nguồn mà KHÔNG có quyền Bitbucket (bản tóm tắt, không mã nguyên văn). Hướng dẫn admin: `tai-lieu/HUONG-DAN-AP-DUNG-EASYPOS.md` mục D15. Mặc định TẮT (`config/code-insight.json`) |
| `tools/jira/jira.js` | Đọc ticket Jira |
| `kien-thuc/` + `tools/tester/bai-hoc.js` | **Kho bài học chung** (bẫy kỹ thuật, sự thật môi trường, lỗi đã biết, nghiệp vụ): Claude tra trước khi làm, đề xuất bài mới sau khi làm (Bước 6c) — kit càng test càng khôn. Xem `kien-thuc/README.md` |
| `tools/tester/dong-bo.js` + `config/dong-bo.json` | **Tự đồng bộ kit với nhánh `main`**, không conflict (sao lưu rồi đưa về main khi có gì lạ), cổng "kit phải mới" trước mỗi lượt chạy test, gửi bài học lên kho chung; tester không dùng git. Máy người phụ trách đặt vai trò `phu-trach` để không bao giờ bị ghi đè |
| `tools/ci/nhan-bai-hoc.js` + `.github/workflows/nhan-bai-hoc.yml` | **Máy chủ nhận bài học**: kiểm lại rồi tự gộp vào `main` bằng commit của bot (chỉ thêm tệp bài mới). Cần thiết lập GitHub một lần — `tai-lieu/HUONG-DAN-AP-DUNG-EASYPOS.md` mục D13 |
| `tools/tester/uoc-token.js` | **Đo token THẬT** của một phiên Claude Code, chia theo từng lượt giao việc (token mới / đọc lại / ra, % cửa sổ ngữ cảnh) — để biết kiểm thử một chức năng tốn bao nhiêu và so trước / sau khi tối ưu |
| `e2e/lib/` | Thư viện dùng chung cho kịch bản (đăng nhập, API, giao diện, sinh mã `AUTO_`, sản phẩm); test gắn nhãn `@smoke @api @ui @regression` |
| `rules/` | `RULES.md` (luật luôn nạp, ngắn) · `QUY-TRINH.md` (chi tiết 7 bước, đọc một lần khi bắt đầu một chức năng) · `KY-THUAT-TESTCASE.md` (kỹ thuật sinh testcase chặt chẽ, đọc một lần ở Bước 2) · Bước P: trình Plan trước Bước 0 |
| `tools/jira/jira-tao.js` + `config/jira.json` | **Tạo ticket Bug** từ nháp đã duyệt (xem trước / `--tao`), đính kèm, chống trùng, in link; tester chỉ bấm Assign |
| `tools/confluence/confluence.js` | **Đọc tài liệu nghiệp vụ** từ Confluence → markdown có phiên bản (`tim`, `trang`, `con`, `dinh-kem`, `lien-ket`); loại kiểm thử "kỹ thuật" không cần |
| `tools/lib/atlassian.js` | Phần dùng chung: nạp token (PAT), gọi REST, quét bí mật |
| `tools/install/` | Bộ cài / cập nhật (`CAI-DAT.cmd`, `CAP-NHAT.cmd`, `GO-CAI-DAT.cmd`) |
| `KIEM-TRA-MAY.cmd` + `tools/tester/kiem-tra-may.js` | **Bác sĩ máy**: kiểm cài đặt, VPN, tài khoản, CSDL, trình duyệt, hook và chỉ cách sửa (`--sau` = thử đăng nhập thật) |
| `tai-lieu/` | Bản đồ hệ thống EasyPOS, hướng dẫn leader, hướng dẫn tester |

## Dùng nhanh
1. Cần Node.js 18+, Git, VS Code + extension Claude Code, VPN công ty.
2. `node hooks/guard-easypos.test.js` — phải báo `N/N ca đúng`.
3. Bấm `CAI-DAT.cmd` → mở VS Code, Reload Window, mở cuộc trò chuyện Claude **mới**.
   Điền tài khoản rồi **bấm `KIEM-TRA-MAY.cmd`** (và `KIEM-TRA-MAY.cmd --sau`) — phải "máy sẵn sàng" mới giao việc cho Claude.
4. Tự gõ tài khoản vào `~/.easypos-tester/tai-khoan.json`. Không bao giờ dán mật khẩu vào chat Claude.
5. Mỗi máy chỉ cài **một** bộ kit.
