# Hướng dẫn sử dụng bộ AI Auto Test EasyPOS — dành cho tester mới (A → Z, thiết kế để ít lỗi nhất)

> Cập nhật 22/10/2026. Viết cho người **chưa từng làm auto test**.
> **Cách dùng tài liệu này:** làm lần lượt Phần 1 → 13. Cứ **sau mỗi giai đoạn lớn có một "CỔNG KIỂM"** — chưa qua cổng thì **đừng sang bước sau**. Phần lớn lỗi của người mới đều là do bỏ qua một điều kiện ở đầu; cổng kiểm bắt lỗi đó sớm.
> **Công cụ cứu hộ quan trọng nhất: bấm đúp `KIEM-TRA-MAY.cmd`.** Nó kiểm từng điều kiện (cài đặt, VPN, tài khoản, CSDL, trình duyệt, hook) và chỉ chính xác cách sửa chỗ chưa đạt.
> Tài liệu cho người phụ trách bộ kit: `HUONG-DAN-AP-DUNG-EASYPOS.md`. Hệ thống EasyPOS: `EASYPOS-BAN-DO.md`.

---

## Phần 0. 10 điều "vàng" (đọc trước khi bắt đầu)

1. **Bật VPN công ty** mỗi khi làm việc. Không VPN = không vào được môi trường test.
2. Gõ lệnh trong **cmd** (`Windows + R` → `cmd` → Enter), **không** dùng PowerShell — PowerShell trên máy mới hay chặn `npx`.
3. **Clone đúng một lần, đúng tên thư mục** (Phần 3). Đừng clone vào trong một thư mục đã có tên giống.
4. **Đóng cửa sổ cmd / VS Code và mở lại** sau khi cài Node.js hoặc đổi biến môi trường.
5. Tài khoản **tự gõ** vào tệp, **Ctrl+S** để lưu, **không dán mật khẩu vào chat với Claude**.
6. **Mỗi lần một chức năng nhỏ**. Mỗi bước Claude dừng chờ bạn **Duyệt** — đọc báo cáo rồi mới bấm.
7. **Chỉ test `dev`** (mặc định). UAT là tùy chọn; **không bao giờ test PROD**.
8. Dữ liệu test do Claude tạo đều bắt đầu `AUTO_` — đừng xoá tay trước khi kiểm CSDL xong.
9. **Hook chặn một lệnh ⇒ dừng lại**, đừng tìm cách lách.
10. Gặp lỗi: chạy `KIEM-TRA-MAY.cmd --sau`, **chép nguyên văn kết quả** gửi người phụ trách (kết quả không chứa mật khẩu).

---

## Phần 1. Bộ công cụ này là gì (3 phút)

Bạn nói với Claude: *"Kiểm thử chức năng Tạo sản phẩm trên dev"*. Claude sẽ đọc code → lập **testcase** → viết **kịch bản tự động** (Playwright) → **chạy thật** trên trình duyệt như người dùng và gọi API → **tra CSDL** (chỉ đọc) đối chiếu → viết **báo cáo** và **lỗi theo mẫu Jira**. Hết mỗi bước Claude dừng chờ bạn **Duyệt / Sửa lại / Dừng**.

| Thành phần | Vai trò | Bạn cần biết |
|---|---|---|
| **Claude** (trong VS Code) | Bộ não: đọc code, viết testcase / kịch bản / báo cáo | Cách giao việc (Phần 8) |
| **Playwright** | Đôi tay: mở trình duyệt, gõ, bấm, chụp ảnh, gọi API | Cách đọc kết quả (Phần 10) |
| **dbq.js** | Mắt nhìn vào CSDL (chỉ `SELECT`) | Claude tự dùng |
| **Hook bảo vệ** | Bảo vệ cửa: chặn lệnh nguy hiểm | Đừng lách (Phần 12) |
| **`KIEM-TRA-MAY.cmd`** | Bác sĩ máy: kiểm điều kiện, chỉ cách sửa | Dùng ở Phần 5, 7 và khi gặp lỗi |
| **`confluence.js`** | Lấy **tài liệu nghiệp vụ** từ Confluence (chỉ đọc) cho Claude làm nguồn viết testcase | Cần token Confluence (Phần 6.4); loại kiểm thử "kỹ thuật" **không cần** |
| **`jira-tao.js`** | **Tạo ticket lỗi trên Jira** từ nháp bạn đã duyệt, đính kèm ảnh, rồi đưa link | Cần token Jira (Phần 6.4); bạn chỉ mở link và bấm **Assign** |
| **Cấu hình** (`config\moi-truong.json`) | Địa chỉ môi trường, cách đăng nhập | Người phụ trách giữ — **bạn không sửa** |
| **Tệp tài khoản** | Tài khoản của **riêng bạn** | Bạn tự điền (Phần 6) |

| Môi trường | Là gì | Khi nào |
|---|---|---|
| `dev` | Dev dùng chung — `http://10.100.140.9:8082/`, CSDL `easyposbackoffice` | **Mặc định**, luôn test ở đây |
| `uat` | `https://uat.easypos.vn` (profile `prodTest`, CSDL `easyposuat`) | **Tùy chọn của bạn** (Phần 11) |
| PROD | Hệ thống thật của khách | **Cấm**, bộ kit chặn bằng máy |

---

**Luồng của bộ kit, nhìn một lượt:**
```
[Máy tester]  tải bộ kit từ GitHub ──► CAI-DAT.cmd (cài thư viện, trình duyệt, hook)
      │
      ▼
 điền tài khoản (tai-khoan.json) ──► KIEM-TRA-MAY.cmd --sau  (cổng kiểm)
      │
      ▼
 giao việc cho Claude ─► Bước 0 phạm vi ─► 1 đọc code (Bitbucket EPOS qua bb.js, hoặc từ tài liệu)
      ─► 2 testcase ─► 3 viết kịch bản ─► 4 chạy trên DEV (trình duyệt + API) ─► 5 tra CSDL dev (dbq, chỉ SELECT)
      ─► 6 tổng kết ─► 6b hỏi có chạy UAT không ─► (bạn tự tạo ticket Jira cho lỗi thật)
 mỗi bước dừng chờ bạn Duyệt; hook chặn mọi thứ đụng PROD / mật khẩu.
```
Bộ kit đến từ **GitHub**; mã nguồn EasyPOS ở **Bitbucket** (chỉ đọc, để phân tích); môi trường test là **dev** (và **UAT** nếu bạn muốn); lỗi đưa lên **Jira**.

