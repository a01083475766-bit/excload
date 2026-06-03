'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useFeedbackEventStatus } from '@/app/components/feedback-event/useFeedbackEventStatus';
import { useUserStore } from '@/app/store/userStore';

type PlanKey = 'free' | 'monthly' | 'yearly';

export function PricingPlanCta({
  planKey,
  planName,
}: {
  planKey: PlanKey;
  planName: string;
}) {
  const router = useRouter();
  const { status } = useSession();
  const user = useUserStore((s) => s.user);
  const { data: eventStatus, isEventActive } = useFeedbackEventStatus(true);

  const handleClick = () => {
    if (planKey === 'free') {
      window.location.href = '/excload';
      return;
    }

    if (
      isEventActive &&
      status === 'authenticated' &&
      user?.plan === 'FREE' &&
      eventStatus?.user.canSubmitForTrial
    ) {
      const target = planKey === 'yearly' ? 'yearly' : 'monthly';
      router.push(`/feedback-event?from=pricing&plan=${target}`);
      return;
    }

    window.location.href = `/subscribe?plan=${encodeURIComponent(planKey)}`;
  };

  let label = `${planName} 시작하기`;
  if (planKey === 'free') label = '무료체험 사용해보기';
  if (
    isEventActive &&
    (planKey === 'monthly' || planKey === 'yearly') &&
    status === 'authenticated' &&
    user?.plan === 'FREE' &&
    eventStatus?.user.canSubmitForTrial
  ) {
    label = '피드백 이벤트로 PRO 1개월 체험';
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-center px-6 py-3 rounded-lg font-semibold transition-colors bg-blue-600 hover:bg-blue-700 text-white"
    >
      {label}
    </button>
  );
}
