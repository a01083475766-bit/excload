import { describe, expect, it } from 'vitest';

import type { SmartstoreProductOrderDetail } from '@/app/lib/smartstore/client';
import { classifySmartstoreDispatchPreflight } from '@/app/lib/smartstore/smartstore-invoice';
import { parseTransmitDryRunBody } from '@/app/lib/order-integration/transmission/parse-transmit-dry-run-body';

describe('SMARTSTORE-C2c server does not trust client remainQuantity', () => {
  it('transmit body parser accepts only matchIds and ignores client remainQuantity', () => {
    const parsed = parseTransmitDryRunBody({
      matchIds: ['match-1'],
      remainQuantity: 99,
      retryFailed: true,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.body).toEqual({ matchIds: ['match-1'], retryFailed: true });
    expect(JSON.stringify(parsed.body)).not.toContain('remainQuantity');
  });

  it('C1 preflight uses live productOrder.remainQuantity and does not estimate 1', () => {
    const detail = {
      order: { orderId: 'ORD-1' },
      productOrder: {
        productOrderId: 'PO-1',
        productOrderStatus: 'PAYED',
        placeOrderStatus: 'OK',
      },
    } as SmartstoreProductOrderDetail;

    const decision = classifySmartstoreDispatchPreflight({
      detail,
      requestedProductOrderId: 'PO-1',
      expectedMallOrderNo: 'ORD-1',
      requestedTrackingNumber: '123456789012',
      requestedDeliveryCompanyCode: 'CJGLS',
    });
    expect(decision).toMatchObject({
      action: 'BLOCK',
      status: 'QUANTITY_UNCLEAR',
      errorCode: 'QUANTITY_UNCLEAR',
    });
  });
});
