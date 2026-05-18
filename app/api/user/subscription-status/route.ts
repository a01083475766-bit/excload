import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import {
  dbPlanToIntervalKey,
  formatPlanChangeDate,
  getPlanDisplayName,
  isPaidDbPlan,
} from '@/app/lib/subscription/plan-change';
import { applyGraceExpiryIfNeeded } from '@/app/lib/subscription/payment-failure';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const userRow = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!userRow) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    await applyGraceExpiryIfNeeded(userRow.id);

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        plan: true,
        cancelAtPeriodEnd: true,
        nextPointDate: true,
        pendingPlan: true,
        pendingPlanApplyAt: true,
        subscriptionStatus: true,
        paymentFailedAt: true,
        paymentFailureReason: true,
        paymentRetryCount: true,
        gracePeriodUntil: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing', 'past_due', 'unpaid'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        status: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        paymentProvider: true,
      },
    });

    const currentPeriodEnd =
      subscription?.currentPeriodEnd?.toISOString() ??
      user.nextPointDate?.toISOString() ??
      null;

    return NextResponse.json({
      success: true,
      plan: user.plan,
      currentPlanKey: dbPlanToIntervalKey(user.plan),
      subscription: {
        status: subscription?.status ?? null,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? user.cancelAtPeriodEnd ?? false,
        currentPeriodEnd,
        paymentProvider: subscription?.paymentProvider ?? null,
      },
      pendingPlanChange: user.pendingPlan
        ? {
            pendingPlan: user.pendingPlan,
            pendingPlanLabel: getPlanDisplayName(user.pendingPlan),
            pendingPlanApplyAt: user.pendingPlanApplyAt?.toISOString() ?? null,
            pendingPlanApplyAtLabel: formatPlanChangeDate(user.pendingPlanApplyAt),
            currentPlanLabel: isPaidDbPlan(user.plan)
              ? getPlanDisplayName(user.plan)
              : getPlanDisplayName(user.plan),
          }
        : null,
      paymentFailure: {
        subscriptionStatus: user.subscriptionStatus,
        isPastDue: user.subscriptionStatus === 'past_due',
        paymentFailedAt: user.paymentFailedAt?.toISOString() ?? null,
        paymentFailureReason: user.paymentFailureReason,
        paymentRetryCount: user.paymentRetryCount,
        gracePeriodUntil: user.gracePeriodUntil?.toISOString() ?? null,
        gracePeriodUntilLabel: user.gracePeriodUntil
          ? user.gracePeriodUntil.toLocaleDateString('ko-KR')
          : null,
      },
    });
  } catch (error) {
    console.error('[Subscription Status API] error:', error);
    return NextResponse.json({ error: '구독 상태 조회에 실패했습니다.' }, { status: 500 });
  }
}
