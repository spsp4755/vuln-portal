export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { status: 'ok', ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}
