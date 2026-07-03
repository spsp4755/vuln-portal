'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ChartBar, Shield, ShieldWarning, TrendUp, Warning, Database, Clock, CursorClick } from '@phosphor-icons/react';
import { TermTooltip } from '@/components/ui/Tooltip';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

// ── 색상 팔레트 ─────────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ff3b3b',
  HIGH:     '#ff8f00',
  MEDIUM:   '#f5c518',
  LOW:      '#00d4ff',
  NONE:     '#555',
  UNKNOWN:  '#444',
};
const CHART_COLORS = ['#00d4ff', '#ff8f00', '#ff3b3b', '#22c55e', '#a855f7', '#f5c518', '#06b6d4', '#ec4899'];
const AV_COLORS: Record<string, string> = {
  NETWORK:          '#ff3b3b',
  ADJACENT_NETWORK: '#ff8f00',
  ADJACENT:         '#ff8f00',
  LOCAL:            '#f5c518',
  PHYSICAL:         '#00d4ff',
};

interface AnalyticsData {
  range: number;
  daily:        { day: string; count: number }[];
  severity:     { severity: string; count: number }[];
  topVendors:   { vendor: string; count: number }[];
  topProducts:  { vendor: string; product: string; count: number }[];
  cwe:          { cwe_id: string; name: string; count: number }[];
  kevMonthly:   { month: string; count: number }[];
  cvssDist:     { bucket: string; count: number }[];
  attackVector: { attack_vector: string; count: number }[];
  totals: {
    vulnerabilities: number; vulnerabilitiesRange: number;
    kev: number; kevRange: number;
    avgCvss: number | null; avgCvssRange: number | null;
  };
  topEpss: { cveId: string; score: number; percentile: number | null; severity: string | null; cvssScore: number | null; publishedAt: string | null }[];
  collectionStats: { source: string; runs: number; last_run: string; total_fetched: number }[];
}

// ── 커스텀 툴팁 ────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-xl text-xs"
      style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
      {label && <p className="mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || 'var(--cyan)' }}>{p.name}: <strong>{p.value?.toLocaleString()}</strong></p>
      ))}
    </div>
  );
};

