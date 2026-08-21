/**
 * 사용량 차감 API
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { getClientIp } from '@/app/lib/client-ip';
import { serviceBlockedResponse, tryGrantInitialFreeBenefits } from '@/app/lib/user-access-guard';
import { hasProEntitlement } from '@/app/lib/feedback-event/entitlement';
import { isMonthlyGrantDue, tryGrantMonthlyFreePoints } from '@/app/lib/grant-monthly-points-core';
import { shouldChargeDownloadPointsForPlan } from '@/app/lib/open-beta-policy';

interface UsePointsRequest {
  amount: number;
  type: 'text' | 'download';
  reason?: string;
}

/** 관리자·마이페이지 사용량 내역 조회용 (PointHistory.reason) */
function resolvePointHistoryReason(
  type: 'text' | 'download',
  customReason?: string,
): string {
  const trimmed = customReason?.trim();
  if (trimmed) return trimmed;
  return type === 'download' ? 'DOWNLOAD_FILE' : 'TEXT_CONVERT';
}

/**
 * POST /api/user/use-points
 * 사용량 차감
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body: UsePointsRequest = await request.json();
    const { amount, type, reason } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: '유효한 사용량 수치가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!type || (type !== 'text' && type !== 'download')) {
      return NextResponse.json(
        { error: '유효한 타입이 필요합니다. (text 또는 download)' },
        { status: 400 }
      );
    }

    const userEmail = session.user.email;

    try {
      const { prisma } = await import('@/app/lib/prisma');

      const userSelect = {
        id: true,
        email: true,
        plan: true,
        points: true,
        nextPointDate: true,
        feedbackTrialEndsAt: true,
        adminTrialEndsAt: true,
        feedbackTrialUsed: true,
        signupBonusClaimed: true,
        isBlocked: true,
        abuseFlag: true,
        blockReason: true,
      } as const;

      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: userSelect,
      });

      if (!user) {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      const blockedResponse = serviceBlockedResponse(user);
      if (blockedResponse) return blockedResponse;

      // IP만 기록(어뷰징 점수 재계산은 sync-account에서 처리 — 차감 핫패스 경량화)
      const ip = getClientIp(request);
      if (ip && ip !== 'unknown') {
        void prisma.user
          .update({ where: { id: user.id }, data: { lastIp: ip } })
          .catch(() => {});
      }

      let chargeUser = user;
      const normalizedAmount = Math.max(1, Math.floor(amount));

      const { getEffectiveUserAccess } = await import('@/app/lib/entitlement/effective-access');
      const access = await getEffectiveUserAccess(chargeUser.id);
      const hasPro = access?.hasProAccess ?? hasProEntitlement(chargeUser);

      if (
        type === 'download' &&
        !shouldChargeDownloadPointsForPlan(chargeUser.plan, hasPro)
      ) {
        return NextResponse.json({
          success: true,
          user: {
            id: chargeUser.id,
            email: chargeUser.email,
            plan: chargeUser.plan,
            points: chargeUser.points,
            nextPointDate: chargeUser.nextPointDate?.toISOString() ?? null,
          },
          usedAmount: 0,
          reason: hasPro
            ? 'PRO_엑셀다운로드_무제한'
            : 'BETA_엑셀다운로드_무료',
        });
      }

      if (
        chargeUser.points < normalizedAmount &&
        !chargeUser.signupBonusClaimed &&
        chargeUser.points === 0
      ) {
        await tryGrantInitialFreeBenefits(chargeUser.id);
        const afterSignupBonus = await prisma.user.findUnique({
          where: { id: chargeUser.id },
          select: userSelect,
        });
        if (afterSignupBonus) {
          chargeUser = afterSignupBonus;
        }
      }

      if (
        chargeUser.points < normalizedAmount &&
        (chargeUser.plan === 'FREE' || chargeUser.plan === 'BETA') &&
        isMonthlyGrantDue(chargeUser)
      ) {
        const grantSource = await prisma.user.findUnique({
          where: { id: chargeUser.id },
          select: {
            id: true,
            email: true,
            phone: true,
            deviceId: true,
            plan: true,
            points: true,
            nextPointDate: true,
            createdAt: true,
            feedbackTrialEndsAt: true,
            adminTrialEndsAt: true,
          },
        });

        if (grantSource) {
          const grantResult = await tryGrantMonthlyFreePoints(grantSource);
          if (grantResult.status === 'granted' || grantResult.status === 'already_granted') {
            chargeUser = {
              ...chargeUser,
              points: grantResult.user.points,
              nextPointDate: grantResult.user.nextPointDate,
            };
          }
        }
      }

      if (chargeUser.points < 1) {
        return NextResponse.json(
          {
            error: '사용량이 부족합니다.',
            nextPointDate: chargeUser.nextPointDate?.toISOString() ?? null,
          },
          { status: 400 }
        );
      }

      // 정책:
      // - text: 요청량이 잔액보다 커도 잔여 포인트 전액 차감 후 1회 허용
      // - download: (무료에서 호출) 1회 1000 기준이지만 잔액이 부족하면 전액 차감 후 1회 허용
      const deductionAmount = Math.min(chargeUser.points, normalizedAmount);
      const historyReason = resolvePointHistoryReason(type, reason);

      // 동시 요청 시 잔액보다 많이 빠지지 않도록 조건+차감 후 내역 기록 (원자 처리)
      const updatedUser = await prisma.$transaction(async (tx) => {
        const deducted = await tx.user.updateMany({
          where: { id: chargeUser.id, points: { gte: deductionAmount } },
          data: { points: { decrement: deductionAmount } },
        });

        if (deducted.count === 0) {
          return null;
        }

        await tx.pointHistory.create({
          data: {
            userId: chargeUser.id,
            change: -deductionAmount,
            reason: historyReason,
          },
        });

        return tx.user.findUnique({
          where: { id: chargeUser.id },
          select: {
            id: true,
            email: true,
            plan: true,
            points: true,
            nextPointDate: true,
          },
        });
      });

      if (!updatedUser) {
        return NextResponse.json(
          { error: '사용량이 부족합니다.' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          plan: updatedUser.plan as 'BETA' | 'FREE' | 'PRO' | 'YEARLY',
          points: updatedUser.points,
          nextPointDate: updatedUser.nextPointDate?.toISOString() ?? null,
        },
        usedAmount: deductionAmount,
        reason: historyReason,
      });
    } catch (dbError) {
      console.error('[Use Points API] DB 업데이트 실패:', dbError);
      return NextResponse.json(
        { error: '사용량 처리 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Use Points API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용량 차감 실패' },
      { status: 500 }
    );
  }
}
