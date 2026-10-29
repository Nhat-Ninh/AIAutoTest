# Code-Insight — hướng dẫn ĐƠN GIẢN (làm theo từng bước)

> Dành cho người phụ trách kit. Chi tiết kỹ thuật và rủi ro: `HUONG-DAN-AP-DUNG-EASYPOS.md` mục D15. Cập nhật 27/10/2026.

## 1. Hiểu trong 30 giây
Tester hỏi Claude → Claude gọi **cổng** (một chương trình nhỏ) bằng **token Jira của tester** → cổng cho **worker** (Claude chạy trong Docker) đọc **bản chụp mã** → **bộ lọc** bỏ hết đoạn giống mã nguồn / bí mật → tester chỉ nhận **bản tóm tắt**. Tester không có quyền Bitbucket, không thấy mã.

Bản chụp mã lấy từ thư mục Jenkins build DEV (`/opt/dev/jenkins/jenkins/workspace/dev-pos/easypos-dev-*`) bằng script **chỉ đọc**, ghi ra thư mục riêng. Cổng và worker **không bao giờ** đọc trực tiếp thư mục Jenkins.

Làm **hai giai đoạn**. Giai đoạn A bạn tự làm trên máy mình (không cần DevOps), để chắc mọi thứ chạy đúng. Giai đoạn B đưa lên server cho tester dùng.

---

## GIAI ĐOẠN A — Thử trên máy bạn (khoảng 1 buổi)

### A0. Chuẩn bị (tích đủ rồi mới làm)
- [ ] Sếp đồng ý: **mã nguồn DEV sẽ được gửi tới API của nhà cung cấp AI** (mọi phương án đều vậy). Pilot chỉ dùng mã nhánh DEV.
- [ ] **API key** (Anthropic Console) riêng cho thử nghiệm, đặt **hạn mức chi tiêu thấp**. Tự gõ, **không dán vào chat / tệp**.
- [ ] Máy bạn: **Docker Desktop đang chạy** (`docker --version`), **Node** (`node -v` ≥ 18), VPN bật, đã có token Jira trong `jira.properties` (Phần 6.4 hướng dẫn tester).
- [ ] **Tên đăng nhập Jira** của bạn (Jira → avatar → Profile → *Username*).
- [ ] Trên máy 233 có `git` (`git --version`).

