'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, UserPlus, Trash, LockKey, ShieldCheck, EnvelopeSimple, Eye, EyeSlash } from '@phosphor-icons/react';

interface User { email: string; createdAt: string | null }
interface Toast { id: number; type: 'success' | 'error'; message: string }

let toastId = 0;

export default function UsersPage() {
  const [users, setUsers]             = useState<User[]>([]);
  const [loading, setLoading]         = useState(true);
  const [newEmail, setNewEmail]       = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPw, setShowNewPw]     = useState(false);
  const [adding, setAdding]           = useState(false);
  const [pwTarget, setPwTarget]       = useState('');
  const [pwValue, setPwValue]         = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [changingPw, setChangingPw]   = useState(false);
  const [toasts, setToasts]           = useState<Toast[]>([]);
  const newEmailRef = useRef<HTMLInputElement>(null);

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastId;
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/users').then(r => r.json())
      .then(d => setUsers(d.users ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    if (!newEmail || newPassword.length < 8) return;
    setAdding(true);
    const r = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword }),
    });
    const d = await r.json();
    setAdding(false);
    if (!r.ok) { addToast('error', d.error); return; }
    addToast('success', `${newEmail} 계정이 추가되었습니다.`);
    setNewEmail(''); setNewPassword('');
    fetchUsers();
    newEmailRef.current?.focus();
  };

  const handleDelete = async (email: string) => {
    if (!confirm(`"${email}" 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const r = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const d = await r.json();
    if (!r.ok) { addToast('error', d.error); return; }
    addToast('success', `${email} 삭제되었습니다.`);
    fetchUsers();
  };

  const handleChangePw = async () => {
    if (!pwTarget || pwValue.length < 8) return;
    setChangingPw(true);
    const r = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pwTarget, newPassword: pwValue }),
    });
    const d = await r.json();
    setChangingPw(false);
    if (!r.ok) { addToast('error', d.error); return; }
    addToast('success', '비밀번호가 변경되었습니다.');
    setPwTarget(''); setPwValue('');
  };

  return (
    <div className="space-y-4">
      {/* 토스트 */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-2.5 rounded-xl text-sm animate-in"
            style={{
              background: t.type === 'success' ? 'var(--green-dim)' : 'var(--red-dim)',
              border: `1px solid ${t.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(255,59,59,0.3)'}`,
              color: t.type === 'success' ? 'var(--green)' : 'var(--red)',
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* 헤더 */}
      <div className="animate-in">
        <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          사용자 관리
        </h1>
        <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
          로그인 계정 추가 · 삭제 · 비밀번호 변경
        </p>
      </div>

      {/* 계정 목록 */}
      <div className="card animate-in delay-50">
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <Users size={15} weight="fill" style={{ color: 'var(--cyan)' }} />
          <div>
            <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
              현재 계정 목록
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {users.length}개 계정 등록됨
            </p>
          </div>
        </div>

        <div className="p-4 space-y-2">
          {loading ? (
            <>
              <div className="skeleton h-16 w-full rounded-xl" />
              <div className="skeleton h-16 w-full rounded-xl" />
            </>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>등록된 계정이 없습니다.</p>
          ) : (
            users.map(u => (
              <div key={u.email} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                {/* 아이콘 */}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(0,212,255,0.2)' }}>
                  <ShieldCheck size={14} weight="fill" style={{ color: 'var(--cyan)' }} />
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate"
                    style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--text-primary)' }}>
                    {u.email}
                  </p>
                  <p className="text-xs mt-0.5"
                    style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                    {u.createdAt === '기본 계정' ? '기본 관리자 계정 (삭제 불가)'
                      : u.createdAt ? `추가일: ${u.createdAt.slice(0, 10)}` : ''}
                  </p>
                </div>

                {/* 버튼 */}
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => { setPwTarget(u.email); setPwValue(''); setShowPw(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--border-base)',
                      color: 'var(--text-secondary)',
                      fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600,
                    }}>
                    <LockKey size={12} weight="bold" /> 비밀번호
                  </button>
                  {u.createdAt !== '기본 계정' && (
                    <button
                      onClick={() => handleDelete(u.email)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                      style={{
                        background: 'var(--red-dim)', border: '1px solid rgba(255,59,59,0.2)',
                        color: 'var(--red)',
                        fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600,
                      }}>
                      <Trash size={12} weight="bold" /> 삭제
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 비밀번호 변경 패널 */}
      {pwTarget && (
        <div className="card animate-in" style={{ borderColor: 'rgba(0,212,255,0.2)' }}>
          <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
            <LockKey size={15} weight="fill" style={{ color: 'var(--cyan)' }} />
            <div>
              <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                비밀번호 변경
              </p>
              <p className="text-xs mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--cyan)' }}>
                {pwTarget}
              </p>
            </div>
          </div>
          <div className="p-5">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1" style={{ maxWidth: 320 }}>
                <input
                  autoFocus
                  type={showPw ? 'text' : 'password'}
                  value={pwValue}
                  onChange={e => setPwValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChangePw()}
                  placeholder="새 비밀번호 (8자 이상)"
                  className="w-full pr-10 px-3 py-2 text-sm rounded-lg"
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}>
                  {showPw ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                onClick={handleChangePw}
                disabled={changingPw || pwValue.length < 8}
                className="px-5 py-2 rounded-lg text-sm font-bold transition-all"
                style={{
                  background: pwValue.length < 8 ? 'var(--border-dim)' : 'var(--cyan)',
                  color: pwValue.length < 8 ? 'var(--text-muted)' : 'var(--base)',
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                  cursor: pwValue.length < 8 ? 'not-allowed' : 'pointer',
                }}>
                {changingPw ? '변경 중...' : '변경'}
              </button>
              <button
                onClick={() => { setPwTarget(''); setPwValue(''); }}
                className="px-4 py-2 rounded-lg text-sm transition-all"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-muted)' }}>
                취소
              </button>
            </div>
            {pwValue.length > 0 && pwValue.length < 8 && (
              <p className="text-xs mt-2" style={{ color: 'var(--red)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
                비밀번호는 8자 이상이어야 합니다. ({pwValue.length}/8)
              </p>
            )}
          </div>
        </div>
      )}

      {/* 신규 계정 추가 */}
      <div className="card animate-in delay-100">
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <UserPlus size={15} weight="fill" style={{ color: 'var(--green)' }} />
          <div>
            <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
              새 계정 추가
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              추가된 계정은 즉시 로그인 가능합니다
            </p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3" style={{ maxWidth: 480 }}>
            {/* 이메일 */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--text-muted)' }}>
                이메일
              </label>
              <div className="relative">
                <EnvelopeSimple size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }} />
                <input
                  ref={newEmailRef}
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg"
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
                <LockKey size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }} />
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="8자 이상"
                  className="w-full pl-9 pr-10 py-2 text-sm rounded-lg"
                />
                <button type="button" onClick={() => setShowNewPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}>
                  {showNewPw ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>
                  비밀번호는 8자 이상이어야 합니다. ({newPassword.length}/8)
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={adding || !newEmail || newPassword.length < 8}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
            style={{
              background: (!newEmail || newPassword.length < 8) ? 'var(--border-dim)' : 'var(--green)',
              color: (!newEmail || newPassword.length < 8) ? 'var(--text-muted)' : '#fff',
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              cursor: (!newEmail || newPassword.length < 8) ? 'not-allowed' : 'pointer',
            }}>
            <UserPlus size={15} weight="bold" />
            {adding ? '추가 중...' : '계정 추가'}
          </button>

          <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
            비밀번호는 SHA-256으로 해시 처리되어 저장됩니다. 평문은 저장되지 않습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
