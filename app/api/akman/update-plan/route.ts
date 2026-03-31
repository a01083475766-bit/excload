/**
 * 관리자 플랜 변경 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

interface UpdatePlanRequest {
  userId: string;
  plan: 'FREE' | 'PRO' | 'YEARLY';
}

/**
 * POST /api/akman/update-plan
 * 관리자가 사용자 플랜 변경
 */
export async function POST(request: NextRequest) {
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

    const body: UpdatePlanRequest = await request.json();
    const { userId, plan } = body;

    // 유효성 검사
    if (!userId || !plan) {
      return NextResponse.json(
        { error: 'userId와 plan이 필요합니다.' },
        { status: 400 }
      );
    }

    if (!['FREE', 'PRO', 'YEARLY'].includes(plan)) {
      return NextResponse.json(
        { error: '유효한 플랜 타입이 필요합니다. (FREE, PRO, YEARLY)' },
        { status: 400 }
      );
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    // 플랜 변경에 따른 사용량 조정
    let newPoints = user.points;
    let pointsChange = 0;

    if (plan === 'PRO' || plan === 'YEARLY') {
      // PRO/YEARLY로 변경 시 사용량 400000으로 설정
      if (user.plan === 'FREE') {
        pointsChange = 400000 - user.points;
        newPoints = 400000;
      }
    } else if (plan === 'FREE') {
      // FREE로 변경 시 사용량 5000으로 설정
      if (user.plan !== 'FREE') {
        pointsChange = 5000 - user.points;
        newPoints = 5000;
      }
    }

    // 플랜 및 사용량 업데이트
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        plan,
        points: newPoints,
      },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
      },
    });

    // 사용량 변경 로그 기록 (변경이 있는 경우)
    if (pointsChange !== 0) {
      await prisma.pointHistory.create({
        data: {
          userId,
          change: pointsChange,
          reason: `ADMIN_PLAN_CHANGE_${plan}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      pointsChange,
      message: `플랜이 ${plan}로 변경되었습니다.${pointsChange !== 0 ? ` 사용량이 ${pointsChange >= 0 ? '+' : ''}${pointsChange.toLocaleString()} 변경되었습니다.` : ''}`,
    });
  } catch (error) {
    console.error('[Admin Update Plan API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '플랜 변경 실패',
      },
      { status: 500 }
    );
  }
}
