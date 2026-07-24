import { beforeEach, describe, expect, it, vi } from 'vitest';
import { categorizeSmartstoreOperationError } from '@/app/lib/order-integration/connection-health/adapters/smartstore';

const mocks = vi.hoisted(() => ({
  invokeHttp: vi.fn(),
}));

vi.mock('@/app/lib/integration-proxy/config', () => ({
  isIntegrationProxyConfigured: vi.fn(() => true),
  assertIntegrationProxyConfigReady: vi.fn(),
}));

vi.mock('@/app/lib/integration-proxy/http-transport', () => ({
  invokeIntegrationHttp: mocks.invokeHttp,
}));

import {
  SmartstoreApiError,
  SMARTSTORE_TOKEN_URL,
  computeRateLimitBackoffMs,
  createSmartstoreFetchSession,
  fetchSmartstoreProductOrders,
  parseRetryAfterMs,
  smartstoreAuthorizedRequest,
} from '@/app/lib/smartstore/client';

const CREDENTIALS = {
  clientId: 'client-id-test',
  clientSecret: '$2a$10$abcdefghijklmnopqrstuv',
  authType: 'SELF' as const,
};

function isTokenCall(url: string): boolean {
  return url === SMARTSTORE_TOKEN_URL || url.includes('/oauth2/token');
}

function isOrderChangedCall(url: string): boolean {
  return url.includes('/last-changed-statuses');
}

function tokenOk(accessToken: string) {
  return {
    httpStatus: 200,
    bodyText: JSON.stringify({ access_token: accessToken, expires_in: 3600 }),
  };
}

function orderEmptyOk() {
  return {
    httpStatus: 200,
    bodyText: JSON.stringify({ data: { lastChangeStatuses: [] } }),
  };
}

describe('parseRetryAfterMs / computeRateLimitBackoffMs', () => {
  it('Retry-After 초 단위를 ms로 변환하고 상한을 적용한다', () => {
    expect(parseRetryAfterMs('1.5')).toBe(1500);
    expect(parseRetryAfterMs('999')).toBe(10_000);
    expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT')).toBeNull();
  });

  it('헤더가 없으면 짧은 지수 백오프를 쓴다', () => {
    expect(computeRateLimitBackoffMs({ attemptIndex: 0 })).toBe(400);
    expect(computeRateLimitBackoffMs({ attemptIndex: 1 })).toBe(800);
    expect(computeRateLimitBackoffMs({ attemptIndex: 0, retryAfterHeader: '3' })).toBe(3000);
  });
});

