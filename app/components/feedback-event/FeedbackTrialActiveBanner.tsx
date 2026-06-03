import Link from 'next/link';
import { formatFeedbackTrialEndLabel } from '@/app/lib/feedback-event/labels';

type Props = {
  endsAt: string;
  className?: string;
};

/** 피드백 이벤트 PRO 체험 중 안내 (게시판·마이페이지·구독 등 공통) */
export function FeedbackTrialActiveBanner({ endsAt, className = '' }: Props) {
  return (
    <p className={className}>
      현재 피드백 이벤트 PRO 체험 중입니다. ({formatFeedbackTrialEndLabel(endsAt)}까지) 체험
      종료 후 FREE 플랜으로 전환됩니다.{' '}
      <Link href="/subscribe?plan=monthly" className="underline font-medium">
        구독하기
      </Link>
    </p>
  );
}
