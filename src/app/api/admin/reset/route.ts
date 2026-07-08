import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ALLOWED_SOURCES = ['eol', 'endoflife', 'nvd', 'cisa_kev', 'epss', 'vulncheck', 'kisa', 'github_advisory', 'all'] as const;

// POST /api/admin/reset  body: { source: 'eol' | 'nvd' | ... | 'all' }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const source = body.source as string;

  if (!ALLOWED_SOURCES.includes(source as any)) {
    return NextResponse.json({ error: `지원하지 않는 소스: ${source}` }, { status: 400 });
  }

  try {
    const result: Record<string, number> = {};

    if (source === 'eol' || source === 'endoflife' || source === 'all') {
      const { count } = await prisma.eolData.deleteMany({});
      result.eolData = count;
    }

    if (source === 'nvd' || source === 'all') {
      // 연관 데이터 먼저 삭제 (FK 제약)
      const { count: ghsa } = await prisma.githubAdvisory.deleteMany({});
      const { count: kisa } = await prisma.kisaNotice.deleteMany({});
      const { count: cvss } = await prisma.cvssScore.deleteMany({});
      const { count: cpe }  = await prisma.cpeMapping.deleteMany({});
      const { count: cwe }  = await prisma.cweWeakness.deleteMany({});
      const { count: epss } = await prisma.epssScore.deleteMany({});
      const { count: kev }  = source === 'all'
        ? await prisma.kevEntry.deleteMany({})
        : { count: 0 };
      const { count: vuln } = await prisma.vulnerability.deleteMany({});
      result.vulnerabilities = vuln;
      result.cvssScores = cvss;
      result.cpeMappings = cpe;
      result.cweWeaknesses = cwe;
      result.epssScores = epss;
      result.githubAdvisories = ghsa;
      result.kisaNotices = kisa;
      if (source === 'all') result.kevEntries = kev;
    }

    if (source === 'cisa_kev') {
      const { count } = await prisma.kevEntry.deleteMany({});
      result.kevEntries = count;
    }

    if (source === 'epss') {
      const { count } = await prisma.epssScore.deleteMany({});
      result.epssScores = count;
    }

    if (source === 'vulncheck') {
      // VulnCheck KEV는 kevEntry 테이블에 데이터 보강 — isKev 플래그 초기화
      const { count } = await prisma.vulnerability.updateMany({
        data: { isKev: false },
      });
      // kevEntry도 삭제
      const { count: kev } = await prisma.kevEntry.deleteMany({});
      result.kevEntriesCleared = kev;
      result.vulnsIsKevReset = count;
    }

    if (source === 'kisa') {
      const { count } = await prisma.kisaNotice.deleteMany({});
      result.kisaNotices = count;
    }

    if (source === 'github_advisory') {
      const { count } = await prisma.githubAdvisory.deleteMany({});
      result.githubAdvisories = count;
    }

    // 수집 로그는 항상 남겨둠 (히스토리 보존)

    console.log(`[Reset] source=${source}`, result);
    return NextResponse.json({ ok: true, deleted: result });
  } catch (err: any) {
    console.error('[Reset] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
