/** Browser-safe Cafe24 OAuth values shared by client and server code. */
export const CAFE24_OAUTH_REDIRECT_URI =
  'https://www.excload.com/api/order/integration/cafe24/callback';

/** 주문조회·송장등록·배송사조회에 필요한 scope (공백 구분, authorize URL용). */
export const CAFE24_OAUTH_SCOPES = 'mall.read_order mall.write_order mall.read_shipping';

export const CAFE24_REQUIRED_SCOPES = [
  'mall.read_order',
  'mall.write_order',
  'mall.read_shipping',
] as const;

/** 송장번호 최대 길이 (Cafe24 Admin API). */
export const CAFE24_TRACKING_NO_MAX_LENGTH = 40;
