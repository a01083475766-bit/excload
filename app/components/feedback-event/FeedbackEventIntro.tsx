'use client';

import Link from 'next/link';
import type { FeedbackEventStatusPayload } from '@/app/components/feedback-event/useFeedbackEventStatus';

type Props = {
  data: FeedbackEventStatusPayload | null;
  from?: string | null;
};

export function FeedbackEventIntro({ data, from }: Props) {
  const endsLabel = data?.event.endsAtLabel ?? '';
  const trialActive = data?.user.feedbackTrialActive ?? false;
  const trialEnds = data?.user.feedbackTrialEndsAt;
  const canTrial = data?.user.canSubmitForTrial ?? false;

  return (
    <>
      <div className="text-zinc-600 text-sm leading-relaxed mb-4 space-y-3">
        <p className="font-medium text-zinc-800">피드백 이벤트 진행 중입니다.</p>
        <p>
          엑클로드는 여러분의 의견을 바탕으로 더 나아지고 있습니다.
          <br />
          사용하시면서 변환 결과가 좋았던 점, 불편했던 점, 아쉬웠던 부분을 편하게 남겨주세요.
        </p>
        <p>
          남겨주신 의견은 엑클로드를 더 정확하고 편리한 서비스로 개선하는 데 소중히 참고하겠습니다.
        </p>
        <p>
          피드백을 남겨주신 계정에는 감사의 의미로 <strong>PRO 30일 체험 혜택</strong>을{' '}
          <strong>1회</strong> 제공해드립니다.
          <br />
          많은 의견 부탁드립니다.
        </p>
      </div>
      {endsLabel && (
        <p className="text-xs text-zinc-500 mb-6">접수 마감: {endsLabel}까지 (KST)</p>
      )}

      {from === 'pricing' && canTrial && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          먼저 무료 플랜으로 변환·다운로드를 체험한 뒤, 「작성하기」에서 피드백을 남기시면 PRO
          체험을 받을 수 있습니다.
        </div>
      )}

      {trialActive && trialEnds && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          현재 피드백 이벤트 PRO 체험 중입니다. (
          {new Date(trialEnds).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}까지) 체험
          종료 후 자동 결제 없이 FREE 플랜으로 전환됩니다.{' '}
          <Link href="/subscribe?plan=monthly" className="underline font-medium">
            구독하기
          </Link>
        </div>
      )}

      {data?.user.feedbackTrialUsed && !trialActive && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 leading-relaxed">
          PRO 체험은 이미 사용하셨습니다. (계정당 1회) 추가 의견도 「작성하기」로 언제든 남기실 수
          있습니다.
        </div>
      )}

      {data?.user.isPaid && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 leading-relaxed">
          유료 플랜 이용 중으로 PRO 체험권은 제공되지 않는 점 양해 부탁드립니다.
          <br />
          소중한 의견 감사합니다.
        </div>
      )}
    </>
  );
}
