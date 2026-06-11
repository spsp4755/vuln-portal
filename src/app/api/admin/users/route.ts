export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { getSession } from '@/lib/auth';

interface StoredUser { email: string; passwordHash: string; createdAt?: string }

const DEFAULT_ADMIN = 'admin@koreacb.com';

async function getUsers(): Promise<StoredUser[]> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'AUTH_USERS' } });
  if (!row?.value) return [];
  try { return JSON.parse(row.value); } catch { return []; }
}

async function saveUsers(users: StoredUser[]) {
  await prisma.appConfig.upsert({
    where:  { key: 'AUTH_USERS' },
    create: { key: 'AUTH_USERS', value: JSON.stringify(users) },
    update: { value: JSON.stringify(users) },
  });
}

// ── GET: 사용자 목록 ──────────────────────────────────────────
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const users = await getUsers();
  // 기본 관리자가 목록에 없으면 표시용으로 포함 (저장은 안 함)
  const hasDefault = users.some(u => u.email === DEFAULT_ADMIN);
  const list = hasDefault ? users : [
    { email: DEFAULT_ADMIN, passwordHash: '', createdAt: '기본 계정' },
    ...users,
  ];
  return NextResponse.json({ users: list.map(u => ({ email: u.email, createdAt: u.createdAt ?? null })) });
}

// ── POST: 사용자 추가 ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });

  const users = await getUsers();
  const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase())
    || email.toLowerCase() === DEFAULT_ADMIN;
  if (exists) return NextResponse.json({ error: '이미 존재하는 이메일입니다.' }, { status: 409 });

  users.push({ email: email.toLowerCase(), passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
  await saveUsers(users);
  return NextResponse.json({ ok: true });
}

// ── DELETE: 사용자 삭제 ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { email } = await req.json();
  if (email === DEFAULT_ADMIN) return NextResponse.json({ error: '기본 관리자 계정은 삭제할 수 없습니다.' }, { status: 400 });
  if (email === session.email) return NextResponse.json({ error: '현재 로그인한 계정은 삭제할 수 없습니다.' }, { status: 400 });

  const users = await getUsers();
  const filtered = users.filter(u => u.email.toLowerCase() !== email.toLowerCase());
  if (filtered.length === users.length) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });

  await saveUsers(filtered);
  return NextResponse.json({ ok: true });
}

// ── PATCH: 비밀번호 변경 ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { email, newPassword } = await req.json();
  if (!email || !newPassword) return NextResponse.json({ error: '이메일과 새 비밀번호를 입력하세요.' }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });

  let users = await getUsers();

  if (email === DEFAULT_ADMIN) {
    // 기본 관리자: 목록에 추가해서 비밀번호 덮어쓰기
    users = users.filter(u => u.email !== DEFAULT_ADMIN);
    users.unshift({ email: DEFAULT_ADMIN, passwordHash: hashPassword(newPassword), createdAt: new Date().toISOString() });
  } else {
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    users[idx].passwordHash = hashPassword(newPassword);
  }

  await saveUsers(users);
  return NextResponse.json({ ok: true });
}
