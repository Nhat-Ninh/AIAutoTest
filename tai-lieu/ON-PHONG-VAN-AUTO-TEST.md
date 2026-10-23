# Ôn để trả lời phỏng vấn về bộ AI Auto Test EasyPOS

> Mục tiêu: sau khi đọc và làm các bài tập ở Phần 9, bạn tự giải thích được **vì sao** từng phần được thiết kế như vậy, không chỉ liệt kê tên công cụ.
> Mọi con số / chi tiết dưới đây lấy từ chính dự án này (kiểm ngày 22–23/10/2026). Khi phỏng vấn, **chỉ nói điều bạn đã làm / hiểu thật** — Phần 10 nói rõ cách trình bày trung thực.

---

## 1. Hai phiên bản "giới thiệu" để thuộc lòng

**Bản 30 giây:**
> "Bọn em xây một bộ kit kiểm thử tự động cho hệ thống bán hàng EasyPOS, chạy cùng Claude Code. Tester giao việc bằng tiếng Việt, Claude đọc code và tài liệu nghiệp vụ, đề xuất testcase, chạy test bằng Playwright trên môi trường dev, rồi báo cáo và soạn ticket Jira. Điểm quan trọng là có lớp an toàn bằng hook: máy tự chặn đụng vào production, chặn lộ mật khẩu, và mọi thao tác ghi lên Jira đều cần người duyệt."

**Bản 2 phút (thêm 3 ý):**
1. *Quy trình 7 bước có người duyệt* ở mỗi bước (phạm vi → phân tích → testcase → chạy → kết quả → báo cáo → Jira), để AI không tự đi quá phạm vi.
2. *Kiểm cả UI lẫn API và đối chiếu CSDL (chỉ SELECT)* — một testcase không chỉ "màn hình hiện đúng" mà còn "dữ liệu trong DB đúng".
3. *Đã dùng thật*: kiểm thử mở/đóng ca và tạo sản phẩm trên dev, tìm ra lỗi thật (tạo sản phẩm trùng mã trả HTTP 500) và tự tạo ticket Jira nháp để tester duyệt.

---

## 2. Bài toán và mục tiêu thiết kế

| Vấn đề trước đây | Cách bộ kit giải quyết |
|---|---|
| Tester viết testcase tay, mất thời gian, dễ sót | Claude phân tích code + tài liệu → bảng quy tắc nghiệp vụ `BR-xx` → testcase có truy vết |
| AI dễ "bịa" nghiệp vụ | Luật 14b: nghiệp vụ phải trích **trang Confluence › mục + phiên bản**; thiếu tài liệu thì **hỏi lại**, không đoán |
| Sợ AI chạm vào production / làm lộ mật khẩu | Hook chặn bằng máy (không dựa vào "AI hứa nghe lời") |
| Báo lỗi lên Jira mất công, hay trùng | `jira-tao.js`: tạo ticket đầy đủ từ nháp đã duyệt, chống trùng, đính kèm ảnh |
| Mỗi tester một máy, mỗi người một kiểu lỗi cài đặt | `CAI-DAT.cmd` + `KIEM-TRA-MAY.cmd` (9 nhóm kiểm), hướng dẫn A→Z |

Nguyên tắc xuyên suốt: **AI làm nhanh, người giữ quyết định, máy giữ ranh giới an toàn.**

---

## 3. Kiến trúc tổng thể

```
Tester ──(tiếng Việt)──► Claude Code (trong VS Code)
                           │  đọc luật: rules/RULES.md + hook SessionStart nạp lại mỗi phiên
                           │
        ┌──────────────────┼───────────────────────────────┐
        ▼                  ▼                               ▼
   ĐỌC NGUỒN SỰ THẬT   CHẠY KIỂM THỬ                    GHI RA NGOÀI
   bb.js     (Bitbucket)  Playwright e2e (UI + API)       jira-tao.js (tạo ticket)
   confluence.js (BA)     dbq.js (SQL, chỉ SELECT)        bao-cao/ (báo cáo markdown)
   jira.js   (ticket)     môi trường: dev (mặc định) / UAT
        │                  │                               │
        └────────── MỌI LỜI GỌI CÔNG CỤ ĐI QUA ───────────┘
                    hooks/guard-easypos.js  (PreToolUse: chặn / hỏi / cho qua)
```

