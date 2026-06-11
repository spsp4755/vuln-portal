import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, createSessionToken, SESSION_MAX_AGE, COOKIE_NAME_EXPORT } from '@/lib/auth';

// 기본 관리자 계정 (DB에 없으면 이 값으로 fallback)
const DEFAULT_EMAIL = 'admin@koreacb.com';
const DEFAULT_PASSWORD_HASH = hashPassword('Kcb1234!');

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 });
    }

    // DB에서 사용자 확인 (AppConfig에 저장된 계정 목록)
    let valid = false;
    try {
      const stored = await prisma.appConfig.findUnique({ where: { key: 'AUTH_USERS' } });
      if (stored?.value) {
        const users: { email: string; passwordHash: string }[] = JSON.parse(stored.value);
        const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (user && user.passwordHash === hashPassword(password)) valid = true;
      }
    } catch { /* DB 조회 실패 시 기본 계정으로 fallback */ }

    // fallback: 기본 관리자 계정
    if (!valid && email.toLowerCase() === DEFAULT_EMAIL && hashPassword(password) === DEFAULT_PASSWORD_HASH) {
      valid = true;
    }

    if (!valid) {
      return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const token = createSessionToken(email.toLowerCase());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME_EXPORT, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
