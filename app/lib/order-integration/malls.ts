export type OrderIntegrationMallId =
  | 'coupang'
  | 'eleven'
  | 'smartstore'
  | 'cafe24'
  | 'gmarket'
  | 'sabangnet';

export type OrderIntegrationMallStatus = 'available' | 'preparing';

export type OrderIntegrationMall = {
  id: OrderIntegrationMallId;
  name: string;
  description: string;
  status: OrderIntegrationMallStatus;
  priority?: number;
};

export const ORDER_INTEGRATION_MALLS: OrderIntegrationMall[] = [
  {
    id: 'coupang',
    name: '쿠팡',
    description: '쿠팡 Wing Open API로 주문을 자동 수집합니다.',
    status: 'available',
    priority: 1,
  },
  {
    id: 'eleven',
    name: '11번가',
    description: '11ST OPEN API로 주문을 자동 수집합니다.',
    status: 'available',
    priority: 2,
  },
  {
    id: 'smartstore',
    name: '스마트스토어',
    description: '네이버 커머스API(Smart Store Center)로 주문을 조회·수집합니다. (베타)',
    status: 'available',
    priority: 3,
  },
  {
    id: 'cafe24',
    name: '카페24',
    description: '카페24 API 연동을 준비 중입니다.',
    status: 'preparing',
  },
  {
    id: 'gmarket',
    name: 'G마켓/옥션',
    description: 'G마켓·옥션 API 연동을 준비 중입니다.',
    status: 'preparing',
  },
  {
    id: 'sabangnet',
    name: '사방넷',
    description: '사방넷 API 연동을 준비 중입니다.',
    status: 'preparing',
  },
];

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
