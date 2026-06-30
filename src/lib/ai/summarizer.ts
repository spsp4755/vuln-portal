import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { getConfig, getAiConfig } from '@/lib/config';

// LLM 호출 타임아웃(ms). 사내 모델이 느려도 무한 대기하지 않도록 한다.
const LLM_TIMEOUT_MS = 90_000;
const RISK_LEVELS = ['심각', '높음', '중간', '낮음'];

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

/** 프롬프트 템플릿의 {변수}를 실제 값으로 치환 */
function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

function normalizeRisk(v: any): string {
  const s = String(v || '').trim();
  if (RISK_LEVELS.includes(s)) return s;
  const lower = s.toLowerCase();
  if (/crit|심각/.test(lower)) return '심각';
  if (/high|높/.test(lower)) return '높음';
  if (/low|낮/.test(lower)) return '낮음';
  if (/med|중/.test(lower)) return '중간';
  return '중간';
}

/** 분석 응답(라벨 형식)을 파싱: 요약/위험도/사유/조치 */
function parseAnalysis(text: string) {
  const grab = (label: string, until: string) => {
    const re = new RegExp(`(?:${label})\\s*[:：]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${until})\\s*[:：]|$)`, 'i');
    return (text.match(re)?.[1] || '').trim();
  };
  const summary = grab('요약', '위험도|사유|이유|조치|권장');
  const riskRaw = (text.match(/위험도\s*[:：]?\s*(심각|높음|중간|낮음)/)?.[1]) || '';
  const riskReason = grab('사유|이유', '조치|권장|요약|위험도');
  let recommendation = grab('조치|권장\\s*사항|권장', '$^'); // 조치 라벨 이후 끝까지
  // '조치:' 이후 전체를 가져오도록 보정
  const recMatch = text.match(/(?:조치|권장\s*사항|권장)\s*[:：]?\s*([\s\S]*)$/i);
  if (recMatch && recMatch[1].trim().length > recommendation.length) recommendation = recMatch[1].trim();
  return {
    summary,
    riskLevel: normalizeRisk(riskRaw),
    riskReason,
    recommendation,
  };
}

/** 단일 LLM 호출 — 응답 텍스트 반환(+로깅, reasoning_content 폴백) */
async function callLLM(
  openai: OpenAI, model: string, baseURL: string, prompt: string,
  temperature: number, maxTokens: number, tag: string, cveId: string,
): Promise<string> {
  aiLog(`${tag} 호출 cve=${cveId} model=${model} baseURL=${baseURL} promptChars=${prompt.length}`);
  let response: any;
  try {
    response = await openai.chat.completions.create({
      model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens,
    });
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status;
    const detail = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : (e?.message || String(e));
    aiErr(`${tag} 호출 실패 cve=${cveId} status=${status ?? 'N/A'} detail=${detail}`);
    if (e?.name === 'APIConnectionTimeoutError' || /timeout/i.test(e?.message || '')) {
      throw new Error(`LLM 응답 시간 초과(${LLM_TIMEOUT_MS / 1000}s). LLM 서버 부하/모델 크기를 확인하세요.`);
    }
    if (status === 404) throw new Error(`LLM 엔드포인트(404). URL 끝에 /v1 포함 여부, 모델명을 확인하세요. (model=${model})`);
    if (status === 401 || status === 403) throw new Error(`LLM 인증 실패(${status}). API Key를 확인하세요.`);
    throw new Error(`LLM 호출 실패: ${e?.message || e}`);
  }
  const choice = response?.choices?.[0];
  const msg = choice?.message ?? {};
  let text = String(msg.content ?? '').trim();
  if (!text && (msg as any).reasoning_content) {
    text = String((msg as any).reasoning_content).trim();
    aiLog(`${tag} content 비어 reasoning_content 사용 cve=${cveId}`);
  }
  aiLog(`${tag} 응답 cve=${cveId} finish=${choice?.finish_reason ?? 'N/A'} chars=${text.length}`);
  if (!text) {
    aiErr(`${tag} 빈 응답 cve=${cveId} finish=${choice?.finish_reason} raw=${JSON.stringify(response).slice(0, 400)}`);
    throw new Error(`모델이 빈 응답을 반환했습니다 (${tag}, finish_reason: ${choice?.finish_reason ?? 'unknown'}).`);
  }
  return text;
}

