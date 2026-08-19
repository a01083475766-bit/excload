export type OrderIntegrationMallId =
  | 'coupang'
  | 'eleven'
  | 'smartstore'
  | 'cafe24'
  | 'lotteon'
  | 'ssg'
  | 'cjonstyle'
  | 'shopby'
  | 'godomall'
  | 'makeshop'
  | 'domeggook'
  | 'gmarket';

export type OrderIntegrationMallStatus = 'available' | 'preparing';

export type OrderIntegrationMallBadge = 'live' | 'beta' | 'planned' | 'dev';

export type OrderIntegrationMall = {
  id: OrderIntegrationMallId;
  name: string;
  description: string;
  status: OrderIntegrationMallStatus;
  badge?: OrderIntegrationMallBadge;
  /** status=preparing 일 때 배지 문구 (기본: 준비중) */
  preparingLabel?: string;
  priority?: number;
};

/**
 * 연동 설정·주문조회에 노출하는 몰 목록.
 * - available: 선택·설정 가능 (실계정 확인된 몰)
 * - preparing: (내부 보류) UI 목록에는 포함하지 않음
 * 순서는 priority(작을수록 앞).
 */
export const ORDER_INTEGRATION_MALLS: OrderIntegrationMall[] = [
  {
    id: 'smartstore',
    name: '스마트스토어',
    description: '네이버 커머스API(Smart Store Center)로 주문을 조회·수집합니다. (베타)',
    status: 'available',
    badge: 'beta',
    priority: 1,
  },
  {
    id: 'coupang',
    name: '쿠팡',
    description: '쿠팡 Wing Open API로 주문을 자동 수집합니다.',
    status: 'available',
    badge: 'live',
    priority: 2,
  },
  {
    id: 'eleven',
    name: '11번가',
    description: '11ST OPEN API로 결제완료·배송준비 주문을 조회·수집합니다. (베타)',
    status: 'available',
    badge: 'beta',
    priority: 3,
  },
  {
    id: 'lotteon',
    name: '롯데ON',
    description: '롯데ON OpenAPI로 출고지시·상품준비 주문을 조회·수집합니다. (베타)',
    status: 'available',
    badge: 'beta',
    priority: 4,
  },
  {
    id: 'cafe24',
    name: '카페24',
    description: '카페24 OAuth Admin API로 주문을 조회·수집합니다. (베타)',
    status: 'available',
    badge: 'beta',
    priority: 5,
  },
  {
    id: 'domeggook',
    name: '도매꾹',
    description: '도매꾹 Open API로 판매 주문 조회·발주확인·송장 전송을 지원합니다. (베타)',
    status: 'available',
    badge: 'beta',
    priority: 6,
  },
  {
    id: 'shopby',
    name: '샵바이',
    description: '판매자 개인 systemKey·mallKey로 주문을 조회·수집합니다. (개발진행중)',
    status: 'available',
    badge: 'dev',
    priority: 7,
  },
];

/** UI·랜딩 등 사용자-facing 영역에 노출할 몰 이름 (ORDER_INTEGRATION_MALLS 순서) */
export function getVisibleIntegrationMallNames(): string[] {
  return ORDER_INTEGRATION_MALLS.map((mall) => mall.name);
}

export function getOrderIntegrationMall(id: string): OrderIntegrationMall | undefined {
  return ORDER_INTEGRATION_MALLS.find((mall) => mall.id === id);
}

export const EXCLOAD_INTEGRATION_INFO = {
  companyName: '엑클로드',
  url: 'https://www.excload.com',
} as const;

export function getExcloadOutboundIp(): string {
  return process.env.NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP?.trim() || '';
}
