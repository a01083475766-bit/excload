import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COUPANG_INVOKE_PATH,
  INTEGRATION_INVOKE_PATH,
  MAX_AGE_MS,
  buildHealthzPayload,
  hashBody,
  invokeIntegrationHttp,
  verifySignature,
} from './server.mjs';
import { getAllowedHostnames } from './allowed-hosts.mjs';

function sign({ secret, method, path, body, timestamp }) {
  const message = `${timestamp}${method.toUpperCase()}${path}${hashBody(body)}`;
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

describe('Lightsail server.mjs helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps both invoke paths', () => {
    expect(COUPANG_INVOKE_PATH).toBe('/internal/coupang/invoke');
    expect(INTEGRATION_INVOKE_PATH).toBe('/internal/integration/invoke');
  });

  it('buildHealthzPayload exposes required fields without secrets', () => {
    const payload = buildHealthzPayload();
    expect(payload).toEqual({
      ok: true,
      coupangInvokeEnabled: true,
      integrationInvokeEnabled: true,
      exactAllowedHosts: getAllowedHostnames(),
      suffixRules: [
        {
          suffix: 'cafe24api.com',
          protocols: ['https'],
          malls: ['cafe24'],
        },
      ],
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/secret|accessKey|Authorization|password/i);
  });

  it('verifySignature accepts fresh valid HMAC (INTEGRATION/COUPANG shared secret)', () => {
    const secret = 'test-shared-secret';
    const body = JSON.stringify({ url: 'https://api.11st.co.kr/x' });
    const timestamp = new Date().toISOString();
    const signature = sign({
      secret,
      method: 'POST',
      path: INTEGRATION_INVOKE_PATH,
      body,
      timestamp,
    });

    expect(
      verifySignature({
        method: 'POST',
        path: INTEGRATION_INVOKE_PATH,
        body,
        timestamp,
        signature,
        secret,
      }),
    ).toBe(true);
  });

  it('verifySignature rejects stale timestamp (>5m)', () => {
    const secret = 'test-shared-secret';
    const body = '{}';
    const now = Date.now();
    const timestamp = new Date(now - MAX_AGE_MS - 1_000).toISOString();
    const signature = sign({
      secret,
      method: 'POST',
      path: COUPANG_INVOKE_PATH,
      body,
      timestamp,
    });

    expect(
      verifySignature({
        method: 'POST',
        path: COUPANG_INVOKE_PATH,
        body,
        timestamp,
        signature,
        secret,
        now,
      }),
    ).toBe(false);
  });

  it('verifySignature rejects wrong secret', () => {
    const body = '{}';
    const timestamp = new Date().toISOString();
    const signature = sign({
      secret: 'right',
      method: 'POST',
      path: COUPANG_INVOKE_PATH,
      body,
      timestamp,
    });

    expect(
      verifySignature({
        method: 'POST',
        path: COUPANG_INVOKE_PATH,
        body,
        timestamp,
        signature,
        secret: 'wrong',
      }),
    ).toBe(false);
  });

  it('integration invoke fetch uses redirect: manual and charset-aware body decode', async () => {
    const eucKrBody = Buffer.concat([
      Buffer.from('<?xml version="1.0" encoding="EUC-KR"?><msg>', 'ascii'),
      Buffer.from([0xc0, 0xce, 0xc1, 0xf5, 0xc5, 0xb0, 0x20, 0xbf, 0xc0, 0xb7, 0xf9]),
      Buffer.from('</msg>', 'ascii'),
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'text/xml; charset=EUC-KR' : null),
      },
      arrayBuffer: async () => eucKrBody.buffer.slice(eucKrBody.byteOffset, eucKrBody.byteOffset + eucKrBody.byteLength),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeIntegrationHttp({
      url: 'https://api.11st.co.kr/rest/ordservices/complete/202601010000/202601020000',
      method: 'GET',
      headers: { Accept: 'application/xml', openapikey: 'dummy' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        redirect: 'manual',
        method: 'GET',
      }),
    );
    expect(result.bodyEncoding).toBe('euc-kr');
    expect(result.contentType).toMatch(/charset=utf-8/i);
    expect(result.bodyText).toContain('인증키 오류');
    expect(result.bodyText).not.toContain('\uFFFD');
  });
});
