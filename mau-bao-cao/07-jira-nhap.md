---
# NHÁP TICKET JIRA (máy đọc được) — dùng với:  node tools/jira/jira-tao.js <tệp này>   (xem trước)   rồi  --tao  (tạo thật, sau khi tester duyệt)
# Mỗi lỗi một tệp, đặt trong thư mục báo cáo, ví dụ  bao-cao/<ngày>_<chức năng>/BUG-1.jira.md
project: EPB
issuetype: Bug
ma-loi: BUG-1                     # mã lỗi trong báo cáo; cùng ma-loi + môi trường ⇒ công cụ nhận ra đã tạo rồi, không tạo trùng
summary: [<Chức năng>] <Mô tả ngắn lỗi — hiện tượng, không đoán nguyên nhân>
priority: Medium                  # Highest | High | Medium | Low | Lowest (hoặc: Cao / Trung bình / Thấp)
severity: Major                   # Blocker | Critical | Major | Low  (Trường Severity của EPB)
# components: [<Tên component>]    # CHỈ dùng khi project có component; EPB hiện KHÔNG có (công cụ sẽ báo lỗi nếu ghi sai)
labels: [dev, <ten-chuc-nang>]    # 'auto-test' và 'at-<mã băm>' được công cụ tự thêm
environment: dev — http://10.100.140.9:8082/, CSDL easyposbackoffice, công ty <id — tên>
lien-ket: []                      # ticket liên quan: [EPB-123] hoặc [Relates:EPB-123, Blocks:EPB-456]
dinh-kem: [<anh-bang-chung.png>, <ket-qua.json>]   # tệp nằm cùng thư mục nháp / bao-cao / e2e; công cụ quét bí mật trước khi gửi
# tester: <tên đăng nhập Jira>   # (tuỳ chọn) mặc định là người chạy kit
# affects-version: []
---
h3. Mô tả
<1–3 câu: chuyện gì xảy ra, ở đâu, ảnh hưởng gì>

h3. Môi trường
* Môi trường: dev (<địa chỉ>), CSDL <tên>
* Công ty / tài khoản: <công ty id — tên> / tài khoản test (dữ liệu giả)
* Phát hiện bằng kịch bản tự động (Playwright), ngày <dd/mm/yyyy>

h3. Bước tái hiện
# <bước 1>
# <bước 2>
# <bước 3>

h3. Kết quả thực tế
* <điều thực sự xảy ra — kèm mã HTTP / thông báo nguyên văn>

h3. Kết quả mong đợi
* <điều đáng lẽ phải xảy ra — dẫn nguồn: trang Confluence › mục (phiên bản) hoặc "theo code / hành vi các chức năng tương tự">

h3. Bằng chứng
* Ảnh / tệp đính kèm: <tên tệp>
* Truy vấn CSDL (nếu có): <câu SELECT + kết quả rút gọn>

h3. Nguyên nhân gần đúng (nếu đã đọc code)
<tệp:dòng — không bắt buộc>

h3. Cần xác nhận lại
* Đã xác nhận trên UAT: chưa
