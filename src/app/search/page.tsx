'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MagnifyingGlass, ShieldWarning, ArrowLeft, ArrowRight, X } from '@phosphor-icons/react';

interface Vuln {
  id: string;
  cveId: string;
  publishedAt: string | null;
  cvssScores: { baseScore: number; baseSeverity: string }[];
  kevEntry: { id: string } | null;
  cpeMappings: { vendor: string; product: string }[];
}

interface SearchResult {
  vulns: Vuln[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const SEV = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEV_ACCENT: Record<string, string> = {
  CRITICAL: 'var(--red)', HIGH: 'var(--orange)', MEDIUM: 'var(--yellow)', LOW: 'var(--green)',
};

export default function SearchPage() {
  const [keyword, setKeyword] = useState('');
  const [severity, setSeverity] = useState('');
  const [kevOnly, setKevOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [results,  setResults]  = useState<SearchResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [apiError, setApiError] = useState('');

  const doSearch = (pg = 1, opts?: { kw?: string; sv?: string; kev?: boolean }) => {
    const kw = opts?.kw !== undefined ? opts.kw : keyword;
    const sv = opts?.sv !== undefined ? opts.sv : severity;
    const kev = opts?.kev !== undefined ? opts.kev : kevOnly;
    setLoading(true);
    const p = new URLSearchParams();
    if (kw) p.set('keyword', kw);
    if (sv) p.set('severity', sv);
    if (kev) p.set('kev', 'true');
    p.set('page', String(pg));
    p.set('limit', '20');
    fetch(`/api/vulnerabilities?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.vulns)) {
          setResults(d); setPage(pg); setApiError('');
        } else {
          setApiError(d?.error || d?.detail || '데이터를 불러오지 못했습니다.');
        }
        setLoading(false);
      })
      .catch((e) => { setApiError(e.message); setLoading(false); });
  };

  useEffect(() => { doSearch(1); }, []);

  const hasFilters = keyword || severity || kevOnly;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="animate-in">
        <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          고급 검색
        </h1>
        {results && (
          <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
            총 <span style={{ color: 'var(--cyan)' }}>{results.total.toLocaleString()}</span>건
          </p>
        )}
      </div>

      {/* Filter bar */}
      <div className="card animate-in delay-100 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-52">
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
              키워드
            </p>
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text" value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch(1)}
                placeholder="CVE-2024-xxxx 또는 키워드..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          </div>

          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
              심각도
            </p>
            <div className="flex gap-1.5">
              {SEV.map((sv) => {
                const active = severity === sv;
                const accent = SEV_ACCENT[sv];
                return (
                  <button
                    key={sv}
                    onClick={() => { const next = active ? '' : sv; setSeverity(next); doSearch(1, { sv: next }); }}
                    className="text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                      background: active ? `${accent}20` : 'var(--elevated)',
                      color: active ? accent : 'var(--text-secondary)',
                      border: `1px solid ${active ? `${accent}40` : 'var(--border-dim)'}`,
                    }}
                  >
                    {sv}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
              필터
            </p>
            <button
              onClick={() => { const next = !kevOnly; setKevOnly(next); doSearch(1, { kev: next }); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                background: kevOnly ? 'var(--red-dim)' : 'var(--elevated)',
                color: kevOnly ? 'var(--red)' : 'var(--text-secondary)',
                border: `1px solid ${kevOnly ? 'rgba(255,59,59,0.3)' : 'var(--border-dim)'}`,
              }}
            >
              <ShieldWarning size={13} /> KEV
            </button>
          </div>

          <div className="flex gap-2">
            {hasFilters && (
              <button
                onClick={() => { setSeverity(''); setKevOnly(false); setKeyword(''); doSearch(1, { kw: '', sv: '', kev: false }); }}
                className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-dim)', background: 'transparent' }}
              >
                <X size={12} /> 초기화
              </button>
            )}
            <button onClick={() => doSearch(1)} className="btn-primary flex items-center gap-2">
              <MagnifyingGlass size={13} /> 검색
            </button>
          </div>
        </div>
      </div>

      {/* API Error */}
      {apiError && !loading && (
        <div className="card animate-in p-4 flex items-center gap-3"
          style={{ borderColor: 'rgba(255,59,59,0.3)', background: 'rgba(255,59,59,0.05)' }}>
          <X size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--red)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>API 오류</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{apiError}</p>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="card animate-in delay-200">
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>CVE ID</th>
                  <th>심각도</th>
                  <th>영향 제품</th>
                  <th>공개일</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {results?.vulns.map((v) => (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/cve/${v.cveId}`} className="link-cyan"
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: '13px' }}>
                        {v.cveId}
                      </Link>
                    </td>
                    <td>
                      {v.cvssScores[0] ? (
                        <SeverityBadge severity={v.cvssScores[0].baseSeverity as any} score={v.cvssScores[0].baseScore} />
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>N/A</span>}
                    </td>
                    <td className="max-w-[200px]">
                      <span className="truncate block"
                        style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
                        {v.cpeMappings.slice(0, 2).map((c) => `${c.vendor}/${c.product}`).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap"
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {v.publishedAt ? format(new Date(v.publishedAt), 'yyyy-MM-dd', { locale: ko }) : '—'}
                    </td>
                    <td>
                      {v.kevEntry ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                          style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(255,59,59,0.2)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                          <ShieldWarning size={10} weight="fill" /> KEV
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
                {results?.total === 0 && (
                  <tr>
                    <td colSpan={5} className="py-14 text-center" style={{ color: 'var(--text-muted)' }}>
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {results && results.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3"
            style={{ borderTop: '1px solid var(--border-dim)' }}>
            <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
              {((page - 1) * 20 + 1).toLocaleString()} – {Math.min(page * 20, results.total).toLocaleString()} / {results.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => doSearch(page - 1)} disabled={page <= 1}
                className="p-1.5 rounded-lg disabled:opacity-30"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}>
                <ArrowLeft size={13} />
              </button>
              {Array.from({ length: Math.min(results.totalPages, 7) }, (_, i) => {
                const start = Math.max(1, page - 3);
                const pg = start + i;
                if (pg > results.totalPages) return null;
                return (
                  <button key={pg} onClick={() => doSearch(pg)}
                    className="w-8 h-8 text-xs rounded-lg"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      background: page === pg ? 'var(--cyan)' : 'var(--elevated)',
                      color: page === pg ? 'var(--base)' : 'var(--text-muted)',
                      border: `1px solid ${page === pg ? 'var(--cyan)' : 'var(--border-dim)'}`,
                      fontWeight: page === pg ? 700 : 400,
                    }}>
                    {pg}
                  </button>
                );
              })}
              <button onClick={() => doSearch(page + 1)} disabled={page >= results.totalPages}
                className="p-1.5 rounded-lg disabled:opacity-30"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
