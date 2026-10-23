# Lỗi phần mềm / môi trường đã gặp — tra trước khi báo, tránh báo trùng

## BH-013 | tags: san-pham, tao-san-pham, http-500, trung-ma | Tạo sản phẩm trùng mã trả HTTP 500 thay vì 400
- Nội dung: `POST product/create1` với `code2` đã có trong công ty trả HTTP 500 (kèm thông báo đúng "Trùng mã sản phẩm", mã `PRODUCT_CODE_DUPLICATED`); mong đợi 400. Không tạo thêm dòng. Nguyên nhân gần đúng: BaseProcessService ném BaseInternalServerException cho lỗi trùng mã. Đã có nháp ticket; ticket gần giống đã có là EPB-24095 (chưa xác nhận cùng lỗi) — kiểm lại trước khi tạo ticket mới.
- Bằng chứng: báo cáo 2026-10-22_tao-san-pham/BUG-1.jira.md, TC-BE-004 trong 04-ket-qua-dev.md
- Xác nhận: 2026-10-22 · dev · easypos-product-material@dev
- Trạng thái: da-xac-nhan
- Áp dụng: easypos-product-material, BaseProcessService

## BH-014 | tags: dang-nhap, ui, get-company-configs, http-417 | Dev 23/10/2026: get-company-configs/9839 trả 417 "Lỗi hệ thống" làm giao diện kẹt ở trang đăng nhập
- Nội dung: Sau khi đăng nhập giao diện công ty 9839, `GET client/page/config/get-company-configs/9839` trả HTTP 417 (`Lỗi hệ thống`) và giao diện báo `Cannot read properties of null (reading 'shiftManager')` rồi không rời trang đăng nhập. Test giao diện nào cần `dangNhapUI` trượt vì lý do này: phân loại LỖI MÔI TRƯỜNG / PHẦN MỀM, không phải lỗi kịch bản. Chưa tạo ticket; kiểm lại trước khi báo (dev đang được deploy liên tục). ĐÃ HẾT: người dùng báo dev hết 417; chạy lại tao-san-pham 12 đạt, test giao diện đăng nhập đạt.
- Bằng chứng: lab 2026-10-23: KIEM-03, dang-nhap TC-FE-003, tao-san-pham TC-FE-001 trượt; gọi API bằng fixture `api` trả 417; ConfigManagementResource.java:176 (easyposbackend)
- Xác nhận: 2026-10-23 · dev · easyposbackend@dev (hết lỗi chiều cùng ngày)
- Trạng thái: het-han
- Áp dụng: easyposbackend ConfigManagementResource, màn đăng nhập

## BH-019 | tags: loi-nhuan, bao-cao, pdf, http-500, xuat | Báo cáo lợi nhuận sản phẩm: kết xuất PDF trả HTTP 500
- Nội dung: Test TC-FE-012 (Xuất Excel / PDF tải được): Excel tải được nhưng kết xuất PDF trả HTTP 500. Chưa tạo ticket; cần xác nhận với dev PDF của báo cáo này có được hỗ trợ không.
- Bằng chứng: lab 2026-10-23, bao-cao/_lab/sau3.json, e2e/tests/loi-nhuan-san-pham TC-FE-012
- Xác nhận: 2026-10-23 · dev · easypos-report@dev
- Trạng thái: nghi-ngo
- Áp dụng: Báo cáo › Lợi nhuận sản phẩm

## BH-020 | tags: loi-nhuan, bao-cao, chi-nhanh, br-13 | Báo cáo lợi nhuận sản phẩm: chọn 2 chi nhánh nhưng cột Chi nhánh chỉ có một giá trị
- Nội dung: Test TC-FE-015: chọn 2 chi nhánh nhưng cột Chi nhánh chỉ có "Cửa hàng test Imei" — tài liệu BR-13 yêu cầu mỗi dòng ghi chi nhánh sở hữu sản phẩm. Có thể do dữ liệu (chi nhánh kia chưa có bán hàng trong kỳ) chứ không phải lỗi; cần kiểm bằng SQL (Bước 5) trước khi báo.
- Bằng chứng: lab 2026-10-23, bao-cao/_lab/sau3.json, e2e/tests/loi-nhuan-san-pham TC-FE-015
- Xác nhận: 2026-10-23 · dev · easypos-report@dev
- Trạng thái: nghi-ngo
- Áp dụng: Báo cáo › Lợi nhuận sản phẩm

## BH-021 | tags: loi-nhuan, bao-cao, chi-tiet, ppuid, loc | Báo cáo lợi nhuận sản phẩm: API chi tiết không truyền ppuId vẫn trả 90 dòng của nhiều sản phẩm
- Nội dung: Test TC-BE-030: gọi `product-profit/detail` không có `ppuId` trả 90 dòng thuộc nhiều sản phẩm (tổng hợp có 23 sản phẩm) — nghi thiếu bộ lọc bắt buộc. Cần dev xác nhận hành vi mong đợi (trả rỗng / 400 / toàn bộ).
- Bằng chứng: lab 2026-10-23, bao-cao/_lab/sau3.json, e2e/tests/loi-nhuan-san-pham TC-BE-030
- Xác nhận: 2026-10-23 · dev · easypos-report@dev
- Trạng thái: nghi-ngo
- Áp dụng: API report2/product-profit/detail

## BH-022 | tags: loi-nhuan, bao-cao, sap-xep, mac-dinh | Báo cáo lợi nhuận sản phẩm: thứ tự mặc định không phải Doanh thu giảm dần như tài liệu
- Nội dung: Test TC-FE-008: tài liệu nói mặc định sắp xếp Doanh thu GIẢM dần nhưng giao diện không hiển thị đúng như vậy. Cần BA chốt (tài liệu hay giao diện đúng) — chưa phải lỗi chắc chắn.
- Bằng chứng: lab 2026-10-23, bao-cao/_lab/sau3.json, e2e/tests/loi-nhuan-san-pham TC-FE-008
- Xác nhận: 2026-10-23 · dev · easypos-frontend@dev
- Trạng thái: nghi-ngo
- Áp dụng: Báo cáo › Lợi nhuận sản phẩm

## BH-023 | tags: san-pham, quick-create, warehouse, icheck, loi-he-thong | Lưu nhanh sản phẩm (quick-create) không truyền warehouseId gây lỗi hệ thống
- Nội dung: Test TC-BE-ICK-011: `POST product/quick-create` với `warehouseId` null trả lỗi hệ thống thay vì tự chọn kho mặc định; spec đã ghi "LỖI PHẦN MỀM" và các ca hợp lệ khác luôn truyền warehouseId tường minh để không bị ảnh hưởng. ĐÃ SỬA: chạy lại 2026-10-23 (buổi chiều) trả HTTP 200 và tự chọn kho mặc định; test TC-BE-ICK-011 đã đổi sang kỳ vọng thành công.
- Bằng chứng: lab 2026-10-23, bao-cao/_lab/sau3.json, e2e/tests/icheck-tao-san-pham/icheck-be.spec.ts TC-BE-ICK-011
- Xác nhận: 2026-10-23 · dev · easypos-product-material@dev (hết lỗi)
- Trạng thái: het-han
- Áp dụng: easypos-product-material quick-create