## Phần 2. Chuẩn bị (làm một lần, ~30 phút)

### 2.1 Phần mềm

| # | Cài gì | Lấy ở đâu | Cách kiểm (gõ trong cmd) |
|---|---|---|---|
| 1 | **VS Code** | https://code.visualstudio.com/download | mở được |
| 2 | Extension **Claude Code** | VS Code → Extensions → "Claude Code" → Install | thấy biểu tượng Claude |
| 3 | **Git** | https://git-scm.com/download/win | `git --version` |
| 4 | **Node.js LTS (≥ 18)** | https://nodejs.org/en/download | `node -v` và `npm -v` |
| 5 | **VPN công ty** | IT / người phụ trách | trình duyệt mở được `http://10.100.140.9:8082/` |

Cài Node xong mà `node -v` báo `'node' is not recognized` → **đóng cmd, mở lại** (Windows chỉ nhận lệnh mới ở cửa sổ mới).

### 2.2 Quyền truy cập — xin trước, đỡ mất thời gian
Xin người phụ trách:
- **Quyền đọc repo bộ kit** `https://github.com/Nhat-Ninh/AIAutoTest.git` (repo riêng tư: bạn cần được mời làm thành viên và đăng nhập GitHub khi Git hỏi). Có thể link/ tên repo thay đổi — dùng link người phụ trách gửi.
- **(Nên có) Quyền ĐỌC Bitbucket project `EPOS`** (`https://git-sds.softdreams.vn:7990/`). **Không cần để clone bộ kit** (bộ kit nằm ở GitHub) — nhưng ở **Bước 1 (phân tích)**, Claude đọc mã nguồn EasyPOS (`easypos-frontend`, `easyposbackend`, `easypos-product-material`…) bằng công cụ `bb.js`, công cụ này dùng quyền Bitbucket của bạn (chỉ GET, không sửa gì). Không có quyền này: phân tích bằng **tài liệu** (tệp testcase, Jira, Confluence xuất PDF) thay vì "từ code", hoặc mở sẵn thư mục mã nguồn trong VS Code nếu bạn đã có. Để `bb.js` chạy: đăng nhập Bitbucket một lần bằng `git clone` thử bất kỳ repo EPOS, hoặc đặt token chỉ-đọc trong `~\.easypos-tester\git.properties` (`git.user=`, `git.token=`).
- **Tài khoản EasyPOS dữ liệu giả cho môi trường dev**, đã **tắt OTP**, và biết **tài khoản đó vào được công ty nào** (Phần 6.3).
- **Tài khoản đọc CSDL dev** (user / mật khẩu) — người phụ trách sẽ hướng dẫn.
- Quyền vào **Jira** (`https://jira-sds.softdreams.vn:8080/`, project **EPB**, có quyền **tạo issue và đính kèm tệp**) và **Confluence** (`https://confluence-sds.softdreams.vn:8090/`, đọc được space **EP — EasyPos**). Bạn sẽ tạo **token cá nhân (PAT)** ở Phần 6.4.

### ✅ CỔNG KIỂM 1 — trước khi cài
- [ ] `git --version`, `node -v`, `npm -v` đều ra số phiên bản.
- [ ] VPN bật và mở được `http://10.100.140.9:8082/` bằng trình duyệt (thấy trang đăng nhập EasyPOS).
- [ ] Đã được mời vào repo bộ kit và có trong tay tài khoản (web + CSDL).

---

## Phần 3. Tải bộ kit về (đúng một lần)

Mở **cmd** (`Windows + R` → `cmd`), gõ **đúng** lệnh sau (có đường dẫn đích cuối cùng):

```bash
git clone https://github.com/Nhat-Ninh/AIAutoTest.git C:\easypos-tester
```
- Cmd / cửa sổ đăng nhập GitHub hỏi tài khoản → đăng nhập bằng tài khoản GitHub đã được mời.
- ⚠️ **Phải có `C:\easypos-tester` ở cuối.** Thiếu nó, Git tạo thư mục `AIAutoTest` ngay chỗ bạn đang đứng (rất hay gây lệch đường dẫn).
- ⚠️ Báo `destination path already exists`? Thư mục đã có từ trước: dùng thư mục đó (`cd /d C:\easypos-tester` rồi `git pull`), **đừng clone lồng thêm một lớp**.

**Kiểm tra:** gõ `dir C:\easypos-tester\CAI-DAT.cmd` → phải thấy tệp. Nếu báo "File Not Found", bạn đang sai thư mục — xem lại lệnh clone.

> Đường dẫn bộ kit ngắn, không dấu cách, không tiếng Việt có dấu (đừng đặt trong Desktop / Documents có tên dài hoặc OneDrive).

---

## Phần 4. Cài đặt bằng `CAI-DAT.cmd`

1. Mở thư mục `C:\easypos-tester` trong File Explorer, **bấm đúp `CAI-DAT.cmd`**. Chờ **2–10 phút** (lần đầu phải tải thư viện và trình duyệt kiểm thử). **Đừng đóng cửa sổ giữa chừng.**
2. Đọc màn hình đen. Màu **xanh `[OK]`** = tốt; **vàng `[!]`** = cảnh báo (đọc, không nhất thiết lỗi); **đỏ `[X]`** = lỗi, phải sửa:

| Mục | Phải thấy | Nếu khác |
|---|---|---|
| 1. Kiểm công cụ | `[OK] Node …`, `[OK] git …` | Cài lại theo Phần 2 rồi chạy lại |
| 2. Vị trí cài đặt | "Ban clone git - cai tai cho C:\easypos-tester" | Thấy "Da chep vao …AppData…" ⇒ bạn đang chạy ngoài thư mục clone; báo người phụ trách |
| 3. Cài hook | `112/112 ca đúng` (hoặc số lớn hơn, **hai số bằng nhau**) | Có dòng `SAI` ⇒ gửi người phụ trách |
| 4. Playwright | `[OK] Playwright mo duoc trinh duyet` **và** `[OK] Da co ffmpeg` | `[!] Khong tai duoc ffmpeg` hoặc `[!] Playwright chua mo duoc trinh duyet` ⇒ thường do mạng chặn tải; làm Phần 4.1 |
| 5. Tài khoản | Nhắc điền tài khoản | Làm ở Phần 6 |

3. Bấm phím bất kỳ để đóng cửa sổ.

