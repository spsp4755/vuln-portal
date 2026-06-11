export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/dashboard/recent
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '20');

  const vulns = await prisma.vulnerability.findMany({
    take: limit,
    orderBy: { publishedAt: 'desc' },
    include: {
      cvssScores: { orderBy: { version: 'desc' } },
      kevEntry: true,
    },
  });

  return NextResponse.json(vulns);
}
