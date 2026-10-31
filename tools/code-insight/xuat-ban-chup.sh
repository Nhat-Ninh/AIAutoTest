#!/usr/bin/env bash
# xuat-ban-chup.sh — Jenkins chạy SAU KHI build DEV xong: xuất BẢN CHỤP SẠCH của mã nguồn vừa build ra thư mục riêng cho Code-Insight.
# KHÔNG BAO GIỜ trỏ cổng / worker vào workspace hay thư mục Jenkins: workspace có .git (có thể chứa credential trong URL remote), lịch sử, cấu hình
# môi trường. Bản chụp = chỉ các tệp được git theo dõi ở đúng commit đã build (git archive), đã xoá tệp nhạy cảm / nhị phân / quá lớn, kèm danh sách commit + tệp đổi.
# Bản chụp của một commit KHÔNG bao giờ bị ghi đè khi đã có (worker có thể đang đọc nó); muốn dựng lại: xoá thư mục commit đó hoặc đặt CI_XUAT_LAI=1.
#
# Cách dùng (trong bước post-build "Execute shell" của job, thư mục hiện tại là workspace):
#   /srv/insight/xuat-ban-chup.sh <tên-repo> [thư-mục-gốc-bản-chụp=/srv/insight/snap] [số-bản-giữ-lại=5]
# Kết quả: <gốc>/<repo>/<commit>/…  và liên kết <gốc>/<repo>/current → <commit> (đổi nguyên tử SAU KHI mọi bước kiểm đạt).
# Mã thoát ≠ 0 (và KHÔNG đổi "current") khi: không phải kho git (3), bản chụp rỗng (4), quét bí mật thấy gì HOẶC không có gitleaks (5).
# Biến: CI_GITLEAKS=tat chỉ để thử (bỏ quét bí mật); mặc định BẮT BUỘC có gitleaks.
#       CI_CHE_BI_MAT=1 (quản trị bật): gitleaks báo ⇒ CHE giá trị ở đúng các dòng bị báo («đã che») rồi quét lại; chỉ phát hành khi quét lại sạch. Mặc định tắt.
set -euo pipefail
umask 027

REPO="${1:?Thiếu tên repo (vd easyposbackend)}"
GOC="${2:-/srv/insight/snap}"
GIU="${3:-5}"
[[ "$REPO" =~ ^[a-z0-9_.-]{1,80}$ ]] || { echo "Tên repo không hợp lệ: $REPO" >&2; exit 2; }
[[ "$GIU" =~ ^[0-9]+$ ]] && [ "$GIU" -ge 2 ] || { echo "Số bản giữ lại phải ≥ 2" >&2; exit 2; }

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Thư mục hiện tại không phải kho git (chạy trong workspace của job)" >&2; exit 3; }
SHA="$(git rev-parse HEAD)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Không lấy được commit" >&2; exit 3; }
NHANH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr -cd 'A-Za-z0-9._/-' || true)"

DICH_REPO="$GOC/$REPO"
DICH="$DICH_REPO/$SHA"
TAM="$DICH_REPO/.dang-xuat-$SHA.$$"
mkdir -p "$DICH_REPO"
trap 'rm -rf "$TAM"' EXIT

# Đổi "current" nguyên tử: tạo liên kết tạm rồi mv -T đè lên.
chuyen_current() {
  ln -sfn "$SHA" "$DICH_REPO/.current.$$" && mv -T "$DICH_REPO/.current.$$" "$DICH_REPO/current"
  printf '%s\n' "$SHA" > "$DICH_REPO/CURRENT"   # bản văn bản của current: dùng khi chép sang Windows (tar không giữ được liên kết), xem hướng dẫn pilot
}
# Dọn bản cũ: giữ $GIU bản mới nhất (theo thời điểm sửa, có nano giây); chỉ xét thư mục tên đúng 40 ký tự hex; không bao giờ xoá bản đang là current.
don_ban_cu() {
  local dang; dang="$(readlink "$DICH_REPO/current")"
  local d b
  for d in "$DICH_REPO"/*; do
    b="${d##*/}"
    if [[ "$b" =~ ^[0-9a-f]{40}$ ]] && [ -d "$d" ] && [ ! -L "$d" ]; then printf '%s\t%s\n' "$(stat -c %y "$d")" "$d"; fi
  done | sort -r | cut -f2- | tail -n +$((GIU + 1)) | while read -r cu; do
    [ "$(basename "$cu")" = "$dang" ] || rm -rf "$cu"
  done
}

