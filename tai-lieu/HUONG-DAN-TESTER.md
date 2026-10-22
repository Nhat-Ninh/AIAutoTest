# Hướng dẫn sử dụng bộ AI Auto Test EasyPOS — dành cho tester mới (từ bước đầu đến bước cuối)

> Cập nhật 22/10/2026. Viết cho người **chưa từng làm auto test**. Đọc lần lượt từ Phần 1 đến Phần 12; mỗi phần có mục **Kiểm tra đã đúng** để bạn biết mình làm đúng trước khi sang phần sau.
> Tài liệu cho người phụ trách bộ kit (cấu hình, cài đặt cho nhóm) nằm ở `HUONG-DAN-AP-DUNG-EASYPOS.md`. Hiểu hệ thống EasyPOS: `EASYPOS-BAN-DO.md`.

---

## Phần 0. Bộ công cụ này là gì (đọc 3 phút)

Bạn nói với Claude một câu như *"Kiểm thử chức năng Tạo sản phẩm trên dev"*. Claude sẽ:

1. đọc code và tài liệu, viết **testcase**;
2. viết **kịch bản tự động** (Playwright) rồi **chạy thật** trên trình duyệt như người dùng, chụp ảnh từng bước và gọi API trực tiếp;
3. **tra CSDL** (chỉ đọc) để kiểm dữ liệu có đúng không;
4. viết **báo cáo** và **lỗi theo mẫu Jira** để bạn đưa cho dev.

Vai trò của bạn: **giao việc, đọc từng báo cáo và bấm Duyệt / Sửa lại / Dừng**, tự tay làm các việc nhạy cảm (nhập mật khẩu, tạo ticket Jira). Claude không thay bạn quyết định.

| Thành phần | Vai trò | Bạn cần biết gì |
|---|---|---|
| **Claude** (trong VS Code) | Bộ não: đọc code, viết testcase / kịch bản / báo cáo | Cách giao việc (Phần 6) |
| **Playwright** | Đôi tay: mở trình duyệt, gõ, bấm, chụp ảnh, gọi API | Biết đọc kết quả (Phần 8) |
| **dbq.js** | Mắt nhìn vào CSDL: chạy câu `SELECT` | Claude tự dùng; chỉ đọc |
| **Hook bảo vệ** | Bảo vệ cửa: chặn lệnh nguy hiểm | Đừng tìm cách lách (Phần 11) |
| **Cấu hình** (`config/moi-truong.json`) | Địa chỉ, cách đăng nhập | Người phụ trách bộ kit điền; tester **không sửa** |
| **Tệp tài khoản** (`tai-khoan.json`) | Tài khoản của **riêng bạn** | Bạn tự điền (Phần 4) |

**Hai môi trường:**

| Khoá | Là gì | Dùng khi |
|---|---|---|
| `dev` | Môi trường dev dùng chung (`http://10.100.110.78/`, CSDL `easyposbackoffice`) | **Mặc định** — luôn test ở đây trước |
| `uat` | `https://uat.easypos.vn` (application `prodTest`, CSDL `easyposuat`) | **Tùy chọn của bạn** — xem Phần 9 |

Hệ thống **thật của khách (PROD)** tuyệt đối không test; bộ kit chặn bằng máy.

---

## Phần 1. Chuẩn bị máy (khoảng 20–30 phút, làm một lần)

Máy Windows, cần quyền cài phần mềm.

| # | Cài gì | Lấy ở đâu | Kiểm tra |
|---|---|---|---|
| 1 | **VS Code** | https://code.visualstudio.com/download | Mở được |
| 2 | Extension **Claude Code** | VS Code → Extensions → gõ "Claude Code" → Install | Thấy biểu tượng Claude trong VS Code |
| 3 | **Git** | https://git-scm.com/download/win | `git --version` ra số phiên bản |
| 4 | **Node.js bản LTS (≥ 18)** | https://nodejs.org/en/download | `node -v` ra số phiên bản |

