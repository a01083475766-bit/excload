/**
 * 월간 사용량 자동 제공 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';

/**
 * POST /api/user/grant-monthly-points
 * 월간 사용량 자동 제공
 * - 무료 회원(free): 매월 5000 사용량
 * - 유료 회원(pro, yearly): 지급 대상 아님
 */
export async function POST(request: NextRequest) {
  try {
    // 세션 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;

    // ⚠️ 임시 구현: 실제로는 Supabase에서 조회 후 지급
    // 실제 구현 시:
    // 1. 사용자 정보 조회 (plan_type, points, last_monthly_grant)
    // const { data: user, error: fetchError } = await supabase
    //   .from('users')
    //   .select('id, email, plan_type, points, monthly_points, last_monthly_grant')
    //   .eq('email', userEmail)
    //   .single();
    //
    // 2. 이번 달 지급 여부 확인
    // const now = new Date();
    // const lastGrant = user.last_monthly_grant ? new Date(user.last_monthly_grant) : null;
    // const shouldGrant = !lastGrant || 
    //   lastGrant.getFullYear() < now.getFullYear() || 
    //   lastGrant.getMonth() < now.getMonth();
    //
    // if (!shouldGrant) {
    //   return NextResponse.json({
    //     success: true,
    //     alreadyGranted: true,
    //     message: '이번 달 사용량은 이미 제공되었습니다.',
    //     user: {
    //       id: user.id,
    //       email: user.email,
    //       planType: user.plan_type,
    //       points: user.points,
    //       monthlyPoints: user.monthly_points,
    //       lastMonthlyGrant: user.last_monthly_grant,
    //     },
    //   });
    // }
    //
    // 3. free 플랜만 지급 대상 확인
    // if (user.plan_type !== 'free') {
    //   return NextResponse.json({
    //     success: false,
    //     message: 'free 플랜만 월간 사용량 제공 대상입니다',
    //   });
    // }
    //
    // 4. 사용량 제공 (free 플랜만)
    // const grantAmount = 5000;
    // const { data: updatedUser, error: updateError } = await supabase
    //   .from('users')
    //   .update({
    //     points: user.points + grantAmount,
    //     monthly_points: (user.monthly_points || 0) + grantAmount,
    //     last_monthly_grant: now.toISOString(),
    //   })
    //   .eq('email', userEmail)
    //   .select()
    //   .single();

    // Prisma를 사용하여 DB에서 월간 사용량 제공
    try {
      const { prisma } = await import('@/app/lib/prisma');
      const now = new Date();
      
      // 1. 사용자 정보 조회
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
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

      // 2. 이번 달 지급 여부 확인
      const lastGrant = user.nextPointDate;
      const shouldGrant = !lastGrant || 
        lastGrant.getFullYear() < now.getFullYear() || 
        lastGrant.getMonth() < now.getMonth();

      if (!shouldGrant) {
        return NextResponse.json({
          success: true,
          alreadyGranted: true,
          message: '이번 달 사용량은 이미 제공되었습니다.',
          user: {
            id: user.id,
            email: user.email,
            plan: user.plan as 'FREE' | 'PRO' | 'YEARLY',
            points: user.points,
            lastMonthlyGrant: user.nextPointDate?.toISOString() || null,
          },
        });
      }

      // 3. FREE 플랜만 지급 대상 확인
      if (user.plan !== 'FREE') {
        return NextResponse.json({
          success: false,
          message: 'FREE 플랜만 월간 사용량 제공 대상입니다',
          alreadyGranted: true, // PRO/YEARLY 플랜은 지급 대상 아님
        });
      }

      // 4. 사용량 제공 (FREE 플랜만)
      const grantAmount = 5000;
      const updatedUser = await prisma.user.update({
        where: { email: userEmail },
        data: {
          points: {
            increment: grantAmount,
          },
          nextPointDate: now,
        },
        select: {
          id: true,
          email: true,
          plan: true,
          points: true,
          nextPointDate: true,
        },
      });

      return NextResponse.json({
        success: true,
        alreadyGranted: false,
        grantedAmount: grantAmount,
        message: '월간 사용량이 제공되었습니다.',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          plan: updatedUser.plan as 'FREE' | 'PRO' | 'YEARLY',
          points: updatedUser.points,
          lastMonthlyGrant: updatedUser.nextPointDate?.toISOString() || null,
        },
      });
    } catch (dbError) {
      console.error('[Grant Monthly Points API] DB 업데이트 실패:', dbError);
      
      // DB 업데이트 실패 시 임시 응답 (개발 환경)
      const now = new Date();
      const plan = 'PRO';
      
      if (plan !== 'FREE') {
        return NextResponse.json({
          success: false,
          message: 'FREE 플랜만 월간 사용량 제공 대상입니다',
          alreadyGranted: true,
        });
      }

      const grantAmount = 5000;
      const currentPoints = 400000;
      
      const updatedUser = {
        id: session.user.id || 'temp-id',
        email: userEmail,
        plan: plan as 'FREE' | 'PRO' | 'YEARLY',
        points: currentPoints + grantAmount,
        lastMonthlyGrant: now.toISOString(),
      };
      
      return NextResponse.json({
        success: true,
        alreadyGranted: false,
        grantedAmount: grantAmount,
        message: '월간 사용량이 제공되었습니다.',
        user: updatedUser,
      });
    }

    return NextResponse.json({
      success: true,
      alreadyGranted: false,
      grantedAmount: grantAmount,
      message: '월간 사용량이 제공되었습니다.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('[Grant Monthly Points API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '월간 사용량 제공 실패' },
      { status: 500 }
    );
  }
}
