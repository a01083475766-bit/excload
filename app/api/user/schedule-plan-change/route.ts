/**
 * 다음 결제일부터 적용되는 플랜 변경 예약
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import Stripe from 'stripe';
import {
  addBillingPeriod,
  formatPlanChangeDate,
  getPlanDisplayName,
  intervalKeyToDbPlan,
  isPaidDbPlan,
  type PlanIntervalKey,
} from '@/app/lib/subscription/plan-change';

function parseTargetPlan(body: unknown): PlanIntervalKey | null {
  if (!body || typeof body !== 'object') return null;
  const t = (body as { targetPlan?: string }).targetPlan;
  if (t === 'monthly' || t === 'yearly') return t;
  return null;
}

async function resolveApplyAt(userId: string, currentPlan: 'PRO' | 'YEARLY'): Promise<Date> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { nextPointDate: true },
  });
  if (user?.nextPointDate && user.nextPointDate.getTime() > Date.now()) {
    return user.nextPointDate;
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['active', 'trialing', 'past_due'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { currentPeriodEnd: true },
  });
  if (subscription?.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > Date.now()) {
    return subscription.currentPeriodEnd;
  }

  return addBillingPeriod(new Date(), currentPlan);
}

async function syncStripePlanAtPeriodEnd(
  userId: string,
  targetPlan: PlanIntervalKey
): Promise<{ ok: boolean; message?: string }> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return { ok: true };

  const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID?.trim();
  const yearlyPriceId = process.env.STRIPE_YEARLY_PRICE_ID?.trim();
  const priceId = targetPlan === 'monthly' ? monthlyPriceId : yearlyPriceId;
  if (!priceId) return { ok: true };

  const existing = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['active', 'trialing', 'past_due'] },
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!existing?.stripeSubscriptionId) return { ok: true };

  try {
    const stripe = new Stripe(secretKey);
    const subscription = await stripe.subscriptions.retrieve(existing.stripeSubscriptionId);
    const item = subscription.items.data[0];
    if (!item) return { ok: false, message: 'Stripe 구독 항목을 찾을 수 없습니다.' };
    if (item.price?.id === priceId) return { ok: true };

    await stripe.subscriptions.update(subscription.id, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: 'none',
    });
    return { ok: true };
  } catch (e) {
    console.error('[schedule-plan-change] Stripe update failed:', e);
    return {
      ok: false,
      message: 'Stripe 구독 플랜 연동에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const targetPlan = parseTargetPlan(await request.json().catch(() => ({})));
    if (!targetPlan) {
      return NextResponse.json(
        { error: 'targetPlan은 monthly 또는 yearly 여야 합니다.' },
        { status: 400 }
      );
    }

    const targetDbPlan = intervalKeyToDbPlan(targetPlan);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        plan: true,
        cancelAtPeriodEnd: true,
        pendingPlan: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!isPaidDbPlan(user.plan)) {
      return NextResponse.json(
        {
          error: '유료 구독 중인 계정만 플랜 변경 예약이 가능합니다.',
          code: 'NOT_SUBSCRIBED',
        },
        { status: 400 }
      );
    }

    if (user.plan === targetDbPlan) {
      return NextResponse.json({
        success: true,
        alreadyOnPlan: true,
        message: `이미 ${getPlanDisplayName(targetDbPlan)} 플랜을 이용 중입니다.`,
      });
    }

    if (user.cancelAtPeriodEnd) {
      return NextResponse.json(
        {
          error:
            '해지 예약 중에는 플랜을 변경할 수 없습니다. 마이페이지에서 해지 예약을 취소한 뒤 다시 시도해 주세요.',
          code: 'CANCEL_SCHEDULED',
        },
        { status: 400 }
      );
    }

    const applyAt = await resolveApplyAt(user.id, user.plan);

    const stripeSync = await syncStripePlanAtPeriodEnd(user.id, targetPlan);
    if (!stripeSync.ok) {
      return NextResponse.json(
        { error: stripeSync.message || 'Stripe 연동에 실패했습니다.' },
        { status: 502 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        pendingPlan: targetDbPlan,
        pendingPlanApplyAt: applyAt,
      },
    });

    return NextResponse.json({
      success: true,
      currentPlan: user.plan,
      pendingPlan: targetDbPlan,
      pendingPlanApplyAt: applyAt.toISOString(),
      pendingPlanApplyAtLabel: formatPlanChangeDate(applyAt),
      message: `${formatPlanChangeDate(applyAt)}부터 ${getPlanDisplayName(targetDbPlan)} 플랜이 적용됩니다.`,
    });
  } catch (error) {
    console.error('[schedule-plan-change]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '플랜 변경 예약에 실패했습니다.' },
      { status: 500 }
    );
  }
}
