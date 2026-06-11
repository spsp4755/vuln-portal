#!/bin/bash
# Vuln Portal — Podman Pod 중지/삭제 스크립트
POD_NAME="vuln-portal"

echo "▶ Pod 중지 중..."
podman pod stop "$POD_NAME" 2>/dev/null && echo "   중지 완료" || echo "   (이미 중지됨)"

read -rp "Pod 및 컨테이너를 삭제하시겠습니까? (데이터는 볼륨에 보존됩니다) [y/N]: " ans
if [[ "$ans" =~ ^[Yy]$ ]]; then
  podman pod rm "$POD_NAME" 2>/dev/null && echo "   삭제 완료"
fi

echo ""
echo "데이터 볼륨 목록:"
podman volume ls | grep vuln-portal || echo "  (없음)"
echo ""
echo "볼륨까지 삭제하려면: podman volume rm vuln-portal-pgdata"