### 4.1 Nếu mục 4 có cảnh báo `[!]` (không tải được trình duyệt / ffmpeg)
Mở **cmd**:
```bash
cd /d C:\easypos-tester\e2e
npx playwright install
```
Mạng công ty qua proxy: đặt proxy trước khi chạy (`set HTTPS_PROXY=http://<proxy>:<cổng>`). Vẫn không tải được: **không sao** — bộ kit dùng **Microsoft Edge có sẵn** và tự tắt quay video; test vẫn chạy (bạn chỉ không có video khi trượt).

### ✅ CỔNG KIỂM 2 — sau khi cài
- [ ] Cửa sổ cài đặt **không có dòng đỏ `[X]`**.
- [ ] Bộ thử hook ra `N/N ca đúng`.

---

## Phần 5. Mở trong VS Code và nạp hook

1. VS Code → **File → Open Folder → `C:\easypos-tester`**.
2. `Ctrl+Shift+P` → gõ **Developer: Reload Window** → Enter. (Hook chỉ nạp ở phiên **mới**.)
3. Mở **cuộc trò chuyện Claude mới** (bấm biểu tượng Claude).

> ⚠️ Hook cài **toàn máy**: nếu máy bạn còn dùng Claude để viết code Java, hook sẽ hỏi nhiều hơn (đó là bình thường với máy tester). Gỡ bằng `GO-CAI-DAT.cmd`. Mỗi máy chỉ cài **một** bộ kit.

**Kiểm tra:** hỏi Claude *"EP_KIT ở đâu, có những luật gì?"* → phải ra `C:/easypos-tester` và danh sách luật.

---

## Phần 6. Điền tài khoản của bạn (bạn TỰ làm)

### 6.1 Mở tệp
Trong cmd: 
```bash
code "%USERPROFILE%\.easypos-tester\tai-khoan.json"
```
(hoặc `notepad "%USERPROFILE%\.easypos-tester\tai-khoan.json"` nếu lệnh `code` không có). Chưa có tệp? Chạy lại `CAI-DAT.cmd` — nó tạo từ mẫu `config\tai-khoan.example.json`. Tệp này nằm **ngoài** thư mục bộ kit nên không bao giờ bị đẩy lên GitHub.

### 6.2 Điền khối `dev`
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
| `web` | Tài khoản **đăng nhập phần mềm EasyPOS** | Dữ liệu **giả**, **tắt OTP** (bật OTP thì kịch bản không đăng nhập được) |
| `db` | Tài khoản **CSDL** để Claude tra dữ liệu | Theo hướng dẫn của người phụ trách; bộ kit chỉ chạy `SELECT` |

**Nhớ `Ctrl+S`** (tab còn dấu chấm tròn = chưa lưu — lỗi số 1). Chú ý dấu `"` và dấu `,`. Khối `uat` để trống nếu chưa cần.

### 6.3 Công ty bạn sẽ test (rất quan trọng)
Bộ kit đặt sẵn công ty test dev trong `config\moi-truong.json` (hiện là `9839` — "Cửa hàng test Imei"). **Nếu tài khoản của bạn không thuộc công ty đó**, đăng nhập API sẽ lỗi: *"tài khoản này KHÔNG thuộc công ty …"* và thông báo liệt kê luôn các công ty bạn có (`id = tên`). Khi đó chọn một công ty rồi tạo `C:\Users\<bạn>\.easypos-tester\tester.json`:
```json
{ "congTy": { "dev": "<id công ty>" } }
```
(Chạy tạm một lần: `set EP_CONGTY_DEV=<id>` trong cmd.) Nếu dùng công ty riêng thì hỏi người phụ trách công ty nào còn đủ quyền / dữ liệu cho chức năng bạn test.

**Quy tắc bắt buộc:** ❌ không dán mật khẩu vào chat Claude · ❌ không gửi / commit tệp này · mỗi tester dùng tài khoản của mình.

### 6.4 Token Jira và Confluence (để tự tạo ticket và lấy tài liệu nghiệp vụ)

**Token (PAT) là gì:** "chìa khoá cá nhân" để công cụ của kit làm việc với Jira / Confluence **nhân danh bạn** — ticket tạo ra có **Reporter là chính bạn**. Mỗi hệ thống một token riêng; token **không bao giờ** vào chat hay lên git.

**Tạo token (làm cho cả Jira và Confluence):**
1. Bật VPN, đăng nhập `https://jira-sds.softdreams.vn:8080/` (hoặc `https://confluence-sds.softdreams.vn:8090/`).
2. Bấm **avatar** góc trên phải → **Profile** (Jira) / **Settings** (Confluence) → **Personal Access Tokens** → **Create token**.
3. Đặt tên (vd `easypos-tester-kit`), chọn hạn dùng (vd 90 ngày), **Create**. **Chép token ngay** — chỉ hiện một lần.

