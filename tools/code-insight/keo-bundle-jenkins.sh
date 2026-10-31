#!/usr/bin/env bash
# keo-bundle-jenkins.sh — server của cổng TỰ KÉO bundle mã nguồn từ Jenkins của máy build (vd máy Windows 10.100.110.78) khi máy build KHÔNG kết nối ra
# được tới server (tường lửa một chiều). Jenkins build xong tạo <repo>.bundle và LƯU làm artifact; script này (chạy bằng cron mỗi vài phút) hỏi
# "lần build thành công gần nhất là số mấy?", thấy số mới thì tải bundle và giao cho nhan-bundle.sh dựng bản chụp.
#
#   bash keo-bundle-jenkins.sh <tệp-ánh-xạ>
# Tệp ánh xạ — mỗi dòng "<tên-job-Jenkins> <tên-repo-trong-cổng> <nhãn-nhánh>" (# = ghi chú; job trong thư mục viết "thumuc/job"):
#   BE-bia-8888         easyposbackend-bia            dev-bia
# Tệp cấu hình keo-bundle.env CẠNH script (quản trị tạo):
#   JENKINS_URL=http://10.100.110.78:8080            gốc Jenkins (không có / cuối)
#   JENKINS_CURL_CONFIG=/home/<tk>/.insight/jenkins.curl   tệp cấu hình curl, quyền 600, MỘT dòng:  user = "<tài-khoản>:<api-token>"
#   TRANG_THAI=/home/<tk>/.insight/keo-trang-thai          nhớ số build đã xử lý     [mặc định: <thư mục script>/.keo-trang-thai]
#   TOI_DA_MB=2048   (và các biến của nhan-bundle.env: GOC_BAN_CHUP, CI_GITLEAKS, SO_BAN_GIU)
# Thông tin đăng nhập Jenkins nằm trong tệp curl (không lộ trên dòng lệnh / danh sách tiến trình). Dùng tài khoản Jenkins CHỈ ĐỌC (Overall/Read + Job/Read).
# Một dòng lỗi chỉ được báo, các dòng còn lại vẫn chạy; thoát 0 khi không có lỗi nào. Chạy chồng lẫn nhau: lần sau tự bỏ qua.
set -uo pipefail

AQ="$(cd "$(dirname "$0")" && pwd)"
MAP="${1:?Thiếu tệp ánh xạ (job repo nhánh)}"
[ -f "$MAP" ] || { echo "Không có tệp ánh xạ $MAP" >&2; exit 2; }
# shellcheck disable=SC1091
[ -f "$AQ/keo-bundle.env" ] && { set -a; . "$AQ/keo-bundle.env"; set +a; }   # xuất ra môi trường để nhan-bundle.sh / xuat-ban-chup.sh dùng chung (GOC_BAN_CHUP, CI_GITLEAKS…)
J="${JENKINS_URL:?Thiếu JENKINS_URL trong keo-bundle.env}"; J="${J%/}"
CURLCFG="${JENKINS_CURL_CONFIG:?Thiếu JENKINS_CURL_CONFIG trong keo-bundle.env}"
[ -f "$CURLCFG" ] || { echo "Không có tệp cấu hình curl $CURLCFG" >&2; exit 2; }
ST="${TRANG_THAI:-$AQ/.keo-trang-thai}"; mkdir -p "$ST"
MB="${TOI_DA_MB:-2048}"
[[ "$MB" =~ ^[0-9]+$ ]] || { echo "TOI_DA_MB không hợp lệ" >&2; exit 2; }

exec 8>"$AQ/.keo-bundle.lock"
command -v flock >/dev/null 2>&1 && ! flock -n 8 && { echo "Lần kéo trước còn chạy — bỏ qua lần này"; exit 0; }

CURL=(curl -sS --fail --connect-timeout 10 --max-time 1800 --config "$CURLCFG")
TAM="$(mktemp -d)"; trap 'rm -rf "$TAM"' EXIT
ok=0; moi=0; loi=0
while read -r job repo nhanh _; do
  [[ -z "${job:-}" || "$job" == \#* ]] && continue
  if ! [[ "$job" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ && "$repo" =~ ^[a-z0-9_.-]{1,80}$ && "${nhanh:-}" =~ ^[A-Za-z0-9._/-]{1,80}$ ]]; then echo "BỎ QUA dòng không hợp lệ: $job $repo ${nhanh:-}"; loi=$((loi + 1)); continue; fi
  duong="${job//\//\/job\/}"; goc="$J/job/$duong/lastSuccessfulBuild"
  so="$("${CURL[@]}" "$goc/buildNumber" 2>/dev/null | tr -cd '0-9')"
  if [ -z "$so" ]; then echo "LỖI  $job: không hỏi được số build (mạng / tài khoản / tên job)"; loi=$((loi + 1)); continue; fi
  if [ -f "$ST/$repo.build" ] && [ "$(cat "$ST/$repo.build")" = "$so" ]; then ok=$((ok + 1)); continue; fi
  f="$TAM/$repo.bundle"
  if ! "${CURL[@]}" --max-filesize $((MB * 1024 * 1024)) -o "$f" "$goc/artifact/$repo.bundle" 2>/dev/null; then echo "LỖI  $job #$so: không tải được artifact $repo.bundle (job đã Archive chưa? quá $MB MB?)"; loi=$((loi + 1)); continue; fi
  if SSH_ORIGINAL_COMMAND="$repo $nhanh" bash "$AQ/nhan-bundle.sh" <"$f"; then printf '%s\n' "$so" >"$ST/$repo.build"; moi=$((moi + 1)); echo "OK   $job #$so → $repo"; else echo "LỖI  $job #$so: dựng bản chụp thất bại"; loi=$((loi + 1)); fi
  rm -f "$f"
done <"$MAP"
echo "Xong: $moi bản mới, $ok không đổi, $loi lỗi."
[ "$loi" -eq 0 ]
