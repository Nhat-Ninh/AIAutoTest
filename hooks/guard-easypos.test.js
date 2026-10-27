#!/usr/bin/env node
/* Bộ thử guard-easypos.js — KHÔNG chạy lệnh nào, chỉ đưa lệnh giả vào decide() rồi so quyết định (allow / ask / deny).
 * Dùng cấu hình PROD GIẢ (địa chỉ tự đặt) để thử bộ máy hook; phần cuối kiểm cấu hình THẬT của bộ kit (config/moi-truong.json).
 * Chạy: node hooks/guard-easypos.test.js   (in từng ca + tổng; thoát mã 1 nếu có ca sai) */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const KIT = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-easypos-test-'));
const fixture = {
  prodChan: ['easypos.vn', 'easyposs.vn', 'api*.example-prod.vn', '10.200.0.', '10.100.110.110'],
  khongPhaiProd: ['testtranshub.easypos.vn'],
  prodDb: { hosts: ['10.200.5.', '10.100.110.16'], hostnames: ['epos-db-prod'], databases: ['EasyPosProd'], logins: ['app_prod'] },
  moiTruong: {
    dev: { db: { host: '10.100.110.78', database: 'easyposbackoffice' } },
    uat: { db: { host: '10.100.110.78', database: 'easyposuat' } },
  },
};
fs.writeFileSync(path.join(dir, 'moi-truong.json'), JSON.stringify(fixture));
// Tệp script mẫu cho nhóm ca "tệp chạy được đọc nội dung".
fs.writeFileSync(path.join(dir, 'doc-db.py'), "import pyodbc\nc = pyodbc.connect('SERVER=x')\n");
fs.writeFileSync(path.join(dir, 'goi-prod.js'), "fetch('https://app.easyposs.vn/api/client/common/introspect');\n");
fs.writeFileSync(path.join(dir, 'vo-hai.js'), "console.log('xin chao');\n");
process.env.EP_GUARD_CONFIG = path.join(dir, 'moi-truong.json');
process.env.EP_GUARD_NOLOG = '1';
// Cổng Code-Insight: các ca thường chạy với cổng TẮT (không phụ thuộc config/code-insight.json thật của máy đang chạy bộ thử).
const CI_TAT = path.join(dir, 'code-insight-tat.json'); fs.writeFileSync(CI_TAT, JSON.stringify({ bat: false, url: '' })); process.env.EP_CI_CAU_HINH = CI_TAT;
const { decide } = require('./guard-easypos.js');
const prod = require('./prod-config.js');

const bash = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd: cwd || 'C:/work/app' });
const ps = command => ({ tool_name: 'PowerShell', tool_input: { command }, cwd: 'C:/work/app' });
const read = file_path => ({ tool_name: 'Read', tool_input: { file_path } });
const grep = (pattern, p) => ({ tool_name: 'Grep', tool_input: { pattern, path: p } });
const write = (file_path, content) => ({ tool_name: 'Write', tool_input: { file_path, content } });
const edit = (file_path, new_string) => ({ tool_name: 'Edit', tool_input: { file_path, old_string: 'x', new_string: new_string || 'y' } });
const K = (...p) => path.join(KIT, ...p);
const HOME_CFG = path.join(os.homedir(), '.easypos-tester');
const DBQ = '"$EP_KIT/tools/tester/dbq.js"';

