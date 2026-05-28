/**
 * 사용량 제공(증가) API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';

interface AddPointsRequest {
  amount: number;
  reason?: string;
  userEmail?: string;
}

/**
 * POST /api/user/add-points
 * 사용량 제공(증가)
 */
export async function POST(request: NextRequest) {
  try {
    const body: AddPointsRequest = await request.json();
    const { amount, reason, userEmail } = body;

    // 내부 전용 API: 웹훅 시크릿이 반드시 일치해야 한다.
    const internalSecret = process.env.WEBHOOK_INTERNAL_SECRET;
    if (!internalSecret) {
      return NextResponse.json(
        { error: '서버 내부 인증 설정이 필요합니다.' },
        { status: 503 }
      );
    }
    const webhookSecret = request.headers.get('x-webhook-secret');
    if (webhookSecret !== internalSecret) {
      return NextResponse.json(
        { error: '인증 실패' },
        { status: 401 }
      );
    }

    // 유효성 검사
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: '유효한 사용량 수치가 필요합니다.' },
        { status: 400 }
      );
    }
    if (!userEmail || !userEmail.trim()) {
      return NextResponse.json(
        { error: 'userEmail이 필요합니다.' },
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