function SectionCard({ title, sub, icon, children, accent = 'var(--cyan)' }: {
  title: React.ReactNode; sub?: string; icon: React.ReactNode; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
        <span style={{ color: accent }}>{icon}</span>
        <div>
          <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{title}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function KpiCard({ label, value, sub, accent, icon, onClick }: { label: string; value: React.ReactNode; sub: string; accent: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <div className={`card p-4${onClick ? ' cursor-pointer transition-all hover:brightness-125' : ''}`}
      onClick={onClick}
      style={{ borderColor: `${accent}25`, background: `${accent}06` }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>{label}</p>
          <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.8rem', color: accent, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>
        </div>
        <div className="p-2 rounded-lg" style={{ background: `${accent}15`, color: accent }}>{icon}</div>
      </div>
    </div>
  );
}

const RANGE_OPTIONS = [
  { label: '최근 7일',   value: '7' },
  { label: '최근 30일',  value: '30' },
  { label: '최근 90일',  value: '90' },
  { label: '최근 180일', value: '180' },
  { label: '최근 1년',   value: '365' },
];

// CVSS 구간 버킷 → 심각도 매핑 ('7.0-8.9 (HIGH)' → 'HIGH')
function bucketToSeverity(bucket: string): string {
  const m = bucket.match(/\(([A-Z]+)\)/);
  return m ? m[1] : '';
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('90');

  // 차트 → 목록으로 이동하는 딥링크 헬퍼.
  // 차트는 모두 "선택 기간" 범위이므로 그 기간(dateFrom)을 함께 실어 목록도 동일 모집단을 보여준다.
  const goToVulns = useCallback((params: Record<string, string>, opts?: { withRange?: boolean }) => {
    const merged: Record<string, string> = { ...params };
    if (opts?.withRange !== false && !merged.dateFrom) {
      merged.dateFrom = new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
    }
    const p = new URLSearchParams(merged);
    router.push(`/vulnerabilities?${p.toString()}`);
  }, [router, range]);

  const fetchData = useCallback((r: string) => {
    setLoading(true);
    fetch(`/api/analytics?range=${r}`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(range); }, []);

  const changeRange = (r: string) => { setRange(r); fetchData(r); };

  const totalSeverity = data?.severity.reduce((a, b) => a + b.count, 0) || 1;
  const kevRatio = data && data.totals.vulnerabilitiesRange > 0
    ? ((data.totals.kevRange / data.totals.vulnerabilitiesRange) * 100).toFixed(1)
    : '—';

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="animate-in flex items-start justify-between">
        <div>
          <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            통계 분석
          </h1>
          <p className="mt-1 text-xs flex items-center gap-1.5" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
            수집된 취약점 데이터 기반 트렌드 및 분포 분석
            <span className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded" style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)', fontSize: '10px' }}>
              <CursorClick size={10} weight="fill" /> 그래프 클릭 → 해당 목록으로 이동
            </span>
          </p>
        </div>
        {/* 기간 선택 */}
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
          {RANGE_OPTIONS.map((o) => (
            <button key={o.value} onClick={() => changeRange(o.value)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600,
                background: range === o.value ? 'var(--cyan-dim)' : 'transparent',
                color: range === o.value ? 'var(--cyan)' : 'var(--text-muted)',
                border: `1px solid ${range === o.value ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
              }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-in delay-50">
        <KpiCard label={`기간 내 신규 CVE`}
          value={loading ? '—' : (data?.totals.vulnerabilitiesRange ?? 0).toLocaleString()}
          sub={`최근 ${range}일 · 누적 ${(data?.totals.vulnerabilities ?? 0).toLocaleString()}`}
          accent="var(--cyan)" icon={<Shield size={18} weight="fill" />}
          onClick={() => {
            const from = new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
            goToVulns({ dateFrom: from, sort: 'publishedAt', order: 'desc' });
          }} />
        <KpiCard label="기간 내 KEV"
          value={loading ? '—' : (data?.totals.kevRange ?? 0).toLocaleString()}
          sub={`${kevRatio}% · 누적 ${(data?.totals.kev ?? 0).toLocaleString()}`}
          accent="var(--red)" icon={<ShieldWarning size={18} weight="fill" />}
          onClick={() => router.push('/kev')} />
        <KpiCard label="기간 내 평균 CVSS"
          value={loading ? '—' : (data?.totals.avgCvssRange ?? '—')}
          sub={`전체 평균 ${data?.totals.avgCvss ?? '—'} · v3.1`}
          accent="var(--orange)" icon={<Warning size={18} weight="fill" />} />
        <KpiCard label="일 평균 신규"
          value={loading ? '—' : data ? (data.totals.vulnerabilitiesRange / data.range).toFixed(1) : '—'}
          sub={`최근 ${range}일 기준`}
          accent="var(--green)" icon={<TrendUp size={18} weight="fill" />} />
      </div>

      {/* 일별 신규 취약점 추이 */}
      <div className="card animate-in delay-100">
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <span style={{ color: 'var(--cyan)' }}><TrendUp size={16} weight="fill" /></span>
          <div>
            <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
              일별 신규 취약점 등록 추이
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>publishedAt 기준 · 최근 {range}일 · 그래프 클릭 시 해당 날짜 목록</p>
          </div>
        </div>
        <div className="p-5" style={{ height: 220 }}>
          {loading ? (
            <div className="skeleton w-full h-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 200 }}>
              <AreaChart data={data?.daily ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}
                style={{ cursor: 'pointer' }}
                onClick={(e: any) => { const day = e?.activeLabel; if (day) goToVulns({ dateFrom: day, dateTo: day }, { withRange: false }); }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#666', fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v) => v?.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#666', fontFamily: 'JetBrains Mono' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" name="신규 CVE" stroke="#00d4ff" strokeWidth={2}
                  fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: '#00d4ff' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 2열 그리드 — 심각도 / 공격벡터 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in delay-150">
        {/* 심각도 분포 */}
        <SectionCard title={<><TermTooltip term="CVSS">CVSS</TermTooltip> 심각도 분포 (v3.1)</>} sub={`최근 ${range}일 기준 · 클릭 시 해당 심각도 목록`} icon={<Warning size={15} weight="fill" />} accent="var(--orange)">
          {loading ? <div className="skeleton h-52 w-full rounded-xl" /> : (
            <div className="flex items-center gap-6">
              <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 200 }}>
                  <PieChart>
                    <Pie data={data?.severity ?? []} dataKey="count" nameKey="severity"
                      cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2}
                      style={{ cursor: 'pointer' }}
                      onClick={(d: any) => { const sv = d?.payload?.severity ?? d?.severity; if (sv) goToVulns({ severity: sv }); }}>
                      {data?.severity.map((s) => (
                        <Cell key={s.severity} fill={SEVERITY_COLORS[s.severity] ?? '#666'} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 flex-1">
                {data?.severity.sort((a, b) => b.count - a.count).map((s) => (
                  <div key={s.severity} className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-70"
                    onClick={() => goToVulns({ severity: s.severity })} title={`${s.severity} 취약점 목록 보기`}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEVERITY_COLORS[s.severity] ?? '#666' }} />
                    <span className="text-xs w-20 shrink-0" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {s.severity}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-dim)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(s.count / totalSeverity * 100).toFixed(1)}%`, background: SEVERITY_COLORS[s.severity] ?? '#666' }} />
                    </div>
                    <span className="text-xs w-14 text-right shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                      {s.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* 공격 벡터 */}
        <SectionCard title="공격 벡터 분포" sub={`CVSS v3.1 Attack Vector · 최근 ${range}일 · 막대 클릭 시 목록`} icon={<ShieldWarning size={15} weight="fill" />} accent="var(--red)">
          {loading ? <div className="skeleton h-52 w-full rounded-xl" /> : (
            <ResponsiveContainer width="100%" height={200} initialDimension={{ width: 400, height: 200 }}>
              <BarChart data={data?.attackVector ?? []} layout="vertical" margin={{ left: 0, right: 30 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#666', fontFamily: 'JetBrains Mono' }} />
                <YAxis type="category" dataKey="attack_vector" width={110}
                  tick={{ fontSize: 10, fill: '#aaa', fontFamily: 'JetBrains Mono' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,59,59,0.08)' }} />
                <Bar dataKey="count" name="건수" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }}
                  onClick={(d: any) => { const av = d?.payload?.attack_vector ?? d?.attack_vector; if (av) goToVulns({ attackVector: av }); }}>
                  {data?.attackVector.map((r) => (
                    <Cell key={r.attack_vector} fill={AV_COLORS[r.attack_vector] ?? '#00d4ff'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* 상위 벤더 */}
      <SectionCard title="벤더별 취약점 수 (Top 15)" sub={`CPE 매핑 기반 · 최근 ${range}일 · 막대 클릭 시 해당 벤더 목록`} icon={<ChartBar size={15} weight="fill" />} accent="var(--cyan)">
        {loading ? <div className="skeleton h-64 w-full rounded-xl" /> : (
          <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 800, height: 260 }}>
            <BarChart data={data?.topVendors ?? []} margin={{ top: 0, right: 10, bottom: 60, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="vendor" tick={{ fontSize: 10, fill: '#888', fontFamily: 'JetBrains Mono' }}
                angle={-40} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10, fill: '#666', fontFamily: 'JetBrains Mono' }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,212,255,0.08)' }} />
              <Bar dataKey="count" name="취약점 수" fill="#00d4ff" radius={[3, 3, 0, 0]}
                fillOpacity={0.85} style={{ cursor: 'pointer' }}
                onClick={(d: any) => { const vd = d?.payload?.vendor ?? d?.vendor; if (vd) goToVulns({ vendor: vd }); }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* 2열 — KEV 월별 / CVSS 분포 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in delay-200">
        {/* KEV 월별 추이 */}
        <SectionCard title={<><TermTooltip term="KEV">KEV</TermTooltip> 월별 신규 등재 추이</>} sub="CISA KEV 기준 · 클릭 시 KEV 목록" icon={<ShieldWarning size={15} weight="fill" />} accent="var(--red)">
          {loading ? <div className="skeleton h-52 w-full rounded-xl" /> : (
            <ResponsiveContainer width="100%" height={200} initialDimension={{ width: 400, height: 200 }}>
              <BarChart data={data?.kevMonthly ?? []} margin={{ top: 5, right: 10, bottom: 20, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#888', fontFamily: 'JetBrains Mono' }}
                  angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: '#666', fontFamily: 'JetBrains Mono' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,59,59,0.08)' }} />
                <Bar dataKey="count" name="KEV 등재 수" fill="#ff3b3b" radius={[3, 3, 0, 0]} fillOpacity={0.8}
                  style={{ cursor: 'pointer' }} onClick={() => router.push('/kev')} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* CVSS 점수 구간 */}
        <SectionCard title={<><TermTooltip term="CVSS">CVSS</TermTooltip> 점수 구간 분포</>} sub={`CVSS v3.1 · 최근 ${range}일 · 클릭 시 해당 심각도 목록`} icon={<Warning size={15} weight="fill" />} accent="var(--orange)">
          {loading ? <div className="skeleton h-52 w-full rounded-xl" /> : (
            <div className="space-y-3 pt-2">
              {data?.cvssDist.map((d) => {
                const [range, sev] = d.bucket.split(' ');
                const total = data.cvssDist.reduce((a, b) => a + b.count, 0) || 1;
                const pct = (d.count / total * 100).toFixed(1);
                const color = sev?.includes('CRITICAL') ? '#ff3b3b' : sev?.includes('HIGH') ? '#ff8f00' : sev?.includes('MEDIUM') ? '#f5c518' : '#00d4ff';
                const sevKey = bucketToSeverity(d.bucket);
                return (
                  <div key={d.bucket} className="cursor-pointer transition-opacity hover:opacity-70"
                    onClick={() => sevKey && goToVulns({ severity: sevKey })} title={`${sevKey} 심각도 취약점 목록 보기`}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace', color }}>{d.bucket}</span>
                      <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {d.count.toLocaleString()} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-dim)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* CWE Top 10 */}
      <SectionCard title={<><TermTooltip term="CWE">CWE</TermTooltip> 취약점 유형 Top 10</>} sub={`최근 ${range}일 · 막대 클릭 시 해당 CWE 목록`} icon={<ChartBar size={15} weight="fill" />} accent="var(--yellow)">
        {loading ? <div className="skeleton h-64 w-full rounded-xl" /> : (
          <ResponsiveContainer width="100%" height={250} initialDimension={{ width: 600, height: 250 }}>
            <BarChart data={data?.cwe ?? []} layout="vertical" margin={{ left: 10, right: 60, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#666', fontFamily: 'JetBrains Mono' }} />
              <YAxis type="category" dataKey="cwe_id" width={100}
                tick={{ fontSize: 10, fill: '#aaa', fontFamily: 'JetBrains Mono' }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(245,197,24,0.08)' }} formatter={(v: any, n: any, p: any) => [v, p.payload.name || p.payload.cwe_id]} />
              <Bar dataKey="count" name="취약점 수" fill="#f5c518" radius={[0, 4, 4, 0]} fillOpacity={0.85}
                style={{ cursor: 'pointer' }}
                onClick={(d: any) => { const cwe = d?.payload?.cwe_id ?? d?.cwe_id; if (cwe) goToVulns({ cwe }); }}
                label={{ position: 'right', fontSize: 10, fill: '#888', fontFamily: 'JetBrains Mono', formatter: (v: any) => v.toLocaleString() }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* 하단 2열 — EPSS Top 10 / 수집 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in delay-250">
        {/* EPSS 상위 10 */}
        <SectionCard title={<><TermTooltip term="EPSS">EPSS</TermTooltip> 위험도 상위 10</>} sub={`최근 ${range}일 내 출시 CVE 기준`} icon={<TrendUp size={15} weight="fill" />} accent="var(--red)">
          {loading ? <div className="skeleton h-52 w-full rounded-xl" /> : (
            <div className="space-y-2">
              {data?.topEpss.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>해당 기간에 EPSS 데이터가 없습니다.</p>
              )}
              {data?.topEpss.map((e, i) => (
                <div key={e.cveId} className="flex items-center gap-2">
                  <span className="text-xs w-4 text-center shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{i + 1}</span>
                  <div className="flex flex-col shrink-0" style={{ minWidth: 100 }}>
                    <a href={`/cve/${e.cveId}`} className="text-xs"
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--cyan)', textDecoration: 'none' }}>
                      {e.cveId}
                    </a>
                    {e.publishedAt && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' }}>
                        {e.publishedAt.slice(0, 10)}
                      </span>
                    )}
                  </div>
                  {e.severity && (
                    <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: `${SEVERITY_COLORS[e.severity] ?? '#666'}20`, color: SEVERITY_COLORS[e.severity] ?? '#666', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '10px' }}>
                      {e.severity}
                    </span>
                  )}
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-dim)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(e.score * 100).toFixed(0)}%`, background: '#ff3b3b' }} />
                  </div>
                  <span className="text-xs shrink-0 font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#ff3b3b' }}>
                    {(e.score * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 수집 현황 */}
        <SectionCard title="데이터 수집 현황" sub="소스별 수집 이력 요약" icon={<Database size={15} weight="fill" />} accent="var(--cyan)">
          {loading ? <div className="skeleton h-52 w-full rounded-xl" /> : (
            <div className="space-y-2">
              {data?.collectionStats.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>수집 이력이 없습니다.</p>
              )}
              {data?.collectionStats.map((s) => (
                <div key={s.source} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--text-primary)' }}>
                      {s.source || '전체'}
                    </p>
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      <Clock size={9} /> {s.last_run ? format(new Date(s.last_run), 'MM-dd HH:mm', { locale: ko }) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--cyan)' }}>
                      {s.total_fetched?.toLocaleString() ?? 0}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {s.runs}회 수집
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
