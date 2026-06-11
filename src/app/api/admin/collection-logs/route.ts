import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/collection-logs
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '20');

  const logs = await prisma.collectionLog.findMany({
    take: limit,
    orderBy: { startedAt: 'desc' },
  });

  return NextResponse.json(logs);
}
