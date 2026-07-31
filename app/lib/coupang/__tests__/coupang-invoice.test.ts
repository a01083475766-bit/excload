import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCoupangInvoicePath,
  buildCoupangInvoiceRequestBodyText,
  collectShipableVendorItemIds,
  confirmInvoiceByRefetch,
  evaluateCoupangInvoicePreflight,
  isAmbiguousInvoiceHttpStatus,
  judgeCoupangInvoiceHttpResponse,
  judgeCoupangInvoiceParsedResponse,
  parseCoupangInvoiceResponse,
  requireSingleShipmentBoxId,
  runCoupangInvoiceTransmission,
} from '@/app/lib/coupang/coupang-invoice';
import type { CoupangOrderSheet } from '@/app/lib/coupang/client';

const BOX = '123456789012345678';
const ORDER = '400001946946012345';
const ITEM_A = '382383989912345678';
const ITEM_B = '382383989912345679';
const INVOICE = '001234567890';

function baseSheet(overrides: Partial<CoupangOrderSheet> = {}): CoupangOrderSheet {
  return {
    shipmentBoxId: BOX,
    orderId: ORDER,
    status: 'INSTRUCT',
    shipmentType: 'THIRD_PARTY',
    splitShipping: false,
    ableSplitShipping: true,
    invoiceNumber: '',
    orderItems: [
      { vendorItemId: ITEM_A, shippingCount: 1, holdCountForCancel: 0, cancelCount: 0 },
      { vendorItemId: ITEM_B, shippingCount: 2, holdCountForCancel: 0, cancelCount: 0 },
    ],
    ...overrides,
  };
}

describe('coupang invoice serialization', () => {
  it('serializes 18-digit ids as unquoted JSON numbers and invoiceNumber as string', () => {
    const bodyText = buildCoupangInvoiceRequestBodyText({
      vendorId: 'A00012345',
      shipmentBoxId: BOX,
      orderId: ORDER,
      vendorItemIds: [ITEM_A],
      deliveryCompanyCode: 'KDEXP',
      invoiceNumber: INVOICE,
    });

    expect(bodyText).toContain(`"vendorId":"A00012345"`);
    expect(bodyText).toContain(`"shipmentBoxId":${BOX}`);
    expect(bodyText).toContain(`"orderId":${ORDER}`);
    expect(bodyText).toContain(`"vendorItemId":${ITEM_A}`);
    expect(bodyText).toContain(`"invoiceNumber":"${INVOICE}"`);
    expect(bodyText).not.toContain(`"${BOX}"`);
    expect(bodyText).not.toContain('123456789012345680');
    expect(bodyText).toContain('"splitShipping":false');
    expect(bodyText).toContain('"preSplitShipped":false');
    expect(bodyText).toContain('"estimatedShippingDate":""');
  });

  it('blocks invalid ids', () => {
    expect(() =>
      buildCoupangInvoiceRequestBodyText({
        vendorId: 'A00012345',
        shipmentBoxId: 'abc',
        orderId: ORDER,
        vendorItemIds: [ITEM_A],
        deliveryCompanyCode: 'KDEXP',
        invoiceNumber: INVOICE,
      }),
    ).toThrow();
  });

  it('uses invoices path', () => {
    expect(buildCoupangInvoicePath('A00012345')).toBe(
      '/v2/providers/openapi/apis/api/v4/vendors/A00012345/orders/invoices',
    );
  });
});

