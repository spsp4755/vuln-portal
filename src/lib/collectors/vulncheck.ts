/**
 * VulnCheck 수집기 — KEV 확장 데이터
 * API: https://api.vulncheck.com/v3/index/vulncheck-kev
 * https://docs.vulncheck.com/community/vulncheck-kev/schema
 */
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

const API_BASE = 'https://api.vulncheck.com/v3';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface VcKevRecord {
  cve: string[];                      // CVE ID 배열
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  shortDescription?: string;
  required_action?: string;
  dueDate?: string;
  cisa_date_added?: string;
  date_added?: string;
  knownRansomwareCampaignUse?: string;
  cwes?: string[];
}

export async function collectVulnCheck() {
  const apiKey = await getConfig('VULNCHECK_API_KEY');
  if (!apiKey) {
    throw new Error('VULNCHECK_API_KEY가 설정되지 않았습니다.');
  }

  console.log('[VulnCheck] /v3/index/vulncheck-kev 수집 시작');

  let cursor: string | null = null;
  let totalFetched = 0;
  let updatedCount = 0;

  while (true) {
    const url: string = cursor
      ? `${API_BASE}/index/vulncheck-kev?cursor=${encodeURIComponent(cursor)}&limit=500`
      : `${API_BASE}/index/vulncheck-kev?limit=500`;

    const resp: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      // 403 = 플랜 미지원, graceful skip
      if (resp.status === 403) {
        console.warn('[VulnCheck] KEV 인덱스 접근 권한 없음 (플랜 확인 필요). 건너뜁니다.');
        break;
      }
      throw new Error(`VulnCheck KEV ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data: any = await resp.json();
    const items: VcKevRecord[] = data?.data ?? [];
    totalFetched += items.length;

    for (const item of items) {
      const cveIds: string[] = Array.isArray(item.cve) ? item.cve : (item.cve ? [item.cve as any] : []);

      for (const cveId of cveIds) {
        const vuln = await prisma.vulnerability.findUnique({ where: { cveId } });
        if (!vuln) continue;

        const dateAdded = item.cisa_date_added ?? item.date_added;

        await prisma.kevEntry.upsert({
          where:  { vulnerabilityId: vuln.id },
          create: {
            vulnerabilityId:    vuln.id,
            vendorProject:      item.vendorProject    ?? '',
            product:            item.product          ?? '',
            vulnerabilityName:  item.vulnerabilityName ?? '',
            dateAdded:          dateAdded ? new Date(dateAdded) : new Date(),
            shortDescription:   item.shortDescription ?? '',
            requiredAction:     item.required_action  ?? '',
            dueDate:            item.dueDate ? new Date(item.dueDate) : null,
            knownRansomwareUse: item.knownRansomwareCampaignUse ?? 'Unknown',
            notes:              '',
          },
          update: {
            dueDate:            item.dueDate ? new Date(item.dueDate) : undefined,
            knownRansomwareUse: item.knownRansomwareCampaignUse ?? undefined,
            requiredAction:     item.required_action             ?? undefined,
          },
        });

        // isKev 플래그 갱신
        await prisma.vulnerability.update({
          where: { id: vuln.id },
          data:  { isKev: true },
        });

        updatedCount++;
      }
    }

    console.log(`[VulnCheck] ${totalFetched}건 처리, KEV 업데이트 ${updatedCount}건`);

    cursor = data?._meta?.next_cursor ?? null;
    if (!cursor || !items.length) break;
    await sleep(200);
  }

  console.log(`[VulnCheck] 완료. total=${totalFetched} updated=${updatedCount}`);
  return { total: totalFetched, updated: updatedCount };
}