const cases = [
  // ---- tra CSDL: chỉ qua dbq.js
  ['dbq.js SELECT', bash(`node ${DBQ} uat c:/tmp/q.sql`), 'allow'],
  ['dbq.js SELECT trên môi trường dev', bash(`node ${DBQ} dev c:/tmp/q.sql`), 'allow'],
  ['jira-tao.js xem trước (dry-run) ⇒ cho', bash(`node "${K('tools', 'jira', 'jira-tao.js').replace(/\\/g, '/')}" bao-cao/x/BUG-1.jira.md`), 'allow'],
  ['jira-tao.js --toi ⇒ cho', bash(`node "$EP_KIT/tools/jira/jira-tao.js" --toi`), 'allow'],
  ['bai-hoc.js tim ⇒ cho', bash(`node "$EP_KIT/tools/tester/bai-hoc.js" tim san-pham`), 'allow'],
  ['bai-hoc.js them (xem trước) ⇒ cho', bash(`node "$EP_KIT/tools/tester/bai-hoc.js" them bao-cao/x/07-bai-hoc-nhap.md`), 'allow'],
  ['bai-hoc.js them --ghi ⇒ hỏi', bash(`node "$EP_KIT/tools/tester/bai-hoc.js" them bao-cao/x/07-bai-hoc-nhap.md --ghi`), 'ask'],
  ['dong-bo.js gui --xem (chỉ xem) ⇒ cho', bash(`node "$EP_KIT/tools/tester/dong-bo.js" gui --xem`), 'allow'],
  ['dong-bo.js "gui" (có ngoặc kép) ⇒ vẫn hỏi', bash(`node "$EP_KIT/tools/tester/dong-bo.js" "gui"`), 'ask'],
  ['dong-bo.js gui (gửi bài lên kho chung) ⇒ hỏi', bash(`node "$EP_KIT/tools/tester/dong-bo.js" gui`), 'ask'],
  ['dong-bo.js kiem / trang-thai ⇒ cho', bash(`node "$EP_KIT/tools/tester/dong-bo.js" trang-thai`), 'allow'],
  ['dong-bo.js cap-nhat ⇒ cho (kéo main, sao lưu khi cần)', bash(`node "$EP_KIT/tools/tester/dong-bo.js" cap-nhat`), 'allow'],
  ['dong-bo.js cap-nhat --chap-nhan-sao-luu (ghi đè kit) ⇒ hỏi', bash(`node "$EP_KIT/tools/tester/dong-bo.js" cap-nhat --chap-nhan-sao-luu`), 'ask'],
  ['EP_BO_QUA_DONG_BO=1 (tắt cổng cập nhật) ⇒ hỏi', bash(`EP_BO_QUA_DONG_BO=1 npx playwright test tests/dang-nhap --project=dev`), 'ask'],
  ['git status ⇒ cho', bash(`git status --short`), 'allow'],
  ['git log / diff ⇒ cho', bash(`git log --oneline -5 && git diff --stat`), 'allow'],
  ['git commit ⇒ hỏi', bash(`git commit -m "x"`), 'ask'],
  ['git push ⇒ hỏi', bash(`git push origin main`), 'ask'],
  ['git -C kit pull ⇒ hỏi', bash(`git -C C:/easypos-tester pull`), 'ask'],
  ['git reset --hard ⇒ hỏi', bash(`git reset --hard origin/main`), 'ask'],
  ['git checkout -f ⇒ hỏi', bash(`git checkout -f main`), 'ask'],
  ['git stash ⇒ hỏi', bash(`git stash`), 'ask'],
  ['gửi bài học: bai-hoc.js them --ghi ⇒ hỏi (đã có), --vao-kho ⇒ hỏi', bash(`node "$EP_KIT/tools/tester/bai-hoc.js" them x.md --ghi --vao-kho`), 'ask'],
  ['jira-tao.js --tao (tạo thật) ⇒ hỏi', bash(`node "$EP_KIT/tools/jira/jira-tao.js" bao-cao/x/BUG-1.jira.md --tao`), 'ask'],
  ['confluence.js tìm / lấy trang ⇒ cho', bash(`node "$EP_KIT/tools/confluence/confluence.js" trang 50709307`), 'allow'],
  ['Đọc tệp token Confluence ⇒ chặn', read(path.join(os.homedir(), '.easypos-tester', 'confluence' + '.properties')), 'deny'],
  ['cat tệp token Confluence ⇒ chặn', bash('cat ~/.easypos-tester/confluence' + '.properties'), 'deny'],
  ['sqlcmd trực tiếp vào CSDL dev ⇒ chặn', bash('sqlcmd -S 10.100.110.78 -d easyposbackoffice -Q "SELECT 1"'), 'deny'],
  ['dbq.js đường dẫn tuyệt đối trong bộ kit', bash(`node "${K('tools', 'tester', 'dbq.js').replace(/\\/g, '/')}" uat q.sql`), 'allow'],
  ['dbq.js PowerShell $env:EP_KIT', ps('node "$env:EP_KIT\\tools\\tester\\dbq.js" uat q.sql'), 'allow'],
  ['sqlcmd trực tiếp vào UAT ⇒ chặn', bash('sqlcmd -S 10.100.110.78 -d easyposuat -Q "SELECT 1"'), 'deny'],
  ['sqlcmd vào máy prod ⇒ chặn', bash('sqlcmd -S 10.200.5.9 -Q "UPDATE bill SET deleted=1"'), 'deny'],
  ['Invoke-Sqlcmd ⇒ chặn', ps('Invoke-Sqlcmd -ServerInstance 10.100.110.78 -Query "SELECT 1"'), 'deny'],
  ['SqlConnection PowerShell ⇒ chặn', ps('$c = New-Object System.Data.SqlClient.SqlConnection "Server=10.100.110.78"'), 'deny'],
  ['python pyodbc heredoc ⇒ chặn', bash("python - <<'EOF'\nimport pyodbc\nc=pyodbc.connect('SERVER=10.100.110.78')\nEOF"), 'deny'],
  ['node -e mssql ⇒ chặn', bash(`node -e "require('mssql').connect('mssql://x')"`), 'deny'],
  ['mongosh ⇒ chặn', bash('mongosh "mongodb://10.100.110.78:27017/EasyPosAsync"'), 'deny'],
  ['redis-cli FLUSHALL ⇒ chặn', bash('redis-cli -h 10.100.140.9 FLUSHALL'), 'deny'],
  ['kafka-topics ⇒ chặn', bash('kafka-topics.sh --bootstrap-server 10.100.140.43:9092 --delete --topic x'), 'deny'],
  ['dbq.js nối sau bằng sqlcmd ⇒ chặn', bash(`node ${DBQ} uat q.sql; sqlcmd -S x -Q "DELETE FROM bill"`), 'deny'],
  ['grep chữ UPDATE trong mã nguồn', bash('grep -rn "UPDATE bill" src/main/java'), 'allow'],
  ['mvn / npm / git thường', bash('npm run lint'), 'allow'],
  ['ls', bash('ls -la'), 'allow'],
  // ---- mật khẩu
  ['cat tai-khoan.json ⇒ chặn', bash('cat config/tai-khoan.json'), 'deny'],
  ['cat ~/.easypos-tester/tai-khoan.json ⇒ chặn', bash('cat ~/.easypos-tester/tai-khoan.json'), 'deny'],
  ['copy mẫu sang tai-khoan.json bằng lệnh ⇒ chặn (người dùng tự làm)', bash('cp config/tai-khoan.example.json ~/.easypos-tester/tai-khoan.json'), 'deny'],
  ['Read tai-khoan.json ⇒ chặn', read(K('config', 'tai-khoan.json')), 'deny'],
  ['Read tai-khoan.json riêng ⇒ chặn', read(path.join(HOME_CFG, 'tai-khoan.json')), 'deny'],
  ['Read tai-khoan.example.json (mẫu) ⇒ cho', read(K('config', 'tai-khoan.example.json')), 'allow'],
  ['Read jira.properties ⇒ chặn', read(path.join(HOME_CFG, 'jira.properties')), 'deny'],
  ['Read application-prod.yml ⇒ chặn', read('C:/work/easyposbackend/src/main/resources/config/application-prod.yml'), 'deny'],
  ['Read application-prodTest.yml ⇒ hỏi (mật khẩu TEST)', read('C:/work/easyposbackend/src/main/resources/config/application-prodTest.yml'), 'ask'],
  ['Read application.yml ⇒ cho', read('C:/work/easyposbackend/src/main/resources/config/application.yml'), 'allow'],
  ['Read password.json ⇒ chặn', read('C:/work/easyposbackend/password.json'), 'deny'],
  ['Read .env ⇒ chặn', read('C:/work/app/.env'), 'deny'],
  ['Read tệp thường', read('C:/work/app/README.md'), 'allow'],
  ['Grep password trong thư mục cấu hình riêng ⇒ chặn', grep('password', HOME_CFG), 'deny'],
  ['Grep password trong mã nguồn ⇒ cho', grep('password', 'C:/work/easyposbackend/src'), 'allow'],
  ['Write tai-khoan.json ⇒ chặn', write(path.join(HOME_CFG, 'tai-khoan.json'), '{}'), 'deny'],
  ['echo $EP_JIRA_TOKEN ⇒ chặn', bash('echo $EP_JIRA_TOKEN'), 'deny'],
  ['$env:EP_UAT_DB_PASSWORD ⇒ chặn', ps('$env:EP_UAT_DB_PASSWORD = "x"'), 'deny'],
  ['SQLCMDPASSWORD ⇒ chặn', bash('SQLCMDPASSWORD=abc node x.js'), 'deny'],
  ['printenv ⇒ chặn', bash('printenv'), 'deny'],
  ['env | sort ⇒ chặn', bash('env | sort'), 'deny'],
  ['Get-ChildItem env: ⇒ chặn', ps('Get-ChildItem env:'), 'deny'],
  ['os.environ in toàn bộ ⇒ chặn', bash('python -c "import os; print(os.environ)"'), 'deny'],
  ['envsubst / environment trong câu thường ⇒ cho', bash('echo "set the environment up"'), 'allow'],
  // ---- PROD: web / API
  ['curl tới prod ⇒ chặn', bash('curl -s https://app.easyposs.vn/api/client/common/introspect'), 'deny'],
  ['curl tới subdomain easypos.vn ⇒ chặn', bash('curl https://api.easypos.vn/api/x'), 'deny'],
  ['curl tới IP prod ⇒ chặn', bash('curl http://10.100.110.110:8080/api/p/x'), 'deny'],
  ['curl tới dải prod ⇒ chặn', bash('curl http://10.200.0.7/health'), 'deny'],
  ['curl mẫu tên máy prod ⇒ chặn', bash('curl https://api12.example-prod.vn/x'), 'deny'],
  ['ssh vào máy prod ⇒ chặn', bash('ssh admin@10.200.5.9'), 'deny'],
  ['curl tới máy test dưới tên miền prod (khongPhaiProd) ⇒ cho', bash('curl https://testtranshub.easypos.vn/api/health'), 'allow'],
  ['curl tới UAT ⇒ cho', bash('curl -s http://10.100.140.43:8888/api/p/client/ping'), 'allow'],
  ['grep chữ easypos.vn trong tệp (không dùng mạng) ⇒ cho', bash('grep -rn "easypos.vn" src/'), 'allow'],
  ['ping prod (không phải HTTP) ⇒ cho', bash('ping -n 1 easypos.vn'), 'allow'],
  ['EP_CHO_PHEP_PROD=1 playwright ⇒ hỏi', bash('EP_CHO_PHEP_PROD=1 npx playwright test --project=prod'), 'ask'],
  ['$env:EP_CHO_PHEP_PROD = 1 ⇒ hỏi', ps('$env:EP_CHO_PHEP_PROD = 1; npx playwright test'), 'ask'],
  ['EP_PROD_CHO_GHI=1 ⇒ hỏi', bash('EP_CHO_PHEP_PROD=1 EP_PROD_CHO_GHI=1 npx playwright test'), 'ask'],
  ['npx playwright UAT ⇒ cho', bash('cd e2e && npx playwright test tests/dang-nhap --project=uat'), 'allow'],
  ['npx playwright DEV ⇒ cho', bash('cd e2e && npx playwright test tests/dang-nhap --project=dev'), 'allow'],
  ['chạy ứng dụng profile prod ⇒ chặn', bash('java -jar app.jar --spring.profiles.active=prod'), 'deny'],
  ['mvn -Pprod spring-boot:run ⇒ chặn', bash('mvn -Pprod spring-boot:run'), 'deny'],
  ['SPRING_PROFILES_ACTIVE=prod ⇒ chặn', bash('SPRING_PROFILES_ACTIVE=prod java -jar app.jar'), 'deny'],
  ['profile prodTest (UAT) ⇒ cho', bash('java -jar app.jar --spring.profiles.active=prodTest'), 'allow'],
  // ---- Jira / Bitbucket / Confluence: đọc cho, ghi hỏi
  ['node jira.js (công cụ bộ kit)', bash('node "$EP_KIT/tools/jira/jira.js" EPB-123'), 'allow'],
  ['node bb.js (công cụ bộ kit)', bash('node "$EP_KIT/tools/tester/bb.js" pr easyposbackend 12'), 'allow'],
  ['curl GET Jira ⇒ cho', bash('curl -s https://jira-sds.softdreams.vn:8080/rest/api/2/issue/EPB-1'), 'allow'],
  ['curl POST Jira ⇒ hỏi', bash('curl -s -X POST https://jira-sds.softdreams.vn:8080/rest/api/2/issue -d @bug.json'), 'ask'],
  ['Invoke-RestMethod POST Bitbucket ⇒ hỏi', ps('Invoke-RestMethod -Method Post -Uri https://git-sds.softdreams.vn:7990/rest/api/1.0/projects/EPOS/repos/x/pull-requests'), 'ask'],
  ['curl DELETE Confluence ⇒ hỏi', bash('curl -X DELETE https://confluence-sds.softdreams.vn:8090/rest/api/content/1'), 'ask'],
  // ---- tệp chạy được đọc nội dung
  ['python chạy tệp có pyodbc ⇒ chặn', bash(`python ${path.join(dir, 'doc-db.py').replace(/\\/g, '/')}`), 'deny'],
  ['node chạy tệp gọi prod ⇒ chặn', bash(`node ${path.join(dir, 'goi-prod.js').replace(/\\/g, '/')}`), 'deny'],
  ['node chạy bộ thử của code-insight (script tin cậy của kit, có chuỗi mẫu jdbc:) ⇒ cho', bash(`node "${K('tools', 'code-insight', 'loc.test.js').replace(/\\/g, '/')}"`), 'allow'],
  ['node chạy tệp vô hại ⇒ cho',bash(`node ${path.join(dir, 'vo-hai.js').replace(/\\/g, '/')}`), 'allow'],
  ['python chạy tệp không tồn tại ⇒ cho (không đọc được)', bash('python /khong/co/tep.py'), 'allow'],
  // ---- ghi tệp
  ['Write kịch bản e2e bình thường', write(K('e2e', 'tests', 'don-hang', 'tao-don.spec.ts'), "import { test, expect } from '../../lib/fixtures';\ntest('[TC-FE-001] mở', async ({ page }) => { await page.goto('/'); });"), 'allow'],
  ['Write kịch bản e2e tự nối mssql ⇒ chặn', write(K('e2e', 'tests', 'x', 'db.spec.ts'), "import sql from 'mssql';\nawait sql.connect('x');"), 'deny'],
  ['Write kịch bản e2e có sqlserver:// ⇒ chặn', write(K('e2e', 'tests', 'x', 'db2.spec.ts'), "const u = 'jdbc:sqlserver://x';"), 'deny'],
  ['Write báo cáo trong bao-cao/ (có chữ sqlcmd trong .md) ⇒ cho', write(K('bao-cao', '2026-10-21_dang-nhap', '05-kiem-du-lieu.md'), 'Đã tra bằng dbq, không dùng sqlcmd.'), 'allow'],
  ['Write mẫu báo cáo', write(K('mau-bao-cao', '07-moi.md'), '# mới'), 'allow'],
  ['Edit hook ⇒ hỏi', edit(K('hooks', 'guard-easypos.js')), 'ask'],
  ['Edit prod-config.js ⇒ hỏi', edit(K('hooks', 'prod-config.js')), 'ask'],
  ['Edit luật ⇒ hỏi', edit(K('rules', 'RULES.md')), 'ask'],
  ['Edit dbq.js ⇒ hỏi', edit(K('tools', 'tester', 'dbq.js')), 'ask'],
  ['Edit setup.js ⇒ hỏi', edit(K('setup.js')), 'ask'],
  ['Edit moi-truong.json ⇒ hỏi', edit(K('config', 'moi-truong.json')), 'ask'],
  ['Edit chốt chặn prod của Playwright ⇒ hỏi', edit(K('e2e', 'lib', 'moi-truong.ts')), 'ask'],
  ['Edit playwright.config.ts ⇒ hỏi', edit(K('e2e', 'playwright.config.ts')), 'ask'],
  ['Edit settings.json của Claude ⇒ hỏi', edit(path.join(os.homedir(), '.claude', 'settings.json')), 'ask'],
  ['sed -i sửa hook ⇒ hỏi', bash('sed -i "s/deny/allow/" hooks/guard-easypos.js'), 'ask'],
  ['rm hook ⇒ hỏi', bash('rm hooks/guard-easypos.js'), 'ask'],
  ['Remove-Item settings.json ⇒ hỏi', ps('Remove-Item ~/.claude/settings.json'), 'ask'],
  ['đọc hook bằng cat ⇒ cho', bash('cat hooks/guard-easypos.js'), 'allow'],
  ['chạy bộ thử hook ⇒ cho', bash('node hooks/guard-easypos.test.js'), 'allow'],
  ['Edit mã ứng dụng ngoài bộ kit ⇒ cho (luật RULES nhắc, hook không can thiệp)', edit('C:/work/easyposbackend/src/Foo.java'), 'allow'],
  ['tool khác (Glob) ⇒ cho', { tool_name: 'Glob', tool_input: { pattern: '**/*.ts' } }, 'allow'],
];

