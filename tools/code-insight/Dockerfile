# Image WORKER của Code-Insight: chỉ chứa Node + Claude Code CLI. Không chứa mã nguồn (bản chụp được gắn :ro lúc chạy), không chứa khoá API (truyền bằng biến môi trường lúc chạy).
#   docker build -t insight-worker:latest tools/code-insight          (đặt tên khớp worker.claude.docker.anh trong cấu hình)
# Chạy thật do worker-claude.js gọi: docker run --rm -i --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 4g --cpus 2
#   --tmpfs /tmp --network insight-egress -v <bản-chụp>:/snap:ro -w /snap -e ANTHROPIC_API_KEY -e HTTPS_PROXY insight-worker:latest claude …
FROM node:20-bookworm-slim
# Ghim phiên bản Claude Code khi triển khai thật (vd @anthropic-ai/claude-code@<phiên-bản-đã-thử>) để cập nhật có kiểm soát, không tự đổi hành vi.
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force \
 && useradd --create-home --uid 10001 --shell /usr/sbin/nologin worker
USER 10001
ENV HOME=/tmp/home \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_TELEMETRY=1
WORKDIR /snap
# Không có ENTRYPOINT: lệnh (claude …) do worker-claude.js truyền vào.
