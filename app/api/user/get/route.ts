/**
 * 사용자 정보 조회 API
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 *
 * 월간 포인트 지급/리셋은 POST /api/user/grant-monthly-points 에서만 처리합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';

/**
 * GET /api/user/get
 * 현재 로그인 사용자 정보 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;

    try {
      const { prisma } = await import('@/app/lib/prisma');
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
          plan: true,
          points: true,
          nextPointDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          plan: user.plan as 'FREE' | 'PRO' | 'YEARLY',
          points: user.points,
          monthlyPoints: undefined,
          lastMonthlyGrant: user.nextPointDate?.toISOString() || null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      });
    } catch (dbError) {
      console.error('[User Get API] DB 조회 실패:', dbError);
      return NextResponse.json(
        { error: '사용자 정보를 불러오지 못했습니다.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[User Get API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용자 정보 조회 실패' },
      { status: 500 }
    );
  }
}
