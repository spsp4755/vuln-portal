export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '90';
    const days = Math.min(365, Math.max(7, parseInt(range, 10)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // KEV 월별: range에 맞게 개월 수 조정
    const kevMonths = days <= 30 ? 3 : days <= 90 ? 6 : 12;
    const kevSince = new Date(Date.now() - kevMonths * 30 * 24 * 60 * 60 * 1000);

    const [
      dailyRaw,
      severityDist,
      topVendorsRaw,
      topProductsRaw,
      cweRaw,
      kevMonthlyRaw,
      cvssDistRaw,
      attackVectorRaw,
      totalVulns,
      totalVulnsRange,
      totalKev,
      totalKevRange,
      avgCvssRaw,
      avgCvssRangeRaw,
      topEpssRaw,
      collectionStats,
    ] = await Promise.all([
      // 1. 일별 신규 취약점
      prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT DATE_TRUNC('day', "published_at") AS day, COUNT(*) AS count
        FROM vulnerability
        WHERE published_at >= ${since}
        GROUP BY day ORDER BY day ASC
      `,

      // 2. 심각도 분포 — range 내 CVE만
      prisma.$queryRaw<{ severity: string; count: bigint }[]>`
        SELECT cs."base_severity" AS severity, COUNT(*) AS count
        FROM cvss_score cs
        JOIN vulnerability v ON v.id = cs."vulnerability_id"
        WHERE cs.version = '3.1'
          AND v."published_at" >= ${since}
        GROUP BY severity
      `,

      // 3. 상위 벤더 — range 내 CVE만
      prisma.$queryRaw<{ vendor: string; count: bigint }[]>`
        SELECT cm.vendor, COUNT(DISTINCT cm."vulnerability_id") AS count
        FROM cpe_mapping cm
        JOIN vulnerability v ON v.id = cm."vulnerability_id"
        WHERE cm.vendor != '' AND cm.vendor != '*'
          AND v."published_at" >= ${since}
        GROUP BY cm.vendor ORDER BY count DESC LIMIT 15
      `,

      // 4. 상위 제품
      prisma.$queryRaw<{ vendor: string; product: string; count: bigint }[]>`
        SELECT cm.vendor, cm.product, COUNT(DISTINCT cm."vulnerability_id") AS count
        FROM cpe_mapping cm
        JOIN vulnerability v ON v.id = cm."vulnerability_id"
        WHERE cm.product != '' AND cm.product != '*'
          AND v."published_at" >= ${since}
        GROUP BY cm.vendor, cm.product ORDER BY count DESC LIMIT 10
      `,

      // 5. CWE — range 내 CVE만
      prisma.$queryRaw<{ cwe_id: string; name: string; count: bigint }[]>`
        SELECT cw."cwe_id", cw.name, COUNT(DISTINCT cw."vulnerability_id") AS count
        FROM cwe_weakness cw
        JOIN vulnerability v ON v.id = cw."vulnerability_id"
        WHERE cw."cwe_id" != 'NVD-CWE-Other' AND cw."cwe_id" != 'NVD-CWE-noinfo'
          AND v."published_at" >= ${since}
        GROUP BY cw."cwe_id", cw.name ORDER BY count DESC LIMIT 10
      `,

      // 6. KEV 월별 추이 — range에 맞는 개월 수
      prisma.$queryRaw<{ month: string; count: bigint }[]>`
        SELECT TO_CHAR("date_added", 'YYYY-MM') AS month, COUNT(*) AS count
        FROM kev_entry
        WHERE date_added IS NOT NULL AND date_added >= ${kevSince}
        GROUP BY month ORDER BY month ASC
      `,

      // 7. CVSS 점수 구간 — range 내 CVE만
      prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
        SELECT
          CASE
            WHEN cs."base_score" < 4.0 THEN '0-3.9 (LOW)'
            WHEN cs."base_score" < 7.0 THEN '4.0-6.9 (MEDIUM)'
            WHEN cs."base_score" < 9.0 THEN '7.0-8.9 (HIGH)'
            ELSE '9.0-10 (CRITICAL)'
          END AS bucket,
          COUNT(*) AS count
        FROM cvss_score cs
        JOIN vulnerability v ON v.id = cs."vulnerability_id"
        WHERE cs.version = '3.1' AND v."published_at" >= ${since}
        GROUP BY bucket ORDER BY bucket ASC
      `,

      // 8. 공격 벡터 — range 내 CVE만
      prisma.$queryRaw<{ attack_vector: string; count: bigint }[]>`
        SELECT cs."attack_vector", COUNT(*) AS count
        FROM cvss_score cs
        JOIN vulnerability v ON v.id = cs."vulnerability_id"
        WHERE cs.version = '3.1'
          AND cs."attack_vector" IS NOT NULL
          AND v."published_at" >= ${since}
        GROUP BY cs."attack_vector" ORDER BY count DESC
      `,

      // 9. 전체 통계 (누적)
      prisma.vulnerability.count(),
      // 9b. range 내 신규
      prisma.vulnerability.count({ where: { publishedAt: { gte: since } } }),
      prisma.vulnerability.count({ where: { isKev: true } }),
      // 9d. range 내 KEV
      prisma.vulnerability.count({ where: { isKev: true, publishedAt: { gte: since } } }),

      // 평균 CVSS 전체
      prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT AVG("base_score")::float AS avg FROM cvss_score WHERE version = '3.1'
      `,
      // 평균 CVSS range
      prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT AVG(cs."base_score")::float AS avg
        FROM cvss_score cs
        JOIN vulnerability v ON v.id = cs."vulnerability_id"
        WHERE cs.version = '3.1' AND v."published_at" >= ${since}
      `,

      // 10. EPSS 상위 10 — range 내 CVE만
      prisma.$queryRaw<{
        cve_id: string; score: number; percentile: number | null;
        severity: string | null; cvss_score: number | null; published_at: Date | null;
      }[]>`
        SELECT
          v."cve_id",
          e.score,
          e.percentile,
          cs."base_severity" AS severity,
          cs."base_score" AS cvss_score,
          v."published_at"
        FROM epss_score e
        JOIN vulnerability v ON v.id = e."vulnerability_id"
        LEFT JOIN cvss_score cs ON cs."vulnerability_id" = v.id AND cs.version = '3.1'
        WHERE v."published_at" >= ${since}
        ORDER BY e.score DESC
        LIMIT 10
      `,

      // 11. 수집 현황
      prisma.$queryRaw<{ source: string; runs: bigint; last_run: string; total_fetched: bigint }[]>`
        SELECT
          source,
          COUNT(*) AS runs,
          MAX("started_at") AS last_run,
          SUM("records_fetched") AS total_fetched
        FROM collection_log
        WHERE status = 'success'
        GROUP BY source ORDER BY last_run DESC
      `,
    ]);

    const serialize = (arr: any[]) =>
      arr.map((r) => {
        const out: any = {};
        for (const k of Object.keys(r)) {
          out[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k];
        }
        return out;
      });

    return NextResponse.json({
      range: days,
      daily: serialize(dailyRaw).map((r: any) => ({
        day: r.day?.toISOString?.()?.slice(0, 10) ?? r.day,
        count: r.count,
      })),
      severity: serialize(severityDist).map((r: any) => ({ severity: r.severity, count: r.count })),
      topVendors:   serialize(topVendorsRaw),
      topProducts:  serialize(topProductsRaw),
      cwe:          serialize(cweRaw),
      kevMonthly:   serialize(kevMonthlyRaw),
      cvssDist:     serialize(cvssDistRaw),
      attackVector: serialize(attackVectorRaw),
      totals: {
        vulnerabilities:      totalVulns,
        vulnerabilitiesRange: totalVulnsRange,
        kev:                  totalKev,
        kevRange:             totalKevRange,
        avgCvss:      avgCvssRaw[0]?.avg      ? Math.round((avgCvssRaw[0].avg as number) * 10) / 10      : null,
        avgCvssRange: avgCvssRangeRaw[0]?.avg ? Math.round((avgCvssRangeRaw[0].avg as number) * 10) / 10 : null,
      },
      topEpss: serialize(topEpssRaw).map((r: any) => ({
        cveId:       r.cve_id,
        score:       r.score,
        percentile:  r.percentile,
        severity:    r.severity,
        cvssScore:   r.cvss_score,
        publishedAt: r.published_at instanceof Date ? r.published_at.toISOString().slice(0, 10) : r.published_at,
      })),
      collectionStats: serialize(collectionStats).map((r: any) => ({
        ...r,
        last_run: r.last_run instanceof Date ? r.last_run.toISOString() : r.last_run,
      })),
    });
  } catch (err: any) {
    console.error('[API] analytics error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
