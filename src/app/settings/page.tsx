'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Gear, Clock, Key, CheckCircle, XCircle, Play, Robot, Timer, ToggleLeft, ToggleRight, Warning, WifiHigh, WifiX, Sparkle, ArrowCounterClockwise, Flask } from '@phosphor-icons/react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Log {
  id: string; source: string; startedAt: string; completedAt: string | null;
  status: string; recordsFetched: number; recordsNew: number; recordsUpdated: number; error: string | null;
}
interface ApiKeyInfo { key: string; isSet: boolean; masked: string; source: string; }
interface ScheduleItem { key: string; value: string; default: string; description: string; valid: boolean; }
interface ExtApiKey { id: string; name: string; createdAt: string; lastUsedAt: string | null; }
interface NewExtApiKey extends ExtApiKey { key: string; }

interface Toast { id: number; type: 'success' | 'error' | 'info'; message: string; }

const KEY_META: Record<string, { label: string; hint: string; type: 'password' | 'text'; placeholder: string }> = {
  NVD_API_KEY: {
    label: 'NVD API Key', type: 'password', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    hint: '선택사항. 없어도 동작하지만 속도 제한이 엄격해집니다.',
  },
  OPENAI_API_KEY: {
    label: 'LLM API Key', type: 'password', placeholder: 'sk-... 또는 로컬 서버용 임의 값',
    hint: '폐쇄망 로컬 LLM 사용 시 임의 문자열 입력. AI 요약 기능에 필요합니다.',
  },
  OPENAI_BASE_URL: {
    label: 'LLM API URL (Base URL)', type: 'text', placeholder: 'http://localhost:30000/v1',
    hint: '로컬 LLM 서버 주소. sglang: :30000/v1 · vLLM: :8000/v1 · Ollama: :11434/v1. 비워두면 공식 OpenAI.',
  },
  OPENAI_MODEL: {
    label: 'AI 모델명', type: 'text', placeholder: 'meta-llama/Llama-3.1-8B-Instruct',
    hint: '로컬 서버에 배포된 모델명 그대로 입력. sglang/vLLM에서 실행 중인 모델명.',
  },
  VULNCHECK_API_KEY: {
    label: 'VulnCheck API Key', type: 'password', placeholder: 'vulncheck_...',
    hint: 'console.vulncheck.com에서 발급. VulnCheck KEV 확장 데이터 수집에 필요합니다. (EPSS는 키 불필요)',
  },
  EOL_CUTOFF_DAYS: {
    label: 'EOL 표시 기간 (일)', type: 'text', placeholder: '365',
    hint: 'EOL 날짜가 N일 이상 지난 항목은 수집·표시하지 않습니다. 기본값: 365 (1년 이내만 표시)',
  },
  NVD_DAYS_BACK: {
    label: 'NVD 수집 기간 (일)', type: 'text', placeholder: '90',
    hint: '수동 수집 시 기본 기간(일). 초기 구축: 90~365일, 상시 운영: 7~30일. 스케줄 자동 수집은 항상 7일로 실행됩니다.',
  },
};

const COLLECTORS: { id: string; name: string; desc: string; interval: string; hasRange?: boolean; hasDays?: boolean; paid?: boolean; needsKey?: boolean }[] = [
  { id: 'nvd',       name: 'NVD',           desc: 'National Vulnerability Database',              interval: '6시간',  hasRange: true },
  { id: 'cisa_kev',  name: 'CISA KEV',      desc: 'Known Exploited Vulnerabilities',              interval: '매일' },
  { id: 'endoflife', name: 'EndOfLife.date', desc: '소프트웨어 지원 종료 정보',                   interval: '매주',   hasDays: true },
  { id: 'epss',      name: 'EPSS',           desc: 'FIRST.org EPSS 익스플로잇 예측 점수 (무료)', interval: '매일' },
  { id: 'vulncheck', name: 'VulnCheck KEV',  desc: 'KEV 확장 데이터 + 랜섬웨어 (Community 무료)', interval: '12시간', needsKey: true },
];

const SCHEDULE_META: Record<string, { label: string; desc: string }> = {
  SCHEDULE_NVD:       { label: 'NVD',           desc: 'National Vulnerability Database 수집' },
  SCHEDULE_CISA_KEV:  { label: 'CISA KEV',      desc: 'Known Exploited Vulnerabilities' },
  SCHEDULE_EOL:       { label: 'EndOfLife.date', desc: '소프트웨어 지원 종료 정보' },
  SCHEDULE_EPSS:      { label: 'EPSS',            desc: 'VulnCheck EPSS 익스플로잇 예측 점수' },
  SCHEDULE_VULNCHECK: { label: 'VulnCheck KEV',  desc: 'KEV 확장 데이터 + 랜섬웨어 여부' },
};

const CRON_PRESETS = [
  { label: '1시간마다', value: '0 */1 * * *' },
  { label: '3시간마다', value: '0 */3 * * *' },
  { label: '4시간마다', value: '0 */4 * * *' },
  { label: '6시간마다', value: '0 */6 * * *' },
  { label: '8시간마다', value: '0 */8 * * *' },
  { label: '12시간마다', value: '0 */12 * * *' },
  { label: '매일 자정', value: '0 0 * * *' },
  { label: '매일 01:00', value: '0 1 * * *' },
  { label: '매일 02:00', value: '0 2 * * *' },
  { label: '매일 03:00', value: '0 3 * * *' },
  { label: '매주 월 03:00', value: '0 3 * * 1' },
  { label: '비활성', value: 'off' },
];

