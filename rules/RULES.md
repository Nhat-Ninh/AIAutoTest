# Luật kiểm thử EasyPOS cùng Claude — áp tuyệt đối, không tự suy ra ngoại lệ

Hook `guard-easypos` ép các luật có dấu ⛔ bằng máy (chặn thẳng). Các luật còn lại Claude phải tự giữ.
Trước khi phân tích một chức năng: đọc `tai-lieu/EASYPOS-BAN-DO.md` (service, cổng, route gateway, màn hình, bảng CSDL, đăng nhập).

## Môi trường
0. **DEV là mặc định, UAT là TÙY CHỌN của tester.** Hai môi trường: `dev` (CSDL `easyposbackoffice`) và `uat` (web `https://uat.easypos.vn`, application profile `prodTest`, CSDL `easyposuat`), cùng máy CSDL `10.100.110.78`. Mặc định kiểm thử trên `dev` (`--project=dev`, `dbq.js dev …`). **Không phải lần nào test xong dev cũng lên UAT:** Claude KHÔNG tự chạy UAT; chỉ chạy UAT khi tester chọn "Có" ở câu hỏi cuối quy trình (xem luật 15, Bước 6b). Người dùng không nói rõ môi trường ⇒ hỏi, đề xuất `dev`. Mỗi lệnh `--project` / `dbq` ghi đúng khoá `dev` hoặc `uat`, không trộn. DEV dùng chung với dev đang sửa code: lỗi chập chờn / vừa deploy có thể do môi trường — chạy lại trước khi kết luận lỗi phần mềm, phân loại "lỗi môi trường" nếu nghi. Báo cáo ghi rõ môi trường đã chạy; lỗi tìm thấy trên dev ghi thêm "đã xác nhận lại trên UAT: có / chưa / không áp dụng".
1. ⛔ **Chỉ test trên TEST (dev) / UAT** (các khoá trong `config/moi-truong.json → moiTruong`). Địa chỉ nằm trong `prodChan` / `prodDb` là PROD: Playwright, `dbq` và hook tự từ chối. Không tìm cách lách (đổi cách viết, chạy qua chương trình khác…).
2. Môi trường nào có `webUrl` / `apiUrl` TRỐNG là chưa cấu hình: dừng và báo người dùng, không đoán địa chỉ.
3. Danh sách PROD của EasyPOS có thể chưa đủ (xem mục TODO trong `config/moi-truong.json`). Nghi một địa chỉ là prod ⇒ hỏi người dùng, không chạy.
4. Dữ liệu test tạo ra phải có tiền tố `AUTO_` (tên khách, sản phẩm, đơn…) để dễ nhận và dọn. Không sửa / xoá dữ liệu không phải `AUTO_`. Dữ liệu chỉ tạo qua giao diện / API như người dùng thật.
5. Không chạy ứng dụng EasyPOS cục bộ với profile `prod`. Không dùng "super pass" của backend.

## CSDL
6. ⛔ CSDL chỉ **đọc** (SELECT) qua `node "$EP_KIT/tools/tester/dbq.js" <môi trường> <tệp.sql>`. Không dùng sqlcmd, driver hay chương trình tự viết để nối CSDL / Mongo / Redis / Kafka. Không INSERT / UPDATE / DELETE / DDL, kể cả ở dev và UAT.
7. ⛔ Không dùng `sa` vào PROD (dbq từ chối máy prod). Ở dev / UAT: ưu tiên tài khoản chỉ-đọc; khi chưa có thì `dbq.js` được dùng tài khoản của ứng dụng (`sa`) mà người dùng tự gõ vào `tai-khoan.json` — dbq vẫn chỉ chạy SELECT. Claude không tự gõ `sa` / mật khẩu vào lệnh hay tệp nào khác.
8. Mọi câu SQL lọc theo công ty đang test bằng cột **`com_id`**, có `TOP` hoặc khoảng ngày. Cột xoá mềm không đồng nhất giữa các bảng: kiểm cột thực tế trước khi dựng điều kiện. Viết SQL vào tệp `.sql` ở một lệnh, chạy ở lệnh sau.

## Bảo mật
9. ⛔ Không in, không đọc, không chép, không ghi mật khẩu / token. Mật khẩu do người dùng tự gõ vào `~/.easypos-tester/tai-khoan.json` (mẫu `config/tai-khoan.example.json`); Claude không hỏi mật khẩu trong chat, không ghi mật khẩu vào kịch bản hay báo cáo. Không đọc `application-prod*.yml`; `application-dev.yml` / `application-prodTest.yml` chỉ đọc để hiểu cấu trúc, không chép giá trị mật khẩu.
10. Tài khoản web test phải là tài khoản dữ liệu giả, đã tắt OTP, không phải tài khoản dùng thử (hết hạn sẽ bị khoá).
11. Dữ liệu khách hàng thật (nếu lỡ thấy) không đưa vào báo cáo / Jira; ghi mã rút gọn hoặc che.

