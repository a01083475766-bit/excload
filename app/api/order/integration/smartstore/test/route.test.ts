import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(),
  markResult: vi.fn(),
  invokeHttp: vi.fn(),
  beginOperation: vi.fn(),
}));

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  requireOrderIntegrationUser: vi.fn(async () => ({ userId: 'user-1' })),
  isOrderIntegrationUserAuthFailure: vi.fn(() => false),
}));

vi.mock('@/app/lib/order-integration/smartstore-account', () => ({
  getSmartstoreAccountForUser: mocks.getAccount,
  markSmartstoreAccountTestResult: mocks.markResult,
  toSmartstoreCredentials: vi.fn(() => ({
    clientId: 'client-id',
    clientSecret: '$2a$10$abcdefghijklmnopqrstuv',
    authType: 'SELF',
  })),
}));

vi.mock('@/app/lib/integration-proxy/config', () => ({
  isIntegrationProxyConfigured: vi.fn(() => true),
}));

vi.mock('@/app/lib/integration-proxy/http-transport', () => ({
  invokeIntegrationHttp: mocks.invokeHttp,
}));

vi.mock('@/app/lib/order-integration/connection-health/concurrency', () => ({
  beginConnectionHealthOperation: mocks.beginOperation,
}));

import { POST } from './route';

describe('POST /api/order/integration/smartstore/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccount.mockResolvedValue({ id: 'account-1' });
    mocks.beginOperation.mockResolvedValue({ started: true, operationSequence: BigInt(7) });
  });

  it('토큰 발급 후 최소 주문 읽기를 수행하고 빈 정상 응답을 성공으로 기록한다', async () => {
    mocks.invokeHttp.mockImplementation(async ({ url }: { url: string }) => {
      if (url.includes('/oauth2/token')) {
        return { httpStatus: 200, bodyText: JSON.stringify({ access_token: 'token' }) };
      }
      return {
        httpStatus: 200,
        bodyText: JSON.stringify({ data: { lastChangeStatuses: [] } }),
      };
    });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.invokeHttp).toHaveBeenCalledTimes(2);
    expect(mocks.invokeHttp.mock.calls[0]?.[0]).toMatchObject({ method: 'POST' });
    expect(mocks.invokeHttp.mock.calls[1]?.[0]).toMatchObject({
      method: 'GET',
      body: null,
    });
    expect(mocks.invokeHttp.mock.calls[1]?.[0].url).toContain(
      '/external/v1/pay-order/seller/product-orders/last-changed-statuses?',
    );
    expect(mocks.beginOperation).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      source: 'connection_test',
    });
    expect(mocks.beginOperation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.invokeHttp.mock.invocationCallOrder[0]!,
    );
    expect(mocks.markResult).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(7),
      result: { success: true },
    });
  });

  it('토큰 인증 실패를 구조화된 AUTH_REQUIRED로 기록하고 원본 코드는 응답하지 않는다', async () => {
    mocks.invokeHttp.mockResolvedValue({
      httpStatus: 400,
      bodyText: JSON.stringify({ code: 'invalid_client', message: 'Client Secret is invalid' }),
    });

    const response = await POST();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(mocks.markResult).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(7),
      result: expect.objectContaining({ success: false, category: 'AUTH_REQUIRED' }),
    });
    expect(JSON.stringify(body)).not.toContain('invalid_client');
    expect(JSON.stringify(body)).not.toContain('Client Secret');
  });

  it('비활성 계정이면 외부 API를 호출하거나 결과를 저장하지 않는다', async () => {
    mocks.beginOperation.mockResolvedValue({ started: false, reason: 'INACTIVE' });

    const response = await POST();

    expect(response.status).toBe(409);
    expect(mocks.invokeHttp).not.toHaveBeenCalled();
    expect(mocks.markResult).not.toHaveBeenCalled();
  });

  it('계정이 없으면 sequence를 발급하지 않는다', async () => {
    mocks.getAccount.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(404);
    expect(mocks.beginOperation).not.toHaveBeenCalled();
    expect(mocks.invokeHttp).not.toHaveBeenCalled();
  });
});
