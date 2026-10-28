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
      api: Arr(Obj({ method: METHOD, duong_dan: Str(200), quyen: TUY(Str(80)), mo_ta: TUY(Str(200)) }), 30),
      bang_db: Arr(Obj({ bang: Str(80), cot: Arr(Str(60), 20) }), 20),
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
  liet_ke_api: {
    moTa: 'Liệt kê API (method, đường dẫn, tham số, mã lỗi, quyền) liên quan một chức năng.',
    inputSchema: { type: 'object', properties: { chuc_nang: { type: 'string', description: 'Tên chức năng, vd "huỷ hoá đơn"' }, repo: { type: 'string' } }, required: ['chuc_nang'], additionalProperties: false },
    kiemDauVao(a, cfg) { return { chuc_nang: chuanHoaChuoi(a && a.chuc_nang, 'chuc_nang', 3, 200), repo: chuanHoaRepo(a && a.repo, cfg) }; },
    luocDo: Obj({ api: Arr(Obj({ method: METHOD, duong_dan: Str(200), tham_so: Arr(Str(80), 20), ma_loi: Arr(Str(80), 10), quyen: TUY(Str(80)) }), 40) }),
    nhiemVu: (n) => 'Liệt kê các API REST liên quan chức năng "' + n.chuc_nang + '"' + (n.repo ? ' trong repo ' + n.repo : '') + ': method, đường dẫn, tên tham số, mã lỗi, quyền yêu cầu.' + (n.repo ? '' : ' Không chỉ định repo: trước hết chọn TỐI ĐA 3 repo liên quan nhất theo tên thư mục (liệt kê thư mục gốc), chỉ đọc các repo đó, KHÔNG quét tất cả các repo.'),
    khoaCache: (n) => n.repo + '|' + n.chuc_nang.toLowerCase(),
  },
  bang_db_lien_quan: {
    moTa: 'Liệt kê bảng và cột CSDL liên quan một chức năng, để kiểm dữ liệu bằng dbq.js.',
    inputSchema: { type: 'object', properties: { chuc_nang: { type: 'string' }, repo: { type: 'string' } }, required: ['chuc_nang'], additionalProperties: false },
    kiemDauVao(a, cfg) { return { chuc_nang: chuanHoaChuoi(a && a.chuc_nang, 'chuc_nang', 3, 200), repo: chuanHoaRepo(a && a.repo, cfg) }; },
    luocDo: Obj({ bang: Arr(Obj({ bang: Str(80), cot: Arr(Str(60), 30), ghi_chu: TUY(Str(200)) }), 30) }),
    nhiemVu: (n) => 'Liệt kê các bảng và cột CSDL mà chức năng "' + n.chuc_nang + '"' + (n.repo ? ' (repo ' + n.repo + ')' : '') + ' đọc / ghi.' + (n.repo ? '' : ' Không chỉ định repo: trước hết chọn TỐI ĐA 3 repo liên quan nhất theo tên thư mục (liệt kê thư mục gốc), chỉ đọc các repo đó, KHÔNG quét tất cả các repo.'),
    khoaCache: (n) => n.repo + '|' + n.chuc_nang.toLowerCase(),
  },
};

/** Danh sách tool theo khuôn MCP (tools/list). */
function danhSach() { return Object.keys(DS).map(ten => ({ name: ten, description: DS[ten].moTa, inputSchema: DS[ten].inputSchema })); }

module.exports = { DS, danhSach, LoiDauVao };
