export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/vulnerabilities
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page     = Math.max(1, parseInt(searchParams.get('page')  || '1',  10) || 1);
    const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const severity = searchParams.get('severity')?.toUpperCase() || '';
    const keyword  = searchParams.get('keyword')  || '';
    const vendor   = searchParams.get('vendor')   || '';
    const product  = searchParams.get('product')  || '';
    const kevOnly  = searchParams.get('kev') === 'true';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo   = searchParams.get('dateTo')   || '';
    const sortBy   = searchParams.get('sort')     || 'publishedAt';   // publishedAt | modifiedAt | cvssScore | epssScore
    const sortOrder = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    const epssMin  = parseFloat(searchParams.get('epssMin') || '0');

    const where: any = {};

    if (severity) where.cvssScores = { some: { baseSeverity: severity } };
    if (keyword) {
      where.OR = [
        { cveId: { contains: keyword, mode: 'insensitive' } },
        { description: { path: ['en'], string_contains: keyword } },
        { description: { path: ['ko'], string_contains: keyword } },
        { cpeMappings: { some: { vendor:  { contains: keyword, mode: 'insensitive' } } } },
        { cpeMappings: { some: { product: { contains: keyword, mode: 'insensitive' } } } },
        { cweWeaknesses: { some: { cweId: { contains: keyword, mode: 'insensitive' } } } },
      ];
    }
    if (vendor)  where.cpeMappings = { some: { vendor:  { contains: vendor,  mode: 'insensitive' } } };
    if (product) where.cpeMappings = { some: { product: { contains: product, mode: 'insensitive' } } };
    if (kevOnly) where.isKev = true;
    if (epssMin > 0) where.epssScore = { score: { gte: epssMin } };

    if (dateFrom || dateTo) {
      where.publishedAt = {};
      if (dateFrom) where.publishedAt.gte = new Date(dateFrom);
      if (dateTo)   where.publishedAt.lte = new Date(dateTo);
    }

    // DB-level orderBy: only publishedAt and modifiedAt are supported directly
    const useJsSort = sortBy === 'cvssScore' || sortBy === 'epssScore';
    let orderBy: any;
    if (sortBy === 'modifiedAt') {
      orderBy = { modifiedAt: sortOrder };
    } else {
      // publishedAt (default), or JS sort fallback
      orderBy = { publishedAt: useJsSort ? 'desc' : sortOrder };
    }

    const [total, vulnsRaw] = await Promise.all([
      prisma.vulnerability.count({ where }),
      prisma.vulnerability.findMany({
        where,
        skip:  useJsSort ? 0 : (page - 1) * limit,
        take:  useJsSort ? undefined : limit,
        orderBy,
        include: {
          cvssScores:     { orderBy: { version: 'desc' } },
          kevEntry:       true,
          cpeMappings:    { take: 3 },
          cweWeaknesses:  { take: 3 },
          epssScore:      true,
        },
      }),
    ]);

    let vulns = vulnsRaw;

    // JS-level sort for cvssScore / epssScore
    if (useJsSort) {
      vulns = [...vulnsRaw].sort((a, b) => {
        let va: number;
        let vb: number;
        if (sortBy === 'cvssScore') {
          va = Number(a.cvssScores[0]?.baseScore ?? -1);
          vb = Number(b.cvssScores[0]?.baseScore ?? -1);
        } else {
          va = Number((a.epssScore as any)?.score ?? -1);
          vb = Number((b.epssScore as any)?.score ?? -1);
        }
        return sortOrder === 'asc' ? va - vb : vb - va;
      });
      // Apply pagination after sort
      vulns = vulns.slice((page - 1) * limit, page * limit);
    }

    return NextResponse.json({
      vulns,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('[API] GET /vulnerabilities error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.', detail: err.message }, { status: 500 });
  }
}
