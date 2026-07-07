/**
 * NHN커머스/고도몰5 Open API SSOT (1차: 주문 조회)
 * @see https://devcenter.godo.co.kr/godomall5/openapi/specDownload
 */

export const GODOMALL_OPENHUB_ORIGIN = 'https://openhub.godo.co.kr';

export const GODOMALL_ORDER_SEARCH_PATH = '/godomall5/order/Order_Search.php';

export const GODOMALL_ORDER_SEARCH_URL = `${GODOMALL_OPENHUB_ORIGIN}${GODOMALL_ORDER_SEARCH_PATH}`;

/** 1차 주문 수집 대상 — 취소·실패·클레임 제외, 조회 중심 */
export const GODOMALL_DEFAULT_ORDER_STATUSES = [
  'p1',
  'g1',
  'g2',
  'g3',
  'g4',
  'd1',
  'd2',
] as const;

export type GodomallOrderStatusCode = (typeof GODOMALL_DEFAULT_ORDER_STATUSES)[number];

export const GODOMALL_DEFAULT_PAGE_SIZE = 50;

export const GODOMALL_IP_WHITELIST_ERROR_CODE = '996';

export const EXCLOAD_GODOMALL_OUTBOUND_IP = '54.180.45.46';

export const GODOMALL_ORDER_SEARCH_SPEC = {
  method: 'POST' as const,
  contentType: 'application/xml; charset=UTF-8',
  dateType: 'order',
  responseCodeKey: 'code',
  responseMessageKey: 'msg',
  responseLastOrderKey: 'lastOrder',
  successCode: '000',
} as const;
