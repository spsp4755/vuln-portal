export type KisaNoticeKind =
  | 'update_advisory'
  | 'cisa_exploit'
  | 'knvd_vulnerability'
  | 'security_notice';

export interface KisaNoticeDisplay {
  kind: KisaNoticeKind;
  label: string;
  color: string;
  bg: string;
}

const DISPLAY: Record<KisaNoticeKind, Omit<KisaNoticeDisplay, 'kind'>> = {
  update_advisory: {
    label: '업데이트 권고',
    color: 'var(--orange)',
    bg: 'rgba(255,143,0,0.12)',
  },
  cisa_exploit: {
    label: 'Exploit 공유',
    color: 'var(--red)',
    bg: 'rgba(255,59,59,0.12)',
  },
  knvd_vulnerability: {
    label: 'KNVD 취약점',
    color: 'var(--cyan)',
    bg: 'var(--cyan-dim)',
  },
  security_notice: {
    label: '보안 공지',
    color: 'var(--text-secondary)',
    bg: 'var(--elevated)',
  },
};

export function classifyKisaNotice(input: {
  title?: string | null;
  description?: string | null;
  source?: string | null;
}): KisaNoticeDisplay {
  const title = input.title || '';
  const description = input.description || '';
  const source = input.source || '';
  const text = `${title}\n${description}`.toLowerCase();

  let kind: KisaNoticeKind = 'security_notice';
  if (source === 'kisa-info' || /cve-\d{4}-\d{4,}/i.test(title)) {
    kind = 'knvd_vulnerability';
  } else if (text.includes('exploit') || title.includes('CISA 발표')) {
    kind = 'cisa_exploit';
  } else if (title.includes('업데이트 권고') || text.includes('최신 버전으로 업데이트 권고')) {
    kind = 'update_advisory';
  }

  return { kind, ...DISPLAY[kind] };
}

export function kisaNoticeMatchesKind(
  notice: { title?: string | null; description?: string | null; source?: string | null },
  kind?: string | null
) {
  return !kind || classifyKisaNotice(notice).kind === kind;
}
