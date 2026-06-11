import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const KEY = 'WATCHLIST_VENDORS';

async function getWatchlist(): Promise<string[]> {
  const row = await prisma.appConfig.findUnique({ where: { key: KEY } });
  if (!row) return [];
  try { return JSON.parse(row.value); } catch { return []; }
}

export async function GET() {
  try {
    const vendors = await getWatchlist();
    if (!vendors.length) return NextResponse.json({ vendors: [], hits: [] });

    // 각 벤더의 최신 취약점 조회
    const hits = await prisma.vulnerability.findMany({
      where: {
        cpeMappings: { some: { vendor: { in: vendors, mode: 'insensitive' } } },
      },
      include: {
        cvssScores: { orderBy: { version: 'desc' }, take: 1 },
        kevEntry:   true,
        cpeMappings: { where: { vendor: { in: vendors, mode: 'insensitive' } }, take: 1 },
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      vendors,
      hits: hits.map((v) => ({
        id:          v.id,
        cveId:       v.cveId,
        publishedAt: v.publishedAt,
        isKev:       v.isKev,
        vendor:      v.cpeMappings[0]?.vendor ?? '',
        product:     v.cpeMappings[0]?.product ?? '',
        severity:    v.cvssScores[0]?.baseSeverity ?? null,
        score:       v.cvssScores[0]?.baseScore ?? null,
        dueDate:     v.kevEntry?.dueDate ?? null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { vendors } = await req.json();
    if (!Array.isArray(vendors)) return NextResponse.json({ error: 'vendors 배열이 필요합니다.' }, { status: 400 });
    const cleaned = Array.from(new Set((vendors as string[]).map((v) => v.trim().toLowerCase()).filter(Boolean)));
    await prisma.appConfig.upsert({
      where:  { key: KEY },
      create: { key: KEY, value: JSON.stringify(cleaned) },
      update: { value: JSON.stringify(cleaned) },
    });
    return NextResponse.json({ vendors: cleaned });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
