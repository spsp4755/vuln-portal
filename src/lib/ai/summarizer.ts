import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

async function getOpenAIClient() {
  const apiKey = await getConfig('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. 설정 화면에서 키를 입력하세요.');
  }
  const baseURL = await getConfig('OPENAI_BASE_URL');
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}

async function getModel(): Promise<string> {
  const model = await getConfig('OPENAI_MODEL');
  return model || 'gpt-4o-mini';
}

// Generate Korean summary for a CVE
export async function generateAiSummary(cveId: string) {
  const openai = await getOpenAIClient();
  const model = await getModel();

  const vuln = await prisma.vulnerability.findUnique({
    where: { cveId },
    include: {
      cvssScores: true,
      cweWeaknesses: true,
      kevEntry: true,
      epssScore: true,
    },
  });

  if (!vuln) return null;

  const desc = (vuln.description as any).en || (vuln.description as any).ko || '';
  const cvss = vuln.cvssScores[0];

  const prompt = `다음 CVE 취약점에 대해 한국어로 간결하게 요약해주세요.
CVE ID: ${cveId}
설명: ${desc.slice(0, 2000)}
CVSS: ${cvss?.baseScore || 'N/A'} (${cvss?.baseSeverity || 'N/A'})
CWE: ${vuln.cweWeaknesses.map((w) => w.cweId).join(', ') || 'N/A'}
KEV: ${vuln.kevEntry ? 'Yes' : 'No'}

출력 형식:
- 요약: (1-2문장)
- 위험도: (심각/높음/중간/낮음)
- 이유: (1문장)
- 권장사항: (1문장)
`;

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 500,
  });

  const text = response.choices[0].message.content || '';

  const summaryKo = text;
  const riskMatch = text.match(/위험도[::]\s*(심각|높음|중간|낮음)/);
  const reasonMatch = text.match(/이유[::]\s*(.+?)(?:\n|$)/);
  const recMatch = text.match(/권장사항[::]\s*(.+?)(?:\n|$)/);

  const riskLevel = riskMatch?.[1] || '중간';

  await prisma.aiSummary.upsert({
    where: { vulnerabilityId: vuln.id },
    create: {
      vulnerabilityId: vuln.id,
      summaryKo,
      riskLevel,
      riskReason: reasonMatch?.[1] || '',
      recommendation: recMatch?.[1] || '',
    },
    update: {
      summaryKo,
      riskLevel,
      riskReason: reasonMatch?.[1] || '',
      recommendation: recMatch?.[1] || '',
    },
  });

  return { summaryKo, riskLevel };
}

// Calculate priority score for a CVE
export function calculatePriorityScore(vuln: any) {
  let score = 0;
  const cvss = vuln.cvssScores?.[0];

  if (cvss) {
    score += (Number(cvss.baseScore) / 10) * 40;
  }
  if (vuln.kevEntry) score += 20;
  if (vuln.epssScore) {
    score += Number(vuln.epssScore.score) * 20;
  }
  if (vuln.publishedAt) {
    const daysSincePublish = (Date.now() - new Date(vuln.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePublish < 7) score += 10;
    else if (daysSincePublish < 30) score += 5;
  }
  if (vuln.kevEntry?.knownRansomwareUse === 'Confirmed') score += 10;

  return Math.min(score, 100);
}