let sai = 0;
for (const [ten, input, mong] of cases) {
  let thuc = 'allow';
  try { const r = decide(input); thuc = r ? r.hookSpecificOutput.permissionDecision : 'allow'; } catch (e) { thuc = 'LỖI ' + e.message; }
  const ok = thuc === mong;
  if (!ok) sai++;
  console.log((ok ? 'ĐÚNG ' : 'SAI  ') + mong.padEnd(5) + '← ' + thuc.padEnd(5) + '| ' + ten);
}

/* ---- cổng đọc mã Code-Insight: TẮT (mặc định) không đổi hành vi; BẬT thì cấm gọi thẳng Bitbucket ---- */
{
  const BB_URL = 'https://git-sds.softdreams.vn/rest/api/1.0/projects/EPOS/repos';
  const congCases = [
    ['curl Bitbucket', bash(`curl -s -H "Authorization: Bearer x" ${BB_URL}`)],
    ['Invoke-RestMethod Bitbucket', ps(`Invoke-RestMethod ${BB_URL}`)],
    ['git clone Bitbucket', bash('git clone https://git-sds.softdreams.vn/scm/epos/easyposbackend.git')],
    ['git ls-remote Bitbucket', bash('git ls-remote https://git-sds.softdreams.vn/scm/epos/easyposbackend.git')],
  ];
  const cfgCI = path.join(dir, 'code-insight.json');
  const quyet = (input) => { const r = decide(input); return r ? r.hookSpecificOutput.permissionDecision : 'allow'; };
  const kiemCa = (ten, thuc, mong) => { const ok = thuc === mong; if (!ok) sai++; console.log((ok ? 'ĐÚNG ' : 'SAI  ') + ten + ' ← ' + thuc); };

  fs.writeFileSync(cfgCI, JSON.stringify({ bat: false, url: '' })); process.env.EP_CI_CAU_HINH = cfgCI;
  for (const [ten, input] of congCases) kiemCa('[cổng tắt] không chặn thêm: ' + ten, quyet(input) === 'deny' ? 'deny' : 'khong-chan', 'khong-chan');
  fs.writeFileSync(cfgCI, JSON.stringify({ bat: true, url: '' })); kiemCa('[cổng bat=true nhưng url rỗng ⇒ coi là tắt] curl Bitbucket', quyet(congCases[0][1]) === 'deny' ? 'deny' : 'khong-chan', 'khong-chan');
  fs.writeFileSync(cfgCI, JSON.stringify({ bat: true, url: 'https://10.0.0.5:8100/mcp' }));
  for (const [ten, input] of congCases) kiemCa('[cổng bật] CHẶN: ' + ten, quyet(input), 'deny');
  kiemCa('[cổng bật] git clone GitHub không liên quan vẫn cho', quyet(bash('git clone https://github.com/Nhat-Ninh/AIAutoTest.git')), 'allow');
  kiemCa('[cổng bật] chạy bộ thử của code-insight vẫn cho (script tin cậy)', quyet(bash(`node "${K('tools', 'code-insight', 'server.test.js').replace(/\\/g, '/')}"`)), 'allow');
  kiemCa('[cổng] sửa config/code-insight.json ⇒ hỏi', quyet(edit(K('config', 'code-insight.json'))), 'ask');
  kiemCa('[cổng] sửa .mcp.json của kit ⇒ hỏi', quyet(edit(K('.mcp.json'))), 'ask');
  kiemCa('[cổng] sed -i sửa công cụ cổng ⇒ hỏi', quyet(bash('sed -i "s/true/false/" tools/code-insight/cau-hinh.mau.json')), 'ask');
  process.env.EP_CI_CAU_HINH = CI_TAT;
}

