export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runAiForCve } from '@/lib/ai/summarizer';

/**
 * POST /api/admin/ai-test
 * body: { cveId?, promptTranslate?, promptAnalyze?, temperature?, maxTokens? }
 * 저장하지 않고(persist:false) 현재(또는 입력한) 프롬프트로 1건 실행해 결과를 미리보기로 반환.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let cveId: string = (body.cveId || '').trim().toUpperCase();

  // CVE 미지정 시: KEV 등 데이터가 있는 샘플 1건 선택
  if (!cveId) {
    const sample = await prisma.vulnerability.findFirst({
      where: { kevEntry: { isNot: null } },
      orderBy: { publishedAt: 'desc' },
      select: { cveId: true },
    }) || await prisma.vulnerability.findFirst({ select: { cveId: true } });
    if (!sample) return NextResponse.json({ error: '테스트할 취약점 데이터가 없습니다. 먼저 수집을 실행하세요.' }, { status: 400 });
    cveId = sample.cveId;
  }

  const overrides: Record<string, string> = {};
  if (typeof body.promptTranslate === 'string' && body.promptTranslate.trim()) overrides.AI_PROMPT_TRANSLATE = body.promptTranslate;
  if (typeof body.promptAnalyze === 'string' && body.promptAnalyze.trim()) overrides.AI_PROMPT_ANALYZE = body.promptAnalyze;
  if (body.temperature !== undefined && body.temperature !== '') overrides.AI_TEMPERATURE = String(body.temperature);
  if (body.maxTokens !== undefined && body.maxTokens !== '') overrides.AI_MAX_TOKENS = String(body.maxTokens);

  try {
    const r = await runAiForCve(cveId, { persist: false, overrides });
    if (!r) return NextResponse.json({ error: `CVE를 찾을 수 없습니다: ${cveId}` }, { status: 404 });
    return NextResponse.json({ cveId, ...r });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[AI] ai-test 실패 cve=${cveId}: ${msg}`);
    return NextResponse.json({ error: msg, cveId }, { status: 400 });
  }
}
