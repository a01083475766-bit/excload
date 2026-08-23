export const VOUCHER_SOURCE = 'VOUCHER' as const;

export const VOUCHER_STATUS = {
  ISSUED: 'ISSUED',
  REDEEMED: 'REDEEMED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export const ENTITLEMENT_LIFECYCLE = {
  WAITING_FOR_PAID_END: 'WAITING_FOR_PAID_END',
  WAITING_FOR_PRIOR_VOUCHER: 'WAITING_FOR_PRIOR_VOUCHER',
  READY: 'READY',
  REVOKED: 'REVOKED',
} as const;

export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

/** WADIZ_2026_01 리워드 코드 → 구매자 노출용 한글명 */
export const WADIZ_REWARD_DISPLAY_NAMES: Record<string, string> = {
  SUPER_EARLY_3M: '슈퍼 얼리버드 3개월 이용권',
  SUPER_EARLY_6M: '슈퍼 얼리버드 6개월 이용권',
  SUPER_EARLY_12M: '슈퍼 얼리버드 12개월 이용권',
  WADIZ_SPECIAL_12M: '와디즈 특별 12개월 이용권',
};

/**
 * 메일·화면용 리워드 표시명.
 * 알려진 rewardCode는 한글 고정, 그 외는 외부명(한글 CSV 등) → 코드 순.
 */
export function resolveVoucherRewardDisplayName(
  rewardCode: string,
  externalRewardName?: string | null,
): string {
  const mapped = WADIZ_REWARD_DISPLAY_NAMES[rewardCode];
  if (mapped) return mapped;
  const ext = externalRewardName?.trim();
  if (ext && ext !== rewardCode) return ext;
  return rewardCode;
}

/** 외부에 노출하는 공통 오류 (세부 상태 비공개) */
export const REDEEM_GENERIC_ERROR = '이용권 코드를 확인할 수 없습니다.';

export const REDEEM_RATE_LIMIT_ERROR = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
