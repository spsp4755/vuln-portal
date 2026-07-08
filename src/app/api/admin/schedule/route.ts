import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import cron from 'node-cron';

const SCHEDULE_KEYS = [
  'SCHEDULE_ENABLED',
  'SCHEDULE_NVD',
  'SCHEDULE_CISA_KEV',
  'SCHEDULE_EOL',
  'SCHEDULE_EPSS',
  'SCHEDULE_VULNCHECK',
  'SCHEDULE_KISA',
  'SCHEDULE_GITHUB_ADVISORY',
];

const DEFAULTS: Record<string, string> = {
  SCHEDULE_ENABLED:   'true',
  SCHEDULE_NVD:       '0 */6 * * *',
  SCHEDULE_CISA_KEV:  '0 2 * * *',
  SCHEDULE_EOL:       '0 3 * * 1',
  SCHEDULE_EPSS:      '0 4 * * *',
  SCHEDULE_VULNCHECK: '0 */12 * * *',
  SCHEDULE_KISA:      '0 5 * * *',
  SCHEDULE_GITHUB_ADVISORY: '0 6 * * *',
};

/** 다음 실행 시각 계산 (간단한 표현용) */
function describeSchedule(expr: string): string {
  if (expr === 'off') return '비활성';
  const map: Record<string, string> = {
    '0 */1 * * *':  '1시간마다',
    '0 */3 * * *':  '3시간마다',
    '0 */4 * * *':  '4시간마다',
    '0 */6 * * *':  '6시간마다',
    '0 */8 * * *':  '8시간마다',
    '0 */12 * * *': '12시간마다',
    '0 0 * * *':    '매일 자정',
    '0 1 * * *':    '매일 01:00',
    '0 2 * * *':    '매일 02:00',
    '0 3 * * *':    '매일 03:00',
    '0 4 * * *':    '매일 04:00',
    '0 5 * * *':    '매일 05:00',
    '0 3 * * 1':    '매주 월 03:00',
  };
  return map[expr] || expr;
}

export async function GET() {
  try {
    const rows = await prisma.appConfig.findMany({
      where: { key: { in: SCHEDULE_KEYS } },
    });
    const stored: Record<string, string> = {};
    for (const r of rows) stored[r.key] = r.value;

    const result = SCHEDULE_KEYS.map((key) => ({
      key,
      value: stored[key] ?? DEFAULTS[key] ?? '',
      default: DEFAULTS[key] ?? '',
      description: describeSchedule(stored[key] ?? DEFAULTS[key] ?? ''),
      valid: key === 'SCHEDULE_ENABLED' || cron.validate(stored[key] ?? DEFAULTS[key] ?? ''),
    }));
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updated: string[] = [];

    for (const key of SCHEDULE_KEYS) {
      if (key in body) {
        const value = String(body[key]);
        // 유효성 검사
        if (key !== 'SCHEDULE_ENABLED' && value !== 'off' && !cron.validate(value)) {
          return NextResponse.json({ error: `유효하지 않은 cron 표현식: ${value}` }, { status: 400 });
        }
        await prisma.appConfig.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
        updated.push(key);
      }
    }

    // 스케줄러 재시작
    try {
      const { restartScheduler } = await import('@/lib/cron-scheduler');
      await restartScheduler();
    } catch { /* 개발 환경에서는 무시 */ }

    return NextResponse.json({ updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
