export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function kisaKindWhere(kind: string) {
  if (kind === 'update_advisory') {
    return {
      some: {
        title: { contains: '업데이트 권고' },
      },
    };
  }
  if (kind === 'cisa_exploit') {
    return {
      some: {
        OR: [
          { title: { contains: 'CISA 발표' } },
          { title: { contains: 'Exploit' } },
          { description: { contains: 'Exploit' } },
        ],
      },
    };
  }
  if (kind === 'knvd_vulnerability') return { some: { source: 'kisa-info' } };
  return { some: {} };
}

// GET /api/vulnerabilities
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page     = Math.max(1, parseInt(searchParams.get('page')  || '1',  10) || 1);
    const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const severity = searchParams.get('severity')?.toUpperCase() || '';
    const keyword  = searchParams.get('keyword')  || '';
    const vendor   = searchParams.get('vendor')   || '';
    const product  = searchParams.get('product')  || '';
    const cwe      = searchParams.get('cwe')      || '';
    const attackVector = searchParams.get('attackVector')?.toUpperCase() || '';
    const kevOnly  = searchParams.get('kev') === 'true';
    const kisaOnly = searchParams.get('kisa') === 'true';
    const kisaKind = searchParams.get('kisaKind') || '';
    const githubOnly = searchParams.get('github') === 'true';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo   = searchParams.get('dateTo')   || '';
    const sortBy   = searchParams.get('sort')     || 'publishedAt';   // publishedAt | modifiedAt | cvssScore | epssScore
    const sortOrder = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    const epssMin  = parseFloat(searchParams.get('epssMin') || '0');

    const where: any = {};

    // 심각도/공격벡터는 화면에 표시되는 "대표 점수"(최신 버전 우선: v4.0>v3.1>v3.0>v2)와 일치시킨다.
    // 대표 점수를 vulnerability 행에 비정규화해 두었으므로 그 값으로 직접 필터한다.
    if (severity)     where.primarySeverity = severity;
    if (attackVector) where.primaryAttackVector = attackVector;

    if (keyword) {
      where.OR = [
        { cveId: { contains: keyword, mode: 'insensitive' } },
        { description: { path: ['en'], string_contains: keyword } },
        { description: { path: ['ko'], string_contains: keyword } },
        { cpeMappings: { some: { vendor:  { contains: keyword, mode: 'insensitive' } } } },
        { cpeMappings: { some: { product: { contains: keyword, mode: 'insensitive' } } } },
        { cweWeaknesses: { some: { cweId: { contains: keyword, mode: 'insensitive' } } } },
      ];
    }
    // 벤더/제품은 통계 그래프의 정확한 값과 매칭되도록 완전 일치(대소문자 무시)
    if (vendor)  where.cpeMappings = { some: { vendor:  { equals: vendor,  mode: 'insensitive' } } };
    if (product) where.cpeMappings = { some: { product: { equals: product, mode: 'insensitive' } } };
    if (cwe)     where.cweWeaknesses = { some: { cweId: { equals: cwe } } };
    if (kevOnly) where.isKev = true;
    if (kisaKind) where.kisaNotices = kisaKindWhere(kisaKind);
    else if (kisaOnly) where.kisaNotices = { some: {} };
    if (githubOnly) where.githubAdvisories = { some: {} };
    if (epssMin > 0) where.epssScore = { score: { gte: epssMin } };

    if (dateFrom || dateTo) {
      where.publishedAt = {};
      if (dateFrom) where.publishedAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      // dateTo는 해당 날짜의 끝까지 포함 (하루만 선택해도 그날 데이터가 나오도록)
      if (dateTo)   where.publishedAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }

    // 정렬 — 대표 점수(primaryScore)와 EPSS는 DB 레벨에서 정렬 (비정규화 컬럼/관계 정렬 활용)
    let orderBy: any;
    if (sortBy === 'modifiedAt')      orderBy = { modifiedAt: sortOrder };
    else if (sortBy === 'cvssScore')  orderBy = { primaryScore: { sort: sortOrder, nulls: 'last' } };
    else if (sortBy === 'epssScore')  orderBy = { epssScore: { score: sortOrder } };
    else                              orderBy = { publishedAt: sortOrder };

    const [total, vulns] = await Promise.all([
      prisma.vulnerability.count({ where }),
      prisma.vulnerability.findMany({
        where,
        skip:  (page - 1) * limit,
        take:  limit,
        orderBy,
        include: {
          cvssScores:     { orderBy: { version: 'desc' } },
          kevEntry:       true,
          cpeMappings:    { take: 3 },
          cweWeaknesses:  { take: 3 },
          kisaNotices:    { take: 2, orderBy: { pubDate: 'desc' } },
          githubAdvisories: { take: 2, orderBy: { updatedAt: 'desc' } },
          epssScore:      true,
          aiSummary:      true,
        },
      }),
    ]);

    return NextResponse.json({
      vulns,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('[API] GET /vulnerabilities error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.', detail: err.message }, { status: 500 });
  }
}
