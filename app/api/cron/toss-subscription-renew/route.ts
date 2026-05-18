/**
 * 토스 빌링 정기 갱신 (예약 플랜 반영 포함)
 * Authorization: Bearer {CRON_SECRET}
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { executeTossBillingCharge } from '@/app/lib/toss/execute-billing-charge';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';
import { applyGraceExpiryIfNeeded } from '@/app/lib/subscription/payment-failure';

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secretKey = process.env.TOSS_SECRET_KEY?.trim();
  if (!secretKey) {
    return NextResponse.json({ error: 'TOSS_SECRET_KEY 미설정' }, { status: 500 });
  }

  const now = new Date();

  const graceExpired = await prisma.user.findMany({
    where: {
      subscriptionStatus: 'past_due',
      gracePeriodUntil: { lte: now },
    },
    select: { id: true },
    take: 100,
  });
  for (const row of graceExpired) {
    await applyGraceExpiryIfNeeded(row.id);
  }

  const candidates = await prisma.user.findMany({
    where: {
      plan: { in: ['PRO', 'YEARLY'] },
      tossBillingKey: { not: null },
      cancelAtPeriodEnd: false,
      OR: [{ nextPointDate: null }, { nextPointDate: { lte: now } }],
    },
    select: { id: true, plan: true },
    take: 50,
  });

  const results: Array<{ userId: string; ok: boolean; error?: string }> = [];

  for (const user of candidates) {
    const activeStripe = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing', 'past_due'] },
        stripeSubscriptionId: { not: '' },
      },
      select: { id: true },
    });
    if (activeStripe) {
      results.push({ userId: user.id, ok: false, error: 'STRIPE_ACTIVE_SKIP' });
      continue;
    }

    if (!isPaidDbPlan(user.plan)) continue;

    const outcome = await executeTossBillingCharge({
      userId: user.id,
      secretKey,
      isRenewal: true,
    });
    results.push({
      userId: user.id,
      ok: outcome.ok,
      error: outcome.ok ? undefined : outcome.error,
    });
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    success: true,
    processed: results.length,
    succeeded,
    failed,
    results,
  });
}
