# Bản đồ hệ thống EasyPOS (cho người kiểm thử và cho Claude)

> Tổng hợp từ code trong workspace `SOFTDREAM-PRJ` ngày 21/10/2026 (các tệp `application*.yml`, gateway, `easypos-frontend`, entity).
> **Không chứa mật khẩu.** Mục "CẦN XÁC NHẬN" là chỗ code không cho biết — hỏi DevOps / dev trước khi tin.

## 1. Profile = môi trường

| Profile Spring | Là gì | Dấu hiệu trong cấu hình |
|---|---|---|
| `dev` | **DEV — môi trường kiểm thử ĐẦU TIÊN** (bộ kit: project `dev`) | CSDL **`easyposbackoffice`** @ `10.100.110.78:1433`; Mongo `EasyPosAsync`. Trong code, profile `dev`: gateway cổng 8088, backend 8080, config server `localhost:8443` — đó là cấu hình chạy máy dev; địa chỉ web của môi trường dev dùng chung cần hỏi dev / DevOps |
| `prodTest` | **UAT — kiểm thử SAU dev** (bộ kit: project `uat`) | Gateway cổng **8888**, backend **9112**; CSDL **`easyposuat`** @ `10.100.110.78:1433`; Mongo `easypos_async_83`; Redis `10.100.140.9` db 2/6; Kafka `10.100.140.43:9092` |
| `prod` | **PROD — cấm chạm** | Cấu hình thật nằm ở **config server `10.100.110.16:8443`** (`${config.…}`), gateway chuyển tới `10.100.110.110:*` |

**Quy trình:** tester kiểm thử trên **DEV trước** (nhiều lỗi nhất, dev sửa nhanh), chức năng đạt trên dev mới chạy lại trên **UAT**. DEV và UAT cùng máy CSDL `10.100.110.78`, khác tên CSDL (`easyposbackoffice` ↔ `easyposuat`) — luôn ghi đúng môi trường trong lệnh và báo cáo.

CẦN XÁC NHẬN: `easypos-product-material` ở prodTest nối `easyposbackoffice` @ `10.100.112.200`; `easypos-report` và `easyposecommerce` nối `easyposbackofficenew` @ `10.100.110.78`. Chưa rõ máy `10.100.112.200` là test hay prod → **chưa đưa vào cấu hình**. Lưu ý: `easyposbackoffice` bên UAT trên máy `.200` KHÔNG phải CSDL dev trên `.78` dù trùng tên.

## 2. Service và cổng (profile prodTest, theo route của `easypos-gateway-cloud`)

Gateway nhận mọi lời gọi `/api/**` rồi chuyển đi (FE gọi API cùng gốc: `SERVER_API_URL = '/'`):

| Đường dẫn | Service | Cổng (prodTest) |
|---|---|---|
| `/authenticate` (viết lại thành `/api/client/common/authenticate`), `/api/client/common/**`, `/api/client/**`, `/api/p/**`, `/api/page/**`, `/api/integration/**` | `easyposbackend` | 9112 |
| `/api/client/page/product/**`, `product-unit`, `product-group`, `product-warranty` | `easypos-product-material` | 8089 |
| `/api/client/page/report2/**`, `/api/tax-notice/**`, `/api/client/page/home2/**` | `easypos-report` | 9116 |
| `/api/v1/integration/tax/**`, `/api/p/v1/integration/tax/**` | dịch vụ tích hợp thuế | 8880 |
| `/api/payment-integration/**`, `/api/sds-bank/**`, `/api/payment/**` | dịch vụ ngân hàng / thanh toán | 8603 |
| `/api/pharma/**` | dịch vụ nhà thuốc | 8602 |
| `/api/e-commerce/**` | `easyposecommerce` | 8882 |
| `/api/client/page/gas-log/**`, `/api/client/integration*/**` | tích hợp gas / MQTT | 8088 |

Các thành phần khác: `easyposasync` (xử lý bất đồng bộ, Kafka / RabbitMQ), `easypos-cache`, `invoice-service` (hoá đơn điện tử), `warehouse-service` (kho), `java-boilerplate`, `frontend-admin` (Angular, trang quản trị), `adminweb`.

## 3. Địa chỉ web

