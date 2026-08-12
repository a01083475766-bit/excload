import { describe, expect, it } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import {
  assertValidCafe24MallId,
  buildCafe24ApiOrigin,
  parseCafe24MallIdFromHostname,
} from '@/app/lib/cafe24/mall-id';
import { createCafe24OAuthState, verifyCafe24OAuthState } from '@/app/lib/cafe24/oauth-state';
import {
  isCafe24AccessTokenExpired,
  parseCafe24TokenSet,
  serializeCafe24TokenSet,
} from '@/app/lib/cafe24/client';
import { mapCafe24OrdersToPreviewRows } from '@/app/lib/cafe24/map-cafe24-orders';

describe('cafe24 mallId validation', () => {
  it('accepts safe mallId and builds api origin', () => {
    expect(assertValidCafe24MallId('YourMall_01')).toBe('yourmall_01');
    expect(buildCafe24ApiOrigin('yourmall')).toBe('https://yourmall.cafe24api.com');
  });

  it('rejects invalid mallId', () => {
    expect(() => assertValidCafe24MallId('bad mall')).toThrow(/mallId/);
  });
});

describe('integration proxy suffix — cafe24api.com', () => {
  it('allows valid mall subdomain', () => {
    expect(isIntegrationProxyHostAllowed('demo.cafe24api.com')).toBe(true);
    expect(() => assertIntegrationProxyUrlAllowed('https://demo.cafe24api.com/api/v2/admin/orders')).not.toThrow();
    expect(parseCafe24MallIdFromHostname('demo.cafe24api.com')).toBe('demo');
  });

  it('rejects bare cafe24api.com without mallId', () => {
    expect(isIntegrationProxyHostAllowed('cafe24api.com')).toBe(false);
  });

  it('rejects invalid mall subdomain labels', () => {
    expect(isIntegrationProxyHostAllowed('-bad.cafe24api.com')).toBe(false);
  });
});

describe('cafe24 oauth state', () => {
  it('creates and verifies signed state', () => {
    const prev = process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    const state = createCafe24OAuthState({
      userId: 'user-1',
      accountId: 'acc-1',
      mallId: 'demo',
    });

    const payload = verifyCafe24OAuthState(state);
    expect(payload?.userId).toBe('user-1');
    expect(payload?.accountId).toBe('acc-1');
    expect(payload?.mallId).toBe('demo');

    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = prev;
  });
});

describe('cafe24 token helpers', () => {
  it('serializes and parses token bundle', () => {
    const raw = serializeCafe24TokenSet({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: '2026-07-08T12:00:00.000',
      scopes: ['mall.read_order'],
    });
    const parsed = parseCafe24TokenSet(raw);
    expect(parsed.accessToken).toBe('access');
    expect(parsed.refreshToken).toBe('refresh');
  });

  it('detects expired access token', () => {
    expect(isCafe24AccessTokenExpired('2000-01-01T00:00:00.000')).toBe(true);
    expect(isCafe24AccessTokenExpired(new Date(Date.now() + 60 * 60 * 1000).toISOString())).toBe(false);
  });
});

describe('mapCafe24OrdersToPreviewRows', () => {
  it('maps cafe24 order with embed fields to preview rows', () => {
    const rows = mapCafe24OrdersToPreviewRows([
      {
        order_id: '20260708-0001',
        order_status: 'N20',
        payment_date: '2026-07-08T10:00:00+09:00',
        buyer: { name: '김구매', cellphone: '010-1111-2222' },
        receivers: [
          {
            name: '홍길동',
            cellphone: '010-1234-5678',
            address1: '서울시',
            address2: '101호',
            shipping_message: '문 앞',
          },
        ],
        items: [{ order_item_code: 'ITEM-1', product_name: '테스트상품', quantity: 2, option_value: '옵션A' }],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.['주문번호']).toBe('20260708-0001');
    expect(rows[0]?.['상품주문번호']).toBe('ITEM-1');
    expect(rows[0]?.['받는사람']).toBe('홍길동');
    expect(rows[0]?.['주문상태']).toBe('배송준비중');
  });
});

describe('mapCafe24Orders preserves status code', () => {
  it('stores N10 on 출고타입 for confirm eligibility', async () => {
    const { mapCafe24OrdersToStandardRows } = await import('@/app/lib/cafe24/map-cafe24-orders');
    const rows = mapCafe24OrdersToStandardRows([
      {
        shop_no: 1,
        order_id: '20260708-0002',
        order_status: 'N10',
        items: [{ order_item_code: 'ITEM-2', product_name: '상품' }],
      },
    ]);
    expect(rows[0]?.['출고타입']).toBe('N10');
    expect(rows[0]?.['센터코드']).toBe('1');
  });
});