**Ghi token vào máy (tự gõ):** mỗi hệ thống một tệp trong `C:\Users\<bạn>\.easypos-tester\` (do `CAI-DAT.cmd` tạo sẵn, nằm ngoài thư mục bộ kit):

| Tệp | Dòng cần điền |
|---|---|
| `jira.properties` | `jira.token=<token Jira>` |
| `confluence.properties` | `confluence.token=<token Confluence>` |

Mở bằng cmd: `code "%USERPROFILE%\.easypos-tester\jira.properties"` (và `confluence.properties`), dán token **sau dấu `=`, không có khoảng trắng**, **Ctrl+S**. Chưa có tệp? Chạy lại `CAI-DAT.cmd`.

**Quy tắc:** ❌ không dán token vào chat Claude, ❌ không gửi cho ai, ❌ không commit. Token hết hạn / bị thu hồi thì tạo cái mới và thay vào tệp. Hook chặn Claude đọc hai tệp này.

**Kiểm tra:** `KIEM-TRA-MAY.cmd` có mục **8b** — phải thấy `[OK] Jira: token dùng được — <tên bạn>` và `[OK] Confluence: token dùng được — <tên bạn>`. Hoặc chạy riêng: `node tools\jira\jira-tao.js --toi` (in cả quyền tạo issue / đính kèm) và `node tools\confluence\confluence.js toi` (in số space đọc được).

**Không có token thì sao?** Kit **vẫn chạy test bình thường**. Chỉ khác: không tự tạo được ticket (bạn tạo tay theo Phần 12.5-B) và không tự lấy được tài liệu Confluence (đưa tài liệu cho Claude bằng PDF / Word, hoặc chọn loại kiểm thử **kỹ thuật**, Phần 8.3).

---

## Phần 7. ⚕ Kiểm tra máy bằng `KIEM-TRA-MAY.cmd` (CỔNG KIỂM 3 — quan trọng nhất)

Đây là bước thay thế việc "tự đoán" lỗi. Nó kiểm **9 nhóm điều kiện** và nói rõ chỗ nào hỏng, sửa thế nào.

1. Mở `C:\easypos-tester`, **bấm đúp `KIEM-TRA-MAY.cmd`**. (Hoặc trong cmd: `cd /d C:\easypos-tester` rồi `KIEM-TRA-MAY.cmd`.)
2. Đọc kết quả. Mỗi dòng: **`[OK]`** tốt · **`[!]`** cảnh báo (đọc; thường không chặn) · **`[X]`** lỗi phải sửa — kèm dòng **`→`** chỉ cách sửa.
3. Sửa hết `[X]` theo dòng `→`, **chạy lại** cho đến khi báo **"máy sẵn sàng"**.
4. Rồi chạy bản đầy đủ có thử đăng nhập thật: `KIEM-TRA-MAY.cmd --sau` (trong cmd) — mất ~30 giây. Phải ra **"3/3 bài kiểm đăng nhập đạt"**.

| Nhóm | Kiểm gì | Lỗi thường gặp và cách sửa |
|---|---|---|
| 1. Công cụ | Node ≥ 18, Git, npm | Cài lại, mở cmd mới |
| 2. Vị trí bộ kit | Có `hooks\`, `e2e\`; đường dẫn gọn | Clone thừa một lớp thư mục → Phần 3 |
| 3. Thư viện + trình duyệt | `npm install` đã chạy; có chromium / Edge; có ffmpeg | `cd /d C:\easypos-tester\e2e` → `npm install`, `npx playwright install` |
| 4. Cấu hình dev | Có địa chỉ dev | `CAP-NHAT.cmd` hoặc báo người phụ trách |
| 5. Mạng / VPN | Mở được web dev và API dev | **Bật VPN** |
| 6. Tài khoản | Khối `dev` đủ 4 ô | Điền, **Ctrl+S** (Phần 6) |
| 7. CSDL | Đọc được `easyposbackoffice` | Sai mật khẩu CSDL / VPN. **Đừng thử lại liên tục** (có thể bị khoá) |
| 8. Hook | Đã cài hook, `EP_KIT` đúng thư mục | `CAI-DAT.cmd` → Reload Window |
| 8b. Jira / Confluence | Token dùng được, có quyền tạo ticket | Tạo / ghi lại token (Phần 6.4). Chỉ là cảnh báo `[!]`, không chặn |
| 9. Đăng nhập thật (`--sau`) | 3 bài kiểm đăng nhập giao diện + API | Xem bảng lỗi Phần 13 |

> **Khi cần nhờ hỗ trợ:** chạy `KIEM-TRA-MAY.cmd --sau`, **chọn toàn bộ chữ trên cửa sổ, chép và gửi** người phụ trách. Kết quả không chứa mật khẩu và cho biết ngay bạn kẹt ở đâu.

### ✅ CỔNG KIỂM 3 (phải đạt mới giao việc cho Claude)
- [ ] `KIEM-TRA-MAY.cmd` không còn `[X]`.
- [ ] `KIEM-TRA-MAY.cmd --sau` báo **"3/3 bài kiểm đăng nhập đạt"**.
- [ ] Claude trả lời đúng câu *"EP_KIT ở đâu"* (Phần 5).

---

## Phần 8. Giao việc cho Claude

### 8.1 Một tin nhắn nên có đủ 4 thứ
1. **Môi trường:** `dev`.
2. **Tài khoản:** "khoá dev trong tai-khoan.json" (Claude không hỏi mật khẩu).
3. **Chức năng** + **loại kiểm thử** (Phần 8.3) + **tài liệu nếu có** (trang Confluence: dán link hoặc nói tên chức năng để Claude tìm; tệp testcase Excel: chuột phải → *Copy as path*; mã Jira `EPB-…`; hoặc "chỉ đọc từ code").
4. **Cách kiểm:** giao diện / API / cả hai; có tra CSDL không.

**Mẫu:**
```
Môi trường: dev (EasyPOS)
Tài khoản: khoá dev trong tai-khoan.json (mật khẩu tôi đã tự điền)
Chức năng: Tạo sản phẩm (màn hình Quản lý sản phẩm), hàng hóa thường
Loại kiểm thử: theo nghiệp vụ
Tài liệu: Confluence — trang "Tạo sản phẩm từ dữ liệu iCheck" (space EP)   ← hoặc dán link trang
Cách kiểm: Playwright cả giao diện (chụp ảnh) lẫn API, rồi tra CSDL chỉ-đọc đối chiếu.
```
**Mẫu khi KHÔNG cần nghiệp vụ** (kiểm kỹ thuật):
```
Môi trường: dev (EasyPOS)
Chức năng: Tạo sản phẩm
Loại kiểm thử: kỹ thuật — không cần tài liệu nghiệp vụ (kiểm theo quy tắc trong code, mã HTTP, giao diện hiển thị, khớp UI-API-CSDL)
Cách kiểm: cả giao diện và API, có tra CSDL chỉ-đọc.
```

### 8.3 Chọn loại kiểm thử: nghiệp vụ hay kỹ thuật?

| | **Theo nghiệp vụ** | **Kỹ thuật (không cần nghiệp vụ)** |
|---|---|---|
| Kiểm cái gì | Hệ thống **làm đúng yêu cầu** chưa (quy tắc, luồng, công thức) | Hệ thống **chạy đúng kỹ thuật** chưa |
| Cần tài liệu? | **Có** — Confluence / Jira / Excel | **Không** |
| Ví dụ | "Giá bán đã gồm thuế thì tính thế nào?", "Mở ca cần quyền gì?" | Đăng nhập được; trang mở không lỗi; **API trả 400 khi thiếu trường bắt buộc, không trả 500**; trùng mã bị từ chối; UI hiển thị khớp API và CSDL; hồi quy sau khi dev sửa |
| Kết luận được | "Đúng / sai so với nghiệp vụ" | "Chạy đúng kỹ thuật" — **không** kết luận được đúng nghiệp vụ (báo cáo ghi rõ) |
| Khi nào dùng | Chức năng mới, có tài liệu BA | Smoke sau deploy, chưa có tài liệu, kiểm hồi quy, tài liệu đang viết dở |

Cách chọn nhanh: **có tài liệu BA ⇒ chọn nghiệp vụ hoặc cả hai; chưa có / không cần ⇒ chọn kỹ thuật.** Không có tài liệu mà bạn chọn nghiệp vụ, Claude sẽ **hỏi lại** chứ không tự bịa nghiệp vụ.

### 8.2 Mẹo giúp ít lỗi nhất
- **Lần đầu hãy giao việc rất nhỏ**: *"Kiểm thử chức năng Đăng nhập trên dev."* Quen quy trình rồi mới sang chức năng khác.
- **Mỗi lần một chức năng nhỏ** (mở ca, rồi đóng ca), đừng cả module.
- **Chạy song song:** mở thêm cuộc trò chuyện Claude, mỗi cái một chức năng; hai phiên chạy cùng lúc nên dùng **công ty test khác nhau**. Ca ảnh hưởng cả công ty (khoá sổ, đóng ca…) chạy riêng.
- **Hết lượt dùng giữa chừng:** `/login` để đổi tài khoản Claude, rồi nhắn *"đọc bao-cao\<thư mục> và làm tiếp từ bước <số>"* (mọi việc đã làm nằm trong báo cáo).
- Muốn xem trình duyệt chạy: *"chạy có hiện trình duyệt (--headed)"*.

---

## Phần 9. Bảy bước và lúc bạn bấm Duyệt

Hết **mỗi bước** Claude ghi báo cáo vào `bao-cao\<ngày>_<chức năng>\` rồi hiện hộp **Duyệt — đi tiếp / Sửa lại bước này / Dừng**. **Chưa Duyệt thì Claude không làm bước sau.**

| Bước | Claude làm | Bạn làm / chọn | Báo cáo |
|---|---|---|---|
| **0 Phạm vi** | Hỏi 4 câu; nếu cần tài liệu, **tìm trang trên Confluence và đưa bạn chọn** | **Loại kiểm thử** (nghiệp vụ / kỹ thuật / cả hai) · UI/API/cả hai · nguồn nghiệp vụ (trang Confluence / Jira / Excel / chỉ code) · nhanh/đầy đủ | `00-pham-vi.md` |
| **1 Phân tích** | Đọc code theo luồng; với loại có nghiệp vụ: **lấy trang Confluence, lập bảng quy tắc `BR-xx` có trích dẫn (trang › mục, phiên bản)**, đối chiếu tài liệu ↔ code, nêu **điểm đáng nghi** | Đọc kỹ: quy tắc có đúng ý BA không? có tài liệu cũ không? | `01-phan-tich.md` |
| **2 Testcase** | Lập testcase `TC-FE-…`, `TC-BE-…` có cột **nguồn** (`BR-xx` / `Code` / `KT`) + **ma trận truy vết BR → TC** + dữ liệu CSDL mong đợi | Duyệt; xem BR nào chưa có testcase | `02-testcase.md` |
| **3 Kịch bản** | Viết kịch bản trong `e2e\tests\<chức năng>\` | Chọn **dev** và **giữ dữ liệu `AUTO_` để tra CSDL** (nên giữ) | `03-kich-ban.md` |
| **4 Chạy** | Chạy thật, chụp ảnh; kịch bản sai thì sửa và chạy lại | Có thể hỏi "chạy tới đâu rồi" | `04-ket-qua-dev.md` |
| **5 Kiểm dữ liệu** | Tra CSDL, mỗi dòng **Khớp / KHÔNG khớp** | Chọn **dọn dữ liệu `AUTO_`** hay giữ lại | `05-kiem-du-lieu-dev.md` |
| **6 Tổng kết** | Bảng testcase, **phạm vi đã kiểm + tài liệu / phiên bản đã dùng**, lỗi mẫu Jira, việc test tay, mục cần BA chốt | Chốt báo cáo | `06-tong-ket.md` |
| **6a Tạo ticket Jira** | Với mỗi lỗi thật: viết nháp `BUG-n.jira.md` → **xem trước** (kiểm trường, tìm ticket trùng, quét bí mật) → hỏi bạn | Chọn **Tạo ticket / Sửa nháp / Không tạo**; tạo xong **mở link, bấm Assign** | `BUG-n.jira.md`, `jira-nhat-ky.md` |
| **6b UAT** | Hỏi có chạy lại trên UAT không | Có / Không / Để sau (Phần 11) | mục "Chạy UAT" |

**Đừng bấm Duyệt vội:** Bước 1–2 là lúc bạn học nhiều nhất và có thể sửa hướng (thêm ca còn thiếu). Bước 4–6 là lúc bạn quyết định lỗi nào đáng báo.

---

## Phần 10. Đọc kết quả và phân loại

Mở `bao-cao\<ngày>_<chức năng>\06-tong-ket.md` **trước**. Mỗi testcase là một trong bốn loại:

| Ký hiệu | Nghĩa | Việc của bạn |
|---|---|---|
| ✅ **Đạt** | Chạy thật **và** CSDL đúng | — |
| ❌ **Không đạt** | Lỗi phần mềm, có bằng chứng (ảnh / phản hồi / SQL) | Báo lỗi (Phần 12.5) |
| ⚠️ **Cần BA chốt** | Chạy được nhưng mâu thuẫn tài liệu / thông báo | Hỏi BA / PO, **không** vội coi là lỗi |
| ⏸ **Chưa chạy** | Test tay, hoặc môi trường chưa cho phép. **Không bao giờ tính là đạt** | Xem lý do (thường thiếu quyền / dữ liệu) |

**Mỗi test trượt phải phân loại đúng nguồn gốc** — kỹ năng quan trọng nhất của tester:

| Loại | Dấu hiệu | Ví dụ thật |
|---|---|---|
| **Lỗi phần mềm** | Hệ thống làm sai kỳ vọng, tái hiện được | Trùng mã sản phẩm trả HTTP 500 thay vì 400 |
| **Lỗi kịch bản** | Chọn sai nút / sai API; sửa kịch bản là xong | Tìm sản phẩm bằng API của màn bán hàng thay vì màn quản lý |
| **Lỗi môi trường** | Quyền / dữ liệu / mạng / công cụ của máy hoặc môi trường test | Tài khoản chưa có quyền "mở ca"; thiếu ffmpeg; hộp thoại "hết số lượng hóa đơn" |

**Xem ảnh và báo cáo chi tiết:** ảnh ở `e2e\test-results\…` hoặc trong thư mục `bao-cao`; báo cáo Playwright (video / trace khi trượt): cmd → `cd /d C:\easypos-tester\e2e` → `npx playwright show-report`.

**Dữ liệu `AUTO_`:** mọi dữ liệu test có tên / mã `AUTO_…`. Claude không sửa / xoá dữ liệu khác. Dev dùng chung môi trường nên đừng xoá tay trước khi Claude kiểm CSDL xong; dọn bằng lựa chọn "dọn" ở bước 5.

---

## Phần 11. UAT — tùy chọn của bạn

**Không phải lần nào xong dev cũng cần lên UAT.** Claude **không tự chạy UAT**. Sau khi bạn duyệt bước 6 của lượt dev, Claude hỏi:

> *"Đã kiểm thử xong trên dev. Có muốn chạy lại cùng bộ kịch bản trên UAT (https://uat.easypos.vn) không?"* — **Có** · **Không, kết thúc ở dev** · **Để sau**

- **Không / Để sau** → kết thúc; báo cáo ghi "UAT: chưa chạy".
- **Có** → Claude kiểm bạn đã điền khối `uat` (chỉ báo đủ / thiếu), chạy lại **đúng bộ kịch bản** với `--project=uat`, tra CSDL `easyposuat`, viết `04-ket-qua-uat.md`, `05-kiem-du-lieu-uat.md` và nêu **khác biệt dev ↔ UAT**.

**Để dùng UAT (một lần):** điền khối `uat` trong `tai-khoan.json` (tài khoản web UAT tắt OTP + tài khoản CSDL UAT; **tài khoản dev chưa chắc dùng được ở UAT**). Công ty ở UAT khác dev: nếu cần chọn công ty, thêm `"uat": "<id>"` vào `congTy` trong `tester.json`. Kiểm: `cd /d C:\easypos-tester\e2e` rồi `npx playwright test tests/_kiem-moi-truong --project=uat`.

---

## Phần 12. Việc không làm, hook, và báo lỗi Jira

### 12.1 Không làm
- ❌ Dán mật khẩu / token vào chat; nhờ Claude đọc `tai-khoan.json`.
- ❌ Test trên **PROD** (`app.easypos.vn`, `api.easypos.vn`, `easyposs.vn`…). Không bật `EP_CHO_PHEP_PROD`.
- ❌ Bấm `CAP-NHAT.cmd` khi Claude đang chạy test.
- ❌ Xoá tay dữ liệu `AUTO_…` trước khi Claude kiểm CSDL xong.
- ❌ Sửa `config\moi-truong.json`, hook, luật khi chưa được người phụ trách đồng ý.

### 12.2 Hook chặn / hỏi những gì
**Chặn:** đọc / in / ghi tệp mật khẩu; nối CSDL trực tiếp (chỉ `dbq.js` được nối, chỉ `SELECT`); gọi mạng tới PROD; chạy ứng dụng với profile `prod`. **Hỏi bạn** trước khi: đọc `application-dev.yml` / `application-prodTest.yml`, sửa cấu hình / luật / hook, ghi vào Jira / Bitbucket / Confluence bằng lệnh.

### 12.3 Hook chặn một lệnh ⇒ dừng lại
Claude dừng và báo. **Đừng tìm cách lách** (đổi cách viết lệnh, chạy qua chương trình khác…). Đọc lý do, hỏi người phụ trách.

### 12.4 Cập nhật bộ kit
Người phụ trách sửa cấu hình / kịch bản sẽ báo: bấm **`CAP-NHAT.cmd`** (nó chạy `git pull` rồi đăng ký lại hook). **Chỉ bấm khi Claude không đang chạy test.** Sau cập nhật: Reload Window, rồi chạy lại `KIEM-TRA-MAY.cmd`.
- **Đừng sửa tay tệp nào trong thư mục bộ kit** (cấu hình, hook, kịch bản có sẵn…). Nếu có tệp bị sửa, `CAP-NHAT.cmd` **từ chối cập nhật** và liệt kê tệp đó. Cách xử lý: báo người phụ trách; nếu chắc chắn bạn không cần giữ sửa đổi, mở cmd: `cd /d C:\easypos-tester` → `git restore .` rồi bấm lại `CAP-NHAT.cmd`.
- Những thứ của riêng bạn **không bị ảnh hưởng** khi cập nhật: tài khoản và `tester.json` (nằm ở `C:\Users\<bạn>\.easypos-tester\`), thư mục `bao-cao\` (báo cáo) và `e2e\test-results\`.
- `git pull` báo lỗi mạng / quyền: kiểm VPN và quyền truy cập repo (Phần 2.2).

### 12.5 Báo lỗi lên Jira

#### A. Cách mặc định: Claude tạo giúp, bạn chỉ bấm Assign (cần token Jira — Phần 6.4)
Sau khi bạn chốt báo cáo (Bước 6), với **mỗi lỗi thật** (❌; không phải ⚠️ cần BA chốt, không phải lỗi môi trường) Claude chạy **Bước 6a**:
1. Viết **nháp** `BUG-n.jira.md` (tiêu đề, bước tái hiện, thực tế / mong đợi, môi trường, ảnh bằng chứng) — theo mẫu `mau-bao-cao\07-jira-nhap.md`. "Kết quả mong đợi" dẫn nguồn Confluence nếu có.
2. Chạy **xem trước** (không tạo gì): công cụ kiểm trường bắt buộc của project EPB, **tìm ticket trùng / giống**, **quét mật khẩu / token** trong mô tả và tệp đính kèm, và cho bạn thấy: ai là Reporter (chính bạn), Component, Severity, Nhãn, tệp đính kèm.
3. Hộp hỏi: **Tạo ticket Jira / Sửa nháp / Không tạo.** Đọc kỹ bản xem trước rồi chọn. (Claude Code sẽ hỏi xác nhận thêm một lần nữa trước khi chạy lệnh tạo — đó là chủ ý.)
4. Chọn **Tạo** → công cụ tạo ticket, đính kèm ảnh, nối issue link và in **LINK** `…/browse/EPB-xxxxx`.
5. **Việc của bạn:** mở link → bấm **Assign** (giao người xử lý) và kiểm Reporter đúng là bạn → báo mã `EPB-…` cho Claude để ghi vào `06-tong-ket.md`.

**Công cụ tự bảo vệ bạn:**
- Chỉ **tạo mới** trong project **EPB**, loại **Bug**; **không sửa / đóng / xoá** ticket nào.
- Báo **"đã có ticket cùng mã lỗi"** thì **không tạo thêm** và đưa link ticket cũ; nếu chỉ **giống** thì cảnh báo để bạn tự quyết.
- **Từ chối** nháp còn chỗ trống mẫu (`<…>`), chứa mật khẩu / token, hoặc tệp đính kèm lạ; giới hạn số ticket mỗi giờ.
- Nhật ký ghi ở `bao-cao\<…>\jira-nhat-ky.md`.

#### B. Cách dự phòng: bạn tạo tay (không có token / công cụ lỗi)
1. Bật VPN, mở `https://jira-sds.softdreams.vn:8080/`, đăng nhập. **Create** → Project **EPB**, Issue Type **Bug**.
2. Điền Summary, Priority, Severity, **Component** (vd *Sản phẩm*), Environment, Labels (`auto-test`, `dev`, tên chức năng).
3. Dán Description từ nháp (phần sau dòng `---` thứ hai của `BUG-n.jira.md`). Ô có hai tab **Visual / Text** → chuyển sang **Text** (viết bằng định dạng wiki của Jira Server); bấm Preview kiểm tra.
4. Đính kèm ảnh bằng chứng (**mở xem trước, không chứa mật khẩu / token**), thêm issue link nếu có, **Create**, gửi mã `EPB-…` cho Claude.

