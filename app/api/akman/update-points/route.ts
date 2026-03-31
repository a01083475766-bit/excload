/**
 * 관리자 사용량 수정 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

interface UpdatePointsRequest {
  userId: string;
  points?: number; // 절대값으로 설정할 때 사용
  amount?: number; // 증감량 (양수/음수)
}

/**
 * POST /api/akman/update-points
 * 관리자가 사용자 사용량 수정
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

    const body: UpdatePointsRequest = await request.json();
    const { userId, points, amount } = body;

    // 유효성 검사
    if (!userId) {
      return NextResponse.json(
        { error: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    // points 또는 amount 중 하나는 필수
    if (typeof points !== 'number' && typeof amount !== 'number') {
      return NextResponse.json(
        { error: 'points 또는 amount가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        points: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 사용량 계산
    let newPoints: number;
    let change: number;

    if (typeof amount === 'number') {
      // amount가 있으면 증감량으로 처리
      newPoints = user.points + amount;
      change = amount;
    } else if (typeof points === 'number') {
      // points가 있으면 절대값으로 설정
      newPoints = points;
      change = points - user.points;
    } else {
      return NextResponse.json(
        { error: 'amount 또는 points가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용량이 음수가 되지 않도록 보호
    if (newPoints < 0) {
      return NextResponse.json(
        { error: '사용량은 0보다 작을 수 없습니다.' },
        { status: 400 }
      );
    }

    // 사용량 업데이트
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        points: newPoints,
      },
      select: {
        id: true,
        email: true,
        points: true,
        plan: true,
      },
    });

    // 사용량 변경 로그 기록
    if (change !== 0) {
      await prisma.pointHistory.create({
        data: {
          userId,
          change,
          reason: typeof amount === 'number' ? 'AKMAN' : 'ADMIN_MANUAL_ADJUSTMENT',
        },
      });
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      change,
      message: `사용량이 ${change >= 0 ? '+' : ''}${change.toLocaleString()} 변경되었습니다. (현재: ${updatedUser.points.toLocaleString()})`,
    });
  } catch (error) {
    console.error('[Admin Update Points API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '사용량 수정 실패',
      },
      { status: 500 }
    );
  }
}
