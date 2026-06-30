export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getAiConfig, setAiConfig, AI_CONFIG_KEYS,
  DEFAULT_AI_PROMPT_TRANSLATE, DEFAULT_AI_PROMPT_ANALYZE, DEFAULT_AI_TEMPERATURE, DEFAULT_AI_MAX_TOKENS,
} from '@/lib/config';

// GET /api/admin/ai-config — 현재 AI 프롬프트/파라미터 (전체 값 + 기본값)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const cfg = await getAiConfig();
  return NextResponse.json({
    config: cfg,
    defaults: {
      AI_PROMPT_TRANSLATE: DEFAULT_AI_PROMPT_TRANSLATE,
      AI_PROMPT_ANALYZE: DEFAULT_AI_PROMPT_ANALYZE,
      AI_TEMPERATURE: DEFAULT_AI_TEMPERATURE,
      AI_MAX_TOKENS: DEFAULT_AI_MAX_TOKENS,
    },
  });
}

// POST /api/admin/ai-config — 저장 (빈 값이면 기본값으로 되돌리기 위해 빈 문자열 허용)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const body = await req.json();
  const updated: string[] = [];
  for (const key of AI_CONFIG_KEYS) {
    if (typeof body[key] === 'string') {
      await setAiConfig(key, body[key]);
      updated.push(key);
    }
  }
  return NextResponse.json({ updated });
}
