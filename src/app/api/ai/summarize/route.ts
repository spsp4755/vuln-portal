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
      console.error(`[AI] summarize: CVE 미존재 cve=${cveId}`);
      return NextResponse.json({ error: `CVE를 찾을 수 없습니다: ${cveId}` }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    const msg: string = err?.message || String(err);
    console.error(`[AI] summarize 실패 cve=${cveId}: ${msg}`);
    // API 키 미설정은 설정 문제 → 400
    if (msg.includes('설정되지 않') || msg.includes('API Key') || msg.includes('API_KEY')) {
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
