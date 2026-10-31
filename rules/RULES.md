# Luật kiểm thử EasyPOS cùng Claude — áp tuyệt đối, không tự suy ra ngoại lệ

Hook `guard-easypos` ép các luật có dấu ⛔ bằng máy (chặn thẳng). Các luật còn lại Claude phải tự giữ.
Trước khi phân tích một chức năng: đọc `tai-lieu/EASYPOS-BAN-DO.md` (service, cổng, route gateway, màn hình, bảng CSDL, đăng nhập).

## Môi trường
0. **DEV là mặc định, UAT là TÙY CHỌN của tester.** Hai môi trường: `dev` (CSDL `easyposbackoffice`) và `uat` (web `https://uat.easypos.vn`, application profile `prodTest`, CSDL `easyposuat`), cùng máy CSDL `10.100.110.78`. Mặc định kiểm thử trên `dev` (`--project=dev`, `dbq.js dev …`). **Không phải lần nào test xong dev cũng lên UAT:** Claude KHÔNG tự chạy UAT; chỉ chạy UAT khi tester chọn "Có" ở câu hỏi cuối quy trình (xem luật 15, Bước 6b). Người dùng không nói rõ môi trường ⇒ hỏi, đề xuất `dev`. Mỗi lệnh `--project` / `dbq` ghi đúng khoá `dev` hoặc `uat`, không trộn. DEV dùng chung với dev đang sửa code: lỗi chập chờn / vừa deploy có thể do môi trường — chạy lại trước khi kết luận lỗi phần mềm, phân loại "lỗi môi trường" nếu nghi. Báo cáo ghi rõ môi trường đã chạy; lỗi tìm thấy trên dev ghi thêm "đã xác nhận lại trên UAT: có / chưa / không áp dụng".
    - **Hai cặp môi trường (từ 29/10/2026):** cặp **`dev` / `uat`** (máy Linux 10.100.140.9:8082 · uat.easypos.vn, nhánh `dev`) và cặp **`dev_bia` / `uat_bia`** (máy Windows 10.100.110.78 cổng 8888 / 8081, nhánh `dev-bia` / `bia-prod-test`). Hai cặp **dùng chung CSDL** (`easyposbackoffice` / `easyposuat`) nên: (1) mỗi lượt chỉ chạy **một** môi trường cùng loại, **không chạy dev và dev_bia cùng lúc** (hai UAT cũng vậy); (2) mỗi báo cáo ghi môi trường + nhánh + commit; (3) UAT của `dev_bia` là `uat_bia` (khoá `capUat` trong cấu hình); (4) tài khoản mượn từ cặp gốc (`taiKhoanTu`), tester điền một lần ở khối `dev` / `uat`; (5) lỗi chỉ xảy ra ở một nền tảng (Linux ↔ Windows) ghi "nghi lỗi nền tảng / môi trường", chạy lại smoke trên môi trường kia trước khi kết luận.
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
14. Jira (`EPB-…`): **đọc** bằng `jira.js`; **tạo ticket lỗi** CHỈ bằng `jira-tao.js`: xem trước → tester duyệt trong chat → `--tao` (chỉ tạo mới, không sửa / đóng / xoá, không đưa mật khẩu / token). Chi tiết: `rules/QUY-TRINH.md` Bước 6a.
14b. Confluence: **chỉ đọc** (`confluence.js`). **Không bịa nghiệp vụ**: quy tắc nghiệp vụ phải trích trang › mục + phiên bản, thiếu tài liệu thì HỎI. Loại kiểm thử **kỹ thuật** thì không gọi Confluence. Chi tiết: `rules/QUY-TRINH.md`.

