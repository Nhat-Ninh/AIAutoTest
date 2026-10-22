# Đề xuất phát triển bộ kit AI Auto Test EasyPOS — Jira tự động, Confluence, và các hướng nâng cao

> Ngày 22/10/2026 · Dạng **đề xuất giải pháp**.
> **TRẠNG THÁI (cập nhật 22/10/2026): Yêu cầu 1 (Jira tự động) và Yêu cầu 2 (Confluence) ĐÃ TRIỂN KHAI** — `tools/jira/jira-tao.js`, `tools/confluence/confluence.js`, `tools/lib/atlassian.js`, `config/jira.json`, mẫu `mau-bao-cao/07-jira-nhap.md`, luật Bước 6a / 14b, loại kiểm thử "kỹ thuật" không cần nghiệp vụ. Chi tiết và phần còn lại: `HUONG-DAN-AP-DUNG-EASYPOS.md` mục D10. Phương án người tạo đã chọn: **A (PAT của từng tester)**. Điều "chưa xác minh" ở Phần 6 đã được xác minh: Jira / Confluence là Server / DC có PAT; token thử có quyền tạo issue, đính kèm, đổi reporter; Confluence có space EP. Yêu cầu 3 (gợi ý nâng cao) vẫn là đề xuất, chưa làm.
> Tách rõ: **điều đã xác minh** (đọc từ bộ kit hiện tại) và **điều chưa xác minh** (phụ thuộc cấu hình Jira / Confluence của công ty; cần admin trả lời — xem Phần 6).

---

## 0. Hiện trạng liên quan (đã đọc từ bộ kit)

| Chức năng | Hiện có | Giới hạn |
|---|---|---|
| Jira | `tools/jira/jira.js`: **đọc** một issue (GET) bằng PAT (`jira.properties` hoặc `EP_JIRA_TOKEN`) | Không tạo / sửa được. Luật 14 + hook: mọi lệnh ghi lên Jira bị **hỏi**; Claude chỉ soạn **nháp** (`BUG-n-jira-nhap.md`), tester tự tạo tay trên web |
| Confluence | Không có. Cách tạm: xuất trang ra PDF/Word rồi đưa đường dẫn tệp | Thủ công, không biết phiên bản trang, không lần theo trang con / liên kết |
| Bitbucket | `tools/tester/bb.js`: đọc mã nguồn / PR của project EPOS (GET) | Cần quyền Bitbucket của tester |
| Bảo vệ | Hook `guard-easypos`: chặn mật khẩu, PROD, nối CSDL; **hỏi** trước khi ghi lên Jira / Bitbucket / Confluence | — |

Ba yêu cầu bạn nêu đều xây được **trên nền sẵn có** (cùng kiểu công cụ Node, cùng hook, cùng quy trình 7 bước).

---

## 1. Yêu cầu 1 — Tự động tạo ticket Jira, gửi link cho tester; tester chỉ bấm Assign / Reporter

### 1.1 Mục tiêu và ranh giới
Sau Bước 6 (tổng kết), Claude **tạo ticket Bug đầy đủ nội dung** (tiêu đề, bước tái hiện, thực tế / mong đợi, môi trường, ảnh bằng chứng, issue link, component, labels) rồi **đưa link** `https://jira-sds.softdreams.vn:8080/browse/EPB-xxxxx`. Tester mở link, **chỉ bấm Assign và Reporter** (hoặc không cần gì nếu cấu hình đúng).
Ranh giới an toàn **giữ nguyên**: chỉ tạo **sau khi tester duyệt nháp trong chat**; không sửa / đóng ticket của người khác; không đưa mật khẩu / token vào ticket.

### 1.2 Ba phương án về "người tạo" (cần chọn)

| | Phương án | Reporter hiện là | Tester phải làm | Ưu | Nhược |
|---|---|---|---|---|---|
| **A** | **PAT của chính từng tester** | Chính tester (tự đúng) | Chỉ **Assign** (hoặc không gì) | Đơn giản nhất, đúng người, không cần quyền đặc biệt, truy vết rõ | Mỗi tester phải tạo PAT và đặt vào `jira.properties` (bộ kit + hook bảo vệ tệp); cần PAT được bật |
| **B** | **Tài khoản bot dùng chung** (vd `svc-autotest`) | Bot | Bấm **Reporter** đổi thành mình + **Assign** | Tester không phải giữ token; kiểm soát tập trung | Tester phải đổi reporter (đúng như bạn mô tả); cần xin tài khoản bot; token bot nằm ở máy mọi tester (rủi ro lộ) hoặc ở một máy chủ trung gian |
| **C** | **Bot + quyền "Modify Reporter"**, truyền `reporter = tester` lúc tạo | Tester (do bot đặt) | Chỉ **Assign** | Tester ít thao tác nhất, mà token vẫn là của bot | Cần admin cấp quyền *Modify Reporter* cho bot; vẫn cần chỗ giữ token bot |

