export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { classifyKisaNotice, type KisaNoticeKind } from '@/lib/kisa-notice';

const KINDS: KisaNoticeKind[] = ['update_advisory', 'cisa_exploit', 'knvd_vulnerability', 'security_notice'];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind') as KisaNoticeKind | null;
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const rows = await prisma.kisaNotice.findMany({
      take: 500,
      orderBy: [{ pubDate: 'desc' }, { collectedAt: 'desc' }],
      include: {
        vulnerability: { select: { cveId: true, primarySeverity: true, primaryScore: true, isKev: true } },
      },
    });

    const decorated = rows.map((notice) => {
      const display = classifyKisaNotice(notice);
      return {
        id: notice.id,
        guid: notice.guid,
        title: notice.title,
        link: notice.link,
        description: notice.description,
        pubDate: notice.pubDate,
        source: notice.source,
        cveIds: notice.cveIds,
        vulnerability: notice.vulnerability,
        kind: display.kind,
        kindLabel: display.label,
        kindColor: display.color,
        kindBg: display.bg,
      };
    });

    const filtered = decorated.filter((notice) => {
      if (kind && notice.kind !== kind) return false;
      if (!q) return true;
      return [
        notice.title,
        notice.description || '',
        notice.cveIds.join(' '),
        notice.vulnerability?.cveId || '',
      ].join('\n').toLowerCase().includes(q);
    });

    const counts = Object.fromEntries(KINDS.map((k) => [k, decorated.filter((n) => n.kind === k).length]));

    return NextResponse.json({
      notices: filtered.slice(0, limit),
      total: filtered.length,
      counts: { all: decorated.length, ...counts },
    });
  } catch (err: any) {
    console.error('[API] GET /api/kisa/notices error:', err);
    return NextResponse.json({ error: 'KISA 권고 조회 중 오류가 발생했습니다.', detail: err.message }, { status: 500 });
  }
}
