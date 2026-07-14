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

  it('integration invoke fetch uses redirect: manual', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => '{"ok":true}',
    });
    vi.stubGlobal('fetch', fetchMock);

    await invokeIntegrationHttp({
      url: 'https://api.commerce.naver.com/v1/ping',
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        redirect: 'manual',
        method: 'GET',
      }),
    );
  });
});
