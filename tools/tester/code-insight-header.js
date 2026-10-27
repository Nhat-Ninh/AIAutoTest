#!/usr/bin/env node
/* code-insight-header.js — "headersHelper" của máy khách MCP Code-Insight: Claude Code gọi tiến trình này mỗi lần nối cổng và lấy tiêu đề xác thực
 * từ stdout (JSON). Dùng TOKEN JIRA của chính tester (jira.properties / EP_JIRA_TOKEN) để cổng biết họ là ai — không có token riêng nào khác.
 * Token CHỈ được in ra stdout cho Claude Code dùng làm tiêu đề; không bao giờ in ra stderr / nhật ký. Không có token thì in {} (cổng sẽ trả 401). */
'use strict';
const A = require('../lib/atlassian');
const tk = A.layToken('jira');
if (!tk) { console.error('Chưa có token Jira — cổng Code-Insight dùng token Jira của bạn (HUONG-DAN-TESTER Phần 6.4).'); process.stdout.write('{}'); process.exit(0); }
process.stdout.write(JSON.stringify({ Authorization: 'Bearer ' + tk.token }));