# Bản chụp của commit này đã có và đã được kiểm khi xuất lần trước ⇒ chỉ chuyển current (KHÔNG ghi đè thư mục có thể đang được đọc).
if [ -d "$DICH" ] && [ "${CI_XUAT_LAI:-}" != "1" ]; then
  chuyen_current; don_ban_cu
  echo "OK: $REPO@${SHA:0:12} đã có sẵn — chỉ chuyển current (CI_XUAT_LAI=1 để dựng lại)"
  exit 0
fi
rm -rf "$TAM"; mkdir -p "$TAM"

# 1. Chỉ tệp được git theo dõi ở đúng commit (không .git, không tệp rác của build nếu không nằm trong git)
git archive --format=tar "$SHA" | tar -x -C "$TAM"

# 2. Xoá tệp nhạy cảm khỏi bản chụp (so tên KHÔNG phân biệt hoa thường): cấu hình môi trường (cả application.yml gốc), khoá, chứng chỉ, bí mật, hạ tầng.
find "$TAM" -type f \( -iname '.env' -o -iname '.env.*' -o -iname '*.env' -o -iname 'application*.yml' -o -iname 'application*.yaml' -o -iname 'application*.properties' \
  -o -iname 'bootstrap*.yml' -o -iname 'bootstrap*.yaml' -o -iname 'bootstrap*.properties' \
  -o -iname '*.pem' -o -iname '*.key' -o -iname '*.p12' -o -iname '*.pfx' -o -iname '*.jks' -o -iname '*.keystore' -o -iname '*.crt' -o -iname '*.cer' -o -iname '*.p8' -o -iname '*.ppk' \
  -o -iname 'id_rsa*' -o -iname 'id_ed25519*' -o -iname 'id_ecdsa*' -o -iname '*.kdbx' -o -iname 'secrets*.json' -o -iname 'secret*.yml' -o -iname 'credentials*.json' -o -iname 'service-account*.json' \
  -o -iname '.npmrc' -o -iname '.netrc' -o -iname '.htpasswd' -o -iname '.pgpass' -o -iname '.git-credentials' -o -iname '*.tfstate' -o -iname '*.tfvars' -o -iname 'settings.xml' \
  -o -iname 'docker-compose*.yml' -o -iname 'docker-compose*.yaml' -o -iname 'Jenkinsfile*' \
  -o -iname 'password*.json' -o -iname '.yo-rc.json' -o -iname 'jhipster-control-center*.yml' \) -delete
