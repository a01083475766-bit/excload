/**
 * 플랜별 후속 안내. 무료는 결제 없음, 유료는 Stripe 연동(app/api/stripe/*)과 연계 가능.
 * ⚠️ EXCLOAD CONSTITUTION v4.2 — 결제 UI는 본 페이지·Stripe API에서만 다룹니다.
 */
'use client';

import Link from 'next/link';
import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

const VALID_PLANS = ['free', 'monthly', 'yearly'] as const;
type PlanKey = (typeof VALID_PLANS)[number];

function isPlanKey(v: string | null): v is PlanKey {
  return v !== null && (VALID_PLANS as readonly string[]).includes(v);
}

function SubscribeInner() {
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan');

  const planKey = useMemo(() => (isPlanKey(plan) ? plan : null), [plan]);

  if (!planKey) {
    return (
      <div className="max-w-[600px] mx-auto py-20 px-6 text-center">
        <h1 className="text-2xl font-bold mb-4">플랜을 선택해 주세요</h1>
        <p className="text-gray-600 mb-8">
          올바른 플랜 링크가 아닙니다. 가격 페이지에서 다시 선택해 주세요.
        </p>
        <Link
          href="/pricing"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          가격 플랜 보기
        </Link>
      </div>
    );
  }

  if (planKey === 'free') {
    return (
      <div className="max-w-[600px] mx-auto py-20 px-6 text-center">
        <h1 className="text-2xl font-bold mb-6">무료 플랜 시작</h1>
        <p className="mb-4 text-gray-600 leading-relaxed">
          무료 플랜은 <strong className="text-zinc-800">별도 결제 없이</strong> 회원가입 후 이용할 수 있습니다.
          가입 시 기본적으로 무료(FREE) 플랜이 적용됩니다.
        </p>
        <p className="mb-10 text-sm text-gray-500">
          이미 계정이 있으시면 로그인한 뒤 주문변환 등 서비스를 바로 이용하실 수 있습니다.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/signup"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            회원가입
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-6 py-3 font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            로그인
          </Link>
          <Link
            href="/order-convert"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-6 py-3 font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            주문변환 바로가기
          </Link>
        </div>
      </div>
    );
  }

  const paidLabel =
    planKey === 'monthly'
      ? 'PRO 플랜 (월 4,000원, VAT 별도)'
      : '연간 플랜 (년 40,000원, VAT 별도)';

  return (
    <div className="max-w-[600px] mx-auto py-20 px-6 text-center">
      <h1 className="text-2xl font-bold mb-6">결제 진행</h1>

      <p className="mb-6 text-gray-600">
        현재 결제 시스템을 준비 중입니다.
        <br />
        정식 오픈 시 정상적으로 결제가 가능합니다.
      </p>

      <div className="border rounded-lg p-6 border-zinc-200 dark:border-zinc-700">
        <p className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">선택한 플랜</p>
        <p className="text-lg mb-6 text-zinc-800 dark:text-zinc-200">{paidLabel}</p>

        <button
          type="button"
          disabled
          className="w-full bg-blue-600 text-white py-3 rounded-lg opacity-90 cursor-not-allowed"
        >
          결제 진행하기 (준비중)
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-500">
        <Link href="/pricing" className="text-blue-600 underline underline-offset-2">
          다른 플랜 보기
        </Link>
      </p>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[600px] mx-auto py-20 text-center text-gray-600">불러오는 중…</div>
      }
    >
      <SubscribeInner />
    </Suspense>
  );
}
