import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

const EOL_PRODUCTS = [
  { product: 'windows-11', category: 'os' },
  { product: 'windows-server', category: 'os' },
  { product: 'ubuntu', category: 'os' },
  { product: 'centos', category: 'os' },
  { product: 'redhat', category: 'os' },
  { product: 'macos', category: 'os' },
  { product: 'android', category: 'os' },
  { product: 'chrome', category: 'browser' },
  { product: 'firefox', category: 'browser' },
  { product: 'edge', category: 'browser' },
  { product: 'python', category: 'runtime' },
  { product: 'nodejs', category: 'runtime' },
  { product: 'java', category: 'runtime' },
  { product: 'dotnet', category: 'runtime' },
  { product: 'php', category: 'runtime' },
  { product: 'react', category: 'framework' },
  { product: 'django', category: 'framework' },
  { product: 'spring-boot', category: 'framework' },
  { product: 'mysql', category: 'database' },
  { product: 'postgresql', category: 'database' },
  { product: 'redis', category: 'database' },
  { product: 'docker', category: 'infra' },
  { product: 'kubernetes', category: 'infra' },
  { product: 'nginx', category: 'infra' },
];

interface EolRelease {
  cycle: string;
  codename?: string;
  release_date: string;
  eol_date?: string;
  eol?: string;
  lts?: boolean;
}

export async function collectEndoflife(daysBack?: number) {
  // 설정값 읽기 (파라미터 > DB > 기본값 365일)
  let cutoffDays = daysBack;
  if (cutoffDays === undefined) {
    const stored = await getConfig('EOL_CUTOFF_DAYS');
    cutoffDays = stored ? Math.max(1, parseInt(stored, 10) || 365) : 365;
  }
  const cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

  console.log(`[EOL] 수집 기준: EOL 날짜 ${cutoffDate.toISOString().slice(0, 10)} 이후만 저장 (최근 ${cutoffDays}일)`);

  let totalCount = 0;
  let skippedCount = 0;

  for (const { product, category } of EOL_PRODUCTS) {
    const resp = await fetch(`https://endoflife.date/api/${product}.json`, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      console.warn(`EOL fetch failed for ${product}: ${resp.status}`);
      continue;
    }

    const data: EolRelease[] = await resp.json();

    for (const release of data) {
      const eolRaw = release.eol_date || release.eol;
      // eol 필드가 boolean true/false로 오는 경우도 있음
      const eolDate = typeof eolRaw === 'string' ? eolRaw : null;
      const isEol = eolDate
        ? new Date(eolDate) < new Date()
        : eolRaw === (true as any);

      const releaseDateRaw = release.release_date;
      const releaseDate =
        releaseDateRaw && !isNaN(new Date(releaseDateRaw).getTime())
          ? new Date(releaseDateRaw)
          : null;
      const eolDateParsed =
        eolDate && !isNaN(new Date(eolDate).getTime()) ? new Date(eolDate) : null;

      // cutoff 이전에 EOL된 항목은 건너뜀 (날짜가 없으면 유지)
      if (eolDateParsed && eolDateParsed < cutoffDate) {
        skippedCount++;
        continue;
      }

      await prisma.eolData.upsert({
        where: { id: `${product}-${release.cycle}` },
        create: {
          id: `${product}-${release.cycle}`,
          product,
          cycle: release.cycle,
          codename: release.codename || null,
          releaseDate,
          eolDate: eolDateParsed,
          isEol,
          lts: release.lts === true,
          supportStatus: isEol ? 'EOL' : 'Active',
          category,
        },
        update: {
          eolDate: eolDateParsed,
          isEol,
          supportStatus: isEol ? 'EOL' : 'Active',
        },
      });

      totalCount++;
    }
  }

  console.log(`[EOL] 완료. 저장=${totalCount}, 건너뜀(오래된 EOL)=${skippedCount}`);
  return { total: totalCount, skipped: skippedCount };
}
