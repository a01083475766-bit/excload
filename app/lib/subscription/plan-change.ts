/**
 * 구독 플랜 변경(다음 결제일 적용) 공통 로직
 */

export type PaidDbPlan = 'PRO' | 'YEARLY';
export type PlanIntervalKey = 'monthly' | 'yearly';

export const PLAN_AMOUNTS: Record<PaidDbPlan, number> = {
  PRO: 4000,
  YEARLY: 40000,
};

export const PLAN_ORDER_NAMES: Record<PaidDbPlan, string> = {
  PRO: 'EXCLOAD PRO 구독',
  YEARLY: 'EXCLOAD YEARLY 구독',
};

export function intervalKeyToDbPlan(key: PlanIntervalKey): PaidDbPlan {
  return key === 'yearly' ? 'YEARLY' : 'PRO';
}

export function dbPlanToIntervalKey(plan: string): PlanIntervalKey | null {
  if (plan === 'PRO') return 'monthly';
  if (plan === 'YEARLY') return 'yearly';
  return null;
}

export function isPaidDbPlan(plan: string): plan is PaidDbPlan {
  return plan === 'PRO' || plan === 'YEARLY';
}

export function getPlanDisplayName(plan: string): string {
  switch (plan) {
    case 'PRO':
      return '프로(월간)';
    case 'YEARLY':
      return '연간';
    case 'FREE':
      return '무료';
    default:
      return plan;
  }
}

export function getPlanAmount(plan: PaidDbPlan): number {
  return PLAN_AMOUNTS[plan];
}

export function getPlanOrderName(plan: PaidDbPlan): string {
  return PLAN_ORDER_NAMES[plan];
}

/** 결제 주기만큼 다음 결제 예정일 계산 */
export function addBillingPeriod(from: Date, plan: PaidDbPlan): Date {
  const d = new Date(from);
  if (plan === 'YEARLY') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

export function formatPlanChangeDate(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function resolveEffectivePlanAtRenewal(
  currentPlan: PaidDbPlan,
  pendingPlan: string | null | undefined,
  pendingPlanApplyAt: Date | null | undefined,
  asOf: Date = new Date()
): { chargePlan: PaidDbPlan; nextUserPlan: PaidDbPlan; clearPending: boolean } {
  if (
    pendingPlan &&
    isPaidDbPlan(pendingPlan) &&
    pendingPlanApplyAt &&
    pendingPlanApplyAt.getTime() <= asOf.getTime()
  ) {
    return {
      chargePlan: pendingPlan,
      nextUserPlan: pendingPlan,
      clearPending: true,
    };
  }
  return {
    chargePlan: currentPlan,
    nextUserPlan: currentPlan,
    clearPending: false,
  };
}
