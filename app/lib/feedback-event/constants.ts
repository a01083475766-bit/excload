/** 폼 placeholder — DB에 저장하지 않음 */
export const FEEDBACK_SELECT_VALUE = '';

export const FEEDBACK_FEATURES = [
  { value: 'order-convert', label: '택배주문변환' },
  { value: 'logistics-convert', label: '물류주문변환' },
  { value: 'invoice-file-convert', label: '송장파일변환' },
  { value: 'other', label: '기타' },
] as const;

export const DEFAULT_FEEDBACK_CATEGORY = 'free';

export const FEEDBACK_CATEGORIES = [
  { value: DEFAULT_FEEDBACK_CATEGORY, label: '자유글' },
  { value: 'question', label: '질문' },
  { value: 'inconvenience', label: '불편한 점' },
  { value: 'suggestion', label: '개선 제안' },
  { value: 'bug', label: '오류 제보' },
  { value: 'review', label: '사용 후기' },
] as const;

export const FEEDBACK_CONVERSION_RESULTS = [
  { value: 'good', label: '잘 됐어요' },
  { value: 'partial', label: '일부 수정이 필요했어요' },
  { value: 'bad', label: '잘 안 됐어요' },
  { value: 'other', label: '기타' },
] as const;

export function isValidFeedbackFeature(value: string): boolean {
  return (
    FEEDBACK_FEATURES.some((f) => f.value === value) ||
    FEEDBACK_CATEGORIES.some((category) => category.value === value)
  );
}

export function isValidFeedbackConversionResult(value: string): boolean {
  return FEEDBACK_CONVERSION_RESULTS.some((r) => r.value === value);
}

export function normalizeFeedbackCategory(value: string): string {
  return isValidFeedbackFeature(value) ? value : DEFAULT_FEEDBACK_CATEGORY;
}

export function normalizeFeedbackConversionResult(value: string): string {
  return isValidFeedbackConversionResult(value) ? value : 'other';
}

export const MIN_FEEDBACK_CONTENT_LENGTH = 20;