**Cách chạy lệnh kiểm tra:** nhấn `Windows + R`, gõ `cmd`, Enter; gõ từng lệnh rồi Enter. Cài xong Node mà báo `'node' is not recognized` → **đóng cửa sổ cmd, mở lại** (Windows chỉ nhận lệnh mới ở cửa sổ mới). Nếu vẫn lỗi trong PowerShell: `$env:Path = 'C:\Program Files\nodejs;' + $env:Path`.

Xin người phụ trách: (a) **link repo bộ kit** `easypos-tester-kit` trên Bitbucket và quyền đọc; (b) quyền vào Jira (`https://jira-sds.softdreams.vn:8080/`, project **EPB**).

**Kiểm tra đã đúng:** `git --version`, `node -v`, `npm -v` đều ra số phiên bản; VPN bật và mở được `http://10.100.110.78/`.

---

## Phần 2. Lấy bộ kit và cài đặt

1. Mở **cmd**, tải bộ kit về một chỗ **cố định** (đừng dời / xoá sau này):
```bash
git clone <https://github.com/Nhat-Ninh/AIAutoTest> C:\easypos-tester
```
(Cmd hỏi tài khoản thì dùng tài khoản Bitbucket công ty.)

2. Mở thư mục `C:\easypos-tester` trong File Explorer, **bấm đúp `CAI-DAT.cmd`**. Chờ 1–3 phút, đọc màn hình đen:
   - Mục *1. Kiểm công cụ*: `[OK] Node …`, `[OK] git …`.
   - Mục *2. Vị trí cài đặt*: "Ban clone git - cai tai cho C:\easypos-tester".
   - Mục *3. Cài hook*: dòng `112/112 ca đúng` (hoặc nhiều hơn, miễn hai số bằng nhau).
   - Mục *4. Playwright*: tự cài trình duyệt kiểm thử (vài phút lần đầu).
   - **Không được có dòng đỏ `[X]`.** Xong bấm phím bất kỳ để đóng.

3. VS Code: **File → Open Folder → `C:\easypos-tester`**. Rồi `Ctrl+Shift+P` → gõ **Developer: Reload Window** → Enter. Mở **cuộc trò chuyện Claude mới** (hook chỉ nạp ở phiên mới).

> ⚠️ **Hook cài toàn máy.** Nếu máy bạn còn dùng Claude để viết code Java / sửa dự án, hook sẽ hỏi nhiều hơn (ví dụ hỏi mỗi lần đọc `application-dev.yml`, chặn viết code có JDBC). Đó là bình thường với máy tester. Muốn gỡ: bấm `GO-CAI-DAT.cmd`. Mỗi máy chỉ cài **một** bộ kit.

**Kiểm tra đã đúng:** trong cuộc trò chuyện Claude mới, hỏi *"EP_KIT ở đâu, có những luật gì?"* → phải ra đường dẫn `C:/easypos-tester` và danh sách luật (dev mặc định, UAT tùy chọn, mật khẩu, dừng chờ duyệt…).

---

## Phần 3. Hiểu thư mục bộ kit (để biết cái gì ở đâu)

```
C:\easypos-tester\
├─ CAI-DAT.cmd / CAP-NHAT.cmd / GO-CAI-DAT.cmd   ← cài / cập nhật / gỡ
├─ config\moi-truong.json      ← địa chỉ dev / uat, cách đăng nhập (người phụ trách giữ, bạn không sửa)
├─ e2e\tests\<chức năng>\      ← kịch bản Playwright Claude viết cho từng chức năng
├─ bao-cao\<ngày>_<chức năng>\ ← BÁO CÁO của bạn (mở đây mỗi lần)
├─ rules\RULES.md              ← luật Claude phải tuân thủ
├─ mau-bao-cao\                ← mẫu báo cáo 00…06
└─ tai-lieu\                   ← các tài liệu này
```
**Tệp tài khoản của bạn nằm NGOÀI thư mục này:** `C:\Users\<tên bạn>\.easypos-tester\tai-khoan.json` — vì thế không bao giờ bị đẩy lên git.

---

## Phần 4. Điền tài khoản (bạn TỰ làm, không nhờ Claude)

