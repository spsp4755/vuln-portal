import { prisma } from '@/lib/prisma';

const FEEDS = [
  { source: 'kisa-info', url: 'https://knvd.krcert.or.kr/rss/security/info' },
  { source: 'kisa-notice', url: 'https://knvd.krcert.or.kr/rss/security/notice' },
];

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date | null;
  guid: string;
}

function textBetween(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : '';
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(s: string): string {
  return decodeXml(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseItems(xml: string): RssItem[] {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)).map((m) => {
    const raw = m[1];
    const link = textBetween(raw, 'link');
    const guid = textBetween(raw, 'guid') || link || textBetween(raw, 'title');
    const pubDateRaw = textBetween(raw, 'pubDate');
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    return {
      title: textBetween(raw, 'title'),
      link,
      description: stripHtml(textBetween(raw, 'description')),
      pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate : null,
      guid,
    };
  });
}

function extractCveIds(item: RssItem): string[] {
  const text = `${item.title}\n${item.link}\n${item.description}`;
  const matches = text.match(/CVE-\d{4}-\d{4,}/gi) || [];
  return Array.from(new Set(matches.map((cve) => cve.toUpperCase())));
}

async function fetchFeed(url: string): Promise<RssItem[]> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!resp.ok) throw new Error(`KISA RSS ${resp.status}: ${url}`);
  return parseItems(await resp.text());
}

export async function collectKisa() {
  let total = 0;
  let newCount = 0;
  let updatedCount = 0;

  for (const feed of FEEDS) {
    const items = await fetchFeed(feed.url);
    total += items.length;

    for (const item of items) {
      const cveIds = extractCveIds(item);
      const linkedCves = cveIds.length ? cveIds : [null];

      for (const cveId of linkedCves) {
        let vulnerabilityId: string | null = null;
        if (cveId) {
          const vuln = await prisma.vulnerability.upsert({
            where: { cveId },
            create: {
              cveId,
              state: 'published',
              description: { ko: item.description || item.title, en: '' },
              publishedAt: item.pubDate,
              modifiedAt: item.pubDate,
              sourceIdentifier: 'KISA',
              references: item.link ? [item.link] : [],
              vulnStatus: 'KISA Notice',
            },
            update: {},
          });
          vulnerabilityId = vuln.id;
        }

        const guid = cveId ? `${feed.source}:${item.guid}:${cveId}` : `${feed.source}:${item.guid}`;
        const existing = await prisma.kisaNotice.findUnique({ where: { guid } });
        await prisma.kisaNotice.upsert({
          where: { guid },
          create: {
            guid,
            title: item.title,
            link: item.link,
            description: item.description,
            pubDate: item.pubDate,
            source: feed.source,
            cveIds,
            vulnerabilityId,
          },
          update: {
            title: item.title,
            link: item.link,
            description: item.description,
            pubDate: item.pubDate,
            source: feed.source,
            cveIds,
            vulnerabilityId,
          },
        });
        if (existing) updatedCount++;
        else newCount++;
      }
    }
  }

  return { total, new: newCount, updated: updatedCount };
}
