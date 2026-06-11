export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

// GET /api/eol
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const eolStatus = searchParams.get('status');
  const sort = searchParams.get('sort') || 'eolDate';
  const order = (searchParams.get('order') || 'asc') as 'asc' | 'desc';

  // cutoff 계산: DB 설정값(일) 또는 기본 365일
  const stored = await getConfig('EOL_CUTOFF_DAYS');
  const cutoffDays = stored ? Math.max(1, parseInt(stored, 10) || 365) : 365;
  const cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

  const validSorts = ['eolDate', 'releaseDate', 'product', 'cycle'];
  const sortField = validSorts.includes(sort) ? sort : 'eolDate';
  const orderBy = { [sortField]: order };

  const where: any = {};

  if (category) where.category = category;

  if (eolStatus === 'eol') {
    where.isEol = true;
    where.eolDate = { gte: cutoffDate };
  } else if (eolStatus === 'active') {
    where.isEol = false;
  } else if (eolStatus === 'due-soon') {
    where.isEol = false;
    where.eolDate = { gte: new Date(), lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) };
  } else if (eolStatus === 'all') {
    // 전체: cutoff 조건 없음
  } else {
    // 기본(status 미지정): cutoff 이후 항목만
    where.eolDate = { gte: cutoffDate };
  }

  const [total, eolList] = await Promise.all([
    prisma.eolData.count({ where }),
    prisma.eolData.findMany({ where, orderBy, take: 500 }),
  ]);

  return NextResponse.json({ items: eolList, total });
}
