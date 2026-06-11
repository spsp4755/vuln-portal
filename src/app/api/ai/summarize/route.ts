import { NextResponse } from 'next/server';
import { generateAiSummary, calculatePriorityScore } from '@/lib/ai/summarizer';
import { prisma } from '@/lib/prisma';

// POST /api/ai/summarize
export async function POST(req: Request) {
  const { cveId } = await req.json();

  if (!cveId) {
    return NextResponse.json({ error: 'cveId required' }, { status: 400 });
  }

  try {
    const result = await generateAiSummary(cveId);
    if (!result) {
      return NextResponse.json({ error: 'AI 요약 생성 실패' }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    const msg: string = err.message || '';
    // API 키 미설정은 클라이언트 오류(설정 문제) → 400
    if (msg.includes('설정되지 않았') || msg.includes('API_KEY') || msg.includes('not set')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/ai/priority
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cveId = searchParams.get('cveId');

  if (cveId) {
    const vuln = await prisma.vulnerability.findUnique({
      where: { cveId },
      include: { cvssScores: true, epssScore: true, kevEntry: true },
    });
    if (!vuln) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const score = calculatePriorityScore(vuln);
    return NextResponse.json({ cveId, score });
  }

  // Return top priority CVEs
  const vulns = await prisma.vulnerability.findMany({
    take: 50,
    orderBy: { publishedAt: 'desc' },
    include: { cvssScores: true, epssScore: true, kevEntry: true },
  });

  const scored = vulns
    .map((v) => ({ cveId: v.cveId, score: calculatePriorityScore(v) }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json(scored);
}
