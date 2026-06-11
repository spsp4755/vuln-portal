'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { Bell, Plus, X, ArrowRight, ShieldWarning, CheckCircle, MagnifyingGlass, ArrowUp, ArrowDown, ArrowsDownUp } from '@phosphor-icons/react';
import { format, differenceInDays } from 'date-fns';

interface Hit {
  id: string; cveId: string; publishedAt: string | null;
  isKev: boolean; vendor: string; product: string;
  severity: string | null; score: number | null; dueDate: string | null;
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ff3b3b', HIGH: '#ff8f00', MEDIUM: '#f5c518', LOW: '#00d4ff',
};

// 자주 쓰는 벤더 추천
const VENDOR_SUGGESTIONS = [
  'microsoft', 'apache', 'google', 'linux', 'oracle', 'cisco',
  'adobe', 'mozilla', 'openssl', 'nginx', 'wordpress', 'jquery',
  'spring', 'log4j', 'docker', 'kubernetes',
];

export default function WatchlistPage() {
  const [vendors, setVendors]     = useState<string[]>([]);
  const [hits, setHits]           = useState<Hit[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [input, setInput]         = useState('');
  const [filterVendor, setFilterVendor] = useState('all');
  const [sortBy, setSortBy]       = useState<'severity' | 'date' | 'kev' | 'vendor'>('severity');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc');

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };
  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return <ArrowsDownUp size={11} style={{ opacity: 0.35 }} />;
    return sortDir === 'asc' ? <ArrowUp size={11} style={{ color: 'var(--cyan)' }} weight="bold" /> : <ArrowDown size={11} style={{ color: 'var(--cyan)' }} weight="bold" />;
  };
  const [toast, setToast]         = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchData = () => {
    setLoading(true);
    fetch('/api/watchlist').then((r) => r.json()).then((d) => {
      setVendors(d.vendors ?? []);
      setHits(d.hits ?? []);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const save = async (newVendors: string[]) => {
    setSaving(true);
    const res = await fetch('/api/watchlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendors: newVendors }),
    });
    if (res.ok) { fetchData(); showToast('워치리스트가 저장되었습니다.'); }
    else showToast('저장 실패');
    setSaving(false);
  };

  const addVendor = (v: string) => {
    const val = v.trim().toLowerCase();
    if (!val || vendors.includes(val)) return;
    save([...vendors, val]);
    setInput('');
  };

  const removeVendor = (v: string) => save(vendors.filter((x) => x !== v));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addVendor(input); }
  };

  const SEV_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const baseHits = filterVendor === 'all' ? hits : hits.filter((h) => h.vendor === filterVendor);
  const filteredHits = [...baseHits].sort((a, b) => {
    const d = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'severity') return ((SEV_ORDER[a.severity ?? ''] ?? 9) - (SEV_ORDER[b.severity ?? ''] ?? 9)) * d;
    if (sortBy === 'date') return (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '') * d;
    if (sortBy === 'kev') return ((a.isKev ? 0 : 1) - (b.isKev ? 0 : 1)) * d;
    if (sortBy === 'vendor') return (a.vendor ?? '').localeCompare(b.vendor ?? '') * d;
    return 0;
  });
  const kevHits = filteredHits.filter((h) => h.isKev);
  const criticalHits = filteredHits.filter((h) => h.severity === 'CRITICAL' || h.severity === 'HIGH');

  return (
    <div className="space-y-3">
      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.3)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          <CheckCircle size={14} weight="fill" /> {toast}
        </div>
      )}

      <div className="animate-in">
        <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          워치리스트
        </h1>
        <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
          관심 벤더/제품의 신규 취약점을 모아서 봅니다
        </p>
      </div>

      {/* KPI */}
      {!loading && vendors.length > 0 && (
        <div className="grid grid-cols-3 gap-3 animate-in delay-50">
          {[
            { label: '전체 취약점', val: filteredHits.length, accent: 'var(--cyan)' },
            { label: 'KEV 등재',    val: kevHits.length,       accent: 'var(--red)' },
            { label: 'HIGH+',       val: criticalHits.length,  accent: 'var(--orange)' },
          ].map((s) => (
            <div key={s.label} className="card p-4" style={{ borderColor: `${s.accent}25`, background: `${s.accent}06` }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>{s.label}</p>
              <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.8rem', color: s.accent, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* 벤더 관리 */}
      <div className="card animate-in delay-100">
        <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <Bell size={15} style={{ color: 'var(--cyan)' }} weight="fill" />
          <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
            모니터링 벤더
          </p>
          <span className="ml-auto text-xs px-2 py-0.5 rounded"
            style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, background: 'rgba(0,212,255,0.1)', color: 'var(--cyan)' }}>
            {vendors.length}개
          </span>
        </div>
        <div className="p-4 space-y-3">
          {/* 입력 */}
          <div className="flex gap-2">
            <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl"
              style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
              <MagnifyingGlass size={13} style={{ color: 'var(--text-muted)' }} />
              <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="벤더명 입력 (예: apache, microsoft...)"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }} />
            </div>
            <button onClick={() => addVendor(input)} disabled={saving || !input.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-all"
              style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, background: 'var(--cyan)', color: 'var(--base)', opacity: !input.trim() ? 0.4 : 1 }}>
              <Plus size={14} weight="bold" /> 추가
            </button>
          </div>

          {/* 등록된 벤더 */}
          {vendors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {vendors.map((v) => (
                <div key={v} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                  style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(0,212,255,0.2)', color: 'var(--cyan)' }}>
                  <span className="text-sm" style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{v}</span>
                  <button onClick={() => removeVendor(v)} className="opacity-60 hover:opacity-100 transition-opacity">
                    <X size={12} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>아직 등록된 벤더가 없습니다. 위에서 추가하세요.</p>
          )}

          {/* 추천 벤더 */}
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600 }}>빠른 추가</p>
            <div className="flex flex-wrap gap-1.5">
              {VENDOR_SUGGESTIONS.filter((v) => !vendors.includes(v)).map((v) => (
                <button key={v} onClick={() => addVendor(v)}
                  className="px-2.5 py-1 rounded-lg text-xs transition-all hover:border-cyan-400"
                  style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-muted)' }}>
                  + {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 취약점 목록 */}
      {vendors.length > 0 && (
        <div className="card animate-in delay-150">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
            <div className="flex items-center gap-2.5">
              <ShieldWarning size={15} style={{ color: 'var(--orange)' }} weight="fill" />
              <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                워치리스트 취약점 ({filteredHits.length}건)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* 정렬 버튼 */}
              {(['severity', 'date', 'kev', 'vendor'] as const).map((col) => {
                const labels: Record<string, string> = { severity: '위험도', date: '날짜', kev: 'KEV', vendor: '벤더' };
                const active = sortBy === col;
                return (
                  <button key={col} onClick={() => toggleSort(col)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace', fontWeight: active ? 700 : 400,
                      background: active ? 'var(--cyan-dim)' : 'var(--elevated)',
                      color: active ? 'var(--cyan)' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'rgba(0,212,255,0.3)' : 'var(--border-dim)'}`,
                    }}>
                    {labels[col]} <SortIcon col={col} />
                  </button>
                );
              })}
              {/* 벤더 필터 */}
              <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg"
                style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-primary)' }}>
                <option value="all">전체 벤더</option>
                {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="p-4 space-y-1.5">
            {loading ? (
              [...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)
            ) : filteredHits.length === 0 ? (
              <div className="flex items-center gap-2.5 px-4 py-6 rounded-xl text-sm"
                style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <CheckCircle size={16} weight="fill" /> 등록된 벤더의 취약점이 없습니다.
              </div>
            ) : (
              filteredHits.map((h) => {
                const daysLeft = h.dueDate ? differenceInDays(new Date(h.dueDate), new Date()) : null;
                return (
                  <Link key={h.id} href={`/cve/${h.cveId}`}
                    className="flex items-center justify-between px-4 py-3 rounded-xl group transition-all"
                    style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,143,0,0.35)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-dim)')}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: SEVERITY_COLOR[h.severity ?? ''] ?? 'var(--text-muted)' }} />
                      <span className="text-sm shrink-0"
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--cyan)' }}>
                        {h.cveId}
                      </span>
                      {h.severity && <SeverityBadge severity={h.severity as any} score={h.score ?? 0} />}
                      {h.isKev && (
                        <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: 'var(--red-dim)', color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '10px' }}>
                          KEV
                        </span>
                      )}
                      <span className="text-xs truncate hidden md:block"
                        style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {h.vendor} · {h.product}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {daysLeft !== null && (
                        <span className="text-xs px-2 py-0.5 rounded font-bold"
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            background: daysLeft < 0 ? 'var(--red-dim)' : daysLeft <= 7 ? 'rgba(255,143,0,0.15)' : 'var(--border-dim)',
                            color: daysLeft < 0 ? 'var(--red)' : daysLeft <= 7 ? 'var(--orange)' : 'var(--text-muted)',
                          }}>
                          {daysLeft < 0 ? '기한초과' : `D-${daysLeft}`}
                        </span>
                      )}
                      <span className="text-xs hidden sm:inline"
                        style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {h.publishedAt ? format(new Date(h.publishedAt), 'yyyy-MM-dd') : ''}
                      </span>
                      <ArrowRight size={13} className="opacity-0 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 벤더 없을 때 안내 */}
      {!loading && vendors.length === 0 && (
        <div className="card p-10 text-center animate-in delay-150">
          <Bell size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
          <p className="text-sm font-semibold mb-1" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--text-secondary)' }}>
            모니터링할 벤더를 추가하세요
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            관심 벤더를 등록하면 해당 벤더의 취약점을 한눈에 볼 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
