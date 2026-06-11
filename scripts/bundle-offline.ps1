# =============================================================================
# vuln-portal 폐쇄망 오프라인 번들 생성 스크립트
# 인터넷이 연결된 PC에서 실행 → 생성된 zip을 폐쇄망으로 반입
# =============================================================================

param(
    [string]$OutputDir = ".\offline-bundle",
    [switch]$SkipNodeInstaller,
    [switch]$SkipPostgresInstaller
)

$ErrorActionPreference = "Stop"
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " vuln-portal 오프라인 번들 생성 시작" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 출력 디렉토리 생성
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path "$OutputDir\installers" | Out-Null
New-Item -ItemType Directory -Force -Path "$OutputDir\npm-packages" | Out-Null
New-Item -ItemType Directory -Force -Path "$OutputDir\app" | Out-Null

# -----------------------------------------------------------------------
# 1. Node.js LTS 설치 파일 다운로드
# -----------------------------------------------------------------------
if (-not $SkipNodeInstaller) {
    Write-Host "`n[1/4] Node.js LTS 설치 파일 다운로드..." -ForegroundColor Yellow
    $nodeVersion = "24.16.0"
    $nodeUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-x64.msi"
    $nodeOut  = "$OutputDir\installers\node-v$nodeVersion-x64.msi"
    if (-not (Test-Path $nodeOut)) {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeOut -UseBasicParsing
    }
    Write-Host "  -> $nodeOut" -ForegroundColor Green
}

# -----------------------------------------------------------------------
# 2. PostgreSQL 설치 파일 다운로드
# -----------------------------------------------------------------------
if (-not $SkipPostgresInstaller) {
    Write-Host "`n[2/4] PostgreSQL 17 설치 파일 다운로드..." -ForegroundColor Yellow
    $pgUrl = "https://get.enterprisedb.com/postgresql/postgresql-17.10-1-windows-x64.exe"
    $pgOut  = "$OutputDir\installers\postgresql-17.10-1-windows-x64.exe"
    if (-not (Test-Path $pgOut)) {
        Invoke-WebRequest -Uri $pgUrl -OutFile $pgOut -UseBasicParsing
    }
    Write-Host "  -> $pgOut" -ForegroundColor Green
}

# -----------------------------------------------------------------------
# 3. npm 패키지 오프라인 캐시 생성 (npm pack 방식)
# -----------------------------------------------------------------------
Write-Host "`n[3/4] npm 패키지 오프라인 캐시 생성..." -ForegroundColor Yellow

$projectRoot = Split-Path -Parent $PSScriptRoot

# node_modules가 없으면 먼저 install
if (-not (Test-Path "$projectRoot\node_modules")) {
    Write-Host "  npm install 실행 중..." -ForegroundColor DarkYellow
    Push-Location $projectRoot
    npm install
    Pop-Location
}

# npm cache를 로컬 폴더에 복사
$npmCacheTarget = "$OutputDir\npm-packages\cache"
New-Item -ItemType Directory -Force -Path $npmCacheTarget | Out-Null

Push-Location $projectRoot
# npm pack으로 각 의존성을 tgz로 저장
npm pack --dry-run 2>&1 | Out-Null  # warm-up

# npm ci --cache 옵션으로 로컬 캐시 채우기
Write-Host "  npm 로컬 캐시 채우는 중 (시간이 걸릴 수 있습니다)..." -ForegroundColor DarkYellow
npm install --cache "$npmCacheTarget" --prefer-offline 2>&1 | Select-Object -Last 5
Pop-Location

# node_modules 전체를 번들에 포함 (가장 확실한 방법)
Write-Host "  node_modules 복사 중..." -ForegroundColor DarkYellow
Copy-Item -Path "$projectRoot\node_modules" -Destination "$OutputDir\npm-packages\node_modules" -Recurse -Force

Write-Host "  -> npm 패키지 번들 완료" -ForegroundColor Green

# -----------------------------------------------------------------------
# 4. 앱 소스 복사
# -----------------------------------------------------------------------
Write-Host "`n[4/4] 앱 소스 복사..." -ForegroundColor Yellow

$excludes = @("node_modules", ".next", "offline-bundle", ".git", "*.log")
$appDest = "$OutputDir\app\vuln-portal"
New-Item -ItemType Directory -Force -Path $appDest | Out-Null

Get-ChildItem -Path $projectRoot -Force | Where-Object {
    $name = $_.Name
    -not ($excludes | Where-Object { $name -like $_ })
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $appDest -Recurse -Force
}

Write-Host "  -> 앱 소스 복사 완료" -ForegroundColor Green

