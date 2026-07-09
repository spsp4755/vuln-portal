'use client';

import { Suspense, useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ShieldWarning, MagnifyingGlass, ArrowLeft, ArrowRight, X, CalendarBlank, SortAscending, ArrowUp, ArrowDown, Translate, Sparkle, CaretDown, Newspaper, GithubLogo } from '@phosphor-icons/react';
import { TermTooltip, Tooltip } from '@/components/ui/Tooltip';

interface AiSummaryLite {
  summaryKo: string; riskLevel: string; riskReason?: string | null; recommendation?: string | null;
}
interface Vuln {
  id: string; cveId: string; publishedAt: string | null; modifiedAt: string | null;
  cvssScores: { baseScore: number; baseSeverity: string; version: string }[];
  kevEntry: { id: string } | null;
  kisaNotices: { id: string; title: string; link: string }[];
  githubAdvisories: { id: string; ghsaId: string; htmlUrl: string; ecosystem?: string | null; packageName?: string | null }[];
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
  const [keyword,   setKeyword]   = useState(searchParams.get('keyword') || '');
  const [severity,  setSeverity]  = useState((searchParams.get('severity') || '').toUpperCase());
  const [vendor,    setVendor]    = useState(searchParams.get('vendor') || '');
  const [cwe,       setCwe]       = useState(searchParams.get('cwe') || '');
  const [attackVector, setAttackVector] = useState((searchParams.get('attackVector') || '').toUpperCase());
  const [kevOnly,   setKevOnly]   = useState(searchParams.get('kev') === 'true');
  const [kisaOnly,  setKisaOnly]  = useState(searchParams.get('kisa') === 'true');
  const [kisaKind,  setKisaKind]  = useState(searchParams.get('kisaKind') || '');
  const [githubOnly, setGithubOnly] = useState(searchParams.get('github') === 'true');
  const [dateFrom,  setDateFrom]  = useState(searchParams.get('dateFrom') || '');
  const [dateTo,    setDateTo]    = useState(searchParams.get('dateTo') || '');
  const [limit,     setLimit]     = useState(20);
  const [page,      setPage]      = useState(1);
  const [epssMin,   setEpssMin]   = useState(searchParams.get('epss') || '');
  const [sortBy,    setSortBy]    = useState<SortCol>((searchParams.get('sort') as SortCol) || 'publishedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(searchParams.get('order') === 'asc' ? 'asc' : 'desc');
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
    kw?: string; sv?: string; vd?: string; cw?: string; av?: string; kev?: boolean; kisa?: boolean; kisaKind?: string; github?: boolean; from?: string; to?: string; lim?: number;
    sort?: SortCol; order?: 'asc' | 'desc'; epss?: string;
  }) => {
    const kw    = opts?.kw    !== undefined ? opts.kw    : keyword;
    const sv    = opts?.sv    !== undefined ? opts.sv    : severity;
    const vd    = opts?.vd    !== undefined ? opts.vd    : vendor;
    const cw    = opts?.cw    !== undefined ? opts.cw    : cwe;
    const av    = opts?.av    !== undefined ? opts.av    : attackVector;
    const kev   = opts?.kev   !== undefined ? opts.kev   : kevOnly;
    const kisa  = opts?.kisa  !== undefined ? opts.kisa  : kisaOnly;
    const kk    = opts?.kisaKind !== undefined ? opts.kisaKind : kisaKind;
    const github = opts?.github !== undefined ? opts.github : githubOnly;
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
    if (vd)   p.set('vendor',   vd);
    if (cw)   p.set('cwe',      cw);
    if (av)   p.set('attackVector', av);
    if (kev)  p.set('kev',      'true');
    if (kisa) p.set('kisa',     'true');
    if (kk)   p.set('kisaKind', kk);
    if (github) p.set('github', 'true');
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
  }, [keyword, severity, vendor, cwe, attackVector, kevOnly, kisaOnly, kisaKind, githubOnly, dateFrom, dateTo, limit, sortBy, sortOrder, epssMin]);

  // 초기 로드
  useEffect(() => { doSearch(1); }, []);

  // 키워드 디바운스
  const handleKeywordChange = (val: string) => {
    setKeyword(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(1, { kw: val }), 400);
  };

  const handleReset = () => {
    setSeverity(''); setVendor(''); setCwe(''); setAttackVector(''); setKevOnly(false); setKisaOnly(false); setKisaKind(''); setGithubOnly(false); setKeyword(''); setDateFrom(''); setDateTo('');
    setEpssMin(''); setSortBy('publishedAt'); setSortOrder('desc');
    doSearch(1, { kw: '', sv: '', vd: '', cw: '', av: '', kev: false, kisa: false, kisaKind: '', github: false, from: '', to: '', epss: '', sort: 'publishedAt', order: 'desc' });
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

  const hasFilters = keyword || severity || vendor || cwe || attackVector || kevOnly || kisaOnly || kisaKind || githubOnly || dateFrom || dateTo || epssMin;

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
            <button
              onClick={() => { const next = !kisaOnly; setKisaOnly(next); if (next) setKisaKind(''); doSearch(1, { kisa: next, kisaKind: next ? '' : kisaKind }); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                background: kisaOnly ? 'var(--cyan-dim)' : 'var(--elevated)',
                color: kisaOnly ? 'var(--cyan)' : 'var(--text-muted)',
                border: `1px solid ${kisaOnly ? 'rgba(0,212,255,0.3)' : 'var(--border-dim)'}`,
              }}
            >
              <Newspaper size={13} /> KISA
            </button>
            <button
              onClick={() => {
                const next = kisaKind === 'update_advisory' ? '' : 'update_advisory';
                setKisaKind(next);
                if (next) setKisaOnly(false);
                doSearch(1, { kisaKind: next, kisa: false });
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700,
                background: kisaKind === 'update_advisory' ? 'rgba(255,143,0,0.12)' : 'var(--elevated)',
                color: kisaKind === 'update_advisory' ? 'var(--orange)' : 'var(--text-muted)',
                border: `1px solid ${kisaKind === 'update_advisory' ? 'rgba(255,143,0,0.32)' : 'var(--border-dim)'}`,
              }}
            >
              <Sparkle size={13} weight="fill" /> 업데이트 권고
            </button>
            <button
              onClick={() => { const next = !githubOnly; setGithubOnly(next); doSearch(1, { github: next }); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                background: githubOnly ? 'rgba(168,85,247,0.15)' : 'var(--elevated)',
                color: githubOnly ? '#a855f7' : 'var(--text-muted)',
                border: `1px solid ${githubOnly ? 'rgba(168,85,247,0.3)' : 'var(--border-dim)'}`,
              }}
            >
              <GithubLogo size={13} weight="fill" /> GHSA
            </button>
          </div>

          {/* EPSS Min */}
          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
              <Tooltip content="EPSS(악용 가능성 확률) 최소값. 예) 50 = 향후 30일 내 악용 확률 50% 이상만 표시">EPSS ≥</Tooltip>
            </p>
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

          {/* Vendor */}
          <div>
            <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
              <Tooltip content="CPE 매핑 기반 벤더(제조사) 필터. 통계 분석의 벤더 그래프를 클릭하면 자동으로 채워집니다.">벤더</Tooltip>
            </p>
            <div className="relative">
              <input
                type="text" value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch(1)}
                placeholder="google, microsoft..."
                className="w-40 pl-3 pr-7 py-1.5 text-xs rounded-lg"
                style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--elevated)', border: `1px solid ${vendor ? 'rgba(0,212,255,0.4)' : 'var(--border-dim)'}`, color: vendor ? 'var(--cyan)' : 'var(--text-secondary)' }}
              />
              {vendor && (
                <button onClick={() => { setVendor(''); doSearch(1, { vd: '' }); }}
                  title="벤더 필터 제거"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* CWE / 공격벡터 필터 칩 (통계 차트에서 넘어옴) */}
          {(cwe || attackVector) && (
            <div>
              <p className="text-xs mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>추가 필터</p>
              <div className="flex items-center gap-1.5 flex-wrap" style={{ minHeight: '30px' }}>
                {cwe && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(245,197,24,0.12)', color: 'var(--yellow)', border: '1px solid rgba(245,197,24,0.3)', fontFamily: 'JetBrains Mono, monospace' }}>
                    CWE: {cwe}
                    <button onClick={() => { setCwe(''); doSearch(1, { cw: '' }); }} title="CWE 필터 제거"><X size={11} /></button>
                  </span>
                )}
                {attackVector && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(255,59,59,0.12)', color: 'var(--red)', border: '1px solid rgba(255,59,59,0.3)', fontFamily: 'JetBrains Mono, monospace' }}>
                    공격벡터: {attackVector}
                    <button onClick={() => { setAttackVector(''); doSearch(1, { av: '' }); }} title="공격벡터 필터 제거"><X size={11} /></button>
                  </span>
                )}
              </div>
            </div>
          )}
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
                  <th><TermTooltip term="CVE">CVE ID</TermTooltip></th>
                  <th><Tooltip content="취약점 영문 설명. [한국어] 버튼을 누르면 AI가 번역해 보여줍니다.">설명</Tooltip></th>
                  <th onClick={() => toggleSort('cvssScore')} style={thStyle('cvssScore')}>
                    <TermTooltip term="CVSS">심각도</TermTooltip> <SortIcon col="cvssScore" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  <th onClick={() => toggleSort('epssScore')} style={thStyle('epssScore')}>
                    <TermTooltip term="EPSS">EPSS</TermTooltip> <SortIcon col="epssScore" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  <th onClick={() => toggleSort('publishedAt')} style={thStyle('publishedAt')}>
                    <Tooltip content="취약점이 최초 공개(published)된 날짜">공개일</Tooltip> <SortIcon col="publishedAt" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  <th onClick={() => toggleSort('modifiedAt')} style={thStyle('modifiedAt')}>
                    <Tooltip content="취약점 정보가 마지막으로 갱신된 날짜">수정일</Tooltip> <SortIcon col="modifiedAt" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  <th><Tooltip content="KEV 등재 여부, 관련 CWE 등 상태 배지">상태</Tooltip></th>
                  <th style={{ whiteSpace: 'nowrap' }}><Tooltip content="AI가 위험도·요약·단계별 조치 방법을 생성합니다 (클릭 시 그 자리에서 펼쳐짐)">조치</Tooltip></th>
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
                          {v.kisaNotices?.length > 0 && (
                            <a href={v.kisaNotices[0].link} target="_blank" rel="noreferrer"
                              title={v.kisaNotices[0].title}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                              style={{
                                background: v.kisaNotices[0].title.includes('업데이트 권고') ? 'rgba(255,143,0,0.12)' : 'var(--cyan-dim)',
                                color: v.kisaNotices[0].title.includes('업데이트 권고') ? 'var(--orange)' : 'var(--cyan)',
                                border: `1px solid ${v.kisaNotices[0].title.includes('업데이트 권고') ? 'rgba(255,143,0,0.25)' : 'rgba(0,212,255,0.2)'}`,
                                fontFamily: 'JetBrains Mono, monospace',
                                fontWeight: 600,
                              }}>
                              <Newspaper size={10} weight="fill" /> {v.kisaNotices[0].title.includes('업데이트 권고') ? 'KISA 권고' : 'KISA'}
                            </a>
                          )}
                          {v.githubAdvisories?.length > 0 && (
                            <a href={v.githubAdvisories[0].htmlUrl} target="_blank" rel="noreferrer"
                              title={`${v.githubAdvisories[0].ghsaId}${v.githubAdvisories[0].ecosystem ? ` · ${v.githubAdvisories[0].ecosystem}` : ''}${v.githubAdvisories[0].packageName ? `/${v.githubAdvisories[0].packageName}` : ''}`}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                              style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                              <GithubLogo size={10} weight="fill" /> GHSA
                            </a>
                          )}
                          {v.cweWeaknesses.slice(0, 1).map((c) => (
                            <span key={c.cweId} className="inline-flex text-xs px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--border-dim)', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>
                              {c.cweId}
                            </span>
                          ))}
                          {!v.kevEntry && !v.kisaNotices?.length && !v.githubAdvisories?.length && !v.cweWeaknesses.length && <span style={{ color: 'var(--text-muted)' }}>—</span>}
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
