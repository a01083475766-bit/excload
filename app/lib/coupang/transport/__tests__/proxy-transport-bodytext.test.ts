import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCoupangAcknowledgementPath,
  buildCoupangAcknowledgementRequestBodyText,
} from '@/app/lib/coupang/coupang-acknowledgement';

const UNSAFE_BOX_ID = '123456789012345678';

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
});