describe('coupang invoice DTO / preflight', () => {
  it('requires exactly one shipmentBoxId', () => {
    expect(requireSingleShipmentBoxId(null).ok).toBe(false);
    expect(requireSingleShipmentBoxId([]).ok).toBe(false);
    expect(requireSingleShipmentBoxId([`bundle:${BOX}`, `bundle:${BOX}`]).ok).toBe(true);
    expect(requireSingleShipmentBoxId([`bundle:${BOX}`, 'bundle:999']).ok).toBe(false);
  });

  it('includes all shipable items and dedupes vendorItemId', () => {
    const result = collectShipableVendorItemIds([
      { vendorItemId: ITEM_A, shippingCount: 1 },
      { vendorItemId: ITEM_A, shippingCount: 1 },
      { vendorItemId: ITEM_B, shippingCount: 1 },
      { vendorItemId: '1', shippingCount: 1, canceled: true },
      { vendorItemId: '2', shippingCount: 1, cancelCount: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.vendorItemIds).toEqual([ITEM_A, ITEM_B]);
  });

  it('blocks holdCountForCancel > 0 for whole order', () => {
    const result = collectShipableVendorItemIds([
      { vendorItemId: ITEM_A, shippingCount: 1, holdCountForCancel: 1 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('allows ableSplitShipping true when splitShipping false', () => {
    const preflight = evaluateCoupangInvoicePreflight({
      sheet: baseSheet({ ableSplitShipping: true, splitShipping: false }),
      expectedShipmentBoxId: BOX,
      expectedOrderId: ORDER,
      courierCode: 'CJ',
      courierName: null,
      invoiceNumber: INVOICE,
    });
    expect(preflight.ok).toBe(true);
    if (preflight.ok) expect(preflight.deliveryCompanyCode).toBe('CJGLS');
  });

  it('blocks splitShipping true and non THIRD_PARTY', () => {
    expect(
      evaluateCoupangInvoicePreflight({
        sheet: baseSheet({ splitShipping: true }),
        expectedShipmentBoxId: BOX,
        expectedOrderId: ORDER,
        courierCode: 'CJ',
        courierName: null,
        invoiceNumber: INVOICE,
      }).ok,
    ).toBe(false);

    expect(
      evaluateCoupangInvoicePreflight({
        sheet: baseSheet({ shipmentType: 'DIRECT' }),
        expectedShipmentBoxId: BOX,
        expectedOrderId: ORDER,
        courierCode: 'CJ',
        courierName: null,
        invoiceNumber: INVOICE,
      }).ok,
    ).toBe(false);
  });

  it('blocks non-INSTRUCT and unsupported courier', () => {
    expect(
      evaluateCoupangInvoicePreflight({
        sheet: baseSheet({ status: 'ACCEPT' }),
        expectedShipmentBoxId: BOX,
        expectedOrderId: ORDER,
        courierCode: 'CJ',
        courierName: null,
        invoiceNumber: INVOICE,
      }).ok,
    ).toBe(false);

    expect(
      evaluateCoupangInvoicePreflight({
        sheet: baseSheet(),
        expectedShipmentBoxId: BOX,
        expectedOrderId: ORDER,
        courierCode: 'FOO',
        courierName: null,
        invoiceNumber: INVOICE,
      }).ok,
    ).toBe(false);
  });
});

describe('coupang invoice response judgment', () => {
  it('parses responseList shipmentBoxId as string', () => {
    const parsed = parseCoupangInvoiceResponse(
      `{"responseCode":0,"responseList":[{"shipmentBoxId":${BOX},"succeed":true,"resultCode":"OK","retryRequired":false}]}`,
    );
    expect(parsed.responseList[0]?.shipmentBoxId).toBe(BOX);
  });

  it('treats responseCode 0 with all OK as success', () => {
    const judgment = judgeCoupangInvoiceParsedResponse({
      parsed: {
        responseCode: 0,
        responseMessage: null,
        responseList: [
          { shipmentBoxId: BOX, succeed: true, resultCode: 'OK', resultMessage: null, retryRequired: false },
          { shipmentBoxId: BOX, succeed: true, resultCode: 'OK', resultMessage: null, retryRequired: false },
        ],
      },
      requestedShipmentBoxId: BOX,
    });
    expect(judgment.outcomeKind).toBe('success');
  });

  it('treats responseCode 1 and mixed results as unknown', () => {
    expect(
      judgeCoupangInvoiceParsedResponse({
        parsed: {
          responseCode: 1,
          responseMessage: null,
          responseList: [
            { shipmentBoxId: BOX, succeed: true, resultCode: 'OK', resultMessage: null, retryRequired: true },
          ],
        },
        requestedShipmentBoxId: BOX,
      }).outcomeKind,
    ).toBe('unknown');

    expect(
      judgeCoupangInvoiceParsedResponse({
        parsed: {
          responseCode: 0,
          responseMessage: null,
          responseList: [
            { shipmentBoxId: BOX, succeed: true, resultCode: 'OK', resultMessage: null, retryRequired: false },
            { shipmentBoxId: BOX, succeed: false, resultCode: 'X', resultMessage: null, retryRequired: false },
          ],
        },
        requestedShipmentBoxId: BOX,
      }).outcomeKind,
    ).toBe('unknown');
  });

  it('treats responseCode 99 clear failure as failure and -1 as unknown', () => {
    expect(
      judgeCoupangInvoiceParsedResponse({
        parsed: {
          responseCode: 99,
          responseMessage: null,
          responseList: [
            {
              shipmentBoxId: BOX,
              succeed: false,
              resultCode: 'INVALID_STATUS',
              resultMessage: 'fail',
              retryRequired: false,
            },
          ],
        },
        requestedShipmentBoxId: BOX,
      }).outcomeKind,
    ).toBe('failure');

    expect(
      judgeCoupangInvoiceParsedResponse({
        parsed: { responseCode: -1, responseMessage: null, responseList: [] },
        requestedShipmentBoxId: BOX,
      }).outcomeKind,
    ).toBe('unknown');
  });

  it('rejects empty list and wrong ids', () => {
    expect(
      judgeCoupangInvoiceParsedResponse({
        parsed: { responseCode: 0, responseMessage: null, responseList: [] },
        requestedShipmentBoxId: BOX,
      }).outcomeKind,
    ).toBe('unknown');

    expect(
      judgeCoupangInvoiceParsedResponse({
        parsed: {
          responseCode: 0,
          responseMessage: null,
          responseList: [
            { shipmentBoxId: '999', succeed: true, resultCode: 'OK', resultMessage: null, retryRequired: false },
          ],
        },
        requestedShipmentBoxId: BOX,
      }).outcomeKind,
    ).toBe('unknown');
  });
});

describe('runCoupangInvoiceTransmission', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('succeeds when POST ok and refetch DEPARTURE with same invoice', async () => {
    const post = vi.fn(async (_bodyText: string) => ({
      httpStatus: 200,
      bodyText: `{"responseCode":0,"responseList":[{"shipmentBoxId":${BOX},"succeed":true,"resultCode":"OK","retryRequired":false}]}`,
    }));
    const fetchByBoxId = vi
      .fn()
      .mockResolvedValueOnce(baseSheet())
      .mockResolvedValueOnce(baseSheet({ status: 'DEPARTURE', invoiceNumber: INVOICE }));

    const result = await runCoupangInvoiceTransmission({
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      mallOrderNo: ORDER,
      mallLineItemIds: [`bundle:${BOX}`],
      courierCode: 'CJ',
      courierName: null,
      invoiceNumber: INVOICE,
      fetchByBoxId,
      postInvoices: post,
    });

    expect(result.outcomeKind).toBe('success');
    expect(result.success).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const bodyText = String(post.mock.calls[0]?.[0]);
    expect(bodyText).toContain(`"vendorId":"A00012345"`);
    expect(bodyText).toContain(`"vendorItemId":${ITEM_A}`);
    expect(bodyText).toContain(`"vendorItemId":${ITEM_B}`);
  });

  it('returns unknown when POST ok but refetch still INSTRUCT', async () => {
    const post = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: `{"responseCode":0,"responseList":[{"shipmentBoxId":${BOX},"succeed":true,"resultCode":"OK","retryRequired":false}]}`,
    }));

    const result = await runCoupangInvoiceTransmission({
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      mallOrderNo: ORDER,
      mallLineItemIds: [`bundle:${BOX}`],
      courierCode: 'CJ',
      courierName: null,
      invoiceNumber: INVOICE,
      fetchByBoxId: async () => baseSheet({ status: 'INSTRUCT', invoiceNumber: '' }),
      postInvoices: post,
    });

    expect(result.outcomeKind).toBe('unknown');
    expect(result.success).toBe(false);
  });

  it('does not re-POST on timeout and confirms via refetch', async () => {
    const post = vi.fn(async () => {
      throw new Error('timeout');
    });
    const fetchByBoxId = vi
      .fn()
      .mockResolvedValueOnce(baseSheet())
      .mockResolvedValueOnce(baseSheet({ status: 'DEPARTURE', invoiceNumber: INVOICE }));

    const result = await runCoupangInvoiceTransmission({
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      mallOrderNo: ORDER,
      mallLineItemIds: [`bundle:${BOX}`],
      courierCode: 'CJ',
      courierName: null,
      invoiceNumber: INVOICE,
      fetchByBoxId,
      postInvoices: post,
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.outcomeKind).toBe('success');
  });

  it('returns unknown on timeout when still INSTRUCT without re-POST', async () => {
    const post = vi.fn(async () => ({ httpStatus: 504, bodyText: '' }));
    const fetchByBoxId = vi.fn(async () => baseSheet());

    const result = await runCoupangInvoiceTransmission({
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      mallOrderNo: ORDER,
      mallLineItemIds: [`bundle:${BOX}`],
      courierCode: 'CJ',
      courierName: null,
      invoiceNumber: INVOICE,
      fetchByBoxId,
      postInvoices: post,
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.outcomeKind).toBe('unknown');
  });

  it('blocks preflight orderId mismatch without POST', async () => {
    const post = vi.fn(async () => ({ httpStatus: 200, bodyText: '{}' }));
    const result = await runCoupangInvoiceTransmission({
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      mallOrderNo: '999',
      mallLineItemIds: [`bundle:${BOX}`],
      courierCode: 'CJ',
      courierName: null,
      invoiceNumber: INVOICE,
      fetchByBoxId: async () => baseSheet(),
      postInvoices: post,
    });
    expect(post).not.toHaveBeenCalled();
    expect(result.outcomeKind).toBe('failure');
    expect(result.errorCode).toBe('ORDER_ID_MISMATCH');
  });

  it('does not auto retry when retryRequired is true', async () => {
    const post = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: `{"responseCode":1,"responseList":[{"shipmentBoxId":${BOX},"succeed":false,"resultCode":"X","retryRequired":true,"resultMessage":"retry"}]}`,
    }));

    const result = await runCoupangInvoiceTransmission({
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      mallOrderNo: ORDER,
      mallLineItemIds: [`bundle:${BOX}`],
      courierCode: 'CJ',
      courierName: null,
      invoiceNumber: INVOICE,
      fetchByBoxId: async () => baseSheet(),
      postInvoices: post,
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.outcomeKind).toBe('unknown');
  });
});

describe('coupang invoice ambiguous HTTP classification', () => {
  it('treats every 5xx (including 501/520/522/599) as unknown', () => {
    for (const status of [500, 501, 502, 503, 504, 520, 521, 522, 599]) {
      expect(isAmbiguousInvoiceHttpStatus(status)).toBe(true);
      expect(
        judgeCoupangInvoiceHttpResponse({
          httpStatus: status,
          bodyText: '{}',
          requestedShipmentBoxId: BOX,
        }).outcomeKind,
      ).toBe('unknown');
    }
  });

  it('keeps definitive 4xx as failure', () => {
    expect(isAmbiguousInvoiceHttpStatus(400)).toBe(false);
    expect(isAmbiguousInvoiceHttpStatus(403)).toBe(false);
    expect(isAmbiguousInvoiceHttpStatus(429)).toBe(false);
    expect(
      judgeCoupangInvoiceHttpResponse({
        httpStatus: 400,
        bodyText: '{}',
        requestedShipmentBoxId: BOX,
      }).outcomeKind,
    ).toBe('failure');
    expect(
      judgeCoupangInvoiceHttpResponse({
        httpStatus: 403,
        bodyText: '{}',
        requestedShipmentBoxId: BOX,
      }).outcomeKind,
    ).toBe('failure');
  });

  it('returns unknown from transmission on non-whitelist 5xx without treating as failure', async () => {
    const post = vi.fn(async () => ({ httpStatus: 522, bodyText: '' }));
    const result = await runCoupangInvoiceTransmission({
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      mallOrderNo: ORDER,
      mallLineItemIds: [`bundle:${BOX}`],
      courierCode: 'CJ',
      courierName: null,
      invoiceNumber: INVOICE,
      fetchByBoxId: async () => baseSheet(),
      postInvoices: post,
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.outcomeKind).toBe('unknown');
  });
});

describe('confirmInvoiceByRefetch', () => {
  it('requires matching invoice for confirmed statuses', () => {
    expect(
      confirmInvoiceByRefetch({
        sheet: baseSheet({ status: 'DEPARTURE', invoiceNumber: INVOICE }),
        requestedInvoiceNumber: INVOICE,
        wasInstructBeforePost: true,
      }).outcomeKind,
    ).toBe('success');

    expect(
      confirmInvoiceByRefetch({
        sheet: baseSheet({ status: 'DEPARTURE', invoiceNumber: 'other' }),
        requestedInvoiceNumber: INVOICE,
        wasInstructBeforePost: true,
      }).outcomeKind,
    ).toBe('unknown');
  });
});

describe('direct transport bodyText for invoices', () => {
  it('preserves invoice bodyText without re-stringify', async () => {
    const { DirectCoupangTransport } = await import('@/app/lib/coupang/transport/direct-transport');
    const transport = new DirectCoupangTransport();
    const fetchMock = vi.fn(async () => ({
      status: 200,
      text: async () => '{"responseCode":0,"responseList":[]}',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const bodyText = buildCoupangInvoiceRequestBodyText({
      vendorId: 'A00012345',
      shipmentBoxId: BOX,
      orderId: ORDER,
      vendorItemIds: [ITEM_A],
      deliveryCompanyCode: 'KDEXP',
      invoiceNumber: INVOICE,
    });

    await transport.invoke({
      method: 'POST',
      pathWithQuery: buildCoupangInvoicePath('A00012345'),
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
