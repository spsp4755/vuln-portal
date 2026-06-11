'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}

export function Tooltip({ content, children, delay = 350 }: TooltipProps) {
  const [visible, setVisible]   = useState(false);
  const [coords, setCoords]     = useState({ x: 0, y: 0, above: true });
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted]   = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!trigRef.current) return;
      const r = trigRef.current.getBoundingClientRect();
      const above = r.top > 140;
      setCoords({
        x: r.left + r.width / 2,
        y: above ? r.top - 10 : r.bottom + 10,
        above,
      });
      setVisible(true);
    }, delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const tooltip = visible && mounted ? createPortal(
    <div
      style={{
        position: 'fixed',
        left: coords.x,
        [coords.above ? 'bottom' : 'top']: coords.above
          ? `calc(100vh - ${coords.y}px)`
          : coords.y,
        transform: 'translateX(-50%)',
        zIndex: 99999,
        minWidth: 210,
        maxWidth: 290,
        padding: '10px 13px',
        borderRadius: 10,
        background: 'var(--elevated)',
        border: '1px solid var(--border-base)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
        pointerEvents: 'none',
        lineHeight: 1.55,
        animation: 'tooltip-in 0.12s ease-out both',
      }}>
      {/* 화살표 */}
      <span style={{
        position: 'absolute',
        [coords.above ? 'bottom' : 'top']: -5,
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 8, height: 8,
        background: 'var(--elevated)',
        borderRight: coords.above ? '1px solid var(--border-base)' : 'none',
        borderBottom: coords.above ? '1px solid var(--border-base)' : 'none',
        borderLeft: coords.above ? 'none' : '1px solid var(--border-base)',
        borderTop: coords.above ? 'none' : '1px solid var(--border-base)',
      }} />
      {content}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <span
        ref={trigRef}
        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {tooltip}
    </>
  );
}

/* ── 용어 사전 ──────────────────────────────────────────────── */
const GLOSSARY: Record<string, { en: string; ko: string; desc: string }> = {
  CVE: {
    en: 'Common Vulnerabilities and Exposures',
    ko: '공통 취약점 및 노출',
    desc: '전 세계 소프트웨어·하드웨어 취약점에 부여되는 고유 식별 번호. NVD에서 관리합니다.',
  },
  CVSS: {
    en: 'Common Vulnerability Scoring System',
    ko: '공통 취약점 점수 시스템',
    desc: '취약점의 심각도를 0~10점으로 수치화한 국제 표준. 점수가 높을수록 위험합니다.',
  },
  KEV: {
    en: 'Known Exploited Vulnerabilities',
    ko: '알려진 악용 취약점',
    desc: '미국 CISA가 실제 사이버 공격에 사용된 것이 확인된 취약점 목록. 즉각 패치가 권고됩니다.',
  },
  EPSS: {
    en: 'Exploit Prediction Scoring System',
    ko: '익스플로잇 예측 점수',
    desc: '향후 30일 내 실제 악용될 가능성을 0~100%로 예측하는 점수. FIRST.org에서 산출합니다.',
  },
  EOL: {
    en: 'End of Life',
    ko: '지원 종료',
    desc: '제조사가 보안 패치·업데이트 지원을 중단한 제품 버전. EOL 제품 사용은 보안 위험입니다.',
  },
  CWE: {
    en: 'Common Weakness Enumeration',
    ko: '공통 약점 열거',
    desc: '소프트웨어 설계·코드 상의 보안 취약점 유형 분류 목록. 예: CWE-79(XSS), CWE-89(SQL Injection)',
  },
  NVD: {
    en: 'National Vulnerability Database',
    ko: '국가 취약점 데이터베이스',
    desc: '미국 NIST가 운영하는 CVE 공식 데이터베이스. CVSS 점수, CPE 정보 등을 제공합니다.',
  },
  CISA: {
    en: 'Cybersecurity and Infrastructure Security Agency',
    ko: '미국 사이버보안청',
    desc: '미국 국토안보부 산하 기관. KEV 목록을 공개하고 사이버 위협 정보를 제공합니다.',
  },
  CPE: {
    en: 'Common Platform Enumeration',
    ko: '공통 플랫폼 열거',
    desc: '소프트웨어·하드웨어 제품을 표준화된 형식으로 식별하는 체계. 취약점 영향 제품 매핑에 사용됩니다.',
  },
};

interface TermProps {
  term: keyof typeof GLOSSARY;
  children: React.ReactNode;
  underline?: boolean;
}

export function TermTooltip({ term, children, underline = true }: TermProps) {
  const g = GLOSSARY[term];
  if (!g) return <>{children}</>;

  const content = (
    <div>
      <p style={{
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        fontWeight: 700, fontSize: 12,
        color: 'var(--cyan)', marginBottom: 3,
      }}>
        {g.en}
      </p>
      <p style={{
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        fontWeight: 600, fontSize: 11,
        color: 'var(--text-secondary)', marginBottom: 7,
      }}>
        {g.ko}
      </p>
      <p style={{
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.65,
      }}>
        {g.desc}
      </p>
    </div>
  );

  return (
    <Tooltip content={content}>
      <span style={{
        borderBottom: underline ? '1px dashed var(--border-hi)' : 'none',
        display: 'inline',
      }}>
        {children}
      </span>
    </Tooltip>
  );
}

export { GLOSSARY };
