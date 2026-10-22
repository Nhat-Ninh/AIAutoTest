# Kiểm thử một chức năng EasyPOS cùng Claude (hướng dẫn cho tester)

Bạn đưa tệp testcase / mã Jira (`EPB-…`) / tên chức năng. Claude đọc code, viết testcase, viết kịch bản Playwright, chạy trên **dev** (UAT nếu bạn muốn) như người dùng, tra CSDL (chỉ đọc) và viết báo cáo. Hết mỗi bước Claude dừng chờ bạn **Duyệt / Sửa lại / Dừng**.

## 1. Cài lần đầu
1. Cài VS Code, extension **Claude Code**, **Git**, **Node.js 18+** (LTS), bật **VPN** công ty.
2. Lấy bộ kit: mở `cmd` rồi `git clone <link repo easypos-tester-kit> C:\easypos-tester` (hỏi người phụ trách link và xin quyền đọc repo).
3. Bấm đúp `C:\easypos-tester\CAI-DAT.cmd`. Dòng cuối của bộ thử hook phải là `N/N ca đúng`.
4. VS Code: File → Open Workspace/Folder → `C:\easypos-tester`; `Ctrl+Shift+P` → **Developer: Reload Window**; mở cuộc trò chuyện Claude **mới**.
5. **Tài khoản (tự làm):** mở `C:\Users\<bạn>\.easypos-tester\tai-khoan.json`, điền **cả `dev` và `uat`**: `web` (tài khoản EasyPOS dữ liệu giả, tắt OTP) và `db` (CSDL chỉ-đọc). **Không dán mật khẩu vào chat.**
6. Kiểm: hỏi Claude *"EP_KIT ở đâu, có những luật gì"* — phải ra đường dẫn kit và danh sách luật.

Cập nhật bộ kit: bấm `CAP-NHAT.cmd` (đừng bấm khi Claude đang chạy test).

## 2. Giao việc cho Claude
Một tin nhắn nên có: **môi trường**, **tài khoản + công ty**, **tài liệu (tệp / Jira / Confluence)**, **cách kiểm**.
```
Môi trường: dev (EasyPOS)   ← mặc định; đạt rồi mới nhờ Claude "chạy lại trên uat"
Tài khoản: khoá dev trong tai-khoan.json (mật khẩu tôi đã tự điền)
Chức năng: Tạo đơn hàng tại quầy (màn hình pos)
Tài liệu: Jira EPB-12345, tệp C:\Users\<tên bạn>\Downloads\Testcase_POS.xlsx
Cách kiểm: Playwright cả giao diện (chụp ảnh) lẫn API, rồi tra CSDL chỉ-đọc đối chiếu.
```
- **Gửi tệp:** chuột phải tệp → *Copy as path* → dán đường dẫn vào tin nhắn.
- **Jira:** gửi mã `EPB-…`; Claude đọc bằng công cụ của bộ kit (cần PAT trong `~/.easypos-tester/jira.properties`; không có thì dán nội dung ticket vào chat).
- **Dev là mặc định, UAT là tùy chọn của bạn:** kiểm thử chức năng trên `dev`. Khi xong, Claude sẽ **hỏi**: *"Có muốn chạy lại trên UAT (https://uat.easypos.vn) không?"* — chọn **Có** thì Claude chạy lại cùng bộ kịch bản trên UAT; **Không / Để sau** thì kết thúc ở dev. Cần chạy UAT ngay giữa chừng thì nhắn *"chạy lại cùng bộ kịch bản trên uat"*. Muốn dùng UAT bạn phải điền khối `uat` trong `tai-khoan.json` (tài khoản web UAT + CSDL UAT). Lỗi chỉ xảy ra trên dev thì ghi rõ môi trường; trên dev nếu thấy lỗi chập chờn, nhờ Claude chạy lại và phân loại "lỗi môi trường" trước khi báo lỗi phần mềm (dev đang sửa code liên tục).
- **Làm từng phần nhỏ:** mỗi lần một nhóm chức năng (vd *mở ca*, rồi *tạo đơn*), đừng cả module một lúc.
- **Chạy song song:** mở nhiều cuộc trò chuyện, mỗi cái một chức năng; hai phiên chạy test cùng lúc nên dùng **công ty test khác nhau**. Ca ảnh hưởng cả công ty (khoá sổ, đóng ca…) chạy riêng.
- **Hết lượt dùng giữa chừng:** `/login` để đổi tài khoản Claude rồi nhắn *"đọc bao-cao\<thư mục> và làm tiếp từ bước <số>"* — mọi việc đã làm nằm trong các tệp báo cáo.

## 3. Bảy bước và lúc bạn bấm Duyệt

| Bước | Claude làm | Bạn chọn |
|---|---|---|
| 0 · Phạm vi | Hỏi 3 câu | UI / API / cả hai · từ code / tài liệu · nhanh / đầy đủ |
| 1 · Phân tích | Đọc code theo luồng (FE → gateway → service), đối chiếu tài liệu | Chấm theo tệp, theo code, hay cả hai |
| 2 · Testcase | Mã TC-FE / TC-BE, ưu tiên, dữ liệu mong đợi | Duyệt hoặc sửa |
| 3 · Kịch bản | Viết kịch bản Playwright, dữ liệu tên `AUTO_…` | Chạy ở đâu · giữ dữ liệu để tra CSDL hay không |
| 4 · Chạy | Thao tác như người dùng, chụp ảnh | Có thể hỏi "chạy tới đâu rồi" |
| 5 · Kiểm dữ liệu | Tra CSDL (chỉ đọc) | Dọn dữ liệu `AUTO_` ngay hay giữ lại |
| 6 · Tổng kết | Bảng testcase, lỗi theo mẫu Jira, việc test tay | Chốt báo cáo |

## 4. Đọc báo cáo
Mở `bao-cao\<ngày>_<chức năng>\06-tong-ket.md` trước. Mỗi testcase là một trong bốn loại:
✅ Đạt (chạy thật + CSDL đúng) · ❌ Không đạt (lỗi phần mềm, có bằng chứng) · ⚠️ Cần BA chốt (hành vi đúng nhưng khác tài liệu) · ⏸ Chưa chạy (test tay / môi trường chưa cho — không bao giờ tính là đạt).

## 5. Ghi lỗi lên Jira
Claude soạn **nháp** từng lỗi (tiêu đề, bước tái hiện, thực tế / mong đợi, môi trường, ảnh) cho bạn duyệt. Bạn tạo ticket (hoặc duyệt cho Claude tạo từng cái). Không đưa mật khẩu vào ticket.

## 6. Những việc KHÔNG làm
- Không dán mật khẩu vào chat. Không nhờ Claude đọc / ghi `tai-khoan.json`.
- Không test trên PROD (`easypos.vn`, `easyposs.vn`…). Không bật `EP_CHO_PHEP_PROD`.
- Không bấm `CAP-NHAT.cmd` khi Claude đang chạy test. Không xoá tay dữ liệu `AUTO_…` trước khi Claude đối chiếu xong.
- Hook chặn một lệnh thì Claude dừng và báo. **Đừng tìm cách lách** — hỏi người phụ trách bộ kit.
