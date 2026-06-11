/**
 * 수집 작업 관리 — 서버 프로세스 내 싱글턴
 * AbortController로 진행 중 수집을 취소할 수 있다.
 */

interface RunningJob {
  source: string;
  logId: string;
  abortController: AbortController;
  startedAt: Date;
}

// module-level singleton (Next.js dev 서버 = 단일 프로세스)
const jobs = new Map<string, RunningJob>();

export function registerJob(source: string, logId: string): AbortController {
  // 같은 source가 이미 실행 중이면 먼저 중단
  const existing = jobs.get(source);
  if (existing) existing.abortController.abort('superseded');

  const ac = new AbortController();
  jobs.set(source, { source, logId, abortController: ac, startedAt: new Date() });
  return ac;
}

export function cancelJob(source: string): boolean {
  const job = jobs.get(source);
  if (!job) return false;
  job.abortController.abort('user-cancelled');
  jobs.delete(source);
  return true;
}

export function finishJob(source: string) {
  jobs.delete(source);
}

export function getRunningJobs(): { source: string; logId: string; startedAt: Date }[] {
  return Array.from(jobs.values()).map(({ source, logId, startedAt }) => ({ source, logId, startedAt }));
}

export function isRunning(source: string): boolean {
  return jobs.has(source);
}
