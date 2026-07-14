/**
 * 사용자 플랜 업데이트 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';

interface UpdatePlanRequest {
  plan: 'FREE' | 'PRO' | 'YEARLY';
  userEmail?: string;
}

/**
 * POST /api/user/update-plan
 * 사용자 플랜 타입 업데이트
 */
export async function POST(request: NextRequest) {
  try {
    const body: UpdatePlanRequest = await request.json();
    const { plan, userEmail } = body;

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
    if (!plan || !['FREE', 'PRO', 'YEARLY'].includes(plan)) {
      return NextResponse.json(
        { error: '유효한 플랜 타입이 필요합니다. (FREE, PRO, YEARLY)' },
        { status: 400 }
      );
    }
    if (!userEmail || !userEmail.trim()) {
      return NextResponse.json(
        { error: 'userEmail이 필요합니다.' },
        { status: 400 }
      );
    }

    // Prisma를 사용하여 DB에서 플랜 업데이트
    try {
      const { prisma } = await import('@/app/lib/prisma');
      const updatedUser = await prisma.user.update({
        where: { email: userEmail },
        data: {
          plan,
        },
        select: {
          id: true,
          email: true,
          plan: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          plan: updatedUser.plan as 'BETA' | 'FREE' | 'PRO' | 'YEARLY',
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
        message: `플랜이 ${plan}로 업데이트되었습니다.`,
      });
    } catch (dbError: any) {
      console.error('[Update Plan API] DB 업데이트 실패:', dbError);
      
      // 사용자를 찾을 수 없는 경우
      if (dbError.code === 'P2025') {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: '플랜 업데이트 처리 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Update Plan API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '플랜 업데이트 실패' },
      { status: 500 }
    );
  }
}
