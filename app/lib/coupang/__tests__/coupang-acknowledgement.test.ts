import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCoupangAcknowledgementPath,
  buildCoupangAcknowledgementRequestBodyText,
  COUPANG_ACKNOWLEDGEMENT_MAX_BATCH,
  isAmbiguousAcknowledgementHttpStatus,
  mergeCoupangRefetchedOrdersIntoFetchResult,
  parseCoupangAcknowledgementResponse,
  runCoupangAcknowledgement,
  validateAcknowledgementShipmentBoxIds,
} from '@/app/lib/coupang/coupang-acknowledgement';
import type { CoupangOrderSheet } from '@/app/lib/coupang/client';
import { mapCoupangOrdersToFetchViews, mapCoupangOrdersToStandardRows } from '@/app/lib/coupang/map-coupang-orders';

const UNSAFE_BOX_ID = '123456789012345678';

describe('validateAcknowledgementShipmentBoxIds', () => {
  it('dedupes ids and allows up to 50', () => {
    const ids = Array.from({ length: 50 }, (_, index) => String(index + 1));
    expect(validateAcknowledgementShipmentBoxIds([...ids, '1', '1']).ok).toBe(true);
    expect(validateAcknowledgementShipmentBoxIds(ids).ok).toBe(true);
  });

  it('blocks 51 ids and invalid values', () => {
    const ids = Array.from({ length: 51 }, (_, index) => String(index + 1));
    expect(validateAcknowledgementShipmentBoxIds(ids).ok).toBe(false);
    expect(validateAcknowledgementShipmentBoxIds(['abc']).ok).toBe(false);
    expect(validateAcknowledgementShipmentBoxIds([]).ok).toBe(false);
  });

  it('blocks 51 unique ids even with duplicates in raw input', () => {
    const ids = Array.from({ length: 51 }, (_, index) => String(index + 1));
    expect(validateAcknowledgementShipmentBoxIds([...ids, '1']).ok).toBe(false);
  });
});

describe('buildCoupangAcknowledgementRequestBodyText', () => {
  it('serializes 18-digit shipmentBoxIds as exact JSON numbers', () => {
    const bodyText = buildCoupangAcknowledgementRequestBodyText({
      vendorId: 'A00012345',
      shipmentBoxIds: [UNSAFE_BOX_ID, '123'],
    });
    expect(bodyText).toContain('"vendorId":"A00012345"');
    expect(bodyText).toContain(`"shipmentBoxIds":[${UNSAFE_BOX_ID},123]`);
    expect(bodyText).not.toContain(`"${UNSAFE_BOX_ID}"`);
    expect(bodyText).not.toContain('123456789012345680');
  });
});

describe('parseCoupangAcknowledgementResponse', () => {
  it('parses responseList with string shipmentBoxId', () => {
    const parsed = parseCoupangAcknowledgementResponse(
      `{"responseCode":0,"responseList":[{"shipmentBoxId":${UNSAFE_BOX_ID},"succeed":true,"resultCode":"0","retryRequired":false}]}`,
    );
    expect(parsed.responseList[0]?.shipmentBoxId).toBe(UNSAFE_BOX_ID);
    expect(parsed.responseList[0]?.succeed).toBe(true);
  });

  it('returns empty responseList when missing', () => {
    const parsed = parseCoupangAcknowledgementResponse('{"responseCode":0}');
    expect(parsed.responseList).toEqual([]);
  });
});

