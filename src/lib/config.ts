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