Ba "vòng" bảo vệ (nói được ba vòng này là gây ấn tượng):
1. **Luật bằng chữ** (`RULES.md`) — định hướng cho AI.
2. **Hook bằng máy** (`guard-easypos.js`) — *ép* các luật quan trọng; AI có muốn cũng không vượt được.
3. **Giới hạn trong chính công cụ** (vd `dbq.js` chỉ cho SELECT; `jira-tao.js` mặc định chỉ xem trước) — phòng thủ nhiều lớp (defense in depth).

---

## 4. Từng thành phần: là gì · vì sao · đánh đổi

### 4.1 Playwright e2e (`e2e/`)
- **Là gì:** khung kiểm thử end-to-end (TypeScript, Playwright 1.55) điều khiển trình duyệt thật và gọi API.
- **Cấu hình đáng nhớ** (`playwright.config.ts`):
  - `workers: 1` + serial — môi trường dev **dùng chung**, chạy song song sẽ giẫm dữ liệu nhau.
  - `retries: 0` — lỗi chập chờn phải **hiện ra**, không giấu bằng chạy lại. (Đánh đổi: dễ trượt giả hơn, nhưng trung thực.)
  - Mỗi môi trường là một *project*: `--project=dev|uat`. Địa chỉ prod bị chặn ngay lúc nạp cấu hình.
  - Chỉ lưu trace / ảnh / video **khi trượt** (tiết kiệm dung lượng). Video chỉ bật nếu máy có ffmpeg.
- **Fixtures** (`lib/fixtures.ts`) — khái niệm hay bị hỏi: fixture là phần "chuẩn bị" được Playwright tiêm vào test.
  - `api`: gọi API đã đăng nhập; `phien`: thông tin phiên (companyId, userId, cờ quản lý ca…); `dangNhapUI`: đăng nhập qua giao diện và chọn đúng công ty.
  - Lợi ích: mỗi test không tự đăng nhập lại, mã đăng nhập nằm một chỗ; đổi cách đăng nhập chỉ sửa một nơi.
- **Vì sao vừa UI vừa API:** API nhanh, ổn định, kiểm được quy tắc nghiệp vụ; UI kiểm người dùng thật thấy gì. Kết hợp thì khi trượt biết ngay lỗi ở tầng nào.

### 4.2 Hook bảo vệ (`hooks/`)
- **Hook của Claude Code là gì:** chương trình chạy **trước** mỗi lần Claude gọi một công cụ (PreToolUse). Hook đọc lệnh, trả về: cho qua / hỏi người dùng / **chặn**. Hook SessionStart nạp luật vào đầu mỗi phiên.
- **Chặn gì:** đọc/in tệp mật khẩu; nối CSDL trực tiếp (chỉ `dbq.js` được nối); gọi mạng tới prod; chạy ứng dụng với profile prod. **Hỏi trước khi:** ghi lên Jira / Bitbucket / Confluence, sửa cấu hình / luật / hook.
- **Danh sách prod** (`prodChan`, `prodDb`) nằm trong `config/moi-truong.json`; có `khongPhaiProd` cho tên miền dev/UAT lỡ khớp tên miền prod (vd `uat.easypos.vn` nằm dưới `easypos.vn`).
- **Có test:** `guard-easypos.test.js` — 121 ca (cả ca "cố tình lách" như đổi cách viết lệnh). Nói được "hook cũng có unit test" là điểm cộng lớn.
- **Vì sao không chỉ dặn AI bằng prompt?** Prompt là *đề nghị*, hook là *cưỡng chế*. Với thứ không được phép sai (prod, mật khẩu) phải cưỡng chế bằng cơ chế ngoài AI.

