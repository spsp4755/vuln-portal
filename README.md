# Vuln Portal — 취약점 정보 수집 관리 포털

5개 외부 소스에서 취약점 정보를 자동으로 수집하고 통합 대시보드로 제공하는 보안 전문 도구입니다.

## 기술 스택

- **프레임워크**: Next.js 14 (App Router), TypeScript
- **데이터베이스**: PostgreSQL 16, Prisma 5.x
- **UI**: Tailwind CSS v4, @radix-ui/themes, @phosphor-icons/react, motion/react
- **AI**: OpenAI GPT-4o-mini (한국어 요약, 우선순위 산정, 대화형 질의)
- **데이터 조회**: @tanstack/react-query, date-fns

## 수집 소스

| 소스 | 수집 주기 | 내용 |
|------|----------|------|
| NVD | 6시간 | CVSS v3.1/v4.0, CPE, CWE |
| CVE.org | 6시간 | CVE JSON 5.0 컨테이너 |
| CISA KEV | 매일 | 알려익용된취약점 목록 |
| EndOfLife.date | 매주 | 24개 제품 지원 종료 일정 |
| VulnCheck | 12시간 | EPSS 점수, CPE 보정 |

## 페이지

| 페이지 | 경로 | 설명 |
|--------|------|------|
| 대시보드 | `/` | 6개 통계 카드, 최근 취약점, 시정 작업 |
| CVE 상세 | `/cve/[cveId]` | AI 요약, CVSS, CWE, CPE, KEV 정보 |
| 검색 | `/search` | 키워드/심각도/KEV 필터, 페이지네이션 |
| KEV 목록 | `/kev` | ransomware 필터, 시정 기한 카운트다운 |
| EOL 임박 | `/eol` | 카테고리 필터, 상태 배지 |
| 시정 작업 | `/action-items` | KEV+HIGH/CRITICAL, EOL 임박 |
| 설정 | `/settings` | 수동 수집, 수집 로그 |

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
# .env 편집 (DATABASE_URL, NVD_API_KEY, OPENAI_API_KEY, VULNCHECK_API_KEY)
```

### 3. 데이터베이스 마이그레이션

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. 개발 서버 실행

```bash
npm run dev
```

http://localhost:3000 에서 접근합니다.

## 프로젝트 구조

```
vuln-portal/
├── prisma/
│   └── schema.prisma          # 9개 테이블 스키마
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout (Radix Theme)
│   │   ├── page.tsx           # 대시보드
│   │   ├── search/page.tsx    # 검색
│   │   ├── cve/[cveId]/page.tsx  # CVE 상세
│   │   ├── kev/page.tsx       # KEV 목록
│   │   ├── eol/page.tsx       # EOL 임박
│   │   ├── action-items/page.tsx  # 시정 작업
│   │   ├── settings/page.tsx  # 설정
│   │   └── api/               # API Routes
│   │       ├── dashboard/     # summary, recent, action-items
│   │       ├── vulnerabilities/  # 검색, 상세
│   │       ├── kev/           # KEV 목록, due-soon
│   │       ├── eol/           # EOL 목록
│   │       ├── ai/            # summarize, query
│   │       └── admin/         # collect, collection-logs
│   ├── components/
│   │   ├── layout/            # Sidebar, MainLayout
│   │   └── ui/                # SeverityBadge, StatCard, LoadingSkeleton
│   └── lib/
│       ├── prisma.ts          # Prisma client singleton
│       ├── scheduler.ts       # 수집 스케줄러
│       ├── collectors/        # 5개 수집기
│       └── ai/                # AI 요약, 우선순위
└── package.json
```

## AI 기능

- **한국어 요약**: GPT-4o-mini 기반으로 CVE를 한국어로 요약
- **우선순위 산정**: CVSS(40점) + KEV(20점) + EPSS(20점) + 근래성(10점) + 랜섬웨어(10점)
- **대화형 질의**: 자연어 질의 → 의도 분석 → DB 검색 → AI 설명

## 설계 원칙

- **Radix UI themes** — B2B 신뢰 기반 대시보드
- **@phosphor-icons/react** — 일관된 아이콘 시스템
- **Cockpit/Dashboard 스타일** — VISUAL_DENSITY: 7, DESIGN_VARIANCE: 5, MOTION_INTENSITY: 3
