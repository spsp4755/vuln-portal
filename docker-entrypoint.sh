#!/bin/sh
set -e

echo "[vuln-portal] DB 마이그레이션 실행 중..."
npx prisma migrate deploy

echo "[vuln-portal] 애플리케이션 시작..."
exec node server.js
