#!/bin/bash
# ============================================================
# Vuln Portal — Podman Pod 배포 스크립트
# 사용법: bash podman/pod-run.sh
# ============================================================
set -e

POD_NAME="vuln-portal"
APP_IMAGE="vuln-portal-app:latest"
PG_IMAGE="postgres:16-alpine"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 환경변수 설정 (운영 환경에 맞게 수정) ─────────────────────
DB_USER="vulnportal"
DB_PASS="Kcb1234!DB"            # ★ 반드시 변경
DB_NAME="vulnportal"
APP_PORT="3000"
AUTH_SECRET="change-this-secret-min-32-characters!!"  # ★ 반드시 변경

# 외부 API 키 (없으면 빈 문자열 — 해당 수집기만 비활성화됨)
NVD_API_KEY=""
VULNCHECK_API_KEY=""
OPENAI_BASE_URL=""    # 로컬 LLM: http://192.168.x.x:11434/v1
OPENAI_API_KEY=""
OPENAI_MODEL=""

# ── 이미지 빌드 ───────────────────────────────────────────────
echo "▶ [1/5] 이미지 빌드 중..."
podman build -t "$APP_IMAGE" "$SCRIPT_DIR/.."
echo "   완료: $APP_IMAGE"

# ── 기존 pod 정리 ─────────────────────────────────────────────
echo "▶ [2/5] 기존 pod 정리..."
podman pod stop  "$POD_NAME" 2>/dev/null || true
podman pod rm -f "$POD_NAME" 2>/dev/null || true

# ── 볼륨 생성 ─────────────────────────────────────────────────
echo "▶ [3/5] 볼륨 준비..."
podman volume create vuln-portal-pgdata 2>/dev/null || echo "   (기존 볼륨 재사용)"

# ── Pod 생성 ──────────────────────────────────────────────────
echo "▶ [4/5] Pod 생성 (포트 $APP_PORT)..."
podman pod create \
  --name "$POD_NAME" \
  --publish "${APP_PORT}:3000"

# ── PostgreSQL 컨테이너 ───────────────────────────────────────
podman run -d \
  --pod "$POD_NAME" \
  --name "${POD_NAME}-db" \
  --env POSTGRES_USER="$DB_USER" \
  --env POSTGRES_PASSWORD="$DB_PASS" \
  --env POSTGRES_DB="$DB_NAME" \
  --env PGDATA=/var/lib/postgresql/data/pgdata \
  --volume vuln-portal-pgdata:/var/lib/postgresql/data \
  --health-cmd="pg_isready -U ${DB_USER} -d ${DB_NAME}" \
  --health-interval=5s \
  --health-retries=10 \
  --restart=always \
  "$PG_IMAGE"

# DB 준비 대기
echo "   DB 준비 대기 중..."
for i in $(seq 1 30); do
  STATUS=$(podman inspect --format='{{.State.Health.Status}}' "${POD_NAME}-db" 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "   DB 준비 완료 ✓"
    break
  fi
  printf "   대기 중... (%d/30)\r" "$i"
  sleep 2
done

# ── App 컨테이너 ──────────────────────────────────────────────
echo "▶ [5/5] App 시작..."
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

# ── 결과 출력 ─────────────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│  ✅  Vuln Portal 배포 완료                  │"
echo "├─────────────────────────────────────────────┤"
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo "│  접속 주소: http://${SERVER_IP}:${APP_PORT}"
echo "│  로그 보기: podman logs -f ${POD_NAME}-app  │"
echo "│  상태 확인: podman pod ps                   │"
echo "│  중지:      bash podman/pod-stop.sh         │"
echo "└─────────────────────────────────────────────┘"
