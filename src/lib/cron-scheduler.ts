/**
 * 자동 수집 스케줄러
 * Next.js instrumentation.ts 에서 서버 시작 시 호출됩니다.
 */
import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '@/lib/prisma';
import { runCollector } from '@/lib/scheduler';
import { log } from '@/lib/logger';

let initialized = false;
const activeTasks: ScheduledTask[] = [];
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * DB 예열용 하트비트.
 * 폐쇄망에서 오래 idle 후 첫 요청이 느려지는 것을 줄이기 위해
 * 5분마다 DB에 가벼운 쿼리를 보내 커넥션을 살려두고, 지연시간을 로그로 남긴다.
 */
function startHeartbeat() {
  if (heartbeatTimer) return;
  const run = async () => {
    const t0 = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const ms = Date.now() - t0;
      // DB 응답이 느리면 경고로 승격 (idle 후 재연결 지연 감지)
      if (ms > 1000) log.warn('HEARTBEAT', `DB 응답 지연 ${ms}ms — idle 재연결 가능성`);
      else log.debug('HEARTBEAT', `alive · DB ${ms}ms`);
    } catch (e: any) {
      log.error('HEARTBEAT', `DB 확인 실패: ${e.message}`);
    }
  };
  heartbeatTimer = setInterval(run, 5 * 60 * 1000);
  void run(); // 시작 직후 1회
  log.info('Scheduler', '하트비트 시작 (5분 간격 DB 예열)');
}

/** DB에서 스케줄 설정 읽기 (없으면 기본값) */
async function getScheduleConfig(): Promise<Record<string, string>> {
  const defaults: Record<string, string> = {
    SCHEDULE_ENABLED:   'true',
    SCHEDULE_NVD:       '0 */6 * * *',   // 6시간마다
    SCHEDULE_CISA_KEV:  '0 2 * * *',     // 매일 02:00
    SCHEDULE_EOL:       '0 3 * * 1',     // 매주 월요일 03:00
    SCHEDULE_EPSS:      '0 4 * * *',     // 매일 04:00 (FIRST.org, API 키 불필요)
    SCHEDULE_VULNCHECK: '0 */12 * * *',  // 12시간마다
    SCHEDULE_KISA:      '0 5 * * *',     // 매일 05:00
    SCHEDULE_GITHUB_ADVISORY: '0 6 * * *', // 매일 06:00
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

  // 하트비트는 수집 스케줄과 무관하게 항상 동작 (DB 예열 목적)
  startHeartbeat();

  const cfg = await getScheduleConfig();
  if (cfg.SCHEDULE_ENABLED !== 'true') {
    log.info('Scheduler', '자동 수집 비활성화 (하트비트만 동작)');
    return;
  }

  const jobs: Array<{ key: string; source: string; label: string }> = [
    { key: 'SCHEDULE_NVD',       source: 'nvd',       label: 'NVD' },
    { key: 'SCHEDULE_CISA_KEV',  source: 'cisa_kev',  label: 'CISA KEV' },
    { key: 'SCHEDULE_EOL',       source: 'endoflife', label: 'EndOfLife' },
    { key: 'SCHEDULE_EPSS',      source: 'epss',      label: 'EPSS' },
    { key: 'SCHEDULE_VULNCHECK', source: 'vulncheck', label: 'VulnCheck KEV' },
    { key: 'SCHEDULE_KISA',      source: 'kisa',      label: 'KISA/KNVD' },
    { key: 'SCHEDULE_GITHUB_ADVISORY', source: 'github_advisory', label: 'GitHub Advisory' },
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
