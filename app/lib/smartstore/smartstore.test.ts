import { describe, expect, it } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import { resolveIntegrationTransportMode } from '@/app/lib/integration-proxy/config';
import { generateSmartstoreClientSecretSign } from '@/app/lib/smartstore/client';
import {
  mapSmartstoreOrdersToFetchViews,
  mapSmartstoreOrdersToPreviewRows,
} from '@/app/lib/smartstore/map-smartstore-orders';
import { isShipmentTarget } from '@/app/lib/order-integration/order-status';

describe('integration proxy allowed domains', () => {
  it('allows registered mall upstream hosts', () => {
    expect(isIntegrationProxyHostAllowed('api-gateway.coupang.com')).toBe(true);
    expect(isIntegrationProxyHostAllowed('api.commerce.naver.com')).toBe(true);
    expect(isIntegrationProxyHostAllowed('api.11st.co.kr')).toBe(true);
    expect(isIntegrationProxyHostAllowed('example.com')).toBe(false);
  });

  it('allows http for 11st seller API host', () => {
    expect(() =>
      assertIntegrationProxyUrlAllowed('http://api.11st.co.kr/rest/ordservices/complete'),
    ).not.toThrow();
  });

  it('rejects http for https-only hosts', () => {
    expect(() =>
      assertIntegrationProxyUrlAllowed('http://api.commerce.naver.com/external/v1/oauth2/token'),
    ).toThrow(/프로토콜/);
  });
});

describe('integration transport mode', () => {
  it('uses INTEGRATION_PROXY env when set', () => {
    const prevBase = process.env.INTEGRATION_PROXY_BASE_URL;
    const prevSecret = process.env.INTEGRATION_PROXY_SHARED_SECRET;
    process.env.INTEGRATION_PROXY_BASE_URL = 'https://proxy.example.com';
    process.env.INTEGRATION_PROXY_SHARED_SECRET = 'secret';
    expect(resolveIntegrationTransportMode()).toBe('proxy');
    process.env.INTEGRATION_PROXY_BASE_URL = prevBase;
    process.env.INTEGRATION_PROXY_SHARED_SECRET = prevSecret;
  });
});

describe('smartstore client secret sign', () => {
  it('generates base64 bcrypt signature', () => {
    const sign = generateSmartstoreClientSecretSign({
      clientId: 'aaaabbbbcccc',
      clientSecret: '$2a$10$abcdefghijklmnopqrstuv',
      timestamp: 1643961623299,
    });
    expect(sign.length).toBeGreaterThan(20);
  });
});

