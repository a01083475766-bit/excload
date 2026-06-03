import type { Plan } from '@/app/store/userStore';

export function hasProEntitlementClient(
  plan: Plan | string,
  feedbackTrialEndsAt?: string | null,
): boolean {
  if (plan === 'PRO' || plan === 'YEARLY') return true;
  if (!feedbackTrialEndsAt) return false;
  return new Date(feedbackTrialEndsAt).getTime() > Date.now();
}

export function shouldChargeDownloadPoints(
  plan: Plan | string,
  feedbackTrialEndsAt?: string | null,
): boolean {
  return !hasProEntitlementClient(plan, feedbackTrialEndsAt);
}