### 4.3 `dbq.js` — đọc CSDL an toàn
- Chỉ nhận câu lệnh **SELECT**; chặn mọi lệnh ghi/xoá/DDL; chặn máy prod; mật khẩu lấy từ tệp cá nhân ngoài repo.
- Dùng để đối chiếu: sau khi tạo sản phẩm bằng API, kiểm bảng `product`, `product_product_unit` có đúng dòng không.
- Giới hạn trung thực: **không đọc được MongoDB / Redis** (EasyPOS dùng cả hai) → chỉ kiểm được phần dữ liệu nằm trong SQL Server.

### 4.4 Jira — `jira.js` (đọc) và `jira-tao.js` (tạo)
- Jira là bản **Server/Data Center**, xác thực bằng **PAT** (Personal Access Token) gửi qua header `Authorization: Bearer`. Token của **từng tester** ⇒ ticket có Reporter đúng là người đó.
- Luồng an toàn: **nháp `BUG-n.jira.md` → xem trước (dry-run, mặc định) → tester duyệt trong chat → `--tao`** (và hook hỏi xác nhận lần nữa).
- **Chống trùng:** gắn nhãn `at-<sha1(mã-lỗi|môi trường)[0:10]>`; trước khi tạo, truy vấn JQL theo nhãn đó — có rồi thì **chặn**; ngoài ra tìm ticket có tiêu đề gần giống để **cảnh báo**.
- **Các chốt khác:** chỉ cho project `EPB` và loại `Bug` (`config/jira.json`); quét mật khẩu/token trong mô tả và tệp đính kèm văn bản; chặn tệp đính kèm ngoài thư mục báo cáo; giới hạn 10 ticket/giờ; từ chối nháp còn chỗ `<…>` chưa điền; nhật ký `jira-nhat-ky.md`.
- **Chỉ tạo mới** — không sửa / đóng / xoá ticket của ai.
- Tuân theo "trường bắt buộc" của project bằng `createmeta` (có dự phòng endpoint cũ/mới vì bản Jira này trả 404 với endpoint cũ).

### 4.5 `confluence.js` — lấy nghiệp vụ
- Gọi REST Confluence (PAT, chỉ **đọc**), lấy trang ở dạng *storage format* (XHTML) rồi **tự viết bộ chuyển sang markdown** giữ tiêu đề, bảng, danh sách lồng, khối code, khung info/warning; có 18 ca unit test.
- Lưu kèm **số phiên bản** trang → báo cáo ghi "dùng bản v67" nên truy vết được.
- Trang của BA đã có mã **US-xx, BR-xx, NT-xx** → dùng nguyên mã để truy vết testcase ↔ yêu cầu.
- **Thiết kế "không cần nghiệp vụ":** Bước 0 hỏi *loại kiểm thử* — *nghiệp vụ / kỹ thuật / cả hai*. Loại **kỹ thuật** (vd HTTP 500, kiểm tra dữ liệu đầu vào, hiệu năng) **không gọi Confluence**, testcase ghi nguồn `Code`/`KT` và kết luận ghi rõ "chưa kiểm tính đúng nghiệp vụ".

### 4.6 `bb.js` — đọc code Bitbucket mà không clone
- Gọi REST Bitbucket Server (project `EPOS`) chỉ bằng **GET**: xem repo, nhánh, PR, diff, đọc 1 tệp ở nhánh bất kỳ, so sánh hai nhánh, tìm PR theo mã Jira.
- **Tài khoản:** token riêng (tuỳ chọn) hoặc **tài khoản Bitbucket mà Git trên máy đã lưu** (`git credential fill`, không bao giờ hiện hộp hỏi). Git lưu mật khẩu **theo từng máy chủ** nên tài khoản GitHub không liên quan.
- **Nhánh:** mặc định đọc nhánh `dev` (nhánh đang chạy trên môi trường dev); báo cáo ghi nhánh + mã commit — vì test phải đối chiếu với **đúng code đang chạy**.
- Vì sao không clone: nhanh, không tốn đĩa, và luôn là bản mới nhất; đánh đổi là phải có mạng/VPN + quyền đọc.

