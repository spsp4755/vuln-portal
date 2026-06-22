export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/api-keys';

/**
 * GET /api/v1/eol
 *
 * Headers:
 *   X-API-Key: vp_xxxx
 *
 * Query params:
 *   page        (default: 1)
 *   limit       (default: 20, max: 100)
 *   keyword     제품명, 사이클 검색
 *   product
 *   category
 *   eolOnly     true — EOL된 항목만
 *   ltsOnly     true — LTS 항목만
 *   eolBefore   YYYY-MM-DD
 *   eolAfter    YYYY-MM-DD
 *   sort        eolDate | releaseDate | product | cycle (default: eolDate)
 *   order       asc | desc (default: asc)
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  if (!apiKey || !(await validateApiKey(apiKey))) {
    return NextResponse.json({ error: 'API 키가 유효하지 않습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page      = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const keyword   = searchParams.get('keyword')   || '';
  const product   = searchParams.get('product')   || '';
  const category  = searchParams.get('category')  || '';
  const eolOnly   = searchParams.get('eolOnly')   === 'true';
  const ltsOnly   = searchParams.get('ltsOnly')   === 'true';
  const eolBefore = searchParams.get('eolBefore') || '';
  const eolAfter  = searchParams.get('eolAfter')  || '';
  const sortBy    = searchParams.get('sort')  || 'eolDate';
  const sortOrder = (searchParams.get('order') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';

  const SORT_FIELDS = ['eolDate', 'releaseDate', 'product', 'cycle'];
  const orderBy = { [SORT_FIELDS.includes(sortBy) ? sortBy : 'eolDate']: sortOrder };

  const where: any = {};
  if (keyword) {
    where.OR = [
      { product: { contains: keyword, mode: 'insensitive' } },
      { cycle:   { contains: keyword, mode: 'insensitive' } },
    ];
  }
  if (product)  where.product  = { contains: product,  mode: 'insensitive' };
  if (category) where.category = { contains: category, mode: 'insensitive' };
  if (eolOnly)  where.isEol    = true;
  if (ltsOnly)  where.lts      = true;
  if (eolBefore || eolAfter) {
    where.eolDate = {};
    if (eolAfter)  where.eolDate.gte = new Date(eolAfter);
    if (eolBefore) where.eolDate.lte = new Date(eolBefore);
  }

  const [total, entries] = await Promise.all([
    prisma.eolData.count({ where }),
    prisma.eolData.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
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
