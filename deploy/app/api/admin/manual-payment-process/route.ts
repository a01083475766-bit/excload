/**
 * 관리자 수동 결제 처리 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

interface ManualPaymentProcessRequest {
  userEmail: string;
  plan: 'PRO' | 'YEARLY';
  points?: number; // 기본값: 400000
}

/**
 * POST /api/admin/manual-payment-process
 * 관리자가 수동으로 결제 처리 (플랜 업데이트 + 포인트 지급)
 */
export async function POST(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const body: ManualPaymentProcessRequest = await request.json();
    const { userEmail, plan, points = 400000 } = body;

    // 유효성 검사
    if (!userEmail || !plan) {
      return NextResponse.json(
        { error: '이메일과 플랜이 필요합니다.' },
        { status: 400 }
      );
    }

    if (plan !== 'PRO' && plan !== 'YEARLY') {
      return NextResponse.json(
        { error: '플랜은 PRO 또는 YEARLY여야 합니다.' },
        { status: 400 }
      );
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 1. 플랜 업데이트
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        plan,
        points: {
          increment: points,
        },
      },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
      },
    });

    // 2. 포인트 지급 로그 기록
    await prisma.pointHistory.create({
      data: {
        userId: user.id,
        change: points,
        reason: `MANUAL_PAYMENT_PROCESS_${plan}`,
      },
    });

    // 3. 결제 기록 생성 (수동 처리)
    const amount = plan === 'PRO' ? 4000 : 40000;
    await prisma.payment.create({
      data: {
        userId: user.id,
        email: userEmail,
        plan: plan,
        amount: amount,
        currency: 'KRW',
        stripeSessionId: null, // 수동 처리이므로 null
      },
    });

    return NextResponse.json({
      success: true,
      message: '결제 처리가 완료되었습니다.',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        plan: updatedUser.plan,
        points: updatedUser.points,
      },
      processed: {
        plan: plan,
        pointsAdded: points,
        amount: amount,
      },
    });
  } catch (error) {
    console.error('[Manual Payment Process API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '결제 처리 실패',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
