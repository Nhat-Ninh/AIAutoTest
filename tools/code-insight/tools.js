/* tools.js — DANH MỤC TOOL MCP của Code-Insight. Mỗi tool có: mô tả cho Claude local, lược đồ đầu vào (kiểm nghiêm), lược đồ ĐẦU RA
 * (bộ lọc loc.js ép — không có trường nào chứa code), nhiệm vụ giao cho worker và khoá cache.
 * Không tool nào nhận đường dẫn tệp hay lệnh tự do. Thêm tool mới = thêm một mục ở đây (+ test), không đụng cổng. */
'use strict';
const { Str, Enum, Arr, Obj, ThamChieu } = require('./loc');
const { chuan } = require('./chi-muc');

class LoiDauVao extends Error { constructor(msg) { super(msg); this.ma = 'dau-vao'; } }

const METHOD = Enum('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
const TUY = (n) => Object.assign({}, n, { tuyChon: true });

/* Câu hỏi đòi in nguyên văn / cấu hình / bí mật: từ chối ngay ở cổng (lớp phụ; lớp chặn thật vẫn là bộ lọc output). */
const DOI_IN_NGUYEN = /(\b(in|cho xem|hiện|show|print|cat|dump|paste|copy|chép|xuất)\b.{0,40}\b(nguyên văn|nguyên|toàn bộ|tất cả|full|whole|entire|verbatim|raw)\b.{0,40}\b(tệp|file|code|mã|source|class|hàm|method)\b)|(\b(nguyên văn|verbatim)\b.{0,40}\b(code|mã|tệp|file)\b)/i;
const DOI_BI_MAT = /(application-[\w.-]*\.(ya?ml|properties)|\.env\b|mật\s*khẩu|password|secret|private\s*key|id_rsa|credentials?\b|\.pem\b|\.jks\b)/i;

const DOI_BI_MAT_GON = /(password|matkhau|mậtkhẩu|secret|privatekey|applicationdev|applicationprod|applicationyml)/i;

function chuanHoaChuoi(v, ten, min, max) {
  if (typeof v !== 'string') throw new LoiDauVao(ten + ' phải là chuỗi');
  const s = chuan(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>`]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) throw new LoiDauVao(ten + ' phải dài ' + min + '–' + max + ' ký tự');
  if (DOI_IN_NGUYEN.test(s)) throw new LoiDauVao('Câu hỏi bị từ chối: cổng chỉ trả bản tóm tắt, không in nguyên văn mã nguồn');
  // Kiểm cả dạng đã bỏ khoảng trắng / dấu nối (chặn "pass word", "pass-word"): lớp phụ, lớp chặn thật là bộ lọc output.
  if (DOI_BI_MAT.test(s) || DOI_BI_MAT_GON.test(s.replace(/[\s._-]+/g, ''))) throw new LoiDauVao('Câu hỏi bị từ chối: cổng không phục vụ cấu hình / bí mật');
  return s;
}
function chuanHoaRepo(v, cfg) {
  if (v === undefined || v === null || v === '') return '';
  const r = String(v).toLowerCase();
  if (!/^[a-z0-9_.-]{1,80}$/.test(r) || !(cfg.repo || []).includes(r)) throw new LoiDauVao('repo không nằm trong danh sách cổng phục vụ');
  return r;
}

const DS = {
  phan_tich_jira: {
    moTa: 'Phân tích ảnh hưởng của một ticket Jira (vd EPB-123) lên mã nguồn đang chạy trên DEV: luồng nghiệp vụ, API, bảng CSDL, rủi ro, gợi ý test. Trả bản tóm tắt đã lọc, KHÔNG có mã nguồn.',
    inputSchema: { type: 'object', properties: { ma: { type: 'string', description: 'Mã ticket Jira, ví dụ EPB-123' } }, required: ['ma'], additionalProperties: false },
    kiemDauVao(a) {
      const ma = String((a && a.ma) || '').trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/.test(ma)) throw new LoiDauVao('Mã Jira không hợp lệ (dạng EPB-123)');
      return { ma };
    },
    luocDo: Obj({
      ma: Str(40),
      luong_anh_huong: Arr(Str(200), 15),
      api: Arr(Obj({ method: METHOD, duong_dan: Str(200, { ten: true }), quyen: TUY(Str(80, { ten: true })), mo_ta: TUY(Str(200)) }), 30),
      bang_db: Arr(Obj({ bang: Str(80, { ten: true }), cot: Arr(Str(60, { ten: true }), 20) }), 20),
      rui_ro: Arr(Obj({ mo_ta: Str(400), tham_chieu: ThamChieu() }), 15),
      goi_y_test: Arr(Str(300), 25),
      ghi_chu: TUY(Str(400)),
    }),
    nhiemVu: (n) => 'Phân tích ảnh hưởng của ticket ' + n.ma + '. Tìm các commit nhắc mã này trong .insight/commits.txt, lấy tệp đổi trong .insight/changes.txt, rồi đọc các tệp đó (bản đang chạy trên DEV) để xác định luồng, API, bảng CSDL, rủi ro và gợi ý test. Nếu không thấy commit nào nhắc mã này, nói rõ trong ghi_chu và trả các mảng rỗng.',
    khoaCache: (n) => n.ma,
  },
  giai_thich_luong: {
    moTa: 'Giải thích BẰNG LỜI một luồng nghiệp vụ trong mã nguồn (kèm tham chiếu tệp:dòng). Không trả code.',
    inputSchema: { type: 'object', properties: { cau_hoi: { type: 'string', description: 'Câu hỏi bằng lời, tối đa 500 ký tự' }, repo: { type: 'string', description: 'Tên repo — NÊN chỉ định (vd easyposbackend): không chỉ định thì phân tích chậm và tốn kém hơn nhiều' } }, required: ['cau_hoi'], additionalProperties: false },
    kiemDauVao(a, cfg) { return { cau_hoi: chuanHoaChuoi(a && a.cau_hoi, 'cau_hoi', 5, 500), repo: chuanHoaRepo(a && a.repo, cfg) }; },
    luocDo: Obj({
      tom_tat: Str(400),
      buoc: Arr(Obj({ mo_ta: Str(300), tham_chieu: ThamChieu() }), 25),
      quy_tac: Arr(Str(300), 15),
      cau_hoi_mo: Arr(Str(200), 10),
    }),
    nhiemVu: (n) => 'Trả lời câu hỏi sau bằng cách đọc mã nguồn' + (n.repo ? ' của repo ' + n.repo : '') + ' và mô tả luồng xử lý theo từng bước.' + (n.repo ? '' : ' Không chỉ định repo: trước hết chọn TỐI ĐA 3 repo liên quan nhất theo tên thư mục (liệt kê thư mục gốc), chỉ đọc các repo đó, KHÔNG quét tất cả các repo.'),
    khoaCache: (n) => n.repo + '|' + n.cau_hoi.toLowerCase(),
  },
  suy_ra_nghiep_vu: {
    moTa: 'SUY RA nghiệp vụ và logic của một chức năng TỪ MÃ NGUỒN (dùng khi KHÔNG có tài liệu nghiệp vụ) để sinh testcase chặt chẽ: tác nhân / quyền, luồng, quy tắc có điều kiện + kết quả, ràng buộc từng trường (bắt buộc, kiểu, giới hạn), nhánh lỗi, chuyển trạng thái, tác dụng phụ (bảng / sự kiện), giá trị biên, điểm nghi vấn. Mọi điều trả về là SUY LUẬN TỪ CODE, chưa phải yêu cầu của BA. Trả bản tóm tắt đã lọc, KHÔNG có mã nguồn.',
    inputSchema: { type: 'object', properties: { chuc_nang: { type: 'string', description: 'Tên chức năng bằng lời, vd "tạo sản phẩm từ iCheck"' }, repo: { type: 'string', description: 'Tên repo — NÊN chỉ định (vd easyposbackend); chức năng trải nhiều repo thì gọi lần lượt từng repo' } }, required: ['chuc_nang'], additionalProperties: false },
    kiemDauVao(a, cfg) { return { chuc_nang: chuanHoaChuoi(a && a.chuc_nang, 'chuc_nang', 3, 200), repo: chuanHoaRepo(a && a.repo, cfg) }; },
    // Báo cáo dài hơn các tool khác (nhiều quy tắc / ràng buộc / nhánh lỗi): nới giới hạn tổng và số đoạn che CHỈ cho tool này; các lớp lọc còn lại giữ nguyên.
    locCauHinh: { tongToiDa: 28000, soCheToiDa: 16 },
    luocDo: Obj({
      tom_tat: Str(500),
      tac_nhan: TUY(Arr(Str(120), 8)),
      luong_chinh: Arr(Obj({ mo_ta: Str(300), tham_chieu: ThamChieu() }), 25),
      quy_tac: Arr(Obj({ ma: Str(20, { ten: true }), mo_ta: Str(300), dieu_kien: TUY(Str(250)), ket_qua: TUY(Str(250)), tham_chieu: TUY(ThamChieu()) }), 60),
      rang_buoc_truong: TUY(Arr(Obj({ truong: Str(80, { ten: true }), kieu: Str(40), bat_buoc: Enum('co', 'khong', 'co-dieu-kien'), gioi_han: TUY(Str(160)), tham_chieu: TUY(ThamChieu()) }), 60)),
      nhanh_loi: TUY(Arr(Obj({ tinh_huong: Str(220), phan_hoi: Str(220), ma_loi: TUY(Str(80, { ten: true })), tham_chieu: TUY(ThamChieu()) }), 50)),
      chuyen_trang_thai: TUY(Arr(Obj({ doi_tuong: Str(80), tu: Str(60), den: Str(60), dieu_kien: TUY(Str(200)), tham_chieu: TUY(ThamChieu()) }), 30)),
      phan_quyen: TUY(Arr(Str(220), 15)),
      tac_dung_phu: TUY(Arr(Obj({ mo_ta: Str(250), bang: TUY(Str(80, { ten: true })), tham_chieu: TUY(ThamChieu()) }), 30)),
      diem_bien: TUY(Arr(Str(250), 40)),
      diem_nghi_van: TUY(Arr(Obj({ mo_ta: Str(300), tham_chieu: ThamChieu() }), 25)),
      cau_hoi_mo: TUY(Arr(Str(250), 15)),
      ghi_chu: TUY(Str(400)),
    }),
    nhiemVu: (n) => 'Mục tiêu: SUY RA nghiệp vụ và logic của chức năng "' + n.chuc_nang + '"' + (n.repo ? ' trong repo ' + n.repo : '') + ' từ mã nguồn, ở mức đủ chi tiết để một kiểm thử viên sinh testcase CHẶT CHẼ mà không cần đọc mã. ' +
      'Đọc theo luồng (giao diện → controller → service → repository / truy vấn → thực thể) và liệt kê: (1) tác nhân và quyền cần có; (2) luồng chính từng bước; (3) MỌI nhánh điều kiện ở dạng "quy tắc": điều kiện → kết quả (mỗi nhánh if / else / switch / early-return có ý nghĩa nghiệp vụ là một quy tắc, đánh mã QT-01, QT-02…); (4) ràng buộc từng trường vào (kiểu, bắt buộc hay bắt buộc có điều kiện, độ dài / giá trị tối thiểu - tối đa, định dạng, duy nhất, giá trị mặc định, cách xử lý rỗng / null / khoảng trắng) — NÊU CẢ chỗ giao diện và phía máy chủ kiểm khác nhau; (5) mọi nhánh lỗi: tình huống gây lỗi và phản hồi (mã HTTP, mã lỗi, ý của thông báo — diễn đạt bằng LỜI CỦA BẠN, không chép nguyên văn thông báo); (6) chuyển trạng thái hợp lệ và các chuyển KHÔNG được phép; (7) tác dụng phụ: bảng nào được ghi / sửa / xoá mềm, sự kiện hay thông điệp gửi đi, gọi dịch vụ khác, giao dịch (transaction) bao những gì; (8) giá trị biên cụ thể suy ra từ code (giới hạn độ dài, số lượng tối đa, làm tròn, ngày, đơn vị tính, tách công ty bằng com_id); (9) ĐIỂM NGHI VẤN giúp tìm lỗi mà người thường khó nghĩ tới: thiếu kiểm tra, kiểm tra không đối xứng giữa giao diện và máy chủ, lỗi làm tròn / tràn số, xử lý null, thiếu lọc theo công ty hoặc xoá mềm, không idempotent (bấm hai lần, gửi lại), điều kiện tranh chấp giữa hai yêu cầu đồng thời, nuốt lỗi âm thầm, lỗi giữa chừng để lại dữ liệu dở, mã trạng thái / thông báo không nhất quán. ' +
      'Mọi mục có thể truy vết thì ghi tham_chieu (tệp:dòng). Điều không thấy trong mã thì KHÔNG bịa: ghi vào cau_hoi_mo để hỏi BA.' + (n.repo ? '' : ' Không chỉ định repo: trước hết chọn TỐI ĐA 3 repo liên quan nhất theo tên thư mục (liệt kê thư mục gốc), chỉ đọc các repo đó, KHÔNG quét tất cả các repo.'),
    khoaCache: (n) => n.repo + '|' + n.chuc_nang.toLowerCase(),
  },
  liet_ke_api: {
    moTa: 'Liệt kê API (method, đường dẫn, tham số, mã lỗi, quyền) liên quan một chức năng.',
    inputSchema: { type: 'object', properties: { chuc_nang: { type: 'string', description: 'Tên chức năng, vd "huỷ hoá đơn"' }, repo: { type: 'string' } }, required: ['chuc_nang'], additionalProperties: false },
    kiemDauVao(a, cfg) { return { chuc_nang: chuanHoaChuoi(a && a.chuc_nang, 'chuc_nang', 3, 200), repo: chuanHoaRepo(a && a.repo, cfg) }; },
    luocDo: Obj({ api: Arr(Obj({ method: METHOD, duong_dan: Str(200, { ten: true }), tham_so: Arr(Str(80, { ten: true }), 20), ma_loi: Arr(Str(80, { ten: true }), 10), quyen: TUY(Str(80, { ten: true })) }), 40) }),
    nhiemVu: (n) => 'Liệt kê các API REST liên quan chức năng "' + n.chuc_nang + '"' + (n.repo ? ' trong repo ' + n.repo : '') + ': method, đường dẫn, tên tham số, mã lỗi, quyền yêu cầu.' + (n.repo ? '' : ' Không chỉ định repo: trước hết chọn TỐI ĐA 3 repo liên quan nhất theo tên thư mục (liệt kê thư mục gốc), chỉ đọc các repo đó, KHÔNG quét tất cả các repo.'),
    khoaCache: (n) => n.repo + '|' + n.chuc_nang.toLowerCase(),
  },
  bang_db_lien_quan: {
    moTa: 'Liệt kê bảng và cột CSDL liên quan một chức năng, để kiểm dữ liệu bằng dbq.js.',
    inputSchema: { type: 'object', properties: { chuc_nang: { type: 'string' }, repo: { type: 'string' } }, required: ['chuc_nang'], additionalProperties: false },
    kiemDauVao(a, cfg) { return { chuc_nang: chuanHoaChuoi(a && a.chuc_nang, 'chuc_nang', 3, 200), repo: chuanHoaRepo(a && a.repo, cfg) }; },
    luocDo: Obj({ bang: Arr(Obj({ bang: Str(80, { ten: true }), cot: Arr(Str(60, { ten: true }), 30), ghi_chu: TUY(Str(200)) }), 30) }),
    nhiemVu: (n) => 'Liệt kê các bảng và cột CSDL mà chức năng "' + n.chuc_nang + '"' + (n.repo ? ' (repo ' + n.repo + ')' : '') + ' đọc / ghi.' + (n.repo ? '' : ' Không chỉ định repo: trước hết chọn TỐI ĐA 3 repo liên quan nhất theo tên thư mục (liệt kê thư mục gốc), chỉ đọc các repo đó, KHÔNG quét tất cả các repo.'),
    khoaCache: (n) => n.repo + '|' + n.chuc_nang.toLowerCase(),
  },
};

/** Danh sách tool theo khuôn MCP (tools/list). */
function danhSach() { return Object.keys(DS).map(ten => ({ name: ten, description: DS[ten].moTa, inputSchema: DS[ten].inputSchema })); }

module.exports = { DS, danhSach, LoiDauVao };
