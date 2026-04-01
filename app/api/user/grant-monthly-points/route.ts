/**
 * 월간 사용량 자동 제공 API
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';

/**
 * POST /api/user/grant-monthly-points
 * 월간 사용량 자동 제공
 * - 무료 회원(free): 매월 5000 사용량
 * - 유료 회원(pro, yearly): 지급 대상 아님
 *
 * 보안/일관성:
 * - 세션의 email로 사용자 조회 후, 이후 로직은 모두 user.id 기준
 * - session.user.id가 있으면 DB user.id와 일치해야 함 (JWT·DB 불일치 차단)
 * - 이번 달 이미 지급된 경우는 updateMany 조건으로 원자적으로 차단 (중복 호출·동시 요청 대응)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email.trim().toLowerCase();

    try {
      const { prisma } = await import('@/app/lib/prisma');
      const now = new Date();
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );

      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
          plan: true,
          points: true,
          nextPointDate: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (session.user.id && session.user.id !== user.id) {
        return NextResponse.json(
          { error: '세션과 사용자 정보가 일치하지 않습니다.' },
          { status: 403 }
        );
      }

      if (user.plan !== 'FREE') {
        return NextResponse.json({
          success: false,
          message: 'FREE 플랜만 월간 사용량 제공 대상입니다',
          alreadyGranted: true,
        });
      }

      const grantAmount = 5000;

      // 이번 달 미지급인 경우에만 1행 갱신 (동시 요청·중복 호출 시 둘째부터 count 0)
      const updateResult = await prisma.user.updateMany({
        where: {
          id: user.id,
          plan: 'FREE',
          OR: [{ nextPointDate: null }, { nextPointDate: { lt: startOfMonth } }],
        },
        data: {
          points: { increment: grantAmount },
          nextPointDate: now,
        },
      });

      if (updateResult.count === 0) {
        const fresh = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            email: true,
            plan: true,
            points: true,
            nextPointDate: true,
          },
        });

        if (!fresh) {
          return NextResponse.json(
            { error: '사용자를 찾을 수 없습니다.' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          alreadyGranted: true,
          message: '이번 달 사용량은 이미 제공되었습니다.',
          user: {
            id: fresh.id,
            email: fresh.email,
            plan: fresh.plan as 'FREE' | 'PRO' | 'YEARLY',
            points: fresh.points,
            lastMonthlyGrant: fresh.nextPointDate?.toISOString() || null,
          },
        });
      }

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          plan: true,
          points: true,
          nextPointDate: true,
        },
      });

      if (!updatedUser) {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        alreadyGranted: false,
        grantedAmount: grantAmount,
        message: '월간 사용량이 제공되었습니다.',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          plan: updatedUser.plan as 'FREE' | 'PRO' | 'YEARLY',
          points: updatedUser.points,
          lastMonthlyGrant: updatedUser.nextPointDate?.toISOString() || null,
        },
      });
    } catch (dbError) {
      console.error('[Grant Monthly Points API] DB 업데이트 실패:', dbError);
      return NextResponse.json(
        { error: '월간 사용량 처리 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Grant Monthly Points API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '월간 사용량 제공 실패' },
      { status: 500 }
    );
  }
}
