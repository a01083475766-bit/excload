/** 피드백 이벤트 PRO 체험 사용량 (유료 PRO와 동일) */
export const FEEDBACK_TRIAL_POINTS = 400_000;

/** 체험 기간(일) */
export const FEEDBACK_TRIAL_DAYS = 30;

/** 기본 마감: 2026-07-30 23:59:59 KST */
export const DEFAULT_FEEDBACK_EVENT_ENDS_AT = new Date('2026-07-30T14:59:59.999Z');

/** 폼 placeholder — DB에 저장하지 않음 */
export const FEEDBACK_SELECT_VALUE = '';

export const FEEDBACK_FEATURES = [
  { value: 'order-convert', label: '택배주문변환' },
  { value: 'logistics-convert', label: '물류주문변환' },
  { value: 'invoice-file-convert', label: '송장파일변환' },
  { value: 'other', label: '기타' },
] as const;

export const FEEDBACK_CONVERSION_RESULTS = [
  { value: 'good', label: '잘 됐어요' },
  { value: 'partial', label: '일부 수정이 필요했어요' },
  { value: 'bad', label: '잘 안 됐어요' },
  { value: 'other', label: '기타' },
] as const;

export function isValidFeedbackFeature(value: string): boolean {
  return FEEDBACK_FEATURES.some((f) => f.value === value);
}

export function isValidFeedbackConversionResult(value: string): boolean {
  return FEEDBACK_CONVERSION_RESULTS.some((r) => r.value === value);
}

export const MIN_FEEDBACK_CONTENT_LENGTH = 20;

/** 추가 PRO 체험 없이 피드백만 접수 (이미 1회 사용·체험 중 재제출 등) */
export const FEEDBACK_REPLY_NO_ADDITIONAL_TRIAL =
  '소중한 의견 감사합니다.\n\n' +
  '이번 피드백도 정상적으로 접수되었으며, 남겨주신 내용은 엑클로드 서비스 개선에 참고하겠습니다.\n\n' +
  '다만 오픈 피드백 이벤트의 PRO 체험 혜택은 계정당 1회에 한해 제공되고 있어, 이번 피드백에는 추가 혜택이 제공되지 않는 점 양해 부탁드립니다.\n\n' +
  '혜택 제공 여부와 관계없이 보내주시는 의견은 서비스 개선에 큰 도움이 됩니다.\n' +
  '앞으로도 불편한 점이나 개선 의견이 있으시면 언제든 편하게 남겨주세요.\n\n' +
  '감사합니다.';

/** @deprecated FEEDBACK_REPLY_NO_ADDITIONAL_TRIAL 과 동일 */
export const FEEDBACK_REPLY_DURING_TRIAL = FEEDBACK_REPLY_NO_ADDITIONAL_TRIAL;

/** @deprecated FEEDBACK_REPLY_NO_ADDITIONAL_TRIAL 과 동일 */
export const FEEDBACK_REPLY_ALREADY_USED_TRIAL = FEEDBACK_REPLY_NO_ADDITIONAL_TRIAL;

/** 유료 플랜 이용 중 */
export const FEEDBACK_REPLY_PAID_USER =
  '소중한 의견 감사합니다.\n\n' +
  '유료 플랜 이용 중으로 PRO 체험권은 제공되지 않는 점 양해 부탁드립니다.\n' +
  '피드백 내용은 정상 접수되었습니다.';

/** 일반 접수 (체험 미해당 등) */
export const FEEDBACK_REPLY_GENERIC =
  '소중한 의견 잘 받았습니다. 감사합니다. 피드백이 정상 접수되었습니다.';
