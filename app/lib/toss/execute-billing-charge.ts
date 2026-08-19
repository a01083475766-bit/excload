/**
 * 토스 빌링키 결제 승인 + DB 반영 (최초 구독·정기 갱신 공용)
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/app/lib/prisma';
import {
  addBillingPeriod,
  getPlanAmount,
  getPlanOrderName,
  isPaidDbPlan,
  resolveEffectivePlanAtRenewal,
  type PaidDbPlan,
  PAID_MONTHLY_POINTS,
} from '@/app/lib/subscription/plan-change';
import {
  applyGraceExpiryIfNeeded,
  paymentFailureClearData,
  recordPaymentFailure,
} from '@/app/lib/subscription/payment-failure';

function basicAuthHeader(secretKey: string) {
  const token = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

export type TossBillingChargeResult =
  | { ok: true; paymentKey: string; orderId: string; plan: PaidDbPlan; amount: number }
  | { ok: false; error: string; code?: string; httpStatus?: number };

export async function executeTossBillingCharge(params: {
  userId: string;
  secretKey: string;
  /** 최초 구독 시 명시. 갱신 시 생략하면 pending/현재 플랜 기준 */
  planType?: PaidDbPlan;
  isRenewal?: boolean;
}): Promise<TossBillingChargeResult> {
  await applyGraceExpiryIfNeeded(params.userId);

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      points: true,
      tossBillingKey: true,
      pendingPlan: true,
      pendingPlanApplyAt: true,
      cancelAtPeriodEnd: true,
      subscriptionStatus: true,
      nextPointDate: true,
    },
  });

  if (!user) {
    return { ok: false, error: '사용자를 찾을 수 없습니다.', httpStatus: 404 };
  }

  if (!user.tossBillingKey) {
    return { ok: false, error: 'billingKey 없음', code: 'BILLING_KEY_MISSING', httpStatus: 400 };
  }

  if (params.isRenewal) {
    if (!isPaidDbPlan(user.plan)) {
      return { ok: false, error: '갱신 대상이 아닌 플랜입니다.', httpStatus: 400 };
    }
    if (user.subscriptionStatus === 'canceled') {
      return {
        ok: false,
        error: '구독이 종료되었습니다. 새로 구독해 주세요.',
        code: 'SUBSCRIPTION_CANCELED',
        httpStatus: 400,
      };
    }
    if (user.cancelAtPeriodEnd) {
      return { ok: false, error: '해지 예약된 구독입니다.', code: 'CANCEL_SCHEDULED', httpStatus: 400 };
    }
    const renewalNow = new Date();
    if (user.nextPointDate && user.nextPointDate.getTime() > renewalNow.getTime()) {
      return {
        ok: false,
        error: '다음 갱신일 전입니다.',
        code: 'RENEWAL_NOT_DUE',
        httpStatus: 409,
      };
    }
  } else if (params.planType) {
    if (user.plan === 'PRO' || user.plan === 'YEARLY') {
      return {
        ok: false,
        error: '이미 이용 중인 구독입니다. 플랜 변경은 예약 기능을 이용해 주세요.',
        code: 'ALREADY_SUBSCRIBED',
        httpStatus: 400,
      };
    }
  } else {
    return { ok: false, error: 'planType이 필요합니다.', httpStatus: 400 };
  }

  const now = new Date();
  let chargePlan: PaidDbPlan;
  let nextUserPlan: PaidDbPlan;
  let clearPending = false;

  if (params.isRenewal && isPaidDbPlan(user.plan)) {
    const resolved = resolveEffectivePlanAtRenewal(
      user.plan,
      user.pendingPlan,
      user.pendingPlanApplyAt,
      now
    );
    chargePlan = resolved.chargePlan;
    nextUserPlan = resolved.nextUserPlan;
    clearPending = resolved.clearPending;
  } else {
    chargePlan = params.planType!;
    nextUserPlan = params.planType!;
  }

  const amount = getPlanAmount(chargePlan);
  const orderName = getPlanOrderName(chargePlan);
  const orderId = `toss_${user.id}_${randomUUID()}`;

  const res = await fetch(
    `https://api.tosspayments.com/v1/billing/${encodeURIComponent(user.tossBillingKey)}`,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(params.secretKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerKey: user.id,
        amount,
        orderId,
        orderName,
        customerEmail: user.email,
        customerName: user.name || user.email.split('@')[0],
        taxFreeAmount: 0,
      }),
    }
  );

  const data = (await res.json()) as {
    paymentKey?: string;
    orderId?: string;
    status?: string;
    totalAmount?: number;
    message?: string;
    code?: string;
  };

  if (!res.ok) {
    const failMessage = data.message || '결제 승인에 실패했습니다.';
    if (params.isRenewal) {
      await recordPaymentFailure(user.id, failMessage, data.code);
    }
    return {
      ok: false,
      error: failMessage,
      code: data.code,
      httpStatus: res.status,
    };
  }

  if (data.status !== 'DONE' || !data.paymentKey) {
    const failMessage = '결제 상태를 확인할 수 없습니다.';
    if (params.isRenewal) {
      await recordPaymentFailure(user.id, failMessage, data.code);
    }
    return {
      ok: false,
      error: failMessage,
      code: data.code,
      httpStatus: 502,
    };
  }

  const nextPointDate = addBillingPeriod(now, nextUserPlan);
  const pointsBefore = user.points;
  const pointsTarget = PAID_MONTHLY_POINTS;
  const pointsDelta = pointsTarget - pointsBefore;

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        userId: user.id,
        email: user.email,
        plan: chargePlan,
        amount: data.totalAmount ?? amount,
        currency: 'KRW',
        paymentProvider: 'TOSS',
        tossPaymentKey: data.paymentKey,
        tossOrderId: data.orderId ?? orderId,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        plan: nextUserPlan,
        points: pointsTarget,
        nextPointDate,
        tossChargeCooldownUntil: null,
        ...paymentFailureClearData(),
        ...(clearPending
          ? { pendingPlan: null, pendingPlanApplyAt: null }
          : {}),
      },
    }),
    prisma.pointHistory.create({
      data: {
        userId: user.id,
        change: pointsDelta,
        reason: params.isRenewal ? 'TOSS_RENEWAL_RESET' : 'TOSS_PAYMENT_RESET',
      },
    }),
  ]);

  return {
    ok: true,
    paymentKey: data.paymentKey,
    orderId: data.orderId ?? orderId,
    plan: nextUserPlan,
    amount: data.totalAmount ?? amount,
  };
}
