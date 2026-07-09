import assert from 'node:assert/strict';
import { classifyKisaNotice } from '../src/lib/kisa-notice';

assert.equal(
  classifyKisaNotice({ title: 'Linux 제품 보안 업데이트 권고', source: 'kisa-notice' }).kind,
  'update_advisory'
);

assert.equal(
  classifyKisaNotice({ title: '美 CISA 발표 주요 Exploit 정보공유(Update. 2026-07-07)' }).kind,
  'cisa_exploit'
);

assert.equal(
  classifyKisaNotice({ title: 'CVE-2026-24498 | EFM-Networks ipTIME 유무선공유기 제품군 보안 기능 우회', source: 'kisa-info' }).kind,
  'knvd_vulnerability'
);

assert.equal(
  classifyKisaNotice({ title: '보안 공지', description: '일반 안내' }).kind,
  'security_notice'
);

console.log('KISA notice classification checks passed');
