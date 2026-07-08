import { prisma } from '@/lib/prisma';
import { collectNvd } from '@/lib/collectors/nvd';
import { collectCisaKev } from '@/lib/collectors/cisa_kev';
import { collectEndoflife } from '@/lib/collectors/endoflife';
import { collectVulnCheck } from '@/lib/collectors/vulncheck';
import { collectEpss } from '@/lib/collectors/epss';
import { collectKisa } from '@/lib/collectors/kisa';
import { collectGithubAdvisories } from '@/lib/collectors/github_advisory';

const COLLECTORS = {
  nvd: () => collectNvd(7),
  cisa_kev: collectCisaKev,
  endoflife: collectEndoflife,
  epss: collectEpss,
  vulncheck: collectVulnCheck,
  kisa: collectKisa,
  github_advisory: () => collectGithubAdvisories(30),
};

export async function runAllCollectors() {
  const results = [];

  for (const [name, collector] of Object.entries(COLLECTORS)) {
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
      results.push({ source: name, ...result });
    } catch (err: any) {
      await prisma.collectionLog.update({
        where: { id: log.id },
        data: { completedAt: new Date(), status: 'failed', error: err.message },
      });
      results.push({ source: name, error: err.message });
    }
  }

  return results;
}

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
