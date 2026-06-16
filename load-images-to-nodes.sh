#!/bin/bash
# =============================================
# k8s 노드에 이미지 직접 로드 스크립트
# Harbor/레지스트리 없이 tar 파일로 배포
#
# 사용법:
#   단일 노드: ./load-images-to-nodes.sh
#   다중 노드: ./load-images-to-nodes.sh node1 node2 node3
# =============================================
set -e

APP_TAR="./vuln-portal-app.tar"
PG_TAR="./postgres-16-alpine.tar"
SSH_USER="root"   # ★ 노드 SSH 접속 계정으로 변경

# tar 파일 존재 확인
if [ ! -f "$APP_TAR" ] || [ ! -f "$PG_TAR" ]; then
  echo "❌ tar 파일이 없습니다. 같은 폴더에 두 파일이 있어야 합니다:"
  echo "   - vuln-portal-app.tar"
  echo "   - postgres-16-alpine.tar"
  exit 1
fi

# 컨테이너 런타임 감지 함수
detect_runtime() {
  if command -v ctr &>/dev/null && ctr version &>/dev/null 2>&1; then
    echo "containerd"
  elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    echo "docker"
  elif command -v podman &>/dev/null; then
    echo "podman"
  else
    echo "unknown"
  fi
}

# 이미지 로드 함수
load_images() {
  local RUNTIME=$(detect_runtime)
  echo "  런타임: $RUNTIME"

  case "$RUNTIME" in
    containerd)
      # containerd (kubeadm 기본, k3s 등)
      ctr -n k8s.io images import "$APP_TAR"
      ctr -n k8s.io images import "$PG_TAR"
      ;;
    docker)
      # Docker 런타임 (구버전 k8s)
      docker load -i "$APP_TAR"
      docker load -i "$PG_TAR"
      ;;
    podman)
      # CRI-O / Podman 런타임
      podman load -i "$APP_TAR"
      podman load -i "$PG_TAR"
      ;;
    *)
      echo "  ⚠ 런타임 감지 실패. 수동으로 로드하세요:"
      echo "    ctr -n k8s.io images import $APP_TAR"
      echo "    ctr -n k8s.io images import $PG_TAR"
      exit 1
      ;;
  esac
  echo "  ✅ 이미지 로드 완료"
}

NODES=("$@")

if [ ${#NODES[@]} -eq 0 ]; then
  # 노드 인자 없으면 현재 서버에서 로드 (마스터/단일노드)
  echo "▶ 현재 노드에 이미지 로드 중..."
  load_images
else
  # 다중 노드: scp로 전송 후 ssh로 로드
  for NODE in "${NODES[@]}"; do
    echo ""
    echo "▶ [$NODE] 이미지 전송 중..."
    scp "$APP_TAR" "$PG_TAR" "$SSH_USER@$NODE:/tmp/"

    echo "▶ [$NODE] 이미지 로드 중..."
    ssh "$SSH_USER@$NODE" "
      RUNTIME=\$(
        if command -v ctr &>/dev/null; then echo containerd
        elif command -v docker &>/dev/null; then echo docker
        elif command -v podman &>/dev/null; then echo podman
        else echo unknown; fi
      )
      echo '  런타임: '\$RUNTIME
      case \$RUNTIME in
        containerd) ctr -n k8s.io images import /tmp/vuln-portal-app.tar && ctr -n k8s.io images import /tmp/postgres-16-alpine.tar ;;
        docker)     docker load -i /tmp/vuln-portal-app.tar && docker load -i /tmp/postgres-16-alpine.tar ;;
        podman)     podman load -i /tmp/vuln-portal-app.tar && podman load -i /tmp/postgres-16-alpine.tar ;;
        *)          echo '런타임 감지 실패'; exit 1 ;;
      esac
      rm -f /tmp/vuln-portal-app.tar /tmp/postgres-16-alpine.tar
      echo '✅ 완료'
    "
  done
fi

echo ""
echo "====================================="
echo "✅ 모든 노드 이미지 로드 완료"
echo ""
echo "다음 단계:"
echo "  1. k8s/01-secret.yaml 수정 (비밀번호/SECRET)"
echo "  2. kubectl apply -f k8s/"
echo "====================================="
