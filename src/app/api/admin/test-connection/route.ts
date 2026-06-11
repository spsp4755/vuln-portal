import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const { source } = await req.json();

    if (source === 'vulncheck') {
      const apiKey = await getConfig('VULNCHECK_API_KEY');
      if (!apiKey) return NextResponse.json({ ok: false, error: 'API 키가 설정되지 않았습니다.' });

      // community tier에서 접근 가능한 인덱스 목록 조회
      const resp = await fetch('https://api.vulncheck.com/v3/index/epss?limit=1', {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      const body = await resp.json().catch(() => ({}));

      if (resp.ok) {
        return NextResponse.json({
          ok: true,
          message: `연결 성공. EPSS 데이터 접근 가능.`,
          sample: body?.data?.[0] ?? null,
        });
      } else {
        // 403이면 플랜 문제, 404면 엔드포인트 문제
        const hint = resp.status === 403 || resp.status === 402
          ? 'API 키가 유효하지 않거나 Community 플랜 권한이 없습니다. VULNCHECK Community API 키를 확인하세요.'
          : resp.status === 401
          ? 'API 키가 유효하지 않습니다. 키를 다시 확인하세요.'
          : `연결 실패 (HTTP ${resp.status})`;
        return NextResponse.json({ ok: false, error: hint, detail: body });
      }
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 소스입니다.' });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
