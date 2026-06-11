'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import {
  ShieldWarning, CalendarX, ArrowRight, CheckCircle, Warning, TrendUp, Clock,
  FunnelSimple, SortAscending, MagnifyingGlass, X,
} from '@phosphor-icons/react';
import { TermTooltip } from '@/components/ui/Tooltip';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

interface KevItem {
  id: string; cveId: string;
  cvssScores: { baseScore: number; baseSeverity: string }[];
  kevEntry: { dueDate: string | null; requiredAction: string; vendorProject: string; product: string } | null;
  publishedAt: string | null;
}
interface EolItem {
  id: string; product: string; cycle: string; eolDate: string | null; isEol: boolean; lts: boolean;
}
interface RecentHighItem {
  id: string; cveId: string; publishedAt: string | null;
  cvssScores: { baseScore: number; baseSeverity: string }[];
  kevEntry: { id: string } | null;
}
interface ActionData {
  kevCritical: KevItem[];
  eolDueSoon: EolItem[];
  recentHighCvss: RecentHighItem[];
  stats: { overdueKev: number; kevCriticalCount: number; eolCount: number; eolSoonCount: number };
}

// ── KEV 필터 상태 ──────────────────────────────────────────────
interface KevFilters {
  severity: 'all' | 'CRITICAL' | 'HIGH';
  overdueOnly: boolean;
  sort: 'due' | 'severity' | 'published';
  limit: number;
}
// ── EOL 필터 상태 ──────────────────────────────────────────────
interface EolFilters {
  status: 'all' | 'expired' | 'upcoming';
  days: number;
  search: string;
  sort: 'date' | 'product';
}
// ── CVSS 필터 상태 ─────────────────────────────────────────────
interface CvssFilters {
  minScore: number;
  days: number;
}

function urgencyStyle(daysLeft: number | null): { bg: string; color: string; label: string } {
  if (daysLeft === null)  return { bg: 'var(--border-dim)', color: 'var(--text-muted)',      label: '기한 없음' };
  if (daysLeft < 0)       return { bg: 'var(--red-dim)',    color: 'var(--red)',              label: '기한초과' };
  if (daysLeft <= 3)      return { bg: 'var(--red-dim)',    color: 'var(--red)',              label: `D-${daysLeft}` };
  if (daysLeft <= 7)      return { bg: 'rgba(255,143,0,0.15)', color: 'var(--orange)',        label: `D-${daysLeft}` };
  if (daysLeft <= 30)     return { bg: 'var(--yellow-dim)', color: 'var(--yellow)',           label: `D-${daysLeft}` };
  return { bg: 'var(--border-dim)', color: 'var(--text-muted)',
    label: format(new Date(Date.now() + daysLeft * 86400000), 'MM/dd') };
}

function SectionHeader({ icon, label, count, accent, sub, children }: {
  icon: React.ReactNode; label: React.ReactNode; count?: number; accent: string; sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border-dim)' }}>
      <div className="flex items-center gap-3 px-5 py-4">
        <span style={{ color: accent }}>{icon}</span>
        <div className="flex-1 min-w-0">
          <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            {label}
          </p>
          {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
        </div>
        {count !== undefined && (
          <span className="text-xs px-2 py-0.5 rounded"
            style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, background: `${accent}15`, color: accent }}>
            {count}건
          </span>
        )}
      </div>
      {children && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

// 작은 필터 셀렉트/버튼 컴포넌트
function FilterSelect({ value, onChange, options, disabled }: {
  value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      className="px-2 py-1 text-xs rounded-lg"
      style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-primary)', cursor: 'pointer' }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function FilterToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all"
      style={{
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600,
        background: active ? 'var(--red-dim)' : 'var(--elevated)',
        color: active ? 'var(--red)' : 'var(--text-muted)',
        border: `1px solid ${active ? 'rgba(255,59,59,0.3)' : 'var(--border-dim)'}`,
      }}>
      {label}
    </button>
  );
}

