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

  // try/finally: return·throw·await 거절 모두에서 finally가 먼저 실행됨(ECMA-262).
  // 예외: SIGKILL·전원 차단·일부 서버리스 하드 타임아웃으로 isolate가 즉시 종료되면 finally 미실행 가능.
  // 그 경우에도 tossChargeCooldownUntil 은 최대 TOSS_CHARGE_LOCK_MS 후 만료되어 다음 요청이 락을 다시 잡을 수 있음.
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

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const planType = body.planType === 'yearly' ? 'YEARLY' : 'PRO';
    const expectedAmount = planType === 'YEARLY' ? 40000 : DEFAULT_AMOUNT;
    const amount = expectedAmount;
    const orderName =
      typeof body.orderName === 'string' && body.orderName.trim()
        ? body.orderName.trim()
        : planType === 'YEARLY'
          ? 'EXCLOAD YEARLY 구독'
          : DEFAULT_ORDER_NAME;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        points: true,
        tossBillingKey: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (user.plan === 'PRO' || user.plan === 'YEARLY') {
      return NextResponse.json(
        { error: '이미 이용 중인 구독입니다. 마이페이지에서 결제 상태를 확인해 주세요.' },
        { status: 400 }
      );
    }

    if (!user.tossBillingKey) {
      return NextResponse.json({ error: 'billingKey 없음' }, { status: 400 });
    }

    const lockUntil = new Date(Date.now() + TOSS_CHARGE_LOCK_MS);
    const gotLock = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [
          { tossChargeCooldownUntil: null },
          { tossChargeCooldownUntil: { lt: new Date() } },
        ],
      },
      data: { tossChargeCooldownUntil: lockUntil },
    });

    if (gotLock.count === 0) {
      console.warn('TOSS LOCK SKIPPED (IN_FLIGHT)', user.id);
      return NextResponse.json(
        {
          error: '이미 처리 중인 결제 요청이 있습니다. 잠시 후 다시 시도해 주세요.',
          code: 'TOSS_CHARGE_IN_FLIGHT',
        },
        { status: 429 }
      );
    }
    lockUserId = user.id;
    console.info('TOSS LOCK ACQUIRED', user.id);

    const recentPayment = await prisma.payment.count({
      where: {
        userId: user.id,
        paymentProvider: 'TOSS',
        amount: { gt: 0 },
        createdAt: { gte: new Date(Date.now() - TOSS_CHARGE_DEBOUNCE_MS) },
      },
    });

    if (recentPayment > 0) {
      console.warn('TOSS LOCK SKIPPED (COOLDOWN)', user.id);
      return NextResponse.json(
        {
          error: '같은 방식의 결제가 방금 완료되었습니다. 잠시 후 다시 확인해 주세요.',
          code: 'TOSS_CHARGE_DEBOUNCE',
        },
        { status: 429 }
      );
    }

    const userBeforeCharge = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    if (userBeforeCharge?.plan === 'PRO' || userBeforeCharge?.plan === 'YEARLY') {
      return NextResponse.json(
        { error: '이미 이용 중인 구독입니다. 마이페이지에서 결제 상태를 확인해 주세요.' },
        { status: 400 }
      );
    }

    const orderId = `toss_${user.id}_${randomUUID()}`;

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

    const nextPointDate = new Date();
    nextPointDate.setMonth(nextPointDate.getMonth() + 1);

    const pointsBefore = user.points;
    const pointsTarget = 400000;
    const pointsDelta = pointsTarget - pointsBefore;

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          userId: user.id,
          email: user.email,
          plan: planType,
          amount: data.totalAmount ?? amount,
          currency: 'KRW',
          paymentProvider: 'TOSS',
          tossPaymentKey: data.paymentKey,
          tossOrderId: data.orderId ?? orderId,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          plan: planType,
          points: pointsTarget,
          nextPointDate,
          tossChargeCooldownUntil: null,
        },
      }),
      prisma.pointHistory.create({
        data: {
          userId: user.id,
          change: pointsDelta,
          reason: 'TOSS_PAYMENT_RESET',
        },
      }),
    ]);

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
  } finally {
    await releaseTossChargeLock();
  }
}
