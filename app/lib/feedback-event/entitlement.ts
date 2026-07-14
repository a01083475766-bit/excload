import { prisma } from '@/app/lib/prisma';
import { isAdminTrialActive } from '@/app/lib/admin-pro-trial';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';

export type UserEntitlementFields = {
  plan: string;
  feedbackTrialEndsAt: Date | null;
  adminTrialEndsAt?: Date | null;
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
