# 00 · Kế hoạch hiểu nghiệp vụ và hướng kiểm thử — <chức năng>

> Trình bằng chế độ Plan (ExitPlanMode) cho tester đọc, hiểu và duyệt **trước** khi hỏi các lựa chọn ở Bước 0. Duyệt xong mới ghi tệp này.
> Viết bằng ngôn ngữ nghiệp vụ, dễ hình dung; không dán mã.

**Nguồn nghiệp vụ:** <trang Confluence › mục — phiên bản n — link> | <ticket EPB-… + trang liên kết> | <tệp …> | **SUY TỪ CODE** (`repo@commit`)
> Nếu nguồn là suy từ code: **chưa có yêu cầu của BA — mọi kỳ vọng là hành vi hiện tại của code, cần BA xác nhận.**
**Bài học đã dùng:** <BH-…> · **Môi trường:** dev

## 1. Chức năng làm gì (2–4 câu)
<mục đích, ai dùng, giá trị nghiệp vụ>

## 2. Tác nhân và quyền
| Tác nhân / vai trò | Được làm gì | Điều kiện / quyền cần có |
|---|---|---|

## 3. Luồng nghiệp vụ (sơ đồ chữ)
```
[Bắt đầu] → (1) <bước> → (2) <bước> ─┬─ <điều kiện A> → (3a) <kết quả>
                                       └─ <điều kiện B> → (3b) <kết quả / lỗi>
```
Trạng thái (nếu có): `<A>` → `<B>` → `<C>` · chuyển không hợp lệ: <…>

## 4. Quy tắc chính
| Mã | Quy tắc (điều kiện → kết quả) | Nguồn / Độ chắc |
|---|---|---|
| BR-01 / QT-01 | | Chắc / Suy từ code |

## 5. Dữ liệu và hệ thống liên quan
- **Màn hình:** <…> · **API:** <method đường dẫn> · **Bảng CSDL:** <bảng.cột chính, điều kiện công ty `com_id`, xoá mềm> · **Hệ thống ngoài:** <…>
- **Tác dụng phụ:** <ghi bảng nào, gửi gì đi đâu>

## 6. Chỗ mơ hồ, mâu thuẫn, điểm nghi vấn
| # | Điều chưa rõ / lệch | Tài liệu nói | Code làm | Cần ai chốt |
|---|---|---|---|---|

## 7. Hướng kiểm thử đề xuất
- **Rủi ro cao nhất:** <3–5 điểm, vì sao>
- **Kỹ thuật sẽ áp dụng:** <EP, BVA, DT, ST, EG, ID/RC, AZ, DI, CA… và nơi áp>
- **Ước lượng testcase:** ~<n> (FE <a> / BE <b>), trong đó test tay ~<y>; phần xếp sau nếu quá nhiều: <…>
- **Ngoài phạm vi / cần dữ liệu đặc biệt:** <…>
- **Loại kiểm thử đề xuất:** nghiệp vụ / kỹ thuật / cả hai · UI / API / cả hai

## 8. Các bước tiếp theo
Bước 0 (xác nhận phạm vi) → 1 (phân tích chi tiết) → 2 (testcase) → 3 (kịch bản) → 4 (chạy) → 5 (kiểm dữ liệu) → 6 (tổng kết). Mỗi bước dừng để duyệt.

Trạng thái duyệt Plan: ☐ Duyệt ☐ Sửa ☐ Dừng
