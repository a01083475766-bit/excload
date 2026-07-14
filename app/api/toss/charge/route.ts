/**
 * 토스 빌링키로 결제 승인
 * POST https://api.tosspayments.com/v1/billing/{billingKey}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { executeTossBillingCharge } from '@/app/lib/toss/execute-billing-charge';
import type { PaidDbPlan } from '@/app/lib/subscription/plan-change';
import {
  canStartPaidCheckout,
  getNewPaidCheckoutBlockMessage,
} from '@/app/lib/open-beta-policy';

/** 동시 탭·재전송 시 한 요청만 토스 API까지 가도록 DB 락(만료 시 자동 해제) */
const TOSS_CHARGE_LOCK_MS = 60_000;
/** 직전 성공 결제(행 생성) 직후 연속 승인 차단 */
const TOSS_CHARGE_DEBOUNCE_MS = 5_000;

export async function POST(request: NextRequest) {
  let lockUserId: string | null = null;
  const { prisma } = await import('@/app/lib/prisma');

  const releaseTossChargeLock = async () => {
    if (!lockUserId) return;
    const releasedUserId = lockUserId;
    console.info('TOSS LOCK RELEASED', releasedUserId);
    try {
      await prisma.user.update({
        where: { id: lockUserId },
        data: { tossChargeCooldownUntil: null },
      });
    } catch {
      /* ignore */
    }
    lockUserId = null;
  };

  try {
    const secretKey = process.env.TOSS_SECRET_KEY?.trim();
    if (!secretKey) {
      return NextResponse.json(
        { error: 'TOSS_SECRET_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    if (!currentUser || !canStartPaidCheckout(currentUser.plan)) {
      return NextResponse.json(
        { error: getNewPaidCheckoutBlockMessage(), code: 'OPEN_BETA_PAID_CHECKOUT_DISABLED' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const planType: PaidDbPlan = body.planType === 'yearly' ? 'YEARLY' : 'PRO';

    const lockUntil = new Date(Date.now() + TOSS_CHARGE_LOCK_MS);
    const gotLock = await prisma.user.updateMany({
      where: {
        id: session.user.id,
        OR: [
          { tossChargeCooldownUntil: null },
          { tossChargeCooldownUntil: { lt: new Date() } },
        ],
      },
      data: { tossChargeCooldownUntil: lockUntil },
    });

    if (gotLock.count === 0) {
      return NextResponse.json(
        {
          error: '이미 처리 중인 결제 요청이 있습니다. 잠시 후 다시 시도해 주세요.',
          code: 'TOSS_CHARGE_IN_FLIGHT',
        },
        { status: 429 }
      );
    }
    lockUserId = session.user.id;

    const recentPayment = await prisma.payment.count({
      where: {
        userId: session.user.id,
        paymentProvider: 'TOSS',
        amount: { gt: 0 },
        createdAt: { gte: new Date(Date.now() - TOSS_CHARGE_DEBOUNCE_MS) },
      },
    });

    if (recentPayment > 0) {
      return NextResponse.json(
        {
          error: '같은 방식의 결제가 방금 완료되었습니다. 잠시 후 다시 확인해 주세요.',
          code: 'TOSS_CHARGE_DEBOUNCE',
        },
        { status: 429 }
      );
    }

    const outcome = await executeTossBillingCharge({
      userId: session.user.id,
      secretKey,
      planType,
      isRenewal: false,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        {
          error: outcome.error,
          code: outcome.code,
        },
        { status: outcome.httpStatus ?? 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentKey: outcome.paymentKey,
      orderId: outcome.orderId,
      status: 'DONE',
      totalAmount: outcome.amount,
    });
  } catch (e) {
    console.error('[Toss Charge] 예외', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '서버 오류' },
      { status: 500 }
    );
  } finally {
    await releaseTossChargeLock();
  }
}
