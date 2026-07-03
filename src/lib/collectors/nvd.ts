import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { pickPrimaryCvss } from '@/lib/cvss';

interface NvdApiResponse {
  vulnerabilities?: NvdVulnerability[];
  totalResults?: number;
}

interface NvdCvssData {
  version: string; vectorString: string; baseScore: number;
  baseSeverity?: string; attackVector?: string; attackComplexity?: string;
  privilegesRequired?: string; userInteraction?: string;
}
interface NvdCvssMetric {
  cvssData: NvdCvssData; baseSeverity?: string;
  exploitabilityScore?: number; impactScore?: number;
}
interface NvdVulnerability {
  cve: {
    id: string; sourceIdentifier?: string; vulnStatus?: string;
    descriptions?: { lang: string; value: string }[];
    metrics?: {
      cvssMetricV2?: NvdCvssMetric[]; cvssMetricV30?: NvdCvssMetric[];
      cvssMetricV31?: NvdCvssMetric[]; cvssMetricV40?: NvdCvssMetric[];
    };
    weaknesses?: { description?: { lang: string; value: string }[] }[];
    configurations?: { nodes: { cpeMatch?: { criteria: string; vulnerable: boolean; versionStartIncluding?: string; versionEndExcluding?: string; versionEndIncluding?: string }[] }[] }[];
    published?: string; lastModified?: string; references?: { url: string }[];
  };
}

/**
 * 지수 백오프 재시도 fetch + JSON 파싱.
 * 중요: 본문 읽기(resp.json())까지 재시도 안에 둔다. NVD 응답이 커서 본문 전송 중
 * 연결이 끊기면 undici가 `TypeError: terminated`를 던지는데, 이 경우에도 재시도해야 한다.
 */