export default function ActionItemsPage() {
  const [items, setItems] = useState<ActionData | null>(null);
  const [loading, setLoading] = useState(true);

  const [kevFilters, setKevFilters] = useState<KevFilters>({
    severity: 'all', overdueOnly: false, sort: 'due', limit: 30,
  });
  const [eolFilters, setEolFilters] = useState<EolFilters>({
    status: 'all', days: 90, search: '', sort: 'date',
  });
  const [cvssFilters, setCvssFilters] = useState<CvssFilters>({ minScore: 9.0, days: 7 });

  const eolSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [eolSearchInput, setEolSearchInput] = useState('');

  const fetchData = useCallback((kf: KevFilters, ef: EolFilters, cf: CvssFilters) => {
    setLoading(true);
    const p = new URLSearchParams({
      kevSeverity: kf.severity,
      kevOverdue:  kf.overdueOnly ? '1' : '0',
      kevSort:     kf.sort,
      kevLimit:    String(kf.limit),
      eolStatus:   ef.status,
      eolDays:     String(ef.days),
      eolSearch:   ef.search,
      eolSort:     ef.sort,
      cvssMin:     String(cf.minScore),
      cvssDays:    String(cf.days),
    });
    fetch(`/api/dashboard/action-items?${p}`)
      .then((r) => r.json())
      .then((d) => setItems(d))
      .catch(() => setItems({ kevCritical: [], eolDueSoon: [], recentHighCvss: [], stats: { overdueKev: 0, kevCriticalCount: 0, eolCount: 0, eolSoonCount: 0 } }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(kevFilters, eolFilters, cvssFilters); }, []);

  // KEV 필터 변경 시 즉시 재조회
  const updateKev = (patch: Partial<KevFilters>) => {
    const next = { ...kevFilters, ...patch };
    setKevFilters(next);
    fetchData(next, eolFilters, cvssFilters);
  };

  // EOL 필터 변경 시 재조회
  const updateEol = (patch: Partial<EolFilters>) => {
    const next = { ...eolFilters, ...patch };
    setEolFilters(next);
    fetchData(kevFilters, next, cvssFilters);
  };

  // EOL 검색은 디바운스
  const handleEolSearch = (val: string) => {
    setEolSearchInput(val);
    if (eolSearchRef.current) clearTimeout(eolSearchRef.current);
    eolSearchRef.current = setTimeout(() => {
      const next = { ...eolFilters, search: val };
      setEolFilters(next);
      fetchData(kevFilters, next, cvssFilters);
    }, 400);
  };

  // CVSS 필터 변경
  const updateCvss = (patch: Partial<CvssFilters>) => {
    const next = { ...cvssFilters, ...patch };
    setCvssFilters(next);
    fetchData(kevFilters, eolFilters, next);
  };

  const s = items?.stats;
  const isFiltered = kevFilters.severity !== 'all' || kevFilters.overdueOnly || kevFilters.sort !== 'due'
    || eolFilters.status !== 'all' || eolFilters.days !== 90 || eolFilters.search
    || cvssFilters.minScore !== 9.0 || cvssFilters.days !== 7;

  return (
    <div className="space-y-3">
      <div className="animate-in flex items-start justify-between">
        <div>
          <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            시정 작업
          </h1>
          <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
            즉각적인 조치가 필요한 항목
            {isFiltered && <span style={{ color: 'var(--orange)' }}> · 필터 적용됨</span>}
          </p>
        </div>
        {isFiltered && (
          <button
            onClick={() => {
              const kf: KevFilters = { severity: 'all', overdueOnly: false, sort: 'due', limit: 30 };
              const ef: EolFilters = { status: 'all', days: 90, search: '', sort: 'date' };
              const cf: CvssFilters = { minScore: 9.0, days: 7 };
              setKevFilters(kf); setEolFilters(ef); setCvssFilters(cf);
              setEolSearchInput('');
              fetchData(kf, ef, cf);
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg mt-1"
            style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-muted)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
            <X size={11} /> 필터 초기화
          </button>
        )}
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-in delay-50">
        {[
          { label: <span>기한 초과 <TermTooltip term="KEV">KEV</TermTooltip></span>,  val: s?.overdueKev,       accent: 'var(--red)',    icon: <Warning size={18} weight="fill" />,        sub: '즉시 패치 필요' },
          { label: <span><TermTooltip term="KEV">KEV</TermTooltip> + HIGH+</span>,   val: s?.kevCriticalCount,  accent: 'var(--orange)', icon: <ShieldWarning size={18} weight="fill" />,  sub: '실제 악용 취약점' },
          { label: <span><TermTooltip term="EOL">EOL</TermTooltip> 완료</span>,       val: s?.eolCount,          accent: 'var(--yellow)', icon: <CalendarX size={18} weight="fill" />,      sub: '지원 종료됨' },
          { label: <span><TermTooltip term="EOL">EOL</TermTooltip> 임박</span>,       val: s?.eolSoonCount,      accent: 'var(--cyan)',   icon: <Clock size={18} weight="fill" />,          sub: `${eolFilters.days}일 이내` },
        ].map((stat, i) => (
          <div key={i} className="card p-4"
            style={{ borderColor: `${stat.accent}25`, background: `${stat.accent}06` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs mb-1 uppercase tracking-wider"
                  style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
                  {stat.label}
                </p>
                <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.8rem', color: stat.accent, letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {loading ? '—' : (stat.val ?? 0).toLocaleString()}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{stat.sub}</p>
              </div>
              <div className="p-2 rounded-lg" style={{ background: `${stat.accent}15`, color: stat.accent }}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* KEV + CRITICAL/HIGH */}
      <div className="card animate-in delay-100">
        <SectionHeader
          icon={<ShieldWarning size={17} weight="fill" />}
          label={<><TermTooltip term="KEV">KEV</TermTooltip> + HIGH/CRITICAL 취약점</>}
          sub="CISA 실제 악용 취약점"
          count={items?.kevCritical.length}
          accent="var(--red)"
        >
          {/* KEV 필터 바 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <FunnelSimple size={12} style={{ color: 'var(--text-muted)' }} />
            <FilterSelect value={kevFilters.severity} onChange={(v) => updateKev({ severity: v as any })}
              options={[{ label: '전체 등급', value: 'all' }, { label: 'CRITICAL만', value: 'CRITICAL' }, { label: 'HIGH만', value: 'HIGH' }]} />
            <FilterToggle active={kevFilters.overdueOnly} label="기한초과만" onClick={() => updateKev({ overdueOnly: !kevFilters.overdueOnly })} />
            <div className="flex items-center gap-1 ml-1" style={{ borderLeft: '1px solid var(--border-dim)', paddingLeft: '8px' }}>
              <SortAscending size={12} style={{ color: 'var(--text-muted)' }} />
              <FilterSelect value={kevFilters.sort} onChange={(v) => updateKev({ sort: v as any })}
                options={[{ label: '기한 임박순', value: 'due' }, { label: '위험도순', value: 'severity' }, { label: '발견일순', value: 'published' }]} />
            </div>
            <FilterSelect value={String(kevFilters.limit)} onChange={(v) => updateKev({ limit: Number(v) })}
              options={[{ label: '30건', value: '30' }, { label: '50건', value: '50' }, { label: '100건', value: '100' }]} />
          </div>
        </SectionHeader>

        <div className="p-4 space-y-1.5">
          {loading ? <LoadingSkeleton rows={5} /> : (
            <>
              {items?.kevCritical.map((v) => {
                const daysLeft = v.kevEntry?.dueDate
                  ? differenceInDays(new Date(v.kevEntry.dueDate), new Date())
                  : null;
                const urg = urgencyStyle(daysLeft);
                return (
                  <Link key={v.id} href={`/cve/${v.cveId}`}
                    className="flex items-center justify-between px-4 py-3 rounded-xl group transition-all"
                    style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,59,59,0.35)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-dim)')}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--red)' }} />
                      <span className="text-sm shrink-0"
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--cyan)' }}>
                        {v.cveId}
                      </span>
                      {v.cvssScores[0] && (
                        <SeverityBadge severity={v.cvssScores[0].baseSeverity as any} score={v.cvssScores[0].baseScore} />
                      )}
                      <span className="text-xs truncate hidden md:block" style={{ color: 'var(--text-muted)' }}>
                        {v.kevEntry?.vendorProject} · {v.kevEntry?.product}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {v.kevEntry?.dueDate && (
                        <span className="text-xs px-2 py-0.5 rounded-lg font-bold"
                          style={{ fontFamily: 'JetBrains Mono, monospace', background: urg.bg, color: urg.color }}>
                          {urg.label}
                        </span>
                      )}
                      {v.publishedAt && (
                        <span className="text-xs hidden lg:inline" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                          {format(new Date(v.publishedAt), 'yyyy-MM-dd')}
                        </span>
                      )}
                      <ArrowRight size={13} className="opacity-0 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </Link>
                );
              })}
              {!items?.kevCritical.length && (
                <div className="flex items-center gap-2.5 px-4 py-4 rounded-xl text-sm"
                  style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCircle size={16} weight="fill" /> 조건에 해당하는 KEV 취약점이 없습니다.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 최근 고위험 CVSS */}
      <div className="card animate-in delay-150">
        <SectionHeader
          icon={<TrendUp size={17} weight="fill" />}
          label="최근 신규 고위험 취약점"
          sub="최신 발견 순"
          count={items?.recentHighCvss?.length}
          accent="var(--orange)"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <FunnelSimple size={12} style={{ color: 'var(--text-muted)' }} />
            <FilterSelect value={String(cvssFilters.minScore)} onChange={(v) => updateCvss({ minScore: Number(v) })}
              options={[
                { label: 'CVSS 9.0+', value: '9.0' },
                { label: 'CVSS 9.5+', value: '9.5' },
                { label: 'CVSS 10.0', value: '10.0' },
              ]} />
            <FilterSelect value={String(cvssFilters.days)} onChange={(v) => updateCvss({ days: Number(v) })}
              options={[
                { label: '최근 3일', value: '3' },
                { label: '최근 7일', value: '7' },
                { label: '최근 14일', value: '14' },
                { label: '최근 30일', value: '30' },
              ]} />
          </div>
        </SectionHeader>

        <div className="p-4 space-y-1.5">
          {loading ? <LoadingSkeleton rows={4} /> : (
            <>
              {(items?.recentHighCvss ?? []).map((v) => {
                const cvss = v.cvssScores[0];
                return (
                  <Link key={v.id} href={`/cve/${v.cveId}`}
                    className="flex items-center justify-between px-4 py-3 rounded-xl group transition-all"
                    style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,143,0,0.35)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-dim)')}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--orange)' }} />
                      <span className="text-sm shrink-0"
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--cyan)' }}>
                        {v.cveId}
                      </span>
                      {cvss && <SeverityBadge severity={cvss.baseSeverity as any} score={cvss.baseScore} />}
                      {v.kevEntry && (
                        <span className="text-xs px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--red-dim)', color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '10px' }}>
                          KEV
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {v.publishedAt ? format(new Date(v.publishedAt), 'MM/dd', { locale: ko }) : ''}
                      </span>
                      <ArrowRight size={13} className="opacity-0 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </Link>
                );
              })}
              {!(items?.recentHighCvss?.length) && (
                <div className="flex items-center gap-2.5 px-4 py-4 rounded-xl text-sm"
                  style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCircle size={16} weight="fill" /> 조건에 해당하는 신규 고위험 취약점이 없습니다.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* EOL */}
      <div className="card animate-in delay-200">
        <SectionHeader
          icon={<CalendarX size={17} weight="fill" />}
          label={<><TermTooltip term="EOL">EOL</TermTooltip> 현황</>}
          sub="지원 종료 완료 및 임박 현황 · 날짜 순"
          count={items?.eolDueSoon.length}
          accent="var(--yellow)"
        >
          <div className="flex items-center gap-1.5 flex-wrap w-full">
            <FunnelSimple size={12} style={{ color: 'var(--text-muted)' }} />
            {/* 상태 필터 */}
            <FilterSelect value={eolFilters.status} onChange={(v) => updateEol({ status: v as any })}
              options={[
                { label: '전체 (만료+임박)', value: 'all' },
                { label: '만료됨만', value: 'expired' },
                { label: '임박만', value: 'upcoming' },
              ]} />
            {/* 기간 */}
            {eolFilters.status !== 'expired' && (
              <FilterSelect value={String(eolFilters.days)} onChange={(v) => updateEol({ days: Number(v) })}
                options={[
                  { label: '30일 이내', value: '30' },
                  { label: '60일 이내', value: '60' },
                  { label: '90일 이내', value: '90' },
                  { label: '180일 이내', value: '180' },
                  { label: '365일 이내', value: '365' },
                ]} />
            )}
            {/* 정렬 */}
            <div className="flex items-center gap-1" style={{ borderLeft: '1px solid var(--border-dim)', paddingLeft: '8px' }}>
              <SortAscending size={12} style={{ color: 'var(--text-muted)' }} />
              <FilterSelect value={eolFilters.sort} onChange={(v) => updateEol({ sort: v as any })}
                options={[{ label: '날짜순', value: 'date' }, { label: '제품명순', value: 'product' }]} />
            </div>
            {/* 검색 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg ml-1"
              style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', flex: '1', minWidth: '120px', maxWidth: '220px' }}>
              <MagnifyingGlass size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="제품명 검색..."
                value={eolSearchInput}
                onChange={(e) => handleEolSearch(e.target.value)}
                className="bg-transparent text-xs w-full outline-none"
                style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}
              />
              {eolSearchInput && (
                <button onClick={() => { setEolSearchInput(''); updateEol({ search: '' }); }}>
                  <X size={10} style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
            </div>
          </div>
        </SectionHeader>

        <div className="p-4 space-y-1.5">
          {loading ? <LoadingSkeleton rows={5} /> : (
            <>
              {items?.eolDueSoon.map((e) => {
                const daysLeft = e.eolDate ? differenceInDays(new Date(e.eolDate), new Date()) : null;
                const isExpired = e.isEol || (daysLeft !== null && daysLeft < 0);
                const isCritical = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;
                const accent = isExpired ? 'var(--red)' : isCritical ? 'var(--orange)' : 'var(--yellow)';
                const bg = isExpired ? 'var(--red-dim)' : isCritical ? 'rgba(255,143,0,0.1)' : 'var(--elevated)';
                return (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: bg, border: `1px solid ${isExpired ? 'rgba(255,59,59,0.2)' : 'var(--border-dim)'}` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
                      <span className="text-sm font-semibold truncate" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: accent, maxWidth: '180px' }}>
                        {e.product}
                      </span>
                      <span className="text-xs shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {e.cycle}
                      </span>
                      {e.lts && (
                        <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: 'var(--green-dim)', color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                          LTS
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs hidden sm:inline" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {e.eolDate ? format(new Date(e.eolDate), 'yyyy-MM-dd') : 'N/A'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded font-bold"
                        style={{ fontFamily: 'JetBrains Mono, monospace', background: `${accent}20`, color: accent }}>
                        {isExpired ? 'EOL' : daysLeft !== null ? `D-${daysLeft}` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
              {!items?.eolDueSoon.length && (
                <div className="flex items-center gap-2.5 px-4 py-4 rounded-xl text-sm"
                  style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCircle size={16} weight="fill" /> 조건에 해당하는 EOL 항목이 없습니다.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
