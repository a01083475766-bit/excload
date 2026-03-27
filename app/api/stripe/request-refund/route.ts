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
    const body = (await _request.json().catch(() => ({}))) as {
      checkOnly?: boolean;
      bankName?: string;
      accountNumber?: string;
      accountHolder?: string;
    };
    const checkOnly = !!body.checkOnly;

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

    const acceptManualReview = async (message: string) => {
      if (checkOnly) {
        return NextResponse.json({
          success: true,
          manualReview: true,
          requiresBank: true,
          message,
        });
      }

      const bankName = (body.bankName || '').trim();
      const accountNumber = (body.accountNumber || '').trim();
      const accountHolder = (body.accountHolder || '').trim();

      if (!bankName || !accountNumber || !accountHolder) {
        return NextResponse.json(
          { error: '수동 환불을 위해 은행명, 계좌번호, 예금주를 입력해 주세요.' },
          { status: 400 }
        );
      }

      await prisma.refundRequest.create({
        data: {
          userId: user.id,
          paymentId: latestPayment?.id ?? null,
          type: 'REFUND',
          status: 'REQUESTED',
          bankName,
          accountNumber,
          accountHolder,
          reason: message,
        },
      });

      await prisma.pointHistory.create({
        data: {
          userId: user.id,
          change: 0,
          reason: 'REFUND_REQUEST_REVIEW',
        },
      });

      return NextResponse.json({
        success: true,
        manualReview: true,
        requiresBank: false,
        message,
      });
    };

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
      return acceptManualReview(
        '결제 이후 사용 이력이 확인되어 자동 결제취소는 어렵습니다. 환불 신청 접수 후 영업일 기준 3~5일 내 안내드립니다.'
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
      return acceptManualReview(
        '결제 정보 확인이 필요하여 수동 환불로 접수됩니다. 영업일 기준 3~5일 내 처리 결과를 안내드립니다.'
      );
    }

    if (checkOnly) {
      return NextResponse.json({
        success: true,
        manualReview: false,
        requiresBank: false,
        message: '결제 직후/미사용 상태로 확인되어 자동 결제취소가 가능합니다.',
      });
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
      prisma.refundRequest.create({
        data: {
          userId: user.id,
          paymentId: latestPayment.id,
          type: 'AUTO_CANCEL',
          status: 'COMPLETED',
          reason: '결제 직후/미사용 자동 결제취소',
          processedAt: new Date(),
        },
      }),
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
      manualReview: false,
      requiresBank: false,
      message: '결제 취소가 접수되었습니다. 결제 수단 환불 반영까지 영업일 기준 3~5일 소요될 수 있습니다.',
    });
  } catch (error) {
    console.error('[Refund API] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '환불 신청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