describe('스마트스토어 fetch session 토큰 재사용·재시도', () => {
  beforeEach(() => {
    mocks.invokeHttp.mockReset();
  });

  it('30일·주문 0건: 토큰 1회 + 주문조회 약 30구간', async () => {
    mocks.invokeHttp.mockImplementation(async (req: { url: string }) => {
      if (isTokenCall(req.url)) return tokenOk('tok-session-1');
      if (isOrderChangedCall(req.url)) return orderEmptyOk();
      return { httpStatus: 500, bodyText: '{}' };
    });

    const session = createSmartstoreFetchSession({
      credentials: CREDENTIALS,
      sleep: async () => undefined,
    });

    const details = await fetchSmartstoreProductOrders({
      credentials: CREDENTIALS,
      days: 30,
      session,
    });

    expect(details).toEqual([]);
    const tokenCalls = mocks.invokeHttp.mock.calls.filter((c) => isTokenCall(c[0].url));
    const orderCalls = mocks.invokeHttp.mock.calls.filter((c) => isOrderChangedCall(c[0].url));
    expect(tokenCalls).toHaveLength(1);
    expect(orderCalls).toHaveLength(30);
    expect(session.tokenIssueCount).toBe(1);
  });

  it('여러 구간과 페이지네이션에서 같은 토큰을 재사용한다', async () => {
    let orderGetCount = 0;
    const authHeaders: string[] = [];

    mocks.invokeHttp.mockImplementation(async (req: { url: string; headers?: Record<string, string> }) => {
      if (isTokenCall(req.url)) return tokenOk('tok-reuse');
      if (isOrderChangedCall(req.url)) {
        orderGetCount += 1;
        authHeaders.push(req.headers?.Authorization ?? '');
        // 첫 구간 첫 페이지만 more로 추가 페이지
        if (orderGetCount === 1) {
          return {
            httpStatus: 200,
            bodyText: JSON.stringify({
              data: {
                lastChangeStatuses: [{ productOrderId: 'PO-1' }],
                more: { moreFrom: '2026-07-15T18:00:00.000+09:00', moreSequence: 'SEQ-1' },
              },
            }),
          };
        }
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({ data: { lastChangeStatuses: [{ productOrderId: 'PO-2' }] } }),
        };
      }
      if (req.url.includes('/product-orders/query')) {
        authHeaders.push(req.headers?.Authorization ?? '');
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({
            data: [
              { productOrder: { productOrderId: 'PO-1' } },
              { productOrder: { productOrderId: 'PO-2' } },
            ],
          }),
        };
      }
      return { httpStatus: 500, bodyText: '{}' };
    });

    const session = createSmartstoreFetchSession({
      credentials: CREDENTIALS,
      sleep: async () => undefined,
    });

    await fetchSmartstoreProductOrders({
      credentials: CREDENTIALS,
      days: 2,
      session,
    });

    expect(mocks.invokeHttp.mock.calls.filter((c) => isTokenCall(c[0].url))).toHaveLength(1);
    // 2구간 + 첫 구간 more 1회 = 3 GET, + detail 1 POST
    expect(authHeaders.length).toBeGreaterThanOrEqual(3);
    expect(authHeaders.every((h) => h === 'Bearer tok-reuse')).toBe(true);
    expect(session.tokenIssueCount).toBe(1);
  });

  it('401이면 토큰 재발급 1회 후 해당 요청만 재시도한다', async () => {
    let tokenN = 0;
    let orderN = 0;

    mocks.invokeHttp.mockImplementation(async (req: { url: string; headers?: Record<string, string> }) => {
      if (isTokenCall(req.url)) {
        tokenN += 1;
        return tokenOk(`tok-${tokenN}`);
      }
      if (isOrderChangedCall(req.url)) {
        orderN += 1;
        if (orderN === 1) {
          return { httpStatus: 401, bodyText: JSON.stringify({ code: 'GW.AUTHN', message: 'unauthorized' }) };
        }
        expect(req.headers?.Authorization).toBe('Bearer tok-2');
        return orderEmptyOk();
      }
      return { httpStatus: 500, bodyText: '{}' };
    });

    const session = createSmartstoreFetchSession({
      credentials: CREDENTIALS,
      sleep: async () => undefined,
    });

    await fetchSmartstoreProductOrders({ credentials: CREDENTIALS, days: 1, session });

    expect(tokenN).toBe(2);
    expect(orderN).toBe(2);
    expect(session.tokenIssueCount).toBe(2);
    expect(session.authRefreshCount).toBe(1);
  });

  it('반복 401은 무한 재시도 없이 실패한다', async () => {
    mocks.invokeHttp.mockImplementation(async (req: { url: string }) => {
      if (isTokenCall(req.url)) return tokenOk('tok-x');
      if (isOrderChangedCall(req.url)) {
        return { httpStatus: 401, bodyText: JSON.stringify({ code: 'GW.AUTHN', message: 'unauthorized' }) };
      }
      return { httpStatus: 500, bodyText: '{}' };
    });

    const session = createSmartstoreFetchSession({
      credentials: CREDENTIALS,
      sleep: async () => undefined,
    });

    await expect(
      fetchSmartstoreProductOrders({ credentials: CREDENTIALS, days: 1, session }),
    ).rejects.toThrow();

    const tokenCalls = mocks.invokeHttp.mock.calls.filter((c) => isTokenCall(c[0].url));
    const orderCalls = mocks.invokeHttp.mock.calls.filter((c) => isOrderChangedCall(c[0].url));
    expect(tokenCalls).toHaveLength(2);
    expect(orderCalls).toHaveLength(2);
    expect(session.authRefreshCount).toBe(1);
  });

  it('429 후 재시도하면 성공한다', async () => {
    const sleeps: number[] = [];
    let orderN = 0;

    mocks.invokeHttp.mockImplementation(async (req: { url: string }) => {
      if (isTokenCall(req.url)) return tokenOk('tok-rl');
      if (isOrderChangedCall(req.url)) {
        orderN += 1;
        if (orderN === 1) {
          return {
            httpStatus: 429,
            bodyText: JSON.stringify({ code: 'GW.RATE_LIMIT', message: 'too many' }),
            responseHeaders: { 'Retry-After': '1' },
          };
        }
        return orderEmptyOk();
      }
      return { httpStatus: 500, bodyText: '{}' };
    });

    const session = createSmartstoreFetchSession({
      credentials: CREDENTIALS,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await fetchSmartstoreProductOrders({ credentials: CREDENTIALS, days: 1, session });

    expect(orderN).toBe(2);
    expect(session.rateLimitRetryCount).toBe(1);
    expect(sleeps).toEqual([1000]);
    expect(session.tokenIssueCount).toBe(1);
  });

  it('429 재시도 소진 시 RATE_LIMITED로 분류된다', async () => {
    mocks.invokeHttp.mockImplementation(async (req: { url: string }) => {
      if (isTokenCall(req.url)) return tokenOk('tok-rl-fail');
      if (isOrderChangedCall(req.url)) {
        return {
          httpStatus: 429,
          bodyText: JSON.stringify({ code: 'GW.RATE_LIMIT', message: 'too many' }),
        };
      }
      return { httpStatus: 500, bodyText: '{}' };
    });

    const session = createSmartstoreFetchSession({
      credentials: CREDENTIALS,
      sleep: async () => undefined,
    });

    let caught: unknown;
    try {
      await fetchSmartstoreProductOrders({ credentials: CREDENTIALS, days: 1, session });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const categorized = categorizeSmartstoreOperationError(caught);
    expect(categorized.category).toBe('RATE_LIMITED');
    expect(categorized.userMessage).toContain('호출이 많습니다');

    const orderCalls = mocks.invokeHttp.mock.calls.filter((c) => isOrderChangedCall(c[0].url));
    // 최초 1 + 추가 재시도 2
    expect(orderCalls).toHaveLength(3);
    expect(session.rateLimitRetryCount).toBe(2);
  });

  it('400·403은 토큰 재발급을 하지 않고 기존 분류를 유지한다', async () => {
    for (const [status, body, expectedCategory] of [
      [400, { code: 'INVALID', message: 'bad param' }, 'REQUEST_INVALID'],
      [403, { code: 'GW.AUTHZ', message: 'forbidden' }, 'PERMISSION_DENIED'],
      [503, { message: 'unavailable' }, 'TEMPORARY_ERROR'],
    ] as const) {
      mocks.invokeHttp.mockReset();
      mocks.invokeHttp.mockImplementation(async (req: { url: string }) => {
        if (isTokenCall(req.url)) return tokenOk('tok-err');
        if (isOrderChangedCall(req.url)) {
          return { httpStatus: status, bodyText: JSON.stringify(body) };
        }
        return { httpStatus: 500, bodyText: '{}' };
      });

      const session = createSmartstoreFetchSession({
        credentials: CREDENTIALS,
        sleep: async () => undefined,
      });

      let caught: unknown;
      try {
        await fetchSmartstoreProductOrders({ credentials: CREDENTIALS, days: 1, session });
      } catch (error) {
        caught = error;
      }

      expect(categorizeSmartstoreOperationError(caught).category).toBe(expectedCategory);
      expect(mocks.invokeHttp.mock.calls.filter((c) => isTokenCall(c[0].url))).toHaveLength(1);
      expect(session.authRefreshCount).toBe(0);
    }
  });

  it('토큰·인증정보가 진단 로그에 포함되지 않는다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mocks.invokeHttp.mockImplementation(async (req: { url: string }) => {
      if (isTokenCall(req.url)) return tokenOk('super-secret-token-value');
      if (isOrderChangedCall(req.url)) {
        return {
          httpStatus: 429,
          bodyText: JSON.stringify({ code: 'GW.RATE_LIMIT', message: 'too many' }),
        };
      }
      return { httpStatus: 500, bodyText: '{}' };
    });

    const session = createSmartstoreFetchSession({
      credentials: CREDENTIALS,
      sleep: async () => undefined,
    });

    await expect(
      fetchSmartstoreProductOrders({ credentials: CREDENTIALS, days: 1, session }),
    ).rejects.toThrow();

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain('super-secret-token-value');
    expect(logged).not.toContain(CREDENTIALS.clientId);
    expect(logged).not.toContain(CREDENTIALS.clientSecret);
    expect(logged).toContain('[Smartstore Fetch]');
    expect(logged).toContain('"httpStatus":429');

    errorSpy.mockRestore();
  });

  it('정상 구간 호출 사이에 고정 대기를 넣지 않는다', async () => {
    const sleeps: number[] = [];

    mocks.invokeHttp.mockImplementation(async (req: { url: string }) => {
      if (isTokenCall(req.url)) return tokenOk('tok-no-delay');
      if (isOrderChangedCall(req.url)) return orderEmptyOk();
      return { httpStatus: 500, bodyText: '{}' };
    });

    const session = createSmartstoreFetchSession({
      credentials: CREDENTIALS,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await fetchSmartstoreProductOrders({ credentials: CREDENTIALS, days: 3, session });
    expect(sleeps).toEqual([]);
  });

  it('smartstoreAuthorizedRequest는 session 없이 호출해도 request-scoped로만 동작한다', async () => {
    mocks.invokeHttp.mockImplementation(async (req: { url: string }) => {
      if (isTokenCall(req.url)) return tokenOk('tok-one');
      return orderEmptyOk();
    });

    await smartstoreAuthorizedRequest({
      credentials: CREDENTIALS,
      method: 'GET',
      pathWithQuery: '/external/v1/pay-order/seller/product-orders/last-changed-statuses?x=1',
    });
    await smartstoreAuthorizedRequest({
      credentials: CREDENTIALS,
      method: 'GET',
      pathWithQuery: '/external/v1/pay-order/seller/product-orders/last-changed-statuses?x=2',
    });

    // 세션을 공유하지 않으면 호출마다 토큰 발급
    expect(mocks.invokeHttp.mock.calls.filter((c) => isTokenCall(c[0].url))).toHaveLength(2);
  });
});
