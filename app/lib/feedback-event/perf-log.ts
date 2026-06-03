/** 피드백 API 단계별 소요 시간 (개발·FEEDBACK_API_PERF=true 시 콘솔) */
export function createFeedbackPerfLogger(route: string) {
  const enabled =
    process.env.FEEDBACK_API_PERF === 'true' || process.env.NODE_ENV === 'development';
  const startedAt = Date.now();
  const marks: string[] = [];

  return {
    mark(step: string) {
      if (!enabled) return;
      marks.push(`${step}=${Date.now() - startedAt}ms`);
    },
    flush(extra?: Record<string, unknown>) {
      if (!enabled) return;
      console.log(`[FeedbackPerf][${route}] ${marks.join(' ')}`, extra ?? '');
    },
  };
}
