import { prisma } from '@/app/lib/prisma';
import { addOneMonthKeepingDay } from '@/app/lib/add-one-month-keeping-day';
import { isMonthlyFreeGrantBlocked } from '@/app/lib/free-benefit-fingerprint';
import { isFeedbackTrialActive } from '@/app/lib/feedback-event/entitlement';
import { isAdminTrialActive } from '@/app/lib/admin-pro-trial';
import { getMonthlyGrantForPlan } from '@/app/lib/open-beta-policy';

/** @deprecated FREE 월간 금액 — getMonthlyGrantForPlan('FREE') 사용 */
export const MONTHLY_FREE_GRANT_AMOUNT = 5000;
export const MONTHLY_FREE_GRANT_REASON = 'FREE플랜_월간사용량리셋지급';

export type MonthlyGrantEligibleUser = {
  id: string;
  email: string;
  phone: string | null;
  deviceId: string | null;
  plan: string;
  points: number;
  nextPointDate: Date | null;
  createdAt: Date;
  feedbackTrialEndsAt: Date | null;
  adminTrialEndsAt: Date | null;
};

export type MonthlyGrantResult =
  | {
      status: 'granted';
      grantedAmount: number;
      user: {
        id: string;
        email: string;
        plan: string;
        points: number;
        nextPointDate: Date | null;
      };
    }
  | {
      status: 'already_granted' | 'not_due' | 'not_eligible';
      user: {
        id: string;
        email: string;
        plan: string;
        points: number;
        nextPointDate: Date | null;
      };
      reason?: string;
    };

export function isMonthlyGrantDue(
  user: { nextPointDate: Date | null },
  now = new Date(),
): boolean {
  return !user.nextPointDate || user.nextPointDate.getTime() <= now.getTime();
}

export async function getMonthlyGrantIneligibilityReason(
  user: MonthlyGrantEligibleUser,
  now = new Date(),
): Promise<string | null> {
  const grant = getMonthlyGrantForPlan(user.plan);
  if (!grant) {
    return '월간 사용량 제공 대상 플랜이 아닙니다.';
  }
  if (isFeedbackTrialActive(user.feedbackTrialEndsAt, now)) {
    return '베타 피드백 PRO 체험 중에는 무료 월간 사용량이 제공되지 않습니다.';
  }
  if (isAdminTrialActive(user.adminTrialEndsAt, now)) {
    return '관리자 PRO 혜택 이용 중에는 무료 월간 사용량이 제공되지 않습니다.';
  }
  const monthlyBlocked = await isMonthlyFreeGrantBlocked({
    email: user.email,
    phone: user.phone,
    deviceId: user.deviceId,
  });
  if (monthlyBlocked) {
    return '탈퇴 후 재가입 계정은 무료 월간 사용량 제공 대상이 아닙니다.';
  }
  if (!isMonthlyGrantDue(user, now)) {
    return '월간 지급일이 아직 도래하지 않았습니다.';
  }
  return null;
}

/** FREE/BETA 월간 지급 시도. updateMany 조건으로 중복 지급 방지. */
export async function tryGrantMonthlyFreePoints(
  user: MonthlyGrantEligibleUser,
  now = new Date(),
): Promise<MonthlyGrantResult> {
  const grant = getMonthlyGrantForPlan(user.plan);
  const ineligible = await getMonthlyGrantIneligibilityReason(user, now);
  if (!grant || ineligible) {
    return {
      status: ineligible?.includes('지급일') ? 'not_due' : 'not_eligible',
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        points: user.points,
        nextPointDate: user.nextPointDate,
      },
      reason: ineligible ?? '월간 사용량 제공 대상 플랜이 아닙니다.',
    };
  }

  const dueDate = user.nextPointDate ?? addOneMonthKeepingDay(user.createdAt);
  const nextPoints =
    grant.mode === 'reset' ? grant.amount : user.points + grant.amount;
  const historyChange = nextPoints - user.points;

  const txResult = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.user.updateMany({
      where: {
        id: user.id,
        plan: user.plan,
        OR: [{ nextPointDate: null }, { nextPointDate: { lte: now } }],
      },
      data: {
        points: nextPoints,
        nextPointDate: addOneMonthKeepingDay(dueDate),
      },
    });

    if (updateResult.count === 0) {
      return { granted: false as const };
    }

    if (historyChange !== 0) {
      await tx.pointHistory.create({
        data: {
          userId: user.id,
          change: historyChange,
          reason: grant.reason,
        },
      });
    }

    const updated = await tx.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
        nextPointDate: true,
      },
    });
    return { granted: true as const, updatedUser: updated, amount: grant.amount };
  });

  if (!txResult.granted) {
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
        nextPointDate: true,
      },
    });

    if (!fresh) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    return {
      status: 'already_granted',
      user: fresh,
    };
  }

  const { updatedUser, amount } = txResult;
  if (!updatedUser) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  return {
    status: 'granted',
    grantedAmount: amount,
    user: updatedUser,
  };
}
