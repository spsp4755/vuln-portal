import { prisma } from '@/lib/prisma';
import { collectNvd } from '@/lib/collectors/nvd';
import { collectCisaKev } from '@/lib/collectors/cisa_kev';
import { collectEndoflife } from '@/lib/collectors/endoflife';
import { collectVulnCheck } from '@/lib/collectors/vulncheck';
import { collectEpss } from '@/lib/collectors/epss';

const COLLECTORS = {
  nvd:        () => collectNvd(7),  // 스케줄 수집은 7일 (최신 데이터만)
  cisa_kev:   collectCisaKev,
  endoflife:  collectEndoflife,
  epss:       collectEpss,       // VulnCheck EPSS (API 키 필요)
  vulncheck:  collectVulnCheck,  // VulnCheck KEV 확장 (API 키 필요)
};

// Run all collectors
export async function runAllCollectors() {
  const results = [];

  for (const [name, collector] of Object.entries(COLLECTORS)) {
    const log = await prisma.collectionLog.create({
      data: {
        source: name,
        startedAt: new Date(),
        status: 'running',
      },
    });

    try {
      const result = await collector();
      await prisma.collectionLog.update({
        where: { id: log.id },
        data: {
          completedAt: new Date(),
          status: 'success',
          recordsFetched: (result as any).total || 0,
          recordsNew: (result as any).new || 0,
          recordsUpdated: (result as any).updated || 0,
        },
      });
      results.push({ source: name, ...result });
    } catch (err: any) {
      await prisma.collectionLog.update({
        where: { id: log.id },
        data: {
          completedAt: new Date(),
          status: 'failed',
          error: err.message,
        },
      });
      results.push({ source: name, error: err.message });
    }
  }

  return results;
}

// Single collector
export async function runCollector(name: string) {
  const collector = COLLECTORS[name as keyof typeof COLLECTORS];
  if (!collector) throw new Error(`Unknown collector: ${name}`);

  const log = await prisma.collectionLog.create({
    data: { source: name, startedAt: new Date(), status: 'running' },
  });

  try {
    const result = await collector();
    await prisma.collectionLog.update({
      where: { id: log.id },
      data: {
        completedAt: new Date(),
        status: 'success',
        recordsFetched: (result as any).total || 0,
        recordsNew: (result as any).new || 0,
        recordsUpdated: (result as any).updated || 0,
      },
    });
    return { source: name, ...result };
  } catch (err: any) {
    await prisma.collectionLog.update({
      where: { id: log.id },
      data: { completedAt: new Date(), status: 'failed', error: err.message },
    });
    throw err;
  }
}