### 4.7 Cài đặt và "tự chẩn đoán máy"
- `CAI-DAT.cmd` cài hook, tạo tệp cấu hình mẫu ngoài repo (`~/.easypos-tester/`), cài trình duyệt.
- `KIEM-TRA-MAY.cmd` kiểm 9 nhóm (công cụ, vị trí, thư viện, cấu hình, VPN, tài khoản, CSDL, hook, Jira/Confluence/Bitbucket, đăng nhập thật) và nói **sửa thế nào**. Ra đời sau khi gặp lỗi thật trên máy tester → xem Phần 6.

---

## 5. Quy trình 7 bước — thuộc nằm lòng

| Bước | Việc | Người duyệt gì |
|---|---|---|
| 0 | Phạm vi: loại kiểm thử (nghiệp vụ/kỹ thuật/cả hai), UI/API, nguồn nghiệp vụ, nhanh hay đầy đủ | Chốt phạm vi |
| 1 | Phân tích: đọc code (FE → gateway → service) + tài liệu → bảng `BR-xx`, đối chiếu code ↔ tài liệu, chỉ ra chỗ lệch | Quy tắc nghiệp vụ |
| 2 | Testcase + truy vết (testcase ↔ BR) | Danh sách testcase |
| 3 | Viết test Playwright (+ SQL kiểm) | Mã test |
| 4 | Chạy trên **dev** | — |
| 5 | Đọc kết quả, **phân loại** trượt | Phân loại |
| 6 | Báo cáo; 6a: nháp + tạo Jira; 6b: hỏi có chạy UAT không | Báo cáo / ticket |

Tại sao có người duyệt mỗi bước: AI sai ở bước đầu sẽ kéo sai cả chuỗi; duyệt sớm rẻ hơn sửa muộn. Cũng là **trách nhiệm giải trình** — người ký là tester.

**Phân loại test trượt** (câu hỏi phỏng vấn rất hay): *lỗi phần mềm* · *lỗi kịch bản test* · *lỗi môi trường* (dev dùng chung, vừa deploy) · *thiếu dữ liệu/quyền*. Nghi môi trường ⇒ chạy lại trước khi kết luận lỗi.

**UAT là tuỳ chọn:** mặc định dev; chỉ chạy UAT khi tester chọn "Có" ở câu hỏi cuối (Bước 6b).

---

## 6. Những vấn đề thật đã gặp (kể theo mẫu STAR)

Phỏng vấn viên rất thích câu chuyện thật. Mỗi mục: **tình huống → nguyên nhân → cách xử lý → bài học.**

