export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/kev/due-soon
export async function GET() {
  const dueSoon = await prisma.vulnerability.findMany({
    where: {
      isKev: true,
      kevEntry: {
        dueDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      },
    },
    include: { cvssScores: { orderBy: { version: 'desc' } }, kevEntry: true },
    orderBy: { kevEntry: { dueDate: 'asc' } },
    take: 20,
  });

  return NextResponse.json(dueSoon);
}
