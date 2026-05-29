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
import { getClientIp } from '@/app/lib/client-ip';
import {
  syncUserIpAndAbuseScore,
  tryGrantInitialFreeBenefits,
} from '@/app/lib/user-access-guard';

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
          name: true,
          phone: true,
          plan: true,
          points: true,
          lastLoginProvider: true,
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

      await syncUserIpAndAbuseScore(user.id, getClientIp(request));
      await tryGrantInitialFreeBenefits(user.id);

      const freshUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          plan: true,
          points: true,
          lastLoginProvider: true,
          nextPointDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!freshUser) {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        user: {
          id: freshUser.id,
          email: freshUser.email,
          name: freshUser.name,
          phone: freshUser.phone,
          plan: freshUser.plan as 'FREE' | 'PRO' | 'YEARLY',
          points: freshUser.points,
          lastLoginProvider: freshUser.lastLoginProvider,
          monthlyPoints: undefined,
          lastMonthlyGrant: freshUser.nextPointDate?.toISOString() || null,
          nextPointDate: freshUser.nextPointDate?.toISOString() || null,
          createdAt: freshUser.createdAt.toISOString(),
          updatedAt: freshUser.updatedAt.toISOString(),
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