function SectionHeader({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
      <span style={{ color: 'var(--cyan)' }}>{icon}</span>
      <div className="flex-1">
        <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {label}
        </p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

let toastId = 0;

export default function SettingsPage() {
  const [collecting, setCollecting] = useState<string | null>(null);
  const [collectingLogId, setCollectingLogId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [nvdDaysBack, setNvdDaysBack] = useState(90);
  const [eolDaysBack, setEolDaysBack] = useState(365);
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logSort, setLogSort] = useState<{ col: keyof Log | 'elapsed'; dir: 'asc' | 'desc' }>({ col: 'startedAt', dir: 'desc' });
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [scheduleInputs, setScheduleInputs] = useState<Record<string, string>>({});
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // AI 프롬프트/파라미터
  const [aiCfg, setAiCfg] = useState<Record<string, string>>({ AI_PROMPT_TRANSLATE: '', AI_PROMPT_ANALYZE: '', AI_TEMPERATURE: '0.2', AI_MAX_TOKENS: '1500' });
  const [aiDefaults, setAiDefaults] = useState<Record<string, string>>({});
  const [savingAi, setSavingAi] = useState(false);
  const [testCve, setTestCve] = useState('');
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<any>(null);
  const [extKeys, setExtKeys] = useState<ExtApiKey[]>([]);
  const [extKeysLoading, setExtKeysLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<NewExtApiKey | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);


  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchKeys = () => fetch('/api/admin/settings').then(async (r) => {
    if (r.ok) {
      const data: ApiKeyInfo[] = await r.json();
      setKeys(data);
      const eolItem = data.find((k) => k.key === 'EOL_CUTOFF_DAYS');
      if (eolItem?.isSet && eolItem.masked) {
        const parsed = parseInt(eolItem.masked, 10);
        if (!isNaN(parsed) && parsed >= 1) setEolDaysBack(parsed);
      }
      const nvdItem = data.find((k) => k.key === 'NVD_DAYS_BACK');
      if (nvdItem?.isSet && nvdItem.masked) {
        const parsed = parseInt(nvdItem.masked, 10);
        if (!isNaN(parsed) && parsed >= 1) setNvdDaysBack(parsed);
      }
    }
  });

  const fetchLogs = () => {
    setLogsLoading(true);
    fetch('/api/admin/collection-logs?limit=30').then(async (r) => {
      if (r.ok) setLogs(await r.json());
      setLogsLoading(false);
    }).catch(() => setLogsLoading(false));
  };

  const fetchSchedules = () => fetch('/api/admin/schedule').then(async (r) => {
    if (!r.ok) return;
    const data: ScheduleItem[] = await r.json();
    setSchedules(data);
    const inputs: Record<string, string> = {};
    for (const item of data) {
      if (item.key === 'SCHEDULE_ENABLED') {
        setSchedulerEnabled(item.value === 'true');
      } else {
        inputs[item.key] = item.value;
      }
    }
    setScheduleInputs(inputs);
  }).catch(() => {});

  const fetchExtKeys = () => {
    setExtKeysLoading(true);
    fetch('/api/admin/api-keys').then(async (r) => {
      if (r.ok) { const d = await r.json(); setExtKeys(d.keys || []); }
      setExtKeysLoading(false);
    }).catch(() => setExtKeysLoading(false));
  };

  const createExtKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    const res = await fetch('/api/admin/api-keys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    if (res.ok) {
      const d = await res.json();
      setNewKeyValue(d.key);
      setNewKeyName('');
      fetchExtKeys();
      addToast('success', 'API 키가 발급되었습니다. 지금 바로 복사하세요 — 다시 표시되지 않습니다.');
    } else {
      const d = await res.json().catch(() => ({}));
      addToast('error', `발급 실패: ${d.error || '알 수 없는 오류'}`);
    }
    setCreatingKey(false);
  };

  const revokeExtKey = async (id: string) => {
    if (!window.confirm('이 API 키를 삭제할까요? 이 키를 사용하는 모든 연동이 끊어집니다.')) return;
    setRevokingId(id);
    const res = await fetch('/api/admin/api-keys', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { fetchExtKeys(); addToast('success', 'API 키가 삭제되었습니다.'); }
    else { const d = await res.json().catch(() => ({})); addToast('error', `삭제 실패: ${d.error}`); }
    setRevokingId(null);
  };

  const fetchAiConfig = () => fetch('/api/admin/ai-config').then(async (r) => {
    if (!r.ok) return;
    const d = await r.json();
    setAiCfg(d.config || {});
    setAiDefaults(d.defaults || {});
  }).catch(() => {});

  const saveAiConfig = async () => {
    setSavingAi(true);
    const res = await fetch('/api/admin/ai-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(aiCfg),
    });
    if (res.ok) { addToast('success', 'AI 프롬프트/설정이 저장되었습니다.'); fetchAiConfig(); }
    else { const d = await res.json().catch(() => ({})); addToast('error', `저장 실패: ${d.error || '오류'}`); }
    setSavingAi(false);
  };

  const restoreAiDefault = (key: string) => {
    setAiCfg((p) => ({ ...p, [key]: aiDefaults[key] ?? '' }));
    addToast('info', '기본값으로 되돌렸습니다. (저장해야 적용됩니다)');
  };

  const runAiTest = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await fetch('/api/admin/ai-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cveId: testCve.trim() || undefined,
          promptTranslate: aiCfg.AI_PROMPT_TRANSLATE,
          promptAnalyze: aiCfg.AI_PROMPT_ANALYZE,
          temperature: aiCfg.AI_TEMPERATURE,
          maxTokens: aiCfg.AI_MAX_TOKENS,
        }),
      });
      const d = await res.json();
      if (res.ok) setAiTestResult(d);
      else setAiTestResult({ error: d.error || 'AI 테스트 실패', cveId: d.cveId });
    } catch (e: any) {
      setAiTestResult({ error: e.message });
    }
    setAiTesting(false);
  };

  useEffect(() => { fetchKeys(); fetchLogs(); fetchSchedules(); fetchExtKeys(); fetchAiConfig(); }, []);

  const saveKeys = async () => {
    setSavingKeys(true);
    const res = await fetch('/api/admin/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keyInputs),
    });
    if (res.ok) {
      setKeyInputs({});
      fetchKeys();
      addToast('success', 'API 키가 저장되었습니다.');
    } else {
      const d = await res.json().catch(() => ({}));
      addToast('error', `저장 실패: ${d.error || '알 수 없는 오류'}`);
    }
    setSavingKeys(false);
  };

  const saveSchedules = async () => {
    setSavingSchedule(true);
    const payload: Record<string, string> = {
      SCHEDULE_ENABLED: schedulerEnabled ? 'true' : 'false',
      ...scheduleInputs,
    };
    const res = await fetch('/api/admin/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      fetchSchedules();
      addToast('success', '스케줄 설정이 저장되었습니다. 스케줄러가 재시작됩니다.');
    } else {
      const d = await res.json().catch(() => ({}));
      addToast('error', `저장 실패: ${d.error || '유효하지 않은 cron 표현식'}`);
    }
    setSavingSchedule(false);
  };

  const startPolling = useCallback((logIds: string[], source: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const pending = new Set(logIds);
    let anyFailed = false;
    let anyCancelled = false;
    let totalFetched = 0;

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/collection-logs?limit=30`);
        if (!r.ok) return;
        const logs: Log[] = await r.json();

        for (const logId of Array.from(pending)) {
          const job = logs.find((l) => l.id === logId);
          if (job && job.status !== 'running') {
            pending.delete(logId);
            if (job.status === 'failed') anyFailed = true;
            if (job.status === 'cancelled') anyCancelled = true;
            totalFetched += job.recordsFetched || 0;
          }
        }

        if (pending.size === 0) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setCollecting(null);
          setCollectingLogId(null);
          fetchLogs();
          if (anyCancelled) {
            addToast('info', `${source || '전체'} 수집이 중지되었습니다.`);
          } else if (anyFailed) {
            addToast('error', `일부 수집기 실패 — 로그를 확인하세요.`);
          } else {
            addToast('success', `${source || '전체'} 수집 완료 (${totalFetched.toLocaleString()}건)`);
          }
        }
      } catch { /* 무시 */ }
    }, 2000);
  }, [addToast]);

  const triggerCollect = async (source: string, extra?: Record<string, any>) => {
    setCollecting(source || 'all');
    const res = await fetch('/api/admin/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, ...extra }),
    });
    if (res.ok) {
      const data = await res.json();
      const logIds: string[] = data.logIds ?? (data.logId ? [data.logId] : []);
      if (logIds.length) {
        setCollectingLogId(logIds[0]);
        startPolling(logIds, source || '전체');
        addToast('info', `${source || '전체'} 수집 시작됨. 완료까지 기다려 주세요.`);
      }
    } else {
      const d = await res.json().catch(() => ({}));
      addToast('error', `수집 시작 실패: ${d.error || '알 수 없는 오류'}`);
      setCollecting(null);
    }
  };

  const cancelCollect = async () => {
    if (!collecting) return;
    await fetch('/api/admin/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancelSource: collecting }),
    });
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setCollecting(null);
    setCollectingLogId(null);
    fetchLogs();
    addToast('info', '수집 중지 요청을 보냈습니다.');
  };

  const resetData = async (source: string) => {
    if (!window.confirm(`"${source}" 수집 데이터를 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setResetting(source);
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const d = await res.json();
      if (res.ok) {
        fetchLogs();
        addToast('success', `데이터 삭제 완료: ${Object.entries(d.deleted).map(([k, v]) => `${k} ${v}건`).join(', ')}`);
      } else {
        addToast('error', `삭제 실패: ${d.error}`);
      }
    } catch (e: any) {
      addToast('error', e.message);
    }
    setResetting(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'vulncheck' }),
      });
      const d = await res.json();
      setTestResult({ ok: d.ok, message: d.message || d.error || '알 수 없는 결과' });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
    }
    setTesting(false);
  };

  const hasInput = Object.values(keyInputs).some((v) => v?.trim());

  const groups = [
    { title: 'AI 기능 설정', icon: <Robot size={15} />, keys: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'] },
    { title: '데이터 수집 API 키', icon: <Key size={15} />, keys: ['NVD_API_KEY', 'VULNCHECK_API_KEY'] },
    { title: '수집 기간 설정', icon: <Timer size={15} />, keys: ['NVD_DAYS_BACK'] },
  ];

  return (
    <div className="space-y-3">
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm pointer-events-auto"
            style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600,
              background: t.type === 'success' ? 'var(--green-dim)' : t.type === 'error' ? 'var(--red-dim)' : 'var(--elevated)',
              color: t.type === 'success' ? 'var(--green)' : t.type === 'error' ? 'var(--red)' : 'var(--cyan)',
              border: `1px solid ${t.type === 'success' ? 'rgba(16,185,129,0.3)' : t.type === 'error' ? 'rgba(255,59,59,0.3)' : 'var(--border-dim)'}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              animation: 'slideIn 0.2s ease',
              minWidth: '280px',
            }}>
            {t.type === 'success' ? <CheckCircle size={15} weight="fill" /> : t.type === 'error' ? <XCircle size={15} weight="fill" /> : <Warning size={15} weight="fill" />}
            {t.message}
          </div>
        ))}
      </div>

      <div className="animate-in">
        <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          설정
        </h1>
        <p className="mt-1 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
          API 키 · 수집 스케줄 · 폐쇄망 LLM 연동
        </p>
      </div>

      {/* API Keys */}
      <div className="card animate-in delay-100">
        <SectionHeader icon={<Key size={15} />} label="API 키 및 연결 설정" sub="저장된 키는 마스킹 처리되어 표시됩니다" />
        <div className="p-4 space-y-5">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ color: 'var(--text-muted)' }}>{g.icon}</span>
                <p className="text-xs uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, color: 'var(--text-muted)' }}>
                  {g.title}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {g.keys.map((k) => {
                  const info = keys.find((ki) => ki.key === k);
                  const meta = KEY_META[k];
                  return (
                    <div key={k} className="p-4 rounded-xl"
                      style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
                          {meta.label}
                        </label>
                        {info?.isSet ? (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--green-dim)', color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>
                            <CheckCircle size={10} weight="fill" />
                            {info.masked} · {info.source === 'env' ? 'ENV' : 'DB'}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--border-dim)', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                            <XCircle size={10} /> 미설정
                          </span>
                        )}
                      </div>
                      <p className="text-xs mb-2.5" style={{ color: 'var(--text-muted)' }}>{meta.hint}</p>
                      <input
                        type={meta.type}
                        autoComplete="off"
                        placeholder={meta.placeholder}
                        value={keyInputs[k] || ''}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, [k]: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg"
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center flex-wrap gap-3 pt-2" style={{ borderTop: '1px solid var(--border-dim)' }}>
            <button onClick={saveKeys} disabled={savingKeys || !hasInput} className="btn-primary">
              {savingKeys ? '저장 중...' : '설정 저장'}
            </button>
            <button onClick={testConnection} disabled={testing}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all"
              style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}>
              {testing ? <WifiHigh size={13} className="animate-pulse" /> : <WifiHigh size={13} />}
              {testing ? 'VulnCheck 연결 테스트 중...' : 'VulnCheck 연결 테스트'}
            </button>
            {testResult && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  background: testResult.ok ? 'var(--green-dim)' : 'var(--red-dim)',
                  color: testResult.ok ? 'var(--green)' : 'var(--red)',
                  border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(255,59,59,0.3)'}`,
                }}>
                {testResult.ok ? <CheckCircle size={11} weight="fill" /> : <WifiX size={11} />}
                {testResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI 프롬프트 및 동작 */}
      <div className="card animate-in delay-150">
        <SectionHeader icon={<Sparkle size={15} weight="fill" />} label="AI 프롬프트 및 동작" sub="번역/분석 프롬프트와 모델 파라미터를 직접 편집하고 테스트합니다" />
        <div className="p-4 space-y-4">
          {/* 모델 파라미터 */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>Temperature</label>
              <input type="number" min={0} max={1} step={0.1} value={aiCfg.AI_TEMPERATURE || ''}
                onChange={(e) => setAiCfg((p) => ({ ...p, AI_TEMPERATURE: e.target.value }))}
                className="w-24 px-2 py-1.5 text-sm rounded-lg" style={{ fontFamily: 'JetBrains Mono, monospace' }} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>0=일관적, 1=창의적 (권장 0.2)</p>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>최대 토큰 (max_tokens)</label>
              <input type="number" min={256} max={8000} step={100} value={aiCfg.AI_MAX_TOKENS || ''}
                onChange={(e) => setAiCfg((p) => ({ ...p, AI_MAX_TOKENS: e.target.value }))}
                className="w-28 px-2 py-1.5 text-sm rounded-lg" style={{ fontFamily: 'JetBrains Mono, monospace' }} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>응답이 잘리면 늘리세요 (권장 1500)</p>
            </div>
          </div>

          {/* 치환 변수 안내 */}
          <div className="p-3 rounded-xl text-xs" style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-muted)' }}>
            프롬프트에 아래 변수를 쓰면 실제 값으로 치환됩니다:{' '}
            {['{cveId}', '{description}', '{cvss}', '{cwe}', '{products}', '{kev}', '{epss}'].map((v) => (
              <code key={v} style={{ margin: '0 3px', color: 'var(--cyan)' }}>{v}</code>
            ))}
          </div>

          {/* 번역 프롬프트 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>번역 프롬프트 (영문 → 한국어)</label>
              <button onClick={() => restoreAiDefault('AI_PROMPT_TRANSLATE')} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <ArrowCounterClockwise size={11} /> 기본값 복원
              </button>
            </div>
            <textarea rows={6} value={aiCfg.AI_PROMPT_TRANSLATE || ''}
              onChange={(e) => setAiCfg((p) => ({ ...p, AI_PROMPT_TRANSLATE: e.target.value }))}
              className="w-full px-3 py-2 text-xs rounded-lg" style={{ fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, resize: 'vertical' }} />
          </div>

          {/* 분석 프롬프트 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>분석 프롬프트 (요약·위험도·조치)</label>
              <button onClick={() => restoreAiDefault('AI_PROMPT_ANALYZE')} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <ArrowCounterClockwise size={11} /> 기본값 복원
              </button>
            </div>
            <textarea rows={10} value={aiCfg.AI_PROMPT_ANALYZE || ''}
              onChange={(e) => setAiCfg((p) => ({ ...p, AI_PROMPT_ANALYZE: e.target.value }))}
              className="w-full px-3 py-2 text-xs rounded-lg" style={{ fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, resize: 'vertical' }} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              분석 응답은 <code style={{ color: 'var(--cyan)' }}>요약:</code> <code style={{ color: 'var(--cyan)' }}>위험도:</code> <code style={{ color: 'var(--cyan)' }}>사유:</code> <code style={{ color: 'var(--cyan)' }}>조치:</code> 라벨 형식으로 받습니다. 라벨은 유지하세요.
            </p>
          </div>

          {/* 저장 + 테스트 */}
          <div className="flex flex-wrap items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--border-dim)' }}>
            <button onClick={saveAiConfig} disabled={savingAi} className="btn-primary">
              {savingAi ? '저장 중...' : 'AI 설정 저장'}
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <input type="text" value={testCve} onChange={(e) => setTestCve(e.target.value)}
                placeholder="테스트 CVE (비우면 자동 선택)"
                className="w-52 px-3 py-2 text-xs rounded-lg" style={{ fontFamily: 'JetBrains Mono, monospace' }} />
              <button onClick={runAiTest} disabled={aiTesting}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
                style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}>
                <Flask size={13} /> {aiTesting ? '테스트 중...' : '응답 테스트'}
              </button>
            </div>
          </div>

          {/* 테스트 결과 미리보기 */}
          {aiTestResult && (
            <div className="p-3 rounded-xl text-xs space-y-2" style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
              {aiTestResult.error ? (
                <p style={{ color: 'var(--red)' }}>❌ {aiTestResult.cveId ? `[${aiTestResult.cveId}] ` : ''}{aiTestResult.error}</p>
              ) : (
                <>
                  <p style={{ color: 'var(--text-muted)' }}>테스트 대상: <code style={{ color: 'var(--cyan)' }}>{aiTestResult.cveId}</code></p>
                  <div><span style={{ color: '#a78bfa', fontWeight: 700 }}>번역</span><p className="whitespace-pre-line mt-0.5" style={{ color: 'var(--text-secondary)' }}>{aiTestResult.translation || '(없음)'}</p></div>
                  <div><span style={{ color: '#a78bfa', fontWeight: 700 }}>위험도</span> <span style={{ color: 'var(--text-secondary)' }}>{aiTestResult.riskLevel} — {aiTestResult.riskReason}</span></div>
                  <div><span style={{ color: '#a78bfa', fontWeight: 700 }}>요약</span><p className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>{aiTestResult.summaryKo}</p></div>
                  <div><span style={{ color: '#a78bfa', fontWeight: 700 }}>조치 방법</span><p className="whitespace-pre-line mt-0.5" style={{ color: 'var(--text-secondary)' }}>{aiTestResult.recommendation || '(없음)'}</p></div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Auto Schedule */}
      <div className="card animate-in delay-150">
        <SectionHeader icon={<Timer size={15} />} label="자동 수집 스케줄" sub="서버 시작 시 자동으로 데이터를 수집합니다" />
        <div className="p-4 space-y-4">
          {/* Scheduler toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl"
            style={{ background: schedulerEnabled ? 'rgba(0,212,255,0.06)' : 'var(--elevated)', border: `1px solid ${schedulerEnabled ? 'rgba(0,212,255,0.2)' : 'var(--border-dim)'}` }}>
            <div>
              <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: schedulerEnabled ? 'var(--cyan)' : 'var(--text-muted)' }}>
                자동 수집 활성화
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                비활성화하면 수동 수집만 가능합니다
              </p>
            </div>
            <button onClick={() => setSchedulerEnabled(!schedulerEnabled)}
              style={{ color: schedulerEnabled ? 'var(--cyan)' : 'var(--text-muted)' }}>
              {schedulerEnabled ? <ToggleRight size={32} weight="fill" /> : <ToggleLeft size={32} />}
            </button>
          </div>

          {/* Per-source schedule */}
          <div className="space-y-2">
            {Object.entries(SCHEDULE_META).map(([key, meta]) => {
              const current = scheduleInputs[key] || '';
              const savedItem = schedules.find((s) => s.key === key);
              const isOff = current === 'off';
              return (
                <div key={key} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-center p-3 rounded-xl"
                  style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: isOff ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {meta.label}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{meta.desc}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={CRON_PRESETS.some((p) => p.value === current) ? current : '__custom__'}
                      onChange={(e) => {
                        if (e.target.value !== '__custom__') setScheduleInputs((p) => ({ ...p, [key]: e.target.value }));
                      }}
                      className="px-2 py-1.5 rounded-lg text-xs"
                      style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--base)', border: '1px solid var(--border-dim)', color: 'var(--text-primary)' }}
                      disabled={!schedulerEnabled}
                    >
                      {CRON_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                      {!CRON_PRESETS.some((p) => p.value === current) && (
                        <option value="__custom__">직접 입력</option>
                      )}
                    </select>
                    <input
                      type="text"
                      value={current}
                      onChange={(e) => setScheduleInputs((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder="cron 표현식"
                      disabled={!schedulerEnabled}
                      className="w-36 px-2 py-1.5 rounded-lg text-xs"
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}
                    />
                  </div>
                  <div className="shrink-0">
                    {savedItem && (
                      <span className="text-xs px-2 py-0.5 rounded"
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          background: isOff ? 'var(--border-dim)' : 'rgba(0,212,255,0.1)',
                          color: isOff ? 'var(--text-muted)' : 'var(--cyan)',
                        }}>
                        {savedItem.description}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--border-dim)' }}>
            <button onClick={saveSchedules} disabled={savingSchedule} className="btn-primary">
              {savingSchedule ? '저장 중...' : '스케줄 저장'}
            </button>
            <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              저장 후 스케줄러가 자동으로 재시작됩니다
            </p>
          </div>
        </div>
      </div>

      {/* Manual Collection */}
      <div className="card animate-in delay-200">
        <SectionHeader icon={<Play size={15} />} label="수동 데이터 수집" sub="즉시 수집을 트리거합니다" />
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            {COLLECTORS.map((c) => (
              <div key={c.id} className="p-4 rounded-xl"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 mr-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--text-primary)' }}>{c.name}</p>
                      {c.paid && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,179,0,0.15)', color: '#FFB300', border: '1px solid rgba(255,179,0,0.3)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '10px' }}>
                          유료
                        </span>
                      )}
                      {c.needsKey && !c.paid && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--cyan)', border: '1px solid rgba(0,212,255,0.3)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '10px' }}>
                          API키
                        </span>
                      )}
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.desc}</p>
                    <span className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      <Clock size={10} /> {c.interval}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        if (c.paid) return;
                        const extra = c.id === 'nvd' ? { daysBack: nvdDaysBack } : undefined;
                        triggerCollect(c.id, extra);
                      }}
                      disabled={collecting !== null || !!c.paid}
                      title={c.paid ? 'VulnCheck 유료 플랜 전용 (Exploit & Vulnerability Intelligence)' : undefined}
                      className="text-xs px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700,
                        background: c.paid ? 'var(--border-dim)' : collecting === c.id ? 'var(--border-dim)' : 'var(--cyan)',
                        color: c.paid ? 'var(--text-muted)' : collecting === c.id ? 'var(--text-muted)' : 'var(--base)',
                        opacity: (collecting !== null && collecting !== c.id) || c.paid ? 0.5 : 1,
                        cursor: c.paid ? 'not-allowed' : undefined,
                      }}>
                      {collecting === c.id ? '수집중...' : c.paid ? '유료 전용' : '수집'}
                    </button>
                    {collecting === c.id && (
                      <button
                        onClick={cancelCollect}
                        className="text-xs px-3 py-1 rounded-lg transition-all animate-pulse"
                        style={{
                          fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700,
                          background: 'rgba(255,59,59,0.15)',
                          color: 'var(--red)',
                          border: '1px solid rgba(255,59,59,0.4)',
                        }}>
                        중지
                      </button>
                    )}
                    {!c.paid && collecting !== c.id && (
                      <button
                        onClick={() => resetData(c.id)}
                        disabled={resetting !== null || collecting !== null}
                        className="text-xs px-3 py-1 rounded-lg transition-all"
                        style={{
                          fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600,
                          background: 'transparent',
                          color: resetting === c.id ? 'var(--text-muted)' : 'var(--red)',
                          border: '1px solid rgba(255,59,59,0.3)',
                          opacity: resetting !== null && resetting !== c.id ? 0.4 : 1,
                        }}>
                        {resetting === c.id ? '삭제중...' : '초기화'}
                      </button>
                    )}
                  </div>
                </div>
                {c.hasRange && (
                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-dim)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>수집 기간</span>
                    <input
                      type="number" min={1} max={1095} value={nvdDaysBack}
                      onChange={(e) => setNvdDaysBack(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20 px-2 py-1 text-sm rounded-lg text-center"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>일</span>
                  </div>
                )}
                {c.hasDays && (
                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-dim)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>표시 기간</span>
                    <input
                      type="number" min={1} max={3650} value={eolDaysBack}
                      onChange={(e) => setEolDaysBack(Math.max(1, Number(e.target.value) || 365))}
                      className="w-24 px-2 py-1 text-sm rounded-lg text-center"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>일 이내만</span>
                    <button
                      onClick={async () => {
                        await fetch('/api/admin/settings', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ EOL_CUTOFF_DAYS: String(eolDaysBack) }),
                        });
                        fetchKeys();
                        triggerCollect(c.id, { daysBack: eolDaysBack });
                      }}
                      disabled={collecting !== null}
                      className="ml-auto text-xs px-2 py-1 rounded-lg"
                      style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      저장 후 수집
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* All collect + All reset */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex items-center justify-between p-4 rounded-xl"
              style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--cyan)' }}>전체 수집</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>모든 소스 동시 수집</p>
              </div>
              <button
                onClick={() => collecting === 'all' ? cancelCollect() : triggerCollect('')}
                disabled={collecting !== null && collecting !== 'all'}
                className="text-sm px-5 py-2 rounded-lg transition-all"
                style={{
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700,
                  background: collecting === 'all' ? 'rgba(255,59,59,0.15)' : 'var(--cyan)',
                  color: collecting === 'all' ? 'var(--red)' : 'var(--base)',
                  border: collecting === 'all' ? '1px solid rgba(255,59,59,0.4)' : 'none',
                }}>
                {collecting === 'all' ? '■ 중지' : '전체 수집 시작'}
              </button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl"
              style={{ background: 'rgba(255,59,59,0.05)', border: '1px solid rgba(255,59,59,0.2)' }}>
              <div className="mr-4">
                <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--red)' }}>전체 초기화</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>모든 수집 데이터 삭제</p>
              </div>
              <button
                onClick={() => resetData('all')}
                disabled={resetting !== null || collecting !== null}
                className="text-sm px-4 py-2 rounded-lg transition-all"
                style={{
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700,
                  background: 'transparent',
                  color: 'var(--red)',
                  border: '1px solid rgba(255,59,59,0.4)',
                  opacity: resetting !== null || collecting !== null ? 0.4 : 1,
                }}>
                {resetting === 'all' ? '삭제 중...' : '전체 삭제'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* External API Key Management */}
      <div className="card animate-in delay-250">
        <SectionHeader
          icon={<Key size={15} />}
          label="외부 연동 API 키"
          sub="외부 취약점 분석 시스템이 이 포털 데이터를 가져갈 때 사용하는 키입니다"
        />
        <div className="p-4 space-y-4">
          {/* Endpoint info */}
          <div className="p-3 rounded-xl" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)' }}>
            <p className="text-xs font-semibold mb-2" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--cyan)' }}>사용 방법</p>
            <div className="space-y-1">
              {[
                { method: 'GET', path: '/api/v1/vulnerabilities', desc: 'CVE 취약점 목록' },
                { method: 'GET', path: '/api/v1/kev', desc: 'CISA KEV 목록' },
                { method: 'GET', path: '/api/v1/eol', desc: 'EOL 제품 목록' },
              ].map((ep) => (
                <div key={ep.path} className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,212,255,0.15)', color: 'var(--cyan)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '10px' }}>
                    {ep.method}
                  </span>
                  <code className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{ep.path}</code>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— {ep.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              요청 헤더: <code style={{ color: 'var(--cyan)' }}>X-API-Key: vp_...</code>
            </p>
          </div>

          {/* New key created — show once */}
          {newKeyValue && (
            <div className="p-4 rounded-xl" style={{ background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.4)' }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} weight="fill" style={{ color: 'var(--green)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--green)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
                  API 키 발급 완료 — 지금 복사하세요
                </p>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>이 키 값은 다시 표시되지 않습니다.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg text-xs break-all"
                  style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--elevated)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  {newKeyValue.key}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(newKeyValue.key); addToast('success', '클립보드에 복사되었습니다.'); }}
                  className="px-3 py-2 rounded-lg text-xs shrink-0"
                  style={{ background: 'var(--green)', color: 'var(--base)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700 }}>
                  복사
                </button>
                <button onClick={() => setNewKeyValue(null)} className="px-3 py-2 rounded-lg text-xs shrink-0"
                  style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-muted)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>
                  닫기
                </button>
              </div>
            </div>
          )}

          {/* Create new key */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="키 이름 (예: 취약점분석시스템)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createExtKey()}
              className="flex-1 px-3 py-2 text-sm rounded-lg"
              style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}
            />
            <button onClick={createExtKey} disabled={creatingKey || !newKeyName.trim()} className="btn-primary shrink-0">
              {creatingKey ? '발급 중...' : '+ 키 발급'}
            </button>
          </div>

          {/* Key list */}
          {extKeysLoading ? (
            <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
          ) : extKeys.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>발급된 API 키가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {extKeys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: 'var(--text-primary)' }}>
                      {k.name}
                    </p>
                    <p className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                      발급: {format(new Date(k.createdAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
                      {k.lastUsedAt && ` · 마지막 사용: ${format(new Date(k.lastUsedAt), 'yyyy-MM-dd HH:mm', { locale: ko })}`}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeExtKey(k.id)}
                    disabled={revokingId === k.id}
                    className="text-xs px-3 py-1.5 rounded-lg shrink-0 transition-all"
                    style={{ color: 'var(--red)', border: '1px solid rgba(255,59,59,0.3)', background: 'transparent', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600 }}>
                    {revokingId === k.id ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Logs */}
      <div className="card animate-in delay-300">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <div className="flex items-center gap-2.5">
            <Clock size={15} style={{ color: 'var(--cyan)' }} />
            <div>
              <p style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>수집 로그</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>최근 30건</p>
            </div>
          </div>
          <button onClick={fetchLogs} className="text-xs link-cyan" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            새로고침
          </button>
        </div>
        <div className="overflow-x-auto">
          {logsLoading ? (
            <div className="p-5 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>
          ) : (() => {
            const toggleSort = (col: typeof logSort.col) => {
              setLogSort((prev) => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
            };
            const SortIcon = ({ col }: { col: typeof logSort.col }) => logSort.col !== col ? null : (
              <span style={{ marginLeft: 3 }}>{logSort.dir === 'asc' ? '▲' : '▼'}</span>
            );
            const thS = (col: typeof logSort.col): React.CSSProperties => ({
              cursor: 'pointer',
              color: logSort.col === col ? 'var(--cyan)' : undefined,
              userSelect: 'none',
            });
            const sortedLogs = [...logs].sort((a, b) => {
              const d = logSort.dir === 'asc' ? 1 : -1;
              if (logSort.col === 'elapsed') {
                const ea = a.completedAt ? new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime() : 0;
                const eb = b.completedAt ? new Date(b.completedAt).getTime() - new Date(b.startedAt).getTime() : 0;
                return (ea - eb) * d;
              }
              if (logSort.col === 'recordsFetched' || logSort.col === 'recordsNew' || logSort.col === 'recordsUpdated') {
                return ((a[logSort.col] as number) - (b[logSort.col] as number)) * d;
              }
              return ((a[logSort.col] ?? '') < (b[logSort.col] ?? '') ? -1 : 1) * d;
            });
            return (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={thS('source')} onClick={() => toggleSort('source')}>소스 <SortIcon col="source" /></th>
                  <th style={thS('startedAt')} onClick={() => toggleSort('startedAt')}>시작 시간 <SortIcon col="startedAt" /></th>
                  <th style={thS('elapsed')} onClick={() => toggleSort('elapsed')}>소요 <SortIcon col="elapsed" /></th>
                  <th style={thS('status')} onClick={() => toggleSort('status')}>상태 <SortIcon col="status" /></th>
                  <th className="text-right" style={thS('recordsFetched')} onClick={() => toggleSort('recordsFetched')}>수집 <SortIcon col="recordsFetched" /></th>
                  <th className="text-right" style={thS('recordsNew')} onClick={() => toggleSort('recordsNew')}>신규 <SortIcon col="recordsNew" /></th>
                  <th className="text-right" style={thS('recordsUpdated')} onClick={() => toggleSort('recordsUpdated')}>업데이트 <SortIcon col="recordsUpdated" /></th>
                  <th>오류</th>
                </tr>
              </thead>
              <tbody>
                {sortedLogs.map((log) => {
                  const elapsed = log.completedAt
                    ? Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)
                    : null;
                  return (
                    <tr key={log.id}>
                      <td style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                        {log.source || '전체'}
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
                        {format(new Date(log.startedAt), 'MM-dd HH:mm:ss', { locale: ko })}
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {elapsed !== null ? `${elapsed}s` : '—'}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                          style={{
                            fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                            background: log.status === 'success' ? 'var(--green-dim)' : log.status === 'failed' ? 'var(--red-dim)' : 'var(--yellow-dim)',
                            color: log.status === 'success' ? 'var(--green)' : log.status === 'failed' ? 'var(--red)' : 'var(--yellow)',
                          }}>
                          {log.status === 'success' ? <CheckCircle size={10} weight="fill" /> : log.status === 'failed' ? <XCircle size={10} weight="fill" /> : null}
                          {log.status}
                        </span>
                      </td>
                      <td className="text-right" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {log.recordsFetched.toLocaleString()}
                      </td>
                      <td className="text-right" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: log.recordsNew > 0 ? 'var(--green)' : 'var(--text-muted)', fontWeight: log.recordsNew > 0 ? 700 : 400 }}>
                        {log.recordsNew > 0 ? `+${log.recordsNew.toLocaleString()}` : '—'}
                      </td>
                      <td className="text-right" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: log.recordsUpdated > 0 ? 'var(--cyan)' : 'var(--text-muted)' }}>
                        {log.recordsUpdated > 0 ? log.recordsUpdated.toLocaleString() : '—'}
                      </td>
                      <td className="max-w-xs">
                        <span className="text-xs truncate block" style={{ color: log.error ? 'var(--red)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {log.error || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            );
          })()}
          {!logsLoading && !logs.length && (
            <p className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>수집 로그가 없습니다.</p>
          )}
        </div>
      </div>


    </div>
  );
}
