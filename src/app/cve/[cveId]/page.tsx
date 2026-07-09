'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { TermTooltip } from '@/components/ui/Tooltip';
import { hasKoreanText, pickKoreanDescription } from '@/lib/vulnerability-description';
import {
  ShieldWarning, Cube, Code, Link as LinkIcon, ArrowLeft,
  Sparkle, Robot, ArrowSquareOut, GitBranch, ArrowRight, Bug,
  GithubLogo, Newspaper,
} from '@phosphor-icons/react';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

interface SimilarCve {
  cveId: string;
  publishedAt: string | null;
  severity: string | null;
  score: number | null;
  isKev: boolean;
  reason: string;
}

interface ExploitEntry {
  id: string;
  xdbId: string;
  xdbUrl: string;
  exploitType: string | null;
  dateAdded: string | null;
  cloneSshUrl: string | null;
}

interface GithubAdvisory {
  id: string;
  ghsaId: string;
  htmlUrl: string;
  summary: string;
  severity: string | null;
  ecosystem: string | null;
  packageName: string | null;
  vulnerableRange: string | null;
  patchedVersion: string | null;
  updatedAt: string | null;
}

interface KisaNotice {
  id: string;
  title: string;
  link: string;
  description: string | null;
  pubDate: string | null;
  source: string;
  cveIds: string[];
}

interface VulnDetail {
  id: string;
  cveId: string;
  state: string;
  description: { ko: string; en: string };
  publishedAt: string | null;
  modifiedAt: string | null;
  references: string[];
  isKev: boolean;
  cvssScores: {
    version: string;
    baseScore: number;
    baseSeverity: string;
    vectorString: string;
    attackVector?: string;
    attackComplexity?: string;
    privilegesRequired?: string;
    userInteraction?: string;
  }[];
  epssScore: { score: number; percentile: number } | null;
  cpeMappings: { cpeUri: string; vendor: string; product: string }[];
  cweWeaknesses: { cweId: string; name: string }[];
  kevEntry: {
    vendorProject: string;
    product: string;
    dueDate: string | null;
    requiredAction: string;
    knownRansomwareUse: string;
  } | null;
  aiSummary: {
    summaryKo: string;
    riskLevel: string;
    riskReason?: string;
    recommendation?: string;
  } | null;
  exploitEntries: ExploitEntry[];
  kisaNotices: KisaNotice[];
  githubAdvisories: GithubAdvisory[];
}

function Section({ title, icon, children, accent = 'var(--border-base)' }: {
  title: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderBottom: '1px solid var(--border-dim)', borderTop: `2px solid ${accent}` }}
      >
        {icon && <span style={{ color: accent }}>{icon}</span>}
        <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {title}
        </p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ff3b3b', HIGH: '#ff8f00', MEDIUM: '#f5c518', LOW: '#00d4ff',
};

// ko 값에 한글이 있을 때만 '실제 번역'으로 간주 (NVD가 ko에 영어를 복사해 넣는 경우 제외)
const RISK_BG: Record<string, string> = {
  '심각': 'rgba(255,59,59,0.15)', '높음': 'rgba(255,143,0,0.15)', '중간': 'rgba(245,197,24,0.15)', '낮음': 'rgba(0,212,255,0.15)',
};
const RISK_FG: Record<string, string> = {
  '심각': '#ff3b3b', '높음': '#ff8f00', '중간': '#f5c518', '낮음': '#00d4ff',
};

function kisaBadge(title: string, source: string) {
  if (title.includes('업데이트 권고')) {
    return { label: '업데이트 권고', color: 'var(--orange)', bg: 'rgba(255,143,0,0.12)' };
  }
  if (title.includes('CISA 발표') || title.includes('Exploit')) {
    return { label: 'Exploit 공유', color: 'var(--red)', bg: 'rgba(255,59,59,0.12)' };
  }
  if (source === 'kisa-info' || /^CVE-\d{4}-\d{4,}/i.test(title)) {
    return { label: 'KNVD 취약점', color: 'var(--cyan)', bg: 'var(--cyan-dim)' };
  }
  return { label: '보안 공지', color: 'var(--text-secondary)', bg: 'var(--elevated)' };
}