# Nhị phân / tài liệu / ảnh (worker không đọc ra chữ; bớt dung lượng).
find "$TAM" -type f \( -iname '*.jar' -o -iname '*.war' -o -iname '*.class' -o -iname '*.zip' -o -iname '*.gz' -o -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.gif' -o -iname '*.ico' -o -iname '*.woff*' -o -iname '*.ttf' -o -iname '*.xlsx' -o -iname '*.docx' -o -iname '*.pdf' \) -delete
# Thư mục sinh ra / của công cụ — XOÁ KHỎI bản chụp để phạm vi bản chụp = phạm vi chỉ mục lọc (chỉ mục chỉ bỏ .git và node_modules).
find "$TAM" -type d \( -name node_modules -o -name target -o -name build -o -name dist -o -name .git -o -name .idea -o -name .vscode \) -prune -exec rm -rf {} + 2>/dev/null || true
# Tệp quá lớn (> 2 MB: dữ liệu sinh ra, minified, khoá phụ thuộc…): chỉ mục không bảo đảm được ⇒ xoá khỏi bản chụp.
find "$TAM" -type f -size +2M -delete
# Không cho liên kết tượng trưng nào trong bản chụp (tránh thoát ra ngoài thư mục)
find "$TAM" -type l -delete

# 3. Lịch sử cho phân tích Jira: commit nhắc mã ticket + tệp đã đổi (CHỈ tên tệp và thông điệp, không có diff)
mkdir -p "$TAM/.insight"
git log -n 3000 --date=short --format='%h|%ad|%an|%s' "$SHA" > "$TAM/.insight/commits.txt" 2>/dev/null || : > "$TAM/.insight/commits.txt"
git log -n 1500 --name-only --format='@@ %h %s' "$SHA" > "$TAM/.insight/changes.txt" 2>/dev/null || : > "$TAM/.insight/changes.txt"
# Chỉ mục tra nhanh KHÔNG dùng LLM (grep, vài giây): danh sách endpoint REST và entity / bảng, dạng "tệp:dòng:nội dung chú thích".
# Worker đọc chúng đầu tiên để định vị đúng tệp ngay, bớt hàng chục lượt Grep ⇒ nhanh và rẻ hơn hẳn với chức năng lớn.
( cd "$TAM" && { grep -rnE '@(Get|Post|Put|Patch|Delete|Request)Mapping' --include='*.java' . || true; } | sed 's#^\./##' | cut -c1-260 ) > "$TAM/.insight/api.txt" || : > "$TAM/.insight/api.txt"
( cd "$TAM" && { grep -rnE '@(Table|Entity|Document)\b' --include='*.java' . || true; } | sed 's#^\./##' | cut -c1-260 ) > "$TAM/.insight/bang.txt" || : > "$TAM/.insight/bang.txt"
printf '{"repo":"%s","commit":"%s","nhanh":"%s","xuatLuc":"%s"}\n' "$REPO" "$SHA" "$NHANH" "$(date -u +%FT%TZ)" > "$TAM/.insight/ban-chup.json"

# 4. Bản chụp rỗng = lỗi (không để cổng đọc một thư mục trống rồi "phân tích" bịa)
SO_TEP="$(find "$TAM" -type f -not -path "$TAM/.insight/*" | wc -l | tr -d ' ')"
[ "$SO_TEP" -ge 1 ] || { echo "Bản chụp rỗng — không đổi 'current'" >&2; exit 4; }

# 5. Quét bí mật: BẮT BUỘC. Thấy gì, hoặc không có gitleaks, thì KHÔNG phát hành bản chụp này (đóng khi không chắc).
if [ "${CI_GITLEAKS:-}" != "tat" ]; then
  command -v gitleaks >/dev/null 2>&1 || { echo "Không có gitleaks — KHÔNG phát hành bản chụp (cài gitleaks; CI_GITLEAKS=tat chỉ để thử)" >&2; exit 5; }
  BAO_CAO_GL="$DICH_REPO/.gitleaks-$SHA.$$.json"   # ngoài $TAM để không bị quét; --redact: báo cáo KHÔNG chứa giá trị bí mật, chỉ luật / tệp / dòng
  quet_gl() { rm -f "$BAO_CAO_GL"; gitleaks detect --no-git --source "$TAM" --no-banner --redact -f json -r "$BAO_CAO_GL" >/dev/null 2>&1; }
  DA_CHE=0; QUET_DAT=0
  if quet_gl; then QUET_DAT=1; fi
  # CI_CHE_BI_MAT=1 (quản trị bật, mặc định TẮT): mã nguồn có khoá / token viết cứng (hằng số, chuỗi trong code) mà quản trị đã biết và chấp nhận:
  # CHE giá trị ngay trên các dòng gitleaks báo (chuỗi trong nháy ≥ 12 ký tự → «đã che») rồi QUÉT LẠI; chỉ phát hành khi quét lại sạch hoàn toàn.
  # Bản chụp là bản sao đã biến đổi (không phải mã gốc); tên biến / cấu trúc code giữ nguyên nên không ảnh hưởng việc hiểu nghiệp vụ. Còn dòng nào che không được ⇒ vẫn chặn (mã 5).
  if [ "$QUET_DAT" = 0 ] && ! command -v node >/dev/null 2>&1; then
    echo "Không tìm thấy 'node' trong PATH (cron có PATH ngắn): không che được bí mật, cũng không in được vị trí gitleaks báo — thêm thư mục chứa node vào PATH (vd trong keo-bundle.env: export PATH=\"<thư-mục-node>:\$PATH\")" >&2
  fi
  if [ "$QUET_DAT" = 0 ] && [ "${CI_CHE_BI_MAT:-}" = "1" ] && [ -s "$BAO_CAO_GL" ] && command -v node >/dev/null 2>&1; then
    DA_CHE="$(node -e 'const fs=require("fs"),p=require("path");const rp=process.argv[1],tam=process.argv[2];let r=[];try{r=JSON.parse(fs.readFileSync(rp,"utf8"))}catch(e){}const theo=new Map();for(const x of r){const g=String(x.File||"").replace(/\\/g,"/");const rel=g.replace(/^.*\.dang-xuat-[0-9a-f]{40}\.\d+\//,"");const a=Number(x.StartLine);if(!rel||rel===g||rel.split("/").includes("..")||!(a>=1))continue;const b=Math.min(Number(x.EndLine)||a,a+5);if(!theo.has(rel))theo.set(rel,new Set());for(let i=a;i<=b;i++)theo.get(rel).add(i)}let n=0;for(const [rel,ds] of theo){const f=p.join(tam,rel);let t;try{t=fs.readFileSync(f,"utf8")}catch(e){continue}const L=t.split("\n");let doi=false;for(const i of ds){const s=L[i-1];if(s===undefined)continue;let m=s.replace(/"((?:[^"\\]|\\.){12,})"/g,"\"«đã che»\"").replace(/\x27((?:[^\x27\\]|\\.){12,})\x27/g,"\x27«đã che»\x27");if(m===s)m=s.replace(/([:=]\s*)[^\s,;]{12,}(\s*[,;]?\s*)$/,"$1«đã che»$2");if(m!==s){L[i-1]=m;doi=true;n++}}if(doi)fs.writeFileSync(f,L.join("\n"))}console.log(n)' "$BAO_CAO_GL" "$TAM" 2>/dev/null)" || DA_CHE=0
    [[ "$DA_CHE" =~ ^[0-9]+$ ]] || DA_CHE=0
    echo "CI_CHE_BI_MAT=1: đã che $DA_CHE dòng chứa giá trị bí mật trong bản chụp $REPO@${SHA:0:12} — quét lại" >&2
    if [ "$DA_CHE" -gt 0 ] && quet_gl; then QUET_DAT=1; fi
  fi
  if [ "$QUET_DAT" = 0 ]; then
    echo "gitleaks thấy bí mật trong bản chụp $REPO@$SHA — KHÔNG phát hành (xem: gitleaks detect --no-git --source <thư mục>)" >&2
    if [ -s "$BAO_CAO_GL" ] && command -v node >/dev/null 2>&1; then
      echo "Vị trí gitleaks báo (luật · tệp:dòng; giá trị đã che):" >&2
      node -e 'let r=[];try{r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))}catch(e){}const s=new Set();for(const x of r){const f=String(x.File||"").replace(/\\/g,"/").replace(/^.*\.dang-xuat-[0-9a-f]{40}\.\d+\//,"");s.add("  - "+x.RuleID+" · "+f+":"+x.StartLine)}const a=[...s];console.error(a.slice(0,30).join("\n")+(a.length>30?"\n  … và "+(a.length-30)+" vị trí nữa":""))' "$BAO_CAO_GL" >&2 || true
    fi
    rm -f "$BAO_CAO_GL"; exit 5
  fi
  rm -f "$BAO_CAO_GL"
  if [ "$DA_CHE" -gt 0 ]; then   # ghi vào ban-chup.json để báo cáo / tester biết bản chụp này đã che bí mật
    node -e 'const fs=require("fs"),f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));j.daChe=Number(process.argv[2]);fs.writeFileSync(f,JSON.stringify(j)+"\n")' "$TAM/.insight/ban-chup.json" "$DA_CHE" 2>/dev/null || true
  fi
else
  echo "Cảnh báo: CI_GITLEAKS=tat — KHÔNG quét bí mật (chỉ dùng khi thử)." >&2
fi

# 6. Phát hành: đưa vào chỗ cuối cùng rồi đổi "current" NGUYÊN TỬ
rm -rf "$DICH"      # tới đây chỉ khi chưa có thư mục này, hoặc đã yêu cầu dựng lại (CI_XUAT_LAI=1)
mv "$TAM" "$DICH"
chmod -R go-w "$DICH" 2>/dev/null || true
chuyen_current
trap - EXIT
don_ban_cu

echo "OK: $REPO@${SHA:0:12} (nhánh $NHANH) — $SO_TEP tệp → $DICH$([ "${DA_CHE:-0}" -gt 0 ] && echo " (đã che $DA_CHE dòng bí mật)")"
