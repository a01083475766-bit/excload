/**
 * 관리자 회원 삭제 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import Stripe from 'stripe';

interface DeleteUserRequest {
  userId: string;
}

/**
 * DELETE /api/akman/delete-user
 * 관리자가 사용자 삭제
 */
export async function DELETE(request: NextRequest) {
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

    const body: DeleteUserRequest = await request.json();
    const { userId } = body;

    // 유효성 검사
    if (!userId) {
      return NextResponse.json(
        { error: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 관리자 본인 삭제 방지 (akman과 a01083475766@gmail.com 모두 포함)
    if (isAdminEmail(user.email)) {
      return NextResponse.json(
        { error: '관리자 계정은 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    // Stripe 구독이 남아있으면 먼저 종료 시도 (실패해도 DB 삭제는 계속 진행)
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2026-02-25.clover',
        });
        const subs = await prisma.subscription.findMany({
          where: { userId },
          select: {
            stripeSubscriptionId: true,
            status: true,
          },
        });
        for (const sub of subs) {
          if (
            sub.stripeSubscriptionId &&
            ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)
          ) {
            try {
              await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
            } catch (stripeCancelError) {
              console.error('[Admin Delete User API] Stripe 구독 해지 실패:', stripeCancelError);
            }
          }
        }
      }
    } catch (stripeError) {
      console.error('[Admin Delete User API] Stripe 정리 중 오류:', stripeError);
    }

    // FK 충돌 방지를 위해 연관 테이블 먼저 삭제 후 사용자 삭제
    await prisma.$transaction([
      prisma.subscription.deleteMany({
        where: { userId },
      }),
      prisma.pointHistory.deleteMany({
        where: { userId },
      }),
      prisma.payment.deleteMany({
        where: { userId },
      }),
      prisma.emailVerificationToken.deleteMany({
        where: { email: user.email },
      }),
      prisma.user.delete({
        where: { id: userId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `사용자 ${user.email}가 삭제되었습니다.`,
    });
  } catch (error) {
    console.error('[Admin Delete User API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '사용자 삭제 실패',
      },
      { status: 500 }
    );
  }
}
