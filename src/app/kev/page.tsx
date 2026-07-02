'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Clock, Biohazard, ArrowUp, ArrowDown, ArrowsDownUp, CaretLeft, CaretRight, Translate, Sparkle, CaretDown, ArrowRight } from '@phosphor-icons/react';
import { TermTooltip, Tooltip } from '@/components/ui/Tooltip';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

interface AiSummaryLite {
  summaryKo: string; riskLevel: string; riskReason?: string | null; recommendation?: string | null;
}
interface KevVuln {
  id: string;
  cveId: string;
  description?: { ko?: string; en?: string };
  aiSummary?: AiSummaryLite | null;
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

// ko 값에 한글이 있을 때만 '실제 번역'으로 간주 (NVD가 ko에 영어를 복사해 넣는 경우 제외)
const hasHangul = (s?: string | null) => /[가-힣]/.test(s || '');

const RISK_BG: Record<string, string> = {
  '심각': 'rgba(255,59,59,0.15)', '높음': 'rgba(255,143,0,0.15)', '중간': 'rgba(245,197,24,0.15)', '낮음': 'rgba(0,212,255,0.15)',
};
const RISK_FG: Record<string, string> = {
  '심각': 'var(--red)', '높음': 'var(--orange)', '중간': 'var(--yellow)', '낮음': 'var(--cyan)',
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
  // AI 번역/조치
  const [translating, setTranslating] = useState(false);
  const [transMsg, setTransMsg] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowLang, setRowLang] = useState<Record<string, 'en' | 'ko'>>({});
  const [langBusy, setLangBusy] = useState<Record<string, boolean>>({});

  const patchVulns = useCallback((updates: Record<string, { descriptionKo?: string | null; aiSummary?: AiSummaryLite }>) => {
    setVulns((prev) => prev.map((v) => {
      const u = updates[v.cveId];
      if (!u) return v;
      return {
        ...v,
        description: u.descriptionKo ? { ...v.description, ko: u.descriptionKo } : v.description,
        aiSummary: u.aiSummary ?? v.aiSummary,
      };
    }));
  }, []);

  const translatePage = useCallback(async () => {
    if (!vulns.length || translating) return;
    const cveIds = vulns.map((v) => v.cveId);
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
  }, [vulns, translating, patchVulns]);

  const toggleRemediation = useCallback(async (v: KevVuln) => {
    if (expanded === v.cveId) { setExpanded(null); return; }
    setExpanded(v.cveId);
    setRowError((p) => ({ ...p, [v.cveId]: '' }));
    if (v.aiSummary?.recommendation) return;
    setRowBusy((p) => ({ ...p, [v.cveId]: true }));
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cveId: v.cveId }),
      });
      const data = await res.json();
      if (res.ok) patchVulns({ [v.cveId]: { descriptionKo: data.descriptionKo, aiSummary: data.aiSummary } });
      else setRowError((p) => ({ ...p, [v.cveId]: data.error || 'AI 분석 실패' }));
    } catch (e: any) {
      setRowError((p) => ({ ...p, [v.cveId]: e.message }));
    } finally {
      setRowBusy((p) => ({ ...p, [v.cveId]: false }));
    }
  }, [expanded, patchVulns]);

  // 설명 한국어 ↔ 원문(EN) 토글. 한국어가 없으면 AI로 생성 후 표시.
  const toggleLang = useCallback(async (v: KevVuln) => {
    const koExists = hasHangul(v.description?.ko);
    const cur = rowLang[v.cveId] ?? (koExists ? 'ko' : 'en');
    if (cur === 'ko') { setRowLang((p) => ({ ...p, [v.cveId]: 'en' })); return; }
    if (koExists) { setRowLang((p) => ({ ...p, [v.cveId]: 'ko' })); return; }
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
        <div className="flex items-center gap-2">
          {transMsg && (
            <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{transMsg}</span>
          )}
          <button
            onClick={translatePage}
            disabled={translating || !vulns.length}
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
                    <th><TermTooltip term="CVE">CVE ID</TermTooltip></th>
                    <th><Tooltip content="CISA가 부여한 취약점 이름. 아래 [한국어] 버튼으로 설명을 번역할 수 있습니다.">취약점명</Tooltip></th>
                    <th><TermTooltip term="CVSS">심각도</TermTooltip></th>
                    <th><Tooltip content="랜섬웨어 공격에 악용된 이력 여부 (Known = 악용 확인, Unknown = 미확인)">랜섬웨어</Tooltip></th>
                    <th
                      style={thStyle}
                      onClick={() => handleSort('dateAdded')}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Tooltip content="CISA KEV 목록에 등재된 날짜">추가일</Tooltip> <SortIcon field="dateAdded" current={sortBy} order={sortOrder} />
                      </span>
                    </th>
                    <th
                      style={thStyle}
                      onClick={() => handleSort('dueDate')}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Tooltip content="CISA가 권고하는 조치 완료 기한. 기한이 지나면 '초과'로 표시됩니다.">시정 기한</Tooltip> <SortIcon field="dueDate" current={sortBy} order={sortOrder} />
                      </span>
                    </th>
                    <th style={{ whiteSpace: 'nowrap' }}><Tooltip content="AI가 위험도·요약·단계별 조치 방법을 생성합니다 (클릭 시 그 자리에서 펼쳐짐)">조치</Tooltip></th>
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

                    const koDesc = hasHangul(v.description?.ko) ? String(v.description!.ko).trim() : '';
                    const enDesc = v.description?.en || '';
                    const lang = rowLang[v.cveId] ?? (koDesc ? 'ko' : 'en');
                    const descLine = lang === 'ko' ? koDesc : enDesc;
                    const langLoading = langBusy[v.cveId];
                    const isOpen = expanded === v.cveId;
                    const ai = v.aiSummary;
                    return (
                      <Fragment key={v.id}>
                      <tr className={sevClass}>
                        <td>
                          <Link
                            href={`/cve/${v.cveId}`}
                            className="link-cyan"
                            style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: '13px' }}
                          >
                            {v.cveId}
                          </Link>
                        </td>
                        <td className="max-w-sm">
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {v.kevEntry.vulnerabilityName || `${v.kevEntry.vendorProject} / ${v.kevEntry.product}`}
                          </span>
                          {descLine && (
                            <span className="line-clamp-2 mt-1" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{descLine}</span>
                          )}
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
                          <td colSpan={7} style={{ background: 'var(--elevated)', borderTop: '1px solid rgba(124,58,237,0.2)' }}>
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
                                    {ai.summaryKo && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ai.summaryKo}</span>}
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
                  {!vulns.length && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center" style={{ color: 'var(--text-muted)' }}>
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
