export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // EOL_CUTOFF_DAYS: 표시 기간 (기본 365일)
    const stored = await getConfig('EOL_CUTOFF_DAYS');
    const cutoffDays = stored ? Math.max(1, parseInt(stored, 10) || 365) : 365;
    const cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

    // ── EOL 필터 파라미터 ────────────────────────────────────
    const eolStatus  = searchParams.get('eolStatus')  || 'all';   // all | expired | upcoming
    const eolDays    = Math.min(365, Math.max(7, parseInt(searchParams.get('eolDays') || '90', 10)));
    const eolSearch  = searchParams.get('eolSearch')  || '';
    const eolSort    = searchParams.get('eolSort')    || 'date';   // date | product

    // ── KEV 필터 파라미터 ────────────────────────────────────
    const kevSeverity   = searchParams.get('kevSeverity')   || 'all';  // all | CRITICAL | HIGH
    const kevOverdue    = searchParams.get('kevOverdue')     === '1';
    const kevSort       = searchParams.get('kevSort')        || 'due';  // due | severity | published
    const kevLimit      = Math.min(100, Math.max(10, parseInt(searchParams.get('kevLimit') || '30', 10)));

    // ── CVSS 필터 파라미터 ───────────────────────────────────
    const cvssMinScore  = parseFloat(searchParams.get('cvssMin') || '9.0');
    const cvssDays      = Math.min(30, Math.max(1, parseInt(searchParams.get('cvssDays') || '7', 10)));

    const now   = new Date();
    const inXd  = new Date(Date.now() + eolDays * 24 * 60 * 60 * 1000);

    // ── EOL 쿼리 조건 ────────────────────────────────────────
    type EolWhereClause = {
      OR: Array<Record<string, unknown>>;
      product?: { contains: string; mode?: 'insensitive' };
    };
    const eolWhere: EolWhereClause = { OR: [] };

    // eolDays 범위의 과거 경계 (만료 항목도 eolDays 이내만 표시)
    const pastBound = new Date(Date.now() - eolDays * 24 * 60 * 60 * 1000);

    if (eolStatus === 'all') {
      eolWhere.OR = [
        // 최근 eolDays 내 만료된 항목 (isEol or eolDate 지남)
        { isEol: true,  eolDate: { gte: pastBound } },
        { isEol: false, eolDate: { lt: now, gte: pastBound } },
        // 향후 eolDays 내 만료 임박 항목
        { isEol: false, eolDate: { gte: now, lte: inXd } },
      ];
    } else if (eolStatus === 'expired') {
      eolWhere.OR = [
        { isEol: true,  eolDate: { gte: cutoffDate } },
        { isEol: false, eolDate: { lt: now, gte: cutoffDate } },
      ];
    } else {
      // upcoming only
      eolWhere.OR = [
        { isEol: false, eolDate: { gte: now, lte: inXd } },
      ];
    }

    if (eolSearch.trim()) {
      eolWhere.product = { contains: eolSearch.trim(), mode: 'insensitive' };
    }

    // ── KEV 쿼리 조건 ────────────────────────────────────────
    type KevWhereClause = {
      isKev: boolean;
      cvssScores: { some: { baseSeverity: { in: string[] } } };
      kevEntry?: { dueDate: { lt: Date } };
    };
    const kevWhere: KevWhereClause = {
      isKev: true,
      cvssScores: {
        some: {
          baseSeverity: {
            in: kevSeverity === 'CRITICAL' ? ['CRITICAL']
              : kevSeverity === 'HIGH'     ? ['HIGH']
              : ['CRITICAL', 'HIGH'],
          },
        },
      },
    };
    if (kevOverdue) {
      kevWhere.kevEntry = { dueDate: { lt: now } };
    }

    const [kevRaw, eolData, recentHighCvss, overdueKev] = await Promise.all([
      prisma.vulnerability.findMany({
        where: kevWhere,
        include: {
          cvssScores: { orderBy: { version: 'desc' } },
          kevEntry: true,
        },
        take: kevLimit,
        orderBy: { publishedAt: 'desc' },
      }),

      prisma.eolData.findMany({
        where: eolWhere,
        // 정렬은 JS-side에서 처리 (임박 우선 → 만료 나중)
      }),

      prisma.vulnerability.findMany({
        where: {
          publishedAt: { gte: new Date(Date.now() - cvssDays * 24 * 60 * 60 * 1000) },
          cvssScores: { some: { baseScore: { gte: cvssMinScore } } },
        },
        include: { cvssScores: { orderBy: { version: 'desc' } }, kevEntry: true },
        take: 15,
        orderBy: { publishedAt: 'desc' },
      }),

      prisma.vulnerability.count({
        where: {
          isKev: true,
          kevEntry: { dueDate: { lt: now } },
        },
      }),
    ]);

    // ── KEV 클라이언트-사이드 정렬 ──────────────────────────
    const kevCritical = kevRaw.sort((a, b) => {
      if (kevSort === 'severity') {
        const order = { CRITICAL: 0, HIGH: 1 };
        const sa = (order as any)[a.cvssScores[0]?.baseSeverity ?? ''] ?? 9;
        const sb = (order as any)[b.cvssScores[0]?.baseSeverity ?? ''] ?? 9;
        return sa !== sb ? sa - sb : (a.kevEntry?.dueDate ?? '') < (b.kevEntry?.dueDate ?? '') ? -1 : 1;
      }
      if (kevSort === 'published') {
        return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
      }
      // due (기한 임박 순, 기본)
      const da = a.kevEntry?.dueDate ? new Date(a.kevEntry.dueDate).getTime() : Infinity;
      const db = b.kevEntry?.dueDate ? new Date(b.kevEntry.dueDate).getTime() : Infinity;
      return da - db;
    });

    // EOL 정렬: 임박(가까운 순 ASC) 먼저, 만료(최근 만료 DESC) 나중
    const sortedEol = eolSort === 'product'
      ? eolData.sort((a, b) => (a.product ?? '').localeCompare(b.product ?? ''))
      : eolData.sort((a, b) => {
          const aDate = a.eolDate ? new Date(a.eolDate).getTime() : null;
          const bDate = b.eolDate ? new Date(b.eolDate).getTime() : null;
          const nowMs = now.getTime();
          const aExpired = aDate !== null && aDate < nowMs;
          const bExpired = bDate !== null && bDate < nowMs;
          // 임박 항목끼리: 가까운 것 먼저 (ASC)
          if (!aExpired && !bExpired) return (aDate ?? Infinity) - (bDate ?? Infinity);
          // 만료 항목끼리: 최근 만료 먼저 (DESC)
          if (aExpired && bExpired) return (bDate ?? 0) - (aDate ?? 0);
          // 임박이 만료보다 앞에
          return aExpired ? 1 : -1;
        });

    return NextResponse.json({
      kevCritical,
      eolDueSoon: sortedEol,
      recentHighCvss,
      stats: {
        overdueKev,
        kevCriticalCount: kevRaw.length,
        eolCount:     eolData.filter(e => e.isEol || (e.eolDate && new Date(e.eolDate) < now)).length,
        eolSoonCount: eolData.filter(e => !e.isEol && e.eolDate && new Date(e.eolDate) >= now).length,
      },
      meta: { eolDays, eolStatus, kevSeverity, kevOverdue, kevSort, cvssMinScore, cvssDays },
    });
  } catch (err: any) {
    console.error('[API] action-items error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
