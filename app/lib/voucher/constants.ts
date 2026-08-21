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

/** 외부에 노출하는 공통 오류 (세부 상태 비공개) */
export const REDEEM_GENERIC_ERROR = '이용권 코드를 확인할 수 없습니다.';

export const REDEEM_RATE_LIMIT_ERROR = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
