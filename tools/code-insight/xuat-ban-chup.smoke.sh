#!/usr/bin/env bash
# xuat-ban-chup.smoke.sh — bộ thử NHANH của xuat-ban-chup.sh trên Linux (cần bash + git, KHÔNG cần Node): chạy trên máy Jenkins / máy chủ trước khi
# dùng thật để chắc script hoạt động đúng ở đó. Tạo một kho git TẠM, không đụng kho thật. Thoát mã 0 = đạt tất cả.
#   bash tools/code-insight/xuat-ban-chup.smoke.sh
set -uo pipefail
QUY="$(cd "$(dirname "$0")" && pwd)/xuat-ban-chup.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
dung=0; sai=0
ca() { if [ "$2" = "0" ]; then dung=$((dung+1)); echo "ĐÚNG $1"; else sai=$((sai+1)); echo "SAI  $1"; fi; }
co() { [ -e "$1" ]; echo $?; }       # 0 nếu có
khong() { [ ! -e "$1" ]; echo $?; }  # 0 nếu KHÔNG có

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t.t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t.t CI_GITLEAKS=tat
WS="$T/ws"; SNAP="$T/snap"; mkdir -p "$WS/src/main/resources/config" "$WS/bin"; cd "$WS"; git init -q .
echo 'class A { void f() { } }' > src/A.java
echo 'spring.datasource.password=Abc12345xyz' > src/main/resources/config/application-dev.yml
echo 'loi.x=Loi' > src/main/resources/config/messages_vi.properties
echo khoa > "id_rsa"; echo x > chung-chi.pem; echo A=1 > .env; echo jar > bin/app.jar; echo hi > README.md
mkdir -p build/gen dist; echo "class G {}" > build/gen/G.java; echo "var d" > dist/d.js
echo x > KEY.PEM; echo y > Application-Prod.yml; echo z > application.yml; echo w > docker-compose.yml; echo v > settings.xml; echo u > Jenkinsfile
head -c 3000000 /dev/zero | tr '\0' 'a' > src/to-lon.txt
git add -A; git commit -qm "EPB-12 them A"; echo '// sua' >> src/A.java; git commit -qam "EPB-13 sua A"
SHA="$(git rev-parse HEAD)"

bash "$QUY" easyposbackend "$SNAP" 3 >"$T/out1" 2>&1; ma=$?
ca "xuất bản chụp thành công (mã 0) và in OK: repo@commit" "$([ $ma -eq 0 ] && grep -q "OK: easyposbackend@${SHA:0:12}" "$T/out1"; echo $?)"
B="$SNAP/easyposbackend/$SHA"
ca "mã nguồn và README được giữ" "$([ -f "$B/src/A.java" ] && [ -f "$B/README.md" ]; echo $?)"
ca "application-*.yml bị XOÁ" "$(khong "$B/src/main/resources/config/application-dev.yml")"
ca "messages_*.properties (i18n) được giữ" "$(co "$B/src/main/resources/config/messages_vi.properties")"
ca "khoá riêng / chứng chỉ / .env bị XOÁ" "$([ ! -e "$B/id_rsa" ] && [ ! -e "$B/chung-chi.pem" ] && [ ! -e "$B/.env" ]; echo $?)"
ca "nhị phân .jar bị XOÁ" "$(khong "$B/bin/app.jar")"
ca "so tên KHÔNG phân biệt hoa thường: KEY.PEM, Application-Prod.yml bị XOÁ" "$([ ! -e "$B/KEY.PEM" ] && [ ! -e "$B/Application-Prod.yml" ]; echo $?)"
ca "application.yml gốc, docker-compose, settings.xml, Jenkinsfile bị XOÁ" "$([ ! -e "$B/application.yml" ] && [ ! -e "$B/docker-compose.yml" ] && [ ! -e "$B/settings.xml" ] && [ ! -e "$B/Jenkinsfile" ]; echo $?)"
ca "thư mục build/ dist/ bị XOÁ khỏi bản chụp (khớp phạm vi chỉ mục)" "$([ ! -e "$B/build" ] && [ ! -e "$B/dist" ]; echo $?)"
ca "tệp > 2 MB bị XOÁ" "$(khong "$B/src/to-lon.txt")"
ca "KHÔNG có .git trong bản chụp" "$(khong "$B/.git")"
ca "toàn bản chụp không còn chuỗi mật khẩu mẫu" "$(! grep -rq 'Abc12345' "$B"; echo $?)"
ca ".insight/commits.txt có EPB-12 và EPB-13" "$(grep -q 'EPB-12' "$B/.insight/commits.txt" && grep -q 'EPB-13' "$B/.insight/commits.txt"; echo $?)"
ca ".insight/changes.txt có tên tệp đổi, KHÔNG có diff" "$(grep -q 'src/A.java' "$B/.insight/changes.txt" && ! grep -q '^[+-]// sua' "$B/.insight/changes.txt"; echo $?)"
ca "current là liên kết trỏ đúng commit" "$([ -L "$SNAP/easyposbackend/current" ] && [ "$(readlink "$SNAP/easyposbackend/current")" = "$SHA" ]; echo $?)"

