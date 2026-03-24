/**
 * 관리자 구독 조회 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

/**
 * GET /api/akman/subscriptions
 * 관리자가 모든 사용자 구독 상태 조회
 */
export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // 모든 구독 정보 조회
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: {
          select: {
            email: true,
            plan: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 응답 데이터 가공 (필요한 필드만 추출)
    const result = subscriptions.map((subscription) => ({
      user: {
        email: subscription.user.email,
        plan: subscription.user.plan,
      },
      subscription: {
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? subscription.currentPeriodEnd.toISOString()
          : null,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
    }));

    return NextResponse.json({
      success: true,
      subscriptions: result,
      total: result.length,
    });
  } catch (error) {
    console.error('[Admin Subscriptions API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '구독 목록 조회 실패',
      },
      { status: 500 }
    );
  }
}
