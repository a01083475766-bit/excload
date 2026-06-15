/**
 * 월간 사용량 자동 제공 API
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { serviceBlockedResponse } from '@/app/lib/user-access-guard';
import {
  MONTHLY_FREE_GRANT_AMOUNT,
  tryGrantMonthlyFreePoints,
} from '@/app/lib/grant-monthly-points-core';

/**
 * POST /api/user/grant-monthly-points
 * 월간 사용량 자동 제공
 * - 무료 회원(free): 매월 5000 사용량
 * - 유료 회원(pro, yearly): 지급 대상 아님
 */
export async function POST(_request: NextRequest) {
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

      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
          phone: true,
          deviceId: true,
          plan: true,
          points: true,
          nextPointDate: true,
          createdAt: true,
          feedbackTrialEndsAt: true,
          adminTrialEndsAt: true,
          isBlocked: true,
          abuseFlag: true,
          blockReason: true,
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

      const blockedResponse = serviceBlockedResponse(user);
      if (blockedResponse) return blockedResponse;

      const result = await tryGrantMonthlyFreePoints(user);

      if (result.status === 'granted') {
        return NextResponse.json({
          success: true,
          alreadyGranted: false,
          grantedAmount: MONTHLY_FREE_GRANT_AMOUNT,
          message: '월간 사용량이 제공되었습니다.',
          user: {
            id: result.user.id,
            email: result.user.email,
            plan: result.user.plan as 'FREE' | 'PRO' | 'YEARLY',
            points: result.user.points,
            lastMonthlyGrant: result.user.nextPointDate?.toISOString() || null,
            nextPointDate: result.user.nextPointDate?.toISOString() || null,
          },
        });
      }

      if (result.status === 'already_granted') {
        return NextResponse.json({
          success: true,
          alreadyGranted: true,
          message: '이번 달 사용량은 이미 제공되었습니다.',
          user: {
            id: result.user.id,
            email: result.user.email,
            plan: result.user.plan as 'FREE' | 'PRO' | 'YEARLY',
            points: result.user.points,
            lastMonthlyGrant: result.user.nextPointDate?.toISOString() || null,
            nextPointDate: result.user.nextPointDate?.toISOString() || null,
          },
        });
      }

      return NextResponse.json({
        success: false,
        alreadyGranted: result.status === 'not_due',
        blocked: result.reason?.includes('재가입'),
        message: result.reason ?? '월간 사용량 제공 대상이 아닙니다.',
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
