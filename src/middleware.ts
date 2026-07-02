import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/v1/', '/api/health'];
const SECRET = process.env.AUTH_SECRET || 'vuln-portal-default-secret-change-in-prod';

// 로그에서 제외할 소음성 경로 (정적 자산 · 폰트 · RSC 프리페치)
function isNoise(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/fonts/') ||
    pathname === '/favicon.ico' ||
    /\.(?:woff2?|ttf|png|jpg|jpeg|svg|ico|css|js|map)$/.test(pathname)
  );
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  );
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(
      sig.match(/.{2}/g)!.map((h) => parseInt(h, 16))
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(b64));
    if (!valid) return false;

    // base64url → base64 (add padding)
    const base64 = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      b64.length + ((4 - (b64.length % 4)) % 4), '='
    );
    const payload = JSON.parse(atob(base64));
    return Date.now() < payload.exp;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const logReq = !isNoise(pathname);
  const method = req.method;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (logReq) log.info('HTTP', `${method} ${pathname} (public) ${clientIp(req)}`);
    return NextResponse.next();
  }

  const token = req.cookies.get('vuln_session')?.value;
  const valid = token ? await verifyToken(token) : false;

  if (!valid) {
    if (logReq) log.warn('AUTH', `거부 ${method} ${pathname} (토큰 ${token ? '만료/무효' : '없음'}) ${clientIp(req)}`);
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  if (logReq) log.info('HTTP', `${method} ${pathname} (auth ok)`);
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
