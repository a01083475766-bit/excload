/**
 * 사용량 차감 API
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';

interface UsePointsRequest {
  amount: number;
  type: 'text' | 'download';
  reason?: string;
}

/**
 * POST /api/user/use-points
 * 사용량 차감
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

    const body: UsePointsRequest = await request.json();
    const { amount, type, reason } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: '유효한 사용량 수치가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!type || (type !== 'text' && type !== 'download')) {
      return NextResponse.json(
        { error: '유효한 타입이 필요합니다. (text 또는 download)' },
        { status: 400 }
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
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (user.points < amount) {
        return NextResponse.json(
          { error: '사용량이 부족합니다.' },
          { status: 400 }
        );
      }

      const updatedUser = await prisma.user.update({
        where: { email: userEmail },
        data: {
          points: {
            decrement: amount,
          },
        },
        select: {
          id: true,
          email: true,
          plan: true,
          points: true,
        },
      });

      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          plan: updatedUser.plan as 'FREE' | 'PRO' | 'YEARLY',
          points: updatedUser.points,
        },
        usedAmount: amount,
        reason: reason || '사용량 차감',
      });
    } catch (dbError) {
      console.error('[Use Points API] DB 업데이트 실패:', dbError);
      return NextResponse.json(
        { error: '사용량 처리 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Use Points API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용량 차감 실패' },
      { status: 500 }
    );
  }
}