async function fetchNvdJson(url: string, options: RequestInit, maxRetries = 4): Promise<NvdApiResponse> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);

      // 429 Rate Limit → Retry-After 헤더 확인 후 대기 (재시도 횟수 소모하지 않음)
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') || '30', 10);
        console.warn(`[NVD] Rate limited. Waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        attempt--;
        continue;
      }

      // 5xx 일시적 오류 → 지수 백오프 재시도
      if (resp.status >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 2000;
          console.warn(`[NVD] Server error ${resp.status}. Retry in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        throw new Error(`NVD API ${resp.status}`);
      }

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(`NVD API ${resp.status}: ${errBody.slice(0, 200)}`);
      }

      // 본문 읽기도 재시도 범위 안에서 수행 (전송 중 'terminated' 방지)
      return (await resp.json()) as NvdApiResponse;
    } catch (e: any) {
      if (e?.message === 'aborted') throw e;   // 사용자 중지는 재시도하지 않음
      lastError = e;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000;
        console.warn(`[NVD] 요청/응답 실패 (${e.message}). ${delay}ms 후 재시도 (${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
  });
}

export async function collectNvd(daysBack: number = 30, signal?: AbortSignal) {
  const apiKey = await getConfig('NVD_API_KEY');
  const requestDelayMs = apiKey ? 700 : 6500;

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  let startIndex = 0;
  const allVulns: NvdVulnerability[] = [];
  // 페이지가 너무 크면(2000) 본문 전송 중 연결이 끊겨 'terminated'가 나기 쉬움 → 500으로 축소
  const resultsPerPage = 500;

  console.log(`[NVD] Collecting last ${daysBack} days (since ${since.toISOString().slice(0, 10)})`);

  while (true) {
    if (signal?.aborted) throw new Error('수집이 사용자에 의해 중지되었습니다.');

    const sinceStr = encodeURIComponent(since.toISOString().slice(0, 10) + 'T00:00:00.000');
    const nowStr   = encodeURIComponent(new Date().toISOString().slice(0, 10) + 'T23:59:59.999');
    let urlStr = `https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=${resultsPerPage}&startIndex=${startIndex}&lastModStartDate=${sinceStr}&lastModEndDate=${nowStr}`;
    if (apiKey) urlStr += `&apiKey=${apiKey}`;

    if (startIndex > 0) await sleep(requestDelayMs, signal);

    const data = await fetchNvdJson(urlStr, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(180_000),
    });

    if (!data.vulnerabilities?.length) break;
    allVulns.push(...data.vulnerabilities);
    console.log(`[NVD] Fetched ${allVulns.length} / ${data.totalResults ?? '?'}`);

    if (!data.totalResults || allVulns.length >= data.totalResults) break;
    startIndex += resultsPerPage;
  }

  let newCount = 0;
  let updatedCount = 0;

  for (const vuln of allVulns) {
    const { cve } = vuln;
    try {
      const existing = await prisma.vulnerability.findUnique({ where: { cveId: cve.id } });

      const descEn = cve.descriptions?.find((d) => d.lang === 'en')?.value || '';
      // 한국어 원문이 없으면 ko는 비워둔다(영어 복사 금지). AI 번역으로만 채운다.
      const descKo = cve.descriptions?.find((d) => d.lang === 'ko')?.value || '';

      const vulnRecord = await prisma.vulnerability.upsert({
        where: { cveId: cve.id },
        create: {
          cveId: cve.id, state: 'published',
          description: { ko: descKo, en: descEn },
          publishedAt: cve.published ? new Date(cve.published) : null,
          modifiedAt:  cve.lastModified ? new Date(cve.lastModified) : null,
          sourceIdentifier: cve.sourceIdentifier || '',
          references:  cve.references?.map((r) => r.url) || [],
          vulnStatus:  cve.vulnStatus || 'UndergoingAnalysis',
        },
        update: {
          state: 'published',
          description: { ko: descKo, en: descEn },
          publishedAt: cve.published ? new Date(cve.published) : null,
          modifiedAt:  cve.lastModified ? new Date(cve.lastModified) : null,
          sourceIdentifier: cve.sourceIdentifier || '',
          references:  cve.references?.map((r) => r.url) || [],
          vulnStatus:  cve.vulnStatus || 'UndergoingAnalysis',
        },
      });

      await prisma.cpeMapping.deleteMany({ where: { vulnerabilityId: vulnRecord.id } });
      await prisma.cweWeakness.deleteMany({ where: { vulnerabilityId: vulnRecord.id } });

      // CVSS scores
      const cvssVersions: [string, NvdCvssMetric | undefined][] = [
        ['2',   cve.metrics?.cvssMetricV2?.[0]],
        ['3.0', cve.metrics?.cvssMetricV30?.[0]],
        ['3.1', cve.metrics?.cvssMetricV31?.[0]],
        ['4.0', cve.metrics?.cvssMetricV40?.[0]],
      ];
      const savedCvss: { version: string; baseScore: number; baseSeverity: string; attackVector: string | null }[] = [];
      for (const [version, metric] of cvssVersions) {
        if (!metric?.cvssData) continue;
        const d = metric.cvssData;
        const severity = d.baseSeverity || metric.baseSeverity || 'UNKNOWN';
        const fields = {
          vectorString: d.vectorString || '',
          baseScore: d.baseScore,
          baseSeverity: severity.toUpperCase(),
          exploitabilityScore: metric.exploitabilityScore ?? null,
          impactScore:         metric.impactScore ?? null,
          attackVector:        d.attackVector ?? null,
          attackComplexity:    d.attackComplexity ?? null,
          privilegesRequired:  d.privilegesRequired ?? null,
          userInteraction:     d.userInteraction ?? null,
        };
        await prisma.cvssScore.upsert({
          where: { vulnerabilityId_version: { vulnerabilityId: vulnRecord.id, version } },
          create: { vulnerabilityId: vulnRecord.id, version, ...fields },
          update: fields,
        });
        savedCvss.push({ version, baseScore: d.baseScore, baseSeverity: fields.baseSeverity, attackVector: fields.attackVector });
      }

      // 대표 CVSS(최신 버전 우선)를 취약점 행에 비정규화 저장 — 화면·차트·필터 공통 기준
      const primary = pickPrimaryCvss(savedCvss);
      await prisma.vulnerability.update({
        where: { id: vulnRecord.id },
        data: {
          primaryCvssVersion:  primary?.version ?? null,
          primarySeverity:     primary?.baseSeverity ?? null,
          primaryScore:        primary?.baseScore ?? null,
          primaryAttackVector: primary?.attackVector ?? null,
        },
      });

      // CPE mappings (버전 범위 포함)
      if (cve.configurations) {
        for (const config of cve.configurations) {
          for (const node of config.nodes) {
            for (const match of node.cpeMatch || []) {
              const parts = parseCpeUri(match.criteria);
              await prisma.cpeMapping.create({
                data: {
                  vulnerabilityId: vulnRecord.id,
                  cpeUri:      match.criteria,
                  vendor:      parts.vendor || '',
                  product:     parts.product || '',
                  versionStart: match.versionStartIncluding || parts.versionStart || null,
                  versionEnd:   match.versionEndExcluding   || match.versionEndIncluding || parts.versionEnd || null,
                  isVulnerable: match.vulnerable,
                },
              });
            }
          }
        }
      }

      // CWE weaknesses
      const seenCwes = new Set<string>();
      for (const weakness of cve.weaknesses || []) {
        for (const w of weakness.description || []) {
          const m = w.value.match(/CWE-(\d+)/);
          if (m && !seenCwes.has(m[1])) {
            seenCwes.add(m[1]);
            await prisma.cweWeakness.create({
              data: { vulnerabilityId: vulnRecord.id, cweId: `CWE-${m[1]}`, name: w.value },
            });
          }
        }
      }

      if (!existing) newCount++; else updatedCount++;
    } catch (e: any) {
      console.error(`[NVD] Failed to save ${cve.id}:`, e.message);
    }
  }

  console.log(`[NVD] Done. total=${allVulns.length} new=${newCount} updated=${updatedCount}`);
  return { total: allVulns.length, new: newCount, updated: updatedCount };
}

function parseCpeUri(uri: string) {
  const parts = uri.split(':');
  return {
    vendor:       parts[3] === '*' ? '' : parts[3] || '',
    product:      parts[4] === '*' ? '' : parts[4] || '',
    versionStart: parts[5] === '*' ? '' : parts[5] || '',
    versionEnd:   parts[6] === '*' ? '' : parts[6] || '',
  };
}
