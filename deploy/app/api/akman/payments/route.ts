/**
 * 관리자 결제 내역 조회 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

/**
 * GET /api/akman/payments
 * 관리자가 결제 내역 조회
 */
export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // 페이지네이션 파라미터 확인
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const days = parseInt(searchParams.get('days') || '0'); // 0이면 전체, 숫자면 최근 N일
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // 날짜 필터 조건 계산 (최근 N일)
    let dateCondition: any = undefined;
    if (days > 0) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      daysAgo.setHours(0, 0, 0, 0);
      dateCondition = {
        createdAt: {
          gte: daysAgo,
        },
      };
    }

    // 총 결제 건수 조회 (날짜 필터 적용)
    const totalPayments = await prisma.payment.count({
      where: dateCondition,
    });

    // 결제 내역 조회 (날짜 필터 적용)
    const payments = await prisma.payment.findMany({
      where: dateCondition,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        userId: true,
        email: true,
        plan: true,
        amount: true,
        currency: true,
        createdAt: true,
      },
      skip,
      take,
    });

    const totalPages = Math.ceil(totalPayments / pageSize);

    return NextResponse.json({
      success: true,
      payments: payments.map((payment) => ({
        ...payment,
        createdAt: payment.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        totalPayments,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('[Admin Payments API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '결제 내역 조회 실패',
      },
      { status: 500 }
    );
  }
}
