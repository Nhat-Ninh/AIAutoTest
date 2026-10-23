# Kho bài học chung của bộ kit (`kien-thuc/`)

Mỗi lần kiểm thử xong, điều học được được ghi vào đây để **lần sau kit khôn hơn**: Claude tra kho trước khi bắt đầu, không phải khám phá lại bẫy cũ. Công cụ: `node tools/tester/bai-hoc.js`. **Tester không cần biết git** — việc gửi / nhận bài tự động (xem "Luồng tự động" bên dưới).

## Quy tắc vàng
1. **Tra, đừng đọc cả kho:** `bai-hoc.js tim <từ khoá>` trả tối đa 8 bài khớp nhất (~vài trăm token). Không mở cả thư mục.
2. **Chỉ ghi điều có bằng chứng** từ lần chạy thật (báo cáo, ticket, commit, tệp:dòng). Không ghi đoán mò — nếu chưa chắc, trạng thái `nghi-ngo`.
3. **Mỗi bài một ý, ngắn** (≤ 12 dòng / 1200 ký tự). Dài quá thì tách bài.
4. **Không bí mật:** không mật khẩu, token, dữ liệu khách thật. Công cụ ở máy tester VÀ máy chủ đều tự quét và từ chối.
5. **Bài hết đúng không xoá**: người phụ trách đổi `Trạng thái: het-han` (còn dấu vết vì sao). Bài cũ quá 60 ngày: `bai-hoc.js cu`.

## Cấu trúc
| Nơi | Ai ghi | Nội dung |
|---|---|---|
| `bay-ky-thuat.md`, `moi-truong.md`, `loi-da-biet.md`, `nghiep-vu/*.md` | người phụ trách (bài gộp, mã `BH-001`…) | bài cũ |
| `bai/<yyyy-mm>/BH-<ngày>-<xxxx>.md` | **bot nhận bài** (từ tester) | **mỗi bài một tệp**, mã gồm ngày + 4 ký tự ngẫu nhiên ⇒ hai tester thêm bài cùng lúc không bao giờ đụng nhau, không có xung đột |
| `INDEX.md` | tự sinh trên từng máy (`muc-luc --ghi`), **không nằm trong git** | mục lục |

Nhóm (`nhom:`): `ky-thuat` (bẫy API / giao diện / công cụ) · `moi-truong` (sự thật về dev / UAT / quyền / hệ thống ngoài, có ngày xác nhận) · `loi` (lỗi đã gặp — tra trước khi báo, tránh báo trùng) · `nghiep-vu` (quy tắc đã chốt, kèm trang Confluence › mục + phiên bản; cần `chuc-nang:`).

## Định dạng một bài (nháp Claude soạn)
```
## MỚI | nhom: ky-thuat | tags: san-pham, api | Tiêu đề ngắn nói rõ điều cần nhớ
- Nội dung: điều cần nhớ, viết sao cho người chưa biết gì đọc cũng làm đúng được.
- Bằng chứng: báo cáo / ticket / commit / tệp:dòng chứng minh.
- Xác nhận: 2026-10-22 · dev · easyposbackend@dev      (ngày · môi trường · nhánh hoặc commit)
- Trạng thái: da-xac-nhan | nghi-ngo | het-han
- Áp dụng: (tuỳ chọn) repo / màn hình / chức năng
```
`tags` viết không dấu, ngăn cách bằng dấu phẩy; chọn từ khoá mà người sau sẽ gõ khi tra (`san-pham`, `ca`, `dang-nhap`, `jira`…). Công cụ cấp mã `BH-<ngày>-<xxxx>`.

## Luồng tự động (tester chỉ bấm Duyệt trong chat và Cho phép khi hook hỏi)
1. **Claude soạn nháp** `bao-cao/<ngày>_<chức năng>/07-bai-hoc-nhap.md` (Bước 6c; mẫu `mau-bao-cao/07-bai-hoc-nhap.md`).
2. `bai-hoc.js them <nháp>` — xem trước: báo thiếu bằng chứng / quá dài / trùng / **bí mật**.
3. **Tester duyệt trong chat** → `bai-hoc.js them <nháp> --ghi`: bài vào *hộp thư* `~/.easypos-tester/bai-hoc-cho-gui/` (ngoài thư mục kit) và **dùng được ngay** trên máy này (`tim` thấy).
4. `dong-bo.js gui` (hook **hỏi xác nhận**): kiểm lại, dựng một commit chỉ thêm tệp mới dưới `kien-thuc/bai/`, đẩy lên nhánh `inbox/<tên>-<giờ>`.
5. **Máy chủ** (GitHub Actions theo lịch, ~10 phút): với mỗi nhánh `inbox/*` chỉ chấp nhận khi *chỉ thêm tệp bài mới đúng đường dẫn*, kiểm bằng đúng luật của `bai-hoc.js kiem`, rồi **gộp vào `main` bằng một commit của bot** và xoá nhánh. Nhánh không đạt đổi tên `inbox-loi/…` để người phụ trách xem.
6. **Mọi máy tester** nhận bài ở lần đồng bộ kế tiếp (tự động trước khi chạy test hoặc khi mở phiên Claude).

Người phụ trách sửa / đánh dấu `het-han` bài cũ: sửa trực tiếp trên `main` như mọi thay đổi khác của kit.
