#!/usr/bin/env bash
# xuat-tu-bundle.sh — dựng BẢN CHỤP cho Code-Insight từ các tệp .bundle chép từ MỘT MÁY KHÁC (vd máy Windows 10.100.110.78 build nhánh dev-bia),
# bằng đúng quy trình của xuat-ban-chup.sh (xoá tệp nhạy cảm, quét bí mật, current nguyên tử, giữ N bản). Chạy trên server của cổng (Linux).
#
# Trên máy nguồn, với mỗi workspace Jenkins đã build:   git bundle create <tên-repo-trong-cổng>.bundle HEAD
# Chép các tệp .bundle vào MỘT thư mục trên server rồi chạy:
#   bash xuat-tu-bundle.sh <thư-mục-chứa-.bundle> <gốc-bản-chụp> [nhãn-nhánh=dev-bia] [số-bản-giữ-lại=5]
# Tên tệp = tên repo trong cổng (chữ thường, số, _ . -), vd easyposbackend-bia.bundle. Nhãn nhánh chỉ để GHI vào ban-chup.json (tester / báo cáo thấy đúng nhánh).
# Biến: CI_GITLEAKS=tat (chỉ để thử), CI_XUAT_LAI=1 (dựng lại bản chụp đã có) — chuyển nguyên cho xuat-ban-chup.sh.
# Một bundle lỗi chỉ bị báo, các bundle còn lại vẫn chạy. Mã thoát 0 khi không có lỗi nào (và có ít nhất một bundle).
set -uo pipefail

THU_MUC="${1:?Thiếu thư mục chứa các tệp .bundle}"
GOC="${2:?Thiếu gốc bản chụp (banChup.thuMuc trong cấu hình cổng)}"
NHANH="${3:-dev-bia}"
GIU="${4:-5}"
QUY="$(cd "$(dirname "$0")" && pwd)/xuat-ban-chup.sh"
[ -d "$THU_MUC" ] || { echo "Không có thư mục $THU_MUC" >&2; exit 2; }
[ -f "$QUY" ] || { echo "Không thấy $QUY (phải để cạnh xuat-ban-chup.sh)" >&2; exit 2; }
[[ "$NHANH" =~ ^[A-Za-z0-9._/-]{1,80}$ ]] || { echo "Nhãn nhánh không hợp lệ: $NHANH" >&2; exit 2; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'

ok=0; loi=0
shopt -s nullglob
for b in "$THU_MUC"/*.bundle; do
  ten="$(basename "$b" .bundle)"
  if ! [[ "$ten" =~ ^[a-z0-9_.-]{1,80}$ ]]; then echo "BỎ QUA $ten.bundle: tên tệp (= tên repo) chỉ gồm chữ thường, số, _ . -"; loi=$((loi + 1)); continue; fi
  d="$TMP/$ten"
  if ! git clone -q "$b" "$d" 2>/dev/null; then echo "LỖI  $ten: bundle hỏng hoặc không mở được (tạo lại: git bundle create … HEAD)"; loi=$((loi + 1)); continue; fi
  # Bundle chỉ có HEAD tách rời: đặt tên nhánh để bản chụp ghi đúng nhánh.
  git -C "$d" checkout -q -B "$NHANH" 2>/dev/null || { echo "LỖI  $ten: không đặt được nhánh $NHANH"; loi=$((loi + 1)); continue; }
  if ( cd "$d" && bash "$QUY" "$ten" "$GOC" "$GIU" </dev/null ); then ok=$((ok + 1)); else echo "LỖI  $ten (mã $?)"; loi=$((loi + 1)); fi
  rm -rf "$d"
done

echo "Xong: $ok bundle thành công, $loi lỗi."
[ "$ok" -ge 1 ] && [ "$loi" -eq 0 ]
