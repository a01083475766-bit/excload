import { addOneMonthKeepingDay } from '@/app/lib/add-one-month-keeping-day';
import { prisma } from '@/app/lib/prisma';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';

export const ADMIN_PRO_TRIAL_MIN_MONTHS = 1;
export const ADMIN_PRO_TRIAL_MAX_MONTHS = 24;

export function isAdminTrialActive(endsAt: Date | null | undefined, now = new Date()): boolean {
  if (!endsAt) return false;
  return endsAt.getTime() > now.getTime();
}

export function addMonthsKeepingDay(baseDate: Date, months: number): Date {
  let result = new Date(baseDate);
  for (let i = 0; i < months; i++) {
    result = addOneMonthKeepingDay(result);
  }
  return result;
}

export function computeAdminTrialEndsAt(
  currentEndsAt: Date | null | undefined,
  months: number,
  now = new Date(),
): Date {
  const base =
    currentEndsAt && currentEndsAt.getTime() > now.getTime() ? currentEndsAt : now;
  return addMonthsKeepingDay(base, months);
}

export async function expireAdminTrialIfNeeded(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { adminTrialEndsAt: true },
  });
  if (!user?.adminTrialEndsAt) return;
  if (isAdminTrialActive(user.adminTrialEndsAt)) return;

  await prisma.user.update({
    where: { id: userId },
    data: { adminTrialEndsAt: null },
  });
}

export async function grantAdminProTrialMonths(
  userId: string,
  months: number,
): Promise<{ endsAt: Date }> {
  if (
    !Number.isInteger(months) ||
    months < ADMIN_PRO_TRIAL_MIN_MONTHS ||
    months > ADMIN_PRO_TRIAL_MAX_MONTHS
  ) {
    throw new Error(
      `개월 수는 ${ADMIN_PRO_TRIAL_MIN_MONTHS}~${ADMIN_PRO_TRIAL_MAX_MONTHS} 사이의 정수여야 합니다.`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, adminTrialEndsAt: true },
  });

  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  if (isPaidDbPlan(user.plan)) {
    throw new Error('유료 PRO/YEARLY 회원에는 관리자 PRO 혜택을 부여할 수 없습니다.');
  }

  const endsAt = computeAdminTrialEndsAt(user.adminTrialEndsAt, months);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { adminTrialEndsAt: endsAt },
    });
    await tx.pointHistory.create({
      data: {
        userId,
        change: 0,
        reason: `ADMIN_PRO_TRIAL_${months}M`,
      },
    });
  });

  return { endsAt };
}

export async function revokeAdminProTrial(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { adminTrialEndsAt: true },
  });

  if (!user?.adminTrialEndsAt || !isAdminTrialActive(user.adminTrialEndsAt)) {
    throw new Error('취소할 관리자 PRO 혜택이 없습니다.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { adminTrialEndsAt: null },
    });
    await tx.pointHistory.create({
      data: {
        userId,
        change: 0,
        reason: 'ADMIN_PRO_TRIAL_REVOKE',
      },
    });
  });
}