export default function CveDetailPage() {
  const { cveId } = useParams();
  const [vuln, setVuln] = useState<VulnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [similar, setSimilar] = useState<SimilarCve[]>([]);

  useEffect(() => {
    fetch(`/api/vulnerabilities/${cveId}`).then(async (res) => {
      if (res.ok) setVuln(await res.json());
      setLoading(false);
    });
    fetch(`/api/vulnerabilities/${cveId}/similar`)
      .then((r) => r.json()).then(setSimilar).catch(() => {});
  }, [cveId]);

  const requestSummary = async () => {
    setSummarizing(true);
    setAiError('');
    const res = await fetch('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cveId }),
    });
    const data = await res.json();
    if (res.ok) {
      // 응답: { aiSummary: {...}, descriptionKo: string|null }
      const aiSummary = data.aiSummary ?? data;
      const descriptionKo = data.descriptionKo;
      setVuln((v) => {
        if (!v) return v;
        const nextDesc = descriptionKo
          ? { ...(v.description as any), ko: descriptionKo }
          : v.description;
        return { ...v, aiSummary, description: nextDesc };
      });
      if (descriptionKo) setShowOriginal(false);
    } else {
      setAiError(data.error || 'AI 분석 실패');
    }
    setSummarizing(false);
  };

  if (loading) return <div className="p-6"><LoadingSkeleton rows={12} /></div>;
  if (!vuln) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>CVE를 찾을 수 없습니다.</div>
  );

  const preferredKo = pickKoreanDescription({
    ko: vuln.description?.ko,
    kisaNotices: vuln.kisaNotices,
  });
  const hasKoDescription = hasKoreanText(preferredKo.text);
  const hasOriginalDescription = !!(vuln.description?.en && String(vuln.description.en).trim());

  return (
    <div className="space-y-3">
      {/* Back */}
      <Link
        href="/vulnerabilities"
        className="inline-flex items-center gap-1.5 text-xs link-cyan animate-in"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <ArrowLeft size={13} /> 목록으로
      </Link>

      {/* Header card */}
      <div
        className="card animate-in delay-100 p-6 relative overflow-hidden"
        style={{ borderTop: `2px solid ${vuln.isKev ? 'var(--red)' : 'var(--cyan)'}` }}
      >
        {/* bg glow */}
        <div
          className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top left, ${vuln.isKev ? 'rgba(255,59,59,0.06)' : 'rgba(0,212,255,0.04)'} 0%, transparent 70%)` }}
        />
        <div className="flex items-start justify-between relative">
          <div>
            <p
              className="leading-none"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: '1.6rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
            >
              {vuln.cveId}
            </p>
            <p className="mt-2 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
              공개 {vuln.publishedAt ? format(new Date(vuln.publishedAt), 'yyyy-MM-dd', { locale: ko }) : 'N/A'}
              {' · '}수정 {vuln.modifiedAt ? format(new Date(vuln.modifiedAt), 'yyyy-MM-dd', { locale: ko }) : 'N/A'}
              {' · '}{vuln.state}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {vuln.exploitEntries?.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                <Bug size={13} weight="fill" /> PoC {vuln.exploitEntries.length}
              </span>
            )}
            {vuln.isKev && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(255,59,59,0.3)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                <ShieldWarning size={13} weight="fill" /> KEV
              </span>
            )}
            {vuln.githubAdvisories?.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                <GithubLogo size={13} weight="fill" /> GHSA
              </span>
            )}
            {vuln.kisaNotices?.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)', border: '1px solid rgba(0,212,255,0.3)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                <Newspaper size={13} weight="fill" /> KISA {vuln.kisaNotices.length}
              </span>
            )}
            {vuln.cvssScores[0] && (
              <SeverityBadge severity={vuln.cvssScores[0].baseSeverity as any} score={vuln.cvssScores[0].baseScore} />
            )}
          </div>
        </div>
      </div>

      {/* AI Summary */}
      <div className="card animate-in delay-150 overflow-hidden" style={{ borderTop: '2px solid #7c3aed' }}>
        <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <Robot size={15} style={{ color: '#a78bfa' }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
            AI 요약
          </p>
          <button
            onClick={requestSummary}
            disabled={summarizing}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity"
            style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.25)', fontFamily: 'Syne, sans-serif', fontWeight: 700, opacity: summarizing ? 0.5 : 1 }}
          >
            <Sparkle size={12} weight="fill" />
            {summarizing ? '분석 중...' : vuln.aiSummary ? 'AI 재분석' : 'AI 분석 생성'}
          </button>
        </div>
        <div className="p-5">
          {vuln.aiSummary ? (
            <div className="space-y-4">
              {/* 요약 + 위험도 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: RISK_BG[vuln.aiSummary.riskLevel] || 'var(--border-dim)', color: RISK_FG[vuln.aiSummary.riskLevel] || 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    위험도 {vuln.aiSummary.riskLevel}
                  </span>
                  {vuln.aiSummary.riskReason && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{vuln.aiSummary.riskReason}</span>
                  )}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {vuln.aiSummary.summaryKo}
                </p>
              </div>
              {/* 조치 방법 */}
              {vuln.aiSummary.recommendation && (
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(124,58,237,0.25)' }}>
                  <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
                    style={{ background: 'rgba(124,58,237,0.12)', color: '#c4b5fd', fontFamily: 'Syne, sans-serif' }}>
                    <Sparkle size={12} weight="fill" /> 조치 방법
                  </div>
                  <p className="px-3 py-3 text-xs leading-relaxed whitespace-pre-line"
                    style={{ color: 'var(--text-secondary)' }}>
                    {vuln.aiSummary.recommendation}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              {aiError ? (
                <p className="text-xs" style={{ color: 'var(--red)' }}>{aiError}</p>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  아직 AI 분석이 없습니다. <strong>[AI 분석 생성]</strong>을 누르면 영문 설명을 한국어로 번역하고
                  위험도·조치 방법을 생성합니다. (설정 &gt; LLM URL·API Key·모델명 필요)
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-dim)', borderTop: '2px solid var(--cyan)' }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            취약점 설명
          </p>
          {(() => {
            if (!hasKoDescription || !hasOriginalDescription) return null;
            return (
              <div className="ml-auto flex items-center gap-1 p-0.5 rounded-lg text-xs"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                {[['ko', preferredKo.source === 'KISA' ? 'KISA 제공' : '한국어'], ['en', '원문(EN)']].map(([key, label]) => {
                  const active = key === 'en' ? showOriginal : !showOriginal;
                  return (
                    <button key={key} onClick={() => setShowOriginal(key === 'en')}
                      className="px-2.5 py-1 rounded-md transition-all"
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                        background: active ? 'var(--cyan)' : 'transparent',
                        color: active ? 'var(--base)' : 'var(--text-muted)' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <div className="p-5">
          {(() => {
            const body = (showOriginal || !hasKoDescription) ? (vuln.description?.en || preferredKo.text) : preferredKo.text;
            return (
              <>
                {!showOriginal && preferredKo.source === 'KISA' && (
                  <div className="inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-lg text-xs"
                    style={{ background: 'rgba(255,143,0,0.12)', color: 'var(--orange)', border: '1px solid rgba(255,143,0,0.25)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                    <Newspaper size={12} weight="fill" /> KISA 한국어 설명
                  </div>
                )}
                <p className="leading-relaxed whitespace-pre-line" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {body || 'N/A'}
                </p>
                {!hasKoDescription && hasOriginalDescription && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    ※ AI 분석을 생성하면 한국어 번역이 여기에 표시됩니다.
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CVSS */}
        <Section title={<><TermTooltip term="CVSS">CVSS</TermTooltip> 점수</>} accent="var(--cyan)">
          <div className="space-y-3">
            {vuln.cvssScores.map((cvss) => (
              <div key={cvss.version} className="p-3 rounded-lg" style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text-primary)' }}>
                    CVSS v{cvss.version}
                  </span>
                  <SeverityBadge severity={cvss.baseSeverity as any} score={cvss.baseScore} />
                </div>
                <p className="text-xs mb-3 break-all" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                  {cvss.vectorString}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Attack Vector', cvss.attackVector],
                    ['Complexity', cvss.attackComplexity],
                    ['Privileges Req.', cvss.privilegesRequired],
                    ['User Interaction', cvss.userInteraction],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: 'var(--base)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', minWidth: 'max-content' }}>{k}</span>
                      <span className="text-xs font-semibold ml-auto" style={{ color: 'var(--cyan)', fontFamily: 'JetBrains Mono, monospace' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {vuln.epssScore && (
              <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                <div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>EPSS Score</span>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>악용 가능성 예측 점수</p>
                </div>
                <span className="text-lg font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--cyan)' }}>
                  {(vuln.epssScore.score * 100).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </Section>

        {/* CWE */}
        <Section title={<><TermTooltip term="CWE">CWE</TermTooltip> 약점 분류</>} icon={<Code size={15} />} accent="#f59e0b">
          {vuln.cweWeaknesses.length > 0 ? (
            <div className="space-y-2">
              {vuln.cweWeaknesses.map((w) => {
                const cweNum = w.cweId.replace('CWE-', '');
                const mitreUrl = `https://cwe.mitre.org/data/definitions/${cweNum}.html`;
                const nvdUrl = `https://nvd.nist.gov/vuln/categories#${w.cweId}`;
                return (
                  <a
                    key={w.cweId}
                    href={mitreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-lg group transition-all"
                    style={{
                      background: 'var(--elevated)',
                      border: '1px solid transparent',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(245,158,11,0.35)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                  >
                    <span
                      className="shrink-0 px-2 py-0.5 rounded text-xs"
                      style={{
                        fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                        background: 'rgba(245,158,11,0.12)',
                        color: '#f59e0b',
                        border: '1px solid rgba(245,158,11,0.25)',
                      }}
                    >
                      {w.cweId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{w.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        MITRE CWE — 클릭하여 상세 보기
                      </p>
                    </div>
                    <ArrowSquareOut
                      size={14}
                      className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: '#f59e0b' }}
                    />
                  </a>
                );
              })}
            </div>
          ) : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>CWE 정보 없음</p>}
        </Section>

        {/* CPE */}
        <Section title={<>영향 제품 (<TermTooltip term="CPE">CPE</TermTooltip>)</>} icon={<Cube size={15} />} accent="var(--cyan)">
          {vuln.cpeMappings.length > 0 ? (
            <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
              {/* deduplicated by vendor/product */}
              {Array.from(
                new Map<string, typeof vuln.cpeMappings[0]>(
                  vuln.cpeMappings.map((c) => [`${c.vendor}/${c.product}`, c])
                ).values()
              ).map((cpe, i) => (
                <a
                  key={i}
                  href={`https://nvd.nist.gov/products/cpe/search/results?namingFormat=2.3&keyword=${encodeURIComponent(cpe.cpeUri)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2 rounded-lg group transition-all"
                  style={{
                    background: 'var(--elevated)',
                    border: '1px solid transparent',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                      {cpe.vendor}
                      <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                      <span style={{ color: 'var(--cyan)' }}>{cpe.product}</span>
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                      {cpe.cpeUri}
                    </p>
                  </div>
                  <ArrowSquareOut
                    size={13}
                    className="shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--cyan)' }}
                  />
                </a>
              ))}
              {vuln.cpeMappings.length > new Set(vuln.cpeMappings.map((c) => `${c.vendor}/${c.product}`)).size && (
                <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                  * 버전별 중복 항목 제거 후 표시
                </p>
              )}
            </div>
          ) : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>CPE 정보 없음</p>}
        </Section>

        {/* KEV info */}
        {vuln.kevEntry && (
          <Section title={<>CISA <TermTooltip term="KEV">KEV</TermTooltip> 상세</>} icon={<ShieldWarning size={15} weight="fill" />} accent="var(--red)">
            <div className="space-y-2">
              {[
                ['제품', `${vuln.kevEntry.vendorProject} / ${vuln.kevEntry.product}`],
                ['시정 기한', vuln.kevEntry.dueDate ? format(new Date(vuln.kevEntry.dueDate), 'yyyy-MM-dd', { locale: ko }) : 'N/A'],
                ['랜섬웨어', vuln.kevEntry.knownRansomwareUse],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--elevated)' }}>
                  <span className="text-xs w-20 shrink-0 font-bold" style={{ color: 'var(--text-muted)', fontFamily: 'Syne, sans-serif' }}>{k}</span>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
              {vuln.kevEntry.requiredAction && (
                <div
                  className="p-3 rounded-lg mt-2"
                  style={{ background: 'var(--red-dim)', borderLeft: '3px solid var(--red)' }}
                >
                  <p className="text-xs font-bold mb-1" style={{ color: 'var(--red)', fontFamily: 'Syne, sans-serif' }}>필요 조치</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{vuln.kevEntry.requiredAction}</p>
                </div>
              )}
            </div>
          </Section>
        )}
      </div>

      {vuln.kisaNotices?.length > 0 && (
        <Section title="KISA 보안공지" icon={<Newspaper size={15} weight="fill" />} accent="var(--cyan)">
          <div className="space-y-2">
            {vuln.kisaNotices.map((notice) => {
              const badge = kisaBadge(notice.title, notice.source);
              return (
                <a key={notice.id} href={notice.link} target="_blank" rel="noopener noreferrer"
                  className="block p-3 rounded-xl transition-all"
                  style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', textDecoration: 'none' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: badge.bg, color: badge.color, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                      {badge.label}
                    </span>
                    {notice.pubDate && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {format(new Date(notice.pubDate), 'yyyy-MM-dd', { locale: ko })}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {notice.source}
                    </span>
                  </div>
                  <p className="text-sm mt-2" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{notice.title}</p>
                  {notice.description && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      {notice.description.length > 240 ? `${notice.description.slice(0, 240)}...` : notice.description}
                    </p>
                  )}
                  <p className="inline-flex items-center gap-1 text-xs mt-2" style={{ color: 'var(--cyan)' }}>
                    KISA 원문 열기 <ArrowSquareOut size={11} />
                  </p>
                </a>
              );
            })}
          </div>
        </Section>
      )}

      {vuln.githubAdvisories?.length > 0 && (
        <Section title="GitHub Security Advisory" icon={<GithubLogo size={15} weight="fill" />} accent="#a855f7">
          <div className="space-y-2">
            {vuln.githubAdvisories.map((a) => (
              <a key={a.id} href={a.htmlUrl} target="_blank" rel="noopener noreferrer"
                className="block p-3 rounded-xl transition-all"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', textDecoration: 'none' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded"
                    style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                    {a.ghsaId}
                  </span>
                  {a.severity && (
                    <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--border-dim)', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {a.severity}
                    </span>
                  )}
                  {a.ecosystem && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {a.ecosystem}{a.packageName ? ` / ${a.packageName}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-2" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{a.summary}</p>
                {(a.vulnerableRange || a.patchedVersion) && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    affected: {a.vulnerableRange || 'unknown'} · patched: {a.patchedVersion || 'unknown'}
                  </p>
                )}
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Exploit Entries */}
      {vuln.exploitEntries?.length > 0 && (
        <Section title={`공개 익스플로잇 / PoC (${vuln.exploitEntries.length}건)`}
          icon={<Bug size={15} weight="fill" />} accent="#a855f7">
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg mb-3"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <Bug size={14} style={{ color: '#a855f7', flexShrink: 0 }} />
              <p className="text-xs" style={{ color: '#c4b5fd' }}>
                이 취약점에 대한 공개 익스플로잇 코드가 존재합니다. 즉각적인 패치 적용을 권장합니다.
              </p>
            </div>
            {vuln.exploitEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <Bug size={13} style={{ color: '#a855f7', flexShrink: 0 }} />
                  <div className="min-w-0">
                    <p className="text-xs font-mono truncate" style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {e.xdbId}
                    </p>
                    {e.exploitType && (
                      <span className="text-xs px-1.5 py-0.5 rounded mt-0.5 inline-block"
                        style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', fontWeight: 700 }}>
                        {e.exploitType}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {e.dateAdded && (
                    <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                      {format(new Date(e.dateAdded), 'yyyy-MM-dd')}
                    </span>
                  )}
                  {e.xdbUrl && (
                    <span className="text-xs px-2 py-0.5 rounded"
                      style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--border-dim)', color: 'var(--text-muted)', fontSize: '10px' }}>
                      {e.xdbUrl.replace('https://', '').split('/').slice(0, 2).join('/')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Timeline */}
      <Section title="타임라인" icon={<GitBranch size={15} />} accent="var(--cyan)">
        <div className="relative pl-6">
          {/* 세로선 */}
          <div className="absolute left-2 top-2 bottom-2 w-px" style={{ background: 'var(--border-dim)' }} />
          {[
            {
              label: '최초 공개',
              date: vuln.publishedAt,
              color: 'var(--cyan)',
              sub: vuln.publishedAt
                ? `${differenceInDays(new Date(), new Date(vuln.publishedAt))}일 전`
                : null,
            },
            {
              label: '마지막 수정',
              date: vuln.modifiedAt,
              color: 'var(--text-muted)',
              sub: null,
            },
            vuln.kevEntry
              ? { label: 'CISA KEV 등재', date: null, color: 'var(--red)', sub: '실제 악용 확인됨' }
              : null,
            vuln.kevEntry?.dueDate
              ? {
                  label: 'KEV 시정 기한',
                  date: vuln.kevEntry.dueDate,
                  color: differenceInDays(new Date(vuln.kevEntry.dueDate), new Date()) < 0
                    ? 'var(--red)' : 'var(--orange)',
                  sub: differenceInDays(new Date(vuln.kevEntry.dueDate), new Date()) < 0
                    ? '기한 초과' : `D-${differenceInDays(new Date(vuln.kevEntry.dueDate), new Date())}`,
                }
              : null,
          ].filter(Boolean).map((item: any, i) => (
            <div key={i} className="flex items-start gap-3 mb-4 last:mb-0 relative">
              <div className="absolute -left-6 mt-1 w-2 h-2 rounded-full shrink-0"
                style={{ background: item.color, boxShadow: `0 0 4px ${item.color}` }} />
              <div>
                <p className="text-sm font-semibold" style={{ fontFamily: 'Syne, sans-serif', color: item.color }}>
                  {item.label}
                </p>
                <p className="text-xs mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                  {item.date ? format(new Date(item.date), 'yyyy-MM-dd', { locale: ko }) : ''}
                  {item.sub ? ` · ${item.sub}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Similar CVEs */}
      {similar.length > 0 && (
        <Section title="유사 취약점" icon={<ArrowRight size={15} />} accent="var(--orange)">
          <div className="space-y-1.5">
            {similar.map((s) => (
              <Link key={s.cveId} href={`/cve/${s.cveId}`}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl group transition-all"
                style={{ background: 'var(--elevated)', border: '1px solid var(--border-dim)', textDecoration: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,143,0,0.35)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-dim)')}>
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--cyan)' }}>
                    {s.cveId}
                  </span>
                  {s.severity && (
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: `${SEVERITY_COLOR[s.severity] ?? '#666'}20`, color: SEVERITY_COLOR[s.severity] ?? '#666', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '10px' }}>
                      {s.severity} {s.score}
                    </span>
                  )}
                  {s.isKev && (
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--red-dim)', color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '10px' }}>
                      KEV
                    </span>
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,143,0,0.1)', color: 'var(--orange)', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>
                    {s.reason}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                    {s.publishedAt ? format(new Date(s.publishedAt), 'yyyy-MM-dd') : ''}
                  </span>
                  <ArrowSquareOut size={12} className="opacity-0 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }} />
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* References */}
      <Section title="참고 자료" icon={<LinkIcon size={15} />} accent="var(--border-base)">
        <div className="space-y-1.5">
          {(vuln.references as string[]).map((ref, i) => (
            <a
              key={i}
              href={ref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg group transition-all"
              style={{
                background: 'var(--elevated)',
                border: '1px solid transparent',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
            >
              <LinkIcon size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm truncate link-cyan" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>{ref}</span>
              <ArrowSquareOut size={12} className="shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--cyan)' }} />
            </a>
          ))}
          {!(vuln.references as string[]).length && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>참고 자료 없음</p>
          )}
        </div>
      </Section>
    </div>
  );
}
