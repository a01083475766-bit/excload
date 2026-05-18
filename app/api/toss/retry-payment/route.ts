/**
 * 정기결제 실패 후 수동 재결제 (갱신과 동일한 빌링 승인)
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { executeTossBillingCharge } from '@/app/lib/toss/execute-billing-charge';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';
import { isPastDueStatus } from '@/app/lib/subscription/payment-failure';

const TOSS_CHARGE_LOCK_MS = 60_000;

export async function POST() {
  let lockUserId: string | null = null;
  const { prisma } = await import('@/app/lib/prisma');

  const releaseTossChargeLock = async () => {
    if (!lockUserId) return;
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
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, subscriptionStatus: true, tossBillingKey: true },
    });
    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!isPaidDbPlan(user.plan)) {
      return NextResponse.json({ error: '유료 구독이 아닙니다.' }, { status: 400 });
    }
    if (!isPastDueStatus(user.subscriptionStatus)) {
      return NextResponse.json(
        { error: '결제 실패 상태가 아닙니다.' },
        { status: 400 }
      );
    }
    if (!user.tossBillingKey) {
      return NextResponse.json(
        { error: '등록된 결제카드가 없습니다. 카드를 먼저 등록해 주세요.' },
        { status: 400 }
      );
    }

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
        { error: '이미 처리 중인 결제 요청이 있습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }
    lockUserId = session.user.id;

    const outcome = await executeTossBillingCharge({
      userId: session.user.id,
      secretKey,
      isRenewal: true,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.error, code: outcome.code },
        { status: outcome.httpStatus ?? 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentKey: outcome.paymentKey,
      orderId: outcome.orderId,
      plan: outcome.plan,
      amount: outcome.amount,
    });
  } catch (e) {
    console.error('[Toss Retry Payment]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '서버 오류' },
      { status: 500 }
    );
  } finally {
    await releaseTossChargeLock();
  }
}
