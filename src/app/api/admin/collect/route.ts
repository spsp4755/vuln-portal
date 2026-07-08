import { NextRequest, NextResponse } from 'next/server';
import { collectNvd } from '@/lib/collectors/nvd';
import { collectEndoflife } from '@/lib/collectors/endoflife';
import { collectCisaKev } from '@/lib/collectors/cisa_kev';
import { collectEpss } from '@/lib/collectors/epss';
import { collectVulnCheck } from '@/lib/collectors/vulncheck';
import { collectKisa } from '@/lib/collectors/kisa';
import { collectGithubAdvisories } from '@/lib/collectors/github_advisory';
import { prisma } from '@/lib/prisma';
import { registerJob, finishJob, cancelJob, getRunningJobs } from '@/lib/collect-jobs';
import { getConfig } from '@/lib/config';

async function runInBackground(source: string, logId: string, task: (signal: AbortSignal) => Promise<any>) {
  const ac = registerJob(source, logId);
  try {
    const result = await task(ac.signal);
    await prisma.collectionLog.update({
      where: { id: logId },
      data: {
        completedAt:    new Date(),
        status:         'success',
        recordsFetched: (result as any)?.total   || 0,
        recordsNew:     (result as any)?.new     || 0,
        recordsUpdated: (result as any)?.updated || 0,
      },
    });
  } catch (err: any) {
    const cancelled = ac.signal.aborted;
    await prisma.collectionLog.update({
      where: { id: logId },
      data: {
        completedAt: new Date(),
        status:      cancelled ? 'cancelled' : 'failed',
        error:       err.message,
      },
    }).catch(() => {});
  } finally {
    finishJob(source);
  }
}

/** source → 수집기 함수 매핑 (runCollector를 거치지 않고 직접 호출) */
function getCollectorTask(source: string, daysBack?: number): ((signal: AbortSignal) => Promise<any>) | null {
  switch (source) {
    case 'nvd':       return (signal) => collectNvd(daysBack || 30, signal);
    case 'endoflife': return (_signal) => collectEndoflife(daysBack);
    case 'cisa_kev':  return (_signal) => collectCisaKev();
    case 'epss':      return (_signal) => collectEpss();
    case 'vulncheck': return (_signal) => collectVulnCheck();
    case 'kisa':      return (_signal) => collectKisa();
    case 'github_advisory': return (_signal) => collectGithubAdvisories(daysBack || 30);
    default:          return null;
  }
}

// GET — 현재 실행 중인 작업 목록
export async function GET() {
  return NextResponse.json(getRunningJobs());
}

// POST — 수집 시작 (즉시 logId 반환, 백그라운드 실행)
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const { source, daysBack, cancelSource } = body;

  // 중지 요청
  if (cancelSource) {
    if (cancelSource === 'all') {
      const running = getRunningJobs();
      running.forEach((j) => cancelJob(j.source));
      return NextResponse.json({ cancelled: running.length > 0, source: 'all', stopped: running.map((j) => j.source) });
    }
    const stopped = cancelJob(cancelSource);
    return NextResponse.json({ cancelled: stopped, source: cancelSource });
  }

  try {
    // 단일 수집기
    if (source) {
      let task: ((signal: AbortSignal) => Promise<any>) | null;
      if (source === 'nvd') {
        const stored = await getConfig('NVD_DAYS_BACK');
        const defaultDays = stored ? parseInt(stored, 10) || 90 : 90;
        const days = Number(daysBack) || defaultDays;
        task = (signal) => collectNvd(days, signal);
      } else {
        task = getCollectorTask(source, Number(daysBack) || undefined);
      }
      if (!task) {
        return NextResponse.json({ error: `알 수 없는 수집기: ${source}` }, { status: 400 });
      }

      const log = await prisma.collectionLog.create({
        data: { source, startedAt: new Date(), status: 'running' },
      });
      void runInBackground(source, log.id, task);
      return NextResponse.json({ logId: log.id, source, status: 'started' });
    }

    // 전체 수집 — 모든 소스 백그라운드 실행
    const sources = ['nvd', 'cisa_kev', 'endoflife', 'epss', 'vulncheck', 'kisa', 'github_advisory'];
    const logIds: string[] = [];
    for (const src of sources) {
      let task: ((signal: AbortSignal) => Promise<any>) | null;
      if (src === 'nvd') {
        // 전체 수집 시 nvd는 스케줄 수집으로 간주 → 7일
        task = (signal) => collectNvd(7, signal);
      } else {
        task = getCollectorTask(src);
      }
      if (!task) continue;
      const log = await prisma.collectionLog.create({
        data: { source: src, startedAt: new Date(), status: 'running' },
      });
      logIds.push(log.id);
      void runInBackground(src, log.id, task);
    }
    return NextResponse.json({ logIds, status: 'started' });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
