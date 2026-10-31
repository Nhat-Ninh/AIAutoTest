#!/usr/bin/env bash
# nhan-bundle.sh — NHẬN bundle git từ máy build khác (vd máy Windows 10.100.110.78 sau mỗi lần Jenkins build nhánh dev-bia) và dựng bản chụp NGAY,
# để tester đọc mã đúng của lần build vừa xong. Chạy trên server của cổng; thiết kế làm LỆNH BẮT BUỘC (forced command) của một khoá SSH riêng:
#
#   # ~/.ssh/authorized_keys của tài khoản chạy cổng (MỘT dòng):
#   command="/opt/dev/jenkins/jenkins/insight/nhan-bundle.sh",restrict ssh-ed25519 AAAA… jenkins-78
#
# Máy build gọi:   ssh <khoá> <tài-khoản>@<server> "<tên-repo> <nhãn-nhánh>" < repo.bundle        (nội dung bundle đi qua stdin)
# Khoá này CHỈ chạy được đúng script này (không có shell). Mọi đầu vào bị kiểm nghiêm: tên repo, nhánh, dung lượng.
#
# Cấu hình tuỳ chọn trong tệp nhan-bundle.env CẠNH script (do quản trị tạo, không nhận từ máy gọi):
#   GOC_BAN_CHUP=/opt/dev/jenkins/jenkins/insight/snap    gốc bản chụp (= banChup.thuMuc của cổng)      [mặc định: <thư mục script>/snap]
#   CI_GITLEAKS=tat                                         chỉ khi chưa cài gitleaks (xem xuat-ban-chup.sh)
#   SO_BAN_GIU=5   TOI_DA_MB=2048   REPO_HOP_LE='^[a-z0-9_.-]{1,80}-bia$'   NHANH_HOP_LE='^(dev-bia|bia-prod-test)$'
# Mã thoát 0 = bản chụp đã dựng (hoặc đã có sẵn). Khác 0 = lý do in ra stdout / stderr (máy build chỉ ghi vào log, không làm hỏng build).
set -uo pipefail

AQ="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
[ -f "$AQ/nhan-bundle.env" ] && . "$AQ/nhan-bundle.env"
GOC="${GOC_BAN_CHUP:-$AQ/snap}"
GIU="${SO_BAN_GIU:-5}"
MB="${TOI_DA_MB:-2048}"
RE_REPO='^[a-z0-9_.-]{1,80}-bia$'; [ -n "${REPO_HOP_LE:-}" ] && RE_REPO="$REPO_HOP_LE"
RE_NHANH='^(dev-bia|bia-prod-test)$'; [ -n "${NHANH_HOP_LE:-}" ] && RE_NHANH="$NHANH_HOP_LE"

# Đối số: qua SSH là SSH_ORIGINAL_COMMAND; chạy tay thì là tham số dòng lệnh.
read -r REPO NHANH THUA <<<"${SSH_ORIGINAL_COMMAND:-$*}"
if [ -z "${REPO:-}" ] || [ -n "${THUA:-}" ]; then echo "Cách dùng: \"<tên-repo> <nhãn-nhánh>\" và bundle qua stdin" >&2; exit 2; fi
NHANH="${NHANH:-dev-bia}"
[[ "$REPO" =~ $RE_REPO ]] || { echo "Tên repo không được phép: $REPO" >&2; exit 2; }
[[ "$NHANH" =~ $RE_NHANH ]] || { echo "Nhãn nhánh không được phép: $NHANH" >&2; exit 2; }
[[ "$MB" =~ ^[0-9]+$ ]] && [[ "$GIU" =~ ^[0-9]+$ ]] || { echo "Cấu hình số không hợp lệ" >&2; exit 2; }
[ -f "$AQ/xuat-tu-bundle.sh" ] || { echo "Thiếu xuat-tu-bundle.sh cạnh script này" >&2; exit 2; }

TAM="$(mktemp -d "$AQ/.nhan-tam.XXXXXX")" || { echo "Không tạo được thư mục tạm" >&2; exit 2; }
trap 'rm -rf "$TAM"' EXIT
mkdir -p "$GOC"

# Nhận bundle (giới hạn dung lượng) TRƯỚC khi lấy khoá, để người khác không phải chờ mạng.
head -c $((MB * 1024 * 1024 + 1)) >"$TAM/$REPO.bundle"
KT="$(wc -c <"$TAM/$REPO.bundle" | tr -d ' ')"
[ "$KT" -gt 0 ] || { echo "Không nhận được dữ liệu bundle" >&2; exit 3; }
[ "$KT" -le $((MB * 1024 * 1024)) ] || { echo "Bundle vượt $MB MB — từ chối" >&2; exit 3; }

# Mỗi lần chỉ MỘT lần dựng bản chụp (nhiều job build cùng lúc cũng an toàn).
exec 9>"$AQ/.nhan-bundle.lock"
command -v flock >/dev/null 2>&1 && ! flock -w 900 9 && { echo "Chờ khoá quá lâu" >&2; exit 4; }

bash "$AQ/xuat-tu-bundle.sh" "$TAM" "$GOC" "$NHANH" "$GIU"
