/**
 * Next.js Instrumentation Hook
 * 서버 시작 시 자동으로 실행됩니다.
 * next.config.js 에서 experimental.instrumentationHook: true 필요 (Next.js 14)
 */
export async function register() {
  // Node.js 런타임에서만 실행 (Edge Runtime 제외)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { startScheduler } = await import('@/lib/cron-scheduler');
      await startScheduler();
    } catch (e) {
      console.error('[Instrumentation] Failed to start scheduler:', e);
    }
  }
}
