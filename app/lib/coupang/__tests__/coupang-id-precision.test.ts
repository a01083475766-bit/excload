import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@/app/lib/coupang/transport/resolve-transport', () => ({
  resolveCoupangTransport: () => ({
    mode: 'direct' as const,
    invoke: mockInvoke,
  }),
  resetCoupangTransportCacheForTests: vi.fn(),
}));

import { CoupangApiError } from '@/app/lib/coupang/errors';
import { coupangApiRequest } from '@/app/lib/coupang/client';
import { parseCoupangJson } from '@/app/lib/coupang/coupang-json';
import {
  mapCoupangOrderItemToStandardRow,
  mapCoupangOrdersToStandardRows,
} from '@/app/lib/coupang/map-coupang-orders';
import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { extractCoupangShipmentBoxIds } from '@/app/lib/order-integration/transmission/verify-transmission-status';

const UNSAFE_BOX_ID = '123456789012345678';
const UNSAFE_ORDER_ID = '9876543210987';
const UNSAFE_VENDOR_ITEM_ID = '8765432109';

describe('parseCoupangJson', () => {
  it('preserves 18-digit shipmentBoxId as exact string from raw JSON', () => {
    const parsed = parseCoupangJson(
      `{"shipmentBoxId":${UNSAFE_BOX_ID},"orderId":${UNSAFE_ORDER_ID},"status":"INSTRUCT","orderItems":[{"vendorItemId":${UNSAFE_VENDOR_ITEM_ID},"shippingCount":2}]}`,
    ) as {
      shipmentBoxId: string;
      orderId: string;
      status: string;
      orderItems: Array<{ vendorItemId: string; shippingCount: number }>;
    };

    expect(parsed.shipmentBoxId).toBe(UNSAFE_BOX_ID);
    expect(parsed.orderId).toBe(UNSAFE_ORDER_ID);
    expect(parsed.orderItems[0]?.vendorItemId).toBe(UNSAFE_VENDOR_ITEM_ID);
    expect(parsed.orderItems[0]?.shippingCount).toBe(2);
    expect(parsed.status).toBe('INSTRUCT');
  });

  it('preserves small shipmentBoxId as string', () => {
    const parsed = parseCoupangJson('{"shipmentBoxId":123,"orderId":456}') as {
      shipmentBoxId: string;
      orderId: string;
    };
    expect(parsed.shipmentBoxId).toBe('123');
    expect(parsed.orderId).toBe('456');
  });

  it('keeps JSON string IDs as trimmed strings', () => {
    const parsed = parseCoupangJson(
      `{"shipmentBoxId":" ${UNSAFE_BOX_ID} ","orderId":"${UNSAFE_ORDER_ID}"}`,
    ) as { shipmentBoxId: string; orderId: string };
    expect(parsed.shipmentBoxId).toBe(UNSAFE_BOX_ID);
    expect(parsed.orderId).toBe(UNSAFE_ORDER_ID);
  });

  it('throws on invalid JSON like native parse', () => {
    expect(() => parseCoupangJson('{')).toThrow(SyntaxError);
  });
});

