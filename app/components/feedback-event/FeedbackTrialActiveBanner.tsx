import Link from 'next/link';
import { formatFeedbackTrialEndLabel } from '@/app/lib/feedback-event/labels';

type Props = {
  endsAt: string;
  className?: string;
  /** 기본: 베타 피드백 PRO 체험 */
  headline?: string;
};

/** PRO 체험·관리자 혜택 중 안내 (게시판·마이페이지·구독 등 공통) */
export function FeedbackTrialActiveBanner({ endsAt, className = '', headline }: Props) {
  const prefix = headline ?? '현재 베타 피드백 PRO 체험 중입니다.';
  return (
    <p className={className}>
      {prefix} ({formatFeedbackTrialEndLabel(endsAt)}까지) 체험 종료 후 FREE 플랜으로 전환됩니다.{' '}
      <Link href="/subscribe?plan=monthly" className="underline font-medium">
        구독하기
      </Link>
    </p>
  );
}
