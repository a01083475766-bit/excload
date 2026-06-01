/**
 * 토스 빌링 정기 갱신 (예약 플랜 반영 포함)
 *
 * Vercel Cron: HTTP GET + Authorization: Bearer {CRON_SECRET}
 * (env 이름이 CRON_SECRET이면 Vercel이 Bearer를 자동 주입)
 * 수동 검증: POST 동일 경로·동일 헤더
 *
 * 스케줄: vercel.json — 0 18 * * * (UTC) ≈ 매일 03:00 KST
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { executeTossBillingCharge } from '@/app/lib/toss/execute-billing-charge';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';
import { applyGraceExpiryIfNeeded } from '@/app/lib/subscription/payment-failure';

/** 동시 cron·중복 호출 시 한 건만 토스 API까지 진행 */
const TOSS_RENEW_LOCK_MS = 60_000;

export function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

async function runTossSubscriptionRenew() {

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

    const lockUntil = new Date(Date.now() + TOSS_RENEW_LOCK_MS);
    const gotLock = await prisma.user.updateMany({
      where: {
        id: user.id,
        cancelAtPeriodEnd: false,
        OR: [{ nextPointDate: null }, { nextPointDate: { lte: now } }],
        AND: [
          {
            OR: [
              { tossChargeCooldownUntil: null },
              { tossChargeCooldownUntil: { lt: now } },
            ],
          },
        ],
      },
      data: { tossChargeCooldownUntil: lockUntil },
    });

    if (gotLock.count === 0) {
      results.push({
        userId: user.id,
        ok: false,
        error: 'RENEWAL_SKIP_LOCKED_OR_NOT_DUE',
      });
      continue;
    }

    try {
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
      if (!outcome.ok) {
        await prisma.user.update({
          where: { id: user.id },
          data: { tossChargeCooldownUntil: null },
        });
      }
    } catch (e) {
      await prisma.user.update({
        where: { id: user.id },
        data: { tossChargeCooldownUntil: null },
      });
      throw e;
    }
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

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runTossSubscriptionRenew();
}

/** Vercel Cron 기본 메서드 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runTossSubscriptionRenew();
}
