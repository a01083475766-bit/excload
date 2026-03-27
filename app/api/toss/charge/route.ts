/**
 * 토스 빌링키로 결제 승인
 * POST https://api.tosspayments.com/v1/billing/{billingKey}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { randomUUID } from 'crypto';

function basicAuthHeader(secretKey: string) {
  const token = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

const DEFAULT_AMOUNT = 4000;
const DEFAULT_ORDER_NAME = 'EXCLOAD PRO 구독';

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const amount =
      typeof body.amount === 'number' && body.amount > 0 ? body.amount : DEFAULT_AMOUNT;
    const orderName =
      typeof body.orderName === 'string' && body.orderName.trim()
        ? body.orderName.trim()
        : DEFAULT_ORDER_NAME;

    const { prisma } = await import('@/app/lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        tossBillingKey: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (user.plan === 'PRO' || user.plan === 'YEARLY') {
      return NextResponse.json({ error: '이미 구독중' }, { status: 400 });
    }

    if (!user.tossBillingKey) {
      return NextResponse.json({ error: 'billingKey 없음' }, { status: 400 });
    }

    // orderId: userId + UUID로 유일성 보장 (토스 orderId 중복 방지)
    const orderId = `toss_${user.id}_${randomUUID()}`;

    const userBeforeCharge = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    if (userBeforeCharge?.plan === 'PRO' || userBeforeCharge?.plan === 'YEARLY') {
      return NextResponse.json({ error: '이미 구독중' }, { status: 400 });
    }

    const res = await fetch(
      `https://api.tosspayments.com/v1/billing/${encodeURIComponent(user.tossBillingKey)}`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(secretKey),
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
      console.error('[Toss Charge] 결제 승인 실패', {
        userId: user.id,
        orderId,
        httpStatus: res.status,
        tossCode: data.code,
        tossMessage: data.message,
        body: data,
      });
      return NextResponse.json(
        {
          error: data.message || '결제 승인에 실패했습니다.',
          code: data.code,
        },
        { status: res.status }
      );
    }

    if (data.status !== 'DONE' || !data.paymentKey) {
      console.error('[Toss Charge] 응답 비정상 (HTTP 200이나 DONE 아님)', {
        userId: user.id,
        orderId,
        status: data.status,
        hasPaymentKey: !!data.paymentKey,
        body: data,
      });
      return NextResponse.json(
        {
          error: '결제 상태를 확인할 수 없습니다.',
          code: data.code,
        },
        { status: 502 }
      );
    }

    await prisma.payment.create({
      data: {
        userId: user.id,
        email: user.email,
        plan: 'PRO',
        amount: data.totalAmount ?? amount,
        currency: 'KRW',
        paymentProvider: 'TOSS',
        tossPaymentKey: data.paymentKey,
        tossOrderId: data.orderId ?? orderId,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { plan: 'PRO' },
    });

    return NextResponse.json({
      ok: true,
      paymentKey: data.paymentKey,
      orderId: data.orderId ?? orderId,
      status: data.status,
      totalAmount: data.totalAmount ?? amount,
    });
  } catch (e) {
    console.error('[Toss Charge] 예외', {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '서버 오류' },
      { status: 500 }
    );
  }
}
