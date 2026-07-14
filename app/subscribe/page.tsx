/**
 * 플랜별 후속 안내. 무료는 결제 없음, 유료는 Stripe·토스 연동(app/api/stripe/*, app/api/toss/*).
 * ⚠️ EXCLOAD CONSTITUTION v4.2 — 결제 UI는 본 페이지·결제 API에서만 다룹니다.
 */
'use client';

import { useUserStore } from '@/app/store/userStore';
import { runAfterTossChargeResponse } from '@/app/lib/toss/after-charge-client';
import { dbPlanToIntervalKey, getPlanDisplayName } from '@/app/lib/subscription/plan-change';
import { useFeedbackEventStatus } from '@/app/components/feedback-event/useFeedbackEventStatus';
import { hasProEntitlementClient } from '@/app/lib/feedback-event/client';
import { FeedbackTrialActiveBanner } from '@/app/components/feedback-event/FeedbackTrialActiveBanner';
import {
  canStartPaidCheckout,
  getNewPaidCheckoutBlockMessage,
  isNewPaidCheckoutDisabled,
} from '@/app/lib/open-beta-policy';

import Link from 'next/link';
import { Shield, Lock } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Suspense, useMemo, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

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

type PendingPlanChangeInfo = {
  pendingPlan: string;
  pendingPlanLabel: string;
  pendingPlanApplyAtLabel: string | null;
  currentPlanLabel: string;
};

