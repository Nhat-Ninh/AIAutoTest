# Hướng dẫn áp dụng bộ kit auto test cho EasyPOS — dành cho người làm lần đầu

> Cập nhật 21/10/2026. Viết cho người **chưa từng làm auto test**. Mỗi mục có: **Cái gì** · **Vì sao** · **Cách kiểm tra đã đúng**.
> Bạn không cần hiểu hết code. Bạn cần hiểu **bộ kit gồm những gì, mỗi thứ để làm gì**, và làm theo các bước ở Phần D.

---

## Phần A. Auto test là gì, bộ kit làm gì

**Test thủ công:** một người mở web, gõ tài khoản, bấm từng nút, nhìn kết quả, ghi lại lỗi.
**Auto test:** một chương trình làm đúng việc đó thay người — mở trình duyệt thật, gõ, bấm, chụp ảnh, so kết quả với kỳ vọng. Chạy lại bao nhiêu lần cũng giống nhau, nên sau mỗi lần dev sửa code ta chạy lại để xem có hỏng chỗ khác không.

**Bộ kit này** là "một nhân viên QA ảo" gồm 4 mảnh ghép:

| Mảnh | Hình dung | Là gì thật | Nằm ở đâu |
|---|---|---|---|
| **Claude** | Bộ não | Đọc code và tài liệu, nghĩ ra các testcase, viết kịch bản, viết báo cáo | Extension Claude Code trong VS Code |
| **Playwright** | Đôi tay | Thư viện điều khiển trình duyệt (mở trang, gõ chữ, bấm nút, chụp màn hình) và gọi API | `e2e/` |
| **dbq.js** | Con mắt nhìn vào CSDL | Công cụ chạy câu `SELECT` để kiểm dữ liệu sau khi test (ví dụ tạo đơn xong, bảng `bill` có dòng mới không) | `tools/tester/dbq.js` |
| **Hook bảo vệ** | Bảo vệ cửa | Đoạn code chạy **trước** mỗi lệnh của Claude để chặn lệnh nguy hiểm (đụng vào môi trường thật, lộ mật khẩu) | `hooks/` |
| **Cấu hình** | Sổ tay | Địa chỉ web/API, cách đăng nhập, danh sách địa chỉ "thật" cần tránh | `config/moi-truong.json` |

**Vì sao cần "bảo vệ cửa"?** Claude làm nhanh nhưng không hiểu hậu quả như người. Chỉ cần nó gõ nhầm địa chỉ của khách thật là có thể tạo dữ liệu rác trên hệ thống đang chạy. Nên bộ kit chặn bằng máy: gọi tới địa chỉ prod là bị từ chối, ghi vào CSDL là bị từ chối.

**Một lần kiểm thử diễn ra thế nào** (bạn chỉ làm bước 1 và các lần bấm "Duyệt"):

1. Bạn nhắn: *"Kiểm thử chức năng X trên dev."*
2. Claude hỏi phạm vi → đọc code → viết testcase → **dừng chờ bạn duyệt** (mỗi bước đều dừng).
3. Claude viết kịch bản Playwright (`.spec.ts`) → chạy thật → chụp ảnh.
4. Claude dùng `dbq.js` kiểm dữ liệu trong CSDL.
5. Claude viết báo cáo vào `bao-cao\<ngày>_<chức năng>\` và lỗi theo mẫu Jira.

---

## Phần B. Hai môi trường: DEV trước, UAT sau

| Khoá | Môi trường | CSDL (SQL Server `10.100.110.78:1433`) | Dùng khi |
|---|---|---|---|
| `dev` | DEV dùng chung | `easyposbackoffice` | **Test ở đây trước.** Dev sửa nhanh, lỗi nhiều |
| `uat` | UAT | `easyposuat` | Test lại sau khi dev đạt |

**Vì sao đặt tên khoá?** Mỗi khoá là một "gói" gồm: địa chỉ web + địa chỉ API + CSDL + tài khoản. Khi gõ `--project=dev` hay `dbq.js dev …`, toàn bộ bộ kit tự chọn đúng gói. Đổi `dev` thành `uat` là đổi hết, không phải sửa kịch bản.

**Lưu ý DEV:** có dev đang sửa code liên tục nên đôi khi lỗi do môi trường chứ không do phần mềm. Báo cáo phân loại "lỗi môi trường"; chạy lại trước khi kết luận.

---

## Phần C. Tôi đã biến bộ kit EasyBooks thành EasyPOS như thế nào (và vì sao)

Bộ kit EasyBooks chạy tốt, nhưng **mọi thông tin bên trong là của EasyBooks**. Giống như mượn một chiếc xe đã cài sẵn định vị về nhà người khác: xe chạy được nhưng chỉ đường sai. Việc phải làm là thay mọi thứ "của EasyBooks" bằng "của EasyPOS". Dưới đây là toàn bộ những gì đã làm.

### C1. Tìm hiểu EasyPOS (đọc code, không đoán)
Tôi đọc code của `easyposbackend`, `easypos-frontend`, `easypos-gateway-cloud` và các `application-*.yml`. Tìm ra:

| Thông tin | Tìm thấy ở đâu | Kết quả |
|---|---|---|
| Loại CSDL | `application-*.yml` → `datasource` | **SQL Server** (giống EasyBooks ⇒ công cụ `dbq.js` dùng được); còn có MongoDB, Redis (kit chưa đọc được) |
| API đăng nhập | `UserJWTController.java` | `POST /api/client/common/authenticate`, gửi `username`, `password`, `companyId` |
| Token trả về nằm ở đâu | cùng file | **`data.id_token`** (EasyBooks để ngay ngoài cùng) |
| Ô nhập trang đăng nhập | `login.component.html` | `input[name=username]`, `input[name=password]`, `button[type=submit]` |
| Máy CSDL dev / UAT | yml của `easyposbackend` + bạn xác nhận | `10.100.110.78`: dev = `easyposbackoffice`, UAT = `easyposuat` |
| Máy đang chạy | Dò thật (xem C4) | `http://10.100.110.78/` mở được trang EasyPOS |

