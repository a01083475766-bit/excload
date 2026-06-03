/** 피드백 이벤트 PRO 체험 사용량 (유료 PRO와 동일) */
export const FEEDBACK_TRIAL_POINTS = 400_000;

/** 체험 기간(일) */
export const FEEDBACK_TRIAL_DAYS = 30;

/** 기본 마감: 2026-07-30 23:59:59 KST */
export const DEFAULT_FEEDBACK_EVENT_ENDS_AT = new Date('2026-07-30T14:59:59.999Z');

export const FEEDBACK_FEATURES = [
  { value: 'order-convert', label: '택배주문변환' },
  { value: 'logistics-convert', label: '물류주문변환' },
  { value: 'invoice-file-convert', label: '송장파일변환' },
] as const;

export const FEEDBACK_CONVERSION_RESULTS = [
  { value: 'good', label: '잘 됐어요' },
  { value: 'partial', label: '일부 수정이 필요했어요' },
  { value: 'bad', label: '잘 안 됐어요' },
] as const;

export const MIN_FEEDBACK_CONTENT_LENGTH = 20;
