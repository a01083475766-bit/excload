/**
 * POST /api/user/sync-account
 * 로그인·페이지 진입 후 백그라운드에서 실행하는 계정 부가 작업.
 * (IP/어뷰징, 초기 혜택, 체험 만료 등 — 화면 이동을 막지 않음)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { getClientIp } from '@/app/lib/client-ip';
import { prisma } from '@/app/lib/prisma';
import {
  serviceBlockedResponse,
  syncUserIpAndAbuseScore,
  tryGrantInitialFreeBenefits,
} from '@/app/lib/user-access-guard';
import { isWithinWithdrawGrace, WITHDRAW_GRACE_DAYS } from '@/app/lib/account-withdrawal';
import { expireFeedbackTrialIfNeeded } from '@/app/lib/feedback-event/entitlement';
import { expireAdminTrialIfNeeded } from '@/app/lib/admin-pro-trial';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        deletedAt: true,
        purgeAt: true,
        isBlocked: true,
        abuseFlag: true,
        blockReason: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (user.deletedAt) {
      if (isWithinWithdrawGrace(user)) {
        return NextResponse.json(
          {
            error: `탈퇴 처리된 계정입니다. ${WITHDRAW_GRACE_DAYS}일 이내 로그인·재가입 시 복구할 수 있습니다.`,
            code: 'ACCOUNT_WITHDRAWN',
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: '탈퇴 유예 기간이 지난 계정입니다.', code: 'ACCOUNT_WITHDRAWN_EXPIRED' },
        { status: 403 },
      );
    }

    const blockedResponse = serviceBlockedResponse(user);
    if (blockedResponse) return blockedResponse;

    await syncUserIpAndAbuseScore(user.id, getClientIp(request));
    await tryGrantInitialFreeBenefits(user.id);
    await expireFeedbackTrialIfNeeded(user.id);
    await expireAdminTrialIfNeeded(user.id);

    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
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
        feedbackTrialEndsAt: true,
        feedbackTrialUsed: true,
        adminTrialEndsAt: true,
        isBlocked: true,
        abuseFlag: true,
        blockReason: true,
      },
    });

    if (!freshUser) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const blockedAfterSync = serviceBlockedResponse(freshUser);
    if (blockedAfterSync) return blockedAfterSync;

    return NextResponse.json({
      success: true,
      user: {
        id: freshUser.id,
        email: freshUser.email,
        name: freshUser.name,
        phone: freshUser.phone,
        plan: freshUser.plan as 'FREE' | 'PRO' | 'YEARLY',
        points: freshUser.points,
        lastLoginProvider: freshUser.lastLoginProvider,
        lastMonthlyGrant: freshUser.nextPointDate?.toISOString() || null,
        nextPointDate: freshUser.nextPointDate?.toISOString() || null,
        createdAt: freshUser.createdAt.toISOString(),
        updatedAt: freshUser.updatedAt.toISOString(),
        feedbackTrialEndsAt: freshUser.feedbackTrialEndsAt?.toISOString() ?? null,
        feedbackTrialUsed: freshUser.feedbackTrialUsed,
        adminTrialEndsAt: freshUser.adminTrialEndsAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('[User Sync Account API] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '계정 동기화 실패' },
      { status: 500 },
    );
  }
}