1. **Chạy trượt trên máy tester: thiếu ffmpeg.** Playwright cấu hình quay video nhưng máy tester chưa tải ffmpeg → test không chạy. *Xử lý:* `coFfmpeg()` kiểm trước, thiếu thì **tự tắt video** (test vẫn chạy), thêm cảnh báo và bước cài ffmpeg trong `CAI-DAT`. *Bài học:* tính năng phụ không được làm sập tính năng chính; và đừng đoán nguyên nhân — tôi đã đoán sai lúc đầu (nghi tài khoản/công ty) cho tới khi đọc đúng thông báo lỗi.
2. **Đăng nhập UI chọn nhầm công ty.** Tài khoản thuộc nhiều công ty, UI mặc định chọn công ty đầu → test mở/đóng ca sai chi nhánh/quyền. *Xử lý:* fixture `phien` chọn công ty theo thứ tự ưu tiên `EP_CONGTY_<ENV>` > cấu hình riêng > cấu hình chung, và **báo danh sách công ty hiện có** khi chọn sai. *Bài học:* dữ liệu/ngữ cảnh đa-tenant là nguồn lỗi test lớn nhất.
3. **Gọi nhầm API danh sách.** Kiểm sản phẩm vừa tạo bằng `get-with-paging` (API của màn bán hàng) thay vì `category-get-with-paging` (API màn quản lý) → không thấy sản phẩm. *Bài học:* kiểm bằng **đúng API mà màn hình thật dùng**, tra bằng cách đọc code FE.
4. **Lỗi thật tìm được:** tạo sản phẩm **trùng mã** → server trả **HTTP 500** thay vì 4xx kèm thông báo. Lập ticket nháp có ảnh bằng chứng. *Phân tích:* 500 = lỗi chưa được xử lý, đáng ra là lỗi nghiệp vụ (400) có thông báo "mã đã tồn tại".
5. **Jira `createmeta` trả 404.** Bản Server/DC mới bỏ endpoint cũ. *Xử lý:* thêm endpoint mới (`createmeta/{project}/issuetypes/{id}`) + dự phòng cả hai.
6. **Tạo ticket thử bị Jira từ chối: "Component 'Sản phẩm' is not valid".** Project EPB **không có component nào**. *Xử lý:* ticket thử thành công sau khi bỏ dòng đó; **thêm bước xem trước so sánh component với danh sách thật** để lỗi bị bắt *trước* khi tạo. *Bài học:* kiểm dữ liệu đầu vào với **nguồn sự thật** (ở đây là Jira) thay vì tin giả định. (Ticket thử: EPB-24198, do người phụ trách tự đóng/xoá.)
7. **Hook chặn cả lệnh hợp lệ của AI** khi lệnh chỉ nhắc tên tệp bí mật; cách xử lý là viết script dùng placeholder và để người dùng tự gõ thông tin, **không lách hook**. *Bài học:* hook "an toàn quá tay" cũng có chi phí (đôi lúc vướng) — nhưng chấp nhận được vì sai về phía an toàn.

---

## 7. Ngân hàng câu hỏi và gợi ý trả lời

**A. Tổng quan**
1. *Dự án này làm gì, vì sao cần?* → Phần 1, 2.
2. *Khác gì viết Selenium/Playwright thuần?* → Playwright chỉ là "tay chân" chạy test. Phần thêm vào: AI phân tích code/tài liệu và sinh testcase có truy vết, quy trình có người duyệt, lớp an toàn, tích hợp Jira/Confluence/Bitbucket.
3. *AI có thay tester không?* → Không. AI tăng tốc phần lặp (đọc code, viết nháp, soạn ticket); **người** chốt phạm vi, duyệt testcase, ký báo cáo. Mỗi bước dừng chờ duyệt.

**B. Thiết kế kiểm thử**
4. *Vì sao `workers=1`, `retries=0`?* → Phần 4.1.
5. *Test flaky xử lý thế nào?* → Không tự chạy lại giấu lỗi; phân loại (môi trường/kịch bản/phần mềm); chạy lại có chủ đích để kết luận; ghi "lỗi môi trường" nếu nghi.
6. *Dữ liệu test quản lý thế nào?* → Tiền tố `AUTO_`; chỉ tạo qua UI/API như người dùng thật; chỉ dọn dữ liệu `AUTO_` (`EP_DON=1`); không sửa dữ liệu thật.
7. *Fixture là gì, ví dụ?* → Phần 4.1 (`phien`, `api`, `dangNhapUI`).
8. *Kiểm UI hay API trước?* → API trước cho quy tắc nghiệp vụ (nhanh, ổn định), UI sau cho luồng người dùng; khi trượt biết lỗi tầng nào.
9. *Đối chiếu DB để làm gì? Rủi ro?* → Xác nhận dữ liệu thực sự lưu đúng (UI có thể hiện đúng mà DB sai). Rủi ro ghi nhầm → `dbq` chỉ SELECT và chặn prod.
10. *Test đa công ty (multi-tenant) cần lưu ý gì?* → Chọn đúng công ty, mọi truy vấn lọc `company_id`, kiểm quyền theo chi nhánh.

