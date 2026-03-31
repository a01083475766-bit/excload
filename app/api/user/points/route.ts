/**
 * 사용자 사용량 정보 조회 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.3 준수
 * 사용량 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * GET /api/user/points
 * 
 * 현재 로그인한 사용자의 사용량 정보를 반환합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/user/points
 * 사용자 사용량 정보 조회
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 로그인 세션 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 2. 사용자 조회
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
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

    // 3. 응답 반환
    return NextResponse.json({
      plan: user.plan,
      points: user.points,
      nextPointDate: user.nextPointDate,
    });
  } catch (error) {
    console.error('[User Points API] 에러:', error);
    return NextResponse.json(
      { error: '시스템 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
