import { prisma } from '@/lib/prisma';

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const CONFIG_KEY = 'API_KEYS';

async function getKeys(): Promise<ApiKey[]> {
  const row = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } });
  if (!row?.value) return [];
  try { return JSON.parse(row.value); } catch { return []; }
}

async function saveKeys(keys: ApiKey[]) {
  await prisma.appConfig.upsert({
    where:  { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(keys) },
    update: { value: JSON.stringify(keys) },
  });
}

export async function listApiKeys(): Promise<Omit<ApiKey, 'key'>[]> {
  const keys = await getKeys();
  return keys.map(({ id, name, createdAt, lastUsedAt }) => ({
    id, name, createdAt, lastUsedAt,
  }));
}

export async function createApiKey(name: string): Promise<ApiKey> {
  const keys = await getKeys();
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  const newKey: ApiKey = {
    id: crypto.randomUUID(),
    name,
    key: `vp_${hex}`,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await saveKeys([...keys, newKey]);
  return newKey;
}

export async function revokeApiKey(id: string): Promise<boolean> {
  const keys = await getKeys();
  const filtered = keys.filter(k => k.id !== id);
  if (filtered.length === keys.length) return false;
  await saveKeys(filtered);
  return true;
}

export async function validateApiKey(rawKey: string): Promise<ApiKey | null> {
  if (!rawKey?.startsWith('vp_')) return null;
  const keys = await getKeys();
  const found = keys.find(k => k.key === rawKey);
  if (!found) return null;
  // 마지막 사용 시각 업데이트
  found.lastUsedAt = new Date().toISOString();
  await saveKeys(keys);
  return found;
}
