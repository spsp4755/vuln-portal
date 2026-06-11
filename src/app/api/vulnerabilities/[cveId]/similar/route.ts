import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { cveId: string } }
) {
  try {
    const { cveId } = params;

    // 현재 CVE 정보 조회
    const vuln = await prisma.vulnerability.findUnique({
      where: { cveId: cveId.toUpperCase() },
      include: {
        cweWeaknesses: true,
        cpeMappings:   { take: 5 },
        cvssScores:    { where: { version: '3.1' }, take: 1 },
      },
    });

    if (!vuln) return NextResponse.json([], { status: 200 });

    const cweIds  = vuln.cweWeaknesses.map((w) => w.cweId);
    const vendors = Array.from(new Set(vuln.cpeMappings.map((c) => c.vendor).filter(Boolean)));

    // 같은 CWE 취약점
    const byCwe = cweIds.length > 0
      ? await prisma.vulnerability.findMany({
          where: {
            cveId: { not: cveId.toUpperCase() },
            cweWeaknesses: { some: { cweId: { in: cweIds } } },
          },
          include: { cvssScores: { where: { version: '3.1' }, take: 1 }, kevEntry: true },
          orderBy: { publishedAt: 'desc' },
          take: 5,
        })
      : [];

    // 같은 벤더 최신 취약점
    const byVendor = vendors.length > 0
      ? await prisma.vulnerability.findMany({
          where: {
            cveId: { not: cveId.toUpperCase() },
            cpeMappings: { some: { vendor: { in: vendors } } },
          },
          include: { cvssScores: { where: { version: '3.1' }, take: 1 }, kevEntry: true },
          orderBy: { publishedAt: 'desc' },
          take: 5,
        })
      : [];

    // 중복 제거 및 포맷
    const seen = new Set<string>();
    const format = (list: typeof byCwe, reason: string) =>
      list.flatMap((v) => {
        if (seen.has(v.cveId)) return [];
        seen.add(v.cveId);
        return [{
          cveId:       v.cveId,
          publishedAt: v.publishedAt,
          severity:    v.cvssScores[0]?.baseSeverity ?? null,
          score:       v.cvssScores[0]?.baseScore ?? null,
          isKev:       v.isKev,
          reason,
        }];
      });

    return NextResponse.json([
      ...format(byCwe,    'CWE 동일'),
      ...format(byVendor, '벤더 동일'),
    ]);
  } catch (err: any) {
    console.error('[API] similar error:', err);
    return NextResponse.json([], { status: 200 });
  }
}