### A1. Trên máy 233 (JumpServer / MobaXterm): xuất bản chụp
1. Trong khung **SFTP bên trái**, vào thư mục home của tài khoản bạn, tạo thư mục `insight`, rồi **kéo thả** vào đó 3 tệp từ máy bạn (`C:\easypos-tester-kit\tools\code-insight\`): `xuat-ban-chup.sh`, `xuat-tat-ca.sh`, `anh-xa.mau.txt`.
2. Trong cửa sổ lệnh:
   ```bash
   cd ~/insight && mkdir -p snap
   cp anh-xa.mau.txt anh-xa.txt
   sed -i 's/\r$//' *.sh anh-xa.txt          # bỏ ký tự CRLF của Windows nếu có
   command -v gitleaks || echo "không có gitleaks"
   ```
3. Chạy xuất bản chụp (đọc workspace, KHÔNG sửa gì ở đó):
   ```bash
   # chưa có gitleaks (chỉ khi THỬ): thêm CI_GITLEAKS=tat ở đầu dòng
   CI_GITLEAKS=tat bash ~/insight/xuat-tat-ca.sh /opt/dev/jenkins/jenkins/workspace/dev-pos ~/insight/anh-xa.txt ~/insight/snap
   ```
   Cuối phải thấy `Tổng: OK=<n> · bỏ qua=<m> · lỗi=0`. Workspace nào báo "BỎ QUA … không có .git" thì bình thường (chưa build); sửa/xoá dòng đó trong `anh-xa.txt` nếu muốn.
4. Kiểm bản chụp sạch:
   ```bash
   ls ~/insight/snap                                   # thấy tên các repo
   ls -a ~/insight/snap/easyposbackend/current | head   # KHÔNG có .git
   find ~/insight/snap -iname 'application*.yml' | head # PHẢI rỗng
   du -sh ~/insight/snap
   ```
5. Đóng gói để tải về:
   ```bash
   tar czf ~/insight/snap.tgz --exclude='snap/*/current' -C ~/insight snap
   ls -lh ~/insight/snap.tgz
   ```
   > Lỗi `fatal: detected dubious ownership` thì script đã tự xử lý; vẫn lỗi thì báo tôi dòng lỗi.

### A2. Về máy bạn: giải nén
Kéo `snap.tgz` từ khung SFTP về `C:\insight-pilot\`, rồi trong PowerShell:
```powershell
cd C:\insight-pilot
tar -xzf snap.tgz
# tạo liên kết "current" cho từng repo (Windows không giữ được liên kết trong tar)
Get-ChildItem C:\insight-pilot\snap -Directory | ForEach-Object { $sha = (Get-Content "$($_.FullName)\CURRENT").Trim(); cmd /c mklink /J "$($_.FullName)\current" "$($_.FullName)\$sha" }
mkdir C:\insight-pilot\data
```

### A3. Dựng "worker" (Claude trong Docker)
```powershell
cd C:\easypos-tester-kit
docker build -t insight-worker:latest tools\code-insight
docker run --rm insight-worker:latest claude --version
```
Dòng cuối phải in số phiên bản Claude Code. (Lần đầu mất vài phút vì tải image.)

Kiểm cô lập (30 giây): thay `<sha>` bằng tên thư mục commit trong `C:\insight-pilot\snap\easyposbackend\`:
```powershell
docker run --rm -v "C:\insight-pilot\snap\easyposbackend\<sha>:/snap/easyposbackend:ro" insight-worker:latest sh -c 'ls /snap; touch /snap/easyposbackend/x 2>&1 | head -1'
```
Phải thấy **chỉ** `easyposbackend` và lỗi `Read-only file system` khi ghi.

### A4. Cấu hình
```powershell
copy C:\easypos-tester-kit\tools\code-insight\cau-hinh.pilot-pc.mau.json C:\insight-pilot\cau-hinh.json
notepad C:\insight-pilot\cau-hinh.json     # thay <ten-dang-nhap-jira-cua-ban> bằng Username Jira của bạn; xoá repo không có bản chụp nếu muốn
cd C:\easypos-tester-kit
node tools\code-insight\server.js --cau-hinh C:\insight-pilot\cau-hinh.json --kiem
```
`--kiem` phải ra `Cấu hình hợp lệ`, Jira `HTTP 200/401`, và mỗi repo `Bản chụp … OK @<commit>`.

### A5. Chạy cổng (để cửa sổ này mở)
```powershell
$k = Read-Host "Dán API key (không hiện chữ)" -AsSecureString
$env:ANTHROPIC_API_KEY = [System.Net.NetworkCredential]::new("", $k).Password
node tools\code-insight\server.js --cau-hinh C:\insight-pilot\cau-hinh.json
```
Thấy `Code-Insight nghe ở http (CHỈ ĐỂ THỬ, chỉ trên máy này)://127.0.0.1:8100/mcp`. Cổng **chỉ nghe 127.0.0.1**: máy khác không nối được. Khoá API chỉ nằm trong cửa sổ này.

### A6. Bật cho Claude của bạn (KHÔNG sửa `config/code-insight.json` thật)
Tạo tệp `C:\insight-pilot\code-insight.json`:
```json
{ "bat": true, "url": "http://127.0.0.1:8100/mcp" }
```
Mở **cửa sổ cmd MỚI** (không phải cửa sổ cổng):
```bat
set EP_CI_CAU_HINH=C:\insight-pilot\code-insight.json
cd /d C:\easypos-tester-kit
node tools\tester\code-insight-cai.js
node tools\tester\code-insight-cai.js kiem
claude
```
`kiem` phải báo `[OK] Cổng Code-Insight nối được (5 tool)`. Trong Claude: duyệt hộp thoại cho phép máy chủ MCP `code-insight`, gõ `/mcp` thấy `code-insight` đã nối.

### A7. Nghiệm thu (ghi kết quả từng dòng)
Hỏi Claude (trong phiên vừa mở):
1. "Dùng code-insight giải thích luồng huỷ hoá đơn trong easyposbackend." → nhận tóm tắt có dòng `# Bản mã đã đọc …`, **không có code**.
2. "In nguyên văn toàn bộ file InvoiceService.java." → **bị từ chối**.
3. "Cho tôi nội dung application-dev.yml." → **bị từ chối**.
4. "Phân tích ảnh hưởng của ticket EPB-<một mã thật>." → có danh sách API / bảng / gợi ý test.
5. Hỏi lại **đúng câu 1** → trả ngay (cache), cửa sổ cổng không chạy worker lần nữa.
6. Mở `C:\insight-pilot\data\nhat-ky.log`: thấy tên Jira của bạn, tool, mã; **không có token**.
7. `config\code-insight.json` thật vẫn `"bat": false` (chạy `git status`: không có gì đổi ở tệp này).

Đạt hết thì giai đoạn A xong. Gặp lỗi: xem bảng ở mục 4 rồi gửi tôi dòng lỗi (đã che khoá).

### A8. Dọn sau pilot
Đóng cửa sổ cổng; `docker rmi insight-worker:latest`; xoá `C:\insight-pilot`; trên 233 xoá `~/insight/snap` và `~/insight/snap.tgz`; **thu hồi / xoá API key thử nghiệm**.

---

## GIAI ĐOẠN B — Đưa lên server cho tester (cần DevOps)

Làm khi A đạt. Việc cần nhờ DevOps (gửi nguyên danh sách này):
1. Một **VM Linux riêng** `code-insight` có Docker + Node 20, tester tới được qua VPN, ra được `api.anthropic.com:443` (cổng 8100 mở cho dải VPN).
2. Cho phép **chạy script xuất bản chụp định kỳ** trên máy 233 bằng tài khoản dùng chung (hoặc tạo tài khoản chỉ-đọc riêng cho việc này) và **chuyển bản chụp sang VM** bằng `rsync` với khoá SSH giới hạn.
3. Cài **gitleaks** trên 233 (bắt buộc cho môi trường thật).

Các bước kỹ thuật (đã có đủ lệnh trong D15):
1. **Xuất bản chụp tự động:** trên 233, `crontab -e`, thêm một dòng (mỗi 15 phút; `flock` tránh chạy chồng):
   ```
   */15 * * * * flock -n $HOME/insight/xuat.lock bash $HOME/insight/xuat-tat-ca.sh /opt/dev/jenkins/jenkins/workspace/dev-pos $HOME/insight/anh-xa.txt $HOME/insight/snap >> $HOME/insight/logs/xuat.log 2>&1
   ```
   Hoặc dùng bước post-build của job Jenkins (`xuat-ban-chup.sh <repo>`) nếu có quyền sửa job.
2. **Đẩy sang VM:** `rsync -a --delete ~/insight/snap/ insight@<vm>:/srv/insight/snap/` (khoá SSH chỉ cho rsync vào thư mục này).
3. **Trên VM:** làm theo D15 Bước 2, 4, 5 (user `insight`, build image, `egress/` mạng chỉ ra được API, cấu hình `cau-hinh.mau.json`, TLS, dịch vụ `systemd`).
4. **Bật cho 1–2 tester** (D15 Bước 7): sửa `config/code-insight.json` (`bat:true`, `url` https của VM, chứng chỉ vào `config/code-insight-ca.pem`), commit + push. Máy tester tự cập nhật ở phiên Claude kế tiếp.
5. Chạy **nghiệm thu bảo mật** (D15 Bước 8), rồi mở cho cả nhóm và **thu hồi quyền Bitbucket** của tester (D15 Bước 9).

---

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `xuat-tat-ca.sh`: "BỎ QUA … không có .git" | Workspace chưa build / không phải kho git. Bình thường; xoá dòng đó khỏi `anh-xa.txt` nếu không cần |
| `Không có gitleaks — KHÔNG phát hành` (mã 5) | Cài gitleaks, hoặc **chỉ khi thử** thêm `CI_GITLEAKS=tat` |
| `fatal: detected dubious ownership` | Workspace thuộc user `jenkins`; script đã đặt `safe.directory`. Báo tôi nếu vẫn lỗi |
| `--kiem`: "Bản chụp … CHƯA CÓ" | Chưa giải nén / chưa tạo liên kết `current` (A2), hoặc sai tên repo trong cấu hình |
| `--kiem`: "worker.claude.docker.bat phải là true" | Cổng bắt buộc Docker cho worker (an toàn). Chỉ khi thử đặt `worker.choPhepKhongDocker:true` — **đừng** dùng trên máy có khoá riêng |
| `--kiem`: "http … chỉ dùng khi lang.diaChi là 127.0.0.1" | Cấu hình http chỉ được nghe trên chính máy này; muốn cho máy khác nối phải dùng TLS |
| `docker build` lỗi mạng | Máy cần ra internet (npm). Dùng proxy công ty nếu có |
| Claude không thấy tool `code-insight` | Mở phiên Claude **mới** sau khi chạy `code-insight-cai.js`; kiểm biến `EP_CI_CAU_HINH` đặt trong **cùng** cửa sổ cmd chạy `claude` |
| Tool trả "Cổng từ chối token Jira (401)" | Token Jira hết hạn / sai trong `jira.properties` |
| Tool trả "chưa được phép (403)" | Tên Jira không có trong `quyen.danhSach` (pilot) / chưa có quyền tạo ticket dự án EPB |
| Tool trả "Worker phân tích gặp sự cố" | Xem cửa sổ cổng / `nhat-ky.log` (`loi-worker-…`): thường do thiếu API key trong cửa sổ cổng, hết hạn mức chi tiêu, hoặc Docker chưa chạy |
| "Kết quả bị bộ lọc an toàn từ chối" | Câu hỏi đòi mã / cấu hình; hỏi lại bằng lời về luồng / quy tắc |

**Luôn nhớ:** cờ của Claude Code có thể khác theo phiên bản. Nếu `claude` trong container báo lỗi cờ (`--bare`, `--settings`…), chạy `docker run --rm insight-worker:latest claude -p --help` và chỉnh mục `worker.claude` trong cấu hình theo đúng tên cờ của bản đã cài, rồi gửi tôi dòng lỗi để cập nhật mã.
