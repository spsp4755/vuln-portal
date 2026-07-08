import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: { cveId: string } }
) {
  try {
    const { cveId } = params;
    if (!cveId || !/^CVE-\d{4}-\d+$/i.test(cveId)) {
      return NextResponse.json({ error: '유효하지 않은 CVE ID 형식입니다.' }, { status: 400 });
    }

    const vuln = await prisma.vulnerability.findUnique({
      where: { cveId: cveId.toUpperCase() },
      include: {
        cvssScores:     { orderBy: { version: 'desc' } },
        epssScore:      true,
        cpeMappings:    { orderBy: { vendor: 'asc' } },
        cweWeaknesses:  true,
        kevEntry:       true,
        kisaNotices:    { orderBy: { pubDate: 'desc' } },
        githubAdvisories: { orderBy: { updatedAt: 'desc' } },
        aiSummary:      true,
        exploitEntries: { orderBy: { dateAdded: 'desc' } },
      },
    });

    if (!vuln) {
      return NextResponse.json({ error: 'CVE를 찾을 수 없습니다.', cveId }, { status: 404 });
    }

    return NextResponse.json(vuln);
  } catch (err: any) {
    console.error('[API] GET /vulnerabilities/[cveId] error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
