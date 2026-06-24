# Vuln Portal — 폐쇄망 배포 가이드

> **중요:** 이 포털은 소스코드 빌드 없이 Docker/Podman 이미지 tar 파일만으로 배포합니다.  
> npm install, npx prisma 같은 명령어는 폐쇄망에서 **실행하지 않습니다.**

---

## 1. 준비물

### 1-1. 다운로드

[GitHub Releases](https://github.com/spsp4755/vuln-portal/releases/latest)에서 아래 3개 파일을 **인터넷이 되는 PC**에 다운로드한 뒤 폐쇄망 서버로 반입합니다.

| 파일 | 크기 | 설명 |
|------|------|------|
| `vuln-portal-app.tar` | ~145 MB | 앱 컨테이너 이미지 |
| `postgres-16-alpine.tar` | ~106 MB | PostgreSQL 16 컨테이너 이미지 |
| `deploy-package.tar.gz` | ~8 KB | 배포 스크립트 (Podman/k8s) |

### 1-2. 서버 요구사항

| 항목 | 최소 | 권장 |
|------|------|------|
| OS | RHEL/Rocky/Ubuntu 20.04 이상 | Rocky Linux 9 |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| 디스크 | 20 GB | 50 GB |
| Podman | 4.x 이상 | 최신 |

```bash
# Podman 설치 확인
podman --version
```

---

## 2. Podman 배포 (권장)

### 2-1. 파일 배치

```
/opt/vuln-portal/            ← 이 폴더에 모두 놓기
├── vuln-portal-app.tar
├── postgres-16-alpine.tar
└── deploy-package.tar.gz
```

```bash
mkdir -p /opt/vuln-portal
# 3개 파일 복사 후
cd /opt/vuln-portal
tar -xzf deploy-package.tar.gz
ls
# 압축 해제 결과:
# podman/pod-run.sh
# podman/pod-stop.sh
# podman/pod-update.sh
# k8s/
# load-images-to-nodes.sh
```

### 2-2. 설정 수정 (필수)

`podman/pod-run.sh`를 텍스트 편집기로 열어 **반드시** 변경합니다.

```bash
vi podman/pod-run.sh
```

변경 항목:

```bash
# ★ DB 비밀번호 — 알파벳+숫자+특수문자 8자 이상
DB_PASS="MySecurePass123!"

# ★ 세션 암호화 키 — 32자 이상 랜덤 문자열
#   생성 방법: openssl rand -hex 32
AUTH_SECRET="b3f4a1e2d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2"

# 포트 변경이 필요하면 (기본 3000)
APP_PORT="3000"
```

AI 기능을 사용할 경우 추가 설정:

```bash
OPENAI_BASE_URL="http://192.168.x.x:11434/v1"   # 로컬 LLM 서버 주소
OPENAI_API_KEY="any-string"                        # 로컬 LLM은 임의값
OPENAI_MODEL="llama3.1:8b"                         # 실행 중인 모델명
```

### 2-3. 실행

```bash
cd /opt/vuln-portal
chmod +x podman/pod-run.sh podman/pod-stop.sh podman/pod-update.sh
bash podman/pod-run.sh
```

정상 실행 시 출력 예시:

```
▶ [1/5] 이미지 로드 중...
   앱 이미지 로드 중... (약 10초)
   PostgreSQL 이미지 로드 중... (약 10초)
▶ [2/5] 기존 pod 정리...
▶ [3/5] 볼륨 준비...
▶ [4/5] Pod 생성 (포트 3000)...
▶ [5/5] App 시작...
   DB 준비 대기 중...
   DB 준비 완료 ✓

┌─────────────────────────────────────────────────┐
│  ✅  Vuln Portal 배포 완료                      │
├─────────────────────────────────────────────────┤
│  접속 주소: http://192.168.x.x:3000             │
│  로그인:    admin@koreacb.com / Kcb1234!        │
├─────────────────────────────────────────────────┤
│  로그 보기: podman logs -f vuln-portal-app       │
│  상태 확인: podman pod ps                       │
│  중지:      bash podman/pod-stop.sh             │
└─────────────────────────────────────────────────┘
```

### 2-4. 동작 확인

```bash
# 컨테이너 상태
podman pod ps
podman ps

# 앱 로그 (DB 마이그레이션 포함)
podman logs -f vuln-portal-app

# 헬스체크
curl -s http://localhost:3000/api/health
# {"status":"ok"}
```

**기본 로그인:** `admin@koreacb.com` / `Kcb1234!`  
(최초 로그인 후 변경 권장)

---

## 3. 관리 명령어

### 중지 및 재시작

```bash
# 중지 (데이터 유지)
bash podman/pod-stop.sh

# 재시작
bash podman/pod-run.sh
```

### 앱 업데이트 (새 버전 배포)

새 `vuln-portal-app.tar`를 같은 폴더에 교체 후:

```bash
bash podman/pod-update.sh
# DB 데이터 유지, 앱 컨테이너만 교체됩니다
```

### 로그 확인

```bash
podman logs -f vuln-portal-app       # 앱 로그
podman logs -f vuln-portal-db        # DB 로그
podman logs --tail 50 vuln-portal-app  # 최근 50줄
```

### 데이터 백업

```bash
# PostgreSQL 덤프
podman exec vuln-portal-db \
  pg_dump -U vulnportal vulnportal > backup-$(date +%Y%m%d).sql

# 복원
cat backup-20240101.sql | \
  podman exec -i vuln-portal-db psql -U vulnportal vulnportal
```

---

## 4. 데이터 수집 설정

### 방화벽 오픈 (수집 서버에서 외부 HTTPS 아웃바운드)

| 목적지 | 포트 | 수집기 |
|--------|------|--------|
| nvd.nist.gov | 443 | NVD |
| www.cisa.gov | 443 | CISA KEV |
| endoflife.date | 443 | EndOfLife.date |
| api.first.org | 443 | EPSS |
| api.vulncheck.com | 443 | VulnCheck |

### 수동 수집

배포 완료 후 웹 UI에서 **설정 > 수동 데이터 수집** 섹션에서 즉시 수집할 수 있습니다.

### NVD API 키 (선택사항)

NVD API 키 없이도 동작하지만, 있으면 속도 제한이 완화됩니다.  
https://nvd.nist.gov/developers/request-an-api-key 에서 무료 발급.

설정 방법: 웹 UI > 설정 > NVD API Key 입력

---

## 5. 외부 시스템 API 연동

다른 취약점 분석 시스템에서 이 포털 데이터를 REST API로 가져올 수 있습니다.

### API 키 발급

1. 웹 브라우저로 `http://서버IP:3000/settings` 접속
2. **외부 연동 API 키** 섹션 > 키 이름 입력 > **+ 키 발급**
3. 표시된 키 값(`vp_...`)을 복사 (다시 확인 불가)

### 엔드포인트

모든 요청에 헤더 포함: `X-API-Key: vp_xxxx...`

#### CVE 취약점 목록
```
GET /api/v1/vulnerabilities
```

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| page | 페이지 번호 (기본 1) | `?page=2` |
| limit | 페이지당 건수 (최대 100, 기본 20) | `?limit=50` |
| severity | CRITICAL / HIGH / MEDIUM / LOW | `?severity=CRITICAL` |
| keyword | CVE ID, 설명, 벤더, 제품 검색 | `?keyword=apache` |
| vendor | 벤더명 | `?vendor=microsoft` |
| product | 제품명 | `?product=windows` |
| kev | true — KEV 목록만 | `?kev=true` |
| epssMin | EPSS 점수 최소값 (0.0~1.0) | `?epssMin=0.5` |
| dateFrom | 공개일 시작 (YYYY-MM-DD) | `?dateFrom=2024-01-01` |
| dateTo | 공개일 종료 | `?dateTo=2024-12-31` |
| sort | publishedAt / modifiedAt / cvssScore / epssScore | `?sort=cvssScore` |
| order | asc / desc (기본 desc) | `?order=desc` |

#### KEV 목록
```
GET /api/v1/kev
```

| 파라미터 | 설명 |
|----------|------|
| keyword | CVE ID, 제품명, 벤더 검색 |
| vendor | 벤더명 |
| product | 제품명 |
| ransomware | true — 랜섬웨어 악용 항목만 |
| dueAfter / dueBefore | 시정 기한 범위 (YYYY-MM-DD) |
| sort | dateAdded / dueDate / vendorProject / product |

#### EOL 목록
```
GET /api/v1/eol
```

| 파라미터 | 설명 |
|----------|------|
| keyword | 제품명, 사이클 검색 |
| product | 제품명 |
| category | 카테고리 |
| eolOnly | true — EOL된 항목만 |
| ltsOnly | true — LTS 항목만 |
| eolAfter / eolBefore | EOL 날짜 범위 (YYYY-MM-DD) |
| sort | eolDate / releaseDate / product / cycle |

#### 응답 형식

```json
{
  "data": [...],
  "total": 1234,
  "page": 1,
  "limit": 20,
  "totalPages": 62
}
```

#### 사용 예시

```bash
# CRITICAL CVE 최신 50건
curl -H "X-API-Key: vp_xxxx" \
  "http://192.168.x.x:3000/api/v1/vulnerabilities?severity=CRITICAL&limit=50"

# KEV 중 랜섬웨어 악용 항목
curl -H "X-API-Key: vp_xxxx" \
  "http://192.168.x.x:3000/api/v1/kev?ransomware=true"

# 30일 이내 EOL 예정
curl -H "X-API-Key: vp_xxxx" \
  "http://192.168.x.x:3000/api/v1/eol?eolAfter=$(date +%Y-%m-%d)&eolBefore=$(date -d '+30 days' +%Y-%m-%d)"
```

---

## 6. Kubernetes 배포 (선택사항)

k8s 배포가 필요한 경우 `k8s/` 폴더의 매니페스트를 사용합니다.

### 사전 준비: 이미지 로드

각 노드에 이미지를 로드해야 합니다 (`imagePullPolicy: Never` 설정됨).

```bash
# 자동 감지 스크립트 사용
chmod +x load-images-to-nodes.sh
bash load-images-to-nodes.sh

# 원격 노드 지정
bash load-images-to-nodes.sh 192.168.x.x 192.168.x.y
```

### 배포 순서

```bash
# 1. 네임스페이스
kubectl apply -f k8s/00-namespace.yaml

# 2. 시크릿 (DB 비밀번호, AUTH_SECRET — 반드시 수정 후 적용)
vi k8s/01-secret.yaml
kubectl apply -f k8s/01-secret.yaml

# 3. PVC (데이터 볼륨)
kubectl apply -f k8s/02-postgres-pvc.yaml

# 4. PostgreSQL
kubectl apply -f k8s/03-postgres.yaml

# 5. 앱
kubectl apply -f k8s/04-app-deployment.yaml

# 6. Ingress (선택)
kubectl apply -f k8s/05-ingress.yaml

# 상태 확인
kubectl get pods -n vuln-portal
```

---

## 7. 트러블슈팅

### DB 마이그레이션 실패

```bash
podman logs vuln-portal-app | head -30
```

DB가 준비되기 전에 앱이 시작되면 발생합니다. 앱 컨테이너를 재시작합니다:

```bash
podman restart vuln-portal-app
```

### 포트 충돌 (3000번 사용 중)

```bash
ss -tlnp | grep 3000
```

`podman/pod-run.sh`에서 `APP_PORT`를 다른 번호로 변경 후 재실행합니다.

### 이미지 로드 실패

```bash
# 파일 크기 확인 (145 MB 내외여야 함)
ls -lh vuln-portal-app.tar
# POSIX tar 확인
file vuln-portal-app.tar
```

### 데이터 수집 안됨

설정 > 수집 로그에서 오류 메시지를 확인하고,  
수집 서버에서 외부 사이트로 HTTPS 443 아웃바운드가 열려 있는지 확인합니다.
