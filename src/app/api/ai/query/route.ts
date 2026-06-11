import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

// POST /api/ai/query - Natural language query
export async function POST(req: Request) {
  const { question } = await req.json();

  const apiKey = await getConfig('OPENAI_API_KEY');
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다. 설정 화면에서 키를 입력하세요.' }, { status: 400 });
  }

  const baseURL = await getConfig('OPENAI_BASE_URL');
  const model = (await getConfig('OPENAI_MODEL')) || 'gpt-4o-mini';

  const openai = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  // Step 1: Parse intent with OpenAI
  const intentResponse = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `You are a vulnerability intelligence assistant. Analyze the user's question and extract search parameters.
Respond in JSON format: {"keyword": string, "severity": string, "kevOnly": boolean, "explanation": string}
If the user asks about KEV, set kevOnly to true. If they mention severity, extract it.`,
      },
      { role: 'user', content: question },
    ],
    temperature: 0.1,
    max_tokens: 200,
    response_format: { type: 'json_object' },
  });

  let intent: any;
  try {
    intent = JSON.parse(intentResponse.choices[0].message.content || '{}');
  } catch {
    return NextResponse.json({ error: 'Intent parsing failed' }, { status: 500 });
  }

  // Step 2: Search DB based on intent
  const params = new URLSearchParams();
  if (intent.keyword) params.set('keyword', intent.keyword);
  if (intent.severity) params.set('severity', intent.severity);
  if (intent.kevOnly) params.set('kev', 'true');
  params.set('limit', '10');

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const searchRes = await fetch(`${baseUrl}/api/vulnerabilities?${params}`);
  const searchData = await searchRes.json();

  // Step 3: Generate explanation with search results
  const explanationResponse = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `You are a vulnerability intelligence assistant. The user asked: "${question}"
You found ${searchData.total || 0} vulnerabilities. Here are the top results in JSON format: ${JSON.stringify(searchData.vulns?.slice(0, 5))}
Provide a helpful answer in Korean, referencing the actual CVEs found.`,
      },
      { role: 'user', content: question },
    ],
    temperature: 0.3,
    max_tokens: 800,
  });

  const answer = explanationResponse.choices[0].message.content || '';

  return NextResponse.json({
    question,
    intent,
    answer,
    results: searchData.vulns || [],
    total: searchData.total || 0,
  });
}