describe('runCoupangAcknowledgement', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats individual succeed=true and INSTRUCT refetch as success', async () => {
    const sheet: CoupangOrderSheet = {
      shipmentBoxId: '123',
      orderId: '456',
      status: 'INSTRUCT',
      receiver: { name: '테스트', addr1: '서울' },
      orderItems: [{ vendorItemId: '999', sellerProductName: '상품', shippingCount: 1 }],
    };

    const result = await runCoupangAcknowledgement({
      vendorId: 'A00012345',
      shipmentBoxIds: ['123'],
      patchAcknowledgement: async () => ({
        httpStatus: 200,
        bodyText:
          '{"responseCode":0,"responseList":[{"shipmentBoxId":123,"succeed":true,"resultMessage":"OK","retryRequired":false}]}',
      }),
      fetchByBoxId: async () => sheet,
    });

    expect(result.succeededCount).toBe(1);
    expect(result.results[0]?.hubEligible).toBe(true);
    expect(result.results[0]?.standardRows?.[0]?.['묶음배송번호']).toBe('123');
  });

  it('does not auto-retry when retryRequired is true', async () => {
    const patch = vi.fn(async () => ({
      httpStatus: 200,
      bodyText:
        '{"responseCode":1,"responseList":[{"shipmentBoxId":123,"succeed":false,"retryRequired":true,"resultMessage":"retry"}]}',
    }));

    const result = await runCoupangAcknowledgement({
      vendorId: 'A00012345',
      shipmentBoxIds: ['123'],
      patchAcknowledgement: patch,
      fetchByBoxId: async () => ({ shipmentBoxId: '123', status: 'ACCEPT' }),
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(result.failedCount).toBe(1);
    expect(result.results[0]?.retryRequired).toBe(true);
  });

  it('uses refetch only on ambiguous HTTP without repeating PATCH', async () => {
    const patch = vi.fn(async () => ({ httpStatus: 504, bodyText: '' }));
    const fetchByBoxId = vi.fn(async () => ({
      shipmentBoxId: '123',
      status: 'INSTRUCT',
      orderItems: [{ sellerProductName: '상품', shippingCount: 1 }],
    }));

    const result = await runCoupangAcknowledgement({
      vendorId: 'A00012345',
      shipmentBoxIds: ['123'],
      patchAcknowledgement: patch,
      fetchByBoxId,
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(fetchByBoxId).toHaveBeenCalledTimes(1);
    expect(result.succeededCount).toBe(1);
  });

  it('marks refetch failure as blocked for hub', async () => {
    const result = await runCoupangAcknowledgement({
      vendorId: 'A00012345',
      shipmentBoxIds: ['123'],
      patchAcknowledgement: async () => ({
        httpStatus: 200,
        bodyText:
          '{"responseCode":0,"responseList":[{"shipmentBoxId":123,"succeed":true,"retryRequired":false}]}',
      }),
      fetchByBoxId: async () => {
        throw new Error('fetch failed');
      },
    });

    expect(result.results[0]?.status).toBe('REFETCH_FAILED');
    expect(result.results[0]?.hubEligible).toBe(false);
  });

  it('marks still-ACCEPT after refetch as uncertain', async () => {
    const result = await runCoupangAcknowledgement({
      vendorId: 'A00012345',
      shipmentBoxIds: ['123'],
      patchAcknowledgement: async () => ({
        httpStatus: 200,
        bodyText:
          '{"responseCode":0,"responseList":[{"shipmentBoxId":123,"succeed":true,"retryRequired":false}]}',
      }),
      fetchByBoxId: async () => ({ shipmentBoxId: '123', status: 'ACCEPT' }),
    });

    expect(result.results[0]?.status).toBe('UNCERTAIN');
    expect(result.results[0]?.hubEligible).toBe(false);
  });

  it('treats responseCode 0 without matching responseList item as failure', async () => {
    const result = await runCoupangAcknowledgement({
      vendorId: 'A00012345',
      shipmentBoxIds: ['123'],
      patchAcknowledgement: async () => ({
        httpStatus: 200,
        bodyText: '{"responseCode":0,"responseList":[]}',
      }),
      fetchByBoxId: async () => ({ shipmentBoxId: '123', status: 'INSTRUCT' }),
    });

    expect(result.failedCount).toBe(1);
    expect(result.succeededCount).toBe(0);
  });

  it('matches 18-digit response shipmentBoxId exactly', async () => {
    const result = await runCoupangAcknowledgement({
      vendorId: 'A00012345',
      shipmentBoxIds: [UNSAFE_BOX_ID],
      patchAcknowledgement: async () => ({
        httpStatus: 200,
        bodyText: `{"responseCode":0,"responseList":[{"shipmentBoxId":${UNSAFE_BOX_ID},"succeed":true,"retryRequired":false}]}`,
      }),
      fetchByBoxId: async () => ({
        shipmentBoxId: UNSAFE_BOX_ID,
        status: 'INSTRUCT',
        orderItems: [{ sellerProductName: '상품', shippingCount: 1 }],
      }),
    });

    expect(result.succeededCount).toBe(1);
  });

  it('does not treat wrong response shipmentBoxId as success', async () => {
    const result = await runCoupangAcknowledgement({
      vendorId: 'A00012345',
      shipmentBoxIds: ['123'],
      patchAcknowledgement: async () => ({
        httpStatus: 200,
        bodyText:
          '{"responseCode":0,"responseList":[{"shipmentBoxId":999,"succeed":true,"retryRequired":false}]}',
      }),
      fetchByBoxId: async () => ({ shipmentBoxId: '123', status: 'INSTRUCT' }),
    });

    expect(result.failedCount).toBe(1);
  });
});

describe('mergeCoupangRefetchedOrdersIntoFetchResult', () => {
  it('replaces all rows for a shipmentBoxId bundle', () => {
    const initialSheet: CoupangOrderSheet = {
      shipmentBoxId: UNSAFE_BOX_ID,
      orderId: '100',
      status: 'ACCEPT',
      orderItems: [
        { vendorItemId: '1', sellerProductName: 'A', shippingCount: 1 },
        { vendorItemId: '2', sellerProductName: 'B', shippingCount: 1 },
      ],
    };
    const refreshedSheet: CoupangOrderSheet = {
      shipmentBoxId: UNSAFE_BOX_ID,
      orderId: '100',
      status: 'INSTRUCT',
      receiver: { name: '새수취인', addr1: '부산', addr2: '1층' },
      orderItems: [{ vendorItemId: '1', sellerProductName: 'A', shippingCount: 2 }],
    };

    const rows = mapCoupangOrdersToStandardRows([initialSheet]).map((row) => ({ ...row }));
    const views = mapCoupangOrdersToFetchViews([initialSheet]);
    const patchRows = mapCoupangOrdersToStandardRows([refreshedSheet]).map((row) => ({ ...row }));
    const patchViews = mapCoupangOrdersToFetchViews([refreshedSheet]);

    const merged = mergeCoupangRefetchedOrdersIntoFetchResult({
      rows,
      views,
      patches: [
        {
          shipmentBoxId: UNSAFE_BOX_ID,
          standardRows: patchRows,
          views: patchViews,
        },
      ],
    });

    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0]?.['묶음배송번호']).toBe(UNSAFE_BOX_ID);
    expect(merged.rows[0]?.['받는사람']).toBe('새수취인');
    expect(merged.views[0]?.hubEligible).toBe(true);
    expect(merged.views[0]?.rowIndex).toBe(0);
  });
});

