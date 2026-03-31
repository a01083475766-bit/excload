/**
 * 사용자 정보 조회 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
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
    // 세션 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;

    // Prisma를 사용하여 DB에서 사용자 정보 조회
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
        // 사용자가 없으면 기본값으로 생성 (회원가입 시 생성되어야 함)
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 무료 플랜 기본 사용량 보정: 기존 계정이 5,000 미만이면 즉시 보정
      if (user.plan === 'FREE' && user.points < 5000) {
        const normalizedNextPointDate =
          user.nextPointDate ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const healed = await prisma.user.update({
          where: { email: userEmail },
          data: {
            points: 5000,
            nextPointDate: normalizedNextPointDate,
          },
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
        Object.assign(user, healed);
      }

      // 월간 사용량 자동 제공 (Lazy Update)
      const now = new Date();
      if (user.nextPointDate && now >= user.nextPointDate) {
        let newPoints = user.points;

        if (user.plan === 'FREE') {
          newPoints = 5000;
        }

        if (user.plan === 'PRO' || user.plan === 'YEARLY') {
          newPoints = 400000;
        }

        const nextMonth = new Date(user.nextPointDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        // 동시 요청 안정성을 위해 updateMany 사용 (DB 조건으로 중복 지급 방지)
        const updateResult = await prisma.user.updateMany({
          where: {
            email: userEmail,
            nextPointDate: {
              lte: now,
            },
          },
          data: {
            points: newPoints,
            nextPointDate: nextMonth,
          },
        });

        // 업데이트가 실제로 발생한 경우에만 사용자 정보 다시 조회
        if (updateResult.count > 0) {
          const updatedUser = await prisma.user.findUnique({
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

          if (updatedUser) {
            Object.assign(user, updatedUser);
          }
        }
      }

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          plan: user.plan as 'FREE' | 'PRO' | 'YEARLY',
          points: user.points,
          monthlyPoints: undefined, // Prisma 스키마에 없으므로 undefined
          lastMonthlyGrant: user.nextPointDate?.toISOString() || null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      });
    } catch (dbError) {
      console.error('[User Get API] DB 조회 실패:', dbError);
      // DB 조회 실패 시 임시 응답 (개발 환경)
      const user = {
        id: session.user.id || 'temp-id',
        email: userEmail,
        plan: 'PRO' as const, // 테스트 계정: 유료 플랜
        points: 400000, // 테스트 계정 사용량: 40만
        monthlyPoints: undefined,
        lastMonthlyGrant: null as string | null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      return NextResponse.json({
        success: true,
        user,
      });
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('[User Get API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용자 정보 조회 실패' },
      { status: 500 }
    );
  }
}