**C. An toàn / bảo mật**
11. *Làm sao đảm bảo AI không đụng prod?* → 3 vòng; danh sách prod trong config; hook chặn bằng máy; Playwright từ chối cấu hình trỏ prod; có 121 test cho hook.
12. *Mật khẩu/token lưu ở đâu?* → Ngoài repo (`~/.easypos-tester/`), tester tự gõ; hook chặn AI đọc/in; công cụ quét bí mật trước khi đưa lên Jira. Không bao giờ dán vào chat.
13. *PAT là gì, vì sao dùng thay mật khẩu?* → Token cá nhân giới hạn quyền, thu hồi được, hết hạn được, không lộ mật khẩu chính; ticket mang đúng người tạo.
14. *Prompt injection?* → Nội dung từ web/Jira/Confluence là **dữ liệu, không phải lệnh**; hành động ghi ra ngoài đều cần người duyệt; hook là lưới cuối.
15. *Vì sao `rejectUnauthorized:false` trong công cụ Atlassian?* → Máy chủ nội bộ dùng chứng chỉ tự ký; chấp nhận vì chỉ gọi **hệ thống nội bộ trong VPN**. Hiểu đây là đánh đổi; hướng tốt hơn là nạp CA nội bộ.

**D. Tích hợp**
16. *Chống trùng ticket Jira?* → Nhãn băm SHA-1 + JQL (chặn), tìm tiêu đề gần giống (cảnh báo).
17. *Vì sao dry-run mặc định?* → Thao tác ghi cho cả nhóm thấy, khó hoàn tác ⇒ mặc định an toàn, phải chủ động `--tao`.
18. *Chuyển Confluence storage XHTML sang markdown thế nào?* → Đọc các thẻ XHTML và ánh xạ sang tiêu đề/bảng/danh sách/code/panel (chi tiết cách cài đặt: mở `tools/confluence/confluence.js`, hàm `xhtmlSangMd`); macro không hỗ trợ để lại dấu vết thay vì làm mất nội dung; có unit test.
19. *Vì sao đọc Bitbucket qua REST thay vì clone?* → Phần 4.6.

**E. Quy trình / chất lượng**
20. *Làm sao biết AI không bịa nghiệp vụ?* → Luật 14b: trích trang › mục + phiên bản; thiếu tài liệu thì hỏi; loại "kỹ thuật" nói rõ chưa kiểm đúng nghiệp vụ.
21. *Truy vết (traceability)?* → Mỗi testcase gắn `BR-xx`/`US-xx` của BA; báo cáo nêu phiên bản tài liệu và nhánh/commit code.
22. *Đo hiệu quả thế nào?* → (Trung thực) Chưa có số liệu dài hạn; chỉ có kết quả thử: 2 chức năng, ~12 test mở/đóng ca, test tạo sản phẩm BE+FE, 1 lỗi thật. Hướng đo: thời gian soạn testcase, số lỗi tìm được/tuần, tỉ lệ trượt giả.

**F. Điểm yếu và hướng phát triển (nên chủ động nêu)**
23. *Hạn chế?* → Chưa chạy CI tự động; chỉ SQL Server (chưa MongoDB/Redis); UAT chưa cấu hình nhánh/tài khoản; chưa có số liệu hiệu quả; phụ thuộc chất lượng tài liệu BA; môi trường dev dùng chung nên có nhiễu.
24. *Làm tiếp gì?* → Chạy theo lịch (CI) + báo kết quả; hồi quy tự động sau mỗi deploy; đọc MongoDB (qua API/đọc-chỉ); chuẩn hoá bộ dữ liệu test; thêm module (bán hàng, kho, hoá đơn); dashboard.

