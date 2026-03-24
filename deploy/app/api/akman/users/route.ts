/**
 * 관리자 사용자 목록 조회 API
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
 * GET /api/akman/users
 * 관리자가 사용자 목록 조회
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

    // 검색어 및 페이지네이션 파라미터 확인
    const { searchParams } = new URL(request.url);
    const searchTerm = searchParams.get('search') || '';
    const planFilter = searchParams.get('plan') || ''; // FREE, PRO, YEARLY
    const dateFilter = searchParams.get('date') || ''; // today, thisMonth
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // 검색 조건
    // SQLite의 경우 contains는 LIKE '%search%'로 변환됨
    // SQLite는 기본적으로 대소문자를 구분하지 않으므로 mode: 'insensitive' 제거
    const trimmedSearchTerm = searchTerm.trim();
    
    // 날짜 필터 조건 계산
    let dateCondition: any = undefined;
    if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateCondition = {
        gte: today,
        lt: tomorrow,
      };
    } else if (dateFilter === 'thisMonth') {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      dateCondition = {
        gte: firstDayOfMonth,
        lt: firstDayOfNextMonth,
      };
    }

    // 검색 조건 구성
    const whereCondition: any = {};
    
    // 이메일 검색 조건
    if (trimmedSearchTerm) {
      whereCondition.email = {
        contains: trimmedSearchTerm,
      };
    }
    
    // 플랜 필터 조건
    if (planFilter && ['FREE', 'PRO', 'YEARLY'].includes(planFilter)) {
      whereCondition.plan = planFilter;
    }
    
    // 날짜 필터 조건
    if (dateCondition) {
      whereCondition.createdAt = dateCondition;
    }
    
    // 조건이 없으면 undefined로 설정 (전체 조회)
    const finalWhereCondition = Object.keys(whereCondition).length > 0 ? whereCondition : undefined;
    
    // 디버깅: 검색어와 결과 확인
    if (trimmedSearchTerm || planFilter || dateFilter) {
      console.log('[Admin Users API] 검색어:', trimmedSearchTerm);
      console.log('[Admin Users API] 플랜 필터:', planFilter);
      console.log('[Admin Users API] 날짜 필터:', dateFilter);
      console.log('[Admin Users API] 검색 조건:', JSON.stringify(finalWhereCondition, null, 2));
    }

    // 디버깅: 검색 조건 확인
    if (trimmedSearchTerm) {
      console.log('[Admin Users API] 검색 조건:', JSON.stringify(whereCondition, null, 2));
    }

    // 총 사용자 수 조회 (검색 조건 포함)
    const totalUsers = await prisma.user.count({
      where: finalWhereCondition,
    });

    // 디버깅: 총 사용자 수 확인
    if (trimmedSearchTerm || planFilter || dateFilter) {
      console.log('[Admin Users API] 검색 조건 적용 후 총 사용자 수:', totalUsers);
    }

    // 사용자 목록 조회
    const users = await prisma.user.findMany({
      where: finalWhereCondition,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
        createdAt: true,
        emailVerified: true,
      },
      skip,
      take,
    });

    // 디버깅: 검색 결과 확인
    if (trimmedSearchTerm || planFilter || dateFilter) {
      console.log('[Admin Users API] 검색 결과 수:', users.length);
      console.log('[Admin Users API] 검색된 이메일:', users.map(u => u.email));
    }

    const totalPages = Math.ceil(totalUsers / pageSize);

    return NextResponse.json({
      success: true,
      users: users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        totalUsers,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('[Admin Users API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '사용자 목록 조회 실패',
      },
      { status: 500 }
    );
  }
}
