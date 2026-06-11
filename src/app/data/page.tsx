'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DownloadSimple, UploadSimple, FileCsv, FileJs, FunnelSimple,
  CheckCircle, XCircle, Warning, ArrowsClockwise, Database,
  ShieldWarning, CalendarX, List, FileText, CloudArrowDown,
} from '@phosphor-icons/react';

/* ─── Types ─────────────────────────────────────────────── */
type DataType  = 'vulnerabilities' | 'kev' | 'eol' | 'collection-logs';
type ExportFmt = 'json' | 'csv';
type TabId     = 'export' | 'import';

interface ImportResult {
  message: string;
  inserted: number;
  updated: number;
  failed: number;
  errors?: string[];
}

/* ─── Constants ─────────────────────────────────────────── */
const DATA_TYPES: { id: DataType; label: string; icon: React.ReactNode; desc: string; color: string; supports_import: boolean }[] = [
  { id: 'vulnerabilities', label: '취약점 데이터',   icon: <ShieldWarning size={18} />, desc: 'CVE, CVSS, CWE, CPE 포함', color: 'var(--cyan)',   supports_import: true  },
  { id: 'kev',             label: 'KEV 목록',        icon: <Warning size={18} />,       desc: 'CISA 실제 악용 취약점',   color: 'var(--red)',    supports_import: false },
  { id: 'eol',             label: 'EOL 데이터',      icon: <CalendarX size={18} />,     desc: '소프트웨어 지원 종료',    color: 'var(--yellow)', supports_import: true  },
  { id: 'collection-logs', label: '수집 로그',       icon: <List size={18} />,          desc: '수집 이력 및 상태',       color: 'var(--green)',  supports_import: false },
];

const SEV = ['CRITICAL','HIGH','MEDIUM','LOW'];
const SEV_ACCENT: Record<string,string> = { CRITICAL:'var(--red)', HIGH:'var(--orange)', MEDIUM:'var(--yellow)', LOW:'var(--green)' };
const EOL_CATS = ['os','browser','runtime','framework','database','infra'];
const EOL_CAT_LABELS: Record<string,string> = { os:'OS', browser:'브라우저', runtime:'런타임', framework:'프레임워크', database:'데이터베이스', infra:'인프라' };

