'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Clock, Biohazard, ArrowUp, ArrowDown, ArrowsDownUp, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { TermTooltip } from '@/components/ui/Tooltip';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

interface KevVuln {
  id: string;
  cveId: string;
  kevEntry: {
    vendorProject: string;
    product: string;
    vulnerabilityName: string;
    dateAdded: string;
    dueDate: string | null;
    requiredAction: string;
    knownRansomwareUse: string;
    cwes: string[];
  };
  cvssScores: { baseScore: number; baseSeverity: string }[];
}

type SortField = 'dateAdded' | 'dueDate' | 'vendorProject';

const RS: Record<string, { color: string; bg: string }> = {
  Confirmed: { color: 'var(--red)',    bg: 'var(--red-dim)' },
  Suspected: { color: 'var(--orange)', bg: 'var(--orange-dim)' },
  Unknown:   { color: 'var(--text-muted)', bg: 'var(--border-dim)' },
};

function SortIcon({ field, current, order }: { field: SortField; current: SortField; order: 'asc' | 'desc' }) {
  if (field !== current) return <ArrowsDownUp size={11} style={{ opacity: 0.3 }} />;
  return order === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
}

export default function KevPage() {
  const [vulns, setVulns] = useState<KevVuln[]>([]);
  const [ransomware, setRansomware] = useState('all');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('dateAdded');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const limit = 50;
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = useCallback((pg: number, opts?: {
    ransomware?: string;
    keyword?: string;
    sortBy?: SortField;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const rs   = opts?.ransomware  ?? ransomware;
    const kw   = opts?.keyword     ?? keyword;
    const sort = opts?.sortBy      ?? sortBy;
    const ord  = opts?.sortOrder   ?? sortOrder;

    setLoading(true);
    const p = new URLSearchParams();
    if (rs !== 'all') p.set('ransomware', rs);
    if (kw) p.set('keyword', kw);
    p.set('sort', sort);
    p.set('order', ord);
    p.set('page', String(pg));
    p.set('limit', String(limit));

    fetch(`/api/kev?${p}`)
      .then(async (r) => {
        const d = await r.json();
        setVulns(d.vulns || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch(() => { setVulns([]); setTotal(0); setTotalPages(1); })
      .finally(() => setLoading(false));
  }, [ransomware, keyword, sortBy, sortOrder]);

  // Initial load and when filters/sort change
  useEffect(() => {
    fetchData(page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ransomware, keyword, sortBy, sortOrder, page]);

  const handleRansomwareChange = (val: string) => {
    setRansomware(val);
    setPage(1);
  };

  const handleKeywordSearch = () => {
    setKeyword(keywordInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleKeywordSearch();
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const thStyle: React.CSSProperties = {
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };

  return (
    <div className="space-y-3">
      <div className="animate-in flex items-start justify-between">
        <div>
          <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            <TermTooltip term="KEV">KEV</TermTooltip> 목록
          </h1>
          <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
            CISA Known Exploited Vulnerabilities ·{' '}
            <span style={{ color: 'var(--red)' }}>{total.toLocaleString()}</span>건
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card animate-in delay-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Keyword search */}
          <div className="flex items-center gap-1 flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="CVE ID / 취약점명 / 벤더 / 제품 검색"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="text-sm px-3 py-2 rounded-lg flex-1"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                background: 'var(--elevated)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleKeywordSearch}
              className="text-sm px-3 py-2 rounded-lg"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                background: 'var(--cyan-dim)',
                border: '1px solid var(--cyan)',
                color: 'var(--cyan)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              검색
            </button>
          </div>

          {/* Ransomware filter */}
          <select
            value={ransomware}
            onChange={(e) => handleRansomwareChange(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <option value="all">랜섬웨어 전체</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Suspected">Suspected</option>
            <option value="Unknown">Unknown</option>
          </select>

          {/* Sort field */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as SortField); setPage(1); }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <option value="dateAdded">정렬: 추가일</option>
            <option value="dueDate">정렬: 시정기한</option>
            <option value="vendorProject">정렬: 벤더</option>
          </select>

          {/* Sort order toggle */}
          <button
            onClick={() => { setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); setPage(1); }}
            className="text-sm px-3 py-2 rounded-lg flex items-center gap-1"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              background: 'var(--elevated)',
              border: '1px solid var(--border-base)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
            {sortOrder === 'asc' ? '오름차순' : '내림차순'}
          </button>
        </div>
      </div>

      <div className="card animate-in delay-100">
        {loading ? (
          <div className="p-6"><LoadingSkeleton rows={10} /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>CVE ID</th>
                    <th>취약점명</th>
                    <th>심각도</th>
                    <th>랜섬웨어</th>
                    <th
                      style={thStyle}
                      onClick={() => handleSort('dateAdded')}
                    >
                      <span className="inline-flex items-center gap-1">
                        추가일 <SortIcon field="dateAdded" current={sortBy} order={sortOrder} />
                      </span>
                    </th>
                    <th
                      style={thStyle}
                      onClick={() => handleSort('dueDate')}
                    >
                      <span className="inline-flex items-center gap-1">
                        시정 기한 <SortIcon field="dueDate" current={sortBy} order={sortOrder} />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vulns.map((v) => {
                    const daysLeft = v.kevEntry.dueDate
                      ? differenceInDays(new Date(v.kevEntry.dueDate), new Date())
                      : null;
                    const rsStyle = RS[v.kevEntry.knownRansomwareUse] || RS.Unknown;
                    const overdue = daysLeft !== null && daysLeft < 0;
                    const urgent  = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
                    const sev = v.cvssScores[0]?.baseSeverity;
                    const sevClass = sev === 'CRITICAL' ? 'sev-critical' : sev === 'HIGH' ? 'sev-high' : '';

                    return (
                      <tr key={v.id} className={sevClass}>
                        <td>
                          <Link
                            href={`/cve/${v.cveId}`}
                            className="link-cyan"
                            style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: '13px' }}
                          >
                            {v.cveId}
                          </Link>
                        </td>
                        <td>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {v.kevEntry.vulnerabilityName || `${v.kevEntry.vendorProject} / ${v.kevEntry.product}`}
                          </span>
                        </td>
                        <td>
                          {v.cvssScores[0] ? (
                            <SeverityBadge severity={v.cvssScores[0].baseSeverity as any} score={v.cvssScores[0].baseScore} />
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>N/A</span>}
                        </td>
                        <td>
                          <span
                            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded"
                            style={{
                              background: rsStyle.bg,
                              color: rsStyle.color,
                              fontFamily: 'JetBrains Mono, monospace',
                              fontWeight: 600,
                              border: `1px solid ${rsStyle.color}30`,
                            }}
                          >
                            {v.kevEntry.knownRansomwareUse === 'Confirmed' && <Biohazard size={10} />}
                            {v.kevEntry.knownRansomwareUse}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {v.kevEntry.dateAdded
                              ? format(new Date(v.kevEntry.dateAdded), 'yyyy-MM-dd', { locale: ko })
                              : '—'}
                          </span>
                        </td>
                        <td>
                          {v.kevEntry.dueDate ? (
                            <span
                              className="flex items-center gap-1.5 text-xs"
                              style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                color: overdue ? 'var(--red)' : urgent ? 'var(--orange)' : 'var(--text-secondary)',
                              }}
                            >
                              <Clock size={11} />
                              {format(new Date(v.kevEntry.dueDate), 'yyyy-MM-dd', { locale: ko })}
                              {overdue && <span className="font-bold ml-1">초과</span>}
                              {urgent && !overdue && <span className="ml-1">D-{daysLeft}</span>}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {!vulns.length && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                        데이터 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: '1px solid var(--border-dim)' }}
              >
                <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                  {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} / {total.toLocaleString()}건
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      background: 'var(--elevated)',
                      border: '1px solid var(--border-dim)',
                      color: page <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <CaretLeft size={12} /> 이전
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className="text-xs px-2.5 py-1.5 rounded"
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          background: pageNum === page ? 'var(--cyan-dim)' : 'var(--elevated)',
                          border: `1px solid ${pageNum === page ? 'var(--cyan)' : 'var(--border-dim)'}`,
                          color: pageNum === page ? 'var(--cyan)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontWeight: pageNum === page ? 700 : 400,
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      background: 'var(--elevated)',
                      border: '1px solid var(--border-dim)',
                      color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    다음 <CaretRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
