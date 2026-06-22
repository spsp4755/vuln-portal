export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/api-keys';

/**
 * GET /api/v1/kev
 *
 * Headers:
 *   X-API-Key: vp_xxxx
 *
 * Query params:
 *   page        (default: 1)
 *   limit       (default: 20, max: 100)
 *   keyword     CVE ID, 제품명, 벤더 검색
 *   vendor
 *   product
 *   dueBefore   YYYY-MM-DD
 *   dueAfter    YYYY-MM-DD
 *   ransomware  true — 랜섬웨어 악용 항목만
 *   sort        dateAdded | dueDate | vendorProject | product (default: dateAdded)
 *   order       asc | desc (default: desc)
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  if (!apiKey || !(await validateApiKey(apiKey))) {
    return NextResponse.json({ error: 'API 키가 유효하지 않습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page       = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit      = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const keyword    = searchParams.get('keyword')    || '';
  const vendor     = searchParams.get('vendor')     || '';
  const product    = searchParams.get('product')    || '';
  const dueBefore  = searchParams.get('dueBefore')  || '';
  const dueAfter   = searchParams.get('dueAfter')   || '';
  const ransomware = searchParams.get('ransomware') === 'true';
  const sortBy     = searchParams.get('sort')  || 'dateAdded';
  const sortOrder  = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const SORT_FIELDS = ['dateAdded', 'dueDate', 'vendorProject', 'product'];
  const orderBy = { [SORT_FIELDS.includes(sortBy) ? sortBy : 'dateAdded']: sortOrder };

  const where: any = {};
  if (keyword) {
    where.OR = [
      { vulnerabilityId: { contains: keyword, mode: 'insensitive' } },
      { vulnerabilityName: { contains: keyword, mode: 'insensitive' } },
      { vendorProject:     { contains: keyword, mode: 'insensitive' } },
      { product:           { contains: keyword, mode: 'insensitive' } },
    ];
  }
  if (vendor)    where.vendorProject = { contains: vendor,  mode: 'insensitive' };
  if (product)   where.product       = { contains: product, mode: 'insensitive' };
  if (ransomware) where.knownRansomwareUse = { not: { equals: 'No Known Use' } };
  if (dueBefore || dueAfter) {
    where.dueDate = {};
    if (dueAfter)  where.dueDate.gte = new Date(dueAfter);
    if (dueBefore) where.dueDate.lte = new Date(dueBefore);
  }

  const [total, entries] = await Promise.all([
    prisma.kevEntry.count({ where }),
    prisma.kevEntry.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        vulnerability: {
          include: {
            cvssScores: { orderBy: { version: 'desc' }, take: 1 },
            epssScore:  true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    data: entries,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