describe('mapSmartstoreOrdersToPreviewRows', () => {
  it('maps smartstore order detail to preview rows', () => {
    const rows = mapSmartstoreOrdersToPreviewRows([
      {
        order: {
          orderId: 'ORD-1',
          paymentDate: '2026-07-01T10:00:00+09:00',
        },
        productOrder: {
          productOrderId: 'PO-1',
          productName: '테스트상품',
          productOrderStatus: 'PAYED',
          quantity: 2,
          shippingMemo: '문 앞',
          shippingAddress: {
            name: '홍길동',
            tel1: '010-1234-5678',
            baseAddress: '서울시',
            detailedAddress: '101호',
          },
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.['주문번호']).toBe('ORD-1');
    expect(rows[0]?.['상품주문번호']).toBe('PO-1');
    expect(rows[0]?.['받는사람']).toBe('홍길동');
    expect(rows[0]?.['주문상태']).toBe('결제완료');
  });
});

describe('수량 클레임 대응 매핑', () => {
  it('일반 주문(initial 3 / remain 3)의 처리 수량은 3', () => {
    const [view] = mapSmartstoreOrdersToFetchViews([
      {
        order: { orderId: 'ORD-1' },
        productOrder: {
          productOrderId: 'PO-1',
          productOrderStatus: 'PAYED',
          initialQuantity: 3,
          remainQuantity: 3,
        },
      },
    ]);
    expect(view?.quantity).toBe('3');
    expect(isShipmentTarget(view!)).toBe(true);
  });

  it('부분 취소(initial 3 / remain 2 / PAYED / CANCEL)는 전체 제외하지 않고 처리 수량 2', () => {
    const [view] = mapSmartstoreOrdersToFetchViews([
      {
        order: { orderId: 'ORD-2' },
        productOrder: {
          productOrderId: 'PO-2',
          productOrderStatus: 'PAYED',
          claimType: 'CANCEL',
          initialQuantity: 3,
          remainQuantity: 2,
        },
      },
    ]);
    expect(view?.quantity).toBe('2');
    expect(view?.initialQuantity).toBe(3);
    expect(isShipmentTarget(view!)).toBe(true);
  });

  it('전체 취소(remain 0)는 송장 처리 대상이 아니다', () => {
    const [view] = mapSmartstoreOrdersToFetchViews([
      {
        order: { orderId: 'ORD-3' },
        productOrder: {
          productOrderId: 'PO-3',
          productOrderStatus: 'PAYED',
          claimType: 'CANCEL',
          initialQuantity: 2,
          remainQuantity: 0,
        },
      },
    ]);
    expect(view?.quantity).toBe('0');
    expect(isShipmentTarget(view!)).toBe(false);
  });

  it('결제금액은 remainPaymentAmount를 우선 사용한다', () => {
    const [view] = mapSmartstoreOrdersToFetchViews([
      {
        order: { orderId: 'ORD-4', paymentMeans: '신용카드' },
        productOrder: {
          productOrderId: 'PO-4',
          productOrderStatus: 'PAYED',
          remainPaymentAmount: 20000,
          initialPaymentAmount: 30000,
          totalPaymentAmount: 30000,
        },
      },
    ]);
    expect(view?.paymentAmount).toBe('20000');
    expect(view?.paymentMeans).toBe('신용카드');
  });
});

describe('mapSmartstoreOrdersToFetchViews hasTracking', () => {
  it('sets hasTracking true when trackingNumber is present', () => {
    const [view] = mapSmartstoreOrdersToFetchViews([
      {
        order: { orderId: 'ORD-T1' },
        productOrder: { productOrderId: 'PO-T1', productOrderStatus: 'PURCHASE_DECIDED' },
        delivery: { trackingNumber: '123456789012', deliveryCompanyCode: 'CJGLS' },
      },
    ]);
    expect(view?.hasTracking).toBe(true);
    expect(JSON.stringify(view)).not.toContain('123456789012');
  });

  it('sets hasTracking false for missing / empty / whitespace trackingNumber', () => {
    const cases = [
      undefined,
      { trackingNumber: undefined, deliveryCompanyCode: 'CJGLS' },
      { trackingNumber: '', deliveryCompanyCode: 'CJGLS' },
      { trackingNumber: '   ', deliveryCompanyCode: 'CJGLS' },
      { deliveryCompanyCode: 'CJGLS' },
    ] as const;

    for (const delivery of cases) {
      const [view] = mapSmartstoreOrdersToFetchViews([
        {
          order: { orderId: 'ORD-T0' },
          productOrder: { productOrderId: 'PO-T0', productOrderStatus: 'DELIVERED' },
          ...(delivery ? { delivery } : {}),
        },
      ]);
      expect(view?.hasTracking).toBe(false);
    }
  });

  it('does not treat PURCHASE_DECIDED alone as hasTracking', () => {
    const [view] = mapSmartstoreOrdersToFetchViews([
      {
        order: { orderId: 'ORD-T2' },
        productOrder: { productOrderId: 'PO-T2', productOrderStatus: 'PURCHASE_DECIDED' },
      },
    ]);
    expect(view?.status).toBe('PURCHASE_DECIDED');
    expect(view?.hasTracking).toBe(false);
    expect(isShipmentTarget(view!)).toBe(false);
  });
});
