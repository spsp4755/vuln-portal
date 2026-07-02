'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { TermTooltip } from '@/components/ui/Tooltip';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ShieldWarning, ArrowRight, TrendUp, Bug, Clock,
  Warning, CheckCircle, ArrowUpRight, Fire,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';

/* ── Count-up hook ─────────────────────────────────────── */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!target) return;
    start.current = null;
    const step = (ts: number) => {
      if (!start.current) start.current = ts;
      const pct = Math.min((ts - start.current) / duration, 1);
      const ease = 1 - Math.pow(1 - pct, 3);
      setVal(Math.round(target * ease));
      if (pct < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return val;
}

/* ── KPI Card ──────────────────────────────────────────── */
function KpiCard({
  label, value, sub, accent, icon, href, delay = 0,
}: {
  label: React.ReactNode; value: number; sub?: string;
  accent: string; icon: React.ReactNode; href?: string; delay?: number;
}) {
  const count = useCountUp(value);

  const inner = (
    <div
      className="card animate-in relative overflow-hidden p-4 group cursor-pointer"
      style={{ animationDelay: `${delay}ms`, '--accent': accent } as React.CSSProperties}
    >
      {/* accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      {/* glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
        style={{ background: `radial-gradient(ellipse at top, ${accent}08 0%, transparent 70%)` }}
      />

      <div className="flex items-start justify-between relative">
        <div>
          <p
            className="text-xs mb-2 uppercase tracking-widest"
            style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}
          >
            {label}
          </p>
          <p
            className="count-pop leading-none"
            style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontWeight: 800,
              fontSize: '1.85rem',
              color: accent,
              letterSpacing: '-0.03em',
            }}
          >
            {count.toLocaleString()}
          </p>
          {sub && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{sub}</p>
          )}
        </div>
        <div
          className="p-2.5 rounded-lg"
          style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}
        >
          {icon}
        </div>
      </div>

      {href && (
        <div className="mt-4 flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: accent }}>
          자세히 보기 <ArrowRight size={11} />
        </div>
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

/* ── Severity Bar ──────────────────────────────────────── */
function SeverityBar({ counts }: { counts: Record<string, number> }) {
  const rows = [
    { key: 'CRITICAL', accent: 'var(--red)',    label: 'CRITICAL' },
    { key: 'HIGH',     accent: 'var(--orange)',  label: 'HIGH' },
    { key: 'MEDIUM',   accent: 'var(--yellow)',  label: 'MEDIUM' },
    { key: 'LOW',      accent: 'var(--green)',   label: 'LOW' },
  ];
  const total = rows.reduce((s, r) => s + (counts[r.key] || 0), 0);

  return (
    <div className="card animate-in delay-300 p-4 h-full">
      <p
        className="text-xs uppercase tracking-widest mb-5"
        style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}
      >
        심각도 분포
      </p>

      {/* stacked bar */}
      <div
        className="flex h-6 rounded overflow-hidden mb-5"
        style={{ background: 'var(--border-dim)' }}
      >
        {rows.map((r) => {
          const count = counts[r.key] || 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={r.key}
              style={{ width: `${pct}%`, background: r.accent, opacity: 0.85 }}
              title={`${r.key}: ${count.toLocaleString()}`}
            />
          );
        })}
      </div>

      {/* legend */}
      <div className="space-y-2.5">
        {rows.map((r) => {
          const count = counts[r.key] || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
          return (
            <Link
              key={r.key}
              href={`/vulnerabilities?severity=${r.key}`}
              className="flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-sm" style={{ background: r.accent }} />
                <span
                  className="text-xs"
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: r.accent }}
                >
                  {r.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-1 rounded-full transition-all"
                  style={{
                    width: `${Math.max(pct as any, 2) * 0.7}px`,
                    maxWidth: '80px',
                    minWidth: '6px',
                    background: r.accent,
                    opacity: 0.4,
                  }}
                />
                <span
                  className="text-sm tabular-nums"
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: r.accent }}
                >
                  {count.toLocaleString()}
                </span>
                <span className="text-xs w-10 text-right" style={{ color: 'var(--text-muted)' }}>
                  {pct}%
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────── */
export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [nowStr, setNowStr] = useState('');

  useEffect(() => {
    setNowStr(format(new Date(), 'yyyy-MM-dd HH:mm', { locale: ko }));
    Promise.all([
      fetch('/api/dashboard/summary').then((r) => r.json()).catch(() => ({})),
      fetch('/api/dashboard/recent?limit=8').then((r) => r.json()).catch(() => []),
      fetch('/api/dashboard/action-items').then((r) => r.json()).catch(() => ({ kevCritical: [], eolDueSoon: [] })),
    ]).then(([s, r, a]) => {
      setSummary(s);
      setRecent(Array.isArray(r) ? r : []);
      setActionItems(a);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-56 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-32 rounded-xl" />)}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  const sc = summary?.severityCounts || {};

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="animate-in flex items-start justify-between">
        <div>
          <h1
            className="leading-none"
            style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontWeight: 800,
              fontSize: '1.6rem',
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}
          >
            위협 인텔리전스
          </h1>
          <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
            {nowStr} · 실시간 취약점 모니터링
          </p>
        </div>
        <Link
          href="/settings"
          className="btn-primary flex items-center gap-2"
          style={{ marginTop: '2px' }}
        >
          <span>데이터 수집</span>
          <ArrowUpRight size={13} />
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="총 취약점"   value={summary?.totalVulnerabilities || 0}
          accent="var(--cyan)"  icon={<Bug size={20} style={{ color: 'var(--cyan)' }} />}
          href="/vulnerabilities" delay={0}
        />
        <KpiCard
          label={<TermTooltip term="KEV">KEV 악용</TermTooltip>}
          value={summary?.kevCount || 0}
          sub="실제 공격에 악용됨"
          accent="var(--red)"   icon={<ShieldWarning size={20} style={{ color: 'var(--red)' }} />}
          href="/kev" delay={80}
        />
        <KpiCard
          label="CRITICAL"    value={summary?.criticalCount || 0}
          sub={(summary?.criticalCount || 0) > 0 ? '즉각 조치 필요' : '없음'}
          accent={summary?.criticalCount > 0 ? 'var(--red)' : 'var(--green)'}
          icon={<Fire size={20} style={{ color: summary?.criticalCount > 0 ? 'var(--red)' : 'var(--green)' }} />}
          href="/vulnerabilities?severity=CRITICAL" delay={160}
        />
        <KpiCard
          label={<><TermTooltip term="KEV">KEV</TermTooltip> 신규 (7일)</>}
          value={summary?.recentKev7Days || 0}
          sub="최근 7일 새로 추가됨"
          accent="var(--orange)" icon={<ShieldWarning size={20} style={{ color: 'var(--orange)' }} />}
          href="/kev" delay={240}
        />
      </div>

      {/* EOL + EPSS info row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={<TermTooltip term="EOL">EOL</TermTooltip>}
          value={summary?.eolSoon || 0}
          sub={`30일 내 종료 예정 · 만료 ${(summary?.eolExpired || 0).toLocaleString()}건`}
          accent="var(--yellow)" icon={<Clock size={20} style={{ color: 'var(--yellow)' }} />}
          href="/eol" delay={300}
        />
        <KpiCard
          label={<>고위험 <TermTooltip term="EPSS">EPSS</TermTooltip></>}
          value={summary?.highEpss || 0}
          sub="악용 확률 50% 이상 (EPSS ≥ 0.5)"
          accent="#f472b6" icon={<TrendUp size={20} style={{ color: '#f472b6' }} />}
          href="/vulnerabilities?epss=50&sort=epssScore&order=desc" delay={360}
        />
      </div>

      {/* Severity + Action items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SeverityBar counts={sc} />

        {/* Urgent actions */}
        <div className="lg:col-span-2 card animate-in delay-400 p-4">
          <div className="flex items-center justify-between mb-4">
            <p
              className="text-xs uppercase tracking-widest flex items-center gap-2"
              style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}
            >
              <Warning size={13} style={{ color: 'var(--red)' }} />
              긴급 조치 필요
            </p>
            <Link href="/action-items" className="text-xs flex items-center gap-1 link-cyan">
              전체 보기 <ArrowRight size={11} />
            </Link>
          </div>

          <div className="space-y-2">
            {(actionItems?.kevCritical || []).slice(0, 5).map((item: any, i: number) => (
              <Link
                key={item.id}
                href={`/cve/${item.cveId}`}
                className="flex items-center justify-between px-4 py-3 rounded-lg group transition-all"
                style={{
                  background: 'var(--red-dim)',
                  border: '1px solid rgba(255,59,59,0.2)',
                  animationDelay: `${450 + i * 60}ms`,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: 'var(--red)' }} />
                  <span
                    className="text-sm shrink-0"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--red)' }}
                  >
                    {item.cveId}
                  </span>
                  <span className="text-xs truncate hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                    {item.kevEntry?.vendorProject} · {item.kevEntry?.product}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.cvssScores[0] && (
                    <SeverityBadge severity={item.cvssScores[0].baseSeverity} score={item.cvssScores[0].baseScore} />
                  )}
                  {item.kevEntry?.dueDate && (
                    <span className="text-xs hidden sm:block" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {format(new Date(item.kevEntry.dueDate), 'MM/dd')}
                    </span>
                  )}
                  <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--red)' }} />
                </div>
              </Link>
            ))}
            {!actionItems?.kevCritical?.length && (
              <div
                className="flex items-center gap-2.5 px-4 py-4 rounded-lg text-sm"
                style={{ background: 'var(--green-dim)', color: 'var(--green)' }}
              >
                <CheckCircle size={16} weight="fill" />
                긴급 조치가 필요한 취약점이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Last collection status */}
      {summary?.lastCollections?.length > 0 && (
        <div
          className="animate-in delay-400 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 rounded-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-dim)' }}
        >
          <span
            className="text-xs uppercase tracking-widest shrink-0"
            style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}
          >
            마지막 수집
          </span>
          {summary.lastCollections.map((c: { source: string; completedAt: string; recordsFetched: number }) => (
            <span
              key={c.source}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded"
              style={{
                background: 'var(--elevated)',
                border: '1px solid var(--border-dim)',
                fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{c.source}</span>
              {c.completedAt
                ? formatDistanceToNow(new Date(c.completedAt), { addSuffix: true, locale: ko })
                : '—'}
              {c.recordsFetched > 0 && (
                <span style={{ color: 'var(--text-muted)' }}>· {c.recordsFetched.toLocaleString()}건</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Recent vulnerabilities */}
      <div className="card animate-in delay-500">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-dim)' }}
        >
          <p
            className="text-xs uppercase tracking-widest"
            style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}
          >
            최근 취약점
          </p>
          <Link href="/vulnerabilities" className="text-xs flex items-center gap-1 link-cyan">
            전체 보기 <ArrowRight size={11} />
          </Link>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>CVE ID</th>
              <th>설명</th>
              <th>심각도</th>
              <th>공개일</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((v: any) => (
              <tr key={v.id}>
                <td>
                  <Link
                    href={`/cve/${v.cveId}`}
                    className="link-cyan"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: '13px' }}
                  >
                    {v.cveId}
                  </Link>
                </td>
                <td className="max-w-xs">
                  <span className="line-clamp-1" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {((v.description as any)?.en || (v.description as any)?.ko || '').slice(0, 90)}
                  </span>
                </td>
                <td>
                  {v.cvssScores[0] ? (
                    <SeverityBadge severity={v.cvssScores[0].baseSeverity} score={v.cvssScores[0].baseScore} />
                  ) : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>N/A</span>}
                </td>
                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {v.publishedAt ? format(new Date(v.publishedAt), 'yyyy-MM-dd', { locale: ko }) : '—'}
                </td>
                <td>
                  {v.kevEntry ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                      style={{
                        background: 'var(--red-dim)',
                        color: 'var(--red)',
                        border: '1px solid rgba(255,59,59,0.2)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
                      }}
                    >
                      <ShieldWarning size={10} weight="fill" /> KEV
                    </span>
                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
              </tr>
            ))}
            {!recent.length && (
              <tr>
                <td colSpan={5} className="py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
