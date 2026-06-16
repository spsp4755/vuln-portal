# ── Stage 1: deps (전체 의존성 — 빌드 도구 포함) ────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

# ── Stage 1b: prod-deps (런타임 전용) ─────────────────────────────
FROM node:20-alpine AS prod-deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci --omit=dev
RUN npx prisma generate

# ── Stage 2: builder ───────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 빌드 시점에 DATABASE_URL이 없어도 되도록 dummy 값 설정
ENV DATABASE_URL="postgresql://dummy:dummy@dummy:5432/dummy"
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

# ── Stage 3: runner ────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# 비root 사용자
RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 nextjs

# 빌드 결과물 복사
COPY --from=builder /app/public        ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static  ./.next/static
COPY --from=builder /app/prisma        ./prisma
COPY --from=prod-deps /app/node_modules/.prisma  ./node_modules/.prisma
COPY --from=prod-deps /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=prod-deps /app/node_modules/prisma   ./node_modules/prisma

# DB 마이그레이션 + 앱 시작 스크립트
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
