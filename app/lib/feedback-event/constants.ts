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