describe('transport helpers', () => {
  it('uses v4 acknowledgement path', () => {
    expect(buildCoupangAcknowledgementPath('A00012345')).toBe(
      '/v2/providers/openapi/apis/api/v4/vendors/A00012345/ordersheets/acknowledgement',
    );
  });

  it('detects ambiguous HTTP statuses', () => {
    expect(isAmbiguousAcknowledgementHttpStatus(504)).toBe(true);
    expect(isAmbiguousAcknowledgementHttpStatus(200)).toBe(false);
  });

  it('exports max batch 50', () => {
    expect(COUPANG_ACKNOWLEDGEMENT_MAX_BATCH).toBe(50);
  });
});

describe('direct/proxy bodyText preservation', () => {
  it('passes bodyText without JSON re-stringify in direct transport', async () => {
    const { DirectCoupangTransport } = await import('@/app/lib/coupang/transport/direct-transport');
    const transport = new DirectCoupangTransport();
    const fetchMock = vi.fn(async () => ({
      status: 200,
      text: async () => '{"responseCode":0,"responseList":[]}',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const bodyText = buildCoupangAcknowledgementRequestBodyText({
      vendorId: 'A00012345',
      shipmentBoxIds: [UNSAFE_BOX_ID],
    });

    await transport.invoke({
      method: 'PATCH',
      pathWithQuery: buildCoupangAcknowledgementPath('A00012345'),
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      bodyText,
    });

    const fetchInit = (fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>)[0]?.[1];
    expect(fetchInit?.body).toBe(bodyText);
    vi.unstubAllGlobals();
  });
});
