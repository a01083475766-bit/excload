import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from '@/app/lib/order-integration/encryption';
import { buildCoupangAuthorizationHeader } from '@/app/lib/coupang/hmac';
import { maskIntegrationSecret } from '@/app/lib/order-integration/mask-secret';
import { mapCoupangOrdersToPreviewRows } from '@/app/lib/coupang/map-coupang-orders';
import {
  signProxyRequest,
  verifyProxyRequest,
} from '@/app/lib/coupang/proxy-signing';
import {
  getCoupangTransportInfo,
  resolveCoupangTransportMode,
} from '@/app/lib/coupang/transport/config';
import {
  resetCoupangTransportCacheForTests,
  resolveCoupangTransport,
} from '@/app/lib/coupang/transport/resolve-transport';

const ENV_KEYS = [
  'COUPANG_PROXY_BASE_URL',
  'COUPANG_PROXY_SHARED_SECRET',
  'COUPANG_PROXY_KEY_ID',
  'EXCLOAD_INTEGRATION_ENCRYPTION_KEY',
] as const;

function clearTransportEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  resetCoupangTransportCacheForTests();
}

afterEach(() => {
  clearTransportEnv();
});

describe('integration encryption', () => {
  it('encrypts and decrypts secrets round-trip', () => {
    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptIntegrationSecret('test-secret-key');
    const decrypted = decryptIntegrationSecret(encrypted);
    expect(decrypted).toBe('test-secret-key');
  });
});

describe('maskIntegrationSecret', () => {
  it('masks all but last 4 characters', () => {
    expect(maskIntegrationSecret('abcdefgh')).toBe('****efgh');
  });
});

describe('buildCoupangAuthorizationHeader', () => {
  it('builds CEA authorization header', () => {
    const { authorization, signedDate } = buildCoupangAuthorizationHeader({
      method: 'GET',
      pathWithQuery: '/v2/providers/openapi/apis/api/v5/vendors/A00012345/ordersheets?status=ACCEPT',
      accessKey: 'access-key',
      secretKey: 'secret-key',
      signedDate: '250709T120000Z',
    });

    expect(signedDate).toBe('250709T120000Z');
    expect(authorization).toContain('CEA algorithm=HmacSHA256');
    expect(authorization).toContain('access-key=access-key');
    expect(authorization).toContain('signed-date=250709T120000Z');
    expect(authorization).toMatch(/signature=[a-f0-9]{64}/);
  });
});

describe('proxy signing', () => {
  it('signs and verifies proxy invoke requests', () => {
    const body = JSON.stringify({ method: 'GET', pathWithQuery: '/test' });
    const secret = 'proxy-shared-secret';
    const { timestamp, signature } = signProxyRequest({
      method: 'POST',
      path: '/internal/coupang/invoke',
      body,
      secret,
      timestamp: '2026-07-06T10:00:00.000Z',
    });

    expect(
      verifyProxyRequest({
        method: 'POST',
        path: '/internal/coupang/invoke',
        body,
        secret,
        timestamp,
        signature,
        now: new Date('2026-07-06T10:01:00.000Z'),
      }),
    ).toBe(true);
  });
});

describe('coupang transport mode', () => {
  it('defaults to direct when proxy env is missing', () => {
    clearTransportEnv();
    expect(resolveCoupangTransportMode()).toBe('direct');
    expect(getCoupangTransportInfo().mode).toBe('direct');
    expect(resolveCoupangTransport().mode).toBe('direct');
  });

  it('uses proxy when base url and secret are both set', () => {
    clearTransportEnv();
    process.env.COUPANG_PROXY_BASE_URL = 'https://proxy.example.com';
    process.env.COUPANG_PROXY_SHARED_SECRET = 'secret';
    resetCoupangTransportCacheForTests();

    expect(resolveCoupangTransportMode()).toBe('proxy');
    expect(getCoupangTransportInfo().proxyConfigured).toBe(true);
    expect(resolveCoupangTransport().mode).toBe('proxy');
  });

  it('stays direct when only base url is set without secret', () => {
    clearTransportEnv();
    process.env.COUPANG_PROXY_BASE_URL = 'https://proxy.example.com';
    expect(resolveCoupangTransportMode()).toBe('direct');
  });
});

describe('mapCoupangOrdersToPreviewRows', () => {
  it('maps coupang order sheet to preview rows', () => {
    const rows = mapCoupangOrdersToPreviewRows([
      {
        shipmentBoxId: '123',
        orderId: '456',
        status: 'INSTRUCT',
        paidAt: '2025-01-15T14:17:13+09:00',
        parcelPrintMessage: '문 앞',
        receiver: {
          name: '홍길동',
          receiverNumber: '01012345678',
          addr1: '서울시',
          addr2: '101호',
        },
        orderItems: [
          {
            sellerProductName: '테스트상품',
            shippingCount: 2,
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.['주문번호']).toBe('456');
    expect(rows[0]?.['받는사람']).toBe('홍길동');
    expect(rows[0]?.['상품명']).toBe('테스트상품');
    expect(rows[0]?.['수량']).toBe('2');
    expect(rows[0]?.['주문상태']).toBe('상품준비중');
  });
});
