# Vuln Portal — 취약점 정보 수집 관리 포털

5개 외부 소스에서 취약점 정보를 자동으로 수집하고 통합 대시보드로 제공하는 보안 전문 도구입니다.  
**폐쇄망 환경에서 Podman으로 배포합니다 — npm install 불필요.**

---

## 폐쇄망 배포 (Podman) — 빠른 시작

### 준비물

[GitHub Releases](https://github.com/spsp4755/vuln-portal/releases/latest)에서 아래 3개 파일을 **같은 폴더**에 다운로드합니다.

```
vuln-portal-app.tar       ← 앱 이미지 (145 MB)
postgres-16-alpine.tar    ← DB 이미지 (106 MB)
deploy-package.tar.gz     ← 배포 스크립트
```

### 설치 순서

```bash
# 1. 배포 스크립트 압축 해제
tar -xzf deploy-package.tar.gz

# 2. 실행 전 비밀번호/시크릿 변경 (필수)
#    podman/pod-run.sh 파일을 열어 아래 두 줄 수정
#    DB_PASS="원하는DB비밀번호"
#    AUTH_SECRET="32자_이상_랜덤_문자열"
vi podman/pod-run.sh   # 또는 nano, gedit 등

# 3. 실행
chmod +x podman/pod-run.sh
bash podman/pod-run.sh
```

완료되면 터미널에 접속 주소가 출력됩니다 (기본 포트: 3000).

**기본 로그인:** `admin@koreacb.com` / `Kcb1234!`  
(최초 로그인 후 설정 > 사용자 메뉴에서 변경하세요)

### 주요 명령어

```bash
# 상태 확인
podman pod ps
podman ps

# 앱 로그
podman logs -f vuln-portal-app

# 중지
bash podman/pod-stop.sh

# 업데이트 (새 이미지 tar 교체 후)
bash podman/pod-update.sh
```

### 포트 변경이 필요한 경우

`podman/pod-run.sh` 파일에서 `APP_PORT="3000"` 값을 변경합니다.

### 로컬 LLM 연동 (폐쇄망 AI 기능)

AI 요약 기능을 사용하려면 `podman/pod-run.sh`에서 아래 설정:

```bash
OPENAI_BASE_URL="http://192.168.x.x:11434/v1"   # Ollama/vLLM/sglang 주소
OPENAI_API_KEY="any-string"                        # 로컬 LLM은 임의값
OPENAI_MODEL="llama3.1:8b"                         # 실행 중인 모델명
```

### 외부 시스템 API 연동

다른 시스템에서 이 포털 데이터를 가져갈 수 있습니다.

1. 설정 페이지 > **외부 연동 API 키** 섹션에서 키 발급
2. 요청 시 헤더에 포함: `X-API-Key: vp_...`

```bash
# 예시
curl -H "X-API-Key: vp_xxxx" http://서버IP:3000/api/v1/vulnerabilities
curl -H "X-API-Key: vp_xxxx" http://서버IP:3000/api/v1/kev
curl -H "X-API-Key: vp_xxxx" http://서버IP:3000/api/v1/eol
```

자세한 필터/정렬 파라미터는 [DEPLOY.md](DEPLOY.md)를 참고하세요.

---

## 수집 소스

| 소스 | 수집 주기 | 내용 | 비고 |
|------|----------|------|------|
| NVD | 6시간 | CVSS v3.1/v4.0, CPE, CWE | API 키 선택사항 |
| CISA KEV | 매일 | 알려진 악용 취약점 목록 | 무료 |
| EndOfLife.date | 매주 | 소프트웨어 지원 종료 일정 | 무료 |
| EPSS | 매일 | 익스플로잇 예측 점수 | 무료 |
| VulnCheck | 12시간 | KEV 확장 + 랜섬웨어 여부 | Community 무료 |

> **수집 서버 방화벽 오픈 필요:** nvd.nist.gov, www.cisa.gov, endoflife.date, api.first.org, api.vulncheck.com  
> (앱 서버 → 외부 HTTPS 443 아웃바운드)

---

## 페이지

| 페이지 | 경로 | 설명 |
|--------|------|------|
| 대시보드 | `/` | 통계 카드, 최근 취약점, 시정 작업 |
| CVE 상세 | `/cve/[cveId]` | AI 요약, CVSS, CWE, CPE, KEV 정보 |
| 취약점 검색 | `/vulnerabilities` | 심각도/KEV/날짜 필터, 정렬 |
| KEV 목록 | `/kev` | 시정 기한 카운트다운, 랜섬웨어 필터 |
| EOL 임박 | `/eol` | 카테고리별 지원 종료 현황 |
| 시정 작업 | `/action-items` | KEV+HIGH/CRITICAL, EOL 임박 목록 |
| 설정 | `/settings` | 수동 수집, 스케줄, API 키 관리 |

---

## 기술 스택

- **프레임워크**: Next.js 14 (App Router, `output: standalone`)
- **데이터베이스**: PostgreSQL 16, Prisma ORM
- **컨테이너**: Docker/Podman, 멀티스테이지 빌드 (npm install 불필요)
- **UI**: Tailwind CSS v4, @phosphor-icons/react
- **AI**: OpenAI 호환 API (로컬 LLM 지원)

---

## 개발 환경 (인터넷 연결 환경)

```bash
# Node.js 20+ 필요
npm install
cp .env.example .env
# .env 편집 후
npx prisma generate
npx prisma migrate dev
npm run dev
```

자세한 내용은 [DEPLOY.md](DEPLOY.md) 참고.
