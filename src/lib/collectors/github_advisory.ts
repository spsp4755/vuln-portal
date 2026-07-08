import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

interface GithubAdvisory {
  ghsa_id: string;
  cve_id: string | null;
  url: string;
  html_url: string;
  summary: string;
  description: string | null;
  severity: string | null;
  published_at: string | null;
  updated_at: string | null;
  withdrawn_at: string | null;
  cvss?: { score?: number | null };
  epss?: { percentage?: number | null };
  cwes?: { cwe_id: string }[];
  vulnerabilities?: {
    package?: { ecosystem?: string; name?: string };
    vulnerable_version_range?: string;
    first_patched_version?: string | null;
  }[];
}

function asDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

async function fetchGithubPage(url: string, token?: string): Promise<{ items: GithubAdvisory[]; next: string | null }> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'vuln-portal',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GitHub Advisory API ${resp.status}: ${body.slice(0, 200)}`);
  }
  return {
    items: (await resp.json()) as GithubAdvisory[],
    next: nextLink(resp.headers.get('link')),
  };
}

export async function collectGithubAdvisories(daysBack = 30) {
  const token = await getConfig('GITHUB_TOKEN');
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const all: GithubAdvisory[] = [];
  const params = new URLSearchParams({
    type: 'reviewed',
    sort: 'updated',
    direction: 'desc',
    per_page: '100',
    modified: `>=${since.toISOString().slice(0, 10)}`,
  });
  let next: string | null = `https://api.github.com/advisories?${params}`;
  let pages = 0;
  while (next && pages < 10) {
    const page = await fetchGithubPage(next, token);
    if (!page.items.length) break;
    all.push(...page.items);
    next = page.next;
    pages++;
  }

  let newCount = 0;
  let updatedCount = 0;

  for (const advisory of all) {
    const firstPackage = advisory.vulnerabilities?.[0];
    let vulnerabilityId: string | null = null;

    if (advisory.cve_id) {
      const vuln = await prisma.vulnerability.upsert({
        where: { cveId: advisory.cve_id },
        create: {
          cveId: advisory.cve_id,
          state: advisory.withdrawn_at ? 'withdrawn' : 'published',
          description: { ko: '', en: advisory.description || advisory.summary || '' },
          publishedAt: asDate(advisory.published_at),
          modifiedAt: asDate(advisory.updated_at),
          sourceIdentifier: 'GitHub Advisory Database',
          references: advisory.html_url ? [advisory.html_url] : [],
          vulnStatus: advisory.withdrawn_at ? 'Withdrawn' : 'Analyzed',
        },
        update: {
          modifiedAt: asDate(advisory.updated_at),
        },
      });
      vulnerabilityId = vuln.id;
    }

    const existing = await prisma.githubAdvisory.findUnique({ where: { ghsaId: advisory.ghsa_id } });
    await prisma.githubAdvisory.upsert({
      where: { ghsaId: advisory.ghsa_id },
      create: {
        ghsaId: advisory.ghsa_id,
        cveId: advisory.cve_id,
        htmlUrl: advisory.html_url,
        apiUrl: advisory.url,
        summary: advisory.summary || advisory.ghsa_id,
        description: advisory.description,
        severity: advisory.severity?.toUpperCase() || null,
        ecosystem: firstPackage?.package?.ecosystem || null,
        packageName: firstPackage?.package?.name || null,
        vulnerableRange: firstPackage?.vulnerable_version_range || null,
        patchedVersion: firstPackage?.first_patched_version || null,
        cvssScore: advisory.cvss?.score ?? null,
        epssPercentage: advisory.epss?.percentage ?? null,
        cwes: advisory.cwes?.map((c) => c.cwe_id).filter(Boolean) || [],
        publishedAt: asDate(advisory.published_at),
        updatedAt: asDate(advisory.updated_at),
        withdrawnAt: asDate(advisory.withdrawn_at),
        affectedPackages: advisory.vulnerabilities || [],
        vulnerabilityId,
      },
      update: {
        cveId: advisory.cve_id,
        htmlUrl: advisory.html_url,
        apiUrl: advisory.url,
        summary: advisory.summary || advisory.ghsa_id,
        description: advisory.description,
        severity: advisory.severity?.toUpperCase() || null,
        ecosystem: firstPackage?.package?.ecosystem || null,
        packageName: firstPackage?.package?.name || null,
        vulnerableRange: firstPackage?.vulnerable_version_range || null,
        patchedVersion: firstPackage?.first_patched_version || null,
        cvssScore: advisory.cvss?.score ?? null,
        epssPercentage: advisory.epss?.percentage ?? null,
        cwes: advisory.cwes?.map((c) => c.cwe_id).filter(Boolean) || [],
        publishedAt: asDate(advisory.published_at),
        updatedAt: asDate(advisory.updated_at),
        withdrawnAt: asDate(advisory.withdrawn_at),
        affectedPackages: advisory.vulnerabilities || [],
        vulnerabilityId,
      },
    });
    if (existing) updatedCount++;
    else newCount++;
  }

  return { total: all.length, new: newCount, updated: updatedCount };
}