/** vuln 객체로부터 프롬프트 치환 변수 구성 */
function buildVars(vuln: any) {
  const descObj = (vuln.description as any) || {};
  const en = descObj.en || descObj.ko || '';
  const cvss = vuln.cvssScores?.[0];
  const products = (vuln.cpeMappings || [])
    .map((c: any) => `${c.vendor} ${c.product}`)
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
    .slice(0, 8).join(', ');
  return {
    descObj,
    vars: {
      cveId: vuln.cveId,
      description: String(en).slice(0, 2500),
      cvss: `${cvss?.baseScore ?? 'N/A'} (${cvss?.baseSeverity ?? 'N/A'})${cvss?.vectorString ? ` / ${cvss.vectorString}` : ''}`,
      cwe: (vuln.cweWeaknesses || []).map((w: any) => `${w.cweId} ${w.name}`).join(', ') || 'N/A',
      products: products || 'N/A',
      kev: vuln.kevEntry ? '예' : '아니오',
      epss: vuln.epssScore ? Number(vuln.epssScore.score).toFixed(4) : 'N/A',
    } as Record<string, string>,
  };
}

/**
 * CVE 한 건에 대해 LLM으로 ①번역 ②분석(요약·위험도·조치)을 각각 호출한다.
 * persist=false면 DB에 저장하지 않고 결과만 반환(설정 화면 테스트용).
 */
export async function runAiForCve(
  cveId: string,
  opts: { persist?: boolean; overrides?: Record<string, string> } = {},
) {
  const persist = opts.persist !== false;
  const t0 = Date.now();
  const { openai, baseURL, model } = await getLlmContext();
  const saved = await getAiConfig();
  // 저장 전 미리보기를 위해 override(설정 화면의 현재 입력값)를 우선 적용
  const ai = { ...saved, ...(opts.overrides || {}) };
  const temperature = Math.min(1, Math.max(0, parseFloat(ai.AI_TEMPERATURE) || 0.2));
  const maxTokens = Math.min(8000, Math.max(256, parseInt(ai.AI_MAX_TOKENS) || 1500));

  const vuln = await prisma.vulnerability.findUnique({
    where: { cveId },
    include: { cvssScores: true, cweWeaknesses: true, kevEntry: true, epssScore: true, cpeMappings: { take: 8 } },
  });
  if (!vuln) { aiErr(`CVE를 찾을 수 없음: ${cveId}`); return null; }

  const { descObj, vars } = buildVars(vuln);
  aiLog(`분석 시작 cve=${cveId} model=${model} temp=${temperature} maxTokens=${maxTokens}`);

  // ① 번역
  const translatePrompt = fillTemplate(ai.AI_PROMPT_TRANSLATE, vars);
  const translateRaw = await callLLM(openai, model, baseURL, translatePrompt, temperature, maxTokens, '번역', cveId);
  const translation = translateRaw.replace(/^번역\s*[:：]\s*/i, '').trim();

  // ② 분석 (번역문이 있으면 한국어 설명으로, 없으면 영문으로 분석)
  const analyzeVars = { ...vars, description: translation || vars.description };
  const analyzePrompt = fillTemplate(ai.AI_PROMPT_ANALYZE, analyzeVars);
  const analyzeRaw = await callLLM(openai, model, baseURL, analyzePrompt, temperature, maxTokens, '분석', cveId);
  const parsed = parseAnalysis(analyzeRaw);

  const summaryKo = parsed.summary || translation.slice(0, 200);
  const result = {
    translation,
    summaryKo,
    riskLevel: parsed.riskLevel,
    riskReason: parsed.riskReason,
    recommendation: parsed.recommendation,
  };

  if (persist) {
    if (translation) {
      await prisma.vulnerability.update({ where: { id: vuln.id }, data: { description: { ...descObj, ko: translation } } });
    }
    await prisma.aiSummary.upsert({
      where: { vulnerabilityId: vuln.id },
      create: { vulnerabilityId: vuln.id, summaryKo, riskLevel: result.riskLevel, riskReason: result.riskReason, recommendation: result.recommendation },
      update: { summaryKo, riskLevel: result.riskLevel, riskReason: result.riskReason, recommendation: result.recommendation },
    });
  }

  aiLog(`완료 cve=${cveId} ms=${Date.now() - t0} translated=${!!translation} risk=${result.riskLevel} recoChars=${result.recommendation.length}`);
  return { ...result, raw: { translate: translateRaw, analyze: analyzeRaw } };
}

/** 상세/목록에서 사용하는 표준 반환 형태 */
export async function generateAiSummary(cveId: string) {
  const r = await runAiForCve(cveId, { persist: true });
  if (!r) return null;
  return {
    aiSummary: { summaryKo: r.summaryKo, riskLevel: r.riskLevel, riskReason: r.riskReason, recommendation: r.recommendation },
    descriptionKo: r.translation || null,
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
