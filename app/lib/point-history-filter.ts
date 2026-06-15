/** 변환·다운로드 등 일상 사용 차감 (관리자 전체 로그에서는 제외) */
export const ROUTINE_USAGE_REASONS = ['DOWNLOAD_FILE', 'TEXT_CONVERT'] as const;

export function isRoutineUsageReason(reason: string): boolean {
  return (ROUTINE_USAGE_REASONS as readonly string[]).includes(reason);
}

export function grantsOnlyPointHistoryFilter() {
  return {
    reason: { notIn: [...ROUTINE_USAGE_REASONS] },
  };
}