- **PROD đã biết** (đã đưa vào `prodChan`): `easypos.vn` (+ `api`, `order`, `help`, `socket`, `echatbot`…), `easyposs.vn` (+ `app`, `api`, `admin`), `id.easyca.vn`, `notify.easyca.vn`, `admin.softdreams.vn`, và các máy chủ `10.100.110.16 / .110 / .41 / .251 / .40 / .43 / .44 / .45 / .46 / .60 / .79 / .82`.
- **TEST đã biết**: `testtranshub.easypos.vn`, `testid.easyca.vn`, `testcrm.softdreams.vn`, `lendingtest.softdreams.vn`, `sadmin78.softdreams.vn` (đưa `testtranshub.easypos.vn` vào `khongPhaiProd` vì nằm dưới `easypos.vn`).
- **Đã dò thực tế ngày 21/10/2026 (từ máy có VPN, chỉ GET `/api/p/client/ping` và mở cổng):**
  - `10.100.110.78` — cổng **80** và **8081** (nginx, trang `easyPosFrontEnd`, hai bản build khác nhau, cả hai tự proxy `/api/**`), **8888** (gateway, cũng trả được trang FE); cổng 1433 (SQL Server, chứa cả `easyposbackoffice` lẫn `easyposuat`). Ping API: 200 ở cả ba cổng.
  - `10.100.140.43` — cổng **8888** (gateway, ping 200), **9112** (backend prodTest), **8089** (product-material), 8088, 80 (trang mặc định nginx), 8081. Trùng với CORS / Kafka của profile prodTest ⇒ nhiều khả năng là máy dịch vụ của **UAT**.
  - CHƯA phân biệt được cổng nào của `10.100.110.78` là DEV, cổng nào là UAT (code không ghi; cần dev / DevOps trả lời, hoặc xác định bằng một đăng nhập thật rồi đối chiếu công ty trong CSDL `easyposbackoffice` / `easyposuat`).
- **CẦN XÁC NHẬN**: địa chỉ web của **DEV** và của **UAT** (FE) — code không ghi. Gợi ý UAT: máy `10.100.140.43` (có trong CORS của gateway prodTest). Điền vào `config/moi-truong.json → moiTruong.dev.webUrl / apiUrl` và `moiTruong.uat.webUrl / apiUrl`.
- Công cụ nhóm: Jira `jira-sds.softdreams.vn:8080` (mã ticket `EPB-…`), Bitbucket `git-sds.softdreams.vn:7990` (project **`EPOS`**), Confluence `confluence-sds.softdreams.vn:8090`.

## 4. Đăng nhập

- **API:** `POST /api/client/common/authenticate` — body `{ username, password, companyId?, rememberMe, otp? }`.
- **Phản hồi:** `{ message, reason, status, data: { id_token, companies[], companyId, role, permissions, … } }` — token nằm trong **`data.id_token`**.
- **Nhiều công ty:** FE đọc `data.companies` (mỗi mục `id`, `name`, `address`, `taxCode`), hiện ô chọn `#companyId`, rồi gọi lại với `companyId`.
- **Lỗi thường gặp:** `BAD_CREDENTIALS` ("Tài khoản không hợp lệ"), `USER_NOT_FOUND`, `TRIAL_EXPIRED` / `ACCOUNT_EXPIRED` (tài khoản bị khoá khi hết hạn dùng thử — đừng dùng tài khoản dùng thử cho test).
- **OTP:** có thể bật theo tài khoản → tài khoản test phải **tắt OTP**.
- **Màn hình:** `/login`; ô `input[name=username]`, `input[name=password]` (nút mắt đổi type thành text), nút `button[type=submit]`.
- Backend có "super pass" riêng (`opt/easyPos/Security/password.json`) — **không dùng**.

## 5. Màn hình (thư mục `easypos-frontend/src/main/webapp/app/pages`)

`pos`, `order`, `qr-order`, `session` (ca làm việc), `tables`, `area`, `product`, `product-category`, `product-serial`, `product-topping`, `price-list-product`, `promotions`, `voucher`, `customer`, `staff`, `roles`, `warehouse`, `multi-warehouse`, `receipt-payment`, `payment-source`, `invoice`, `tax-invoice`, `tax-declaration`, `report`, `dashboard`, `import`/`export`, `e-commerce`, `pharmacy-sync-history`, `prescription-list`, `treatment`, `warranty`, `gas-log`, `processing`, `surcharge`, `systemLog`, `register*`, `profile-authentication`, `security-policy`.