# -----------------------------------------------------------------------
# 5. 설치 스크립트 생성 (폐쇄망에서 실행)
# -----------------------------------------------------------------------
$installScript = @'
# =============================================================================
# [폐쇄망] vuln-portal 설치 스크립트
# offline-bundle 폴더를 폐쇄망 PC로 옮긴 후 이 스크립트를 실행하세요
# =============================================================================

param(
    [string]$DbPassword = "yourpassword",
    [string]$DbUser = "vulnportal",
    [string]$DbName = "vulnportal",
    [string]$NvdApiKey = "",
    [string]$AppPort = "3000"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " vuln-portal 폐쇄망 설치 시작" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Node.js 설치
Write-Host "`n[1/5] Node.js 설치..." -ForegroundColor Yellow
$nodeMsi = Get-ChildItem "$scriptDir\installers\node-*.msi" | Select-Object -First 1
if ($nodeMsi) {
    Start-Process msiexec.exe -ArgumentList "/i `"$($nodeMsi.FullName)`" /quiet /norestart" -Wait
    Write-Host "  -> Node.js 설치 완료" -ForegroundColor Green
} else {
    Write-Host "  -> Node.js 설치 파일 없음, 건너뜀" -ForegroundColor DarkYellow
}

# PATH 갱신
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 2. PostgreSQL 설치
Write-Host "`n[2/5] PostgreSQL 설치..." -ForegroundColor Yellow
$pgExe = Get-ChildItem "$scriptDir\installers\postgresql-*.exe" | Select-Object -First 1
if ($pgExe) {
    Start-Process -FilePath $pgExe.FullName -ArgumentList `
        "--mode unattended", `
        "--superpassword postgres", `
        "--servicename postgresql-17", `
        "--servicepassword postgres" -Wait
    Write-Host "  -> PostgreSQL 설치 완료" -ForegroundColor Green
} else {
    Write-Host "  -> PostgreSQL 설치 파일 없음, 건너뜀" -ForegroundColor DarkYellow
}

# 3. DB 및 사용자 생성
Write-Host "`n[3/5] 데이터베이스 설정..." -ForegroundColor Yellow
$pgBin = (Get-ChildItem "C:\Program Files\PostgreSQL" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + "\bin"
$env:PGPASSWORD = "postgres"

& "$pgBin\psql.exe" -U postgres -c "CREATE USER $DbUser WITH PASSWORD '$DbPassword' CREATEDB;" 2>&1
& "$pgBin\psql.exe" -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;" 2>&1
& "$pgBin\psql.exe" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;" 2>&1
Write-Host "  -> DB 설정 완료" -ForegroundColor Green

# 4. 앱 설치
Write-Host "`n[4/5] 앱 설치..." -ForegroundColor Yellow
$appSrc = "$scriptDir\app\vuln-portal"
$appDest = "C:\vuln-portal"

Copy-Item -Path $appSrc -Destination $appDest -Recurse -Force
# 오프라인 node_modules 복사
Copy-Item -Path "$scriptDir\npm-packages\node_modules" -Destination "$appDest\node_modules" -Recurse -Force

# .env 파일 생성
@"
DATABASE_URL=postgresql://${DbUser}:${DbPassword}@localhost:5432/${DbName}
NVD_API_KEY=${NvdApiKey}
OPENAI_API_KEY=
VULNCHECK_API_KEY=
COLLECT_NVD_INTERVAL=360
COLLECT_CISA_INTERVAL=1440
COLLECT_EOL_INTERVAL=10080
COLLECT_VULNCHECK_INTERVAL=720
"@ | Out-File -FilePath "$appDest\.env" -Encoding utf8

Write-Host "  -> 앱 파일 설치 완료" -ForegroundColor Green

# 5. Prisma 마이그레이션 및 빌드
Write-Host "`n[5/5] DB 마이그레이션 및 빌드..." -ForegroundColor Yellow
Push-Location $appDest
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
npx prisma migrate deploy
npx prisma generate
npm run build
Pop-Location
Write-Host "  -> 빌드 완료" -ForegroundColor Green

# 서비스 등록 (선택) 또는 실행 배치 파일 생성
@"
@echo off
cd /d C:\vuln-portal
set NODE_ENV=production
npx next start -p $AppPort
"@ | Out-File -FilePath "C:\vuln-portal\start.bat" -Encoding ascii

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " 설치 완료!" -ForegroundColor Green
Write-Host " 실행: C:\vuln-portal\start.bat" -ForegroundColor Green
Write-Host " 접속: http://localhost:$AppPort" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
'@

$installScript | Out-File -FilePath "$OutputDir\install-offline.ps1" -Encoding utf8

# -----------------------------------------------------------------------
# 6. 방화벽 오픈 목록 및 README 생성
# -----------------------------------------------------------------------
$readme = @"
# vuln-portal 오프라인 번들

## 번들 구성
```
offline-bundle/
├── installers/
│   ├── node-v24.x.x-x64.msi       # Node.js LTS
│   └── postgresql-17.x-windows.exe # PostgreSQL 17
├── npm-packages/
│   ├── node_modules/               # 사전 설치된 패키지
│   └── cache/                      # npm 캐시
├── app/
│   └── vuln-portal/                # 앱 소스코드
├── install-offline.ps1             # 폐쇄망 설치 스크립트
├── firewall-allowlist.md           # 방화벽 오픈 목록
└── README.md
```

## 폐쇄망 설치 방법
1. 이 폴더 전체를 USB/이동식 저장매체로 폐쇄망 PC에 복사
2. PowerShell 관리자 권한으로 실행:
   ```powershell
   .\install-offline.ps1 -DbPassword "안전한비밀번호" -NvdApiKey "your-nvd-key"
   ```
3. 설치 완료 후 `C:\vuln-portal\start.bat` 실행
4. 브라우저에서 http://localhost:3000 접속

## 주의사항
- PostgreSQL superuser 비밀번호 기본값: postgres (설치 후 변경 권장)
- NVD API Key는 https://nvd.nist.gov/developers/request-an-api-key 에서 발급
"@

$readme | Out-File -FilePath "$OutputDir\README.md" -Encoding utf8

# -----------------------------------------------------------------------
# 방화벽 오픈 목록 생성
# -----------------------------------------------------------------------
$firewallList = @"
# vuln-portal 방화벽 오픈 목록 (폐쇄망 적용)

## 필수 (취약점 수집 서비스)

| 서비스 | 방향 | 프로토콜 | 목적지 도메인 | 포트 | 용도 |
|--------|------|----------|--------------|------|------|
| NVD | 아웃바운드 | HTTPS | services.nvd.nist.gov | 443 | CVE 취약점 데이터 수집 |
| CISA KEV | 아웃바운드 | HTTPS | www.cisa.gov | 443 | CISA 알려진 악용 취약점 목록 |
| endoflife.date | 아웃바운드 | HTTPS | endoflife.date | 443 | 소프트웨어 EOL 정보 수집 |

## 선택 (부가 기능)

| 서비스 | 방향 | 프로토콜 | 목적지 도메인 | 포트 | 용도 |
|--------|------|----------|--------------|------|------|
| VulnCheck | 아웃바운드 | HTTPS | api.vulncheck.com | 443 | VulnCheck 추가 취약점 데이터 |
| CVE.org | 아웃바운드 | HTTPS | www.cve.org | 443 | CVE.org 취약점 데이터 |
| OpenAI | 아웃바운드 | HTTPS | api.openai.com | 443 | AI 취약점 요약 (선택 기능) |
| EPSS | 아웃바운드 | HTTPS | api.first.org | 443 | EPSS 익스플로잇 예측 점수 |

## 내부 서비스 포트

| 서비스 | 포트 | 설명 |
|--------|------|------|
| vuln-portal 웹 | 3000 (TCP) | 웹 UI 접근 (내부망) |
| PostgreSQL | 5432 (TCP) | DB (localhost만 허용, 외부 차단) |

## IP 주소 정보 (도메인 대신 IP 정책 적용 시)

도메인 → IP 주소는 DNS 변경 가능성이 있으므로 **도메인 기반 정책** 권장.
불가피한 경우 아래 명령으로 현재 IP 확인:
``````
Resolve-DnsName services.nvd.nist.gov
Resolve-DnsName www.cisa.gov
Resolve-DnsName endoflife.date
Resolve-DnsName api.vulncheck.com
``````

## 최소 구성 (NVD + CISA KEV만 사용 시)

NVD와 CISA KEV 두 곳만 열어도 핵심 취약점 정보 수집 가능:
- services.nvd.nist.gov:443
- www.cisa.gov:443
"@

$firewallList | Out-File -FilePath "$OutputDir\firewall-allowlist.md" -Encoding utf8

# -----------------------------------------------------------------------
# 7. zip 압축
# -----------------------------------------------------------------------
Write-Host "`n번들 압축 중..." -ForegroundColor Yellow
$zipPath = ".\vuln-portal-offline-bundle.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$OutputDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " 번들 생성 완료!" -ForegroundColor Green
Write-Host " 출력: $zipPath ($zipSize MB)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor White
Write-Host "  1. $zipPath 를 USB/이동매체로 폐쇄망 PC에 복사" -ForegroundColor White
Write-Host "  2. 압축 해제 후 install-offline.ps1 실행 (관리자 권한)" -ForegroundColor White
