import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

// LLM 호출 타임아웃(ms). 사내 모델이 느려도 무한 대기하지 않도록 한다.
const LLM_TIMEOUT_MS = 90_000;

/** [AI] 접두사 로그 — podman logs / docker logs 에서 바로 보인다. */
function aiLog(msg: string) { console.log(`[AI] ${msg}`); }
function aiErr(msg: string) { console.error(`[AI] ${msg}`); }

async function getLlmContext() {
  const apiKey = await getConfig('OPENAI_API_KEY');
  const baseURL = await getConfig('OPENAI_BASE_URL');
  const model = (await getConfig('OPENAI_MODEL')) || 'gpt-4o-mini';
  if (!apiKey) {
    throw new Error('LLM API Key가 설정되지 않았습니다. [설정 > AI 기능 설정]에서 API Key를 입력하세요.');
  }
  const openai = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 1,
  });
  return { openai, baseURL: baseURL || '(OpenAI 기본)', model };
}

const RISK_LEVELS = ['심각', '높음', '중간', '낮음'];

/**
 * LLM 응답에서 JSON 객체를 안전하게 추출한다.
 * 1순위: 응답 전체 JSON.parse
 * 2순위: 첫 '{' ~ 마지막 '}' 구간 파싱 (앞뒤 설명문 제거)
 * 실패 시 null
 */
function extractJson(text: string): Record<string, any> | null {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  let obj = tryParse(text.trim());
  if (obj && typeof obj === 'object') return obj;

  // 코드펜스 제거
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    obj = tryParse(fenced[1].trim());
    if (obj && typeof obj === 'object') return obj;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    obj = tryParse(text.slice(start, end + 1));
    if (obj && typeof obj === 'object') return obj;
  }
  return null;
}

/** JSON 파싱 실패 시: 섹션 라벨 기반 폴백 파서 */
function parseSections(text: string) {
  const grab = (label: string) => {
    const re = new RegExp(`${label}[)\\]:：]*\\s*([\\s\\S]*?)(?=\\n\\s*(?:번역|요약|위험도|위험\\s*사유|이유|조치|권장)[)\\]:：]|$)`, 'i');
    return text.match(re)?.[1]?.trim() || '';
  };
  return {
    translation: grab('번역'),
    summary: grab('요약'),
    risk_level: (text.match(/위험도[)\]:：]*\s*(심각|높음|중간|낮음)/)?.[1]) || '중간',
    risk_reason: grab('위험\\s*사유') || grab('이유'),
    remediation: grab('조치') || grab('권장'),
  };
}

function normalizeRisk(v: any): string {
  const s = String(v || '').trim();
  if (RISK_LEVELS.includes(s)) return s;
  // 영문/유사 표현 매핑
  const lower = s.toLowerCase();
  if (/crit|심각/.test(lower)) return '심각';
  if (/high|높/.test(lower)) return '높음';
  if (/low|낮/.test(lower)) return '낮음';
  if (/med|중/.test(lower)) return '중간';
  return '중간';
}

/**
 * CVE 한 건에 대해 LLM으로 한국어 번역 · 요약 · 위험도 · 조치 방법을 생성한다.
 * - 번역문은 Vulnerability.description.ko 에 저장 (스키마 변경 없음)
 * - 요약/위험도/사유/조치는 AiSummary 에 저장 (recommendation = 조치 방법)
 * SGLang / vLLM 등 OpenAI 호환 엔드포인트를 그대로 사용한다.
 */
