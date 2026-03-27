/**
 * 플랜별 후속 안내. 무료는 결제 없음, 유료는 Stripe·토스 연동(app/api/stripe/*, app/api/toss/*).
 * ⚠️ EXCLOAD CONSTITUTION v4.2 — 결제 UI는 본 페이지·결제 API에서만 다룹니다.
 */
'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function loadTossPaymentsScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as Window & { TossPayments?: unknown };
  if (w.TossPayments) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.tosspayments.com/v1/payment';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('토스 결제창 SDK를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
}

const VALID_PLANS = ['free', 'monthly', 'yearly'] as const;
type PlanKey = (typeof VALID_PLANS)[number];

function isPlanKey(v: string | null): v is PlanKey {
  return v !== null && (VALID_PLANS as readonly string[]).includes(v);
}

function PaidPlanCheckout({ planKey }: { planKey: 'monthly' | 'yearly' }) {
  const [tossLoading, setTossLoading] = useState(false);
  const [tossChargeLoading, setTossChargeLoading] = useState(false);
  const [registeredCardSummary, setRegisteredCardSummary] = useState<string | null>(null);

  const paidLabel =
    planKey === 'monthly'
      ? 'PRO 플랜 (월 4,000원, VAT 별도)'
      : '연간 플랜 (년 40,000원, VAT 별도)';
  const tossAmount = planKey === 'yearly' ? 40000 : 4000;
  const tossOrderName = planKey === 'yearly' ? 'EXCLOAD YEARLY 구독' : 'EXCLOAD PRO 구독';
  const tossButtonLabel =
    planKey === 'yearly' ? '토스로 YEARLY 결제 실행 (40,000원)' : '토스로 PRO 결제 실행 (4,000원)';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/toss/card', { credentials: 'include' });
        if (!res.ok) {
          if (!cancelled) setRegisteredCardSummary(null);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data?.hasBillingKey && typeof data.cardSummary === 'string' && data.cardSummary.trim()) {
          setRegisteredCardSummary(data.cardSummary.trim());
        } else if (data?.hasBillingKey) {
          setRegisteredCardSummary('등록된 카드 정보');
        } else {
          setRegisteredCardSummary(null);
        }
      } catch {
        if (!cancelled) setRegisteredCardSummary(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleTossBillingAuth = useCallback(async () => {
    const clientKey =
      process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ||
      process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY?.trim();
    if (!clientKey) {
      alert(
        'NEXT_PUBLIC_TOSS_CLIENT_KEY가 설정되지 않았습니다. 배포 환경 변수를 확인해 주세요.'
      );
      return;
    }

    try {
      const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
      const session = await sessionRes.json();
      if (!session?.user?.id) {
        window.location.href = '/login';
        return;
      }

      setTossLoading(true);
      await loadTossPaymentsScript();
      const w = window as Window & {
        TossPayments: (key: string) => {
          requestBillingAuth: (
            method: string,
            params: { customerKey: string; successUrl: string; failUrl: string }
          ) => Promise<void>;
        };
      };
      const tossPayments = w.TossPayments(clientKey);
      const origin = window.location.origin;
      await tossPayments.requestBillingAuth('카드', {
        customerKey: session.user.id,
        successUrl: `${origin}/toss/success?plan=${planKey}`,
        failUrl: `${origin}/toss/fail?plan=${planKey}`,
      });
    } catch (error) {
      console.error(error);
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'USER_CANCEL') {
        return;
      }
      alert(error instanceof Error ? error.message : '토스 카드 등록을 시작하지 못했습니다.');
    } finally {
      setTossLoading(false);
    }
  }, []);

  const handleTossCharge = useCallback(async () => {
    try {
      setTossChargeLoading(true);
      const res = await fetch('/api/toss/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          planType: planKey,
          amount: tossAmount,
          orderName: tossOrderName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === 'billingKey 없음') {
          alert('등록된 결제카드가 없습니다. 먼저 "토스로 카드 등록 (빌링)"을 완료해 주세요.');
          return;
        }
        alert(typeof data.error === 'string' ? data.error : '결제 승인에 실패했습니다.');
        return;
      }
      alert('토스 결제가 완료되었습니다. 마이페이지에서 플랜을 확인해 주세요.');
      window.location.href = '/mypage';
    } catch (e) {
      console.error(e);
      alert('결제 요청 중 오류가 발생했습니다.');
    } finally {
      setTossChargeLoading(false);
    }
  }, [planKey, tossAmount, tossOrderName]);

  return (
    <div className="max-w-[600px] mx-auto py-20 px-6 text-center">
      <h1 className="text-2xl font-bold mb-6">결제 진행</h1>

      <p className="mb-6 text-gray-600">
        로그인이 필요하며, 미로그인 시 안내에 따라 로그인 후 다시 시도해 주세요.
      </p>

      <div className="border rounded-lg p-6 border-zinc-200 dark:border-zinc-700">
        <p className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">선택한 플랜</p>
        <p className="text-lg mb-4 text-zinc-800 dark:text-zinc-200">{paidLabel}</p>

        <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-600 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 text-left leading-relaxed">
              해당 상품은 정기결제 상품입니다.
              <br />
              매월 자동으로 결제되며, 언제든지 마이페이지에서 해지할 수 있습니다.
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 text-left">
              국내 카드로 결제하려면 아래에서 카드를 등록 후 결제를 진행해주세요.
            </p>
            {registeredCardSummary && (
              <p className="text-xs text-zinc-500 text-left">
                현재 등록된 결제카드: {registeredCardSummary}
              </p>
            )}
            <button
              type="button"
              onClick={handleTossBillingAuth}
              disabled={tossLoading}
              className="w-full bg-[#0064FF] text-white py-3 rounded-lg hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed text-[15px] font-medium"
            >
              {tossLoading
                ? '토스 연결 중…'
                : registeredCardSummary
                  ? '등록 카드 변경하기'
                  : '토스로 카드 등록 (빌링)'}
            </button>
            <button
              type="button"
              onClick={handleTossCharge}
              disabled={tossChargeLoading}
              className="w-full border border-[#0064FF] text-[#0064FF] dark:text-blue-400 dark:border-blue-400 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed text-[15px] font-medium"
            >
              {tossChargeLoading ? '결제 처리 중…' : tossButtonLabel}
            </button>
        </div>
      </div>

      <p className="mt-8 text-sm text-gray-500">
        <Link href="/pricing" className="text-blue-600 underline underline-offset-2">
          다른 플랜 보기
        </Link>
      </p>
    </div>
  );
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

  return <PaidPlanCheckout planKey={planKey} />;
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
