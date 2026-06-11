/**
 * VulnCheck XDB 수집기 — 공개 익스플로잇/PoC 인덱스
 * API: https://api.vulncheck.com/v3/index/xdb
 * https://docs.vulncheck.com/community
 *
 * 폐쇄망 OK: 데이터는 api.vulncheck.com에서만 가져옴
 * (실제 GitHub 코드는 가져오지 않음 — 메타데이터만)
 */
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

const API_BASE = 'https://api.vulncheck.com/v3';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface XdbRecord {
  xdb_id: string;
  xdb_url: string;
  date_added?: string;
  exploit_type?: string;
  clone_ssh_url?: string;
  cve_list?: string[];       // 연관 CVE 배열
  // aliases 형태일 수도 있음
  aliases?: string[];
}

export async function collectXdb() {
  const apiKey = await getConfig('VULNCHECK_API_KEY');
  if (!apiKey) {
    throw new Error('VULNCHECK_API_KEY가 설정되지 않았습니다.');
  }

  console.log('[XDB] /v3/index/xdb 수집 시작');

  let cursor: string | null = null;
  let totalFetched = 0;
  let savedCount = 0;

  while (true) {
    const url: string = cursor
      ? `${API_BASE}/index/xdb?cursor=${encodeURIComponent(cursor)}&limit=500`
      : `${API_BASE}/index/xdb?limit=500`;

    const resp: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      if (resp.status === 402 || resp.status === 403) {
        // 402 = 유료 플랜 필요 (Exploit & Vulnerability Intelligence), 403 = 접근 거부
        console.warn(`[XDB] ${resp.status}: XDB 인덱스는 유료 플랜(Exploit & Vulnerability Intelligence)이 필요합니다. Community 티어에서는 사용 불가. 건너뜁니다.`);
        return { total: 0, new: 0, skipped: true, reason: `XDB는 유료 플랜 전용입니다 (HTTP ${resp.status})` };
      }
      throw new Error(`VulnCheck XDB ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data: any = await resp.json();
    const items: XdbRecord[] = data?.data ?? [];
    totalFetched += items.length;

    for (const item of items) {
      // CVE 목록 추출 (cve_list 또는 aliases 필드)
      const cveIds: string[] = item.cve_list ?? item.aliases ?? [];

      for (const cveId of cveIds) {
        if (!cveId.match(/^CVE-\d{4}-\d+$/i)) continue;

        const vuln = await prisma.vulnerability.findUnique({
          where: { cveId: cveId.toUpperCase() },
        });
        if (!vuln) continue;

        await prisma.exploitEntry.upsert({
          where: {
            vulnerabilityId_xdbId: {
              vulnerabilityId: vuln.id,
              xdbId: item.xdb_id,
            },
          },
          create: {
            vulnerabilityId: vuln.id,
            xdbId:           item.xdb_id,
            xdbUrl:          item.xdb_url ?? '',
            exploitType:     item.exploit_type ?? null,
            dateAdded:       item.date_added ? new Date(item.date_added) : null,
            cloneSshUrl:     item.clone_ssh_url ?? null,
            source:          'vulncheck-xdb',
          },
          update: {
            exploitType:  item.exploit_type ?? undefined,
            dateAdded:    item.date_added ? new Date(item.date_added) : undefined,
            cloneSshUrl:  item.clone_ssh_url ?? undefined,
          },
        });
        savedCount++;
      }
    }

    if (totalFetched % 5000 === 0 || !data?._meta?.next_cursor) {
      console.log(`[XDB] ${totalFetched}건 처리, 저장 ${savedCount}건`);
    }

    cursor = data?._meta?.next_cursor ?? null;
    if (!cursor || !items.length) break;
    await sleep(200);
  }

  console.log(`[XDB] 완료. fetched=${totalFetched} saved=${savedCount}`);
  return { total: totalFetched, new: savedCount };
}