1. Mở tệp `C:\Users\<tên bạn>\.easypos-tester\tai-khoan.json` bằng VS Code (`Ctrl+O`, dán đường dẫn). Chưa có tệp thì `CAI-DAT.cmd` đã tạo từ mẫu `config\tai-khoan.example.json`.
2. Điền khối **`dev`** (khối `uat` điền sau nếu muốn dùng UAT):

```json
{
  "dev": {
    "web": { "user": "<tên đăng nhập EasyPOS>", "password": "<mật khẩu>" },
    "db":  { "user": "<user CSDL>",              "password": "<mật khẩu CSDL>" }
  },
  "uat": {
    "web": { "user": "", "password": "" },
    "db":  { "user": "", "password": "" }
  }
}
```

| Ô | Là gì | Lưu ý |
|---|---|---|
| `web.user / password` | Tài khoản **đăng nhập phần mềm EasyPOS** | Tài khoản **dữ liệu giả**, **tắt OTP** (bật OTP thì kịch bản không đăng nhập được). Xin dev / QA lead |
| `db.user / password` | Tài khoản **CSDL** để Claude tra dữ liệu | Ưu tiên tài khoản chỉ-đọc. Hiện dev / UAT có thể dùng tài khoản của ứng dụng (người phụ trách hướng dẫn); bộ kit chỉ chạy `SELECT` |

3. **Bấm Ctrl+S.** Tab còn dấu chấm tròn = chưa lưu (lỗi thường gặp nhất!). Cẩn thận dấu `"` và dấu `,`.

**Quy tắc bắt buộc:**
- ❌ **Không dán mật khẩu vào chat với Claude.** Hook chặn Claude đọc / ghi tệp này; mật khẩu trong chat sẽ nằm trong lịch sử trò chuyện.
- ❌ Không commit / gửi tệp này cho ai.
- Mỗi tester dùng tài khoản của mình.

**Kiểm tra đã đúng** (chỉ hiện True/False, không lộ mật khẩu) — mở PowerShell:
```powershell
$j = Get-Content "$env:USERPROFILE\.easypos-tester\tai-khoan.json" -Raw -Encoding UTF8 | ConvertFrom-Json
"web.user=$([bool]$j.dev.web.user) web.password=$([bool]$j.dev.web.password) db.user=$([bool]$j.dev.db.user) db.password=$([bool]$j.dev.db.password)"
```
Cả bốn phải là `True`.

---

## Phần 5. Kiểm tra bộ kit chạy được (3 lớp, làm một lần)

Mở terminal trong VS Code (`Ctrl+`` `) rồi chạy lần lượt. **Lớp nào lỗi thì dừng, sửa lớp đó** (bảng lỗi ở Phần 11).

**Lớp 1 — Hook:**
```bash
cd C:\easypos-tester
node hooks/guard-easypos.test.js
```
Đạt khi dòng cuối là `N/N ca đúng` (hai số bằng nhau, không dòng `SAI`).

**Lớp 2 — Đăng nhập (giao diện + API):**
```bash
cd C:\easypos-tester\e2e
npx playwright test tests/_kiem-moi-truong --project=dev
```
Đạt khi `3 passed`:

| Bài | Kiểm gì | Lỗi thì thường là |
|---|---|---|
| KIEM-01 | Mở được trang web dev | Quên VPN / sai địa chỉ |
| KIEM-02 | Đăng nhập API + gọi API cần đăng nhập | Sai tài khoản; tài khoản bị khoá |
| KIEM-03 | Đăng nhập trên giao diện thật | Sai tài khoản / bật OTP |

(`skipped` = thiếu tài khoản trong `tai-khoan.json`; quay lại Phần 4.)

**Lớp 3 — Đọc CSDL:** tạo tệp `C:\easypos-tester\kiem.sql` chứa đúng một dòng:
```sql
SELECT @@SERVERNAME AS may, DB_NAME() AS csdl
```
rồi chạy (**dùng đường dẫn đầy đủ như dưới đây** — hook chỉ chấp nhận cách gọi này):
```bash
node "C:/easypos-tester/tools/tester/dbq.js" dev "C:/easypos-tester/kiem.sql"
```
Đạt khi in ra `csdl = easyposbackoffice`. Dòng `# CANH BAO … tai khoan sa` là cảnh báo có chủ ý (không phải lỗi).

