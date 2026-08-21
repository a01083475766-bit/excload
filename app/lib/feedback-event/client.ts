import type { Plan } from '@/app/store/userStore';
import { shouldChargeDownloadPointsForPlan } from '@/app/lib/open-beta-policy';

export function hasProEntitlementClient(
  plan: Plan | string,
  feedbackTrialEndsAt?: string | null,
  adminTrialEndsAt?: string | null,
  hasActiveVoucher?: boolean,
): boolean {
  if (plan === 'PRO' || plan === 'YEARLY') return true;
  if (feedbackTrialEndsAt && new Date(feedbackTrialEndsAt).getTime() > Date.now()) return true;
  if (adminTrialEndsAt && new Date(adminTrialEndsAt).getTime() > Date.now()) return true;
  if (hasActiveVoucher) return true;
  return false;
}

export function shouldChargeDownloadPoints(
  plan: Plan | string,
  feedbackTrialEndsAt?: string | null,
  adminTrialEndsAt?: string | null,
  hasActiveVoucher?: boolean,
): boolean {
  const hasPro = hasProEntitlementClient(
    plan,
    feedbackTrialEndsAt,
    adminTrialEndsAt,
    hasActiveVoucher,
  );
  return shouldChargeDownloadPointsForPlan(plan, hasPro);
}
