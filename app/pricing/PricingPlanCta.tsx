'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { isOpenBetaMode } from '@/app/lib/open-beta-policy';

type PlanKey = 'free' | 'monthly' | 'yearly';

export function PricingPlanCta({
  planKey,
  planName,
}: {
  planKey: PlanKey;
  planName: string;
}) {
  if (isOpenBetaMode()) {
    return (
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-100 px-6 py-3 text-center font-semibold text-zinc-500"
      >
        출시 예정
      </button>
    );
  }

  // 정식 모드용 (베타 종료 후)
  return <LegacyPricingPlanCta planKey={planKey} planName={planName} />;
}

function LegacyPricingPlanCta({
  planKey,
  planName,
}: {
  planKey: PlanKey;
  planName: string;
}) {
  const { status } = useSession();
  let label = `${planName} 시작하기`;
  if (planKey === 'free') label = '무료체험 사용해보기';

  const href =
    planKey === 'free'
      ? '/excload'
      : status === 'authenticated'
        ? `/subscribe?plan=${encodeURIComponent(planKey)}`
        : `/auth/login?callbackUrl=${encodeURIComponent(`/subscribe?plan=${planKey}`)}`;

  return (
    <Link
      href={href}
      className="block w-full rounded-lg bg-blue-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-700"
    >
      {label}
    </Link>
  );
}