/* ---- cấu hình PROD giả: so khớp ---- */
const cfgGia = prod.load();
const kt = [
  ['easypos.vn là prod', prod.isProdHost('easypos.vn', cfgGia), true],
  ['app.easypos.vn là prod (đuôi tên miền)', prod.isProdHost('https://app.easypos.vn/x', cfgGia), true],
  ['testtranshub.easypos.vn không phải prod', prod.isProdHost('testtranshub.easypos.vn', cfgGia), false],
  ['x.testtranshub.easypos.vn vẫn là prod (khongPhaiProd chỉ trùng nguyên tên)', prod.isProdHost('x.testtranshub.easypos.vn', cfgGia), true],
  ['10.200.0.9 thuộc dải prod', prod.isProdHost('10.200.0.9', cfgGia), true],
  ['10.200.5.77 thuộc dải prodDb', prod.isProdHost('10.200.5.77', cfgGia), true],
  ['10.100.110.78 (UAT) không phải prod', prod.isProdHost('10.100.110.78', cfgGia), false],
  ['tên máy chứa epos-db-prod là prod', prod.isProdHost('EPOS-DB-PROD-01', cfgGia), true],
  ['CSDL EasyPosProd là prod', prod.isProdDatabase('easyposprod', cfgGia), true],
  ['CSDL easyposuat không phải prod', prod.isProdDatabase('easyposuat', cfgGia), false],
  ['10.100.110.78 (DEV + UAT) không phải prod', prod.isProdHost('10.100.110.78', cfgGia), false],
  ['CSDL easyposbackoffice (DEV) không phải prod', prod.isProdDatabase('easyposbackoffice', cfgGia), false],
  ['login app_prod là prod', prod.isProdLogin('APP_PROD', cfgGia), true],
];
for (const [ten, thuc, mong] of kt) {
  const ok = thuc === mong;
  if (!ok) sai++;
  console.log((ok ? 'ĐÚNG ' : 'SAI  ') + '[prod-config] ' + ten);
}