**Khuyến nghị:** **A** nếu Jira bật PAT (nhanh, ít rủi ro nhất, không cần admin can thiệp nhiều); **C** nếu muốn tester gần như "chỉ bấm Assign" và công ty đồng ý một tài khoản bot. Cách **B** đúng mô tả ban đầu của bạn nhưng đẩy thêm một thao tác cho tester.
**Trường hợp tester không nên có token** (muốn tập trung): đặt một **dịch vụ trung gian nhỏ** (chạy trên một máy chủ nội bộ) giữ token bot, nhận yêu cầu từ kit, tạo ticket. Phức tạp hơn — chỉ làm nếu A / C không dùng được.

### 1.3 Luồng đề xuất

```
Bước 6 xong ─► Claude: "Có lỗi ❌ — tạo ticket Jira?"  [hộp duyệt trong chat]
      │  Tạo / Sửa nháp / Không
      ▼
 jira-tao.js --kiem-tra  (dry-run: kiểm trường bắt buộc, JQL tìm trùng, in bản xem trước)
      ▼  tester Duyệt
 jira-tao.js --tao ─► POST issue ─► đính kèm ảnh ─► issue link ─► in LINK
      ▼
 Claude ghi link vào 06-tong-ket.md + báo "mở link, bấm Assign" ─► (tùy chọn) comment vào ticket gốc
```

### 1.4 Thiết kế kỹ thuật (công cụ mới `tools/jira/jira-tao.js`)

| Việc | Cách làm (Jira Server / Data Center REST) |
|---|---|
| Đọc nháp | Nháp chuyển sang dạng **máy đọc được**: tệp `BUG-n.md` có phần đầu YAML (`project: EPB`, `issuetype: Bug`, `summary`, `component`, `priority`, `labels`, `environment`, `links`, `anh: [...]`) + thân mô tả wiki — thay cho nháp văn xuôi hiện tại |
| Biết trường bắt buộc | Gọi `GET /rest/api/2/issue/createmeta?projectKeys=EPB&issuetypeNames=Bug&expand=projects.issuetypes.fields` **một lần**, lưu lại → tự phát hiện trường bắt buộc / custom field của EPB, tránh "đoán" tên trường |
| Tạo ticket | `POST /rest/api/2/issue` (project, issuetype, summary, description wiki, components, priority, labels, environment, reporter / assignee nếu phương án C) |
| Đính kèm | `POST /rest/api/2/issue/{key}/attachments` (header `X-Atlassian-Token: no-check`, multipart) — ảnh bằng chứng + JSON kết quả (**quét bí mật** trước khi gửi) |
| Issue link | `POST /rest/api/2/issueLink` ("relates to" tới ticket gốc nếu có) |
| **Chống tạo trùng** | JQL `project = EPB AND labels = auto-test AND summary ~ "<mã lỗi>"` trước khi tạo; mỗi lỗi mang nhãn băm `at-<hash>` để chạy lại không sinh ticket thứ hai |
| Nhãn / truy vết | Luôn gắn `auto-test`, môi trường (`dev` / `uat`), tên chức năng; mô tả ghi **commit / nhánh bộ kit + địa chỉ môi trường + công ty test** |
| **Chốt an toàn** | Mặc định **dry-run**; chỉ tạo thật khi có cờ `--tao` **và** tester đã duyệt trong chat; giới hạn **tối đa N ticket mỗi lần**; chỉ **tạo mới**, **không** sửa / đóng ticket; chỉ project `EPB` + loại `Bug` (cấu hình cứng); ghi nhật ký `bao-cao/.../jira-nhat-ky.md` |
| Token | `jira.properties` ngoài repo, hook đã chặn Claude đọc; token chỉ cần quyền **tạo + đính kèm** (không xoá) |

