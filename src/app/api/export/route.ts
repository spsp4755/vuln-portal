import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/* ─── CSV helpers ───────────────────────────────────────── */
function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function csvRow(cols: unknown[]): string {
  return cols.map(esc).join(',');
}

/* ─── Export handler ────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type     = searchParams.get('type') || 'vulnerabilities';
  const format   = searchParams.get('format') || 'json';   // json | csv
  const severity = searchParams.get('severity') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo   = searchParams.get('dateTo') || '';
  const kevOnly  = searchParams.get('kev') === 'true';
  const keyword  = searchParams.get('keyword') || '';
  const limit    = Math.min(parseInt(searchParams.get('limit') || '10000'), 50000);

  try {
    if (type === 'vulnerabilities') {
      const where: any = {};
      if (severity) where.cvssScores = { some: { baseSeverity: severity } };
      if (kevOnly)  where.isKev = true;
      if (keyword)  where.OR = [
        { cveId: { contains: keyword } },
        { description: { path: ['en'], contains: keyword, mode: 'insensitive' } },
      ];
      if (dateFrom || dateTo) {
        where.publishedAt = {};
        if (dateFrom) where.publishedAt.gte = new Date(dateFrom);
        if (dateTo)   where.publishedAt.lte = new Date(dateTo);
      }

      const rows = await prisma.vulnerability.findMany({
        where,
        take: limit,
        orderBy: { publishedAt: 'desc' },
        include: {
          cvssScores:   { orderBy: { version: 'desc' } },
          kevEntry:     true,
          cpeMappings:  { take: 5 },
          cweWeaknesses: true,
        },
      });

      if (format === 'csv') {
        const header = csvRow([
          'CVE ID','Published','Modified','Severity','CVSS Score','CVSS Version',
          'Vector','Attack Vector','Complexity','Privileges Required','User Interaction',
          'Is KEV','KEV Due Date','KEV Vendor','KEV Product','Ransomware',
          'CWE IDs','CPE Vendors','CPE Products','Description (EN)',
        ]);
        const lines = rows.map((r) => {
          const cvss = r.cvssScores[0];
          const kev  = r.kevEntry;
          const desc = ((r.description as any)?.en || '').replace(/\n/g, ' ');
          return csvRow([
            r.cveId,
            r.publishedAt?.toISOString().slice(0,10) ?? '',
            r.modifiedAt?.toISOString().slice(0,10) ?? '',
            cvss?.baseSeverity ?? '',
            cvss?.baseScore ?? '',
            cvss?.version ?? '',
            cvss?.vectorString ?? '',
            cvss?.attackVector ?? '',
            cvss?.attackComplexity ?? '',
            cvss?.privilegesRequired ?? '',
            cvss?.userInteraction ?? '',
            r.isKev ? 'YES' : 'NO',
            kev?.dueDate?.toISOString().slice(0,10) ?? '',
            kev?.vendorProject ?? '',
            kev?.product ?? '',
            kev?.knownRansomwareUse ?? '',
            r.cweWeaknesses.map((w) => w.cweId).join(';'),
            Array.from(new Set(r.cpeMappings.map((c) => c.vendor))).join(';'),
            Array.from(new Set(r.cpeMappings.map((c) => c.product))).join(';'),
            desc,
          ]);
        });
        const csv = [header, ...lines].join('\n');
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="vulnerabilities_${new Date().toISOString().slice(0,10)}.csv"`,
          },
        });
      }

      // JSON
      const data = rows.map((r) => {
        const cvss = r.cvssScores[0];
        const kev  = r.kevEntry;
        return {
          cveId:        r.cveId,
          publishedAt:  r.publishedAt,
          modifiedAt:   r.modifiedAt,
          isKev:        r.isKev,
          description:  r.description,
          cvss: cvss ? {
            version: cvss.version, score: cvss.baseScore,
            severity: cvss.baseSeverity, vector: cvss.vectorString,
          } : null,
          kev: kev ? {
            vendorProject: kev.vendorProject, product: kev.product,
            dueDate: kev.dueDate, ransomware: kev.knownRansomwareUse,
            requiredAction: kev.requiredAction,
          } : null,
          cwes: r.cweWeaknesses.map((w) => ({ id: w.cweId, name: w.name })),
          cpes: r.cpeMappings.map((c) => ({ vendor: c.vendor, product: c.product, uri: c.cpeUri })),
          references: r.references,
        };
      });
      return new NextResponse(JSON.stringify({ exportedAt: new Date(), count: data.length, data }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="vulnerabilities_${new Date().toISOString().slice(0,10)}.json"`,
        },
      });
    }

    if (type === 'kev') {
      const rows = await prisma.kevEntry.findMany({
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: { vulnerability: { include: { cvssScores: { orderBy: { version: 'desc' }, take: 1 } } } },
      });

      if (format === 'csv') {
        const header = csvRow(['CVE ID','Vendor','Product','Vulnerability Name','Date Added','Due Date','Required Action','Ransomware','CVSS Score','Severity']);
        const lines = rows.map((r) => csvRow([
          r.vulnerability.cveId,
          r.vendorProject, r.product,
          r.vulnerabilityName ?? '',
          r.dateAdded?.toISOString().slice(0,10) ?? '',
          r.dueDate?.toISOString().slice(0,10) ?? '',
          (r.requiredAction ?? '').replace(/\n/g,' '),
          r.knownRansomwareUse,
          r.vulnerability.cvssScores[0]?.baseScore ?? '',
          r.vulnerability.cvssScores[0]?.baseSeverity ?? '',
        ]));
        const csv = [header, ...lines].join('\n');
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="kev_${new Date().toISOString().slice(0,10)}.csv"`,
          },
        });
      }
      return new NextResponse(JSON.stringify({ exportedAt: new Date(), count: rows.length, data: rows }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="kev_${new Date().toISOString().slice(0,10)}.json"`,
        },
      });
    }

    if (type === 'eol') {
      const where: any = {};
      const categoryParam = searchParams.get('category');
      const statusParam   = searchParams.get('status');
      if (categoryParam) where.category = categoryParam;
      if (statusParam === 'eol')      where.isEol = true;
      if (statusParam === 'active')   where.isEol = false;
      if (statusParam === 'due-soon') {
        where.isEol = false;
        where.eolDate = { gte: new Date(), lte: new Date(Date.now() + 90*24*60*60*1000) };
      }

      const rows = await prisma.eolData.findMany({ where, take: limit, orderBy: { eolDate: 'asc' } });

      if (format === 'csv') {
        const header = csvRow(['Product','Cycle','Codename','Category','Release Date','EOL Date','Is EOL','LTS','Support Status']);
        const lines = rows.map((r) => csvRow([
          r.product, r.cycle, r.codename ?? '', r.category,
          r.releaseDate?.toISOString().slice(0,10) ?? '',
          r.eolDate?.toISOString().slice(0,10) ?? '',
          r.isEol ? 'YES' : 'NO',
          r.lts ? 'YES' : 'NO',
          r.supportStatus,
        ]));
        const csv = [header, ...lines].join('\n');
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="eol_${new Date().toISOString().slice(0,10)}.csv"`,
          },
        });
      }
      return new NextResponse(JSON.stringify({ exportedAt: new Date(), count: rows.length, data: rows }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="eol_${new Date().toISOString().slice(0,10)}.json"`,
        },
      });
    }

    if (type === 'collection-logs') {
      const rows = await prisma.collectionLog.findMany({ take: limit, orderBy: { startedAt: 'desc' } });
      if (format === 'csv') {
        const header = csvRow(['ID','Source','Started At','Completed At','Status','Records Fetched','Records New','Records Updated','Error']);
        const lines = rows.map((r) => csvRow([
          r.id, r.source ?? 'all',
          r.startedAt.toISOString(),
          r.completedAt?.toISOString() ?? '',
          r.status,
          r.recordsFetched, r.recordsNew, r.recordsUpdated,
          r.error ?? '',
        ]));
        const csv = [header, ...lines].join('\n');
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="collection_logs_${new Date().toISOString().slice(0,10)}.csv"`,
          },
        });
      }
      return new NextResponse(JSON.stringify({ exportedAt: new Date(), count: rows.length, data: rows }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="collection_logs_${new Date().toISOString().slice(0,10)}.json"`,
        },
      });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* ─── Count endpoint (for preview) ─────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, severity, dateFrom, dateTo, kevOnly, keyword, category, status } = body;

    if (type === 'vulnerabilities') {
      const where: any = {};
      if (severity) where.cvssScores = { some: { baseSeverity: severity } };
      if (kevOnly)  where.isKev = true;
      if (keyword)  where.OR = [
        { cveId: { contains: keyword } },
        { description: { path: ['en'], contains: keyword, mode: 'insensitive' } },
      ];
      if (dateFrom || dateTo) {
        where.publishedAt = {};
        if (dateFrom) where.publishedAt.gte = new Date(dateFrom);
        if (dateTo)   where.publishedAt.lte = new Date(dateTo);
      }
      const count = await prisma.vulnerability.count({ where });
      return NextResponse.json({ count });
    }
    if (type === 'kev') {
      const count = await prisma.kevEntry.count();
      return NextResponse.json({ count });
    }
    if (type === 'eol') {
      const where: any = {};
      if (category) where.category = category;
      if (status === 'eol')      where.isEol = true;
      if (status === 'active')   where.isEol = false;
      if (status === 'due-soon') {
        where.isEol = false;
        where.eolDate = { gte: new Date(), lte: new Date(Date.now() + 90*24*60*60*1000) };
      }
      const count = await prisma.eolData.count({ where });
      return NextResponse.json({ count });
    }
    if (type === 'collection-logs') {
      const count = await prisma.collectionLog.count();
      return NextResponse.json({ count });
    }
    return NextResponse.json({ count: 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