/* ---- cấu hình THẬT của bộ kit ---- */
delete process.env.EP_GUARD_CONFIG;
const thatRaw = (() => { try { return JSON.parse(fs.readFileSync(K('config', 'moi-truong.json'), 'utf8')); } catch (e) { return null; } })();
const that = prod.load();
const kiemThat = [
  ['config/moi-truong.json đọc được (JSON hợp lệ)', !!thatRaw],
  ['prodChan có tên miền prod easypos.vn và easyposs.vn', that.prodChan.includes('easypos.vn') && that.prodChan.includes('easyposs.vn')],
  ['app.easyposs.vn bị coi là prod', prod.isProdHost('https://app.easyposs.vn/', that)],
  ['không còn địa chỉ EasyBooks trong cấu hình', !/easybooks|10\.110\.122\.|10\.100\.122\./i.test(JSON.stringify(thatRaw))],
  ['mọi mục khongPhaiProd là tên máy (không phải IP) và không nằm đích danh trong prodChan', that.khongPhaiProd.every(h => !/^\d+(\.\d+){3}$/.test(h) && !that.prodChan.map(x => x.toLowerCase()).includes(h))],
  ['cấu hình có đủ hai môi trường dev (easyposbackoffice) và uat (easyposuat) trên 10.100.110.78', !!(thatRaw && thatRaw.moiTruong && thatRaw.moiTruong.dev && thatRaw.moiTruong.uat && thatRaw.moiTruong.dev.db.database === 'easyposbackoffice' && thatRaw.moiTruong.uat.db.database === 'easyposuat' && thatRaw.moiTruong.dev.db.host === '10.100.110.78' && thatRaw.moiTruong.uat.db.host === '10.100.110.78')],
  ['uat.easypos.vn (UAT, khongPhaiProd) KHÔNG bị coi là prod', !prod.isProdHost('https://uat.easypos.vn/login', that)],
  ['app.easypos.vn và api.easypos.vn VẪN là prod', prod.isProdHost('https://app.easypos.vn/', that) && prod.isProdHost('https://api.easypos.vn/', that)],
  ['x.uat.easypos.vn (tên con của UAT) vẫn là prod — khongPhaiProd chỉ trùng nguyên tên', prod.isProdHost('https://x.uat.easypos.vn/', that)],
  ['không môi trường nào trong moiTruong trỏ vào prod', Object.entries(that.moiTruong).every(([k, e]) => !prod.isProdHost(e.webUrl || '', that) && !prod.isProdHost(e.apiUrl || '', that) && !prod.isProdHost((e.db && e.db.host) || '', that))],
];
for (const [ten, ok] of kiemThat) {
  if (!ok) sai++;
  console.log((ok ? 'ĐÚNG ' : 'SAI  ') + '[cấu hình thật] ' + ten);
}

