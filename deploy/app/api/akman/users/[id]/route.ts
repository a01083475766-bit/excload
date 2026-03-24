/**
 * 관리자 사용자 상세 조회 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { Request } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

/**
 * GET /api/akman/users/[id]
 * 관리자가 사용자 상세 정보 조회
 */
export async function GET(
  request: Request,
  { params }: any
) {
  try {
    // 관리자 권한 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return Response.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    if (!isAdminEmail(session.user.email)) {
      return Response.json(
        { success: false, error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const resolvedParams = await params;
    const userId = resolvedParams.id;

    if (!userId) {
      return Response.json(
        { success: false, message: 'User ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용자 상세 정보 조회
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        pointHistory: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!user) {
      return Response.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // 결제 내역 조회 (Payment 모델이 있을 경우)
    let payments: any[] = [];
    try {
      payments = await prisma.payment.findMany({
        where: { userId },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (error) {
      // Payment 모델이 없을 경우 빈 배열 반환
      console.log('[Admin User Detail API] Payment 모델 조회 실패 (무시됨):', error);
    }

    return Response.json({
      success: true,
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        pointHistory: user.pointHistory.map((h) => ({
          ...h,
          createdAt: h.createdAt.toISOString(),
        })),
        payments: payments.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('[Admin User Detail API] 에러:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '사용자 상세 정보 조회 실패',
      },
      { status: 500 }
    );
  }
}
