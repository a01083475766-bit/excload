import type { Plan } from '@/app/store/userStore';

export function hasProEntitlementClient(
  plan: Plan | string,
  feedbackTrialEndsAt?: string | null,
  adminTrialEndsAt?: string | null,
): boolean {
  if (plan === 'PRO' || plan === 'YEARLY') return true;
  if (feedbackTrialEndsAt && new Date(feedbackTrialEndsAt).getTime() > Date.now()) return true;
  if (adminTrialEndsAt && new Date(adminTrialEndsAt).getTime() > Date.now()) return true;
  return false;
}

export function shouldChargeDownloadPoints(
  plan: Plan | string,
  feedbackTrialEndsAt?: string | null,
  adminTrialEndsAt?: string | null,
): boolean {
  return !hasProEntitlementClient(plan, feedbackTrialEndsAt, adminTrialEndsAt);
}