touch "$B/.dau-vet"; bash "$QUY" easyposbackend "$SNAP" 3 >"$T/out2" 2>&1; ma=$?
ca "xuất lại CÙNG commit ⇒ KHÔNG ghi đè thư mục đã có (worker có thể đang đọc)" "$([ $ma -eq 0 ] && [ -e "$B/.dau-vet" ] && grep -q "đã có sẵn" "$T/out2"; echo $?)"
CI_XUAT_LAI=1 bash "$QUY" easyposbackend "$SNAP" 3 >/dev/null 2>&1; ca "CI_XUAT_LAI=1 ⇒ dựng lại thật" "$([ ! -e "$B/.dau-vet" ]; echo $?)"
for i in 1 2 3 4; do echo "// l$i" >> src/A.java; git commit -qam "EPB-2$i lan $i"; bash "$QUY" easyposbackend "$SNAP" 3 >/dev/null 2>&1 || ca "xuất lặp lần $i" 1; done
SHA2="$(git rev-parse HEAD)"
SO="$(find "$SNAP/easyposbackend" -mindepth 1 -maxdepth 1 -type d -name '[0-9a-f]*' | wc -l | tr -d ' ')"
ca "chỉ giữ tối đa 3 bản, KHÔNG xoá bản current" "$([ "$SO" = "3" ] && [ -d "$SNAP/easyposbackend/$SHA2" ]; echo $?)"
ca "current trỏ commit mới nhất" "$([ "$(readlink "$SNAP/easyposbackend/current")" = "$SHA2" ]; echo $?)"
ca "không còn thư mục tạm dở dang" "$(! ls -A "$SNAP/easyposbackend" | grep -qE '^\.(dang-xuat|current\.)'; echo $?)"

# Quét bí mật bắt buộc: giả gitleaks luôn báo thấy ⇒ mã 5 và KHÔNG đổi current
mkdir -p "$T/bin"; printf '#!/usr/bin/env bash\nexit 1\n' > "$T/bin/gitleaks"; chmod +x "$T/bin/gitleaks"
echo "// moi" >> src/A.java; git commit -qam "EPB-99 moi"; TRUOC="$(readlink "$SNAP/easyposbackend/current")"
PATH="$T/bin:$PATH" CI_GITLEAKS=bat bash "$QUY" easyposbackend "$SNAP" 3 >/dev/null 2>&1; ma=$?
ca "gitleaks thấy bí mật ⇒ mã 5 và KHÔNG đổi current" "$([ $ma -eq 5 ] && [ "$(readlink "$SNAP/easyposbackend/current")" = "$TRUOC" ]; echo $?)"
ca "bản bị từ chối không để lại thư mục" "$(khong "$SNAP/easyposbackend/$(git rev-parse HEAD)")"

echo "// khac" >> src/A.java; git commit -qam "EPB-98 khac"; ( unset CI_GITLEAKS; PATH="/usr/bin:/bin" bash "$QUY" easyposbackend "$SNAP" 3 >/dev/null 2>&1 ); ma=$?
ca "không có gitleaks và không CI_GITLEAKS=tat ⇒ mã 5 (đóng khi không chắc)" "$([ $ma -eq 5 ]; echo $?)"

