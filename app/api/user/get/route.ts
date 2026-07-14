/**
 * 사용자 정보 조회 API (경량)
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * IP/어뷰징·체험 만료·초기 혜택은 POST /api/user/sync-account 에서 처리합니다.
 * 월간 포인트 지급은 POST /api/user/grant-monthly-points 에서만 처리합니다.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { serviceBlockedResponse } from '@/app/lib/user-access-guard';
import { isWithinWithdrawGrace, WITHDRAW_GRACE_DAYS } from '@/app/lib/account-withdrawal';

/**
 * GET /api/user/get
 * 현재 로그인 사용자 정보 조회
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
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
          name: true,
          phone: true,
          plan: true,
          points: true,
          lastLoginProvider: true,
          nextPointDate: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          purgeAt: true,
          feedbackTrialEndsAt: true,
          feedbackTrialUsed: true,
          adminTrialEndsAt: true,
          isBlocked: true,
          abuseFlag: true,
          blockReason: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (user.deletedAt) {
        if (isWithinWithdrawGrace(user)) {
          return NextResponse.json(
            {
              error: `탈퇴 처리된 계정입니다. ${WITHDRAW_GRACE_DAYS}일 이내 로그인·재가입 시 복구할 수 있습니다.`,
              code: 'ACCOUNT_WITHDRAWN',
              purgeAt: user.purgeAt?.toISOString() ?? null,
              canRestore: true,
            },
            { status: 403 },
          );
        }
        return NextResponse.json(
          {
            error: '탈퇴 유예 기간이 지난 계정입니다.',
            code: 'ACCOUNT_WITHDRAWN_EXPIRED',
            canRestore: false,
          },
          { status: 403 },
        );
      }

      const blockedResponse = serviceBlockedResponse(user);
      if (blockedResponse) return blockedResponse;

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          plan: user.plan as 'BETA' | 'FREE' | 'PRO' | 'YEARLY',
          points: user.points,
          lastLoginProvider: user.lastLoginProvider,
          monthlyPoints: undefined,
          lastMonthlyGrant: user.nextPointDate?.toISOString() || null,
          nextPointDate: user.nextPointDate?.toISOString() || null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          feedbackTrialEndsAt: user.feedbackTrialEndsAt?.toISOString() ?? null,
          feedbackTrialUsed: user.feedbackTrialUsed,
          adminTrialEndsAt: user.adminTrialEndsAt?.toISOString() ?? null,
        },
      });
    } catch (dbError) {
      console.error('[User Get API] DB 조회 실패:', dbError);
      return NextResponse.json(
        { error: '사용자 정보를 불러오지 못했습니다.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[User Get API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용자 정보 조회 실패' },
      { status: 500 }
    );
  }
}
