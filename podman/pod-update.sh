#!/bin/bash
# Vuln Portal — 무중단 업데이트 (이미지 재빌드 후 앱 컨테이너만 교체)
set -e
POD_NAME="vuln-portal"
APP_IMAGE="vuln-portal-app:latest"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "▶ 새 이미지 빌드 중..."
podman build -t "$APP_IMAGE" "$SCRIPT_DIR/.."

echo "▶ 앱 컨테이너 교체 중..."
podman stop  "${POD_NAME}-app" 2>/dev/null || true
podman rm -f "${POD_NAME}-app" 2>/dev/null || true

# 기존 환경변수 재사용 (pod-run.sh 값 그대로)
DB_USER="vulnportal"
DB_PASS="Kcb1234!DB"
DB_NAME="vulnportal"
AUTH_SECRET="change-this-secret-min-32-characters!!"
NVD_API_KEY=""
VULNCHECK_API_KEY=""
OPENAI_BASE_URL=""
OPENAI_API_KEY=""
OPENAI_MODEL=""

podman run -d \
  --pod "$POD_NAME" \
  --name "${POD_NAME}-app" \
  --env NODE_ENV=production \
  --env DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}" \
  --env AUTH_SECRET="$AUTH_SECRET" \
  --env NVD_API_KEY="$NVD_API_KEY" \
  --env VULNCHECK_API_KEY="$VULNCHECK_API_KEY" \
  --env OPENAI_BASE_URL="$OPENAI_BASE_URL" \
  --env OPENAI_API_KEY="$OPENAI_API_KEY" \
  --env OPENAI_MODEL="$OPENAI_MODEL" \
  --restart=always \
  "$APP_IMAGE"

echo "✅ 업데이트 완료"
echo "   로그: podman logs -f ${POD_NAME}-app"
