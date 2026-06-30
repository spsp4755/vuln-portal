import { prisma } from '@/lib/prisma';

export const CONFIG_KEYS = [
  'NVD_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'VULNCHECK_API_KEY',
  'EOL_CUTOFF_DAYS',
  'NVD_DAYS_BACK',
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

// DB에 저장된 설정값을 우선 사용하고, 없으면 환경변수로 폴백한다.
export async function getConfig(key: ConfigKey): Promise<string | undefined> {
  try {
    const row = await prisma.appConfig.findUnique({ where: { key } });
    if (row && row.value) return row.value;
  } catch {
    // DB 연결 실패 시 환경변수로 폴백
  }
  return process.env[key] || undefined;
}

export async function getAllConfig(): Promise<Record<string, string>> {
  try {
    const rows = await prisma.appConfig.findMany({
      where: { key: { in: [...CONFIG_KEYS] } },
    });
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  } catch {
    return {};
  }
}

export async function setConfig(key: ConfigKey, value: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

// ── AI 프롬프트/파라미터 (CONFIG_KEYS와 별도 — 비밀값이 아니라 마스킹하지 않음) ──
export const AI_CONFIG_KEYS = [
  'AI_PROMPT_TRANSLATE',
  'AI_PROMPT_ANALYZE',
  'AI_TEMPERATURE',
  'AI_MAX_TOKENS',
] as const;

export const DEFAULT_AI_PROMPT_TRANSLATE = `당신은 사이버 보안 전문 번역가입니다.
아래 영문 취약점 설명을 자연스럽고 정확한 한국어로 번역하세요.
- 한국어 번역문만 출력합니다. 머리말·따옴표·영어 원문·부가 설명은 출력하지 마세요.
- CVE 식별자, 제품명, 버전, 프로토콜 등 고유명사는 그대로 둡니다.

[영문 설명]
{description}`;

export const DEFAULT_AI_PROMPT_ANALYZE = `당신은 한국어 사이버 보안 분석가입니다.
아래 취약점 정보를 검토하고, 반드시 한국어로, 아래 [출력 형식]의 라벨을 그대로 사용해 답하세요.
JSON·코드블록·영어 문장은 사용하지 마세요.

[취약점 정보]
CVE: {cveId}
설명: {description}
CVSS: {cvss}
CWE: {cwe}
영향 제품: {products}
CISA KEV(실제 악용 여부): {kev}
EPSS(악용 예측 점수): {epss}

[출력 형식]
요약: (이 취약점이 무엇인지 1~2문장)
위험도: (심각/높음/중간/낮음 중 하나만)
사유: (위험도 판단 이유 1~2문장)
조치:
1) (첫 번째 조치)
2) (두 번째 조치)
3) (세 번째 조치)`;

export const DEFAULT_AI_TEMPERATURE = '0.2';
export const DEFAULT_AI_MAX_TOKENS = '1500';

const AI_DEFAULTS: Record<string, string> = {
  AI_PROMPT_TRANSLATE: DEFAULT_AI_PROMPT_TRANSLATE,
  AI_PROMPT_ANALYZE: DEFAULT_AI_PROMPT_ANALYZE,
  AI_TEMPERATURE: DEFAULT_AI_TEMPERATURE,
  AI_MAX_TOKENS: DEFAULT_AI_MAX_TOKENS,
};

/** AI 설정값(프롬프트/파라미터)을 DB→환경변수→기본값 순으로 해석해 반환 */
export async function getAiConfig(): Promise<Record<string, string>> {
  const result: Record<string, string> = { ...AI_DEFAULTS };
  try {
    const rows = await prisma.appConfig.findMany({ where: { key: { in: [...AI_CONFIG_KEYS] } } });
    for (const row of rows) if (row.value && row.value.trim()) result[row.key] = row.value;
  } catch { /* DB 실패 시 기본값 사용 */ }
  return result;
}

export async function setAiConfig(key: string, value: string): Promise<void> {
  if (!AI_CONFIG_KEYS.includes(key as any)) return;
  await prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
}
