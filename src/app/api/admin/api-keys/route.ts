export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listApiKeys, createApiKey, revokeApiKey } from '@/lib/api-keys';

// GET /api/admin/api-keys — 키 목록 (key 값 제외)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const keys = await listApiKeys();
  return NextResponse.json({ keys });
}

// POST /api/admin/api-keys — 새 키 발급
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: '키 이름을 입력하세요.' }, { status: 400 });

  const newKey = await createApiKey(name.trim());
  return NextResponse.json({ key: newKey }, { status: 201 });
}

// DELETE /api/admin/api-keys — 키 삭제
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const ok = await revokeApiKey(id);
  if (!ok) return NextResponse.json({ error: '키를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
