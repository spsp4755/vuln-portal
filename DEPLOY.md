# 취약점 관리 포털 — 폐쇄망 배포 가이드

> **환경**: 외부 인터넷 차단 폐쇄망, Podman 또는 Kubernetes(k8s) 배포

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [이미지 빌드 (인터넷 연결 환경)](#2-이미지-빌드-인터넷-연결-환경)
3. [이미지 전송 (폐쇄망 반입)](#3-이미지-전송-폐쇄망-반입)
4. [Podman 배포](#4-podman-배포)
5. [Kubernetes 배포](#5-kubernetes-배포)
6. [운영 관리](#6-운영-관리)
7. [트러블슈팅](#7-트러블슈팅)

---

## 1. 사전 준비

### 필요 소프트웨어

| 환경 | 필요 소프트웨어 |
|------|----------------|
| 빌드 서버 (인터넷) | Docker 또는 Podman, Node.js 20+ |
| 폐쇄망 — Podman | Podman 4.0+ |
| 폐쇄망 — k8s | kubectl, 클러스터 접근 권한 |

### 디렉터리 구조

```
vuln-portal/
├── Dockerfile
├── docker-entrypoint.sh
├── .dockerignore
├── k8s/
│   ├── 00-namespace.yaml
│   ├── 01-secret.yaml          ← ★ 배포 전 값 수정 필요
│   ├── 02-postgres-pvc.yaml
│   ├── 03-postgres.yaml
│   ├── 04-app-deployment.yaml  ← ★ 이미지 경로 수정 필요
│   └── 05-ingress.yaml         ← ★ 도메인 수정 필요 (선택)
└── podman/
    ├── pod-run.sh              ← ★ 비밀번호/SECRET 수정 필요
    ├── pod-stop.sh
    └── pod-update.sh
```

---

## 2. 이미지 빌드 (인터넷 연결 환경)

인터넷이 연결된 빌드 서버에서 실행합니다.

```bash
# 프로젝트 루트에서 실행
cd /path/to/vuln-portal

# 이미지 빌드
podman build -t vuln-portal-app:latest .
# 또는
docker build -t vuln-portal-app:latest .
```

빌드에 약 3~5분 소요됩니다.

---

## 3. 이미지 전송 (폐쇄망 반입)

### 방법 A — tar 파일로 저장 후 전송 (권장)

```bash
# 빌드 서버에서: 이미지를 tar로 저장
podman save vuln-portal-app:latest -o vuln-portal-app.tar
# 파일 크기 확인 (약 200~300MB)
ls -lh vuln-portal-app.tar

# 폐쇄망 서버로 파일 전송 (USB, SCP, 망간전송 등)
# scp vuln-portal-app.tar user@internal-server:/opt/images/

# 폐쇄망 서버에서: tar에서 이미지 로드
podman load -i /opt/images/vuln-portal-app.tar
# 이미지 확인
podman images | grep vuln-portal
```

### 방법 B — 내부 레지스트리 경유

내부 Harbor, Nexus, GitLab Registry 등이 있는 경우:

```bash
# 빌드 서버에서
podman tag vuln-portal-app:latest registry.internal/vuln-portal/app:latest
podman push registry.internal/vuln-portal/app:latest

# k8s 배포 파일에서 이미지 경로 변경
# image: registry.internal/vuln-portal/app:latest
```

### PostgreSQL 이미지 반입 (k8s 사용 시)

```bash
# 빌드 서버에서
podman pull postgres:16-alpine
podman save postgres:16-alpine -o postgres-16-alpine.tar

# 폐쇄망 서버에서
podman load -i postgres-16-alpine.tar
# k8s 노드마다 로드 필요 또는 내부 레지스트리 활용
```

---

## 4. Podman 배포

### 4-1. 환경변수 설정

`podman/pod-run.sh` 파일을 열어 다음 값을 **반드시 변경**합니다:

```bash
DB_PASS="Kcb1234!DB"                              # ★ DB 비밀번호 변경
AUTH_SECRET="change-this-secret-min-32-characters!!"  # ★ 32자 이상 랜덤 문자열로 변경
NVD_API_KEY=""                                     # NVD API 키 (없어도 동작)
VULNCHECK_API_KEY=""                               # VulnCheck API 키 (선택)
OPENAI_BASE_URL="http://your-llm-server:11434/v1" # 폐쇄망 LLM 서버 주소
OPENAI_API_KEY="any-string"                        # 로컬 LLM은 임의 문자열 가능
OPENAI_MODEL="llama3.2"                            # 사용할 모델명
```

### 4-2. 초기 배포

```bash
cd /path/to/vuln-portal

# 실행 권한 부여
chmod +x podman/pod-run.sh podman/pod-stop.sh podman/pod-update.sh

# Pod 시작
./podman/pod-run.sh
```

### 4-3. 접속 확인

```bash
# 상태 확인
podman pod ps
podman ps

# 로그 확인
podman logs -f vuln-portal-app

# 헬스 체크
curl http://localhost:3000/api/health
```

브라우저에서 `http://서버IP:3000` 접속
- 기본 계정: `admin@koreacb.com` / `Kcb1234!`

### 4-4. 중지/재시작

```bash
./podman/pod-stop.sh    # 중지 및 삭제

./podman/pod-run.sh     # 재시작 (데이터 유지됨)
```

### 4-5. 업데이트 (이미지 재빌드 후)

```bash
# 새 이미지 로드 후
./podman/pod-update.sh  # 앱 컨테이너만 교체 (DB 유지, 다운타임 최소화)
```

### 4-6. systemd 서비스 등록 (자동 시작)

```bash
# Pod를 systemd 서비스로 등록
podman generate systemd --new --name vuln-portal > /etc/systemd/system/vuln-portal.service

# 서비스 등록 및 시작
systemctl daemon-reload
systemctl enable --now vuln-portal
systemctl status vuln-portal
```

---

## 5. Kubernetes 배포

### 5-1. Secret 설정

`k8s/01-secret.yaml` 파일을 편집합니다:

```yaml
stringData:
  POSTGRES_PASSWORD: "실제_DB_비밀번호"       # ★ 변경
  DATABASE_URL: "postgresql://vulnportal:실제_DB_비밀번호@vuln-portal-postgres:5432/vulnportal"  # ★ 비밀번호 일치
  AUTH_SECRET: "32자_이상_랜덤_문자열"         # ★ 변경
  NVD_API_KEY: ""
  VULNCHECK_API_KEY: ""
  OPENAI_BASE_URL: "http://llm-service:11434/v1"
  OPENAI_API_KEY: "any-string"
  OPENAI_MODEL: "llama3.2"
```

> 랜덤 SECRET 생성: `openssl rand -hex 32`

### 5-2. 이미지 경로 설정

내부 레지스트리를 사용하는 경우 `k8s/04-app-deployment.yaml` 수정:

```yaml
image: registry.internal/vuln-portal/app:latest
# imagePullPolicy: Always  # 레지스트리에서 pull 하는 경우
```

로컬 노드 이미지(`podman load` 후)를 사용하는 경우:

```yaml
image: vuln-portal-app:latest
imagePullPolicy: Never    # 주석 해제
```

### 5-3. 스토리지 클래스 설정

`k8s/02-postgres-pvc.yaml`에서 클러스터의 StorageClass 확인:

```bash
kubectl get storageclass
```

StorageClass가 있으면 `k8s/02-postgres-pvc.yaml`에서 주석 해제 후 지정:

```yaml
storageClassName: "ceph-rbd"   # 클러스터의 StorageClass명
```

### 5-4. Ingress 설정 (선택)

`k8s/05-ingress.yaml`에서 도메인 변경:

```yaml
- host: vuln-portal.internal   # ★ 실제 내부 도메인으로 변경
ingressClassName: nginx        # ★ 클러스터의 ingress class로 변경
```

Ingress 없이 NodePort로 접근하려면 `k8s/04-app-deployment.yaml`에서:

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 3000
      nodePort: 30080   # 30000-32767 범위
```

### 5-5. 배포 실행

```bash
# 순서대로 적용
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secret.yaml
kubectl apply -f k8s/02-postgres-pvc.yaml
kubectl apply -f k8s/03-postgres.yaml

# PostgreSQL 준비 대기
kubectl wait --for=condition=ready pod -l app=vuln-portal-postgres \
  -n vuln-portal --timeout=120s

# 앱 배포
kubectl apply -f k8s/04-app-deployment.yaml

# Ingress 사용 시 (선택)
kubectl apply -f k8s/05-ingress.yaml
```

또는 한번에:

```bash
kubectl apply -f k8s/
```

### 5-6. 배포 확인

```bash
# Pod 상태 확인
kubectl get pods -n vuln-portal

# 로그 확인
kubectl logs -f deployment/vuln-portal-app -n vuln-portal

# 서비스 확인
kubectl get svc -n vuln-portal

# NodePort 접근 시 노드 IP 확인
kubectl get nodes -o wide
# http://노드IP:30080 으로 접속
```

### 5-7. 업데이트

```bash
# 새 이미지 로드 후 (또는 레지스트리 push 후)
kubectl rollout restart deployment/vuln-portal-app -n vuln-portal

# 롤아웃 상태 확인
kubectl rollout status deployment/vuln-portal-app -n vuln-portal
```

### 5-8. 삭제

```bash
# 전체 삭제 (PVC 포함 — 데이터 삭제됨!)
kubectl delete namespace vuln-portal

# 앱만 삭제 (DB 데이터 유지)
kubectl delete deployment vuln-portal-app -n vuln-portal
```

---

## 6. 운영 관리

### 기본 계정

| 항목 | 값 |
|------|-----|
| 이메일 | `admin@koreacb.com` |
| 비밀번호 | `Kcb1234!` |

> 첫 로그인 후 **사용자 관리** 메뉴에서 비밀번호를 변경하세요.

### 데이터 백업 (PostgreSQL)

**Podman:**
```bash
podman exec vuln-portal-postgres \
  pg_dump -U vulnportal vulnportal > backup_$(date +%Y%m%d).sql
```

**Kubernetes:**
```bash
kubectl exec -n vuln-portal \
  $(kubectl get pod -n vuln-portal -l app=vuln-portal-postgres -o jsonpath='{.items[0].metadata.name}') \
  -- pg_dump -U vulnportal vulnportal > backup_$(date +%Y%m%d).sql
```

### 데이터 복원

**Podman:**
```bash
cat backup_20240101.sql | podman exec -i vuln-portal-postgres \
  psql -U vulnportal vulnportal
```

**Kubernetes:**
```bash
cat backup_20240101.sql | kubectl exec -i -n vuln-portal \
  $(kubectl get pod -n vuln-portal -l app=vuln-portal-postgres -o jsonpath='{.items[0].metadata.name}') \
  -- psql -U vulnportal vulnportal
```

### 외부 API 연결 (방화벽 오픈 필요)

취약점 수집을 위해 아래 도메인의 **아웃바운드 443(HTTPS)** 포트를 허용해야 합니다:

| 도메인 | 용도 | 필수 여부 |
|--------|------|-----------|
| `services.nvd.nist.gov` | NVD CVE 데이터 | 권장 |
| `www.cisa.gov` | KEV 목록 | 권장 |
| `api.first.org` | EPSS 점수 | 권장 |
| `endoflife.date` | EOL 정보 | 권장 |
| `nvd.nist.gov` | CVSS 점수 | 권장 |
| `api.vulncheck.com` | VulnCheck (API키 필요) | 선택 |

---

## 7. 트러블슈팅

### 앱이 시작되지 않는 경우

```bash
# Podman
podman logs vuln-portal-app

# Kubernetes
kubectl logs deployment/vuln-portal-app -n vuln-portal
kubectl describe pod -l app=vuln-portal-app -n vuln-portal
```

### DB 연결 실패

- `DATABASE_URL`의 비밀번호가 `POSTGRES_PASSWORD`와 일치하는지 확인
- PostgreSQL Pod가 Ready 상태인지 확인: `kubectl get pods -n vuln-portal`
- Podman: `podman exec vuln-portal-postgres pg_isready` 실행

### 마이그레이션 실패 (initContainer)

```bash
kubectl logs -n vuln-portal \
  $(kubectl get pod -n vuln-portal -l app=vuln-portal-app -o jsonpath='{.items[0].metadata.name}') \
  -c migrate
```

### 이미지를 찾을 수 없는 경우 (k8s)

```bash
# 노드에 이미지가 로드되었는지 확인
# 각 노드에서:
crictl images | grep vuln-portal
# 또는
podman images | grep vuln-portal

# imagePullPolicy: Never 설정 확인
kubectl describe pod -l app=vuln-portal-app -n vuln-portal | grep Image
```

### 로그인이 안 되는 경우

- `AUTH_SECRET`이 최소 32자인지 확인
- 브라우저 쿠키 삭제 후 재시도
- 기본 계정 `admin@koreacb.com` / `Kcb1234!` 사용
