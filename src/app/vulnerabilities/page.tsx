'use client';

import { Suspense, useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ShieldWarning, MagnifyingGlass, ArrowLeft, ArrowRight, X, CalendarBlank, SortAscending, ArrowUp, ArrowDown, Translate, Sparkle, CaretDown } from '@phosphor-icons/react';
import { TermTooltip } from '@/components/ui/Tooltip';

interface AiSummaryLite {
  summaryKo: string; riskLevel: string; riskReason?: string | null; recommendation?: string | null;
}
interface Vuln {
  id: string; cveId: string; publishedAt: string | null; modifiedAt: string | null;
  cvssScores: { baseScore: number; baseSeverity: string; version: string }[];
  kevEntry: { id: string } | null;
  cpeMappings: { vendor: string; product: string }[];
  cweWeaknesses: { cweId: string }[];
  epssScore: { score: number } | null;
  description: { ko?: string; en?: string };
  aiSummary?: AiSummaryLite | null;
}

// ko 값에 한글이 있을 때만 '실제 번역'으로 간주 (NVD가 ko에 영어를 복사해 넣는 경우 제외)
const hasHangul = (s?: string | null) => /[가-힣]/.test(s || '');

const RISK_BG: Record<string, string> = {
  '심각': 'rgba(255,59,59,0.15)', '높음': 'rgba(255,143,0,0.15)', '중간': 'rgba(245,197,24,0.15)', '낮음': 'rgba(0,212,255,0.15)',
};
const RISK_FG: Record<string, string> = {
  '심각': 'var(--red)', '높음': 'var(--orange)', '중간': 'var(--yellow)', '낮음': 'var(--cyan)',
};

interface SearchResult {
  vulns: Vuln[]; total: number; page: number; limit: number; totalPages: number;
}

const SEV = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEV_ACCENT: Record<string, string> = {
  CRITICAL: 'var(--red)', HIGH: 'var(--orange)', MEDIUM: 'var(--yellow)', LOW: 'var(--green)',
};

type SortCol = 'publishedAt' | 'modifiedAt' | 'cvssScore' | 'epssScore';

function SortIcon({ col, sortBy, sortOrder }: { col: SortCol; sortBy: SortCol; sortOrder: 'asc' | 'desc' }) {
  if (sortBy !== col) return <span style={{ opacity: 0.25, marginLeft: 3 }}>↕</span>;
  return sortOrder === 'asc'
    ? <ArrowUp size={11} style={{ marginLeft: 3, color: 'var(--cyan)' }} />
    : <ArrowDown size={11} style={{ marginLeft: 3, color: 'var(--cyan)' }} />;
}

