# 06 · Tổng kết — <chức năng>

**Kết luận:** Đạt / Không đạt — <1-2 câu>

**Phạm vi đã kiểm:** <nghiệp vụ | kỹ thuật | cả hai>. Nếu *kỹ thuật*: ghi rõ **"chưa kiểm tính đúng nghiệp vụ"**.
**Tài liệu đã dùng:** <trang Confluence — phiên bản n — link> / không có.
**Phủ nghiệp vụ:** <số BR có testcase>/<tổng BR> (chi tiết ma trận ở `02-testcase.md`).

| Mã | Kết quả |
|---|---|
| TC-… | ✅ / ❌ / ⚠️ / ⏸ |

## Lỗi tìm được (mẫu Jira)
### [BUG-1] <Tiêu đề ngắn>
- Môi trường: <dev | uat> · Tài khoản / công ty: <…> · Mức độ: <…>
- Bước tái hiện: 1. … 2. … 3. …
- Kết quả thực tế: …
- Kết quả mong đợi: …
- Bằng chứng: <ảnh / phản hồi API / SQL>
- Đã xác nhận lại trên UAT (nếu lỗi tìm thấy trên dev): có / chưa / không áp dụng
- Quy tắc nghiệp vụ liên quan: <BR-xx — trang Confluence › mục · phiên bản> hoặc "kỹ thuật (không có BR)"
- Jira: <EPB-xxxxx + link> (tạo bằng `jira-tao.js` sau khi tester duyệt; tester bấm Assign) · nháp: `BUG-1.jira.md`
- Liên kết: <mã Jira liên quan>

## Việc còn phải test tay
- …

## Cần BA chốt
- …

## Chạy UAT (tùy chọn — hỏi tester sau khi kiểm thử xong trên dev)
- Tester chọn: ☐ Có, chạy lại trên UAT · ☐ Không, kết thúc ở dev · ☐ Để sau
- Nếu **Có**: kết quả ở `04-ket-qua-uat.md`, `05-kiem-du-lieu-uat.md`; tóm tắt: <đạt / không đạt>, khác biệt dev ↔ UAT: <…>
- Nếu **Không / Để sau**: ghi "UAT: chưa chạy" và các lỗi ở trên ghi "đã xác nhận lại trên UAT: chưa".
