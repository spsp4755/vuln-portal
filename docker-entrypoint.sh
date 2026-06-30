#!/bin/sh
set -e

PRISMA="node node_modules/prisma/build/index.js"

echo "[vuln-portal] DB 준비 대기 및 마이그레이션 실행 중..."
# DB가 아직 안 떴거나 초기화 중이면 migrate deploy가 실패할 수 있으므로 재시도
n=0
until $PRISMA migrate deploy; do
  n=$((n + 1))
  if [ "$n" -ge 30 ]; then
    echo "[vuln-portal] 마이그레이션 30회 재시도 실패 — DB 연결/권한을 확인하세요."
    exit 1
  fi
  echo "[vuln-portal] DB 준비 대기 중... ($n/30) 2초 후 재시도"
  sleep 2
done

# 안전장치: migrate가 '성공'했더라도 핵심 테이블이 없으면(초기화 타이밍 꼬임 등)
# 스키마를 직접 강제 동기화한다. 빈 DB이므로 데이터 손실 없음.
if ! node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe('SELECT 1 FROM app_config LIMIT 1').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
  echo "[vuln-portal] 핵심 테이블 누락 감지 — db push로 스키마 강제 동기화"
  $PRISMA db push --skip-generate --accept-data-loss
fi

echo "[vuln-portal] 애플리케이션 시작..."
exec node server.js
