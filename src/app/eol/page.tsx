'use client';

import { useEffect, useState } from 'react';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { CalendarX, ArrowUp, ArrowDown, ArrowsDownUp } from '@phosphor-icons/react';
import { TermTooltip, Tooltip } from '@/components/ui/Tooltip';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

interface EolItem {
  id: string;
  product: string;
  cycle: string;
  codename?: string | null;
  releaseDate: string | null;
  eolDate: string | null;
  isEol: boolean;
  lts: boolean;
  supportStatus: string;
  category: string;
}

type SortField = 'eolDate' | 'releaseDate' | 'product' | 'cycle';

const CATEGORY_LABELS: Record<string, string> = {
  os: 'OS', browser: '브라우저', runtime: '런타임',
  framework: '프레임워크', database: '데이터베이스', infra: '인프라',
};

export default function EolPage() {
  const [items, setItems] = useState<EolItem[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('all');
  const [eolBefore, setEolBefore] = useState(''); // 특정 날짜까지 EOL 예정 (커스텀)
  const [sortBy, setSortBy] = useState<SortField>('eolDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (category) p.set('category', category);
    if (eolBefore) p.set('eolBefore', eolBefore); // 있으면 status보다 우선
    else p.set('status', status);
    p.set('sort', sortBy);
    p.set('order', sortOrder);
    fetch(`/api/eol?${p}`)
      .then(async (r) => {
        const d = await r.json();
        setItems(Array.isArray(d) ? d : (d.items || []));
        setTotal(d.total || 0);
      })
      .catch(() => { setItems([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [category, status, eolBefore, sortBy, sortOrder]);

  function handleColumnSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return <ArrowsDownUp size={11} style={{ opacity: 0.4 }} />;
    return sortOrder === 'asc'
      ? <ArrowUp size={11} style={{ color: 'var(--cyan)' }} />
      : <ArrowDown size={11} style={{ color: 'var(--cyan)' }} />;
  }

  return (
    <div className="space-y-3">
      <div className="animate-in flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            <TermTooltip term="EOL">EOL</TermTooltip> 임박 제품
          </h1>
          <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
            End of Life · 지원 종료 현황
            {!loading && (
              <span className="ml-2" style={{ color: 'var(--cyan)' }}>총 {total}건</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <option value="">전체 카테고리</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={!!eolBefore}
            title={eolBefore ? '날짜 필터 사용 중 — 상태 필터는 비활성화됩니다' : undefined}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ fontFamily: 'JetBrains Mono, monospace', opacity: eolBefore ? 0.4 : 1 }}
          >
            <option value="all">전체</option>
            <option value="due-soon">90일 내 EOL</option>
            <option value="active">Active</option>
            <option value="eol">EOL(종료됨)</option>
          </select>

          {/* 커스텀: 특정 날짜까지 지원 종료 예정 */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
            style={{ background: eolBefore ? 'var(--cyan-dim)' : 'var(--border-dim)', border: `1px solid ${eolBefore ? 'rgba(0,212,255,0.3)' : 'transparent'}` }}>
            <Tooltip content="선택한 날짜까지(지금부터) 지원이 종료되는 제품만 표시합니다. 예: 2027-12-31 → 그때까지 EOL 예정인 제품. 설정 시 위 상태 필터보다 우선합니다.">
              <span className="text-xs whitespace-nowrap" style={{ fontFamily: 'JetBrains Mono, monospace', color: eolBefore ? 'var(--cyan)' : 'var(--text-muted)' }}>~까지 EOL</span>
            </Tooltip>
            <input
              type="date"
              value={eolBefore}
              onChange={(e) => setEolBefore(e.target.value)}
              className="text-xs px-1.5 py-1 rounded"
              style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--surface)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}
            />
            {eolBefore && (
              <button onClick={() => setEolBefore('')} title="날짜 필터 해제"
                style={{ color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <option value="eolDate">EOL 날짜순</option>
            <option value="releaseDate">릴리스일순</option>
            <option value="product">제품명순</option>
            <option value="cycle">버전순</option>
          </select>
          <button
            onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="text-sm px-3 py-2 rounded-lg flex items-center gap-1"
            style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--border-dim)', color: 'var(--text-secondary)' }}
            title={sortOrder === 'asc' ? '오름차순' : '내림차순'}
          >
            {sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
            {sortOrder === 'asc' ? '오름' : '내림'}
          </button>
        </div>
      </div>

      <div className="card animate-in delay-100">
        {loading ? (
          <div className="p-6"><LoadingSkeleton rows={10} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleColumnSort('product')}
                  >
                    <span className="flex items-center gap-1">
                      <Tooltip content="endoflife.date에서 추적하는 소프트웨어 제품명 (예: ubuntu, nodejs, postgresql)">제품</Tooltip>
                      <SortIcon field="product" />
                    </span>
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleColumnSort('cycle')}
                  >
                    <span className="flex items-center gap-1">
                      <Tooltip content="제품의 릴리스 주기 = 메이저 버전 라인. 예: Ubuntu 22.04, Node.js 20, PostgreSQL 16. endoflife.date의 'cycle' 값으로, 각 버전마다 지원 기간이 다릅니다.">버전(사이클)</Tooltip>
                      <SortIcon field="cycle" />
                    </span>
                  </th>
                  <th>
                    <Tooltip content="제품 분류: OS · 브라우저 · 런타임 · 프레임워크 · 데이터베이스 · 인프라">카테고리</Tooltip>
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleColumnSort('releaseDate')}
                  >
                    <span className="flex items-center gap-1">
                      <Tooltip content="해당 버전이 정식 출시된 날짜">릴리스일</Tooltip>
                      <SortIcon field="releaseDate" />
                    </span>
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleColumnSort('eolDate')}
                  >
                    <span className="flex items-center gap-1">
                      <Tooltip content="제조사의 보안 지원이 종료되는(된) 날짜. 이 날짜 이후에는 보안 패치가 제공되지 않아 위험합니다.">EOL 날짜</Tooltip>
                      <SortIcon field="eolDate" />
                    </span>
                  </th>
                  <th>
                    <Tooltip content="임박 = 90일 내 지원 종료 예정 · EOL = 이미 지원 종료 · Active = 지원 중">상태</Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const daysLeft = item.eolDate ? differenceInDays(new Date(item.eolDate), new Date()) : null;
                  const overdue  = daysLeft !== null && daysLeft < 0;
                  const soon     = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;

                  return (
                    <tr key={item.id}>
                      <td>
                        <span style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                          {item.product}
                        </span>
                        {item.codename && (
                          <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>{item.codename}</span>
                        )}
                        {item.lts && (
                          <span
                            className="ml-2 text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--green-dim)', color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
                          >
                            LTS
                          </span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--cyan)' }}>
                        {item.cycle}
                      </td>
                      <td>
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: 'var(--border-dim)', color: 'var(--text-muted)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600 }}
                        >
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                          {item.releaseDate ? format(new Date(item.releaseDate), 'yyyy-MM-dd', { locale: ko }) : '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          className="flex items-center gap-1.5 text-xs"
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            color: overdue ? 'var(--red)' : soon ? 'var(--orange)' : 'var(--text-secondary)',
                          }}
                        >
                          <CalendarX size={11} />
                          {item.eolDate ? format(new Date(item.eolDate), 'yyyy-MM-dd', { locale: ko }) : 'N/A'}
                          {daysLeft !== null && overdue && (
                            <span className="ml-1" style={{ color: 'var(--red)' }}>{Math.abs(daysLeft)}일 경과</span>
                          )}
                          {daysLeft !== null && !overdue && daysLeft <= 90 && (
                            <span className="ml-1" style={{ color: 'var(--orange)' }}>D-{daysLeft}</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 600,
                            background: overdue ? 'var(--red-dim)' : soon ? 'var(--orange-dim)' : 'var(--green-dim)',
                            color: overdue ? 'var(--red)' : soon ? 'var(--orange)' : 'var(--green)',
                            border: `1px solid ${overdue ? 'rgba(255,59,59,0.2)' : soon ? 'rgba(255,143,0,0.2)' : 'rgba(16,185,129,0.2)'}`,
                          }}
                        >
                          {overdue ? 'EOL' : soon ? '임박' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!items.length && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                      데이터 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