**Không đưa vào ticket:** mật khẩu, token, tài khoản CSDL (`sa`), thông tin đăng nhập máy khách. Dữ liệu khách thật lỡ thấy: che / rút gọn. **"⚠️ Cần BA chốt" không phải bug**: hỏi riêng BA / PO.

---

## Phần 13. Bảng lỗi thường gặp (đều đã gặp thật)

> Gặp lỗi lạ: chạy **`KIEM-TRA-MAY.cmd --sau`** trước, nó thường chỉ ngay nguyên nhân.

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `'node' is not recognized` | Chưa cài Node / chưa mở cửa sổ mới | Cài Node LTS; **đóng và mở lại** cmd / VS Code |
| `git clone` hỏi mật khẩu / 403 / "not found" | Chưa được mời vào repo, hoặc đăng nhập sai tài khoản GitHub | Xin quyền; đăng nhập đúng tài khoản được mời; bật VPN nếu repo nội bộ |
| Không thấy `C:\easypos-tester\CAI-DAT.cmd` | Clone thiếu đường dẫn đích hoặc lồng thêm một lớp thư mục (`…\AIAutoTest\AIAutoTest`) | Phần 3: `git clone <link> C:\easypos-tester` |
| `npx` / `npm` báo *"running scripts is disabled on this system"* | PowerShell chặn tệp `.ps1` | Dùng **cmd**, hoặc `npx.cmd playwright …`, hoặc (một lần) `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `Cannot find module '@playwright/test'` | Chưa cài thư viện trong `e2e` | `cd /d C:\easypos-tester\e2e` → `npm install` |
| **`browserContext.newPage: Executable doesn't exist … ffmpeg-… \ffmpeg-win64.exe`** (KIEM-01 / KIEM-03 lỗi, **KIEM-02 vẫn đạt**) | Chưa tải đủ thành phần Playwright (ffmpeg, quay video khi trượt) | `cd /d C:\easypos-tester\e2e` → `npx playwright install`; hoặc `CAP-NHAT.cmd` (bản mới tự tắt video khi thiếu ffmpeg) |
| `Executable doesn't exist … chromium` / `headless_shell.exe` | Chưa tải chromium | `npx playwright install chromium`; mạng chặn: `set EP_TRINH_DUYET=msedge` (dùng Edge có sẵn) |
| KIEM-01 lỗi (không mở được trang) | Quên VPN / sai địa chỉ | Bật VPN; `KIEM-TRA-MAY.cmd` mục 5 |
| Test `skipped` hàng loạt | Thiếu tài khoản, **hoặc** tài khoản thiếu quyền (vd quyền mở ca) | Xem lý do trong báo cáo (⏸ lỗi môi trường); điền tài khoản / xin cấp quyền |
| KIEM-02 / KIEM-03: **"tài khoản này KHÔNG thuộc công ty …"** | Công ty cấu hình không nằm trong danh sách công ty của tài khoản bạn | Thông báo liệt kê công ty bạn có → khai `tester.json` (Phần 6.3) |
| `BAD_CREDENTIALS` / "không thấy id_token" | Sai tên / mật khẩu web, bật OTP, tài khoản bị khoá | Kiểm `tai-khoan.json` (đã Ctrl+S?); xin tài khoản tắt OTP; **đừng thử sai nhiều lần** |
| `Chua co tai khoan CSDL…` (dbq) | Thiếu `db` hoặc chưa lưu tệp | Phần 6; Ctrl+S |
| `Login failed for user` (dbq) | Sai mật khẩu CSDL | Sửa `db` trong tệp. **Đừng thử lại liên tục** |
| `TU CHOI: dbq chi chay cau DOC` | Câu SQL có từ khoá ghi | Chỉ dùng `SELECT` |
| Hook chặn `dbq.js` ("Tệp chạy … có nối CSDL") | Gọi `dbq.js` bằng đường dẫn tương đối | Dùng `node "C:/easypos-tester/tools/tester/dbq.js" dev "<tệp.sql>"` (đường dẫn đầy đủ) |
| `TỪ CHỐI … PROD` | Địa chỉ khớp danh sách prod | Đúng thiết kế. Không gọi `app.` / `api.easypos.vn`; UAT là `uat.easypos.vn` (đã khai riêng) |
| `Đăng nhập API … lỗi HTTP 404` | Sai `apiUrl` | Báo người phụ trách |
| Mục 8b: `Jira / Confluence: chưa có token` | Chưa tạo / chưa ghi token | Phần 6.4. Không chặn việc chạy test |
| Mục 8b: `token sai / hết hạn / bị thu hồi` (HTTP 401) | PAT hết hạn hoặc bị xoá | Tạo PAT mới, thay vào tệp token, Ctrl+S |
| `HTTP 403` khi tạo ticket / đọc trang | Token không đủ quyền (tạo issue, đính kèm, hoặc xem space) | Nhờ admin cấp quyền; kiểm bằng `jira-tao.js --toi` |
| Xem trước báo **"KHÔNG THỂ TẠO"** | Nháp còn `<…>` chưa điền / nghi chứa mật khẩu / thiếu trường bắt buộc của EPB / sai component | Đọc các dòng `-` bên dưới, sửa nháp, chạy xem trước lại. Trường bắt buộc mới của EPB: báo người phụ trách (điền vào `config\jira.json`) |
| Xem trước báo **"ĐÃ CÓ ticket cùng mã lỗi: EPB-…"** | Lỗi này đã được tạo trước đó | Dùng ticket cũ (comment thêm bằng tay nếu cần). Không tạo thêm |
| Confluence: `Không thấy trang …` / không có quyền | Sai tên / id, hoặc space bạn không đọc được | `confluence.js tim "<từ khóa>" --space EP`; xin quyền space |
| Màn hình bị che bởi "Hướng dẫn sử dụng" / "hết số lượng hóa đơn" | Lỗi môi trường (hạn mức hóa đơn công ty test) | Kịch bản tự đóng hộp thoại; chức năng hóa đơn cần công ty còn hạn mức |
| Kịch bản UI và API cho số liệu khác nhau | Hai bên ở hai công ty khác nhau | Báo người phụ trách |
| Lỗi chập chờn trên dev | Dev đang sửa code / vừa deploy | Chạy lại; hết ⇒ "lỗi môi trường", đừng báo bug |
| Cài nhầm hai bộ kit | Mỗi máy một bộ | `GO-CAI-DAT.cmd` của bộ kia trước |