/* ─── Helper ────────────────────────────────────────────── */
function buildExportUrl(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => { if (v) p.set(k,v); });
  return `/api/export?${p}`;
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function DataPage() {
  const [tab,     setTab]     = useState<TabId>('export');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="animate-in flex items-start justify-between">
        <div>
          <h1 style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:800, fontSize:'1.6rem', letterSpacing:'-0.03em', color:'var(--text-primary)' }}>
            데이터 관리
          </h1>
          <p className="mt-1 text-xs" style={{ fontFamily:'JetBrains Mono, monospace', color:'var(--text-muted)' }}>
            수집 데이터 내보내기 · 가져오기 · 분류 다운로드
          </p>
        </div>
        <div className="flex items-center gap-1.5 p-1 rounded-xl" style={{ background:'var(--elevated)', border:'1px solid var(--border-dim)' }}>
          {(['export','import'] as TabId[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
              style={{
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700,
                background: tab===t ? 'var(--cyan)' : 'transparent',
                color:      tab===t ? 'var(--base)' : 'var(--text-muted)',
              }}
            >
              {t==='export' ? <><DownloadSimple size={14}/> 내보내기</> : <><UploadSimple size={14}/> 가져오기</>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'export' ? <ExportTab /> : <ImportTab />}
    </div>
  );
}

/* ─── Export Tab ─────────────────────────────────────────── */
function ExportTab() {
  const [selectedType, setSelectedType] = useState<DataType>('vulnerabilities');
  const [format,       setFormat]       = useState<ExportFmt>('csv');
  const [severity,     setSeverity]     = useState('');
  const [keyword,      setKeyword]      = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [kevOnly,      setKevOnly]      = useState(false);
  const [eolCategory,  setEolCategory]  = useState('');
  const [eolStatus,    setEolStatus]    = useState('');
  const [count,        setCount]        = useState<number | null>(null);
  const [counting,     setCounting]     = useState(false);

  const typeInfo = DATA_TYPES.find((d) => d.id === selectedType)!;

  const fetchCount = async () => {
    setCounting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          severity, keyword, dateFrom, dateTo,
          kevOnly: kevOnly || undefined,
          category: eolCategory || undefined,
          status: eolStatus || undefined,
        }),
      });
      const d = await res.json();
      setCount(d.count ?? 0);
    } finally {
      setCounting(false);
    }
  };

  // auto-count when type changes
  useEffect(() => { fetchCount(); }, [selectedType]);

  const handleDownload = () => {
    const params: Record<string, string | undefined> = { type: selectedType, format };
    if (selectedType === 'vulnerabilities') {
      if (severity)   params.severity = severity;
      if (keyword)    params.keyword  = keyword;
      if (dateFrom)   params.dateFrom = dateFrom;
      if (dateTo)     params.dateTo   = dateTo;
      if (kevOnly)    params.kev      = 'true';
    }
    if (selectedType === 'eol') {
      if (eolCategory) params.category = eolCategory;
      if (eolStatus)   params.status   = eolStatus;
    }
    const url = buildExportUrl(params);
    const a = document.createElement('a');
    a.href = url;
    a.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-in delay-100">
      {/* Left: type selector */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest px-1"
          style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700, color:'var(--text-muted)' }}>
          데이터 유형
        </p>
        {DATA_TYPES.map((dt) => (
          <button
            key={dt.id}
            onClick={() => { setSelectedType(dt.id); setCount(null); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
            style={{
              background: selectedType===dt.id ? `${dt.color}12` : 'var(--surface)',
              border: `1px solid ${selectedType===dt.id ? `${dt.color}40` : 'var(--border-dim)'}`,
            }}
          >
            <div className="p-2 rounded-lg shrink-0" style={{ background:`${dt.color}15`, color:dt.color }}>
              {dt.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: selectedType===dt.id ? dt.color : 'var(--text-primary)' }}>
                {dt.label}
              </p>
              <p className="text-xs" style={{ color:'var(--text-muted)' }}>{dt.desc}</p>
            </div>
            {selectedType===dt.id && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background:dt.color }} />
            )}
          </button>
        ))}
      </div>

      {/* Middle: filters */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest px-1"
          style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700, color:'var(--text-muted)' }}>
          필터 및 분류
        </p>

        <div className="card p-4 space-y-4">
          {/* Vulnerability-specific filters */}
          {selectedType === 'vulnerabilities' && (
            <>
              {/* keyword */}
              <div>
                <label className="block text-xs mb-1.5 font-bold uppercase tracking-wider" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--text-muted)' }}>
                  키워드
                </label>
                <input
                  type="text" value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="CVE ID 또는 키워드..."
                  className="w-full px-3 py-2 text-sm rounded-lg"
                  style={{ fontFamily:'JetBrains Mono, monospace' }}
                />
              </div>

              {/* severity */}
              <div>
                <label className="block text-xs mb-1.5 font-bold uppercase tracking-wider" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--text-muted)' }}>
                  심각도
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSeverity('')}
                    className="text-xs px-3 py-1 rounded-lg transition-all"
                    style={{
                      background: !severity ? 'var(--cyan-dim)' : 'var(--elevated)',
                      color: !severity ? 'var(--cyan)' : 'var(--text-muted)',
                      border: `1px solid ${!severity ? 'rgba(0,212,255,0.3)' : 'var(--border-dim)'}`,
                      fontFamily:'JetBrains Mono, monospace', fontWeight:600,
                    }}
                  >전체</button>
                  {SEV.map((sv) => (
                    <button
                      key={sv}
                      onClick={() => setSeverity(severity===sv ? '' : sv)}
                      className="text-xs px-3 py-1 rounded-lg transition-all"
                      style={{
                        fontFamily:'JetBrains Mono, monospace', fontWeight:600,
                        background: severity===sv ? `${SEV_ACCENT[sv]}20` : 'var(--elevated)',
                        color: severity===sv ? SEV_ACCENT[sv] : 'var(--text-muted)',
                        border: `1px solid ${severity===sv ? `${SEV_ACCENT[sv]}40` : 'var(--border-dim)'}`,
                      }}
                    >{sv}</button>
                  ))}
                </div>
              </div>

              {/* date range */}
              <div>
                <label className="block text-xs mb-1.5 font-bold uppercase tracking-wider" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--text-muted)' }}>
                  공개일 범위
                </label>
                <div className="flex items-center gap-2">
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg" style={{ fontFamily:'JetBrains Mono, monospace' }} />
                  <span className="text-xs" style={{ color:'var(--text-muted)' }}>~</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg" style={{ fontFamily:'JetBrains Mono, monospace' }} />
                </div>
              </div>

              {/* KEV only */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setKevOnly(!kevOnly)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                  style={{
                    fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700,
                    background: kevOnly ? 'var(--red-dim)' : 'var(--elevated)',
                    color: kevOnly ? 'var(--red)' : 'var(--text-muted)',
                    border: `1px solid ${kevOnly ? 'rgba(255,59,59,0.3)' : 'var(--border-dim)'}`,
                  }}
                >
                  <ShieldWarning size={14} /> KEV 전용
                </button>
              </div>
            </>
          )}

          {/* EOL-specific filters */}
          {selectedType === 'eol' && (
            <>
              <div>
                <label className="block text-xs mb-1.5 font-bold uppercase tracking-wider" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--text-muted)' }}>
                  카테고리
                </label>
                <select
                  value={eolCategory}
                  onChange={(e) => setEolCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg"
                  style={{ fontFamily:'JetBrains Mono, monospace' }}
                >
                  <option value="">전체 카테고리</option>
                  {EOL_CATS.map((c) => <option key={c} value={c}>{EOL_CAT_LABELS[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1.5 font-bold uppercase tracking-wider" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--text-muted)' }}>
                  상태
                </label>
                <select
                  value={eolStatus}
                  onChange={(e) => setEolStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg"
                  style={{ fontFamily:'JetBrains Mono, monospace' }}
                >
                  <option value="">전체 상태</option>
                  <option value="due-soon">90일 내 EOL</option>
                  <option value="active">Active</option>
                  <option value="eol">EOL 완료</option>
                </select>
              </div>
            </>
          )}

          {(selectedType === 'kev' || selectedType === 'collection-logs') && (
            <div className="py-4 text-center" style={{ color:'var(--text-muted)' }}>
              <FunnelSimple size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">이 데이터 유형은<br/>별도 필터가 없습니다.</p>
            </div>
          )}

          {/* Apply filter button */}
          {(selectedType === 'vulnerabilities' || selectedType === 'eol') && (
            <button
              onClick={fetchCount}
              disabled={counting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all"
              style={{
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700,
                background:'var(--elevated)', border:'1px solid var(--border-base)',
                color:'var(--text-secondary)',
              }}
            >
              <ArrowsClockwise size={14} className={counting ? 'animate-spin' : ''} />
              {counting ? '집계 중...' : '필터 적용 · 미리보기'}
            </button>
          )}
        </div>
      </div>

      {/* Right: format & download */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest px-1"
          style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700, color:'var(--text-muted)' }}>
          내보내기 옵션
        </p>

        <div className="card p-4 space-y-4">
          {/* format selector */}
          <div>
            <label className="block text-xs mb-2 font-bold uppercase tracking-wider" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--text-muted)' }}>
              파일 형식
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['csv','json'] as ExportFmt[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className="flex flex-col items-center gap-2 py-3 px-4 rounded-xl transition-all"
                  style={{
                    background: format===f ? (f==='csv' ? 'rgba(16,185,129,0.1)' : 'rgba(0,212,255,0.1)') : 'var(--elevated)',
                    border: `1px solid ${format===f ? (f==='csv' ? 'rgba(16,185,129,0.35)' : 'rgba(0,212,255,0.35)') : 'var(--border-dim)'}`,
                  }}
                >
                  {f==='csv'
                    ? <FileCsv size={28} style={{ color: format===f ? 'var(--green)' : 'var(--text-muted)' }} />
                    : <FileJs  size={28} style={{ color: format===f ? 'var(--cyan)'  : 'var(--text-muted)' }} />
                  }
                  <span className="text-sm font-bold uppercase" style={{ fontFamily:'JetBrains Mono, monospace', color: format===f ? (f==='csv' ? 'var(--green)' : 'var(--cyan)') : 'var(--text-muted)' }}>
                    {f}
                  </span>
                  <span className="text-xs text-center" style={{ color:'var(--text-muted)' }}>
                    {f==='csv' ? 'Excel 호환' : '구조화 데이터'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* preview count */}
          <div className="p-3 rounded-xl" style={{ background:'var(--elevated)', border:'1px solid var(--border-dim)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                내보낼 건수
              </span>
              {counting ? (
                <ArrowsClockwise size={14} className="animate-spin" style={{ color:'var(--text-muted)' }} />
              ) : count !== null ? (
                <span className="text-xl font-bold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: typeInfo.color }}>
                  {count.toLocaleString()}
                </span>
              ) : (
                <span className="text-sm" style={{ color:'var(--text-muted)' }}>—</span>
              )}
            </div>
          </div>

          {/* download button */}
          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-all"
            style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:800, fontSize:'14px',
              background: typeInfo.color === 'var(--cyan)' ? 'var(--cyan)' : typeInfo.color,
              color: 'var(--base)',
              letterSpacing:'0.02em',
            }}
          >
            <CloudArrowDown size={18} />
            {format.toUpperCase()} 다운로드
          </button>

          {/* info note */}
          <p className="text-xs leading-relaxed" style={{ color:'var(--text-muted)' }}>
            {format === 'csv'
              ? '※ CSV는 Excel, Google Sheets 등에서 바로 열 수 있습니다. 인코딩: UTF-8'
              : '※ JSON은 다른 시스템으로 데이터를 이전하거나 다시 가져올 때 사용하세요.'}
          </p>
        </div>

        {/* Quick export shortcuts */}
        <div className="card p-4">
          <p className="text-xs uppercase tracking-widest mb-3" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700, color:'var(--text-muted)' }}>
            빠른 내보내기
          </p>
          <div className="space-y-2">
            {[
              { label: 'CRITICAL 취약점 CSV', params: { type:'vulnerabilities', format:'csv', severity:'CRITICAL' } },
              { label: 'KEV 전체 CSV',        params: { type:'kev',             format:'csv' } },
              { label: 'KEV 취약점 JSON',     params: { type:'vulnerabilities', format:'json', kev:'true' } },
              { label: '90일 EOL CSV',        params: { type:'eol',             format:'csv', status:'due-soon' } },
              { label: '수집 로그 CSV',       params: { type:'collection-logs', format:'csv' } },
            ].map((q) => (
              <a
                key={q.label}
                href={buildExportUrl(q.params)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg group transition-all"
                style={{ background:'var(--elevated)', border:'1px solid transparent', textDecoration:'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor='rgba(0,212,255,0.25)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor='transparent')}
              >
                <DownloadSimple size={13} style={{ color:'var(--text-muted)' }} />
                <span className="text-sm" style={{ color:'var(--text-secondary)' }}>{q.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Import Tab ─────────────────────────────────────────── */
function ImportTab() {
  const [importType, setImportType] = useState<'vulnerabilities' | 'eol'>('vulnerabilities');
  const [dragging,   setDragging]   = useState(false);
  const [file,       setFile]       = useState<File | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [result,     setResult]     = useState<ImportResult | null>(null);
  const [error,      setError]      = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const supportedTypes = DATA_TYPES.filter((d) => d.supports_import);

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const doImport = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    setError('');
    try {
      const text = await file.text();
      let data: any[];
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        data = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
      } else {
        setError('현재는 JSON 파일만 가져올 수 있습니다.');
        setUploading(false);
        return;
      }
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, data }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '오류 발생'); }
      else         { setResult(d); }
    } catch (e: any) {
      setError(`파일 파싱 오류: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in delay-100">
      {/* Left: type + file */}
      <div className="space-y-3">
        {/* import type */}
        <div className="card p-4 space-y-3">
          <p className="text-xs uppercase tracking-widest" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700, color:'var(--text-muted)' }}>
            가져올 데이터 유형
          </p>
          <div className="space-y-2">
            {supportedTypes.map((dt) => (
              <button
                key={dt.id}
                onClick={() => setImportType(dt.id as any)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{
                  background: importType===dt.id ? `${dt.color}12` : 'var(--elevated)',
                  border: `1px solid ${importType===dt.id ? `${dt.color}40` : 'var(--border-dim)'}`,
                }}
              >
                <div className="p-1.5 rounded-lg shrink-0" style={{ background:`${dt.color}15`, color:dt.color }}>
                  {dt.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: importType===dt.id ? dt.color : 'var(--text-primary)' }}>
                    {dt.label}
                  </p>
                  <p className="text-xs" style={{ color:'var(--text-muted)' }}>{dt.desc}</p>
                </div>
                {importType===dt.id && (
                  <CheckCircle size={16} className="ml-auto shrink-0" style={{ color:dt.color }} weight="fill" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="card p-8 text-center cursor-pointer transition-all"
          style={{
            border: `2px dashed ${dragging ? 'var(--cyan)' : file ? 'rgba(16,185,129,0.5)' : 'var(--border-base)'}`,
            background: dragging ? 'var(--cyan-dim)' : file ? 'rgba(16,185,129,0.05)' : 'var(--surface)',
          }}
        >
          <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file ? (
            <>
              <FileText size={36} className="mx-auto mb-3" style={{ color:'var(--green)' }} />
              <p className="text-sm font-semibold" style={{ color:'var(--green)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>{file.name}</p>
              <p className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>
                {(file.size / 1024).toFixed(1)} KB · 클릭하여 다른 파일 선택
              </p>
            </>
          ) : (
            <>
              <UploadSimple size={36} className="mx-auto mb-3" style={{ color:'var(--text-muted)' }} />
              <p className="text-sm" style={{ color:'var(--text-secondary)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:600 }}>
                JSON 파일을 여기에 드래그하거나 클릭하세요
              </p>
              <p className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
                이 포털에서 내보낸 JSON 파일 지원
              </p>
            </>
          )}
        </div>
      </div>

      {/* Right: guide + result */}
      <div className="space-y-3">
        {/* guide */}
        <div className="card p-4">
          <p className="text-xs uppercase tracking-widest mb-3" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:700, color:'var(--text-muted)' }}>
            가져오기 형식 안내
          </p>
          <div className="space-y-3">
            {importType === 'vulnerabilities' && (
              <div>
                <p className="text-sm font-semibold mb-2" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--cyan)' }}>취약점 JSON 형식</p>
                <pre className="p-3 rounded-lg text-xs overflow-auto" style={{ background:'var(--elevated)', color:'var(--text-secondary)', fontFamily:'JetBrains Mono, monospace', lineHeight:1.6 }}>
{`[
  {
    "cveId": "CVE-2024-12345",
    "publishedAt": "2024-01-15",
    "description": {
      "en": "A vulnerability in...",
      "ko": "..."
    },
    "references": ["https://..."]
  }
]`}
                </pre>
                <p className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
                  ※ 이 포털에서 내보낸 JSON 파일은 자동으로 인식됩니다.<br/>
                  ※ 기존 데이터는 업데이트, 신규 데이터는 추가됩니다.
                </p>
              </div>
            )}
            {importType === 'eol' && (
              <div>
                <p className="text-sm font-semibold mb-2" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--yellow)' }}>EOL JSON 형식</p>
                <pre className="p-3 rounded-lg text-xs overflow-auto" style={{ background:'var(--elevated)', color:'var(--text-secondary)', fontFamily:'JetBrains Mono, monospace', lineHeight:1.6 }}>
{`[
  {
    "product": "Ubuntu",
    "cycle": "20.04",
    "eolDate": "2025-04-25",
    "isEol": false,
    "lts": true,
    "category": "os"
  }
]`}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* import button */}
        <button
          onClick={doImport}
          disabled={!file || uploading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-all"
          style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:800, fontSize:'14px',
            background: !file || uploading ? 'var(--border-dim)' : 'var(--cyan)',
            color: !file || uploading ? 'var(--text-muted)' : 'var(--base)',
            cursor: !file || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? (
            <><ArrowsClockwise size={16} className="animate-spin" /> 가져오는 중...</>
          ) : (
            <><Database size={16} /> 데이터베이스에 가져오기</>
          )}
        </button>

        {/* result */}
        {result && (
          <div className="card p-4" style={{ border:'1px solid rgba(16,185,129,0.3)', background:'rgba(16,185,129,0.05)' }}>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} weight="fill" style={{ color:'var(--green)' }} />
              <p className="text-sm font-semibold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color:'var(--green)' }}>
                {result.message}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label:'신규 추가', val: result.inserted, color:'var(--green)' },
                { label:'업데이트',  val: result.updated,  color:'var(--cyan)'  },
                { label:'실패',      val: result.failed,   color: result.failed > 0 ? 'var(--red)' : 'var(--text-muted)' },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-lg text-center" style={{ background:'var(--elevated)' }}>
                  <p className="text-lg font-bold" style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif", color: s.color }}>
                    {s.val.toLocaleString()}
                  </p>
                  <p className="text-xs" style={{ color:'var(--text-muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-3 p-3 rounded-lg" style={{ background:'var(--red-dim)' }}>
                <p className="text-xs font-bold mb-1" style={{ color:'var(--red)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>오류 목록 (최대 10건)</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs" style={{ color:'var(--text-muted)', fontFamily:'JetBrains Mono, monospace' }}>{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="card p-4" style={{ border:'1px solid rgba(255,59,59,0.3)', background:'var(--red-dim)' }}>
            <div className="flex items-center gap-2">
              <XCircle size={18} weight="fill" style={{ color:'var(--red)' }} />
              <p className="text-sm" style={{ color:'var(--red)', fontFamily: "'Pretendard Variable', Pretendard, sans-serif", fontWeight:600 }}>{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
