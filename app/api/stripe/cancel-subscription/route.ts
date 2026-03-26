import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

type CancelAction = 'cancel' | 'resume';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { action?: CancelAction };
    const action: CancelAction = body.action === 'resume' ? 'resume' : 'cancel';

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: '결제 설정 오류가 발생했습니다.' }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        stripeCustomerId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: {
          in: ['active', 'trialing', 'past_due', 'unpaid'],
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        stripeSubscriptionId: true,
      },
    });

    if (!subscription?.stripeSubscriptionId) {
      return NextResponse.json({ error: '활성 구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const cancelAtPeriodEnd = action === 'cancel';
    const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { cancelAtPeriodEnd: cancelAtPeriodEnd },
      }),
      prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.stripeSubscriptionId },
        data: {
          cancelAtPeriodEnd: cancelAtPeriodEnd,
          status: updated.status,
          currentPeriodStart: updated.current_period_start
            ? new Date(updated.current_period_start * 1000)
            : null,
          currentPeriodEnd: updated.current_period_end
            ? new Date(updated.current_period_end * 1000)
            : null,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      cancelAtPeriodEnd: cancelAtPeriodEnd,
      currentPeriodEnd: updated.current_period_end
        ? new Date(updated.current_period_end * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error('[Cancel Subscription API] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '구독 상태 변경에 실패했습니다.' },
      { status: 500 }
    );
  }
}
