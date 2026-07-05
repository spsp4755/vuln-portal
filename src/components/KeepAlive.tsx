'use client';

import { useEffect } from 'react';

/**
 * 유휴 연결 유지용 keepalive.
 *
 * 폐쇄망 방화벽/스위치가 10~15분 유휴 TCP 연결을 조용히 끊으면,
 * 브라우저가 죽은 연결을 재사용하려다 TCP 타임아웃(~1분)만큼 멈춘 뒤에야
 * 새 연결로 복구된다("클릭 후 1분 멈춤 → 로그 버스트" 증상).
 *
 * 3분마다 가벼운 요청을 보내 연결/방화벽 세션을 살려 두어 이를 방지한다.
 * 탭이 다시 보이면 즉시 한 번 더 보내 오래 숨어 있던 경우를 복구한다.
 */
export function KeepAlive() {
  useEffect(() => {
    const INTERVAL = 180_000; // 3분 (방화벽 유휴 타임아웃보다 충분히 짧게)

    const ping = () => {
      fetch(`/api/health?t=${Date.now()}`, { cache: 'no-store', keepalive: true }).catch(() => {});
    };

    const timer = setInterval(ping, INTERVAL);
    const onVisible = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisible);
    // 마운트 직후 1회 (초기 연결 워밍업)
    ping();

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
