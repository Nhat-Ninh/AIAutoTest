# 02 · Testcase — <chức năng>

Nguồn: `BR-xx` = quy tắc nghiệp vụ trong tài liệu · `QT-xx` = quy tắc **suy từ code** (tool `suy_ra_nghiep_vu`, chưa phải yêu cầu của BA) · `KT` = kiểm thử kỹ thuật (không cần nghiệp vụ).
Kỹ thuật (xem `rules/KY-THUAT-TESTCASE.md`): EP · BVA · DT · ST · PW · EG · NV · ID · RC · AZ · DI · CA · NG · LC · RG · UX. Nhãn `Ẩn` = testcase từ vòng tự phản biện.
Độ chắc: `Chắc` = theo tài liệu · `Suy từ code` = kỳ vọng là hành vi hiện tại của code, **cần BA xác nhận**.

| Mã | Ưu tiên (lý do) | Nguồn | Kỹ thuật | Điều kiện | Dữ liệu vào (giá trị cụ thể) | Bước | Kỳ vọng UI | Kỳ vọng API | Kỳ vọng CSDL | Tự động | Độ chắc |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-BE-001 | Cao (…) | BR-01 / QT-01 / KT | BVA | | | 1. … 2. … | | HTTP … ; trường … | bảng … cột … = … | Có / Không (lý do) | Chắc / Suy từ code |
| TC-FE-001 | Cao (…) | BR-01 | EP, Ẩn | | | | | | | | |

## Truy vết quy tắc → testcase
| Mã quy tắc | Testcase phủ | Ghi chú |
|---|---|---|
| BR-01 | TC-BE-001, TC-FE-001 | |
| BR-02 | **(chưa có)** | lý do: <test tay / ngoài phạm vi / cần dữ liệu> |

## Ma trận kỹ thuật × quy tắc
| Quy tắc | EP | BVA | DT | ST | EG | ID/RC | AZ | DI | CA | Khác |
|---|---|---|---|---|---|---|---|---|---|---|
| BR-01 | TC-… | TC-… | — (không có tổ hợp) | | | | | | | |

Kỹ thuật không áp dụng: <mã · lý do ngắn>

## Thống kê
Tổng: <n> · Cao / Trung bình / Thấp: <a> / <b> / <c> · Tự động / Test tay: <x> / <y> · Testcase `Ẩn`: <z> · `Suy từ code`: <k>

## Cần BA chốt
| # | Điểm | Tài liệu nói | Code làm | Testcase liên quan |
|---|---|---|---|---|

## Điểm nghi vấn từ code (chỉ khi dùng `suy_ra_nghiep_vu`)
| # | Nghi vấn | Tham chiếu | Testcase kiểm chứng |
|---|---|---|---|

Test tay (không tự động được): <liệt kê + lý do>
Trạng thái duyệt: ☐ Duyệt