### C2. Những gì đã thay trong bộ kit

| # | Thay đổi | Ở đâu | Vì sao |
|---|---|---|---|
| 1 | Bỏ các công cụ chỉ dành cho hệ thống EasyBooks (đọc CSDL prod, đo hiệu năng, đọc bảng nhánh build, danh sách 14 CSDL prod…) | Cả thư mục | EasyPOS không có, và giữ lại là nguy hiểm: chứa mật khẩu và địa chỉ của EasyBooks |
| 2 | Đổi tên mọi thứ `eb-devkit`/`EB_…` → `easypos-tester`/`EP_…` | `setup.js`, hook, công cụ | Để hai bộ kit không dẫm lên nhau trên cùng máy |
| 3 | Viết lại **hook bảo vệ** cho EasyPOS | `hooks/guard-easypos.js`, `prod-config.js` | Chặn: gọi tới địa chỉ prod EasyPOS, nối CSDL trực tiếp (`sqlcmd`…), in/đọc mật khẩu. Có bộ thử `guard-easypos.test.js` |
| 4 | Điền **môi trường** `dev` và `uat` | `config/moi-truong.json` | Cho bộ kit biết "đi đâu": địa chỉ web, API, CSDL của từng môi trường |
| 5 | Điền **cách đăng nhập EasyPOS** | `config/moi-truong.json` → `dangNhap` | Để Playwright biết gọi API nào, gõ ô nào. Đây là chỗ khác EasyBooks nhiều nhất |
| 6 | Sửa **một chỗ code** đọc phản hồi đăng nhập | `e2e/lib/fixtures.ts` | EasyPOS bọc kết quả trong `data`, và danh sách công ty có dạng `[{id, name,…}]`. Không sửa thì bộ kit "không thấy token" và không đăng nhập được |
| 7 | Điền **danh sách địa chỉ prod cần chặn** | `config/moi-truong.json` → `prodChan`, `prodDb` | Rào chắn: tên miền `easypos.vn`, `easyposs.vn`… và các máy chủ prod đã biết từ code |
| 8 | Viết lại `dbq.js` an toàn hơn | `tools/tester/dbq.js` | Chỉ nhận `SELECT`, chạy chế độ chỉ-đọc, từ chối máy prod. Đã **nới cho tài khoản `sa`** ở máy không phải prod (vì dev/UAT hiện chỉ có tài khoản `sa` của ứng dụng) |
| 9 | Viết lại **luật làm việc** | `rules/RULES.md` | Luật Claude phải tuân thủ mỗi phiên: chỉ test dev/UAT, dữ liệu test đặt tên `AUTO_…`, dev trước UAT sau, 7 bước có dừng chờ duyệt |
| 10 | Sửa **mẫu báo cáo** | `mau-bao-cao/00…06` | Đổi chỗ ghi môi trường thành `<dev \| uat>`, thêm dòng "đã xác nhận lại trên UAT" |
| 11 | Tài khoản **không** để trong repo | `~/.easypos-tester/tai-khoan.json` (mỗi máy một tệp) | Mật khẩu để trong repo sẽ lộ cho mọi người đọc repo. Tệp nằm ngoài repo và bị `.gitignore` chặn |
| 12 | Viết 3 tài liệu | `tai-lieu/` | `EASYPOS-BAN-DO.md` (bản đồ hệ thống), tài liệu này, `HUONG-DAN-TESTER.md` (cho tester) |

### C3. Điều đã nới và rủi ro — nói thẳng
- `dbq.js` nhận tài khoản `sa` ở dev/UAT. `sa` là tài khoản quyền cao nhất của SQL Server. Bù lại: `dbq.js` **chỉ chạy `SELECT`**, từ chối mọi câu ghi, từ chối máy prod. Cách tốt hơn về lâu dài: xin DBA tạo **tài khoản chỉ-đọc** rồi thay vào `tai-khoan.json`.
- Mật khẩu `sa` nằm trong `application-dev.yml` (trong code). Đó là vấn đề có sẵn của dự án, không phải của bộ kit — nhưng nên báo leader.

### C4. Những gì đã kiểm chứng (không phải đoán)
- Cài **Node.js** (đã có ở `C:\Program Files\nodejs`), `npm install`, tải trình duyệt **Chromium** cho Playwright.
- **Hook:** chạy `node hooks/guard-easypos.test.js` → **112/112 ca đúng**.
- **Dò mạng (chỉ GET, không đăng nhập):** từ máy bạn (có VPN) mở được `http://10.100.110.78/` (trang `easyPosFrontEnd`) và API `/api/p/client/ping` trả 200. Máy này còn cổng `8081` và `8888` cùng trả web + API.
- **Kịch bản kiểm môi trường:** `KIEM-01 "Mở được trang giao diện"` **đạt** trên dev.
- **`dbq.js`:** đã thử các tình huống từ chối (câu `DELETE` bị chặn, máy prod bị chặn, chưa có tài khoản thì báo).
- **Ngày 21/10/2026, sau khi điền tài khoản dev:** `--project=dev` → **3 passed** (KIEM-01 mở trang, KIEM-02 đăng nhập API, KIEM-03 đăng nhập giao diện). `dbq.js dev` nối thật: máy `DEV-EASYPOS`, CSDL `easyposbackoffice`. Công ty đang dùng (`congTy`) có mã số thuế gốc trùng 715 công ty trong `easyposbackoffice` ⇒ cổng 80 khớp với dữ liệu DEV.

