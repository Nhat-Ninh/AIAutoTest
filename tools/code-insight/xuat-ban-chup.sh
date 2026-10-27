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
  -o -iname 'docker-compose*.yml' -o -iname 'docker-compose*.yaml' -o -iname 'Jenkinsfile*' \) -delete
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
printf '{"repo":"%s","commit":"%s","nhanh":"%s","xuatLuc":"%s"}\n' "$REPO" "$SHA" "$NHANH" "$(date -u +%FT%TZ)" > "$TAM/.insight/ban-chup.json"

# 4. Bản chụp rỗng = lỗi (không để cổng đọc một thư mục trống rồi "phân tích" bịa)
SO_TEP="$(find "$TAM" -type f -not -path "$TAM/.insight/*" | wc -l | tr -d ' ')"
[ "$SO_TEP" -ge 1 ] || { echo "Bản chụp rỗng — không đổi 'current'" >&2; exit 4; }

# 5. Quét bí mật: BẮT BUỘC. Thấy gì, hoặc không có gitleaks, thì KHÔNG phát hành bản chụp này (đóng khi không chắc).
if [ "${CI_GITLEAKS:-}" != "tat" ]; then
  command -v gitleaks >/dev/null 2>&1 || { echo "Không có gitleaks — KHÔNG phát hành bản chụp (cài gitleaks; CI_GITLEAKS=tat chỉ để thử)" >&2; exit 5; }
  gitleaks detect --no-git --source "$TAM" --no-banner --redact >/dev/null 2>&1 || { echo "gitleaks thấy bí mật trong bản chụp $REPO@$SHA — KHÔNG phát hành (xem: gitleaks detect --no-git --source <thư mục>)" >&2; exit 5; }
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

echo "OK: $REPO@${SHA:0:12} (nhánh $NHANH) — $SO_TEP tệp → $DICH"