**Điều chỉnh hook / luật:** luật 14 hiện nói "luôn soạn nháp và hỏi duyệt trước khi tạo" — **vẫn giữ**, chỉ đổi người thực hiện từ "tester tạo tay" sang "công cụ tạo sau khi tester duyệt". Cần: (1) coi `jira-tao.js` là công cụ được tin (đã có sẵn cơ chế cho `tools/jira/*.js`), (2) để hook vẫn **hỏi** với lệnh có `--tao` — đó chính là cổng duyệt thứ hai, (3) cập nhật `RULES.md`, mẫu `06-tong-ket.md`, hướng dẫn tester.

**Khi làm cho Confluence-Jira liên thông:** ticket tạo ra có thể kèm **remote link** tới trang Confluence nghiệp vụ liên quan (xem Phần 2).

### 1.5 Nỗ lực và rủi ro
- Công sức: **2–3 ngày** viết + **1 ngày** thử trên project EPB (tạo vài ticket nháp có nhãn `auto-test` rồi xoá / đóng bằng tài khoản admin).
- Rủi ro: (a) PAT chưa bật / quyền tạo issue hạn chế; (b) bắt buộc điền custom field (Sprint, Version, Team…) mà tool chưa biết → giải quyết bằng createmeta + bản đồ trường trong cấu hình; (c) tạo ticket rác nếu kịch bản sai → chặn bằng dry-run + duyệt + giới hạn số lượng + nhãn để dọn hàng loạt; (d) token bot lộ nếu để ở máy tester → ưu tiên phương án A, hoặc dịch vụ trung gian.

---

## 2. Yêu cầu 2 — Kết nối Confluence để lấy nghiệp vụ

### 2.1 Mục tiêu
Claude lấy được **tài liệu nghiệp vụ** (yêu cầu, quy tắc, luồng màn hình) từ Confluence, **biết nó đến từ trang nào, phiên bản nào**, rồi dùng làm nguồn viết testcase và **đối chiếu tài liệu ↔ code** (hiện bước này gần như trống vì chưa có tài liệu).

### 2.2 Các cách lấy (chọn một hoặc kết hợp)

| Cách | Mô tả | Ưu | Nhược |
|---|---|---|---|
| **1. Công cụ REST của bộ kit** (khuyến nghị) | `tools/confluence/confluence.js` gọi REST bằng PAT, chỉ GET | Cùng kiểu `jira.js` / `bb.js`; hook bảo vệ sẵn; tự lấy trang con / phiên bản / đính kèm | Cần Confluence bật PAT; phải viết bộ chuyển đổi nội dung |
| 2. Xuất PDF / Word thủ công | Đang dùng tạm | Không cần cấu hình | Mất cấu trúc, không có phiên bản, tester phải làm tay mỗi lần |
| 3. Máy chủ MCP cho Confluence | Cắm một MCP server có sẵn | Có thể dùng chung cho nhiều công cụ | Với Confluence Server / Data Center (địa chỉ nội bộ `:8090`) phần lớn MCP chính thức hỗ trợ **Cloud**; cần đánh giá bản cộng đồng, thêm phụ thuộc bên thứ ba cần duyệt bảo mật |

### 2.3 Thiết kế công cụ `confluence.js` (cách 1)

| Lệnh | Việc | Endpoint (Confluence Server / DC) |
|---|---|---|
| `tim "<từ khóa>" [--space KEY]` | Tìm trang theo CQL, liệt kê tiêu đề + link + ngày sửa | `GET /rest/api/content/search?cql=…` |
| `trang <id \| URL>` | Lấy nội dung trang → **markdown sạch** + phiên bản + tác giả | `GET /rest/api/content/{id}?expand=body.storage,version,ancestors` |
| `con <id>` | Liệt kê / lấy toàn bộ **trang con** (cây tài liệu một tính năng) | `GET /rest/api/content/{id}/child/page` |
| `dinh-kem <id>` | Tải ảnh / PDF / sơ đồ đính kèm (Claude đọc được ảnh) | `GET /rest/api/content/{id}/child/attachment` |
| `lien-ket <id>` | Trang nhắc tới mã Jira nào (và ngược lại: Jira → trang) | tìm mã `EPB-…` trong nội dung + remote link của Jira |

**Chuyển đổi nội dung:** Confluence lưu dạng XHTML có macro → bộ chuyển đổi giữ **tiêu đề, danh sách, bảng, đoạn code, panel / note**, thay macro khó (Jira issue, include page) bằng dòng tham chiếu; ảnh tải về cạnh tệp. Kết quả lưu `tai-lieu-nghiep-vu/<mã-trang>.md` kèm phần đầu: `Nguồn: <tiêu đề> › <URL> · Phiên bản <n> · Lấy lúc <giờ>`.