describe('coupang ID precision through standard rows and snapshots', () => {
  const rawJson = `{"code":200,"data":[{"shipmentBoxId":${UNSAFE_BOX_ID},"orderId":${UNSAFE_ORDER_ID},"status":"INSTRUCT","receiver":{"name":"테스트","addr1":"서울"},"orderItems":[{"vendorItemId":${UNSAFE_VENDOR_ITEM_ID},"sellerProductName":"상품","shippingCount":3}]}]}`;

  it('maps standard row fields without precision loss', () => {
    const envelope = parseCoupangJson(rawJson) as {
      data: Parameters<typeof mapCoupangOrdersToStandardRows>[0];
    };
    const [row] = mapCoupangOrdersToStandardRows(envelope.data);

    expect(row?.['묶음배송번호']).toBe(UNSAFE_BOX_ID);
    expect(row?.['주문번호']).toBe(UNSAFE_ORDER_ID);
    expect(row?.['옵션ID']).toBe(UNSAFE_VENDOR_ITEM_ID);
    expect(row?.['수량']).toBe('3');
  });

  it('stores exact strings in normalizedPayloadJson shipmentBoxIds and optionIds', () => {
    const envelope = parseCoupangJson(rawJson) as {
      data: Parameters<typeof mapCoupangOrdersToStandardRows>[0];
    };
    const rows = mapCoupangOrdersToStandardRows(envelope.data).map((row) => ({ ...row }));
    const [snapshot] = buildOrderSyncSnapshots({
      userId: 'user-a',
      provider: 'COUPANG',
      accountId: 'acc-1',
      batchId: 'batch-1',
      fetchedAt: '2026-07-09T00:00:00.000Z',
      rows,
    });

    expect(snapshot?.normalizedPayloadJson).toMatchObject({
      shipmentBoxIds: [UNSAFE_BOX_ID],
      optionIds: [UNSAFE_VENDOR_ITEM_ID],
    });
    expect(snapshot?.mallLineItemIds).toContain(`bundle:${UNSAFE_BOX_ID}`);
  });

  it('uses exact box id for verify lookup path', () => {
    const boxIds = extractCoupangShipmentBoxIds({
      id: 'attempt-1',
      userId: 'user-a',
      uploadBatchId: 'batch-1',
      provider: 'COUPANG',
      integrationAccountId: 'acc-1',
      status: 'SUCCESS',
      mallOrderNo: 'ORD-1',
      mallLineItemIdsJson: null,
      orderSyncOrder: {
        mallLineItemIds: [`bundle:${UNSAFE_BOX_ID}`],
        normalizedPayloadJson: { shipmentBoxIds: [UNSAFE_BOX_ID] },
      },
    });

    expect(boxIds).toEqual([UNSAFE_BOX_ID]);

    const pathSuffix = `/ordersheets/${encodeURIComponent(boxIds[0]!)}`;
    expect(pathSuffix).toBe(`/ordersheets/${UNSAFE_BOX_ID}`);
  });
});

describe('coupangApiRequest uses lossless parser', () => {
  afterEach(() => {
    mockInvoke.mockReset();
  });

  it('parses response via parseCoupangJson and preserves shipmentBoxId in path lookup input', async () => {
    mockInvoke.mockResolvedValue({
      httpStatus: 200,
      bodyText: `{"shipmentBoxId":${UNSAFE_BOX_ID},"orderId":${UNSAFE_ORDER_ID},"status":"INSTRUCT","orderItems":[{"vendorItemId":${UNSAFE_VENDOR_ITEM_ID},"shippingCount":1}]}`,
    });

    const sheet = await coupangApiRequest({
      method: 'GET',
      pathWithQuery: `/v2/providers/openapi/apis/api/v5/vendors/vendor-1/ordersheets/${encodeURIComponent(UNSAFE_BOX_ID)}`,
      vendorId: 'vendor-1',
      accessKey: 'access',
      secretKey: 'secret',
    });

    expect(mockInvoke.mock.calls[0]?.[0]?.pathWithQuery).toContain(UNSAFE_BOX_ID);
    expect(sheet).toMatchObject({
      shipmentBoxId: UNSAFE_BOX_ID,
      orderId: UNSAFE_ORDER_ID,
      orderItems: [{ vendorItemId: UNSAFE_VENDOR_ITEM_ID, shippingCount: 1 }],
    });
  });

  it('maps invalid JSON to CoupangApiError', async () => {
    mockInvoke.mockResolvedValue({ httpStatus: 200, bodyText: '{' });

    await expect(
      coupangApiRequest({
        method: 'GET',
        pathWithQuery: '/test',
        vendorId: 'vendor-1',
        accessKey: 'access',
        secretKey: 'secret',
      }),
    ).rejects.toBeInstanceOf(CoupangApiError);
  });
});

describe('mapCoupangOrderItemToStandardRow with string IDs', () => {
  it('copies string identifiers to standard columns', () => {
    const row = mapCoupangOrderItemToStandardRow(
      {
        shipmentBoxId: UNSAFE_BOX_ID,
        orderId: UNSAFE_ORDER_ID,
        status: 'INSTRUCT',
      },
      {
        vendorItemId: UNSAFE_VENDOR_ITEM_ID,
        shippingCount: 2,
      },
    );

    expect(row['묶음배송번호']).toBe(UNSAFE_BOX_ID);
    expect(row['주문번호']).toBe(UNSAFE_ORDER_ID);
    expect(row['옵션ID']).toBe(UNSAFE_VENDOR_ITEM_ID);
  });
});
