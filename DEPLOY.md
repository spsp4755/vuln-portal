# 취약점 관리 포털 — 폐쇄망 배포 가이드

> **환경**: 외부 인터넷 차단 폐쇄망, 내부 레지스트리(Harbor 등) 없음
> **배포 방식**: tar 파일을 각 k8s 노드에 직접 로드 → `imagePullPolicy: Never`

---

## 목차

1. [파일 준비](#1-파일-준비)
2. [k8s 노드에 이미지 로드](#2-k8s-노드에-이미지-로드)
3. [Secret 설정](#3-secret-설정)
4. [k8s 배포](#4-k8s-배포)
5. [접속 확인](#5-접속-확인)
6. [운영 관리](#6-운영-관리)
7. [트러블슈팅](#7-트러블슈팅)

---

## 1. 파일 준비

GitHub Releases에서 아래 5개 파일을 다운로드해서 폐쇄망 서버로 반입합니다.

| 파일 | 크기 | 설명 |
|------|------|------|
| `vuln-portal-app.tar` | 122 MB | 앱 Docker 이미지 |
| `postgres-16-alpine.tar` | 106 MB | PostgreSQL 16 이미지 |
| `deploy-package.tar.gz` | 10 KB | k8s 매니페스트 + 스크립트 |
| `k8s-manifests.tar.gz` | 2 KB | k8s 매니페스트만 (선택) |
| `build-images.sh` | 1 KB | 이미지 재빌드 스크립트 (선택) |

파일을 같은 폴더에 놓고 압축 해제합니다:

```bash
tar -xzf deploy-package.tar.gz
ls
# vuln-portal-app.tar  postgres-16-alpine.tar  k8s/  podman/  ...
```

---

## 2. k8s 노드에 이미지 로드

레지스트리(Harbor 등) 없이 배포할 때는 **모든 k8s 노드**에 이미지를 직접 로드해야 합니다.

### 노드 수 확인

```bash
kubectl get nodes
```

### 방법 A — 스크립트 사용 (권장)

```bash
chmod +x load-images-to-nodes.sh

# 단일 노드 (마스터에서 직접 실행)
./load-images-to-nodes.sh

# 다중 노드 (워커 노드 IP/호스트명 입력)
./load-images-to-nodes.sh worker1 worker2 worker3
```

스크립트가 컨테이너 런타임(containerd / docker / podman)을 자동으로 감지해서 로드합니다.

### 방법 B — 수동으로 각 노드에서 실행

각 노드에 SSH로 접속 후:

```bash
# containerd 사용 시 (kubeadm, k3s 기본)
ctr -n k8s.io images import vuln-portal-app.tar
ctr -n k8s.io images import postgres-16-alpine.tar

# Docker 사용 시
docker load -i vuln-portal-app.tar
docker load -i postgres-16-alpine.tar

# Podman / CRI-O 사용 시
podman load -i vuln-portal-app.tar
podman load -i postgres-16-alpine.tar
```

### 로드 확인

```bash
# containerd
ctr -n k8s.io images list | grep -E "vuln-portal|postgres"

# docker
docker images | grep -E "vuln-portal|postgres"
```

> **중요**: `imagePullPolicy: Never`가 이미 설정되어 있으므로 로드만 하면 됩니다.

---

## 3. Secret 설정

`k8s/01-secret.yaml`을 편집합니다:

```bash
vi k8s/01-secret.yaml
```

반드시 변경해야 할 항목:

```yaml
stringData:
  POSTGRES_PASSWORD: "원하는_DB_비밀번호"      # ★ 변경
  DATABASE_URL: "postgresql://vulnportal:원하는_DB_비밀번호@vuln-portal-postgres:5432/vulnportal"  # ★ 비밀번호 동일하게
  AUTH_SECRET: "32자_이상_랜덤_문자열"           # ★ 변경
```

랜덤 AUTH_SECRET 생성:
```bash
openssl rand -hex 32
```

선택 항목 (없어도 동작):
```yaml
  NVD_API_KEY: ""           # NVD 수집 속도 향상 (없으면 느린 수집)
  OPENAI_BASE_URL: ""       # 폐쇄망 LLM 서버 (AI 분석 기능)
  OPENAI_API_KEY: ""
  OPENAI_MODEL: ""
```

---

## 4. k8s 배포

```bash
# 전체 적용 (순서 자동 처리)
kubectl apply -f k8s/

# 또는 순서대로 하나씩
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secret.yaml
kubectl apply -f k8s/02-postgres-pvc.yaml
kubectl apply -f k8s/03-postgres.yaml

# PostgreSQL 준비 대기 (약 30초)
kubectl wait --for=condition=ready pod -l app=vuln-portal-postgres \
  -n vuln-portal --timeout=120s

# 앱 배포
kubectl apply -f k8s/04-app-deployment.yaml
```

---

## 5. 접속 확인

```bash
# Pod 상태 확인 (모두 Running이 될 때까지)
kubectl get pods -n vuln-portal -w

# 예상 출력:
# NAME                               READY   STATUS    RESTARTS
# vuln-portal-postgres-0             1/1     Running   0
# vuln-portal-app-xxxx-xxxx          1/1     Running   0
```

### 브라우저 접속

**Ingress가 있는 경우**: `k8s/05-ingress.yaml` 적용 후 설정한 도메인으로 접속

**Ingress가 없는 경우** — NodePort로 변경:

```bash
# 서비스 타입을 NodePort로 변경
kubectl patch svc vuln-portal-app -n vuln-portal \
  -p '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":3000,"nodePort":30080}]}}'

# 노드 IP 확인
kubectl get nodes -o wide

# 접속: http://노드IP:30080
```

### 로그인

- 이메일: `admin@koreacb.com`
- 비밀번호: `Kcb1234!`

> ⚠️ 첫 로그인 후 **사용자 관리** 메뉴에서 비밀번호를 변경하세요.

---

## 6. 운영 관리

### 데이터 백업

```bash
kubectl exec -n vuln-portal \
  $(kubectl get pod -n vuln-portal -l app=vuln-portal-postgres -o jsonpath='{.items[0].metadata.name}') \
  -- pg_dump -U vulnportal vulnportal > backup_$(date +%Y%m%d).sql
```

### 데이터 복원

```bash
cat backup_20240101.sql | kubectl exec -i -n vuln-portal \
  $(kubectl get pod -n vuln-portal -l app=vuln-portal-postgres -o jsonpath='{.items[0].metadata.name}') \
  -- psql -U vulnportal vulnportal
```

### 앱 업데이트 (새 버전 배포 시)

1. 새 `vuln-portal-app.tar`를 모든 노드에 로드
2. `kubectl rollout restart deployment/vuln-portal-app -n vuln-portal`

### 삭제

```bash
# 앱만 삭제 (DB 데이터 유지)
kubectl delete deployment vuln-portal-app -n vuln-portal

# 전체 삭제 (데이터도 삭제됨!)
kubectl delete namespace vuln-portal
```

### 방화벽 오픈 필요 도메인 (취약점 수집용)

| 도메인 | 포트 | 용도 |
|--------|------|------|
| `services.nvd.nist.gov` | 443 | NVD CVE 수집 |
| `nvd.nist.gov` | 443 | CVSS 점수 |
| `www.cisa.gov` | 443 | KEV 수집 |
| `api.first.org` | 443 | EPSS 점수 |
| `endoflife.date` | 443 | EOL 정보 |

---

## 7. 트러블슈팅

### ErrImageNeverPull — 이미지를 못 찾음

```bash
# 원인: 해당 노드에 이미지가 로드되지 않음
# 어느 노드에서 Pod가 실행 중인지 확인
kubectl get pod -n vuln-portal -o wide

# 해당 노드에서 이미지 확인
ssh 노드IP "ctr -n k8s.io images list | grep vuln-portal"

# 해당 노드에서 이미지 로드
scp vuln-portal-app.tar 노드IP:/tmp/
ssh 노드IP "ctr -n k8s.io images import /tmp/vuln-portal-app.tar"
```

### DB 연결 실패

```bash
# Secret의 DATABASE_URL 비밀번호와 POSTGRES_PASSWORD가 같은지 확인
kubectl get secret vuln-portal-secret -n vuln-portal -o jsonpath='{.data.DATABASE_URL}' | base64 -d
```

### 마이그레이션 실패

```bash
kubectl logs -n vuln-portal \
  $(kubectl get pod -n vuln-portal -l app=vuln-portal-app -o jsonpath='{.items[0].metadata.name}') \
  -c migrate
```

### 로그인 안 될 때

- AUTH_SECRET이 32자 이상인지 확인
- 브라우저 쿠키 삭제 후 재시도
- 기본 계정: `admin@koreacb.com` / `Kcb1234!`
