/**
 * 오픈 베타 요금·가입 정책 (중앙 설정)
 *
 * 종료 시각 SSOT: app/lib/service-lifecycle.ts (OPEN_BETA_ENDS_AT)
 * — 2026-10-01T00:00:00+09:00 전까지 베타, 이후 정식(FREE 가입·FREE 취급).
 * User.plan BETA 행은 일괄 변경하지 않음. 기능·표시는 날짜로 판정.
 */

import {
  getOpenBetaEndsAt,
  isBeforeOpenBetaEnd,
} from '@/app/lib/service-lifecycle';

export type AppPlan = 'BETA' | 'FREE' | 'PRO' | 'YEARLY';

export const OPEN_BETA_POLICY = {
  /**
   * @deprecated 날짜 SSOT(isOpenBetaMode)를 사용하세요.
   * 하위 호환용 — 실제 판정은 getOpenBetaEndsAt() 기준.
   */
  BETA_MODE_ENABLED: true,

  /** 베타 기간 중 신규 가입 기본 플랜 */
  NEW_SIGNUP_PLAN: 'BETA' as AppPlan,

  /** 신규 가입 보너스 포인트 (가입 시 1회, 베타 기간) */
  BETA_SIGNUP_POINTS: 50_000,

  /** 베타 기간 BETA 회원 매월 지급 포인트 */
  BETA_MONTHLY_POINTS: 50_000,

  /** 정식 FREE 가입 보너스 */
  REGULAR_SIGNUP_POINTS: 5_000,

  /** 베타 중 FREE/BETA 엑셀 다운로드 포인트 차감 여부 (false = 무료) */
  BETA_DOWNLOAD_FREE_FOR_FREE_AND_BETA: true,

  /** 정식 FREE 다운로드 1회 기준 비용 */
  REGULAR_FREE_DOWNLOAD_COST: 1_000,

  /** 신규 유료 결제 허용 — 베타 기간에만 false. 종료 후 true로 동작 */
  NEW_PAID_CHECKOUT_ENABLED: false,

  NEW_PAID_CHECKOUT_BLOCK_MESSAGE:
    '현재 오픈 베타 기간으로 신규 유료 결제를 받고 있지 않습니다. 정식 요금제는 베타 종료 전에 별도로 안내해 드리겠습니다.',
} as const;

/** 오픈베타 기간인지 (날짜 SSOT, end-exclusive) */
export function isOpenBetaMode(now: Date = new Date()): boolean {
  return isBeforeOpenBetaEnd(now);
}

export function getOpenBetaEndsAtIso(): string {
  return getOpenBetaEndsAt().toISOString();
}

export function getNewSignupPlan(now: Date = new Date()): AppPlan {
  return isOpenBetaMode(now) ? OPEN_BETA_POLICY.NEW_SIGNUP_PLAN : 'FREE';
}

/**
 * DB plan을 기능·월간지급·표시용으로 정규화.
 * BETA + 베타 종료 후 → FREE (행은 그대로 두고 판정만).
 */
export function getEffectivePlanForPolicy(plan: string, now: Date = new Date()): AppPlan | string {
  if (plan === 'BETA' && !isOpenBetaMode(now)) {
    return 'FREE';
  }
  return plan;
}

/** 신규 가입 1회 보너스 포인트 */
export function getSignupBonusPoints(now: Date = new Date()): number {
  if (isOpenBetaMode(now) && OPEN_BETA_POLICY.NEW_SIGNUP_PLAN === 'BETA') {
    return OPEN_BETA_POLICY.BETA_SIGNUP_POINTS;
  }
  return OPEN_BETA_POLICY.REGULAR_SIGNUP_POINTS;
}

/** 월간 지급 대상·금액 (해당 없으면 null). mode=reset 이면 잔액 누적 없이 금액으로 맞춤 */
export function getMonthlyGrantForPlan(
  plan: string,
  now: Date = new Date(),
): { amount: number; reason: string; mode: 'increment' | 'reset' } | null {
  const effective = getEffectivePlanForPolicy(plan, now);
  if (effective === 'FREE') {
    return {
      amount: 5_000,
      reason: 'FREE플랜_월간사용량리셋지급',
      mode: 'reset',
    };
  }
  if (effective === 'BETA' && isOpenBetaMode(now)) {
    return {
      amount: OPEN_BETA_POLICY.BETA_MONTHLY_POINTS,
      reason: 'BETA플랜_월간사용량리셋지급',
      mode: 'reset',
    };
  }
  return null;
}

/**
 * 엑셀 다운로드에 포인트를 차감해야 하면 true.
 * 베타 중: BETA·FREE 도 차감 없음. PRO류·체험·이용권은 무제한.
 */
export function shouldChargeDownloadPointsForPlan(
  plan: string,
  hasProLikeEntitlement: boolean,
  now: Date = new Date(),
): boolean {
  if (hasProLikeEntitlement) return false;
  const effective = getEffectivePlanForPolicy(plan, now);
  if (
    isOpenBetaMode(now) &&
    OPEN_BETA_POLICY.BETA_DOWNLOAD_FREE_FOR_FREE_AND_BETA &&
    (effective === 'FREE' || effective === 'BETA')
  ) {
    return false;
  }
  return true;
}

/** 신규 유료 결제 시작이 막혀 있으면 true */
export function isNewPaidCheckoutDisabled(now: Date = new Date()): boolean {
  return isOpenBetaMode(now) && !OPEN_BETA_POLICY.NEW_PAID_CHECKOUT_ENABLED;
}

/**
 * 유료 결제 시작 허용 여부.
 * 베타 중에는 이미 PRO/YEARLY 인 회원의 재결제·플랜변경만 허용.
 */
export function canStartPaidCheckout(userPlan: string, now: Date = new Date()): boolean {
  if (!isNewPaidCheckoutDisabled(now)) return true;
  return userPlan === 'PRO' || userPlan === 'YEARLY';
}

export function getNewPaidCheckoutBlockMessage(): string {
  return OPEN_BETA_POLICY.NEW_PAID_CHECKOUT_BLOCK_MESSAGE;
}
