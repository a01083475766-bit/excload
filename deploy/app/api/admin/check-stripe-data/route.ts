import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/admin/check-stripe-data
 * 관리자가 Stripe 관련 데이터 확인
 */
export async function GET() {
  try {
    // 관리자 권한 확인
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // StripeEvent 최근 5개 조회
    const stripeEvents = await prisma.stripeEvent.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    // PointHistory에서 STRIPE_PAYMENT 최근 5개 조회
    const pointHistory = await prisma.pointHistory.findMany({
      where: {
        reason: 'STRIPE_PAYMENT',
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    return NextResponse.json({
      stripeEvents: stripeEvents.map(e => ({
        id: e.id,
        eventId: e.eventId,
        createdAt: e.createdAt.toISOString(),
      })),
      pointHistory: pointHistory.map(p => ({
        id: p.id,
        userId: p.userId,
        userEmail: p.user.email,
        change: p.change,
        reason: p.reason,
        createdAt: p.createdAt.toISOString(),
      })),
      summary: {
        totalStripeEvents: stripeEvents.length,
        totalStripePayments: pointHistory.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '오류 발생',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
