import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCoupangAcknowledgementPath,
  buildCoupangAcknowledgementRequestBodyText,
} from '@/app/lib/coupang/coupang-acknowledgement';
import { buildCoupangInvoicePath, buildCoupangInvoiceRequestBodyText } from '@/app/lib/coupang/coupang-invoice';

const UNSAFE_BOX_ID = '123456789012345678';
const UNSAFE_ORDER_ID = '400001946946012345';
const UNSAFE_VENDOR_ITEM_ID = '382383989912345678';
const INVOICE_WITH_LEADING_ZERO = '001234567890';

vi.mock('@/app/lib/coupang/transport/config', () => ({
  assertCoupangProxyConfigReady: () => {},
  getCoupangProxyBaseUrl: () => 'https://proxy.example',
  getCoupangProxyInvokePath: () => '/invoke',
  getCoupangProxyKeyId: () => 'key-id',
  getCoupangProxySharedSecret: () => 'secret',
}));

vi.mock('@/app/lib/coupang/proxy-signing', () => ({
  EXCLOAD_PROXY_HEADER: {
    timestamp: 'x-ts',
    signature: 'x-sig',
    requestId: 'x-req',
    keyId: 'x-key',
  },
  signProxyRequest: () => ({
    timestamp: '1',
    signature: 'sig',
    requestId: 'req',
  }),
}));

import { ProxyCoupangTransport } from '@/app/lib/coupang/transport/proxy-transport';

describe('ProxyCoupangTransport bodyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes bodyText through proxy wrapper without re-stringifying Coupang body', async () => {
    const transport = new ProxyCoupangTransport();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, httpStatus: 200, bodyText: '{"responseCode":0}' }),
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

    const proxyPayload = JSON.parse(
      String((fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>)[0]?.[1]?.body),
    );
    expect(proxyPayload.bodyText).toBe(bodyText);
    expect(proxyPayload.body).toBeUndefined();
    expect(proxyPayload.method).toBe('PATCH');
  });

  it('passes invoice POST bodyText through proxy wrapper without re-stringifying', async () => {
    const transport = new ProxyCoupangTransport();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, httpStatus: 200, bodyText: '{"responseCode":0}' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const bodyText = buildCoupangInvoiceRequestBodyText({
      vendorId: 'A00012345',
      shipmentBoxId: UNSAFE_BOX_ID,
      orderId: UNSAFE_ORDER_ID,
      vendorItemIds: [UNSAFE_VENDOR_ITEM_ID],
      deliveryCompanyCode: 'KDEXP',
      invoiceNumber: INVOICE_WITH_LEADING_ZERO,
    });

    expect(bodyText).toContain(`"shipmentBoxId":${UNSAFE_BOX_ID}`);
    expect(bodyText).toContain(`"orderId":${UNSAFE_ORDER_ID}`);
    expect(bodyText).toContain(`"vendorItemId":${UNSAFE_VENDOR_ITEM_ID}`);
    expect(bodyText).toContain(`"invoiceNumber":"${INVOICE_WITH_LEADING_ZERO}"`);
    expect(bodyText).not.toContain(`"${UNSAFE_BOX_ID}"`);
    expect(bodyText).not.toContain('123456789012345680');
    expect(bodyText).not.toContain('400001946946012350');

    const pathWithQuery = buildCoupangInvoicePath('A00012345');
    expect(pathWithQuery).toBe(
      '/v2/providers/openapi/apis/api/v4/vendors/A00012345/orders/invoices',
    );

    await transport.invoke({
      method: 'POST',
      pathWithQuery,
      vendorId: 'A00012345',
      accessKey: 'access',
      secretKey: 'secret',
      bodyText,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const proxyPayload = JSON.parse(
      String((fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>)[0]?.[1]?.body),
    );
    expect(proxyPayload.method).toBe('POST');
    expect(proxyPayload.pathWithQuery).toBe(pathWithQuery);
    expect(proxyPayload.bodyText).toBe(bodyText);
    expect(proxyPayload.body).toBeUndefined();
    expect(proxyPayload.bodyText).toContain(`"shipmentBoxId":${UNSAFE_BOX_ID}`);
    expect(proxyPayload.bodyText).toContain(`"orderId":${UNSAFE_ORDER_ID}`);
    expect(proxyPayload.bodyText).toContain(`"vendorItemId":${UNSAFE_VENDOR_ITEM_ID}`);
    expect(proxyPayload.bodyText).toContain(`"invoiceNumber":"${INVOICE_WITH_LEADING_ZERO}"`);
  });
});
