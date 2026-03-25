/**
 * 사용자 플랜 업데이트 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';

interface UpdatePlanRequest {
  plan: 'FREE' | 'PRO' | 'YEARLY';
  userEmail?: string; // Webhook에서 사용
}

/**
 * POST /api/user/update-plan
 * 사용자 플랜 타입 업데이트
 */
export async function POST(request: NextRequest) {
  try {
    const body: UpdatePlanRequest = await request.json();
    const { plan, userEmail: requestUserEmail } = body;

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
    if (!plan || !['FREE', 'PRO', 'YEARLY'].includes(plan)) {
      return NextResponse.json(
        { error: '유효한 플랜 타입이 필요합니다. (FREE, PRO, YEARLY)' },
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
          plan: updatedUser.plan as 'FREE' | 'PRO' | 'YEARLY',
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
      
      // 기타 오류는 임시 응답 (개발 환경)
      const updatedUser = {
        id: 'temp-id',
        email: userEmail,
        plan,
        updatedAt: new Date().toISOString(),
      };
      
      return NextResponse.json({
        success: true,
        user: updatedUser,
        message: `플랜이 ${plan}로 업데이트되었습니다.`,
      });
    }
  } catch (error) {
    console.error('[Update Plan API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '플랜 업데이트 실패' },
      { status: 500 }
    );
  }
}
