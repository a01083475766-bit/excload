/**
 * 플랜별 후속 안내. 무료는 결제 없음, 유료는 Stripe·토스 연동(app/api/stripe/*, app/api/toss/*).
 * ⚠️ EXCLOAD CONSTITUTION v4.2 — 결제 UI는 본 페이지·결제 API에서만 다룹니다.
 */
'use client';

import { useUserStore } from '@/app/store/userStore';
import { runAfterTossChargeResponse } from '@/app/lib/toss/after-charge-client';

import Link from 'next/link';
import { Shield, Lock } from 'lucide-react';
import { Suspense, useMemo, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const CARD_BRAND_LABELS = ['KB', '신한', '삼성', '현대', 'BC', '롯데', 'NH', '하나'] as const;

const EASY_PAY_LABELS = [
  { name: '토스페이', color: 'bg-blue-500' },
  { name: '네이버페이', color: 'bg-green-600' },
  { name: '카카오페이', color: 'bg-yellow-400' },
] as const;

const PAID_PLAN_OPTIONS = [
  {
    planKey: 'monthly' as const,
    name: '프로',
    price: 4000,
    period: '월',
    badge: null as string | null,
    description: '매월 400,000 사용량',
  },
  {
    planKey: 'yearly' as const,
    name: '연간',
    price: 40000,
    period: '년',
    badge: '20% 할인',
    description: '매월 400,000 사용량',
  },
];

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
  const fetchUser = useUserStore((state) => state.fetchUser);
  const [tossLoading, setTossLoading] = useState(false);
  const [tossChargeLoading, setTossChargeLoading] = useState(false);
  const [registeredCardSummary, setRegisteredCardSummary] = useState<string | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);

  const billingCycleText = planKey === 'yearly' ? '연 단위' : '월 단위';
  const selectedPlan = PAID_PLAN_OPTIONS.find((p) => p.planKey === planKey)!;
  const paymentActionsDisabled = !termsAgreed || tossLoading || tossChargeLoading;
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
    if (tossLoading || tossChargeLoading) return;

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
      type TossWindow = Window & {
        TossPayments: (key: string) => {
          requestBillingAuth: (
            method: string,
            params: { customerKey: string; successUrl: string; failUrl: string }
          ) => Promise<void>;
        };
      };
      const w = window as unknown as TossWindow;
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
  }, [tossLoading, tossChargeLoading, planKey]);

  const handleTossCharge = useCallback(async () => {
    if (tossChargeLoading || tossLoading) return;

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
      const outcome = await runAfterTossChargeResponse(res, data, {
        fetchUser,
        onSuccessNavigate: () => {
          window.location.href = '/mypage';
        },
      });
      if (outcome.kind === 'billing_missing') {
        alert('등록된 결제카드가 없습니다. 먼저 "토스로 카드 등록 (빌링)"을 완료해 주세요.');
        return;
      }
      if (outcome.kind === 'already_subscribed') {
        alert(`${outcome.message}\n필요하시면 마이페이지에서 해지 예약 또는 환불 신청을 진행하실 수 있습니다.`);
        return;
      }
      if (outcome.kind === 'error') {
        alert(outcome.message);
        return;
      }
    } catch (e) {
      console.error(e);
      alert('결제 요청 중 오류가 발생했습니다.');
    } finally {
      setTossChargeLoading(false);
    }
  }, [planKey, tossAmount, tossOrderName, tossChargeLoading, tossLoading, fetchUser]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8 sm:py-12 px-4">
      <div className="max-w-[480px] mx-auto">
        <header className="mb-6 text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            주문서
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            로그인 후 결제를 진행해 주세요. 정기결제 상품이며, 선택한 {billingCycleText} 주기로
            자동 갱신됩니다. 마이페이지에서 언제든 해지할 수 있습니다.
          </p>
        </header>

        <div className="rounded-[10px] bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200/80 dark:border-zinc-800 overflow-hidden">
          <section className="p-5 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
              구독 플랜
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {PAID_PLAN_OPTIONS.map((plan) => {
                const isSelected = plan.planKey === planKey;
                return (
                  <Link
                    key={plan.planKey}
                    href={`/subscribe?plan=${plan.planKey}`}
                    className={`relative rounded-[10px] border-2 p-3.5 text-left transition-colors ${
                      isSelected
                        ? 'border-[#3182f6] bg-blue-50/50 dark:bg-blue-950/30'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2 right-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[#3182f6] text-white">
                        {plan.badge}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {plan.name}
                    </p>
                    <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      ₩{plan.price.toLocaleString()}
                      <span className="text-xs font-normal text-zinc-500"> / {plan.period}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      VAT 별도 · {plan.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="p-5 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              결제 방법
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              현재{' '}
              <strong className="text-zinc-700 dark:text-zinc-300">
                신용·체크카드 정기결제
              </strong>
              만 지원합니다.
            </p>

            <div
              className="w-full rounded-[10px] border-2 border-[#3182f6] bg-white dark:bg-zinc-900 px-4 py-3.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 text-center"
              aria-current="true"
            >
              신용·체크카드
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 opacity-40 pointer-events-none select-none">
              {['계좌이체', '가상계좌', '휴대폰'].map((label) => (
                <div
                  key={label}
                  className="rounded-[10px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-2 py-2.5 text-center text-[11px] text-zinc-500"
                >
                  {label}
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">간편결제 (미지원)</p>
            <div className="mt-2 flex gap-2 opacity-40 pointer-events-none select-none">
              {EASY_PAY_LABELS.map((pay) => (
                <div
                  key={pay.name}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[10px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 py-2.5"
                >
                  <span className={`w-2 h-2 rounded-full ${pay.color}`} aria-hidden />
                  <span className="text-[11px] font-medium text-zinc-500">{pay.name}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {CARD_BRAND_LABELS.map((brand) => (
                <span
                  key={brand}
                  className="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-zinc-600 dark:text-zinc-400"
                >
                  {brand}
                </span>
              ))}
            </div>
          </section>

          <section className="p-5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex justify-between items-baseline text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">결제 예정 금액</span>
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                ₩{selectedPlan.price.toLocaleString()}
                <span className="text-xs font-normal text-zinc-500 ml-1">(VAT 별도)</span>
              </span>
            </div>
            {registeredCardSummary && (
              <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
                등록된 카드:{' '}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {registeredCardSummary}
                </span>
              </p>
            )}
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              카드를 등록한 뒤 결제를 진행해 주세요. 토스페이먼츠를 통해 카드 정보가 안전하게
              처리됩니다.
            </p>
          </section>

          <section className="p-5 border-b border-zinc-100 dark:border-zinc-800">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#3182f6] focus:ring-[#3182f6]"
              />
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-700">
                전체 동의
              </span>
            </label>
            <ul className="mt-3 ml-7 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
              <li className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span>(필수)</span>
                <Link
                  href="/terms"
                  className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200"
                >
                  서비스 이용약관
                </Link>
                <span>동의</span>
              </li>
              <li className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span>(필수)</span>
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200"
                >
                  개인정보 처리방침
                </Link>
                <span>동의</span>
              </li>
              <li className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span>(필수)</span>
                <Link
                  href="/refund"
                  className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200"
                >
                  환불 정책
                </Link>
                <span> 및 정기결제 안내 확인</span>
              </li>
            </ul>
            {!termsAgreed && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">
                약관에 동의하시면 카드 등록 및 결제를 진행할 수 있습니다.
              </p>
            )}
          </section>

          <section className="p-5 space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Shield className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span>안전결제</span>
              <span className="text-zinc-300 dark:text-zinc-600">|</span>
              <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span>SSL 암호화 · 토스페이먼츠 결제</span>
            </div>

            <button
              type="button"
              onClick={handleTossBillingAuth}
              disabled={paymentActionsDisabled}
              className="w-full bg-[#3182f6] text-white py-3.5 rounded-[10px] hover:bg-[#1b64da] disabled:opacity-50 disabled:cursor-not-allowed text-[15px] font-semibold transition-colors"
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
              disabled={paymentActionsDisabled || tossChargeLoading}
              className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3.5 rounded-[10px] hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-[15px] font-semibold transition-colors"
            >
              {tossChargeLoading ? '결제 처리 중…' : tossButtonLabel}
            </button>
          </section>
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          <Link
            href="/pricing"
            className="text-[#3182f6] underline underline-offset-2 hover:text-[#1b64da]"
          >
            다른 플랜 보기
          </Link>
        </p>
      </div>
    </div>
  );
}

function SubscribeInner() {
  const searchParams = useSearchParams();
  const plan = searchParams?.get('plan') ?? null;

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
