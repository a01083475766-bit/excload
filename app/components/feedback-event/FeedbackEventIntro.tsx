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
      <p className="text-zinc-600 text-sm leading-relaxed mb-4">
        엑클로드를 사용해 보시고 변환 결과·개선 의견을 게시판에 남겨 주세요. 첫 피드백 제출 시{' '}
        <strong>30일 PRO 체험</strong>(사용량 400,000)이 <strong>계정당 1회</strong> 자동으로
        시작됩니다. 공개 동의한 글은 아래 게시판에 함께 보여 드립니다.
      </p>
      <p className="text-xs text-zinc-500 mb-6">접수 마감: {endsLabel}까지 (KST)</p>

      {from === 'pricing' && canTrial && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          먼저 무료 플랜으로 변환·다운로드를 체험한 뒤, 「작성하기」에서 피드백을 남기시면 PRO
          체험을 받을 수 있습니다.
        </div>
      )}

      {trialActive && trialEnds && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          현재 오픈 피드백 이벤트 PRO 체험 중입니다. (
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
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
          유료 플랜 이용 중입니다. 피드백은 작성 가능하나 PRO 체험권은 제공되지 않습니다.
        </div>
      )}
    </>
  );
}
