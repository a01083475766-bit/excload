import { prisma } from '@/app/lib/prisma';
import { isAdminTrialActive } from '@/app/lib/admin-pro-trial';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';
import { FEEDBACK_TRIAL_DAYS, FEEDBACK_TRIAL_POINTS } from './constants';

export type UserEntitlementFields = {
  plan: string;
  feedbackTrialEndsAt: Date | null;
  adminTrialEndsAt?: Date | null;
  feedbackTrialUsed: boolean;
};

export function isFeedbackTrialActive(endsAt: Date | null | undefined, now = new Date()): boolean {
  if (!endsAt) return false;
  return endsAt.getTime() > now.getTime();
}

/** 유료 PRO/YEARLY 또는 피드백·관리자 PRO 체험 중 */
export function hasProEntitlement(user: UserEntitlementFields, now = new Date()): boolean {
  if (isPaidDbPlan(user.plan)) return true;
  if (isFeedbackTrialActive(user.feedbackTrialEndsAt, now)) return true;
  return isAdminTrialActive(user.adminTrialEndsAt, now);
}

export async function expireFeedbackTrialIfNeeded(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { feedbackTrialEndsAt: true, plan: true },
  });
  if (!user?.feedbackTrialEndsAt) return;
  if (isFeedbackTrialActive(user.feedbackTrialEndsAt)) return;

  await prisma.user.update({
    where: { id: userId },
    data: { feedbackTrialEndsAt: null },
  });
}

export function buildTrialSystemReply(endsAt: Date): string {
  const label = endsAt.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    `소중한 의견 감사합니다. 피드백이 접수되었고, 베타 피드백 PRO 체험이 시작되었습니다.\n\n` +
    `${label}까지 PRO 기능을 이용하실 수 있습니다. (계정당 1회) ` +
    `체험 종료 후 FREE 플랜으로 전환됩니다.`
  );
}

export async function grantFeedbackTrial(userId: string): Promise<{ endsAt: Date }> {
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + FEEDBACK_TRIAL_DAYS);

  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { points: true },
    });
    const pointsBefore = before?.points ?? 0;

    await tx.user.update({
      where: { id: userId },
      data: {
        feedbackTrialEndsAt: endsAt,
        feedbackTrialUsed: true,
        points: FEEDBACK_TRIAL_POINTS,
      },
    });
    await tx.pointHistory.create({
      data: {
        userId,
        change: FEEDBACK_TRIAL_POINTS - pointsBefore,
        reason: 'FEEDBACK_EVENT_TRIAL',
      },
    });
  });

  return { endsAt };
}