### 2.4 Tích hợp vào quy trình 7 bước

| Bước | Thay đổi |
|---|---|
| **0 Phạm vi** | Thêm câu hỏi **nguồn nghiệp vụ**: link trang Confluence / từ khóa / "lấy từ ticket Jira EPB-… (theo liên kết)" / chỉ code |
| **1 Phân tích** | Claude lấy tài liệu → lập **Bảng quy tắc nghiệp vụ `BR-01, BR-02…`, mỗi quy tắc có trích dẫn (tên trang › mục, phiên bản)** → đối chiếu với code → mục "tài liệu nói / code làm / kết luận" được điền thật (hiện đang trống) |
| **2 Testcase** | **Ma trận truy vết**: `BR → TC → kết quả`; quy tắc chưa có testcase bị đánh dấu cảnh báo |
| **6 Tổng kết** | Ghi tài liệu + phiên bản đã dùng; lệch tài liệu ↔ hành vi thành "⚠️ Cần BA chốt" **có dẫn nguồn**; link trang đưa vào ticket Jira (Phần 1) |

**Luật chống bịa (thêm vào `RULES.md`):** mọi "quy tắc nghiệp vụ" Claude nêu phải **trích dẫn trang / mục**; không trích được thì đánh dấu "suy luận từ code, không có trong tài liệu".

### 2.5 Nỗ lực và rủi ro
- Công sức: **3–4 ngày** (công cụ + bộ chuyển đổi + sửa quy trình / mẫu / hướng dẫn) + thử với 2–3 tài liệu thật.
- Rủi ro: (a) PAT / quyền đọc space; (b) tài liệu **cũ hoặc mâu thuẫn** — đó là lý do ghi phiên bản + ngày sửa và hỏi BA; (c) sơ đồ (draw.io, ảnh chụp) chứa nghiệp vụ không ở dạng chữ → tải ảnh cho Claude đọc, kèm cảnh báo độ tin cậy thấp hơn; (d) trang rất dài → cắt theo mục, chỉ nạp phần liên quan; (e) nội dung nhạy cảm (giá, hợp đồng) → chỉ đọc space được cho phép, không chép ra báo cáo gửi ngoài.

---

## 3. Yêu cầu 3 — Gợi ý nâng cao bộ kit

Xếp theo **giá trị ÷ công sức**. Cột "Ưu tiên": ★★★ nên làm sớm.

### 3.1 Nhóm A — Quy trình & truy vết
| # | Đề xuất | Lợi ích | Công sức | Ưu tiên |
|---|---|---|---|---|
| A1 | **Retest theo ticket (`/retest EPB-xxxx`)**: đọc ticket + PR (`bb.js jira`, `pr`) → xác định chỗ sửa → chạy lại **đúng kịch bản của lỗi + vài kịch bản hồi quy** → so sánh trước / sau → **comment kết quả vào ticket** (tạo bằng `jira-tao.js`) | Đóng vòng đời lỗi; dev sửa xong tester chạy lại một lệnh. (Bộ kit EasyBooks gốc có skill `fix-bug` / `so-sanh` tương tự, có thể lấy ý tưởng) | 3–5 ngày | ★★★ |
| A2 | **Ma trận truy vết** BR → TC → kết quả → ticket (xuất tệp) | Biết phủ nghiệp vụ tới đâu; cần Confluence (Phần 2) | 1 ngày | ★★★ |
| A3 | **Chọn test theo thay đổi** (impact): từ PR / commit đưa ra module bị ảnh hưởng và gợi ý bộ kịch bản (tận dụng `impact-checklist.md`, đồ thị mã) | Test đúng chỗ, tiết kiệm | 3–4 ngày | ★★ |
| A4 | **Slash command / skill** cho từng việc (`/kiem-thu`, `/retest`, `/bao-loi`) thay cho luật dạng văn bản | Quy trình ổn định, ít phụ thuộc cách Claude hiểu luật | 2 ngày | ★★ |

