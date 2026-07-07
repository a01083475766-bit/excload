/**
 * CJ온스타일 표준 API 스펙 (placeholder)
 *
 * 공개 Docs(partners.cjonstyle.com)에는 Header(vendorCode, authenticationKey)만 확인 가능하고
 * 주문/배송 조회 Path·Query 명칭은 파트너 로그인 후 재확인 필요합니다.
 * 실연동 전 partners Docs 기준으로 이 파일만 교체하면 됩니다.
 */

export const CJONSTYLE_API_ORIGIN = 'https://api.cjonstyle.com';

/** 미입력 시 1차 수집 대상 배송타입 (연동 가이드 참고 — Docs에서 재확인) */
export const CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES = ['20', '30', '35', '40'] as const;

export type CjonstyleDeliveryMethodCode = (typeof CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES)[number];

/**
 * 주문 조회 API placeholder
 * - Method: 공식 가이드상 조회는 GET 위주
 * - Query 키 이름은 Docs 확인 후 변경
 */
export const CJONSTYLE_ORDER_SEARCH_SPEC = {
  path: '/standard/v1/order/delivery/search',
  method: 'GET' as const,
  queryKeys: {
    deliveryMethodCode: 'deliveryMethodCode',
    startDate: 'startDate',
    endDate: 'endDate',
  },
  headerKeys: {
    vendorCode: 'vendorCode',
    authenticationKey: 'authenticationKey',
  },
  responseListKeys: ['orders', 'orderList', 'data', 'orderDeliveryList'] as const,
  responseItemKeys: ['order', 'orderDelivery'] as const,
  successResultCodes: ['00', '0', 'SUCCESS', '200'] as const,
} as const;
