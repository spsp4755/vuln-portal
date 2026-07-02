/**
 * 공통 로거 — stdout/stderr로 한 줄씩 출력됩니다.
 * podman logs / docker logs 에서 바로 확인할 수 있습니다.
 *
 * 형식:  2026-07-03T09:12:34.567Z [INFO ] [HTTP] GET /vulnerabilities 200 (42ms)
 *
 * 레벨 필터: 환경변수 LOG_LEVEL = debug | info | warn | error  (기본 info)
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lv = (process.env.LOG_LEVEL || 'info').toLowerCase() as Level;
  return ORDER[lv] ?? ORDER.info;
}

function line(level: Level, tag: string, msg: string) {
  if (ORDER[level] < threshold()) return;
  const ts = new Date().toISOString();
  const lvl = level.toUpperCase().padEnd(5);
  const out = `${ts} [${lvl}] [${tag}] ${msg}`;
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export const log = {
  debug: (tag: string, msg: string) => line('debug', tag, msg),
  info:  (tag: string, msg: string) => line('info', tag, msg),
  warn:  (tag: string, msg: string) => line('warn', tag, msg),
  error: (tag: string, msg: string) => line('error', tag, msg),
};
