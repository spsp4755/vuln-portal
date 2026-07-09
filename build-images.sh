#!/bin/bash
# =============================================
# 폐쇄망 배포용 이미지 빌드 & 저장 스크립트
# 인터넷 연결된 서버에서 실행하세요
# =============================================
set -e

APP_TAG="vuln-portal-app:v1.4.16"
PG_TAG="postgres:16-alpine"
OUTPUT_DIR="./images"

mkdir -p "$OUTPUT_DIR"

echo "▶ 앱 이미지 빌드 중..."
podman build -t "$APP_TAG" .

echo "▶ PostgreSQL 이미지 pull 중..."
podman pull "$PG_TAG"

echo "▶ 이미지 tar 저장 중..."
podman save "$APP_TAG"  -o "$OUTPUT_DIR/vuln-portal-app.tar"
podman save "$PG_TAG"   -o "$OUTPUT_DIR/postgres-16-alpine.tar"

echo "▶ 파일 크기 확인:"
ls -lh "$OUTPUT_DIR/"

echo ""
echo "✅ 완료! 아래 파일을 폐쇄망으로 반입하세요:"
echo "   $OUTPUT_DIR/vuln-portal-app.tar"
echo "   $OUTPUT_DIR/postgres-16-alpine.tar"
echo "   deploy-package.tar.gz (또는 k8s-manifests.tar.gz)"