---

## 8. Từ vựng cần nói trôi chảy

**E2E** (kiểm từ giao diện đến CSDL) · **fixture** · **dry-run** · **idempotent / chống trùng** · **defense in depth** (nhiều lớp phòng thủ) · **least privilege** (quyền tối thiểu: dbq chỉ SELECT, bb chỉ GET) · **traceability** (truy vết) · **flaky test** · **multi-tenant** · **PAT / Bearer token** · **PreToolUse hook** · **human-in-the-loop** (người duyệt trong vòng lặp).

---

## 9. Bài tập thực hành (làm xong là "thuộc" hơn đọc 10 lần)

Làm lần lượt, mỗi bài ~10–20 phút, **chỉ trên dev**:

1. **Chạy một test và đọc kết quả:** `cd e2e` → `npx playwright test tests/dang-nhap --project=dev --headed`. Giải thích dòng nào là fixture, vì sao có `phien`.
2. **Cố tình làm test trượt** (sửa một giá trị mong đợi trong bản sao tệp test, *không commit*) → mở báo cáo HTML, xem trace/ảnh. Tập phân loại 4 loại trượt.
3. **Thử hook:** nhờ Claude "in tệp tai-khoan.json" hoặc "chạy câu UPDATE bằng dbq" → quan sát hook chặn và thông báo. Mở `guard-easypos.test.js`, tìm ca tương ứng.
4. **Xem trước ticket:** chạy dry-run với `bao-cao/_thu-kit/BUG-THU.jira.md` (không `--tao`). Đọc từng dòng báo cáo: ai là Reporter, nhãn chống trùng, kiểm component.
5. **Đọc code Bitbucket:** `node tools\tester\bb.js nhanh easyposbackend dev` rồi `node tools\tester\bb.js tep easyposbackend <đường-dẫn-1-tệp-controller>`. Luyện kỹ năng "từ chức năng tìm ra code".
6. **Tự vẽ lại sơ đồ Phần 3 từ trí nhớ**, rồi so sánh. Nếu vẽ được và giải thích được mỗi mũi tên thì bạn đã nắm kiến trúc.
7. **Tự trả lời 10 câu ở Phần 7 thành tiếng, bấm giờ 1 phút/câu.** Câu nào ấp úng thì quay lại mục tương ứng.

---

## 10. Trình bày trung thực (rất quan trọng khi phỏng vấn)

- Bộ kit **dựa trên một bộ mẫu có sẵn** (của EasyBooks) và được **điều chỉnh cho EasyPOS**; phần lớn mã do **Claude Code viết cùng bạn**. Hãy nói đúng vai trò của mình: *đặt yêu cầu, chọn hướng, duyệt từng bước, kiểm tra kết quả, xử lý sự cố, quyết định về an toàn* — đó là phần có giá trị thật và bạn nói được vì đã trải qua.
- Câu nên dùng: *"Em dùng AI để tăng tốc viết mã, nhưng em chịu trách nhiệm thiết kế quy trình, lớp an toàn và kiểm chứng kết quả."* Phỏng vấn viên đánh giá cao việc bạn biết **kiểm chứng và giới hạn** của AI hơn là việc "AI làm hết".
- Đừng khẳng định điều bạn chưa đo (vd "giảm 70% thời gian"). Nói: "chưa đo dài hạn, hướng đo là…".
- Nếu bị hỏi sâu một đoạn mã bạn chưa đọc: *"Phần này em dùng Claude viết, em hiểu cơ chế là… và đã kiểm bằng…"* rồi dẫn bài tập Phần 9. Vì vậy hãy **thật sự làm Phần 9** trước khi đi phỏng vấn.
