'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SquaresFour, MagnifyingGlass, ShieldWarning, CalendarX,
  Clipboard, Gear, Shield, RadioButton, Database, ChartBar, Bell,
  SignOut, Sun, Moon, Users,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';
import { TermTooltip } from '@/components/ui/Tooltip';

const navGroups = [
  {
    label: '모니터링',
    items: [
      { href: '/',             label: '대시보드',   icon: SquaresFour, term: null },
      { href: '/action-items', label: '시정 작업',  icon: Clipboard,   term: null },
      { href: '/analytics',    label: '통계 분석',  icon: ChartBar,    term: null },
    ],
  },
  {
    label: '취약점',
    items: [
      { href: '/vulnerabilities', label: '취약점 목록', icon: Shield,        term: null },
      { href: '/search',          label: '고급 검색',   icon: MagnifyingGlass, term: null },
      { href: '/kev',             label: 'KEV 목록',    icon: ShieldWarning, term: 'KEV' },
      { href: '/eol',             label: 'EOL 임박',    icon: CalendarX,     term: 'EOL' },
    ],
  },
  {
    label: '관리',
    items: [
      { href: '/watchlist', label: '워치리스트',  icon: Bell,     term: null },
      { href: '/data',      label: '데이터 관리', icon: Database, term: null },
      { href: '/users',     label: '사용자 관리', icon: Users,    term: null },
      { href: '/settings',  label: '설정',        icon: Gear,     term: null },
    ],
  },
] as const;

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="w-52 min-h-screen flex flex-col shrink-0"
      style={{ background: 'var(--void)', borderRight: '1px solid var(--border-dim)' }}>
      <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--border-dim)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0"
            style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(0,212,255,0.3)' }}>
            <Shield size={14} style={{ color: 'var(--cyan)' }} weight="fill" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-none"
              style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              VULN PORTAL
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <RadioButton size={9} style={{ color: 'var(--green)' }} weight="fill" className="animate-pulse" />
              <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                LIVE · 폐쇄망
              </p>
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-2 space-y-3 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1"
              style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, term }) => {
                const active = pathname === href || (href !== '/' && pathname.startsWith(href));
                const labelNode = term
                  ? <TermTooltip term={term as any} underline={false}>{label}</TermTooltip>
                  : label;
                return (
                  <Link key={href} href={href}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all"
                    style={{
                      fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: active ? 600 : 400, fontSize: '13px',
                      background: active ? 'var(--cyan-dim)' : 'transparent',
                      color: active ? 'var(--cyan)' : 'var(--text-secondary)',
                      border: active ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
                    }}>
                    <Icon size={14} weight={active ? 'fill' : 'regular'} />
                    {labelNode}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 py-2.5 space-y-2" style={{ borderTop: '1px solid var(--border-dim)' }}>
        {/* 다크/라이트 토글 + 로그아웃 */}
        <div className="flex items-center gap-1.5">
          <button onClick={toggle}
            className="flex items-center gap-1.5 flex-1 px-2.5 py-1.5 rounded-lg text-xs transition-all"
            style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600,
              background: 'var(--elevated)', border: '1px solid var(--border-dim)',
              color: 'var(--text-muted)',
            }}>
            {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            {theme === 'dark' ? '라이트' : '다크'}
          </button>
          <button onClick={handleLogout}
            title="로그아웃"
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
            style={{
              background: 'var(--elevated)', border: '1px solid var(--border-dim)',
              color: 'var(--text-muted)',
            }}>
            <SignOut size={13} />
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>
          NVD · CISA · EPSS · EOL
        </p>
      </div>
    </aside>
  );
};