Ghi chú nghiệp vụ lấy từ code: mở ca (`session`) — một người chỉ mở **một ca** cùng lúc (thông báo "Không thể mở nhiều hơn 1 ca làm việc tại cùng thời điểm"); đơn hàng đi qua gateway → `easyposbackend` (`bill`), hoá đơn điện tử đi qua `invoice-service` / tích hợp thuế.

## 6. CSDL (SQL Server: `easyposbackoffice` = dev, `easyposuat` = UAT; cùng cấu trúc) — bảng chính

- **Cột công ty (tenant) là `com_id`** (không phải `company_id`) — mọi truy vấn kiểm dữ liệu phải lọc theo công ty đang test.
- `bill` (`code`, `com_id`, `bill_date`, `amount`, `total_amount`, `status`, `status_invoice`, `payment_status`, `customer_id`, `area_unit_id`…), `bill_product`, `bill_return`, `bill_shipping`, `bill_config`.
- `shift` (`com_id`, `code`, `user_id`, `start_time`, `end_time`, `opening_cash`, `closing_cash`, `cash_variance`).
- `customer` (`com_id`, `code`, `name`, `phone_number`, `tax_code`, `debt_receivable`, `debt_payable`…), `customer_group`, `customer_card`, `loyalty_card`.
- `product`, `product_unit`, `product_group`, `price_list`, `price_list_product`, `combo_*`, `voucher`, `voucher_usage`.
- `inventory`, `inventory_log`, `inventory_checking`, `rs_inoutward` (+ `_detail`), `batches`.
- `invoice`, `invoice_ei` (+ `_product`), `tax_declaration`, `payment_history`, `ep_transaction`.
- `ep_user` (tài khoản), `company`, `company_user`, `role`, `permission`, `user_role`.
- Cột "xoá mềm" không đồng nhất giữa các bảng — **kiểm cột thực tế** bằng `SELECT TOP 1 *` trước khi dựng điều kiện.
- Không có công cụ cho Mongo (dev `EasyPosAsync`, UAT `easypos_async_83`) và Redis. Cấu trúc bảng dev và UAT có thể lệch nhau nếu dev chưa lên UAT — nếu SQL chạy được trên dev mà lỗi trên UAT, kiểm lại cột.

## 7. Repo Bitbucket (project `EPOS`, đọc bằng `tools/tester/bb.js`)

`easyposbackend`, `easypos-frontend`, `easypos-gateway-cloud`, `easypos-product-material`, `easypos-report`, `easypos-cache`, `easyposasync`, `easyposconfig`, `easyposecommerce`, `invoice-service`, `warehouse-service`, `frontend-admin`, `easyposbase`, `easyposmodel`, `base-report`, `starter-config`, `starter-model`, `starter-parent`, `warehouse-model`, `warehouse-proto`, `java-boilerplate`. (`adminweb` thuộc project `CICB`.)
Nhánh deploy thường có dạng `deployYYYYMMDD` (vd `deploy20260519`); nhánh làm việc `feature/<tên>/…`. **DEV (`http://10.100.140.9:8082/`) chạy nhánh `dev` của mọi repo** (xác nhận 22/10/2026) — `bb.js` tự đọc nhánh này khi không truyền nhánh. Riêng `invoice-service` không có nhánh `dev`: có `dev_ei`, `dev_vte`, `dev_ngp` (theo nhà cung cấp hoá đơn). **UAT: nhánh chưa xác định** (sẽ làm sau).

## 8. Việc còn thiếu thông tin (hỏi DevOps / dev)

1. Địa chỉ web + API của **DEV** (dùng chung, không phải localhost) và của **UAT**.
2. Máy CSDL **PROD** (để điền `prodDb` trong `config/moi-truong.json`) và tên các CSDL prod.
3. `10.100.112.200` là máy nào.
4. Tài khoản web test (tắt OTP, dữ liệu giả) và tài khoản CSDL **chỉ-đọc**, cho cả DEV (`easyposbackoffice`) và UAT (`easyposuat`).
5. Nhánh nào đang chạy DEV và UAT; quy ước tạo ticket lỗi trên Jira (project key, loại lỗi).
