import { prisma } from '@/app/lib/prisma';
import { hasProAccessFromParts } from '@/app/lib/entitlement/effective-access';

export type UserEntitlementFields = {
  plan: string;
  feedbackTrialEndsAt: Date | null;
  adminTrialEndsAt?: Date | null;
  hasActiveVoucher?: boolean;
};

export function isFeedbackTrialActive(endsAt: Date | null | undefined, now = new Date()): boolean {
  if (!endsAt) return false;
  return endsAt.getTime() > now.getTime();
}

/**
 * 동기 판정. Voucher는 hasActiveVoucher 또는 getEffectiveUserAccess 사용.
 */
export function hasProEntitlement(user: UserEntitlementFields, now = new Date()): boolean {
  return hasProAccessFromParts({
    plan: user.plan,
    feedbackTrialEndsAt: user.feedbackTrialEndsAt,
    adminTrialEndsAt: user.adminTrialEndsAt,
    hasActiveVoucher: user.hasActiveVoucher,
    now,
  });
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