---

## Phần 14. Hằng ngày, kết thúc và gỡ bộ kit

**Mỗi ngày:**
1. Bật **VPN**. Mở VS Code ở `C:\easypos-tester`, mở cuộc trò chuyện Claude **mới**.
2. (Khi có thông báo cập nhật) `CAP-NHAT.cmd` → `KIEM-TRA-MAY.cmd`.
3. Giao việc (Phần 8) → duyệt từng bước (Phần 9) → đọc `06-tong-ket.md` (Phần 10) → báo lỗi (Phần 12.5).

**Cuối mỗi lượt kiểm thử, tự kiểm lại:**
- ☐ Đã đọc `06-tong-ket.md`, hiểu từng ❌ / ⚠️ / ⏸.
- ☐ Mỗi ❌ có bằng chứng và đã phân loại (phần mềm / kịch bản / môi trường).
- ☐ Đã quyết dữ liệu `AUTO_` (giữ / dọn).
- ☐ Đã trả lời câu hỏi **UAT**.
- ☐ Đã tạo ticket Jira cho lỗi thật và ghi mã vào báo cáo.
- ☐ Không có mật khẩu / token nào nằm trong chat, ticket, báo cáo.

**Gỡ bộ kit** (đổi máy / không dùng nữa): `GO-CAI-DAT.cmd` (giữ `~\.easypos-tester`; tự xoá thư mục đó nếu muốn xoá cả tài khoản).