export async function generateAiSummary(cveId: string) {
  const t0 = Date.now();
  const { openai, baseURL, model } = await getLlmContext();
  aiLog(`요청 시작 cve=${cveId} model=${model} baseURL=${baseURL}`);

  const vuln = await prisma.vulnerability.findUnique({
    where: { cveId },
    include: {
      cvssScores: true,
      cweWeaknesses: true,
      kevEntry: true,
      epssScore: true,
      cpeMappings: { take: 8 },
    },
  });

  if (!vuln) { aiErr(`CVE를 찾을 수 없음: ${cveId}`); return null; }

  const descObj = (vuln.description as any) || {};
  const desc = descObj.en || descObj.ko || '';
  const cvss = vuln.cvssScores[0];
  const products = vuln.cpeMappings
    .map((c) => `${c.vendor} ${c.product}`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 8)
    .join(', ');

  const prompt = `당신은 한국어 사이버 보안 분석가입니다. 아래 CVE 취약점 정보를 바탕으로 결과를 **JSON 객체 하나로만** 출력하세요. JSON 외의 설명이나 코드펜스는 출력하지 마세요.

[취약점 정보]
CVE ID: ${cveId}
영문 설명: ${desc.slice(0, 2500)}
CVSS: ${cvss?.baseScore ?? 'N/A'} (${cvss?.baseSeverity ?? 'N/A'})${cvss?.vectorString ? ` / ${cvss.vectorString}` : ''}
CWE: ${vuln.cweWeaknesses.map((w) => `${w.cweId} ${w.name}`).join(', ') || 'N/A'}
영향 제품: ${products || 'N/A'}
CISA KEV(실제 악용): ${vuln.kevEntry ? '예' : '아니오'}
EPSS(악용 예측): ${vuln.epssScore ? Number(vuln.epssScore.score).toFixed(4) : 'N/A'}

[출력 JSON 스키마]
{
  "translation": "영문 설명을 자연스러운 한국어로 정확히 번역한 전체 문장",
  "summary": "이 취약점이 무엇인지 1~2문장으로 핵심 요약",
  "risk_level": "심각 | 높음 | 중간 | 낮음 중 하나",
  "risk_reason": "해당 위험도로 판단한 이유 1~2문장",
  "remediation": "관리자가 실제로 취할 조치를 구체적인 단계로. 각 단계는 줄바꿈으로 구분(예: 1) 영향 버전 확인 2) 보안 패치 적용 3) 우회책 ...). 패치/업그레이드/설정 변경/탐지 등 실무 조치를 포함"
}`;

  aiLog(`LLM 호출 cve=${cveId} promptChars=${prompt.length}`);
  let response: any;
  try {
    response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1500,
    });
  } catch (e: any) {
    // SDK 에러: 상태코드/메시지/본문을 최대한 남긴다
    const status = e?.status ?? e?.response?.status;
    const detail = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : (e?.message || String(e));
    aiErr(`LLM 호출 실패 cve=${cveId} status=${status ?? 'N/A'} detail=${detail}`);
    if (e?.name === 'APIConnectionTimeoutError' || /timeout/i.test(e?.message || '')) {
      throw new Error(`LLM 응답 시간 초과(${LLM_TIMEOUT_MS / 1000}s). LLM 서버 부하/모델 크기를 확인하세요. (baseURL=${baseURL})`);
    }
    if (status === 404) throw new Error(`LLM 엔드포인트(404). URL 끝에 /v1 이 포함됐는지, 모델명이 맞는지 확인하세요. (baseURL=${baseURL}, model=${model})`);
    if (status === 401 || status === 403) throw new Error(`LLM 인증 실패(${status}). API Key를 확인하세요.`);
    throw new Error(`LLM 호출 실패: ${e?.message || e}`);
  }

  const choice = response?.choices?.[0];
  const msg = choice?.message ?? {};
  // 일반 모델: content / reasoning 모델(SGLang 등): reasoning_content 폴백
  let text = String(msg.content ?? '').trim();
  if (!text && (msg as any).reasoning_content) {
    text = String((msg as any).reasoning_content).trim();
    aiLog(`content 비어 reasoning_content 사용 cve=${cveId}`);
  }
  aiLog(`LLM 응답 cve=${cveId} finish=${choice?.finish_reason ?? 'N/A'} contentChars=${text.length} usage=${JSON.stringify(response?.usage ?? {})}`);

  if (!text) {
    aiErr(`빈 응답 cve=${cveId} finish=${choice?.finish_reason} raw=${JSON.stringify(response).slice(0, 600)}`);
    throw new Error(`모델이 빈 응답을 반환했습니다 (finish_reason: ${choice?.finish_reason ?? 'unknown'}). 모델명/최대토큰 설정을 확인하세요.`);
  }

  const parsed = extractJson(text);
  aiLog(`파싱 cve=${cveId} json=${parsed ? 'ok' : 'fallback(섹션)'}`);
  const fields = parsed || parseSections(text);

  const translation = String(fields.translation || '').trim();
  let summaryKo = String(fields.summary || '').trim();
  const riskLevel = normalizeRisk(fields.risk_level);
  const riskReason = String(fields.risk_reason || '').trim();
  const recommendation = String(fields.remediation || '').trim();

  // 모든 필드가 비면(파싱 완전 실패) 원문을 요약 자리에 넣어 최소한 무엇이라도 보이게 한다
  if (!translation && !summaryKo && !recommendation) {
    aiErr(`파싱 결과가 모두 비어 원문을 요약으로 저장 cve=${cveId} textHead=${text.slice(0, 200)}`);
    summaryKo = text.slice(0, 1500);
  } else if (!summaryKo) {
    summaryKo = translation.slice(0, 200);
  }

  // 번역문을 description.ko 에 병합 저장
  if (translation) {
    await prisma.vulnerability.update({
      where: { id: vuln.id },
      data: { description: { ...descObj, ko: translation } },
    });
  }

  await prisma.aiSummary.upsert({
    where: { vulnerabilityId: vuln.id },
    create: { vulnerabilityId: vuln.id, summaryKo, riskLevel, riskReason, recommendation },
    update: { summaryKo, riskLevel, riskReason, recommendation },
  });

  aiLog(`완료 cve=${cveId} ms=${Date.now() - t0} translated=${!!translation} risk=${riskLevel} recoChars=${recommendation.length}`);
  return {
    aiSummary: { summaryKo, riskLevel, riskReason, recommendation },
    descriptionKo: translation || null,
  };
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
