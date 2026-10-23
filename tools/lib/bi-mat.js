/* Quét bí mật (mật khẩu, token…) trong văn bản — DÙNG CHUNG cho jira-tao.js (mô tả ticket) và bai-hoc.js (bài học trước khi lên git).
 * Trước đây mẫu nằm riêng trong jira-tao.js; gom về đây để thêm một mẫu là mọi công cụ cùng được bảo vệ. */
'use strict';
const MAU_BI_MAT = [
  [/\b(password|passwd|pwd|mật\s*khẩu)\s*[:=]\s*["']?[^\s"',;]{3,}/i, 'mật khẩu'],
  [/Bearer\s+[A-Za-z0-9._~+\/=-]{20,}/, 'Bearer token'],
  [/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/, 'JWT / id_token'],
  [/\b(jira|confluence|git)\.token\s*[:=]/i, 'khóa token của kit'],
  [/\bBBDC-[A-Za-z0-9+\/=]{10,}/, 'token Bitbucket'],
  [/\b(api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9+\/=_-]{24,}/i, 'khóa / token'],
];

/** Trả danh sách "<tên> dòng N: giống <loại>" cho mỗi dòng nghi chứa bí mật. Rỗng = sạch. */
function quetBiMat(text, ten) {
  const ra = [];
  String(text || '').split('\n').forEach((l, i) => { for (const [re, nhan] of MAU_BI_MAT) if (re.test(l)) ra.push(ten + ' dòng ' + (i + 1) + ': giống ' + nhan); });
  return ra;
}
module.exports = { MAU_BI_MAT, quetBiMat };
