export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

export async function GET() {
  try {
    // EOL_CUTOFF_DAYS: 표시 기간 (기본 365일)
    const stored = await getConfig('EOL_CUTOFF_DAYS');
    const cutoffDays = stored ? Math.max(1, parseInt(stored, 10) || 365) : 365;
    const cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

    const now = new Date();
    const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, kevCount, severityCounts, recent7Days, eolExpired, eolSoon, recentKev7Days, highEpss, lastCollections] = await Promise.all([
      prisma.vulnerability.count(),
      prisma.vulnerability.count({ where: { isKev: true } }),
      prisma.cvssScore.groupBy({ by: ['baseSeverity'], _count: { baseSeverity: true } }),
      prisma.vulnerability.count({
        where: { publishedAt: { gte: since7 } },
      }),
      // cutoff 이후 만료된 제품 수
      prisma.eolData.count({
        where: { isEol: true, eolDate: { gte: cutoffDate } },
      }),
      // 30일 이내 만료 예정
      prisma.eolData.count({
        where: { isEol: false, eolDate: { gte: now, lte: in30d } },
      }),
      // 최근 7일 내 KEV에 새로 추가된 항목
      prisma.kevEntry.count({
        where: { dateAdded: { gte: since7 } },
      }),
      // EPSS 고위험(>= 0.5)
      prisma.epssScore.count({
        where: { score: { gte: 0.5 } },
      }),
      // 각 source별 마지막 성공 수집 시간
      prisma.collectionLog.findMany({
        where: { status: 'success' },
        orderBy: { completedAt: 'desc' },
        distinct: ['source'],
        select: { source: true, completedAt: true, recordsFetched: true },
      }),
    ]);

    const severityMap = Object.fromEntries(
      severityCounts.map((s) => [s.baseSeverity, s._count.baseSeverity])
    );
    const criticalCount = severityMap['CRITICAL'] || 0;

    return NextResponse.json({
      totalVulnerabilities: total,
      kevCount,
      severityCounts: severityMap,
      recent7Days,
      eolExpired,
      eolSoon,
      recentKev7Days,
      highEpss,
      criticalCount,
      lastCollections,
    });
  } catch (err: any) {
    console.error('[API] dashboard/summary error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
