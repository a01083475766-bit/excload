import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

const REFUND_WINDOW_DAYS = 7;

function subtractDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: '결제 설정 오류가 발생했습니다.' }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, plan: true },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const latestPayment = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        amount: { gt: 0 },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestPayment) {
      return NextResponse.json(
        { error: '환불 가능한 최근 결제 내역이 없습니다.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const refundLimit = subtractDays(now, REFUND_WINDOW_DAYS);
    if (latestPayment.createdAt < refundLimit) {
      return NextResponse.json(
        { error: `환불 신청 가능 기간(${REFUND_WINDOW_DAYS}일)이 지났습니다.` },
        { status: 400 }
      );
    }

    const usedPointHistory = await prisma.pointHistory.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: latestPayment.createdAt },
        change: { lt: 0 },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (usedPointHistory) {
      return NextResponse.json(
        {
          error:
            '결제 이후 포인트 사용 이력이 확인되어 자동 환불 대상이 아닙니다. 고객센터 검토 후 처리됩니다.',
          needsManualReview: true,
        },
        { status: 400 }
      );
    }

    let paymentIntentId: string | null = null;

    if (latestPayment.stripeSessionId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(
        latestPayment.stripeSessionId
      );
      paymentIntentId =
        typeof checkoutSession.payment_intent === 'string'
          ? checkoutSession.payment_intent
          : checkoutSession.payment_intent?.id || null;
    }

    if (!paymentIntentId && latestPayment.stripeInvoiceId) {
      const invoice = await stripe.invoices.retrieve(latestPayment.stripeInvoiceId);
      paymentIntentId =
        typeof invoice.payment_intent === 'string'
          ? invoice.payment_intent
          : invoice.payment_intent?.id || null;
    }

    if (!paymentIntentId) {
      return NextResponse.json(
        {
          error:
            '결제 식별 정보를 찾지 못해 자동 환불 처리가 불가합니다. 고객센터로 문의해 주세요.',
          needsManualReview: true,
        },
        { status: 400 }
      );
    }

    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        userId: user.id,
        email: user.email,
      },
    });

    if (latestPayment.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(latestPayment.stripeSubscriptionId);
      } catch (cancelError) {
        console.error('[Refund API] subscription cancel failed:', cancelError);
      }
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          plan: 'FREE',
          cancelAtPeriodEnd: false,
        },
      }),
      prisma.subscription.updateMany({
        where: { userId: user.id },
        data: {
          status: 'cancelled',
          cancelAtPeriodEnd: false,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: '환불 신청이 접수되어 처리되었습니다. 결제 수단 환불 완료까지 영업일 기준 수 일이 소요될 수 있습니다.',
    });
  } catch (error) {
    console.error('[Refund API] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '환불 신청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
