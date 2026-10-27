#!/usr/bin/env bash
# xuat-tat-ca.sh — xuất bản chụp (xuat-ban-chup.sh) cho NHIỀU workspace Jenkins cùng lúc, theo một tệp ánh xạ. KHÔNG cần sửa job Jenkins nào:
# chạy tay sau khi build, hoặc đặt cron (vd mỗi 15 phút). Chỉ ĐỌC workspace (git archive / git log), ghi ra thư mục bản chụp riêng.
#
#   bash xuat-tat-ca.sh <thư-mục-chứa-các-workspace> <tệp-ánh-xạ> [gốc-bản-chụp=$HOME/insight/snap]
# Tệp ánh xạ: mỗi dòng "<tên-thư-mục-workspace> <tên-repo-trong-cổng>" (dòng bắt đầu bằng # bỏ qua; chịu được CRLF). Mẫu: anh-xa.mau.txt
# Workspace nào không có .git, hoặc xuất lỗi, chỉ bị báo — các workspace còn lại vẫn chạy. Mã thoát 0 khi không có lỗi nào.
# Biến: CI_GITLEAKS=tat (chỉ để thử, bỏ quét bí mật), CI_XUAT_LAI=1 (dựng lại bản chụp đã có) — chuyển nguyên cho xuat-ban-chup.sh.
set -uo pipefail
WS_GOC="${1:?Thiếu thư mục chứa các workspace (vd /opt/dev/jenkins/jenkins/workspace/dev-pos)}"
MAP="${2:?Thiếu tệp ánh xạ (mẫu: anh-xa.mau.txt)}"
GOC="${3:-$HOME/insight/snap}"
QUY="$(cd "$(dirname "$0")" && pwd)/xuat-ban-chup.sh"
[ -d "$WS_GOC" ] || { echo "Không có thư mục $WS_GOC" >&2; exit 2; }
[ -f "$MAP" ] || { echo "Không có tệp ánh xạ $MAP" >&2; exit 2; }

# Workspace do user khác sở hữu (Jenkins) làm git báo "dubious ownership": chỉ cho git TIN các kho này trong tiến trình này (chỉ chạy rev-parse / log / archive, không chạy hook).
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'

ok=0; loi=0; bo=0
while read -r thumuc ten _; do
  [[ -z "${thumuc:-}" || "$thumuc" == \#* ]] && continue
  d="$WS_GOC/$thumuc"
  if [ ! -d "$d/.git" ] && [ ! -f "$d/.git" ]; then echo "BỎ QUA $thumuc: không có .git (chưa build / không phải kho git)"; bo=$((bo + 1)); continue; fi
  if ( cd "$d" && bash "$QUY" "$ten" "$GOC" 5 </dev/null ); then ok=$((ok + 1)); else echo "LỖI  $thumuc → $ten (mã $?)"; loi=$((loi + 1)); fi
done < <(tr -d '\r' < "$MAP")

echo "Tổng: OK=$ok · bỏ qua=$bo · lỗi=$loi"
[ "$loi" -eq 0 ]