# Không phải kho git / tên lạ / tham số
mkdir -p "$T/khong-git"; (cd "$T/khong-git" && bash "$QUY" easyposbackend "$SNAP" >/dev/null 2>&1); ca "không phải kho git ⇒ mã 3" "$([ $? -eq 3 ]; echo $?)"
bash "$QUY" "../etc" "$SNAP" >/dev/null 2>&1; ca "tên repo lạ ⇒ mã 2" "$([ $? -eq 2 ]; echo $?)"
bash "$QUY" easyposbackend "$SNAP" 1 >/dev/null 2>&1; ca "số bản giữ < 2 ⇒ mã 2" "$([ $? -eq 2 ]; echo $?)"
mkdir -p "$T/rong" && (cd "$T/rong" && git init -q . && echo k > .env && git add -A && git commit -qm x && bash "$QUY" rong "$SNAP" >/dev/null 2>&1); ma=$?
ca "bản chụp rỗng sau khi loại ⇒ mã 4, không phát hành" "$([ $ma -eq 4 ] && [ ! -e "$SNAP/rong/current" ]; echo $?)"

# xuat-tat-ca.sh: nhiều workspace theo tệp ánh xạ (CRLF, dòng chú thích, workspace không có .git)
TC="$(cd "$(dirname "$0")" && pwd)/xuat-tat-ca.sh"
mkdir -p "$T/wsg/easypos-dev-a" "$T/wsg/easypos-dev-b" "$T/wsg/easypos-dev-c"
( cd "$T/wsg/easypos-dev-a" && git init -q . && echo 'class A {}' > A.java && git add -A && git commit -qm "EPB-1 a" )
( cd "$T/wsg/easypos-dev-b" && git init -q . && echo 'class B {}' > B.java && git add -A && git commit -qm "EPB-2 b" )
printf '# ghi chu\r\neasypos-dev-a  repo-a\r\neasypos-dev-b  repo-b  them\r\neasypos-dev-c  repo-c\r\n\r\n' > "$T/anh-xa.txt"
bash "$TC" "$T/wsg" "$T/anh-xa.txt" "$T/snap2" >"$T/out3" 2>&1; ma=$?
ca "xuat-tat-ca: xuất được 2 workspace có git, báo BỎ QUA workspace không có .git, mã thoát 0" "$([ $ma -eq 0 ] && grep -q 'OK=2' "$T/out3" && grep -q 'BỎ QUA easypos-dev-c' "$T/out3"; echo $?)"
ca "xuat-tat-ca: có snap2/repo-a/current và repo-b/current, KHÔNG có repo-c" "$([ -L "$T/snap2/repo-a/current" ] && [ -L "$T/snap2/repo-b/current" ] && [ ! -e "$T/snap2/repo-c" ]; echo $?)"
ca "xuat-tat-ca: tệp CURRENT (bản văn bản của current) ghi đúng commit" "$([ "$(cat "$T/snap2/repo-a/CURRENT")" = "$(cd "$T/wsg/easypos-dev-a" && git rev-parse HEAD)" ]; echo $?)"
ca "xuat-tat-ca: bản chụp có đủ A.java và .insight, không có .git" "$([ -f "$T/snap2/repo-a/current/A.java" ] && [ -d "$T/snap2/repo-a/current/.insight" ] && [ ! -e "$T/snap2/repo-a/current/.git" ]; echo $?)"
bash "$TC" "$T/wsg" "$T/anh-xa.txt" "$T/snap2" >"$T/out4" 2>&1; ca "xuat-tat-ca: chạy lại (cron) ⇒ không lỗi, báo đã có sẵn" "$([ $? -eq 0 ] && grep -q 'đã có sẵn' "$T/out4"; echo $?)"
bash "$TC" "$T/khong-co" "$T/anh-xa.txt" "$T/snap2" >/dev/null 2>&1; ca "xuat-tat-ca: thư mục workspace không tồn tại ⇒ mã 2" "$([ $? -eq 2 ]; echo $?)"

echo; echo "$dung/$((dung+sai)) ca đúng"
[ "$sai" -eq 0 ]
