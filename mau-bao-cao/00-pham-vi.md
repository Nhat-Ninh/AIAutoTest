# 00 · Phạm vi kiểm thử — <chức năng>

- Ngày: <dd/mm/yyyy> · Người kiểm: <tên> · Môi trường: <dev | uat>

| Câu hỏi | Lựa chọn |
|---|---|
| **Loại kiểm thử** | **Theo nghiệp vụ** (cần tài liệu) / **Kỹ thuật** (không cần nghiệp vụ) / Cả hai |
| Kiểm gì | UI / API / cả hai |
| Nguồn nghiệp vụ | <trang Confluence (tên, id, phiên bản) / ticket Jira EPB-… / tệp testcase Excel / chỉ code / **không cần (kỹ thuật)**> |
| Mức độ | nhanh / đầy đủ |

**Loại kiểm thử "Kỹ thuật" gồm:** môi trường & đăng nhập sẵn sàng · giao diện hiển thị / không lỗi · API trả đúng mã HTTP và định dạng · kiểm dữ liệu đầu vào theo quy tắc trong code (bắt buộc, độ dài, trùng) · nhất quán UI ↔ API ↔ CSDL · hồi quy "hành vi không đổi" · phản hồi lỗi 400 / 500. **Không** kết luận được "đúng nghiệp vụ".

Tài liệu đã dùng (nếu có): <tên trang › link › **phiên bản n** › ngày sửa › lấy lúc>

UAT: **tùy chọn** — chỉ chạy khi tester chọn "Có" ở câu hỏi cuối quy trình (sau Bước 6 trên dev).

Ngoài phạm vi: <liệt kê>
Trạng thái duyệt: ☐ Duyệt