### C5. Điều chưa làm / chưa chắc
| Việc | Trạng thái |
|---|---|
| Tài khoản web + CSDL dev | ✅ Đã điền, D2–D4 đạt |
| Chắc chắn cổng 80 là DEV | Gần như chắc (công ty đăng nhập khớp dữ liệu `easyposbackoffice`). Khi test chức năng ghi dữ liệu (tạo đơn…), nên đối chiếu thêm một bản ghi vừa tạo có xuất hiện trong `easyposbackoffice` hay không |
| Môi trường UAT | Để trống địa chỉ web/API (CSDL đã điền). Làm sau khi dev ổn |
| Địa chỉ + CSDL **prod** thật | Chưa có (repo không chứa; cần DevOps). Bộ kit vẫn an toàn nhờ chặn mọi địa chỉ khớp các tên miền/IP prod đã biết, nhưng nên bổ sung |
| MongoDB, Redis | Bộ kit chưa đọc được → kiểm tay |
| Confluence | Chưa có công cụ đọc → xuất trang ra PDF/Word rồi đưa đường dẫn cho Claude |

> Thư mục `C:\NINHHN\SOFTDREAM-PRJ\AIAUTOTEST` là **bản mẫu EasyBooks gốc** (một vài tệp đã bị sửa dở trong lúc thử). **Đừng làm việc ở đó.** Bộ kit đang dùng là **`C:\easypos-tester-kit`**.

---

## Phần D. Làm theo từng bước từ bây giờ

### D1. Mở đúng thư mục
VS Code → File → Open Folder → `C:\easypos-tester-kit`. **Vì sao:** Claude chỉ đọc/ghi trong thư mục đang mở, và bộ kit tìm tệp theo vị trí của nó.

### D2. Điền tài khoản (BẠN tự làm, đây là chỗ đang dừng)
**Cái gì:** mở tệp `C:\Users\admin\.easypos-tester\tai-khoan.json` bằng VS Code (Ctrl+O, dán đường dẫn). Điền khối `dev`:

```json
{
  "dev": {
    "web": { "user": "<tên đăng nhập EasyPOS>", "password": "<mật khẩu>" },
    "db":  { "user": "<user CSDL>",              "password": "<mật khẩu CSDL>" }
  }
}
```
(Giữ nguyên các khoá khác; chỉ thay các chỗ `""`. Chú ý dấu `"` và dấu phẩy.)

- `web`: tài khoản **đăng nhập phần mềm EasyPOS**, dữ liệu giả, **tắt OTP** (nếu bật OTP thì chương trình không tự đăng nhập được). Xin dev hoặc QA lead. *Không* lấy được từ file cấu hình, vì mật khẩu người dùng nằm trong CSDL ở dạng băm.
- `db`: tài khoản **đăng nhập CSDL**. Lấy từ `easyposbackend/src/main/resources/config/application-dev.yml`, khối `datasource:` (dòng `username`, `password`).
- **Nhớ bấm Ctrl+S.** Tab còn dấu chấm tròn = chưa lưu. (Lần kiểm gần nhất tệp vẫn trống, rất có thể do chưa lưu.)

- Tài khoản web thuộc **nhiều công ty** và bạn muốn chọn công ty nào: điền mã số công ty, mã số thuế hoặc tên công ty vào `dangNhap.api.congTy` trong `config/moi-truong.json`. Để trống = công ty đầu tiên trong danh sách.

**Vì sao tự gõ, không nhờ Claude:** mật khẩu chat với AI sẽ nằm trong lịch sử trò chuyện. Quy tắc cứng của bộ kit: mật khẩu chỉ có trong tệp này.

**Kiểm tra đã đúng:** hỏi Claude *"kiểm tra tai-khoan.json khối dev đã điền đủ 4 ô chưa (chỉ nói đủ/thiếu, không đọc giá trị)"* — hoặc chạy lệnh dưới đây, nó chỉ hiện **True/False**, không hiện mật khẩu:
```powershell
$j = Get-Content "$env:USERPROFILE\.easypos-tester\tai-khoan.json" -Raw -Encoding UTF8 | ConvertFrom-Json
"web.user=$([bool]$j.dev.web.user) web.password=$([bool]$j.dev.web.password) db.user=$([bool]$j.dev.db.user) db.password=$([bool]$j.dev.db.password)"
```
Cả bốn phải là `True`.