function PaidPlanCheckout({ planKey }: { planKey: 'monthly' | 'yearly' }) {
  const { status: authStatus } = useSession();
  const user = useUserStore((state) => state.user);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const [tossLoading, setTossLoading] = useState(false);
  const [tossChargeLoading, setTossChargeLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [registeredCardSummary, setRegisteredCardSummary] = useState<string | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [pendingPlanChange, setPendingPlanChange] = useState<PendingPlanChangeInfo | null>(null);
  const [nextBillingLabel, setNextBillingLabel] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  const billingCycleText = planKey === 'yearly' ? '연 단위' : '월 단위';
  const selectedPlan = PAID_PLAN_OPTIONS.find((p) => p.planKey === planKey)!;
  const tossAmount = planKey === 'yearly' ? 40000 : 4000;
  const tossOrderName = planKey === 'yearly' ? 'EXCLOAD YEARLY 구독' : 'EXCLOAD PRO 구독';
  const subscribeButtonLabel = '구독 시작하기';
  const { data: feedbackEventStatus, isEventActive } = useFeedbackEventStatus(true);

  const currentPlanKey = user?.plan ? dbPlanToIntervalKey(user.plan) : null;
  const hasPaidPlan = user?.plan === 'PRO' || user?.plan === 'YEARLY';
  const paidCheckoutBlocked =
    isNewPaidCheckoutDisabled() && !(user?.plan && canStartPaidCheckout(user.plan));
  const paymentActionsDisabled =
    !termsAgreed ||
    tossLoading ||
    tossChargeLoading ||
    scheduleLoading ||
    paidCheckoutBlocked;
  const isPlanChangeTarget =
    hasPaidPlan && currentPlanKey !== null && currentPlanKey !== planKey;
  const targetPlanLabel = planKey === 'yearly' ? '연간' : '프로(월간)';
  const scheduleButtonLabel =
    planKey === 'yearly' ? '연간 플랜으로 변경 예약' : '월간 플랜으로 변경 예약';

  const recurringNotice = useMemo(
    () =>
      `정기결제 상품이며, 선택한 ${billingCycleText} 주기로 자동 갱신됩니다. 마이페이지에서 언제든 해지할 수 있습니다.`,
    [billingCycleText]
  );

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

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setPendingPlanChange(null);
      setNextBillingLabel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/subscription-status', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setPendingPlanChange(data?.pendingPlanChange ?? null);
        const endLabel = data?.pendingPlanChange?.pendingPlanApplyAtLabel;
        if (endLabel) {
          setNextBillingLabel(endLabel);
        } else if (data?.subscription?.currentPeriodEnd) {
          setNextBillingLabel(
            new Date(data.subscription.currentPeriodEnd).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          );
        } else {
          setNextBillingLabel(null);
        }
      } catch {
        if (!cancelled) {
          setPendingPlanChange(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, user?.plan]);

  const handleSchedulePlanChange = useCallback(async () => {
    if (scheduleLoading || !termsAgreed) return;
    const currentName = user?.plan ? getPlanDisplayName(user.plan) : '현재 플랜';
    const applyHint = nextBillingLabel
      ? `${nextBillingLabel}부터`
      : '다음 결제일부터';
    const ok = window.confirm(
      `현재 ${currentName} 플랜을 이용 중입니다.\n\n${targetPlanLabel} 플랜으로 변경하면 ${applyHint} ${targetPlanLabel} 요금이 적용됩니다.\n\n변경을 예약하시겠습니까?`
    );
    if (!ok) return;

    try {
      setScheduleLoading(true);
      const res = await fetch('/api/user/schedule-plan-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetPlan: planKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || '플랜 변경 예약에 실패했습니다.');
        return;
      }
      if (data?.alreadyOnPlan) {
        alert(data.message || '이미 선택한 플랜을 이용 중입니다.');
        return;
      }
      alert(data?.message || '플랜 변경이 예약되었습니다.');
      await fetchUser();
      const statusRes = await fetch('/api/user/subscription-status', { credentials: 'include' });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setPendingPlanChange(statusData?.pendingPlanChange ?? null);
        if (statusData?.pendingPlanChange?.pendingPlanApplyAtLabel) {
          setNextBillingLabel(statusData.pendingPlanChange.pendingPlanApplyAtLabel);
        }
      }
    } catch (e) {
      console.error(e);
      alert('플랜 변경 예약 중 오류가 발생했습니다.');
    } finally {
      setScheduleLoading(false);
    }
  }, [
    scheduleLoading,
    termsAgreed,
    user?.plan,
    planKey,
    targetPlanLabel,
    nextBillingLabel,
    fetchUser,
  ]);

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
        alert('등록된 결제카드가 없습니다. 먼저 "결제카드 등록"을 완료해 주세요.');
        return;
      }
      if (outcome.kind === 'plan_change_available' || outcome.kind === 'already_subscribed') {
        alert(
          `${outcome.message}\n\n다른 결제 주기를 원하시면 아래 「${scheduleButtonLabel}」 버튼을 이용해 주세요.`
        );
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
  }, [
    planKey,
    tossAmount,
    tossOrderName,
    tossChargeLoading,
    tossLoading,
    fetchUser,
    scheduleButtonLabel,
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8 sm:py-12 px-4">
      <div className="max-w-[480px] mx-auto">
        <header className="mb-6 text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            구독결제
          </h1>
          {authStatus === 'loading' ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">불러오는 중…</p>
          ) : authStatus === 'authenticated' ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {hasPaidPlan
                ? isPlanChangeTarget
                  ? `현재 ${getPlanDisplayName(user!.plan)} 플랜을 이용 중입니다. 다른 주기로 변경하려면 변경 예약을 이용해 주세요.`
                  : `현재 ${getPlanDisplayName(user!.plan)} 플랜을 이용 중입니다. ${recurringNotice}`
                : `결제카드를 등록한 뒤 구독을 시작해 주세요. ${recurringNotice}`}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              로그인 후 결제를 진행해 주세요. {recurringNotice}{' '}
              <Link
                href={`/auth/login?callbackUrl=${encodeURIComponent(`/subscribe?plan=${planKey}`)}`}
                className="font-medium text-[#3182f6] underline underline-offset-2 hover:text-[#1b64da]"
              >
                로그인하기
              </Link>
            </p>
          )}
        </header>

        {paidCheckoutBlocked ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm leading-relaxed text-blue-900">
            <p className="font-semibold">오픈 베타 기간입니다</p>
            <p className="mt-2">{getNewPaidCheckoutBlockMessage()}</p>
            <Link
              href="/pricing"
              className="mt-3 inline-flex font-medium text-blue-700 underline underline-offset-2"
            >
              가격·베타 안내 보기
            </Link>
          </div>
        ) : null}

        {isEventActive &&
          authStatus === 'authenticated' &&
          user &&
          !hasPaidPlan &&
          feedbackEventStatus?.user.canSubmitForTrial && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              먼저{' '}
              <Link href="/order-convert" className="font-medium underline">
                무료 플랜
              </Link>
              으로 변환·다운로드를 체험해 보신 뒤,{' '}
              <Link href="/beta-feedback" prefetch className="font-medium underline">
                베타 피드백 게시판
              </Link>
              로 30일 PRO 체험(계정당 1회)을 받을 수 있습니다. 체험 후에도 구독 없이 무료로 이용할 수
              있습니다.
            </div>
          )}

        {user &&
          user.adminTrialEndsAt &&
          new Date(user.adminTrialEndsAt).getTime() > nowMs &&
          !hasPaidPlan &&
          user.plan === 'FREE' && (
            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/40">
              <FeedbackTrialActiveBanner
                endsAt={user.adminTrialEndsAt}
                headline="관리자 PRO 혜택 이용 중입니다."
                className="text-sm text-sky-900 dark:text-sky-100"
              />
            </div>
          )}

        {user &&
          hasProEntitlementClient(user.plan, user.feedbackTrialEndsAt, user.adminTrialEndsAt) &&
          !hasPaidPlan &&
          user.feedbackTrialEndsAt && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/40">
              <FeedbackTrialActiveBanner
                endsAt={user.feedbackTrialEndsAt}
                className="text-sm text-emerald-900 dark:text-emerald-100"
              />
            </div>
          )}

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
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              현재{' '}
              <strong className="text-zinc-700 dark:text-zinc-300">
                신용·체크카드 정기결제
              </strong>
              만 지원합니다.
            </p>
          </section>

          <section className="p-5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex justify-between items-baseline text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">
                {isPlanChangeTarget ? '변경 예정 플랜 요금' : '결제 예정 금액'}
              </span>
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                ₩{selectedPlan.price.toLocaleString()}
                <span className="text-xs font-normal text-zinc-500 ml-1">(VAT 별도)</span>
              </span>
            </div>
            {isPlanChangeTarget && nextBillingLabel && (
              <p className="mt-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 rounded-lg px-3 py-2">
                다음 결제일({nextBillingLabel})부터 {targetPlanLabel} 요금이 적용됩니다. 오늘 추가
                결제는 없습니다.
              </p>
            )}
            {pendingPlanChange && (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg px-3 py-2">
                예약됨: {pendingPlanChange.pendingPlanApplyAtLabel ?? '다음 결제일'}부터{' '}
                <strong>{pendingPlanChange.pendingPlanLabel}</strong> 플랜 적용 예정
                {pendingPlanChange.currentPlanLabel
                  ? ` (현재 ${pendingPlanChange.currentPlanLabel})`
                  : ''}
                . 자세한 내용은 마이페이지에서 확인할 수 있습니다.
              </p>
            )}
            {registeredCardSummary && (
              <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
                등록된 카드:{' '}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {registeredCardSummary}
                </span>
              </p>
            )}
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {isPlanChangeTarget
                ? '플랜 변경은 다음 결제일에 반영되며, 오늘 추가 결제는 진행되지 않습니다.'
                : '카드를 등록한 뒤 결제를 진행해 주세요. 토스페이먼츠를 통해 카드 정보가 안전하게 처리됩니다.'}
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
                ? '연결 중…'
                : registeredCardSummary
                  ? '결제카드 변경'
                  : '결제카드 등록'}
            </button>
            {isPlanChangeTarget ? (
              <button
                type="button"
                onClick={handleSchedulePlanChange}
                disabled={paymentActionsDisabled}
                className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3.5 rounded-[10px] hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-[15px] font-semibold transition-colors"
              >
                {scheduleLoading ? '예약 중…' : scheduleButtonLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTossCharge}
                disabled={paymentActionsDisabled || tossChargeLoading || hasPaidPlan}
                className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3.5 rounded-[10px] hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-[15px] font-semibold transition-colors"
              >
                {tossChargeLoading
                  ? '처리 중…'
                  : hasPaidPlan
                    ? '이용 중인 플랜'
                    : subscribeButtonLabel}
              </button>
            )}
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