function VulnerabilitiesContent() {
  const searchParams = useSearchParams();
  const [keyword,   setKeyword]   = useState('');
  const [severity,  setSeverity]  = useState(searchParams.get('severity') || '');
  const [kevOnly,   setKevOnly]   = useState(false);
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [limit,     setLimit]     = useState(20);
  const [page,      setPage]      = useState(1);
  const [epssMin,   setEpssMin]   = useState('');
  const [sortBy,    setSortBy]    = useState<SortCol>('publishedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [results,   setResults]   = useState<SearchResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [apiError,  setApiError]  = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AI 번역/조치
  const [translating, setTranslating] = useState(false);
  const [transMsg,    setTransMsg]    = useState('');
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [rowBusy,     setRowBusy]     = useState<Record<string, boolean>>({});
  const [rowError,    setRowError]    = useState<Record<string, string>>({});
  const [rowLang,     setRowLang]     = useState<Record<string, 'en' | 'ko'>>({});
  const [langBusy,    setLangBusy]    = useState<Record<string, boolean>>({});

  // results.vulns 중 일부 CVE를 번역/분석 결과로 갱신
  const patchVulns = useCallback((updates: Record<string, { descriptionKo?: string | null; aiSummary?: AiSummaryLite }>) => {
    setResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        vulns: prev.vulns.map((v) => {
          const u = updates[v.cveId];
          if (!u) return v;
          return {
            ...v,
            description: u.descriptionKo ? { ...v.description, ko: u.descriptionKo } : v.description,
            aiSummary: u.aiSummary ?? v.aiSummary,
          };
        }),
      };
    });
  }, []);

  // 현재 페이지 일괄 번역
  const translatePage = useCallback(async () => {
    if (!results?.vulns.length || translating) return;
    const cveIds = results.vulns.map((v) => v.cveId);
    setTranslating(true);
    setTransMsg(`번역 중... (${cveIds.length}건)`);
    try {
      const res = await fetch('/api/ai/translate-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cveIds }),
      });
      const data = await res.json();
      if (!res.ok) { setTransMsg(`실패: ${data.error || '오류'}`); return; }
      const updates: Record<string, any> = {};
      for (const [cveId, r] of Object.entries<any>(data.results || {})) {
        if (r && !r.error) updates[cveId] = { descriptionKo: r.descriptionKo, aiSummary: r.aiSummary };
      }
      patchVulns(updates);
      setTransMsg(`완료 · 번역 ${data.done}건 / 건너뜀 ${data.skipped}건${data.failed ? ` / 실패 ${data.failed}건` : ''}`);
      setTimeout(() => setTransMsg(''), 5000);
    } catch (e: any) {
      setTransMsg(`실패: ${e.message}`);
    } finally {
      setTranslating(false);
    }
  }, [results, translating, patchVulns]);

  // 행 조치 방법 펼침 (없으면 생성)
  const toggleRemediation = useCallback(async (v: Vuln) => {
    if (expanded === v.cveId) { setExpanded(null); return; }
    setExpanded(v.cveId);
    setRowError((p) => ({ ...p, [v.cveId]: '' }));
    if (v.aiSummary?.recommendation) return; // 이미 있음
    setRowBusy((p) => ({ ...p, [v.cveId]: true }));
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cveId: v.cveId }),
      });
      const data = await res.json();
      if (res.ok) {
        patchVulns({ [v.cveId]: { descriptionKo: data.descriptionKo, aiSummary: data.aiSummary } });
      } else {
        setRowError((p) => ({ ...p, [v.cveId]: data.error || 'AI 분석 실패' }));
      }
    } catch (e: any) {
      setRowError((p) => ({ ...p, [v.cveId]: e.message }));
    } finally {
      setRowBusy((p) => ({ ...p, [v.cveId]: false }));
    }
  }, [expanded, patchVulns]);

  // 설명 한국어 ↔ 원문(EN) 토글. 한국어가 없으면 AI로 생성 후 표시.
  const toggleLang = useCallback(async (v: Vuln) => {
    const koExists = hasHangul((v.description as any)?.ko);
    const cur = rowLang[v.cveId] ?? (koExists ? 'ko' : 'en');
    if (cur === 'ko') { setRowLang((p) => ({ ...p, [v.cveId]: 'en' })); return; }
    if (koExists) { setRowLang((p) => ({ ...p, [v.cveId]: 'ko' })); return; }
    // 한국어 없음 → 생성
    setLangBusy((p) => ({ ...p, [v.cveId]: true }));
    setRowError((p) => ({ ...p, [v.cveId]: '' }));
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cveId: v.cveId }),
      });
      const data = await res.json();
      if (res.ok) {
        patchVulns({ [v.cveId]: { descriptionKo: data.descriptionKo, aiSummary: data.aiSummary } });
        setRowLang((p) => ({ ...p, [v.cveId]: 'ko' }));
      } else {
        setRowError((p) => ({ ...p, [v.cveId]: data.error || 'AI 번역 실패' }));
      }
    } catch (e: any) {
      setRowError((p) => ({ ...p, [v.cveId]: e.message }));
    } finally {
      setLangBusy((p) => ({ ...p, [v.cveId]: false }));
    }
  }, [rowLang, patchVulns]);

  const doSearch = useCallback((pg = 1, opts?: {
    kw?: string; sv?: string; kev?: boolean; from?: string; to?: string; lim?: number;
    sort?: SortCol; order?: 'asc' | 'desc'; epss?: string;
  }) => {
    const kw    = opts?.kw    !== undefined ? opts.kw    : keyword;
    const sv    = opts?.sv    !== undefined ? opts.sv    : severity;
    const kev   = opts?.kev   !== undefined ? opts.kev   : kevOnly;
    const from  = opts?.from  !== undefined ? opts.from  : dateFrom;
    const to    = opts?.to    !== undefined ? opts.to    : dateTo;
    const lim   = opts?.lim   !== undefined ? opts.lim   : limit;
    const sort  = opts?.sort  !== undefined ? opts.sort  : sortBy;
    const order = opts?.order !== undefined ? opts.order : sortOrder;
    const epss  = opts?.epss  !== undefined ? opts.epss  : epssMin;

    setLoading(true);
    const p = new URLSearchParams();
    if (kw)   p.set('keyword',  kw);
    if (sv)   p.set('severity', sv);
    if (kev)  p.set('kev',      'true');
    if (from) p.set('dateFrom', from);
    if (to)   p.set('dateTo',   to);
    p.set('page',  String(pg));
    p.set('limit', String(lim));
    p.set('sort',  sort);
    p.set('order', order);
    if (epss) {
      const val = parseFloat(epss);
      if (!isNaN(val) && val > 0) p.set('epssMin', String(val / 100));
    }

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
  }, [keyword, severity, kevOnly, dateFrom, dateTo, limit, sortBy, sortOrder, epssMin]);

  // 초기 로드
  useEffect(() => { doSearch(1); }, []);

  // 키워드 디바운스
  const handleKeywordChange = (val: string) => {
    setKeyword(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(1, { kw: val }), 400);
  };

  const handleReset = () => {
    setSeverity(''); setKevOnly(false); setKeyword(''); setDateFrom(''); setDateTo('');
    setEpssMin(''); setSortBy('publishedAt'); setSortOrder('desc');
    doSearch(1, { kw: '', sv: '', kev: false, from: '', to: '', epss: '', sort: 'publishedAt', order: 'desc' });
  };

  const toggleSort = (col: SortCol) => {
    if (sortBy === col) {
      const next = sortOrder === 'desc' ? 'asc' : 'desc';
      setSortOrder(next);
      doSearch(1, { sort: col, order: next });
    } else {
      setSortBy(col);
      setSortOrder('desc');
      doSearch(1, { sort: col, order: 'desc' });
    }
  };

  const hasFilters = keyword || severity || kevOnly || dateFrom || dateTo || epssMin;

  const thStyle = (col: SortCol): React.CSSProperties => ({
    cursor: 'pointer',
    userSelect: 'none',
    color: sortBy === col ? 'var(--cyan)' : undefined,
    whiteSpace: 'nowrap',
  });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="animate-in flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            취약점 목록
          </h1>
          {results && (
            <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
              총 <span style={{ color: 'var(--cyan)' }}>{results.total.toLocaleString()}</span>건
              {hasFilters && <span className="ml-1.5" style={{ color: 'var(--orange)' }}>· 필터 적용됨</span>}
            </p>
          )}
        </div>
        {/* AI 일괄 번역 */}
        <div className="flex items-center gap-2">
          {transMsg && (
            <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{transMsg}</span>
          )}
          <button
            onClick={translatePage}
            disabled={translating || !results?.vulns.length}
            title="현재 페이지의 취약점 설명을 한국어로 번역하고 AI 분석을 생성합니다"
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all"
            style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700,
              background: 'rgba(124,58,237,0.15)', color: '#a78bfa',
              border: '1px solid rgba(124,58,237,0.3)', opacity: translating ? 0.6 : 1,
            }}
          >
            <Translate size={14} weight={translating ? 'bold' : 'regular'} />
            {translating ? '번역 중...' : '이 페이지 번역'}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card animate-in delay-100 p-3 space-y-3">
        {/* Row 1: Keyword + Severity + KEV + EPSS */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Keyword */}
          <div className="flex-1 min-w-52">
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>키워드</p>
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text" value={keyword}
                onChange={(e) => handleKeywordChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch(1)}
                placeholder="CVE ID, 제품명, 키워드..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          </div>

          {/* Severity */}
          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>심각도</p>
            <div className="flex gap-1.5">
              {SEV.map((sv) => {
                const active = severity === sv;
                const accent = SEV_ACCENT[sv];
                return (
                  <button key={sv}
                    onClick={() => { const next = active ? '' : sv; setSeverity(next); doSearch(1, { sv: next }); }}
                    className="text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                      background: active ? `${accent}20` : 'var(--elevated)',
                      color: active ? accent : 'var(--text-muted)',
                      border: `1px solid ${active ? `${accent}40` : 'var(--border-dim)'}`,
                    }}
                  >{sv}</button>
                );
              })}
            </div>
          </div>

          {/* KEV */}
          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>필터</p>
            <button
              onClick={() => { const next = !kevOnly; setKevOnly(next); doSearch(1, { kev: next }); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                background: kevOnly ? 'var(--red-dim)' : 'var(--elevated)',
                color: kevOnly ? 'var(--red)' : 'var(--text-muted)',
                border: `1px solid ${kevOnly ? 'rgba(255,59,59,0.3)' : 'var(--border-dim)'}`,
              }}
            >
              <ShieldWarning size={13} /> KEV
            </button>
          </div>

          {/* EPSS Min */}
          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>EPSS ≥</p>
            <div className="flex items-center gap-1">
              <input
                type="number" value={epssMin} min={0} max={100} step={0.1}
                onChange={(e) => { setEpssMin(e.target.value); doSearch(1, { epss: e.target.value }); }}
                placeholder="0"
                className="w-20 px-2 py-1.5 text-xs rounded-lg"
                style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
            </div>
          </div>
        </div>

        {/* Row 2: Date range + Per-page + Actions */}
        <div className="flex flex-wrap items-end gap-3" style={{ borderTop: '1px solid var(--border-dim)', paddingTop: '10px' }}>
          {/* Date range */}
          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
              <CalendarBlank size={10} style={{ display: 'inline', marginRight: 4 }} />공개일 범위
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); doSearch(1, { from: e.target.value }); }}
                className="px-2 py-1.5 text-xs rounded-lg"
                style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>~</span>
              <input
                type="date" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); doSearch(1, { to: e.target.value }); }}
                className="px-2 py-1.5 text-xs rounded-lg"
                style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}
              />
            </div>
          </div>

          {/* Per-page */}
          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
              <SortAscending size={10} style={{ display: 'inline', marginRight: 4 }} />페이지당
            </p>
            <div className="flex gap-1.5">
              {[20, 50, 100].map((n) => (
                <button key={n}
                  onClick={() => { setLimit(n); doSearch(1, { lim: n }); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg transition-all"
                  style={{
                    fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                    background: limit === n ? 'var(--cyan-dim)' : 'var(--elevated)',
                    color: limit === n ? 'var(--cyan)' : 'var(--text-muted)',
                    border: `1px solid ${limit === n ? 'rgba(0,212,255,0.3)' : 'var(--border-dim)'}`,
                  }}
                >{n}</button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 ml-auto">
            {hasFilters && (
              <button onClick={handleReset}
                className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg transition-all"
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

      {/* Table */}
      <div className="card animate-in delay-200">
        {loading ? (
          <div className="p-6"><div className="space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>CVE ID</th>
                  <th>설명</th>
                  <th onClick={() => toggleSort('cvssScore')} style={thStyle('cvssScore')}>
                    심각도 <SortIcon col="cvssScore" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  <th onClick={() => toggleSort('epssScore')} style={thStyle('epssScore')}>
                    <TermTooltip term="EPSS">EPSS</TermTooltip> <SortIcon col="epssScore" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  <th onClick={() => toggleSort('publishedAt')} style={thStyle('publishedAt')}>
                    공개일 <SortIcon col="publishedAt" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  <th onClick={() => toggleSort('modifiedAt')} style={thStyle('modifiedAt')}>
                    수정일 <SortIcon col="modifiedAt" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  <th>상태</th>
                  <th style={{ whiteSpace: 'nowrap' }}>조치</th>
                </tr>
              </thead>
              <tbody>
                {results?.vulns.map((v) => {
                  const cvss = v.cvssScores[0];
                  const koRaw = (v.description as any)?.ko;
                  const koDesc = hasHangul(koRaw) ? String(koRaw).trim() : '';
                  const enDesc = (v.description as any)?.en || '';
                  const lang = rowLang[v.cveId] ?? (koDesc ? 'ko' : 'en');
                  const desc = ((lang === 'ko' ? koDesc : enDesc) || '').slice(0, 130);
                  const sevClass = cvss?.baseSeverity === 'CRITICAL' ? 'sev-critical' : cvss?.baseSeverity === 'HIGH' ? 'sev-high' : '';
                  const isOpen = expanded === v.cveId;
                  const ai = v.aiSummary;
                  const langLoading = langBusy[v.cveId];
                  return (
                    <Fragment key={v.id}>
                    <tr className={sevClass}>
                      <td className="whitespace-nowrap">
                        <Link href={`/cve/${v.cveId}`} className="link-cyan"
                          style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: '13px' }}>
                          {v.cveId}
                        </Link>
                      </td>
                      <td className="max-w-xs">
                        <span className="line-clamp-2" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                          {desc || '—'}
                        </span>
                        <button
                          onClick={() => toggleLang(v)}
                          disabled={langLoading}
                          title={lang === 'ko' ? '원문(영어) 보기' : '한국어로 보기'}
                          className="inline-flex items-center gap-1 mt-1 text-xs px-1.5 py-0.5 rounded transition-all"
                          style={{ background: 'rgba(124,58,237,0.12)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.25)', fontFamily: 'JetBrains Mono, monospace', fontSize: '9px' }}>
                          <Sparkle size={8} weight="fill" />
                          {langLoading ? '번역 중...' : lang === 'ko' ? '원문(EN)' : '한국어'}
                        </button>
                        {rowError[v.cveId] && lang !== 'ko' && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--red)' }}>{rowError[v.cveId]}</p>
                        )}
                      </td>
                      <td>
                        {cvss
                          ? <SeverityBadge severity={cvss.baseSeverity as any} score={cvss.baseScore} />
                          : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>N/A</span>
                        }
                      </td>
                      <td className="whitespace-nowrap" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
                        {v.epssScore != null
                          ? <span style={{ color: v.epssScore.score >= 0.5 ? 'var(--orange)' : 'var(--text-secondary)' }}>
                              {(v.epssScore.score * 100).toFixed(1)}%
                            </span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>
                      <td className="whitespace-nowrap" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {v.publishedAt ? format(new Date(v.publishedAt), 'yyyy-MM-dd', { locale: ko }) : '—'}
                      </td>
                      <td className="whitespace-nowrap" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {v.modifiedAt ? format(new Date(v.modifiedAt), 'yyyy-MM-dd', { locale: ko }) : '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-1 flex-wrap">
                          {v.kevEntry && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                              style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(255,59,59,0.2)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                              <ShieldWarning size={10} weight="fill" /> KEV
                            </span>
                          )}
                          {v.cweWeaknesses.slice(0, 1).map((c) => (
                            <span key={c.cweId} className="inline-flex text-xs px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--border-dim)', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>
                              {c.cweId}
                            </span>
                          ))}
                          {!v.kevEntry && !v.cweWeaknesses.length && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <button
                          onClick={() => toggleRemediation(v)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-all"
                          style={{
                            fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700,
                            background: isOpen ? 'rgba(124,58,237,0.2)' : 'rgba(124,58,237,0.1)',
                            color: '#a78bfa', border: '1px solid rgba(124,58,237,0.25)',
                          }}>
                          <Sparkle size={11} weight="fill" /> 조치
                          <CaretDown size={10} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--elevated)', borderTop: '1px solid rgba(124,58,237,0.2)' }}>
                          <div className="p-4">
                            {rowBusy[v.cveId] ? (
                              <p className="text-xs" style={{ color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace' }}>
                                <Sparkle size={11} weight="fill" className="inline mr-1" /> AI가 분석 중입니다...
                              </p>
                            ) : rowError[v.cveId] ? (
                              <p className="text-xs" style={{ color: 'var(--red)' }}>{rowError[v.cveId]}</p>
                            ) : ai ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {ai.riskLevel && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                                      style={{ background: RISK_BG[ai.riskLevel] || 'var(--border-dim)', color: RISK_FG[ai.riskLevel] || 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                                      위험도 {ai.riskLevel}
                                    </span>
                                  )}
                                  {ai.summaryKo && (
                                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ai.summaryKo}</span>
                                  )}
                                </div>
                                {ai.recommendation ? (
                                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(124,58,237,0.25)' }}>
                                    <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
                                      style={{ background: 'rgba(124,58,237,0.12)', color: '#c4b5fd', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
                                      <Sparkle size={12} weight="fill" /> 조치 방법
                                    </div>
                                    <p className="px-3 py-3 text-xs leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                                      {ai.recommendation}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>조치 방법이 생성되지 않았습니다.</p>
                                )}
                                <Link href={`/cve/${v.cveId}`} className="inline-flex items-center gap-1 text-xs link-cyan"
                                  style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                  상세 보기 <ArrowRight size={11} />
                                </Link>
                              </div>
                            ) : (
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>분석 데이터가 없습니다.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
                {results?.total === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center" style={{ color: 'var(--text-muted)' }}>
                      검색 결과 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {results && results.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border-dim)' }}>
            <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
              {((page - 1) * limit + 1).toLocaleString()} – {Math.min(page * limit, results.total).toLocaleString()} / {results.total.toLocaleString()}건
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => doSearch(1)} disabled={page <= 1}
                className="p-1.5 rounded-lg transition-all disabled:opacity-30 text-xs"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}>
                «
              </button>
              <button onClick={() => doSearch(page - 1)} disabled={page <= 1}
                className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}>
                <ArrowLeft size={13} />
              </button>
              {Array.from({ length: Math.min(results.totalPages, 7) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 3, results.totalPages - 6));
                const pg = start + i;
                if (pg > results.totalPages) return null;
                return (
                  <button key={pg} onClick={() => doSearch(pg)}
                    className="w-8 h-8 text-xs rounded-lg transition-all"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace', fontWeight: page === pg ? 700 : 400,
                      background: page === pg ? 'var(--cyan)' : 'var(--elevated)',
                      color: page === pg ? 'var(--base)' : 'var(--text-muted)',
                      border: `1px solid ${page === pg ? 'var(--cyan)' : 'var(--border-dim)'}`,
                    }}
                  >{pg}</button>
                );
              })}
              <button onClick={() => doSearch(page + 1)} disabled={page >= results.totalPages}
                className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}>
                <ArrowRight size={13} />
              </button>
              <button onClick={() => doSearch(results.totalPages)} disabled={page >= results.totalPages}
                className="p-1.5 rounded-lg transition-all disabled:opacity-30 text-xs"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}>
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VulnerabilitiesPage() {
  return (
    <Suspense fallback={<div className="p-6 space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>}>
      <VulnerabilitiesContent />
    </Suspense>
  );
}