---

## Phần 6. Giao việc cho Claude

### 6.1 Một tin nhắn nên có đủ 4 thứ
1. **Môi trường:** `dev` (mặc định).
2. **Tài khoản:** "khoá dev trong tai-khoan.json" (Claude không hỏi mật khẩu).
3. **Chức năng cần kiểm** + **tài liệu** nếu có: tệp testcase Excel (chuột phải tệp → *Copy as path* → dán đường dẫn), mã Jira `EPB-…`, hoặc trang Confluence xuất ra PDF/Word.
4. **Cách kiểm:** giao diện / API / cả hai; có tra CSDL không.

**Mẫu:**
```
Môi trường: dev (EasyPOS)
Tài khoản: khoá dev trong tai-khoan.json (mật khẩu tôi đã tự điền)
Chức năng: Tạo sản phẩm (màn hình Quản lý sản phẩm), hàng hóa thường
Tài liệu: Jira EPB-xxxxx  (hoặc: chỉ đọc từ code)
Cách kiểm: Playwright cả giao diện (chụp ảnh) lẫn API, rồi tra CSDL chỉ-đọc đối chiếu.
```
Ngắn gọn cũng được: *"Kiểm thử chức năng Mở/đóng ca trên dev."*

### 6.2 Mẹo giao việc
- **Mỗi lần một chức năng nhỏ** (ví dụ *mở ca*, rồi *đóng ca*) — nhanh hơn, dễ duyệt hơn nhiều so với cả module.
- Nên làm **chức năng đơn giản trước**: đăng nhập → danh sách sản phẩm → tạo sản phẩm → tạo đơn.
- **Chạy song song:** mở thêm cuộc trò chuyện Claude mới, mỗi cái một chức năng. Hai phiên chạy cùng lúc nên dùng **công ty test khác nhau** hoặc chức năng không đụng nhau (ví dụ ca làm việc, khoá sổ ảnh hưởng cả công ty ⇒ chạy riêng).
- **Hết lượt dùng giữa chừng:** gõ `/login` để đổi tài khoản Claude, rồi nhắn *"đọc bao-cao\<thư mục> và làm tiếp từ bước <số>"*. Mọi việc đã làm đều nằm trong các tệp báo cáo.
- Muốn xem trình duyệt chạy: nói *"chạy có hiện trình duyệt (--headed)"*.

---

## Phần 7. Bảy bước và lúc bạn bấm Duyệt

