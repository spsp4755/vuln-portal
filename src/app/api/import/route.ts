import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    if (!type || !Array.isArray(data)) {
      return NextResponse.json({ error: 'type과 data 배열이 필요합니다.' }, { status: 400 });
    }

    if (type === 'vulnerabilities') {
      let inserted = 0, updated = 0, failed = 0;
      const errors: string[] = [];

      for (const item of data) {
        if (!item.cveId) { failed++; continue; }
        try {
          const existing = await prisma.vulnerability.findUnique({ where: { cveId: item.cveId } });

          const descEn = item.description?.en ?? item.description ?? '';
          const descKo = item.description?.ko ?? descEn;

          await prisma.vulnerability.upsert({
            where: { cveId: item.cveId },
            create: {
              cveId:            item.cveId,
              state:            item.state ?? 'published',
              description:      { en: descEn, ko: descKo },
              publishedAt:      item.publishedAt ? new Date(item.publishedAt) : null,
              modifiedAt:       item.modifiedAt  ? new Date(item.modifiedAt)  : null,
              sourceIdentifier: item.sourceIdentifier ?? '',
              references:       item.references  ?? [],
              vulnStatus:       item.vulnStatus  ?? 'UndergoingAnalysis',
            },
            update: {
              state:            item.state ?? 'published',
              description:      { en: descEn, ko: descKo },
              publishedAt:      item.publishedAt ? new Date(item.publishedAt) : null,
              modifiedAt:       item.modifiedAt  ? new Date(item.modifiedAt)  : null,
              references:       item.references  ?? [],
              vulnStatus:       item.vulnStatus  ?? 'UndergoingAnalysis',
            },
          });

          existing ? updated++ : inserted++;
        } catch (e: any) {
          failed++;
          if (errors.length < 10) errors.push(`${item.cveId}: ${e.message}`);
        }
      }

      return NextResponse.json({
        message: `가져오기 완료`,
        inserted, updated, failed,
        errors: errors.length ? errors : undefined,
      });
    }

    if (type === 'eol') {
      let inserted = 0, updated = 0, failed = 0;
      const errors: string[] = [];

      for (const item of data) {
        if (!item.product || !item.cycle) { failed++; continue; }
        try {
          const existing = await prisma.eolData.findFirst({
            where: { product: item.product, cycle: item.cycle },
          });

          const payload = {
            product:       item.product,
            cycle:         item.cycle,
            codename:      item.codename ?? null,
            releaseDate:   item.releaseDate  ? new Date(item.releaseDate)  : null,
            eolDate:       item.eolDate      ? new Date(item.eolDate)      : null,
            isEol:         Boolean(item.isEol ?? item.is_eol),
            lts:           Boolean(item.lts),
            supportStatus: item.supportStatus ?? item.support_status ?? 'active',
            category:      item.category ?? 'other',
          };

          if (existing) {
            await prisma.eolData.update({ where: { id: existing.id }, data: payload });
            updated++;
          } else {
            await prisma.eolData.create({ data: payload });
            inserted++;
          }
        } catch (e: any) {
          failed++;
          if (errors.length < 10) errors.push(`${item.product}/${item.cycle}: ${e.message}`);
        }
      }

      return NextResponse.json({ message: '가져오기 완료', inserted, updated, failed, errors: errors.length ? errors : undefined });
    }

    return NextResponse.json({ error: `지원하지 않는 유형: ${type}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
