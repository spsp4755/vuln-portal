export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/api-keys';

/**
 * GET /api/v1/vulnerabilities
 *
 * Headers:
 *   X-API-Key: vp_xxxx
 *
 * Query params:
 *   page        (default: 1)
 *   limit       (default: 20, max: 100)
 *   severity    CRITICAL | HIGH | MEDIUM | LOW
 *   keyword     CVE ID, 설명, 벤더, 제품 검색
 *   vendor
 *   product
 *   kev         true — KEV 목록만
 *   epssMin     0.0~1.0
 *   dateFrom    YYYY-MM-DD
 *   dateTo      YYYY-MM-DD
 *   sort        publishedAt | modifiedAt | cvssScore | epssScore (default: publishedAt)
 *   order       asc | desc (default: desc)
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function parseDate(s: string): Date | null {
  if (!s || !DATE_RE.test(s)) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  if (!apiKey || !(await validateApiKey(apiKey))) {
    return NextResponse.json({ error: 'API 키가 유효하지 않습니다.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page      = Math.max(1, parseInt(searchParams.get('page')  || '1'));
    const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const severity  = searchParams.get('severity')?.toUpperCase() || '';
    const keyword   = searchParams.get('keyword')  || '';
    const vendor    = searchParams.get('vendor')   || '';
    const product   = searchParams.get('product')  || '';
    const kevOnly   = searchParams.get('kev') === 'true';
    const kisaOnly  = searchParams.get('kisa') === 'true';
    const kisaKind  = searchParams.get('kisaKind') || '';
    const githubOnly = searchParams.get('github') === 'true';
    const sortBy    = searchParams.get('sort')     || 'publishedAt';
    const sortOrder = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    const epssMinRaw = parseFloat(searchParams.get('epssMin') || '0');
    const epssMin    = isNaN(epssMinRaw) ? 0 : Math.min(1, Math.max(0, epssMinRaw));

    const dateFrom = parseDate(searchParams.get('dateFrom') || '');
    const dateTo   = parseDate(searchParams.get('dateTo')   || '');
    if ((searchParams.get('dateFrom') && !dateFrom) || (searchParams.get('dateTo') && !dateTo)) {
      return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용하세요.' }, { status: 400 });
    }

    const VALID_SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (severity && !VALID_SEVERITY.includes(severity)) {
      return NextResponse.json({ error: `severity는 ${VALID_SEVERITY.join('|')} 중 하나여야 합니다.` }, { status: 400 });
    }

    const where: any = {};
    if (severity) where.cvssScores = { some: { baseSeverity: severity } };

    // keyword, vendor, product를 AND 조건으로 조합
    const andConditions: any[] = [];
    if (keyword) {
      andConditions.push({
        OR: [
          { cveId:       { contains: keyword, mode: 'insensitive' } },
          { description: { path: ['en'], string_contains: keyword } },
          { cpeMappings: { some: { vendor:  { contains: keyword, mode: 'insensitive' } } } },
          { cpeMappings: { some: { product: { contains: keyword, mode: 'insensitive' } } } },
        ],
      });
    }
    if (vendor)  andConditions.push({ cpeMappings: { some: { vendor:  { contains: vendor,  mode: 'insensitive' } } } });
    if (product) andConditions.push({ cpeMappings: { some: { product: { contains: product, mode: 'insensitive' } } } });
    if (andConditions.length > 0) where.AND = andConditions;

    if (kevOnly) where.isKev = true;
    if (kisaKind) where.kisaNotices = kisaKindWhere(kisaKind);
    else if (kisaOnly) where.kisaNotices = { some: {} };
    if (githubOnly) where.githubAdvisories = { some: {} };
    if (epssMin > 0) where.epssScore = { score: { gte: epssMin } };
    if (dateFrom || dateTo) {
      where.publishedAt = {};
      if (dateFrom) where.publishedAt.gte = dateFrom;
      if (dateTo)   where.publishedAt.lte = dateTo;
    }

    const useJsSort = sortBy === 'cvssScore' || sortBy === 'epssScore';
    const orderBy = sortBy === 'modifiedAt'
      ? { modifiedAt: sortOrder }
      : { publishedAt: useJsSort ? 'desc' : sortOrder };

    // JS sort: DB에서 최대 5000건 제한으로 메모리 보호
    const JS_SORT_LIMIT = 5000;

    const [total, vulnsRaw] = await Promise.all([
      prisma.vulnerability.count({ where }),
      prisma.vulnerability.findMany({
        where,
        skip:  useJsSort ? 0 : (page - 1) * limit,
        take:  useJsSort ? JS_SORT_LIMIT : limit,
        orderBy,
        include: {
          cvssScores:    { orderBy: { version: 'desc' } },
          kevEntry:      true,
          cpeMappings:   { take: 5 },
          cweWeaknesses: { take: 5 },
          kisaNotices:   { take: 5, orderBy: { pubDate: 'desc' } },
          githubAdvisories: { take: 5, orderBy: { updatedAt: 'desc' } },
          epssScore:     true,
        },
      }),
    ]);

    let vulns = vulnsRaw as any[];
    if (useJsSort) {
      vulns = [...vulnsRaw].sort((a, b) => {
        const va = sortBy === 'cvssScore'
          ? Number(a.cvssScores[0]?.baseScore ?? -1)
          : Number((a.epssScore as any)?.score ?? -1);
        const vb = sortBy === 'cvssScore'
          ? Number(b.cvssScores[0]?.baseScore ?? -1)
          : Number((b.epssScore as any)?.score ?? -1);
        return sortOrder === 'asc' ? va - vb : vb - va;
      });
      vulns = vulns.slice((page - 1) * limit, page * limit);
    }

    return NextResponse.json({
      data: vulns,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('[v1/vulnerabilities] error:', err);
    return NextResponse.json({ error: '데이터 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
