import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateAiSummary } from '@/lib/ai/summarizer';

/**
 * POST /api/ai/translate-batch
 * body: { cveIds: string[], force?: boolean }
 *
 * 현재 목록 페이지의 CVE들을 일괄로 한국어 번역 + AI 분석한다.
 * - 동시 2건씩 순차 처리 (폐쇄망 LLM 과부하 방지)
 * - 이미 번역(description.ko)된 건은 스킵 (force=true면 재생성)
 * 반환: { results: { [cveId]: { descriptionKo, aiSummary } }, done, skipped, failed }
 */
const CONCURRENCY = 2;

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }

  const cveIds: string[] = Array.isArray(body?.cveIds) ? body.cveIds.filter((x: any) => typeof x === 'string') : [];
  const force = body?.force === true;
  if (!cveIds.length) return NextResponse.json({ error: 'cveIds가 필요합니다.' }, { status: 400 });
  if (cveIds.length > 50) return NextResponse.json({ error: '한 번에 최대 50건까지 처리합니다.' }, { status: 400 });

  console.log(`[AI] batch 시작 count=${cveIds.length} force=${force}`);

  // 이미 번역된 건 식별 (force가 아니면 스킵)
  const existing = await prisma.vulnerability.findMany({
    where: { cveId: { in: cveIds } },
    select: { cveId: true, description: true },
  });
  const alreadyKo = new Set(
    existing
      .filter((v) => { const ko = (v.description as any)?.ko; return ko && String(ko).trim(); })
      .map((v) => v.cveId)
  );

  const targets = force ? cveIds : cveIds.filter((id) => !alreadyKo.has(id));
  const results: Record<string, any> = {};
  let done = 0, failed = 0;
  const skipped = cveIds.length - targets.length;

  // 동시 CONCURRENCY 건씩 순차 배치
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (cveId) => {
      try {
        const r = await generateAiSummary(cveId);
        if (r) { results[cveId] = r; done++; }
        else { failed++; }
      } catch (e: any) {
        failed++;
        results[cveId] = { error: e?.message || String(e) };
        console.error(`[AI] batch 항목 실패 cve=${cveId}: ${e?.message || e}`);
      }
    }));
  }

  console.log(`[AI] batch 완료 done=${done} skipped=${skipped} failed=${failed}`);
  return NextResponse.json({ results, done, skipped, failed, total: cveIds.length });
}