### 3.2 Nhóm B — Độ ổn định và dữ liệu test
| # | Đề xuất | Lợi ích | Công sức | Ưu tiên |
|---|---|---|---|---|
| B1 | **Sổ ghi dữ liệu `AUTO_`** (mỗi lần chạy ghi id đã tạo vào tệp) + lệnh **dọn an toàn** theo sổ | Dọn dữ liệu chính xác, không đoán; hiện dọn còn thủ công từng kịch bản | 1–2 ngày | ★★★ |
| B2 | **Danh bạ công ty test theo chức năng** (công ty nào có quyền ca, còn hạn mức hóa đơn, có IMEI…) + **kiểm điều kiện môi trường trước khi chạy** | Hết cảnh test bị bỏ qua vì thiếu quyền / hạn mức (đã gặp: quyền mở ca, hết hóa đơn) | 2 ngày | ★★★ |
| B3 | **Thư viện kịch bản dùng lại** (đăng nhập, tạo sản phẩm / khách hàng mẫu, đóng popup chào, chọn công ty) và **bộ chọn giao diện tập trung** | Kịch bản mới viết nhanh, ít vỡ khi giao diện đổi | 3 ngày | ★★ |
| B4 | **Bộ smoke `@smoke`** (5–10 phút) chạy một lệnh trên dev / UAT | Biết nhanh môi trường còn sống sau mỗi lần deploy | 1–2 ngày | ★★★ |
| B5 | **Phát hiện test chập chờn** (chạy lại có ghi nhận, thống kê) | Tách lỗi môi trường khỏi lỗi phần mềm | 1 ngày | ★ |

### 3.3 Nhóm C — Mở rộng phạm vi kiểm
| # | Đề xuất | Lợi ích | Công sức | Ưu tiên |
|---|---|---|---|---|
| C1 | **Kiểm API theo OpenAPI**: backend đã gắn `@Operation` (springdoc) → lấy `api-docs`, **tự sinh kiểm tra hợp đồng** (trạng thái, trường bắt buộc) và **phát hiện endpoint mới / đổi** giữa các bản | Phủ API rộng với ít công | 3–4 ngày | ★★ |
| C2 | **Kiểm phân quyền / nhiều vai trò** (cần ≥ 2 tài khoản: có / không quyền) | Phát hiện lỗi bảo mật nghiệp vụ; hiện đang để "test tay" | 2–3 ngày + xin tài khoản | ★★ |
| C3 | **Hồi quy giao diện bằng ảnh** (so ảnh chụp với bản chuẩn) | Bắt lỗi hiển thị | 2 ngày | ★ |
| C4 | **Đo thời gian phản hồi** (ngưỡng cảnh báo cho API chính) | Phát hiện chậm sớm | 2 ngày | ★ |
| C5 | **Mở rộng đọc MongoDB / Redis** (chỉ đọc) cho dữ liệu bất đồng bộ | `dbq` hiện chỉ SQL Server | 2–3 ngày | ★ |

### 3.4 Nhóm D — Chạy định kỳ và báo cáo
| # | Đề xuất | Lợi ích | Công sức | Ưu tiên |
|---|---|---|---|---|
| D1 | **Chạy tự động theo lịch / sau deploy** trên Jenkins (công ty đã có Jenkinsfile) cho bộ smoke / hồi quy, đẩy kết quả lên Jira / Teams / Zalo | Phát hiện sớm không cần người bấm | 3–5 ngày | ★★ |
| D2 | **Bảng tổng hợp** mọi lượt chạy (tỉ lệ đạt theo chức năng / tuần, lỗi hay lặp) từ các `ket-qua.json` | Có số liệu cho quản lý | 2 ngày | ★★ |
| D3 | **Nhập / xuất testcase Excel** (định dạng QA đang quen dùng) ↔ `02-testcase.md` | Tester không phải đổi cách làm | 2 ngày | ★★ |

### 3.5 Nhóm E — Vận hành bộ kit
| # | Đề xuất | Lợi ích | Công sức | Ưu tiên |
|---|---|---|---|---|
| E1 | **Gói hỗ trợ một lệnh** (`KIEM-TRA-MAY.cmd --xuat` ghi ra tệp để gửi, che mọi bí mật) | Hỗ trợ tester nhanh | 0,5 ngày | ★★★ |
| E2 | **Phiên bản + thông báo cập nhật** (kit tự báo khi có bản mới, ghi `CHANGELOG`) | Tester không dùng bản cũ | 1 ngày | ★★ |
| E3 | **Quản lý bí mật tập trung** (cấp token / tài khoản CSDL chỉ-đọc qua kho bí mật thay vì từng người tự gõ) | Giảm rủi ro rò rỉ, dễ thu hồi | tùy hạ tầng | ★★ |
| E4 | **Tài khoản CSDL chỉ-đọc thật sự** (hiện dùng `sa` của ứng dụng ở dev) | Giảm rủi ro an toàn dữ liệu | cần DBA | ★★★ |
| E5 | **Chạy thử bộ kit trên 1–2 máy tester thật** và sửa theo phản hồi | Chưa có máy ngoài nào làm hết hướng dẫn | 1 ngày | ★★★ |

