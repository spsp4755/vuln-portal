import { createHmac, randomBytes, createHash } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'vuln_session';
const SESSION_HOURS = 8;

function getSecret(): string {
  return process.env.AUTH_SECRET || 'vuln-portal-default-secret-change-in-prod';
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password + 'vuln-portal-salt').digest('hex');
}

export function createSessionToken(email: string): string {
  const payload = JSON.stringify({ email, exp: Date.now() + SESSION_HOURS * 3600_000 });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

export function verifySessionToken(token: string): { email: string } | null {
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const expected = createHmac('sha256', getSecret()).update(b64).digest('hex');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (Date.now() > payload.exp) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME;
export const SESSION_MAX_AGE = SESSION_HOURS * 3600;
