'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ArrowSquareOut,
  MagnifyingGlass,
  Newspaper,
  ShieldWarning,
  Sparkle,
} from '@phosphor-icons/react';

type KisaKind = 'all' | 'update_advisory' | 'cisa_exploit' | 'knvd_vulnerability' | 'security_notice';

interface KisaNotice {
  id: string;
  title: string;
  link: string;
  description: string | null;
  pubDate: string | null;
  source: string;
  cveIds: string[];
  kind: Exclude<KisaKind, 'all'>;
  kindLabel: string;
  kindColor: string;
  kindBg: string;
  vulnerability: { cveId: string; primarySeverity: string | null; primaryScore: number | null; isKev: boolean } | null;
}

const FILTERS: { id: KisaKind; label: string; desc: string }[] = [
  { id: 'all', label: '전체', desc: '모든 KISA 공지' },
  { id: 'update_advisory', label: '업데이트 권고', desc: '제품 패치/업데이트 공지' },
  { id: 'cisa_exploit', label: 'Exploit 공유', desc: 'CISA 악용 정보 공유' },
  { id: 'knvd_vulnerability', label: 'KNVD 취약점', desc: 'KNVD CVE 취약점' },
  { id: 'security_notice', label: '보안 공지', desc: '기타 보안 안내' },
];

export default function KisaPage() {
  const [kind, setKind] = useState<KisaKind>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ notices: KisaNotice[]; total: number; counts: Record<string, number> }>({
    notices: [],
    total: 0,
    counts: {},
  });

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (kind !== 'all') params.set('kind', kind);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/kisa/notices?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) setData(await res.json());
      setLoading(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [kind, q]);

  const topCounts = useMemo(() => [
    { label: '전체', value: data.counts.all || 0, color: 'var(--cyan)' },
    { label: '업데이트 권고', value: data.counts.update_advisory || 0, color: 'var(--orange)' },
    { label: 'Exploit 공유', value: data.counts.cisa_exploit || 0, color: 'var(--red)' },
    { label: 'CVE 연결', value: data.notices.filter((n) => n.cveIds.length > 0).length, color: 'var(--green)' },
  ], [data]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.6rem', color: 'var(--text-primary)' }}>
            KISA 권고
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            업데이트 권고, KNVD 취약점, CISA Exploit 공유를 한 화면에서 확인합니다
          </p>
        </div>
        <Link href="/settings" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--cyan)', fontFamily: 'JetBrains Mono, monospace' }}>
          수집 설정 <ArrowSquareOut size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {topCounts.map((item) => (
          <div key={item.label} className="card p-4">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
            <p className="mt-1" style={{ color: item.color, fontFamily: 'JetBrains Mono, monospace', fontSize: '1.45rem', fontWeight: 800 }}>
              {item.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <label className="flex-1">
            <span className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)', fontWeight: 700 }}>검색</span>
            <div className="relative">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="제품명, CVE, 권고 제목 검색..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-primary)' }}
              />
            </div>
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.map((f) => {
              const active = kind === f.id;
              return (
                <button key={f.id} onClick={() => setKind(f.id)}
                  title={f.desc}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all"
                  style={{
                    background: active ? 'var(--cyan-dim)' : 'var(--elevated)',
                    color: active ? 'var(--cyan)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'rgba(0,212,255,0.3)' : 'var(--border-dim)'}`,
                    fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                    fontWeight: 700,
                  }}>
                  {f.id === 'update_advisory' ? <Sparkle size={12} weight="fill" /> : f.id === 'cisa_exploit' ? <ShieldWarning size={12} weight="fill" /> : <Newspaper size={12} weight="fill" />}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <div>
            <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, color: 'var(--text-primary)' }}>
              최신 권고
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {loading ? '조회 중...' : `${data.total.toLocaleString()}건 표시`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-5 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
        ) : data.notices.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>조건에 맞는 KISA 권고가 없습니다.</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-dim)' }}>
            {data.notices.map((notice) => (
              <div key={notice.id} className="px-5 py-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                <div className="flex items-start gap-3">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs shrink-0"
                    style={{ background: notice.kindBg, color: notice.kindColor, border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>
                    {notice.kind === 'update_advisory' ? <Sparkle size={11} weight="fill" /> : notice.kind === 'cisa_exploit' ? <ShieldWarning size={11} weight="fill" /> : <Newspaper size={11} weight="fill" />}
                    {notice.kindLabel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: 'var(--text-primary)', lineHeight: 1.45 }}>{notice.title}</p>
                      {notice.pubDate && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {format(new Date(notice.pubDate), 'yyyy-MM-dd', { locale: ko })}
                        </span>
                      )}
                    </div>
                    {notice.description && (
                      <p className="mt-1 text-sm line-clamp-2" style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                        {notice.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {(notice.cveIds.length ? notice.cveIds : notice.vulnerability?.cveId ? [notice.vulnerability.cveId] : []).slice(0, 8).map((cve) => (
                        <Link key={cve} href={`/cve/${cve}`} className="px-2 py-0.5 rounded text-xs"
                          style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)', fontFamily: 'JetBrains Mono, monospace', textDecoration: 'none', fontWeight: 700 }}>
                          {cve}
                        </Link>
                      ))}
                      {notice.vulnerability?.isKev && (
                        <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--red-dim)', color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          KEV
                        </span>
                      )}
                      <a href={notice.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                        style={{ color: 'var(--text-muted)', border: '1px solid var(--border-dim)', textDecoration: 'none' }}>
                        원문 <ArrowSquareOut size={11} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
