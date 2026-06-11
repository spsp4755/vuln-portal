/**
 * 자동 수집 스케줄러
 * Next.js instrumentation.ts 에서 서버 시작 시 호출됩니다.
 */
import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '@/lib/prisma';
import { runCollector } from '@/lib/scheduler';

let initialized = false;
const activeTasks: ScheduledTask[] = [];

/** DB에서 스케줄 설정 읽기 (없으면 기본값) */
async function getScheduleConfig(): Promise<Record<string, string>> {
  const defaults: Record<string, string> = {
    SCHEDULE_ENABLED:   'true',
    SCHEDULE_NVD:       '0 */6 * * *',   // 6시간마다
    SCHEDULE_CISA_KEV:  '0 2 * * *',     // 매일 02:00
    SCHEDULE_EOL:       '0 3 * * 1',     // 매주 월요일 03:00
    SCHEDULE_EPSS:      '0 4 * * *',     // 매일 04:00 (FIRST.org, API 키 불필요)
    SCHEDULE_VULNCHECK: '0 */12 * * *',  // 12시간마다
  };
  try {
    const keys = Object.keys(defaults);
    const rows = await prisma.appConfig.findMany({ where: { key: { in: keys } } });
    const stored: Record<string, string> = {};
    for (const r of rows) stored[r.key] = r.value;
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

/** 스케줄러 시작 */
export async function startScheduler() {
  if (initialized) return;
  initialized = true;

  const cfg = await getScheduleConfig();
  if (cfg.SCHEDULE_ENABLED !== 'true') {
    console.log('[Scheduler] Auto-collection disabled');
    return;
  }

  const jobs: Array<{ key: string; source: string; label: string }> = [
    { key: 'SCHEDULE_NVD',       source: 'nvd',       label: 'NVD' },
    { key: 'SCHEDULE_CISA_KEV',  source: 'cisa_kev',  label: 'CISA KEV' },
    { key: 'SCHEDULE_EOL',       source: 'endoflife', label: 'EndOfLife' },
    { key: 'SCHEDULE_EPSS',      source: 'epss',      label: 'EPSS' },
    { key: 'SCHEDULE_VULNCHECK', source: 'vulncheck', label: 'VulnCheck KEV' },
  ];

  for (const job of jobs) {
    const expr = cfg[job.key];
    if (!expr || expr === 'off') continue;
    if (!cron.validate(expr)) {
      console.warn(`[Scheduler] Invalid cron expression for ${job.label}: ${expr}`);
      continue;
    }

    const task = cron.schedule(expr, async () => {
      console.log(`[Scheduler] Starting ${job.label} collection...`);
      try {
        const result = await runCollector(job.source);
        console.log(`[Scheduler] ${job.label} done:`, result);
      } catch (e: any) {
        console.error(`[Scheduler] ${job.label} failed:`, e.message);
      }
    }, { timezone: 'Asia/Seoul' });

    activeTasks.push(task);
    console.log(`[Scheduler] ${job.label} scheduled: ${expr}`);
  }
}

/** 현재 활성 스케줄 개수 */
export function getActiveTaskCount() {
  return activeTasks.length;
}

/** 스케줄러 재시작 (설정 변경 후 호출) */
export async function restartScheduler() {
  for (const t of activeTasks) t.stop();
  activeTasks.length = 0;
  initialized = false;
  await startScheduler();
}
