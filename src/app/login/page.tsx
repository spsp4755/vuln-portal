'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shield, EnvelopeSimple, LockSimple, SignIn, Eye, EyeSlash } from '@phosphor-icons/react';

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '로그인 실패'); return; }
      // 오픈 리다이렉트 방지: 내부 경로('/'로 시작)만 허용
      const raw = params.get('from') || '/';
      const from = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
      // 전체 페이지 이동으로 방금 설정된 세션 쿠키를 확실히 전달 (RSC 이동 레이스 방지)
      window.location.href = from;
    } catch {
      setError('서버 연결 오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--base)' }}>

      {/* 배경 도트 */}
      <div className="dot-grid fixed inset-0 pointer-events-none opacity-40" />

      <div className="relative w-full max-w-sm mx-4">
        {/* 글로우 효과 */}
        <div className="absolute -inset-4 rounded-3xl opacity-20 blur-2xl"
          style={{ background: 'radial-gradient(circle at center, var(--cyan), transparent 70%)' }} />

        <div className="relative card p-8"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-base)' }}>

          {/* 로고 */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 flex items-center justify-center rounded-2xl mb-4"
              style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(0,212,255,0.3)', boxShadow: 'var(--cyan-glow)' }}>
              <Shield size={28} style={{ color: 'var(--cyan)' }} weight="fill" />
            </div>
            <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
              VULN PORTAL
            </h1>
            <p className="text-xs mt-1" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
              취약점 관리 시스템 · 폐쇄망
            </p>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 이메일 */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--text-muted)' }}>
                이메일
              </label>
              <div className="relative">
                <EnvelopeSimple size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }} />
                <input
                  type="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* 비밀번호 */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--text-muted)' }}>
                비밀번호
              </label>
              <div className="relative">
                <LockSimple size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }} />
                <input
                  type={showPw ? 'text' : 'password'} required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}>
                  {showPw ? <EyeSlash size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* 에러 */}
            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'var(--red-dim)', color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace', border: '1px solid rgba(255,59,59,0.2)' }}>
                {error}
              </p>
            )}

            {/* 로그인 버튼 */}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={{
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, letterSpacing: '0.02em',
                background: loading ? 'var(--border-dim)' : 'var(--cyan)',
                color: loading ? 'var(--text-muted)' : 'var(--base)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}>
              <SignIn size={16} weight="bold" />
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          {/* 푸터 */}
          <p className="text-center mt-6 text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            NVD · CISA · EPSS · EOL
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
