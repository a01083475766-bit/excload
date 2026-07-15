import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CONVERSION_RESULTS,
  FEEDBACK_FEATURES,
} from '@/app/lib/feedback-event/constants';

export function getFeedbackFeatureLabel(value: string): string {
  return (
    FEEDBACK_CATEGORIES.find((category) => category.value === value)?.label ??
    FEEDBACK_FEATURES.find((f) => f.value === value)?.label ??
    value
  );
}

export function getFeedbackResultLabel(value: string): string {
  return FEEDBACK_CONVERSION_RESULTS.find((r) => r.value === value)?.label ?? value;
}

/** PRO 체험 종료일 — 예: 2026. 7. 4. */
export function formatFeedbackTrialEndLabel(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}. ${m}. ${day}.`;
}

/** 게시판 공개용 작성자 표시 */
export function maskFeedbackAuthor(userId: string): string {
  const tail = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return tail ? `이용자 ${tail}` : '이용자';
}
