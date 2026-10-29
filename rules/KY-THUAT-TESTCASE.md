# Kỹ thuật sinh testcase chặt chẽ (đọc MỘT lần khi bắt đầu Bước 2)

Mục tiêu: testcase **đủ chi tiết để người khác chạy y hệt**, **phủ cả những tình huống con người hiếm khi nghĩ tới**, và **truy vết được** về quy tắc (BR hoặc QT). Không viết testcase chung chung kiểu "nhập dữ liệu hợp lệ → thành công".

## 1. Nguồn và độ chắc của quy tắc

| Có tài liệu nghiệp vụ? | Cách lấy quy tắc | Cột "Độ chắc" |
|---|---|---|
| **Có** (Confluence / Jira / Excel) | Dùng nguyên mã BA (`BR-xx`). Đối chiếu tài liệu ↔ code; chỗ lệch là một mục "cần BA chốt" **và** sinh testcase cho cả hai vế | `Chắc` (theo tài liệu) |
| **Không** | Gọi tool MCP `suy_ra_nghiep_vu` (cổng Code-Insight) cho từng repo liên quan (giao diện, backend, dịch vụ phụ); bổ sung `giai_thich_luong`, `liet_ke_api`, `bang_db_lien_quan`. Mã quy tắc: `QT-xx` do tool trả | `Suy từ code` — kỳ vọng là **hành vi hiện tại của code, chưa phải yêu cầu của BA**; nói rõ ở báo cáo và đề nghị BA xác nhận |

Quy tắc chưa rõ thì **hỏi**, không bịa. `diem_nghi_van` của tool là nguồn chính cho các testcase "ẩn" (mục 4).

## 2. Quy trình 5 bước

1. **Kho điều kiện.** Từ mỗi quy tắc, ràng buộc trường, nhánh lỗi, chuyển trạng thái, tác dụng phụ: liệt kê *điều kiện*, *giá trị biên*, *kết quả mong đợi*. Mỗi mục có mã (BR-xx / QT-xx / FLD-xx).
2. **Áp kỹ thuật** (mục 3) để biến kho điều kiện thành testcase. Ghi **tên kỹ thuật** vào cột "Kỹ thuật".
3. **Tự phản biện** (mục 4): với từng quy tắc hỏi "điều gì làm nó hỏng mà chưa có testcase?" rồi bổ sung, gắn nhãn `Ẩn`.
4. **Ma trận phủ** (mục 6): truy vết quy tắc → testcase và kỹ thuật × quy tắc; liệt kê chỗ chưa phủ kèm lý do.
5. **Rà chất lượng** (mục 5) từng testcase trước khi trình tester duyệt.

## 3. Kỹ thuật bắt buộc (áp cho mọi quy tắc có thể áp)