/* ---- nhận dạng lệnh chạy test (cổng cập nhật kit) ---- */
const { canDongBo } = require('./guard-easypos.js');
const kiemCong = [
  ['npx playwright test (cwd trong kit) ⇒ qua cổng cập nhật', canDongBo('cd e2e && npx playwright test tests/x --project=dev', K()) === true],
  ['npx.cmd playwright test (cwd trong kit) ⇒ qua cổng', canDongBo('npx.cmd playwright test --grep @smoke', K('e2e')) === true],
  ['npm run test:dev (cwd trong kit) ⇒ qua cổng', canDongBo('npm run test:dev', K('e2e')) === true],
  ['cd tới thư mục kit trong lệnh (cwd lạ) ⇒ qua cổng', canDongBo('cd /d ' + K('e2e') + ' && npx playwright test', 'C:/Users/x') === true],
  ['dùng $EP_KIT trong lệnh ⇒ qua cổng', canDongBo('cd "$EP_KIT/e2e" && npx playwright test', 'C:/Users/x') === true],
  ['npm test ở DỰ ÁN KHÁC (cwd ngoài kit, lệnh không nhắc kit) ⇒ KHÔNG qua cổng', canDongBo('npm test', 'C:/work/easyposfrontend') === false],
  ['--list ở lệnh con này KHÔNG miễn cổng cho lệnh con kia', canDongBo('npx playwright test --grep @a; npx playwright test --list', K()) === true],
  ['npx playwright@1.55.0 test ⇒ qua cổng', canDongBo('npx playwright@1.55.0 test', K()) === true],
  ['node …/playwright/cli.js test ⇒ qua cổng', canDongBo('node node_modules/@playwright/test/cli.js test', K('e2e')) === true],
  ['playwright test --list ⇒ KHÔNG cần cổng (chỉ liệt kê)', canDongBo('npx playwright test --list --project=dev', K()) === false],
  ['lệnh khác (bai-hoc.js tim) ⇒ không qua cổng', canDongBo('node tools/tester/bai-hoc.js tim san-pham', K()) === false],
  ['đọc mã (grep playwright) ⇒ không qua cổng', canDongBo('grep -rn "playwright" e2e/lib', K()) === false],
];
for (const [ten, ok] of kiemCong) {
  if (!ok) sai++;
  console.log((ok ? 'ĐÚNG ' : 'SAI  ') + '[cổng cập nhật] ' + ten);
}

const tong = cases.length + kt.length + kiemThat.length + kiemCong.length;
console.log('\n' + (tong - sai) + '/' + tong + ' ca đúng');
process.exit(sai ? 1 : 0);