Hết **mỗi bước** Claude ghi một báo cáo vào `bao-cao\<ngày>_<chức năng>\` rồi hiện hộp **Duyệt — đi tiếp / Sửa lại bước này / Dừng**. **Chưa bấm Duyệt thì Claude không làm bước sau.** Im lặng hay trả lời mơ hồ không phải là duyệt.

| Bước | Claude làm | Bạn làm / chọn | Báo cáo |
|---|---|---|---|
| **0 Phạm vi** | Hỏi 3–4 câu | Chọn: UI / API / cả hai · từ code / tài liệu · nhanh / đầy đủ · (loại dữ liệu) | `00-pham-vi.md` |
| **1 Phân tích** | Đọc code theo luồng (giao diện → gateway → dịch vụ), nêu quy tắc nghiệp vụ và **điểm đáng nghi** | Đọc kỹ; chấm theo code / tài liệu | `01-phan-tich.md` |
| **2 Testcase** | Lập danh sách testcase (mã `TC-FE-…`, `TC-BE-…`), dữ liệu mong đợi, việc test tay | Duyệt hoặc bớt / thêm ca | `02-testcase.md` |
| **3 Kịch bản** | Viết kịch bản Playwright trong `e2e\tests\<chức năng>\` | Chọn **chạy ở môi trường nào** (dev) và **có giữ dữ liệu `AUTO_` để tra CSDL không** (nên giữ) | `03-kich-ban.md` |
| **4 Chạy** | Chạy thật, chụp ảnh, **sửa kịch bản nếu trượt vì lỗi kịch bản** và chạy lại | Có thể hỏi "chạy tới đâu rồi" | `04-ket-qua-dev.md` |
| **5 Kiểm dữ liệu** | Tra CSDL (chỉ đọc), mỗi dòng ghi **Khớp / KHÔNG khớp** | Quyết định **dọn dữ liệu `AUTO_` ngay hay giữ lại** cho dev xem | `05-kiem-du-lieu-dev.md` |
| **6 Tổng kết** | Bảng testcase, lỗi viết sẵn theo mẫu Jira, việc test tay, mục cần BA chốt | Chốt báo cáo | `06-tong-ket.md` |
| **6b Hỏi UAT** | Hỏi có chạy lại trên UAT không | Chọn Có / Không / Để sau (Phần 9) | mục "Chạy UAT" trong `06` |

**Cách đọc từng báo cáo:** đừng bấm Duyệt vội. Bước 1–2 là lúc bạn học được nhiều nhất và có thể sửa hướng (ví dụ thêm ca còn thiếu). Bước 4–6 là lúc bạn quyết định lỗi nào đáng báo.

---

## Phần 8. Đọc kết quả và phân loại

Mở `bao-cao\<ngày>_<chức năng>\06-tong-ket.md` **trước**. Mỗi testcase là một trong bốn loại:

| Ký hiệu | Nghĩa | Việc của bạn |
|---|---|---|
| ✅ **Đạt** | Chạy thật **và** dữ liệu CSDL đúng | — |
| ❌ **Không đạt** | Lỗi phần mềm, có bằng chứng (ảnh, phản hồi API, SQL) | Báo lỗi (Phần 10) |
| ⚠️ **Cần BA chốt** | Hành vi chạy được nhưng khác / mâu thuẫn tài liệu hoặc thông báo | Hỏi BA / PO, **không** tính là lỗi vội |
| ⏸ **Chưa chạy** | Test tay, hoặc môi trường chưa cho phép chạy. **Không bao giờ tính là đạt** | Xem lý do (thường là thiếu quyền / dữ liệu) |

**Mỗi test trượt phải được phân loại đúng nguồn gốc** — đây là kỹ năng quan trọng nhất của tester:

| Loại | Dấu hiệu | Ví dụ thật đã gặp |
|---|---|---|
| **Lỗi phần mềm** | Hệ thống làm sai so với kỳ vọng, tái hiện được | Trùng mã sản phẩm trả HTTP 500 thay vì 400 |
| **Lỗi kịch bản** | Kịch bản chọn sai nút / sai API; sửa kịch bản là xong | Tìm sản phẩm bằng API của màn bán hàng thay vì màn quản lý |
| **Lỗi môi trường** | Dữ liệu / quyền / mạng của môi trường test | Tài khoản test chưa có quyền "mở ca"; hộp thoại "hết số lượng hóa đơn" che màn hình |

**Xem ảnh và báo cáo chi tiết:**
- Ảnh từng bước: thư mục `e2e\test-results\…` (hoặc thư mục `bao-cao` nếu Claude đã chép sang).
- Báo cáo Playwright đẹp (có video / trace khi trượt): `cd e2e` rồi `npx playwright show-report`.

**Dữ liệu `AUTO_`:** mọi dữ liệu test tạo ra có tên / mã bắt đầu `AUTO_` để nhận ra và dọn. Claude **không** sửa / xoá dữ liệu không phải `AUTO_`. Dev dùng chung môi trường nên đừng xoá tay dữ liệu `AUTO_` trước khi Claude kiểm CSDL xong; dọn bằng cách chọn "dọn" ở bước 5 (xoá mềm qua API) hoặc xoá qua giao diện.

---

## Phần 9. UAT — tùy chọn của bạn

**Không phải lần nào test xong dev cũng cần lên UAT.** Claude **không tự chạy UAT**. Ngay sau khi bạn duyệt bước 6 của lượt dev, Claude hỏi:

> *"Đã kiểm thử xong trên dev. Có muốn chạy lại cùng bộ kịch bản trên UAT (https://uat.easypos.vn) không?"* — **Có** · **Không, kết thúc ở dev** · **Để sau**

- **Không / Để sau** → kết thúc; báo cáo ghi "UAT: chưa chạy".
- **Có** → Claude kiểm bạn đã điền khối `uat` chưa (chỉ báo đủ / thiếu), chạy lại **đúng bộ kịch bản** với `--project=uat`, tra CSDL `easyposuat`, viết `04-ket-qua-uat.md`, `05-kiem-du-lieu-uat.md`, và nêu **khác biệt dev ↔ UAT**.

**Để dùng UAT bạn cần (một lần):** điền khối `uat` trong `tai-khoan.json` (tài khoản web UAT tắt OTP + tài khoản CSDL UAT; **tài khoản dev chưa chắc dùng được ở UAT**), rồi kiểm: `npx playwright test tests/_kiem-moi-truong --project=uat`.

---

## Phần 10. Báo lỗi lên Jira

Claude soạn **nháp** từng lỗi trong `06-tong-ket.md` (hoặc tệp `BUG-<n>-jira-nhap.md` nếu bạn nhờ), theo mẫu: tiêu đề · môi trường · bước tái hiện · kết quả thực tế · kết quả mong đợi · bằng chứng · mức độ.

**Bạn duyệt nháp, rồi tự tạo ticket** (Claude không giữ mật khẩu Jira, không tự tạo):
1. Bật VPN, mở `https://jira-sds.softdreams.vn:8080/`, đăng nhập.
2. **Create** → Project **EPB**, Issue Type **Bug**.
3. Điền: Summary (theo nháp), Priority, **Component** (ví dụ *Sản phẩm*), Environment (dev + địa chỉ), Labels (`auto-test`, `dev`, tên chức năng).
4. Dán Description: copy khối trong nháp (không copy dòng ``` ở đầu / cuối). Nếu ô có hai tab **Visual / Text**, chuyển sang **Text** (nháp viết bằng định dạng wiki của Jira Server). Bấm Preview kiểm tra.
5. Đính kèm ảnh bằng chứng và (nếu cần) tệp kết quả JSON — **mở xem trước, không được chứa mật khẩu / token**.
6. Thêm **issue link** (relates to) tới ticket gốc nếu có; bấm **Create**; gửi mã ticket (`EPB-…`) cho Claude để ghi vào `06-tong-ket.md`.

**Không đưa vào ticket:** mật khẩu, token, tài khoản CSDL (`sa`), thông tin đăng nhập máy khách (UltraViewer…). Dữ liệu khách thật nếu lỡ thấy: che / rút gọn.

**Mục "⚠️ Cần BA chốt"** không phải bug: hỏi riêng BA / PO (hoặc comment vào ticket gốc), đừng tạo bug.

---

## Phần 11. Những việc KHÔNG làm, và khi bị chặn

- ❌ **Không dán mật khẩu / token vào chat.** Không nhờ Claude đọc `tai-khoan.json`.
- ❌ **Không test trên PROD** (`easypos.vn`, `app.easypos.vn`, `api.easypos.vn`, `easyposs.vn`…). Không bật `EP_CHO_PHEP_PROD`.
- ❌ **Không bấm `CAP-NHAT.cmd` khi Claude đang chạy test** (có thể làm mất kịch bản chưa lưu).
- ❌ Không xoá tay dữ liệu `AUTO_…` trước khi Claude kiểm CSDL xong.
- ❌ Không sửa `config\moi-truong.json`, hook, luật nếu chưa được người phụ trách đồng ý.
- ⛔ **Hook chặn một lệnh ⇒ Claude dừng và báo. Đừng tìm cách lách** (đổi cách viết lệnh, chạy qua chương trình khác…). Đọc lý do, hỏi người phụ trách.

**Hook chặn / hỏi những gì (tóm tắt):** đọc / in / ghi tệp mật khẩu; nối CSDL trực tiếp (chỉ `dbq.js` được nối, chỉ `SELECT`); gọi mạng tới địa chỉ PROD; chạy ứng dụng với profile `prod`. Hook **hỏi** trước khi: đọc `application-dev.yml`/`application-prodTest.yml`, sửa cấu hình / luật / hook, ghi vào Jira / Bitbucket / Confluence bằng lệnh.

### Bảng lỗi thường gặp (đều đã gặp thật)

| Triệu chứng | Nguyên nhân | Cách xử |
|---|---|---|
| `'node' is not recognized` | Chưa cài Node / chưa mở cửa sổ mới | Cài Node LTS; **đóng và mở lại** cmd / VS Code |
| `git clone` hỏi mật khẩu / 403 | Chưa có quyền repo / quên VPN | Bật VPN; xin quyền; đăng nhập đúng tài khoản Bitbucket |
| KIEM-01 lỗi (không mở được trang) | Quên VPN / sai `webUrl` | Bật VPN; mở thử `http://10.100.110.78/` |
| Test báo `skipped` hàng loạt | Thiếu tài khoản, **hoặc** tài khoản thiếu quyền (ví dụ quyền mở ca) | Xem lý do trong báo cáo (⏸ lỗi môi trường); điền tài khoản / xin cấp quyền |
| `Chua co tai khoan CSDL…` (dbq) | Thiếu `db.user / password` hoặc **chưa lưu tệp** | Phần 4; nhớ Ctrl+S |
| `Login failed for user` (dbq) | Sai mật khẩu CSDL | Sửa `db` trong tai-khoan.json. **Đừng thử lại liên tục** (có thể bị khoá) |
| `TU CHOI: dbq chi chay cau DOC` | Câu SQL có từ khoá ghi (INSERT, UPDATE, DELETE, EXEC…) | Chỉ dùng `SELECT` |
| Hook chặn `dbq.js` ("Tệp chạy … có nối CSDL") | Gọi `dbq.js` bằng đường dẫn tương đối | Dùng `node "C:/easypos-tester/tools/tester/dbq.js" dev "<tệp.sql>"` (đường dẫn đầy đủ) |
| `TỪ CHỐI … PROD` | Địa chỉ khớp danh sách prod | Đúng thiết kế. Không gọi `app./api.easypos.vn`; UAT là `uat.easypos.vn` (đã khai riêng) |
| `Đăng nhập API … lỗi HTTP 404` | Sai `apiUrl` | Báo người phụ trách (F12 → Network → xem Request URL của `authenticate`) |
| `không thấy trường id_token` / `BAD_CREDENTIALS` | Sai tên / mật khẩu web, hoặc bật OTP, hoặc tài khoản bị khoá | Kiểm tai-khoan.json; xin tài khoản tắt OTP; **đừng thử sai nhiều lần** |
| Màn hình bị che bởi hộp thoại "Hướng dẫn sử dụng" / "hết số lượng hóa đơn" | Lỗi môi trường (hạn mức hóa đơn của công ty test) | Kịch bản tự đóng hộp thoại; chức năng hóa đơn cần công ty còn hạn mức |
| Kịch bản UI và API cho số liệu khác nhau | Hai bên đang ở **hai công ty khác nhau** | Báo người phụ trách (công ty cấu hình ở `dangNhap.api.congTy` của từng môi trường) |
| Lỗi chập chờn trên dev | Dev đang sửa code / vừa deploy | Chạy lại; nếu hết ⇒ ghi "lỗi môi trường", đừng báo bug |
| Máy cài nhầm hai bộ kit | Mỗi máy chỉ một bộ | `GO-CAI-DAT.cmd` của bộ kia trước |

---

## Phần 12. Hằng ngày, cập nhật và kết thúc

**Mỗi ngày làm việc:**
1. Bật **VPN**. Mở VS Code ở thư mục `C:\easypos-tester`, mở cuộc trò chuyện Claude **mới**.
2. (Tuỳ chọn) `CAP-NHAT.cmd` để lấy bản mới của bộ kit — **chỉ khi Claude không đang chạy test**. Nó tự lưu các sửa trên máy trước khi kéo bản mới.
3. Giao việc (Phần 6) → duyệt từng bước (Phần 7) → đọc `06-tong-ket.md` (Phần 8) → báo lỗi (Phần 10).

**Cuối mỗi lượt kiểm thử, tự kiểm lại:**
- ☐ Đã đọc `06-tong-ket.md` và hiểu từng ❌ / ⚠️ / ⏸.
- ☐ Mỗi lỗi ❌ có bằng chứng (ảnh / phản hồi / SQL) và đã phân loại (phần mềm / kịch bản / môi trường).
- ☐ Đã quyết dữ liệu `AUTO_` (giữ hay dọn).
- ☐ Đã trả lời câu hỏi **UAT** (Có / Không / Để sau).
- ☐ Đã tạo ticket Jira cho lỗi thật và ghi mã vào báo cáo.
- ☐ Không có mật khẩu / token nào nằm trong chat, ticket, báo cáo.

**Gỡ bộ kit** (khi chuyển máy / không dùng nữa): `GO-CAI-DAT.cmd` (giữ lại `~\.easypos-tester`; tự xoá thư mục đó nếu muốn xoá cả tài khoản).

---

## Phụ lục A. Từ điển

| Từ | Nghĩa dễ hiểu |
|---|---|
| **DEV / UAT / PROD** | Môi trường lập trình / thử trước khi phát hành / hệ thống thật của khách (cấm test) |
| **Auto test** | Chương trình làm thay người: mở trình duyệt, gõ, bấm, so kết quả |
| **Playwright** | Phần mềm điều khiển trình duyệt tự động |
| **Kịch bản (`.spec.ts`)** | Tệp mô tả các thao tác và kiểm tra |
| **Testcase** | Một tình huống kiểm: "nhập trùng mã thì bị từ chối" |
| **Project (`--project=dev`)** | Chọn môi trường để chạy |
| **API / Token (`id_token`)** | Cách chương trình nói chuyện với server / "vé" server cấp sau đăng nhập |
| **Gateway** | Cổng chung nhận mọi lời gọi `/api/…` rồi chuyển đúng dịch vụ |
| **Hook** | Đoạn code chạy trước mỗi lệnh của Claude để chặn lệnh nguy hiểm |
| **`AUTO_`** | Tiền tố dữ liệu do test tạo ra, để nhận ra và dọn |
| **`com_id`** | Cột "công ty" (tenant) trong CSDL EasyPOS; mọi câu SQL kiểm dữ liệu phải lọc theo công ty đang test |
| **HTTP 200 / 400 / 500** | Thành công / lỗi do dữ liệu người dùng / lỗi phía hệ thống |

## Phụ lục B. Ví dụ một lượt hoàn chỉnh (Tạo sản phẩm, 22/10/2026)

1. Bạn nhắn: *"Kiểm thử chức năng Tạo sản phẩm trên dev, hàng hóa thường."*
2. Bước 0: bạn chọn **cả UI + API · từ code · nhanh**. Bước 1: Claude chỉ ra quy tắc (tên bắt buộc, giá ≥ 0, trùng mã bị từ chối…) và 5 điểm đáng nghi. Bước 2: **12 testcase**. Bước 3: kịch bản `e2e\tests\tao-san-pham\`; bạn chọn **chạy dev, giữ dữ liệu `AUTO_SP_`**.
3. Bước 4: **12 đạt, 0 trượt**. Tìm thấy: trùng mã sản phẩm trả **HTTP 500** (lẽ ra 400) ⇒ lỗi phần mềm; giá bán = 0 được chấp nhận trong khi thông báo nói "phải lớn hơn 0" ⇒ ⚠️ cần BA chốt.
4. Bước 5: CSDL **khớp** ở cả 10 mục. Bước 6: tổng kết **ĐẠT kèm 1 lỗi + 2 mục BA chốt**.
5. Claude soạn nháp ticket; bạn duyệt, tự tạo trên Jira: `EPB-24095`. Câu hỏi UAT: bạn chọn **Để sau**.

Toàn bộ báo cáo mẫu này nằm ở `bao-cao\2026-10-22_tao-san-pham\` — mở ra xem để biết một báo cáo thật trông thế nào.

## Phụ lục C. Cần giúp?

- Việc liên quan **cấu hình, tài khoản, quyền, địa chỉ môi trường, cài đặt**: người phụ trách bộ kit.
- Việc liên quan **nghiệp vụ** (mục "Cần BA chốt"): BA / PO.
- Lỗi **phần mềm**: dev qua ticket Jira (project EPB).
- **Hook chặn lệnh:** dừng lại, chụp / chép thông báo, gửi người phụ trách — đừng tìm cách lách.