| Mã | Kỹ thuật | Cách làm cụ thể |
|---|---|---|
| EP | Phân hoạch tương đương | Mỗi lớp hợp lệ / không hợp lệ ít nhất một đại diện **có giá trị thật** |
| BVA | Giá trị biên | Với giới hạn [min, max]: `min-1, min, min+1, max-1, max, max+1`; độ dài chuỗi, số lượng, số tiền, ngày |
| DT | Bảng quyết định | Điều kiện A, B, C → mỗi tổ hợp có ý nghĩa là **một cột = một testcase**; nêu cả tổ hợp "không thể" để xác nhận bị chặn |
| ST | Chuyển trạng thái | Mọi chuyển hợp lệ **và** chuyển KHÔNG hợp lệ (nhảy cóc, quay lại, lặp lại cùng chuyển) |
| PW | Tổ hợp cặp | Nhiều tham số độc lập (loại, đơn vị, kho…): phủ mọi cặp giá trị, không cần phủ hết tích Descartes |
| EG | Đoán lỗi | Bẫy dữ liệu: rỗng / chỉ khoảng trắng / khoảng trắng đầu-cuối · Unicode, emoji, ký tự có dấu, chữ hoa-thường khác nhau của cùng khoá · chuỗi giống mã (dấu nháy, `<`, `%`, `\`) để kiểm **escape, không phải tấn công** · số 0, âm, thập phân dài, rất lớn · ngày biên (cuối tháng, 29/02, nửa đêm, múi giờ) |
| NV | Giá trị thiếu / thừa / sai kiểu | Thiếu từng trường bắt buộc; trường thừa; kiểu sai (chuỗi vào số, mảng rỗng, null) |
| ID | Bất biến khi lặp | Bấm hai lần, gửi lại cùng yêu cầu, tải lại giữa chừng: không tạo trùng, không trừ tồn hai lần |
| RC | Đồng thời | Hai yêu cầu cùng lúc trên cùng đối tượng / cùng mã (chỉ dùng dữ liệu `AUTO_` của chính mình, trên dev) |
| AZ | Phân quyền | Không quyền, sai vai trò, đúng quyền; **dữ liệu của công ty khác** (cột `com_id`) có bị lộ / sửa được không |
| DI | Toàn vẹn dữ liệu | UI ↔ API ↔ CSDL khớp; lỗi giữa chừng không để lại dữ liệu dở; xoá mềm; bảng phụ được ghi đúng |
| CA | Tính toán | Tự tính tay độc lập rồi so; làm tròn từng dòng so với làm tròn tổng; nhiều dòng; khuyến mãi, thuế, đơn vị quy đổi |
| NG | Đảo ngược và phục hồi | Huỷ, hoàn, xoá rồi thêm lại, sửa rồi trả về giá trị cũ |
| LC | Liệt kê / lọc / phân trang | Trang đầu, cuối, ngoài phạm vi; sắp xếp ổn định; lọc kết hợp; không có dữ liệu |
| RG | Hồi quy lân cận | Chức năng dùng chung bảng / API / thành phần với chức năng đang test |
| UX | Hiển thị | Thông báo đúng nội dung, trạng thái nút (bật / tắt), đánh dấu trường bắt buộc, định dạng số – ngày |

Kỹ thuật nào **không áp dụng** thì ghi lý do ngắn ở ma trận phủ, không bỏ lặng lẽ.

## 4. Vòng tự phản biện (sinh các testcase "ẩn")

Với **mỗi quy tắc**, tự hỏi lần lượt, câu nào có câu trả lời "có thể xảy ra" thì thêm testcase gắn nhãn `Ẩn`:

1. Nếu **điều kiện đảo ngược** thì sao? (đúng thành sai, đủ thành thiếu)
2. Nếu giá trị **nằm đúng biên**, vượt biên một đơn vị, hoặc **lặp** nhiều lần?
3. Nếu **giao diện cho qua nhưng máy chủ chặn** (hoặc ngược lại)? Giao diện và máy chủ có kiểm **cùng luật** không?
4. Nếu **hai người** làm cùng lúc, hoặc **một người bấm hai lần**?
5. Nếu **làm giữa chừng rồi dừng** (mất mạng, đóng tab, lỗi dịch vụ phụ)? Dữ liệu có dở không?
6. Nếu dữ liệu **cũ / đã xoá mềm / của công ty khác** đi vào luồng này?
7. Nếu **thứ tự bước** bị đảo hoặc bỏ bước?
8. Nếu **tiền, số lượng, làm tròn** rơi vào số lẻ, số rất nhỏ hoặc rất lớn?
9. Nếu **tài liệu nói một đằng, code làm một nẻo**? Cả hai vế đều cần testcase.
10. Nếu **quyền** thay đổi giữa chừng (bị thu quyền khi đang thao tác)?
11. Nếu chức năng khác **cùng ghi vào bảng này**?
12. Nếu người dùng **nhập đúng nhưng theo cách không ai nghĩ tới** (dán từ Excel, mã vạch có ký tự thừa, số điện thoại có dấu cách)?

Mục tiêu không phải nhiều testcase nhất mà là **không bỏ sót rủi ro**; testcase `Ẩn` nào trùng ý với testcase đã có thì gộp.

## 5. Chuẩn một testcase (thiếu mục nào là chưa đạt)

| Mục | Yêu cầu |
|---|---|
| Mã | `TC-FE-xxx` / `TC-BE-xxx` |
| Nguồn | `BR-xx` hoặc `QT-xx` (có thể nhiều); không có nguồn thì không được viết |
| Kỹ thuật | Mã kỹ thuật ở mục 3 (EP, BVA, DT…) và nhãn `Ẩn` nếu có |
| Ưu tiên | Cao / Trung bình / Thấp = **rủi ro × khả năng xảy ra**, kèm 5–10 chữ lý do |
| Điều kiện | Trạng thái cần có trước (đăng nhập vai trò gì, dữ liệu nền nào) |
| Dữ liệu vào | **Giá trị cụ thể** (vd `AUTO_SP_50KY…` đủ 50 ký tự), không viết "dữ liệu hợp lệ" |
| Bước | Đánh số, một hành động một dòng |
| Kỳ vọng UI | Thông báo / trạng thái **định lượng** (nội dung thông báo, nút bật hay tắt) |
| Kỳ vọng API | Mã HTTP, trường chính trong phản hồi |
| Kỳ vọng CSDL | Bảng, cột, giá trị (hoặc "không ghi gì") |
| Tự động | Có / Không + lý do nếu không (đưa vào "test tay") |
| Độ chắc | `Chắc` (theo tài liệu) hoặc `Suy từ code` |

**Cấm:** kỳ vọng mơ hồ ("hệ thống xử lý đúng", "hiển thị lỗi"); một testcase kiểm nhiều điều không liên quan; kỳ vọng tự suy ra từ kết quả chạy thử rồi coi là đúng.

## 6. Ma trận phủ và báo cáo trình tester

Ở `02-testcase.md`, ngoài danh sách testcase, **bắt buộc có**:

1. **Truy vết** quy tắc → testcase; quy tắc chưa có testcase phải nêu lý do (ngoài phạm vi, cần dữ liệu, test tay).
2. **Ma trận kỹ thuật × quy tắc** (có thể gọn: mỗi quy tắc liệt kê các mã kỹ thuật đã áp).
3. **Thống kê**: tổng số, theo ưu tiên, theo kỹ thuật, số testcase `Ẩn`, số tự động / test tay, số `Suy từ code`.
4. **Danh sách "cần BA chốt"** (tài liệu mơ hồ, lệch tài liệu ↔ code, quy tắc chỉ suy từ code).
5. **Điểm nghi vấn từ code** (nếu dùng `suy_ra_nghiep_vu`) kèm testcase tương ứng.

Số lượng testcase theo **đủ phủ**, không theo chỉ tiêu; chức năng nhỏ vài chục, chức năng lớn có thể vài trăm. Nếu quá nhiều, **ưu tiên theo rủi ro** và nói rõ phần xếp sau.
