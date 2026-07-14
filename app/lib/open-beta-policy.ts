/**
 * 오픈 베타 요금·가입 정책 (중앙 설정)
 *
 * 베타 종료 시 이 파일만 조정하면 정식 정책으로 복구한다.
 * - BETA_MODE_ENABLED → false
 * - NEW_SIGNUP_PLAN → 'FREE'
 * - BETA_SIGNUP_POINTS / BETA_MONTHLY_POINTS → 정식 정책
 * - NEW_PAID_CHECKOUT_ENABLED → true
 * - BETA_DOWNLOAD_FREE_FOR_FREE_AND_BETA → false
 */

export type AppPlan = 'BETA' | 'FREE' | 'PRO' | 'YEARLY';

export const OPEN_BETA_POLICY = {
  /** 오픈 베타 모드 */
  BETA_MODE_ENABLED: true,

  /** 신규 가입 기본 플랜 */
  NEW_SIGNUP_PLAN: 'BETA' as AppPlan,

  /** 신규 가입 보너스 포인트 (가입 시 1회) */
  BETA_SIGNUP_POINTS: 50_000,

  /** 베타 기간 BETA 회원 매월 지급 포인트 */
  BETA_MONTHLY_POINTS: 50_000,

  /** 정식 FREE 가입 보너스 (베타 종료 후 NEW_SIGNUP_PLAN=FREE 일 때) */
  REGULAR_SIGNUP_POINTS: 5_000,

  /** 베타 중 FREE/BETA 엑셀 다운로드 포인트 차감 여부 (false = 무료) */
  BETA_DOWNLOAD_FREE_FOR_FREE_AND_BETA: true,

  /** 정식 FREE 다운로드 1회 기준 비용 (문서·복구용, 실제 차감 로직은 호출부) */
  REGULAR_FREE_DOWNLOAD_COST: 1_000,

  /** 신규 유료 결제(Stripe Checkout · Toss 신규 구독) 허용 */
  NEW_PAID_CHECKOUT_ENABLED: false,

  /** UI/API 차단 안내 */
  NEW_PAID_CHECKOUT_BLOCK_MESSAGE:
    '현재 오픈 베타 기간으로 신규 유료 결제를 받고 있지 않습니다. 정식 요금제는 베타 종료 전에 별도로 안내해 드리겠습니다.',
} as const;

export function isOpenBetaMode(): boolean {
  return OPEN_BETA_POLICY.BETA_MODE_ENABLED;
}

export function getNewSignupPlan(): AppPlan {
  return isOpenBetaMode() ? OPEN_BETA_POLICY.NEW_SIGNUP_PLAN : 'FREE';
}

/** 신규 가입 1회 보너스 포인트 */
export function getSignupBonusPoints(): number {
  if (isOpenBetaMode() && OPEN_BETA_POLICY.NEW_SIGNUP_PLAN === 'BETA') {
    return OPEN_BETA_POLICY.BETA_SIGNUP_POINTS;
  }
  return OPEN_BETA_POLICY.REGULAR_SIGNUP_POINTS;
}

/** 월간 지급 대상·금액 (해당 없으면 null). mode=reset 이면 잔액 누적 없이 금액으로 맞춤 */
export function getMonthlyGrantForPlan(
  plan: string,
): { amount: number; reason: string; mode: 'increment' | 'reset' } | null {
  if (plan === 'FREE') {
    return {
      amount: 5_000,
      reason: 'FREE플랜_월간사용량리셋지급',
      mode: 'reset',
    };
  }
  if (plan === 'BETA' && isOpenBetaMode()) {
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
 * 베타 중: BETA·FREE 도 차감 없음. PRO/YEARLY·체험은 기존처럼 무제한.
 */
export function shouldChargeDownloadPointsForPlan(
  plan: string,
  hasProLikeEntitlement: boolean,
): boolean {
  if (hasProLikeEntitlement) return false;
  if (
    isOpenBetaMode() &&
    OPEN_BETA_POLICY.BETA_DOWNLOAD_FREE_FOR_FREE_AND_BETA &&
    (plan === 'FREE' || plan === 'BETA')
  ) {
    return false;
  }
  return true;
}

/** 신규 유료 결제 시작이 막혀 있으면 true */
export function isNewPaidCheckoutDisabled(): boolean {
  return isOpenBetaMode() && !OPEN_BETA_POLICY.NEW_PAID_CHECKOUT_ENABLED;
}

/**
 * 유료 결제 시작 허용 여부.
 * 베타 중에는 이미 PRO/YEARLY 인 회원의 재결제·플랜변경만 허용.
 */
export function canStartPaidCheckout(userPlan: string): boolean {
  if (!isNewPaidCheckoutDisabled()) return true;
  return userPlan === 'PRO' || userPlan === 'YEARLY';
}

export function getNewPaidCheckoutBlockMessage(): string {
  return OPEN_BETA_POLICY.NEW_PAID_CHECKOUT_BLOCK_MESSAGE;
}
