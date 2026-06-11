/**
 * EPSS 수집기 — FIRST.org 공식 무료 API
 * https://api.first.org/data/v1/epss
 * API 키 불필요, 완전 무료
 */
import { prisma } from '@/lib/prisma';

const FIRST_API = 'https://api.first.org/data/v1/epss';
const BATCH = 100; // FIRST.org URL 길이 제한: 한 번에 최대 100개 CVE

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function collectEpss() {
  const allCves = await prisma.vulnerability.findMany({
    select: { id: true, cveId: true },
  });

  if (!allCves.length) {
    console.log('[EPSS] 수집된 취약점 없음 — 먼저 NVD를 수집하세요.');
    return { total: 0, updated: 0 };
  }

  const cveMap = new Map(allCves.map((c) => [c.cveId, c.id]));
  const cveIds = allCves.map((c) => c.cveId);

  console.log(`[EPSS] FIRST.org API로 ${cveIds.length}건 EPSS 점수 조회 시작`);

  let updatedCount = 0;
  let totalFetched = 0;

  for (let i = 0; i < cveIds.length; i += BATCH) {
    const batch = cveIds.slice(i, i + BATCH);
    const url = `${FIRST_API}?cve=${batch.join(',')}&limit=${batch.length}`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`FIRST.org EPSS ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    if (data['status-code'] !== 200) {
      throw new Error(`FIRST.org EPSS 오류: ${data.status}`);
    }

    for (const item of data.data || []) {
      const vulnId = cveMap.get(item.cve);
      if (!vulnId) continue;

      await prisma.epssScore.upsert({
        where: { vulnerabilityId: vulnId },
        create: {
          vulnerabilityId: vulnId,
          score: parseFloat(item.epss) || 0,
          percentile: parseFloat(item.percentile) || 0,
          collectedAt: new Date(),
        },
        update: {
          score: parseFloat(item.epss) || 0,
          percentile: parseFloat(item.percentile) || 0,
          collectedAt: new Date(),
        },
      });
      updatedCount++;
    }

    totalFetched += data.data?.length || 0;
    console.log(`[EPSS] ${Math.min(i + BATCH, cveIds.length)} / ${cveIds.length} CVE 처리 완료 (업데이트: ${updatedCount}건)`);

    if (i + BATCH < cveIds.length) await sleep(300);
  }

  console.log(`[EPSS] 완료. 조회=${totalFetched} 업데이트=${updatedCount}`);
  return { total: totalFetched, updated: updatedCount };
}
