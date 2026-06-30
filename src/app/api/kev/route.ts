export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/kev
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const ransomware = searchParams.get('ransomware');
  const keyword = searchParams.get('keyword')?.trim() || '';
  const sort = searchParams.get('sort') || 'dateAdded';
  const order = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  // Build where clause
  const where: any = {};

  if (keyword) {
    where.AND = [
      { kevEntry: { isNot: null } },
      {
        OR: [
          { cveId: { contains: keyword, mode: 'insensitive' } },
          { kevEntry: { vulnerabilityName: { contains: keyword, mode: 'insensitive' } } },
          { kevEntry: { vendorProject: { contains: keyword, mode: 'insensitive' } } },
          { kevEntry: { product: { contains: keyword, mode: 'insensitive' } } },
        ],
      },
    ];
    if (ransomware && ransomware !== 'all') {
      where.AND[0].kevEntry = { is: { knownRansomwareUse: ransomware } };
    }
  } else {
    if (ransomware && ransomware !== 'all') {
      where.kevEntry = { is: { knownRansomwareUse: ransomware } };
    } else {
      where.kevEntry = { isNot: null };
    }
  }

  // Build orderBy
  let orderBy: any;
  if (sort === 'dueDate') {
    orderBy = { kevEntry: { dueDate: order } };
  } else if (sort === 'vendorProject') {
    orderBy = { kevEntry: { vendorProject: order } };
  } else {
    orderBy = { kevEntry: { dateAdded: order } };
  }

  const [total, kevVulns] = await Promise.all([
    prisma.vulnerability.count({ where }),
    prisma.vulnerability.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        cvssScores: { orderBy: { version: 'desc' } },
        kevEntry: true,
        cweWeaknesses: true,
        aiSummary: true,
      },
    }),
  ]);

  return NextResponse.json({ vulns: kevVulns, total, page, limit, totalPages: Math.ceil(total / limit) });
}
