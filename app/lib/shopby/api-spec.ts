/**
 * NHN커머스/샵바이 Server API SSOT (1차: 주문 조회)
 * @see https://server-docs.shopby.co.kr/spec/order-server-public.yml
 */

export const SHOPBY_SERVER_API_ORIGIN = 'https://server-api.e-ncp.com';

export const SHOPBY_ORDERS_API_VERSION = '1.1';

export const SHOPBY_ORDERS_PATH = '/orders';

/** pageSize 최대 200 (공식 스펙) */
export const SHOPBY_DEFAULT_PAGE_SIZE = 200;

/** 1차 주문 수집 대상 상태 (조회 가능·출고 전후) */
export const SHOPBY_DEFAULT_ORDER_REQUEST_TYPES = [
  'PAY_DONE',
  'PRODUCT_PREPARE',
  'DELIVERY_PREPARE',
  'DELIVERY_ING',
  'DELIVERY_DONE',
] as const;

export type ShopbyOrderRequestType = (typeof SHOPBY_DEFAULT_ORDER_REQUEST_TYPES)[number];

export const SHOPBY_ORDER_SEARCH_SPEC = {
  method: 'GET' as const,
  path: SHOPBY_ORDERS_PATH,
  headerKeys: {
    version: 'Version',
    systemKey: 'systemKey',
    mallKey: 'mallKey',
  },
  queryKeys: {
    startYmd: 'startYmd',
    endYmd: 'endYmd',
    orderRequestTypes: 'orderRequestTypes',
    searchDateType: 'searchDateType',
    pageNumber: 'pageNumber',
    pageSize: 'pageSize',
  },
  /** v1.1 페이징 응답 */
  responseContentsKey: 'contents',
  responseTotalCountKey: 'totalCount',
} as const;