---

## Phụ lục A. Từ điển

| Từ | Nghĩa dễ hiểu |
|---|---|
| **DEV / UAT / PROD** | Môi trường lập trình / thử trước phát hành / hệ thống thật của khách (cấm test) |
| **Auto test** | Chương trình làm thay người: mở trình duyệt, gõ, bấm, so kết quả |
| **Playwright** | Phần mềm điều khiển trình duyệt tự động |
| **Kịch bản (`.spec.ts`)** | Tệp mô tả thao tác và kiểm tra |
| **Testcase** | Một tình huống kiểm: "nhập trùng mã thì bị từ chối" |
| **`--project=dev`** | Chọn môi trường để chạy |
| **API / Token (`id_token`)** | Cách chương trình nói chuyện với server / "vé" server cấp sau đăng nhập |
| **ffmpeg** | Thành phần quay video khi test trượt (không có thì test vẫn chạy, chỉ không có video) |
| **Hook** | Đoạn code chạy trước mỗi lệnh của Claude để chặn lệnh nguy hiểm |
| **`AUTO_`** | Tiền tố dữ liệu do test tạo ra |
| **PAT (Personal Access Token)** | "Chìa khoá cá nhân" cho công cụ làm việc với Jira / Confluence nhân danh bạn |
| **BR (Business Rule)** | Quy tắc nghiệp vụ trong tài liệu BA (BR-01, US-01…); Claude trích dẫn kèm trang + phiên bản |
| **Ma trận truy vết** | Bảng nối BR → testcase → kết quả → ticket, cho biết nghiệp vụ nào đã được kiểm |
| **Dry-run (xem trước)** | Chạy thử không tạo gì, chỉ cho bạn xem sẽ tạo cái gì |
| **Loại kiểm thử** | Theo nghiệp vụ (cần tài liệu) / kỹ thuật (không cần) / cả hai |
| **`com_id`** | Cột "công ty" (tenant) trong CSDL EasyPOS |
| **HTTP 200 / 400 / 500** | Thành công / lỗi dữ liệu người dùng / lỗi phía hệ thống |

