/**
 * 사용량 제공(증가) API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';


interface AddPointsRequest {
  amount: number;
  reason?: string;
  userEmail?: string; // Webhook에서 사용
}

/**
 * POST /api/user/add-points
 * 사용량 제공(증가)
 */
export async function POST(request: NextRequest) {
  try {
    const body: AddPointsRequest = await request.json();
    const { amount, reason, userEmail: requestUserEmail } = body;

    // Webhook에서 호출하는 경우 (userEmail이 body에 포함된 경우)
    let userEmail: string;
    if (requestUserEmail) {
      // Webhook 전용 인증: 내부 호출만 허용
      const webhookSecret = request.headers.get('x-webhook-secret');
      if (webhookSecret !== process.env.WEBHOOK_INTERNAL_SECRET) {
        return NextResponse.json(
          { error: '인증 실패' },
          { status: 401 }
        );
      }
      userEmail = requestUserEmail;
    } else {
      // 일반 사용자 호출: 세션 확인
      const session = await getServerSession(authOptions);
      if (!session || !session.user || !session.user.email) {
        return NextResponse.json(
          { error: '로그인이 필요합니다.' },
          { status: 401 }
        );
      }
      userEmail = session.user.email;
    }

    // 유효성 검사
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: '유효한 사용량 수치가 필요합니다.' },
        { status: 400 }
      );
    }

    // Prisma를 사용하여 DB에서 사용량 증가
    try {
      const { prisma } = await import('@/app/lib/prisma');
      
      // 1. 사용자 조회
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
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

      // 2. 사용량 증가 (increment 사용)
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          points: {
            increment: amount,
          },
        },
        select: {
          id: true,
          email: true,
          points: true,
        },
      });

      // 3. 사용량 변경 로그 기록
      await prisma.pointHistory.create({
        data: {
          userId: user.id,
          change: amount,
          reason: reason || '사용량 제공',
        },
      });

      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          points: updatedUser.points,
        },
        addedAmount: amount,
        reason: reason || '사용량 제공',
      });
    } catch (dbError) {
      console.error('[Add Points API] DB 업데이트 실패:', dbError);
      
      // DB 업데이트 실패 시 에러 반환
      return NextResponse.json(
        {
          error: '사용량 제공 처리 중 오류가 발생했습니다.',
          details: dbError instanceof Error ? dbError.message : String(dbError),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Add Points API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용량 제공 실패' },
      { status: 500 }
    );
  }
}