## Quy trình 7 bước — MỖI BƯỚC DỪNG HỎI DUYỆT
15. Mỗi chức năng đi **Bước P (Plan)** rồi đủ 7 bước: **0** Phạm vi · **1** Phân tích · **2** Testcase · **3** Kịch bản · **4** Chạy · **5** Kiểm dữ liệu · **6** Tổng kết (**6a** tạo Jira · **6b** hỏi UAT · **6c** rút bài học). Hết mỗi bước **DỪNG**, hỏi duyệt / làm lại / dừng. Báo cáo ghi vào `bao-cao/<ngày>_<chức năng>/` theo `mau-bao-cao/`.
    - ⚑ **Bước P — Plan (làm trước Bước 0):** nhận link / tệp / ticket / tên chức năng thì **đọc nghiệp vụ trước, chưa hỏi lựa chọn nào**; không có tài liệu thì gọi tool `suy_ra_nghiep_vu` (Code-Insight) để suy nghiệp vụ từ code; rồi **vào chế độ Plan** (`EnterPlanMode` / `ExitPlanMode`) trình kế hoạch theo `mau-bao-cao/00-ke-hoach.md` để tester đọc, hiểu logic và duyệt. Chưa duyệt Plan thì chưa sang Bước 0. Testcase (Bước 2) sinh theo `rules/KY-THUAT-TESTCASE.md`: chặt chẽ, có kỹ thuật, có testcase "ẩn", có truy vết và độ chắc. Chi tiết: `rules/QUY-TRINH.md`.
    - ⚑ **Khi nhận việc kiểm thử một chức năng, TRƯỚC Bước 0:** (a) đọc `rules/QUY-TRINH.md` **một lần** (chi tiết từng bước); (b) chạy `node "$EP_KIT/tools/tester/bai-hoc.js" tim <từ khoá chức năng>` **một lần** — kho bài học chung (bẫy đã gặp, sự thật môi trường, lỗi đã biết); dùng kết quả, **ghi mã bài học đã dùng** vào báo cáo Bước 1. Không đọc cả thư mục `kien-thuc/`.
    - **Tiết kiệm token / không đọc trùng:** đã đọc một tệp / trang trong phiên thì không đọc lại (nhớ kết luận); chỉ đọc đoạn cần (`bb.js tep … --dong a-b` hoặc `--tim <regex>`, `Read` có offset / limit); Confluence đã có bản lưu cùng phiên bản thì `confluence.js` không tải lại; truy vấn CSDL luôn có `TOP`.
16. Test chạy trượt phải phân loại: lỗi phần mềm, lỗi kịch bản, hay lỗi môi trường.
17a. **Đọc code đúng nhánh của môi trường đang test:** DEV chạy nhánh `dev` (bb.js tự mặc định; riêng `invoice-service` dùng `dev_ei` / `dev_vte` / `dev_ngp` — hỏi tester); UAT chưa rõ nhánh ⇒ hỏi. Báo cáo ghi nhánh + commit đã đọc. **Môi trường `dev_bia` / `uat_bia`: đọc qua Code-Insight bằng repo có hậu tố `-bia` (vd `easyposbackend-bia`, nhánh `dev-bia` / `bia-prod-test`); chưa có bản chụp `-bia` thì nói rõ "mã đọc được là nhánh dev, KHÔNG phải nhánh đang chạy trên môi trường này" và không kết luận lệch tài liệu ↔ code.** Chi tiết: `rules/QUY-TRINH.md`.
17. Claude **không** sửa code ứng dụng EasyPOS, không deploy, không merge / push nhánh của dự án. Việc của Claude là kiểm thử và báo cáo.
18. **Kit tự đồng bộ với `main`** (`dong-bo.js`): lệnh chạy test chỉ qua khi kit đã mới (cổng của hook). Claude **không** chạy `git commit / push / pull / reset…`, **không** đặt `EP_BO_QUA_DONG_BO`, không sửa tệp đồng bộ; bài học đã duyệt TỰ lên kho chung (`bai-hoc.js them … --ghi` tự gửi, lỗi thì lần mở phiên sau tự gửi lại) — Claude không cần chạy `dong-bo.js gui`. Bị cổng chặn (mã 10 / 11 / 12) ⇒ làm theo thông báo, mã 12 thì dừng và báo người phụ trách.