## Phụ lục B. Ví dụ một lượt hoàn chỉnh (Tạo sản phẩm, 22/10/2026)

1. Nhắn: *"Kiểm thử chức năng Tạo sản phẩm trên dev, hàng hóa thường."*
2. Bước 0: chọn **UI + API · từ code · nhanh**. Bước 1: Claude nêu quy tắc (tên bắt buộc, giá ≥ 0, trùng mã bị từ chối…) và 5 điểm đáng nghi. Bước 2: **12 testcase**. Bước 3: kịch bản `e2e\tests\tao-san-pham\`; chọn **dev, giữ dữ liệu `AUTO_SP_`**.
3. Bước 4: **12 đạt, 0 trượt**. Tìm thấy: trùng mã trả **HTTP 500** (lẽ ra 400) ⇒ lỗi phần mềm; giá bán = 0 được chấp nhận trong khi thông báo nói "phải lớn hơn 0" ⇒ ⚠️ BA chốt.
4. Bước 5: CSDL **khớp** cả 10 mục. Bước 6: **ĐẠT kèm 1 lỗi + 2 mục BA chốt**.
5. Claude soạn nháp; bạn duyệt, tự tạo Jira `EPB-24095`. Câu hỏi UAT: chọn **Để sau**.

Báo cáo mẫu này nằm ở `bao-cao\2026-10-22_tao-san-pham\` (nếu bản bạn có) — mở ra xem một báo cáo thật trông thế nào.

## Phụ lục C. Cần giúp?

- **Cấu hình, tài khoản, quyền, địa chỉ môi trường, cài đặt:** người phụ trách bộ kit. Gửi kèm kết quả `KIEM-TRA-MAY.cmd --sau` (chép toàn bộ chữ).
- **Nghiệp vụ** ("Cần BA chốt"): BA / PO. **Lỗi phần mềm:** dev qua ticket Jira (project EPB).
- **Hook chặn lệnh:** dừng, chụp / chép thông báo, gửi người phụ trách — đừng lách.
