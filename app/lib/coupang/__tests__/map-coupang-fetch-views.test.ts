import { describe, expect, it } from 'vitest';

import {
  mapCoupangOrdersToFetchViews,
  normalizeCoupangPlaceOrderStatus,
} from '@/app/lib/coupang/map-coupang-orders';
import type { CoupangOrderSheet } from '@/app/lib/coupang/client';

describe('mapCoupangOrdersToFetchViews', () => {
  it('maps ACCEPT to 발주 미확인 and blocks hub until INSTRUCT', () => {
    const views = mapCoupangOrdersToFetchViews([
      {
        shipmentBoxId: '123456789012345678',
        orderId: '999',
        status: 'ACCEPT',
        orderItems: [{ vendorItemId: '111', sellerProductName: '상품', shippingCount: 1 }],
      },
    ]);

    expect(views[0]?.placeOrderStatus).toBe('NOT_YET');
    expect(views[0]?.mallOrderStatusCode).toBe('ACCEPT');
    expect(views[0]?.hubEligible).toBe(false);
    expect(views[0]?.shipmentBoxId).toBe('123456789012345678');
  });

  it('maps INSTRUCT to 발주 확인·발송 대기 and allows hub', () => {
    const views = mapCoupangOrdersToFetchViews([
      {
        shipmentBoxId: '123',
        orderId: '999',
        status: 'INSTRUCT',
        orderItems: [{ vendorItemId: '111', sellerProductName: '상품', shippingCount: 1 }],
      },
    ]);

    expect(normalizeCoupangPlaceOrderStatus('INSTRUCT')).toBe('OK');
    expect(views[0]?.placeOrderStatus).toBe('OK');
    expect(views[0]?.hubEligible).toBe(true);
  });

  it('does not classify DEPARTURE as 발송 대기', () => {
    const views = mapCoupangOrdersToFetchViews([
      {
        shipmentBoxId: '123',
        orderId: '999',
        status: 'DEPARTURE',
        orderItems: [{ sellerProductName: '상품', shippingCount: 1 }],
      } satisfies CoupangOrderSheet,
    ]);

    expect(views[0]?.placeOrderStatus).toBe('UNKNOWN');
    expect(views[0]?.hubEligible).toBe(false);
    expect(views[0]?.status).toBe('DELIVERING');
  });
});