### D3. Chạy kiểm tra môi trường (3 bài kiểm nhỏ)
Mở terminal trong VS Code (Ctrl+`):
```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path      # nếu node báo "not recognized"
cd C:\easypos-tester-kit\e2e
npx playwright test tests/_kiem-moi-truong --project=dev
```

Ba bài kiểm này như "bắt tay" kiểm tra đường truyền:

| Bài | Làm gì | Nếu đạt nghĩa là | Nếu lỗi thì |
|---|---|---|---|
| KIEM-01 | Mở trang web dev | Địa chỉ `webUrl` đúng, mạng/VPN ổn | Sai `webUrl`, quên bật VPN |
| KIEM-02 | Gọi API đăng nhập bằng tài khoản `web` rồi gọi `client/common/introspect` (API hỏi "vé của tôi còn hợp lệ không") | `apiUrl`, tài khoản, đoạn code đọc `data.id_token` đều đúng | Xem bảng lỗi ở Phần E |
| KIEM-03 | Mở trang `/login`, gõ tài khoản, bấm "Đăng nhập" bằng trình duyệt thật | Ô nhập, nút bấm, chọn công ty đều đúng | Sai bộ chọn ô nhập |

**Đạt khi:** `3 passed`. Nếu `skipped` = thiếu tài khoản/địa chỉ (quay lại D2). Muốn *xem* trình duyệt chạy, thêm `--headed` vào cuối lệnh. Muốn xem báo cáo đẹp: `npx playwright show-report`.

**Xác nhận đúng môi trường DEV (quan trọng):** máy `10.100.110.78` có ba cổng 80/8081/8888. Sau khi đăng nhập được, cho Claude làm bước D4 và so tên công ty/tài khoản bạn thấy trên web với dữ liệu trong CSDL `easyposbackoffice`. Nếu không khớp, đổi `webUrl`/`apiUrl` sang cổng `:8081` hoặc `:8888` trong `config/moi-truong.json` rồi chạy lại.

### D4. Kiểm tra đọc CSDL
Tạo tệp `C:\easypos-tester-kit\kiem.sql` chứa đúng một dòng:
```sql
SELECT @@SERVERNAME AS may, DB_NAME() AS csdl
```
Chạy:
```powershell
cd C:\easypos-tester-kit
node tools/tester/dbq.js dev kiem.sql
```
**Đạt khi:** in ra `csdl = easyposbackoffice`. Bạn sẽ thấy dòng `# CANH BAO: dang dung tai khoan sa…` — đó là cảnh báo có chủ ý (xem C3), không phải lỗi.
**Vì sao làm bước này:** nếu `dbq` nối được thì sau mỗi lần test, Claude kiểm tra được dữ liệu thật đã vào đúng bảng chưa — phần quan trọng nhất của kiểm thử nghiệp vụ.

### D5. Chạy thử kịch bản mẫu "Đăng nhập"
```powershell
cd C:\easypos-tester-kit\e2e
npx playwright test tests/dang-nhap --project=dev --headed
```
Bạn sẽ thấy trình duyệt tự mở, gõ, bấm. Mở `e2e\tests\dang-nhap\dang-nhap.spec.ts` đọc thử: mỗi `test('…')` là một testcase; mỗi `await page.…` là một thao tác; mỗi `expect(…)` là một lần "kiểm kết quả". **Test = danh sách thao tác + các lần kiểm kết quả.** Kịch bản mẫu này chưa chạy trên môi trường thật nên có thể phải chỉnh — bình thường.

**Kết quả chạy thật 21/10/2026 trên dev: `5 passed` (26 giây).**

| Mã | Kiểm gì | Kết quả | Ý nghĩa |
|---|---|---|---|
| TC-FE-001 | Trang `/login` có ô tên, ô mật khẩu, nút đăng nhập | ✅ | Các bộ chọn trong `config` đúng với giao diện thật |
| TC-FE-002 | Gõ tài khoản **không tồn tại** (`AUTO_khong_ton_tai`) thì vẫn ở trang đăng nhập | ✅ | Hệ thống từ chối đúng; ảnh chụp thấy thông báo đỏ "Không tìm thấy user" |
| TC-FE-003 | Gõ **tài khoản thật của bạn** thì vào được hệ thống | ✅ | Đăng nhập UI chạy trọn, kể cả bước chọn công ty |
| TC-BE-001 | Gọi API đăng nhập với tài khoản sai thì **không** có `id_token` | ✅ | Kiểm trực tiếp tầng API (đúng cấu trúc `data.id_token` của EasyPOS) |
| TC-BE-002 | Đăng nhập đúng rồi gọi `client/common/introspect` | ✅ | Token hợp lệ và được server chấp nhận |

Ảnh chụp nằm ở `e2e\test-results\…\sai-tai-khoan.png` và `…\sau-dang-nhap.png`. **Cách học từ kết quả:** đạt (✅) chưa chắc test đã "hay". TC-FE-003 chỉ kiểm "địa chỉ trang không còn chữ login" — một kiểm tra yếu. Ảnh `sau-dang-nhap.png` cho thấy thật sự đã vào hệ thống, nhưng có **hộp thoại "Hướng dẫn sử dụng"** và một cảnh báo **"Số lượng hóa đơn của quý khách đã hết"** che màn hình. Hai điều rút ra:
1. Kịch bản thật sau này phải **đóng các hộp thoại chào** trước khi bấm gì khác, nếu không chúng che nút và test trượt vì lý do vô nghĩa (đó là "lỗi kịch bản", không phải lỗi phần mềm).
2. Công ty đang đăng nhập (`congTy`) đã **hết hạn mức hóa đơn** trên dev ⇒ các chức năng phát hành hóa đơn sẽ không test được bằng công ty này. Chọn công ty test khác (còn số lượng hóa đơn) cho nhóm chức năng hóa đơn, bằng cách đổi `dangNhap.api.congTy`. **Cập nhật 22/10/2026:** đã đổi sang chi nhánh **"Test luồng hóa đơn"** (id `10230`, tìm bằng `SELECT id, name FROM company WHERE name LIKE N'%luồng hóa đơn%'` qua `dbq.js dev`) — 8/8 bài kiểm môi trường + đăng nhập đạt, nhưng hộp thoại "Số lượng hóa đơn … đã hết" **vẫn hiện** và tài khoản vẫn `shiftManagement = false` ở chi nhánh này. **Sau đó (22/10/2026) đổi sang "Cửa hàng test Imei" (id `9839`)**: đăng nhập đạt nhưng vẫn thiếu quyền mở ca. Tra CSDL cho thấy tài khoản test (`user_id 6731`) thuộc **63 công ty và chưa có `shift_management = true` ở công ty nào**; chỉ vài công ty có nhân viên khác được quyền (vd `8259` 3 người, `9708` 1 người). Muốn test mở/đóng ca phải **bật quyền cho chính tài khoản test** (nhờ chủ công ty / dev) hoặc dùng tài khoản của một nhân viên đã có quyền.

### D6. Cài hook bảo vệ vào Claude Code
**Hook là gì, vì sao cần.** Mỗi khi Claude định chạy một lệnh, đọc hoặc ghi một tệp, Claude Code gọi hook trước (`hooks/guard-easypos.js`). Hook xem lệnh đó rồi trả lời một trong ba: **cho chạy**, **hỏi người dùng**, hoặc **chặn**. Nó là "bảo vệ cửa": dù Claude nghĩ sai, lệnh nguy hiểm vẫn không chạy được. Thử không cần cài: `node hooks/guard-easypos.test.js` → 112/112 là hook làm đúng như thiết kế.

**Hook chặn / hỏi những gì:**

| Mức | Trường hợp |
|---|---|
| ⛔ Chặn | Đọc, in hoặc ghi `tai-khoan.json`, `application-prod*.yml`, `.env`; in biến chứa mật khẩu; nối CSDL / hàng đợi trực tiếp (`sqlcmd`, `mongosh`, `redis-cli`, JDBC…, kể cả khi nằm trong tệp script / code được ghi); gọi HTTP tới địa chỉ prod; chạy ứng dụng với profile `prod` |
| ❓ Hỏi | Đọc `application-dev.yml` / `application-prodTest.yml`; sửa hook, luật, cấu hình môi trường, settings của Claude; bật `EP_CHO_PHEP_PROD`; ghi (POST/PUT/DELETE) vào Jira / Bitbucket / Confluence |
| ✅ Cho | Mọi thứ còn lại: chạy Playwright trên dev/uat, `dbq.js`, đọc code, viết kịch bản và báo cáo |

**⚠️ Điều phải biết trước khi cài: hook cài *toàn máy*.** `CAI-DAT.cmd` ghi vào `C:\Users\admin\.claude\settings.json`, áp cho **mọi** cuộc trò chuyện Claude trên máy này, kể cả khi bạn mở `SOFTDREAM-PRJ` để sửa code Java. Hook được viết cho **tester** nên sẽ làm phiền công việc **dev** của bạn: ví dụ hỏi mỗi lần đọc `application-dev.yml`, chặn khi bạn nhờ Claude viết code có JDBC hoặc `DriverManager`, chặn đọc `application-prod*.yml`, chặn chạy app với profile `prod`. Nó vẫn an toàn, nhưng sẽ vướng. Máy bạn đang có sẵn các hook của công cụ khác (`cbm-*`, `codegraph`); bộ cài giữ nguyên chúng, chỉ thêm hook của bộ kit và có sao lưu `settings.json`. *(Máy đã cài bộ kit EasyBooks thì không cài thêm — mỗi máy một bộ; máy này chưa có.)*

**Ba cách chọn:**

| Cách | Ưu | Nhược | Hợp khi |
|---|---|---|---|
| **A. Cài toàn máy** (`CAI-DAT.cmd`) | Đúng thiết kế, đơn giản | Vướng việc dev (nêu trên). Gỡ được bằng `GO-CAI-DAT.cmd` | Máy / tài khoản Windows dành riêng cho tester |
| **B. Chỉ bật khi mở thư mục `C:\easypos-tester-kit`** (hook đặt trong `C:\easypos-tester-kit\.claude\settings.json`) | Không ảnh hưởng việc dev ở `SOFTDREAM-PRJ`; vẫn bảo vệ khi test | Phải luôn mở Claude **trong thư mục kit** thì mới có bảo vệ. Cần tạo thêm một tệp cấu hình (chưa có sẵn — nhờ Claude tạo) | **Máy của bạn (vừa dev vừa test)** — khuyên dùng |
| **C. Chưa cài** | Không đổi gì | Chạy test vẫn được nhưng **không có người bảo vệ**: chỉ còn các chốt trong `dbq.js` và Playwright (chặn prod, chỉ SELECT) | Chỉ để học thử, chưa giao việc thật cho Claude |

**Cách A — các bước (nếu chọn):**
0. **Chuẩn bị (đã làm 22/10/2026):** `git init` trong `C:\easypos-tester-kit`. *Vì sao:* bộ cài tự hỏi "thư mục này là bản clone git?". Nếu **không**, nó **chép cả bộ kit sang** `C:\Users\admin\AppData\Local\easypos-tester-kit` rồi trỏ hook vào bản chép đó — từ đó sửa tệp ở `C:\easypos-tester-kit` **không có tác dụng** (hook và `EP_KIT` đọc bản chép), dễ gây nhầm. Có `.git` thì bộ cài cài **tại chỗ**, một bản duy nhất. (Lệnh: `cd C:\easypos-tester-kit` → `git init -b main`. `.gitignore` đã loại `node_modules`, `test-results`, `bao-cao`, mọi `tai-khoan*.json`.) **Đừng xoá hay dời thư mục này** sau khi cài, vì hook trỏ thẳng vào đó.
1. Đóng cuộc trò chuyện Claude đang chạy test (không cài khi Claude đang làm việc).
2. Bấm đúp `C:\easypos-tester-kit\CAI-DAT.cmd`. Nó làm 5 bước: kiểm công cụ → xác định vị trí cài (sẽ in "Ban clone git - cai tai cho C:\easypos-tester-kit") → **cài hook** (`node setup.js --global-hooks`: thêm 2 hook + biến `EP_KIT` vào `settings.json`, sao lưu bản cũ thành `settings.json.bak-easypos-tester-<giờ>`, rồi tự chạy bộ thử hook) → cài Playwright (đã có thì bỏ qua) → nhắc điền tài khoản (bạn đã điền).
3. Cuối màn hình phải thấy `112/112 ca đúng` và không có dòng `[X]`.
4. VS Code: Ctrl+Shift+P → **Developer: Reload Window** → mở cuộc trò chuyện Claude **mới**.
5. **Kiểm tra:** hỏi Claude *"EP_KIT ở đâu, có những luật gì?"* → phải ra `C:/easypos-tester-kit` và danh sách luật. Thử bảo vệ: hỏi *"đọc nội dung tai-khoan.json"* → phải bị chặn.
6. **Gỡ khi cần:** bấm `GO-CAI-DAT.cmd` (giữ lại `~/.easypos-tester` chứa tài khoản), hoặc khôi phục tệp `.bak-easypos-tester-…`.

**Kết quả cài thật (22/10/2026, cách A):** `settings.json` có hook `guard-easypos.js` (cho Bash, PowerShell, Edit, Write, Read, Grep…) và `session-rules.js` (nạp luật đầu phiên); `env.EP_KIT = C:/easypos-tester-kit`; tệp sao lưu `settings.json.bak-easypos-tester-20261022013118`; hook của công cụ khác (`cbm-*`, `codegraph`) còn nguyên; cài tại chỗ (không có bản chép ở AppData). Thử bảo vệ bằng cách đưa 9 tình huống vào hook: **9/9 đúng** — đọc `tai-khoan.json` ⛔, nối CSDL trực tiếp ⛔, gọi `easypos.vn` ⛔, chạy app profile prod ⛔, đọc `application-prod.yml` ⛔, đọc `application-dev.yml` ❓ hỏi, còn `dbq.js` / Playwright trên dev và đọc tệp kịch bản ✅. Bằng chứng sống: ngay khi cài xong, lúc Claude ghi một tệp thử có chứa lệnh nối CSDL, hook đã chặn thật.

Xem trước việc cài sẽ làm gì mà không ghi gì (đã chạy 21/10/2026): `node setup.js --global-hooks --dry-run` → "thêm hook guard-easypos + session-rules và EP_KIT=C:/easypos-tester-kit vào C:\Users\admin\.claude\settings.json", bộ thử 112/112.

### D7. Giao việc thật đầu tiên cho Claude
Chọn chức năng **nhỏ, dễ**: đăng nhập → mở/đóng ca → danh sách sản phẩm → tạo đơn hàng. Nhắn:
```
Môi trường: dev (EasyPOS)
Tài khoản: khoá dev trong tai-khoan.json
Chức năng: Mở / đóng ca làm việc (màn hình session)
Tài liệu: Jira EPB-xxxxx (hoặc đường dẫn tệp testcase Excel)
Cách kiểm: Playwright cả giao diện (chụp ảnh) lẫn API, rồi tra CSDL chỉ-đọc đối chiếu.
```
Claude đi 7 bước (phạm vi → phân tích → testcase → kịch bản → chạy → kiểm dữ liệu → tổng kết), mỗi bước hiện hộp **Duyệt / Sửa lại / Dừng**. **Hãy đọc kỹ từng báo cáo** ở `bao-cao\<ngày>_<chức năng>\` — đây là lúc bạn học nhiều nhất. Mở `06-tong-ket.md` trước.

**Ví dụ thật — "Mở / đóng ca làm việc" trên dev (22/10/2026)** — báo cáo ở `C:\easypos-tester-kit\bao-cao\2026-10-22_mo-dong-ca\`:

| Bước | Claude làm gì | Bạn làm gì | Kết quả |
|---|---|---|---|
| 0 Phạm vi | Hỏi 3 câu | Chọn: cả UI + API · từ code · nhanh | `00-pham-vi.md` |
| 1 Phân tích | Đọc `ShiftManagementServiceImpl` (BE) và màn hình `session` (FE): mỗi người chỉ một ca mở, tiền ≥ 0, đóng lại ca đã đóng bị từ chối… ; ghi 5 điểm đáng nghi | Đọc, duyệt | `01-phan-tich.md` |
| 2 Testcase | 11 testcase (7 BE + 4 FE) kèm dữ liệu CSDL mong đợi, 4 việc để test tay | Đọc, duyệt | `02-testcase.md` |
| 3 Kịch bản | Viết `e2e/tests/mo-dong-ca/mo-dong-ca.spec.ts`, thêm fixture `phien`; **chạy thử đọc phiên đăng nhập và phát hiện tài khoản test chưa có quyền quản lý ca** | Chọn: chạy dev, giữ dữ liệu `AUTO_`; **tự cấp quyền "Quyền mở ca"** ở màn hình ca | `03-kich-ban.md` |

**Ví dụ thật thứ hai — "Tạo sản phẩm" (22/10/2026, chạy hết 7 bước)** — `bao-cao\2026-10-22_tao-san-pham\`: 12 test đạt trên dev; tìm ra **1 lỗi thật** (trùng mã sản phẩm trả HTTP 500, lẽ ra 400) và 2 mục cần BA chốt (giá bán = 0, giới hạn mã 50 ký tự); CSDL khớp ở mọi ca. Hai bài học kỹ thuật: kiểm kết quả bằng **đúng API mà màn hình dùng** (API danh sách của màn bán hàng không thấy sản phẩm mới, API màn quản lý thì thấy), và đăng nhập giao diện nay **chọn đúng công ty theo `congTy`** (trước đó UI chọn công ty đầu tiên nên UI và API chạy trên hai công ty khác nhau).

**Bài học (mở / đóng ca):** (1) Claude kiểm *điều kiện môi trường* trước khi chạy — thiếu quyền thì báo, không đoán và không tự sửa dữ liệu phân quyền. (2) Test chỉ tạo ca có mô tả `AUTO_mo-dong-ca`, tự đóng sau khi xong, và **không đóng ca có sẵn** của người khác. (3) Lỗi "thiếu quyền" là *lỗi môi trường*, không phải lỗi phần mềm — báo cáo phân loại riêng.

### D8. UAT — TÙY CHỌN, Claude luôn hỏi sau khi kiểm thử xong trên dev
**Nguyên tắc:** không phải chức năng nào test xong ở dev cũng cần lên UAT. Dev là mặc định; UAT chỉ chạy khi **tester muốn**.

**Địa chỉ UAT (đã cấu hình 22/10/2026):** web `https://uat.easypos.vn/login`, application profile `prodTest`, API `https://uat.easypos.vn/api/` (đã dò: trang đăng nhập 200, `/api/p/client/ping` 200), CSDL `easyposuat` trên `10.100.110.78`. Vì `uat.easypos.vn` nằm dưới tên miền prod `easypos.vn`, nó được khai riêng ở `config/moi-truong.json → khongPhaiProd` (nếu không, bộ kit sẽ chặn nó như prod). Các tên miền khác dưới `easypos.vn` (`app.easypos.vn`, `api.easypos.vn`…) **vẫn bị chặn** vì khongPhaiProd chỉ khớp *đúng nguyên tên máy*.

**Cách hoạt động (Bước 6b trong `rules/RULES.md`):** sau khi tester duyệt Bước 6 của lượt dev, Claude hỏi một câu:
> *"Đã kiểm thử xong trên dev. Có muốn chạy lại cùng bộ kịch bản trên UAT (https://uat.easypos.vn) không?"* — **Có** · **Không, kết thúc ở dev** · **Để sau**

- **Không / Để sau** (hoặc không trả lời rõ): kết thúc. Báo cáo ghi "UAT: chưa chạy".
- **Có**: Claude (1) kiểm bạn đã điền khối `uat` trong `tai-khoan.json` chưa (chỉ báo đủ / thiếu, không đọc mật khẩu); (2) chạy `tests/_kiem-moi-truong --project=uat`; (3) chạy lại **đúng bộ kịch bản** đã dùng ở dev với `--project=uat`; (4) tra CSDL bằng `dbq.js uat`; (5) viết `04-ket-qua-uat.md`, `05-kiem-du-lieu-uat.md`, cập nhật `06-tong-ket.md` và nêu **khác biệt dev ↔ UAT**. Mỗi bước vẫn hỏi duyệt.

**Việc bạn làm một lần để UAT dùng được:**
1. Điền khối `uat` trong `C:\Users\<bạn>\.easypos-tester\tai-khoan.json`: `web` = tài khoản EasyPOS dữ liệu giả trên UAT (tắt OTP; **tài khoản dev chưa chắc dùng được ở UAT**), `db` = tài khoản CSDL UAT (user / password ở khối `datasource:` của `application-prodTest.yml`, tự gõ, không dán vào chat).
2. Công ty muốn vào được khai **riêng từng môi trường**: dev ở `moiTruong.dev.dangNhap.api.congTy` (hiện `9839` — "Cửa hàng test Imei"), UAT ở `moiTruong.uat.dangNhap.api.congTy` (hiện **chưa khai** ⇒ lấy công ty đầu tiên của tài khoản). Id công ty ở UAT khác dev, nên khi biết công ty UAT muốn dùng, thêm khối `"api": { "congTy": "<id / mã số thuế / tên>" }` vào `dangNhap` của `uat`.
3. Kiểm: `cd e2e` → `npx playwright test tests/_kiem-moi-truong --project=uat` (KIEM-01 mở trang) và `node "C:/easypos-tester-kit/tools/tester/dbq.js" uat <tệp.sql>`.

**Chưa kiểm được ở thời điểm viết:** đăng nhập UAT (chưa có tài khoản UAT trong `tai-khoan.json`), nên chưa biết `apiUrl = https://uat.easypos.vn/api/` đã đúng cho đăng nhập API và công ty nào dùng được.

### D9. Phát cho tester khác (khi sẵn sàng)
> **Cập nhật 22/10/2026:** repo bộ kit đang ở GitHub (`https://github.com/Nhat-Ninh/AIAutoTest.git`) — phải **mời tester vào repo** trước. Tester clone bằng `git clone <link> C:\easypos-tester` (có đường dẫn đích để khỏi lồng thư mục), điền tài khoản, rồi bấm **`KIEM-TRA-MAY.cmd`** (và `--sau`) — công cụ này kiểm từng điều kiện và chỉ cách sửa, đã bắt được các lỗi thật gặp ở máy tester (thiếu ffmpeg / trình duyệt Playwright, công ty không thuộc tài khoản, thiếu VPN, quên lưu tài khoản). Hướng dẫn đầy đủ từ A đến Z cho tester: `HUONG-DAN-TESTER.md`.

Tạo repo Bitbucket mới (project `EPOS`), `git init` → `git add .` → **`git status` đọc kỹ: không được có `tai-khoan.json`** → commit → push. Tester clone về, bấm `CAI-DAT.cmd`, tự điền tài khoản của họ. Gửi họ `tai-lieu/HUONG-DAN-TESTER.md`.

---

## Phần E. Khi gặp lỗi

| Thông báo / triệu chứng | Nghĩa là | Cách xử |
|---|---|---|
| `node` / `npx` "not recognized" | Windows chưa nhận Node trong cửa sổ này | Mở terminal mới, hoặc chạy `$env:Path = 'C:\Program Files\nodejs;' + $env:Path` |
| KIEM-01 lỗi, trang không mở | Quên VPN, hoặc sai `webUrl` | Bật VPN; mở thử `http://10.100.140.9:8082/` bằng trình duyệt |
| 2 bài `skipped` | Thiếu tài khoản web trong `tai-khoan.json` | D2; nhớ Ctrl+S |
| `Chua co tai khoan CSDL…` (dbq) | Thiếu `db.user`/`db.password` | D2 |
| `Đăng nhập API … lỗi HTTP 404` | Sai `apiUrl` (thiếu/sai phần đường dẫn) | F12 → tab Network → đăng nhập → bấm request `authenticate` → xem **Request URL** thật |
| `không thấy trường id_token` | Phản hồi khác dự kiến | Xem phản hồi thật trong báo cáo Playwright; tài khoản bị khoá/hết hạn/bật OTP cũng gây ra |
| `BAD_CREDENTIALS` / "Tài khoản không hợp lệ" | Sai tên/mật khẩu web | Sửa tai-khoan.json. Đừng thử sai nhiều lần (có thể bị khoá) |
| `TỪ CHỐI … PROD` | Địa chỉ khớp danh sách prod | Đúng thiết kế. Kiểm tra `webUrl`/`apiUrl`; nếu là máy test lỡ trùng tên miền prod, hỏi leader trước khi thêm vào `khongPhaiProd` |
| `TU CHOI: dbq chi chay cau DOC` | Câu SQL có từ khoá ghi (INSERT, UPDATE, DELETE, EXEC…) | Chỉ dùng `SELECT` |
| `Login failed for user` (dbq) | Sai mật khẩu CSDL | Kiểm tra `db` trong tai-khoan.json. Đừng thử lại liên tục: tài khoản dùng chung có thể bị khoá |
| Hook chặn một lệnh của Claude | Bộ bảo vệ làm đúng việc | Đừng tìm cách lách. Đọc lý do, hỏi leader |

---

## Phần F. Từ điển

| Từ | Nghĩa dễ hiểu |
|---|---|
| **DEV / UAT / PROD** | Môi trường lập trình / thử trước khi phát hành / hệ thống thật của khách. Chỉ test DEV và UAT |
| **Playwright** | Phần mềm điều khiển trình duyệt tự động |
| **Kịch bản (`.spec.ts`)** | Tệp mô tả các thao tác và kiểm tra của một hay nhiều testcase |
| **Testcase** | Một tình huống kiểm: "đăng nhập đúng mật khẩu thì vào được trang chủ" |
| **Project (Playwright)** | Một môi trường: `--project=dev` |
| **Fixture** | "Đồ nghề dựng sẵn" cho kịch bản: `api` (đã đăng nhập sẵn, gọi API ngay), `dangNhapUI` (đăng nhập bằng giao diện), `page` (trình duyệt) |
| **API** | Cách chương trình nói chuyện với server (khác với người bấm trên giao diện) |
| **Token (`id_token`)** | "Vé" server cấp sau đăng nhập, gửi kèm mọi lời gọi API tiếp theo |
| **Gateway** | Cổng chung nhận mọi lời gọi `/api/…` rồi chuyển tới đúng dịch vụ |
| **Selector** | Cách chỉ cho Playwright "ô nhập nào, nút nào" (ví dụ `input[name=username]`) |
| **Hook** | Đoạn code Claude Code chạy trước mỗi lệnh để chặn lệnh nguy hiểm |
| **`AUTO_`** | Tiền tố đặt cho mọi dữ liệu do test tạo ra (khách `AUTO_001`…) để nhận ra và dọn |
| **`com_id`** | Cột "công ty" (tenant) trong CSDL EasyPOS. Mỗi câu SQL kiểm dữ liệu phải lọc theo công ty đang test |
| **VPN** | Mạng riêng công ty, cần bật mới vào được máy dev/UAT, Jira, Bitbucket |
