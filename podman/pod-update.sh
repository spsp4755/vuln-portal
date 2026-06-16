#!/bin/bash
# ============================================================
# Vuln Portal — 앱 컨테이너 업데이트 (폐쇄망용)
# DB는 그대로 두고 앱 컨테이너만 새 이미지로 교체합니다
#
# 사용법:
#   bash podman/pod-update.sh
# ============================================================
set -e

POD_NAME="vuln-portal"
APP_IMAGE="vuln-portal-app:1.0.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── 기존 앱 컨테이너에서 환경변수 읽기 ──────────────────────
echo "▶ 기존 환경변수 읽는 중..."
DB_ENV=$(podman inspect "${POD_NAME}-app" \
  --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | \
  grep -E "DATABASE_URL|AUTH_SECRET|NVD_API_KEY|VULNCHECK|OPENAI" || true)

if [ -z "$DB_ENV" ]; then
  echo "❌ 기존 컨테이너를 찾을 수 없습니다."
  echo "   pod-run.sh를 먼저 실행하세요."
  exit 1
fi

DATABASE_URL=$(echo "$DB_ENV"    | grep ^DATABASE_URL    | cut -d= -f2-)
AUTH_SECRET=$(echo "$DB_ENV"     | grep ^AUTH_SECRET     | cut -d= -f2-)
NVD_API_KEY=$(echo "$DB_ENV"     | grep ^NVD_API_KEY     | cut -d= -f2-)
VULNCHECK_API_KEY=$(echo "$DB_ENV" | grep ^VULNCHECK_API_KEY | cut -d= -f2-)
OPENAI_BASE_URL=$(echo "$DB_ENV" | grep ^OPENAI_BASE_URL | cut -d= -f2-)
OPENAI_API_KEY=$(echo "$DB_ENV"  | grep ^OPENAI_API_KEY  | cut -d= -f2-)
OPENAI_MODEL=$(echo "$DB_ENV"    | grep ^OPENAI_MODEL    | cut -d= -f2-)

# ── 새 이미지 로드 ────────────────────────────────────────────
echo "▶ 새 이미지 로드 중..."
APP_TAR="$ROOT_DIR/vuln-portal-app.tar"

if [ ! -f "$APP_TAR" ]; then
  echo "❌ $APP_TAR 파일이 없습니다."
  exit 1
fi

podman load -i "$APP_TAR"
echo "   로드 완료 ✓"

# ── 기존 앱 컨테이너 교체 ────────────────────────────────────
echo "▶ 기존 앱 컨테이너 교체 중..."
podman stop  "${POD_NAME}-app" 2>/dev/null || true
podman rm -f "${POD_NAME}-app" 2>/dev/null || true

podman run -d \
  --pod "$POD_NAME" \
  --name "${POD_NAME}-app" \
  --env NODE_ENV=production \
  --env DATABASE_URL="$DATABASE_URL" \
  --env AUTH_SECRET="$AUTH_SECRET" \
  --env NVD_API_KEY="$NVD_API_KEY" \
  --env VULNCHECK_API_KEY="$VULNCHECK_API_KEY" \
  --env OPENAI_BASE_URL="$OPENAI_BASE_URL" \
  --env OPENAI_API_KEY="$OPENAI_API_KEY" \
  --env OPENAI_MODEL="$OPENAI_MODEL" \
  --restart=always \
  "$APP_IMAGE"

echo ""
echo "✅ 업데이트 완료 — DB 데이터는 그대로 유지됩니다"
echo "   로그: podman logs -f ${POD_NAME}-app"