## Số liệu và báo cáo
12. **Không bịa số.** Thiếu số thì nói thiếu và đo. "Chưa chạy" ≠ "đạt". Mỗi kết luận phải kèm bằng chứng: ảnh, phản hồi API, câu SQL + kết quả, hoặc dòng code.
13. Hook chặn một lệnh ⇒ **dừng và báo người dùng**, không tìm cách lách.
14. Jira (mã `EPB-…`): đọc bằng `tools/jira/jira.js`. Tạo / sửa ticket là việc cả nhóm nhìn thấy: luôn soạn nháp và hỏi duyệt trước khi tạo; không tự sửa / đóng ticket của người khác; không đưa mật khẩu vào ticket.

## Quy trình 7 bước — MỖI BƯỚC DỪNG HỎI DUYỆT
15. Mỗi lần kiểm thử một chức năng đi đủ 7 bước, báo cáo ghi vào `bao-cao/<ngày>_<chức năng>/` theo mẫu trong `mau-bao-cao/`. Hết mỗi bước **DỪNG**, hỏi người làm bằng công cụ hỏi (AskUserQuestion: *Duyệt — đi tiếp* / *Sửa lại bước này* / *Dừng*). Im lặng hay câu trả lời mơ hồ KHÔNG phải là duyệt. Chưa duyệt bước trước thì không làm bước sau.
    - **Bước 0 — Phạm vi:** hỏi 3 câu: kiểm UI / API / cả hai · dựa vào code hay tài liệu (tệp testcase, Jira `EPB-…`, Confluence) · nhanh hay đầy đủ. Ghi lại.
    - **Bước 1 — Phân tích:** đọc code theo luồng chức năng (FE `easypos-frontend` → gateway → service; dùng `bb.js` nếu repo chưa có trên máy), đối chiếu tài liệu, chỉ ra chỗ code khác tài liệu. Hỏi: có kỳ vọng theo tệp, theo code, hay cả hai báo cáo.
    - **Bước 2 — Testcase:** mã `TC-FE-xxx` / `TC-BE-xxx`, ưu tiên, dữ liệu vào, kết quả mong đợi, dữ liệu CSDL mong đợi.
    - **Bước 3 — Kịch bản:** viết kịch bản Playwright trong `e2e/tests/<chức năng>/`, tên test bắt đầu bằng mã testcase. Hỏi: chạy ở môi trường nào (mặc định `dev`; UAT chỉ khi tester muốn — xem Bước 6b) · giữ dữ liệu `AUTO_` để tra CSDL hay không.
    - **Bước 4 — Chạy:** thao tác như người dùng, chụp ảnh từng bước; kịch bản sai thì sửa kịch bản và chạy lại; lỗi phần mềm thì ghi nhận, không sửa code ứng dụng.
    - **Bước 5 — Kiểm dữ liệu:** tra CSDL (chỉ đọc, `dbq.js`) đối chiếu, mỗi dòng ghi Khớp / KHÔNG khớp; sau đó hỏi dọn dữ liệu `AUTO_` ngay hay giữ lại cho dev xem (dọn qua giao diện / API, không xoá thẳng CSDL).
    - **Bước 6 — Tổng kết:** bảng testcase (✅ Đạt · ❌ Không đạt · ⚠️ Cần BA chốt · ⏸ Chưa chạy), lỗi viết sẵn theo mẫu Jira, việc cần test tay.
    - **Bước 6b — Hỏi có chạy UAT không (BẮT BUỘC khi vừa kiểm thử xong trên dev):** ngay sau khi tester duyệt Bước 6 của lượt **dev**, Claude hỏi bằng công cụ hỏi: *"Đã kiểm thử xong trên dev. Có muốn chạy lại cùng bộ kịch bản trên UAT (`https://uat.easypos.vn`) không?"* với các lựa chọn **Có — chạy lại trên UAT** · **Không — kết thúc ở dev** · **Để sau**. Im lặng / mơ hồ ⇒ coi là **Không**, không tự chạy. Kết quả lựa chọn ghi vào `06-tong-ket.md` mục "Chạy UAT".
      - **Không / Để sau:** kết thúc; ghi rõ "UAT: chưa chạy (tester chọn không / để sau)" và lỗi tìm thấy ghi "đã xác nhận lại trên UAT: chưa".
      - **Có:** (1) kiểm `~/.easypos-tester/tai-khoan.json` đã có khối `uat` đủ `web` và `db` chưa — chỉ nói đủ / thiếu, **không đọc giá trị**; thiếu ⇒ dừng, hướng dẫn tester tự điền (không hỏi mật khẩu trong chat); (2) kiểm môi trường sẵn sàng `tests/_kiem-moi-truong --project=uat`; (3) chạy lại **cùng bộ kịch bản** của chức năng với `--project=uat`; (4) tra CSDL bằng `dbq.js uat`; (5) ghi kết quả vào `04-ket-qua-uat.md` và `05-kiem-du-lieu-uat.md` (tách khỏi dev), cập nhật mục UAT trong `06-tong-ket.md`, đối chiếu **khác biệt dev ↔ UAT**; mỗi bước vẫn dừng hỏi duyệt. UAT là môi trường dùng chung: dữ liệu `AUTO_` như dev, hỏi dọn / giữ như Bước 5.
16. Test chạy trượt phải phân loại: lỗi phần mềm, lỗi kịch bản, hay lỗi môi trường.
17. Claude **không** sửa code ứng dụng EasyPOS, không deploy, không merge / push nhánh của dự án. Việc của Claude là kiểm thử và báo cáo.