---

## 4. Lộ trình đề xuất

| Giai đoạn | Nội dung | Thời gian ước tính | Kết quả |
|---|---|---|---|
| **0. Điều kiện** | Xác nhận PAT Jira / Confluence, quyền tạo issue, tài khoản bot (nếu chọn B / C), danh sách trường bắt buộc EPB; E5 (thử trên máy tester thật) | 2–3 ngày (chủ yếu chờ admin) | Biết chọn phương án nào |
| **1. Jira tự động + chống trùng** (Phần 1) + E1, B1 | `jira-tao.js`, nháp máy đọc được, cập nhật luật / hook / mẫu / hướng dẫn | ~1 tuần | Tạo ticket 1 lệnh, tester chỉ Assign |
| **2. Confluence + truy vết** (Phần 2) + A2 | `confluence.js`, bảng quy tắc nghiệp vụ, ma trận truy vết | ~1 tuần | Testcase gắn tài liệu thật |
| **3. Vòng đời lỗi và độ ổn định** | A1 (retest theo ticket), B2 (danh bạ công ty + kiểm điều kiện), B4 (smoke) | 1–2 tuần | Retest 1 lệnh; hết test bị bỏ qua vì thiếu điều kiện |
| **4. Mở rộng** | C1 (OpenAPI), C2 (phân quyền), D1 (Jenkins), D2–D3 | theo nhu cầu | Phủ rộng + chạy định kỳ |

---

## 5. Rủi ro tổng quát và nguyên tắc giữ

- **Mọi thao tác ghi lên hệ thống chung (Jira, Confluence) đều qua cổng duyệt của tester** và công cụ chỉ làm đúng phạm vi hẹp (tạo mới, có nhãn, có giới hạn, có nhật ký).
- **Token nằm ngoài repo**, hook chặn Claude đọc; token chỉ có quyền tối thiểu (đọc Confluence; tạo + đính kèm trên Jira).
- **Không bịa nghiệp vụ**: mọi quy tắc có trích dẫn nguồn.
- **PROD vẫn cấm** — không thay đổi nào ở trên nới lỏng bộ chặn.

---

## 6. Điều chưa xác minh — cần bạn / admin trả lời

Tôi đã thử đọc thông tin phiên bản công khai của Jira và Confluence từ máy này (chỉ GET) nhưng **kết nối bị đóng** (có thể do cấu hình bảo mật TLS của PowerShell 5.1 hoặc do mạng), nên **chưa biết**:

1. **Jira và Confluence là bản nào?** Server / Data Center (địa chỉ nội bộ `:8080`, `:8090` gợi ý đúng như vậy) và có hỗ trợ **Personal Access Token** không (Jira ≥ 8.14, Confluence ≥ 7.9 mới có).
2. **Tester có tự tạo được PAT** trong hồ sơ cá nhân không, hay admin phải cấp?
3. **Phương án người tạo (A / B / C)**: công ty chấp nhận tài khoản bot không; admin có cấp quyền *Modify Reporter* cho bot không.
4. **Trường bắt buộc khi tạo Bug trong project EPB** (Component, Affects Version, Sprint, custom field khác); có **assignee mặc định** theo component không.
5. **Cấu trúc tài liệu nghiệp vụ trong Confluence**: space nào, trang cha của từng module, có quy ước đặt tên không; tài liệu có hay được cập nhật không.
6. Có **chính sách** cho phép công cụ nội bộ ghi tự động lên Jira / đọc Confluence bằng tài khoản dịch vụ không (an ninh thông tin).

**Việc nhỏ có thể làm ngay để chốt 1–4 (không cần admin):** nhờ **một người có quyền** bấm tạo thử PAT trong hồ sơ Jira và Confluence và cho tôi biết trường hợp có / không; mở `https://jira-sds.softdreams.vn:8080/rest/api/2/serverInfo` và `https://confluence-sds.softdreams.vn:8090/rest/applinks/1.0/manifest` trên trình duyệt (có VPN) và gửi tôi **số phiên bản** hiện ra.
