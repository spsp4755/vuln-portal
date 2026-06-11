import { NextRequest, NextResponse } from 'next/server';
import { CONFIG_KEYS, getAllConfig, setConfig, ConfigKey } from '@/lib/config';

function mask(value: string): string {
  if (value.startsWith('http')) return value;
  if (/^\d+$/.test(value)) return value;  // 숫자 값은 마스킹하지 않음
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}

// GET - 현재 설정된 키 목록(마스킹된 값 + 설정 여부)
export async function GET() {
  const stored = await getAllConfig();
  const result = CONFIG_KEYS.map((key) => {
    const dbValue = stored[key];
    const envValue = process.env[key];
    const value = dbValue || envValue || '';
    return {
      key,
      isSet: Boolean(value),
      masked: value ? mask(value) : '',
      source: dbValue ? 'db' : envValue ? 'env' : 'none',
    };
  });
  return NextResponse.json(result);
}

// POST - 키 저장 (빈 문자열은 무시)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const updated: string[] = [];

  for (const key of CONFIG_KEYS) {
    const value = body[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      await setConfig(key as ConfigKey, value.trim());
      updated.push(key);
    }
  }

  return NextResponse.json({ updated });
}
