import { describe, expect, it } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import { resolveIntegrationTransportMode } from '@/app/lib/integration-proxy/config';
import { generateSmartstoreClientSecretSign } from '@/app/lib/smartstore/client';
import { mapSmartstoreOrdersToPreviewRows } from '@/app/lib/smartstore/map-smartstore-orders';

describe('integration proxy allowed domains', () => {
  it('allows official coupang and naver commerce hosts', () => {
    expect(isIntegrationProxyHostAllowed('api-gateway.coupang.com')).toBe(true);
    expect(isIntegrationProxyHostAllowed('api.commerce.naver.com')).toBe(true);
    expect(isIntegrationProxyHostAllowed('example.com')).toBe(false);
  });

  it('rejects non-https urls', () => {
    expect(() =>
      assertIntegrationProxyUrlAllowed('http://api.commerce.naver.com/external/v1/oauth2/token'),
    ).toThrow(/HTTPS/);
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
