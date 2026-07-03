/**
 * CVSS 버전 우선순위 및 "대표 점수" 선택.
 * NVD는 한 CVE에 여러 버전(v2/v3.0/v3.1/v4.0)의 Base 점수를 줄 수 있다.
 * 최신 버전을 대표로 사용한다: v4.0 > v3.1 > v3.0 > v2.
 * (NVD는 Base 점수만 제공 — CVSS-B. Threat/Environmental은 EPSS/KEV로 보완)
 */
export const CVSS_VERSION_PRIORITY: Record<string, number> = {
  '4.0': 4,
  '3.1': 3,
  '3.0': 2,
  '2': 1,
  '2.0': 1,
};

export interface CvssLike {
  version: string;
  baseScore: number | { toString(): string } | null;
  baseSeverity?: string | null;
  attackVector?: string | null;
}

/** 배열에서 최신 버전 CVSS 하나를 고른다 (없으면 null) */
export function pickPrimaryCvss<T extends CvssLike>(scores: T[]): T | null {
  if (!scores || scores.length === 0) return null;
  let best: T | null = null;
  let bestP = -1;
  for (const s of scores) {
    const p = CVSS_VERSION_PRIORITY[s.version] ?? 0;
    if (p > bestP) { bestP = p; best = s; }
  }
  return best;
}

/** DISTINCT ON 백필/정렬에서 쓰는 SQL CASE 식 (문자열) */
export const CVSS_PRIORITY_SQL_CASE =
  `CASE version WHEN '4.0' THEN 4 WHEN '3.1' THEN 3 WHEN '3.0' THEN 2 WHEN '2' THEN 1 WHEN '2.0' THEN 1 ELSE 0 END`;
