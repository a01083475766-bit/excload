/**
 * 메이크샵 신규 APP API SSOT (1차: 주문 2.0 조회)
 * @see https://developer.makeshop.co.kr/docs/api/order/get-order-2
 */

export const MAKESHOP_CONNECT_ORIGIN = 'https://connect.makeshop.co.kr';

export const MAKESHOP_OAUTH_TOKEN_PATH = '/oauth/token';

export const MAKESHOP_OAUTH_TOKEN_URL = `${MAKESHOP_CONNECT_ORIGIN}${MAKESHOP_OAUTH_TOKEN_PATH}`;

export const MAKESHOP_ORDER_V2_PATH = '/api/v1/:shopId/order/2';

export const MAKESHOP_ORDER_DELIVERY_PATH = '/api/v1/:shopId/order_delivery';

export const MAKESHOP_MAX_QUERY_DAYS = 30;

export const MAKESHOP_DEFAULT_FETCH_DAYS = 7;

export const MAKESHOP_MAX_ROWS_PER_QUERY = 999;

export const MAKESHOP_TOKEN_EXPIRES_SECONDS = 300;

export const EXCLOAD_MAKESHOP_OUTBOUND_IP = '54.180.45.46';

export const MAKESHOP_OAUTH_SPEC = {
  method: 'POST' as const,
  grantType: 'client_credentials',
  contentType: 'application/x-www-form-urlencoded',
} as const;

export const MAKESHOP_ORDER_V2_SPEC = {
  method: 'GET' as const,
  dateParamStart: 'start_date',
  dateParamEnd: 'end_date',
  dateFormat: 'YYYY-MM-DD',
  successCode: 'OK',
} as const;
