import {
  FEEDBACK_CONVERSION_RESULTS,
  FEEDBACK_FEATURES,
} from '@/app/lib/feedback-event/constants';

export function getFeedbackFeatureLabel(value: string): string {
  return FEEDBACK_FEATURES.find((f) => f.value === value)?.label ?? value;
}

export function getFeedbackResultLabel(value: string): string {
  return FEEDBACK_CONVERSION_RESULTS.find((r) => r.value === value)?.label ?? value;
}

/** 게시판 공개용 작성자 표시 */
export function maskFeedbackAuthor(userId: string): string {
  const tail = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return tail ? `이용자 ${tail}` : '이용자';
}
