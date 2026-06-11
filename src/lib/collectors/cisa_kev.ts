import { prisma } from '@/lib/prisma';

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
  cwes: string[];
  notes: string;
}

export async function collectCisaKev() {
  const resp = await fetch(
    'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    { signal: AbortSignal.timeout(300_000) }
  );

  if (!resp.ok) throw new Error(`CISA KEV API ${resp.status}`);
  const data = await resp.json();
  const entries: KevEntry[] = data.vulnerabilities || [];

  let newCount = 0;
  let updatedCount = 0;

  for (const entry of entries) {
    let vuln = await prisma.vulnerability.findUnique({ where: { cveId: entry.cveID } });

    if (!vuln) {
      vuln = await prisma.vulnerability.create({
        data: {
          cveId: entry.cveID,
          state: 'published',
          description: { ko: entry.shortDescription, en: entry.shortDescription },
          isKev: true,
        },
      });
      newCount++;
    } else {
      await prisma.vulnerability.update({
        where: { id: vuln.id },
        data: { isKev: true },
      });
      updatedCount++;
    }

    await prisma.kevEntry.upsert({
      where: { vulnerabilityId: vuln.id },
      create: {
        vulnerabilityId: vuln.id,
        vendorProject: entry.vendorProject,
        product: entry.product,
        vulnerabilityName: entry.vulnerabilityName,
        dateAdded: new Date(entry.dateAdded),
        shortDescription: entry.shortDescription,
        requiredAction: entry.requiredAction,
        dueDate: entry.dueDate ? new Date(entry.dueDate) : null,
        knownRansomwareUse: entry.knownRansomwareCampaignUse || 'Unknown',
        cwes: entry.cwes || [],
        notes: entry.notes || '',
      },
      update: {
        vendorProject: entry.vendorProject,
        product: entry.product,
        vulnerabilityName: entry.vulnerabilityName,
        dateAdded: new Date(entry.dateAdded),
        shortDescription: entry.shortDescription,
        requiredAction: entry.requiredAction,
        dueDate: entry.dueDate ? new Date(entry.dueDate) : null,
        knownRansomwareUse: entry.knownRansomwareCampaignUse || 'Unknown',
        cwes: entry.cwes || [],
        notes: entry.notes || '',
      },
    });
  }

  // KEV에서 제거된 CVE는 isKev = false 처리
  const kevCveIds = entries.map((e) => e.cveID);
  await prisma.vulnerability.updateMany({
    where: { cveId: { notIn: kevCveIds }, isKev: true },
    data: { isKev: false },
  });

  return { total: entries.length, new: newCount, updated: updatedCount };
}
