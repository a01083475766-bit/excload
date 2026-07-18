import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getProviderReadiness: vi.fn(),
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: { orderIntegrationAccount: { findMany: mocks.findMany } },
}));

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  requireOrderIntegrationUser: vi.fn(async () => ({ userId: 'user-1' })),
  isOrderIntegrationUserAuthFailure: vi.fn(() => false),
}));

vi.mock('@/app/lib/order-integration/connection-health/provider-health-registry', () => ({
  getProviderReadiness: mocks.getProviderReadiness,
}));

vi.mock('@/app/lib/order-integration/connection-health/adapters', () => ({
  registerBuiltInHealthAdapters: vi.fn(),
}));

import { GET } from './route';

describe('GET /api/order/integration/connection-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderReadiness.mockReturnValue('VERIFIED');
    mocks.findMany.mockResolvedValue([
      {
        id: 'account-1',
        provider: 'SMARTSTORE',
        accountName: '내 스토어',
        status: 'ACTIVE',
        healthStatus: 'AUTH_REQUIRED',
        lastCheckedAt: new Date('2026-07-18T03:00:00.000Z'),
        lastSuccessAt: null,
        lastFailureAt: new Date('2026-07-18T03:00:00.000Z'),
        lastErrorCategory: 'AUTH_REQUIRED',
        lastErrorCode: 'GW.AUTHN invalid_client INTEGRATION_PROXY_BASE_URL debug.transport',
        consecutiveFailureCount: 1,
        authorizationPeriodStart: null,
        authorizationPeriodEnd: null,
      },
    ]);
  });

  it('브라우저 응답에는 사용자용 연결 상태만 반환한다', async () => {
    const response = await GET();
    const body = await response.json();
    const account = body.accounts[0];

    expect(account).toMatchObject({
      accountId: 'account-1',
      displayState: 'ACTION_REQUIRED',
      label: '연결 정보 확인 필요',
      tone: 'danger',
      checkable: true,
    });
    for (const internalKey of [
      'healthStatus',
      'lastErrorCategory',
      'lastErrorCode',
      'readiness',
      'configErrorScope',
      'consecutiveFailureCount',
      'healthOperationSequence',
      'healthAppliedOperationSequence',
      'healthCheckLeaseToken',
      'healthCheckLeaseUntil',
    ]) {
      expect(account).not.toHaveProperty(internalKey);
    }

    const serialized = JSON.stringify(body);
    for (const internalValue of [
      'AUTH_REQUIRED',
      'VERIFIED',
      'PROVISIONAL',
      'DISABLED',
      'GW.AUTHN',
      'invalid_client',
      'INTEGRATION_PROXY_BASE_URL',
      'debug.transport',
    ]) {
      expect(serialized).not.toContain(internalValue);
    }
  });
});
