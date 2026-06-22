export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/api-keys';

/**
 * GET /api/v1/vulnerabilities
 *
 * Headers:
 *   X-API-Key: vp_xxxx
 *
 * Query params:
 *   page        (default: 1)
 *   limit       (default: 20, max: 100)
 *   severity    CRITICAL | HIGH | MEDIUM | LOW
 *   keyword     CVE ID, 설명, 벤더, 제품 검색
 *   vendor
 *   product
 *   kev         true — KEV 목록만
 *   epssMin     0.0~1.0
 *   dateFrom    YYYY-MM-DD
 *   dateTo      YYYY-MM-DD
 *   sort        publishedAt | modifiedAt | cvssScore | epssScore (default: publishedAt)
 *   order       asc | desc (default: desc)
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  if (!apiKey || !(await validateApiKey(apiKey))) {
    return NextResponse.json({ error: 'API 키가 유효하지 않습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page      = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const severity  = searchParams.get('severity')?.toUpperCase() || '';
  const keyword   = searchParams.get('keyword')  || '';
  const vendor    = searchParams.get('vendor')   || '';
  const product   = searchParams.get('product')  || '';
  const kevOnly   = searchParams.get('kev') === 'true';
  const dateFrom  = searchParams.get('dateFrom') || '';
  const dateTo    = searchParams.get('dateTo')   || '';
  const sortBy    = searchParams.get('sort')     || 'publishedAt';
  const sortOrder = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const epssMin   = parseFloat(searchParams.get('epssMin') || '0');

  const where: any = {};
  if (severity) where.cvssScores = { some: { baseSeverity: severity } };
  if (keyword) {
    where.OR = [
      { cveId:        { contains: keyword, mode: 'insensitive' } },
      { description:  { path: ['en'], string_contains: keyword } },
      { cpeMappings:  { some: { vendor:  { contains: keyword, mode: 'insensitive' } } } },
      { cpeMappings:  { some: { product: { contains: keyword, mode: 'insensitive' } } } },
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

  const useJsSort = sortBy === 'cvssScore' || sortBy === 'epssScore';
  const orderBy = sortBy === 'modifiedAt'
    ? { modifiedAt: sortOrder }
    : { publishedAt: useJsSort ? 'desc' : sortOrder };

  const [total, vulnsRaw] = await Promise.all([
    prisma.vulnerability.count({ where }),
    prisma.vulnerability.findMany({
      where,
      skip:  useJsSort ? 0 : (page - 1) * limit,
      take:  useJsSort ? undefined : limit,
      orderBy,
      include: {
        cvssScores:    { orderBy: { version: 'desc' } },
        kevEntry:      true,
        cpeMappings:   { take: 5 },
        cweWeaknesses: { take: 5 },
        epssScore:     true,
      },
    }),
  ]);

  let vulns = vulnsRaw as any[];
  if (useJsSort) {
    vulns = [...vulnsRaw].sort((a, b) => {
      const va = sortBy === 'cvssScore'
        ? Number(a.cvssScores[0]?.baseScore ?? -1)
        : Number((a.epssScore as any)?.score ?? -1);
      const vb = sortBy === 'cvssScore'
        ? Number(b.cvssScores[0]?.baseScore ?? -1)
        : Number((b.epssScore as any)?.score ?? -1);
      return sortOrder === 'asc' ? va - vb : vb - va;
    });
    vulns = vulns.slice((page - 1) * limit, page * limit);
  }

  return NextResponse.json({
    data: vulns,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
