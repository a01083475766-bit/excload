import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getHealthAdapter: vi.fn(),
  checkConnection: vi.fn(),
  persistConnectionHealth: vi.fn(),
  claimConnectionHealthCheck: vi.fn(),
  releaseConnectionHealthCheckLease: vi.fn(),
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: { orderIntegrationAccount: { findFirst: mocks.findFirst } },
}));

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  requireOrderIntegrationUser: vi.fn(async () => ({ userId: 'user-1' })),
  isOrderIntegrationUserAuthFailure: vi.fn(() => false),
}));

vi.mock('@/app/lib/order-integration/connection-health/provider-health-registry', () => ({
  getHealthAdapter: mocks.getHealthAdapter,
}));

vi.mock('@/app/lib/order-integration/connection-health/adapters', () => ({
  registerBuiltInHealthAdapters: vi.fn(),
}));

vi.mock('@/app/lib/order-integration/connection-health/persist-health-result', () => ({
  persistConnectionHealth: mocks.persistConnectionHealth,
}));

vi.mock('@/app/lib/order-integration/connection-health/concurrency', () => ({
  claimConnectionHealthCheck: mocks.claimConnectionHealthCheck,
  releaseConnectionHealthCheckLease: mocks.releaseConnectionHealthCheckLease,
}));

import { POST } from './route';

const baseAccount = {
  id: 'account-1',
  userId: 'user-1',
  provider: 'SMARTSTORE',
  status: 'ACTIVE',
  healthStatus: 'AUTH_REQUIRED',
  lastCheckedAt: new Date('2026-07-18T03:00:00.000Z'),
  lastSuccessAt: null,
  lastFailureAt: new Date('2026-07-18T03:00:00.000Z'),
  lastErrorCategory: 'AUTH_REQUIRED',
  lastErrorCode: 'GW.AUTHN invalid_client INTEGRATION_PROXY_BASE_URL debug.transport',
  consecutiveFailureCount: 1,
};

const effectiveHealthy = {
  healthStatus: 'HEALTHY',
  lastErrorCategory: null,
  lastSuccessAt: '2026-07-18T03:01:00.000Z',
  lastFailureAt: '2026-07-18T03:00:00.000Z',
  lastCheckedAt: '2026-07-18T03:01:00.000Z',
  consecutiveFailureCount: 0,
  staleIgnored: false,
};

function callRoute(force = false) {
  return POST(
    new Request(
      `http://localhost/api/order/integration/accounts/account-1/health-check${force ? '?force=1' : ''}`,
    ),
    { params: Promise.resolve({ accountId: 'account-1' }) },
  );
}

describe('POST /api/order/integration/accounts/[accountId]/health-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ ...baseAccount });
    mocks.getHealthAdapter.mockReturnValue({
      readiness: 'VERIFIED',
      checkConnection: mocks.checkConnection,
    });
    mocks.checkConnection.mockResolvedValue({
      status: 'HEALTHY',
      checkedAt: new Date('2026-07-18T03:01:00.000Z'),
    });
    mocks.persistConnectionHealth.mockResolvedValue({ ...effectiveHealthy });
    mocks.claimConnectionHealthCheck.mockResolvedValue({
      claimed: true,
      leaseToken: 'lease-token-must-not-leak',
      operationSequence: BigInt(987654321),
    });
    mocks.releaseConnectionHealthCheckLease.mockResolvedValue(undefined);
  });

  it('자동 요청은 automatic 모드로 claim하고 공급자 호출 뒤 소유 lease를 해제한다', async () => {
    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.claimConnectionHealthCheck).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      mode: 'automatic',
    });
    expect(mocks.checkConnection).toHaveBeenCalledTimes(1);
    expect(mocks.persistConnectionHealth).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(987654321),
      leaseToken: 'lease-token-must-not-leak',
      result: { success: true },
    });
    expect(mocks.releaseConnectionHealthCheckLease).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      leaseToken: 'lease-token-must-not-leak',
    });
    expect(body).toMatchObject({
      success: true,
      displayState: 'CONNECTED',
      tone: 'success',
      checkable: true,
    });
  });

  it('force 요청은 manual 모드로 claim해 30초 제한 판정을 공통 계층에 위임한다', async () => {
    await callRoute(true);

    expect(mocks.claimConnectionHealthCheck).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      mode: 'manual',
    });
  });

  it('동시 force 요청 5개에서도 lease를 획득한 하나만 공급자를 호출한다', async () => {
    let claimed = false;
    mocks.claimConnectionHealthCheck.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        return {
          claimed: true,
          leaseToken: 'only-owner-token',
          operationSequence: BigInt(44),
        };
      }
      return { claimed: false, reason: 'IN_PROGRESS' };
    });

    const responses = await Promise.all(Array.from({ length: 5 }, () => callRoute(true)));
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(mocks.claimConnectionHealthCheck).toHaveBeenCalledTimes(5);
    expect(mocks.checkConnection).toHaveBeenCalledTimes(1);
    expect(mocks.persistConnectionHealth).toHaveBeenCalledTimes(1);
    expect(mocks.releaseConnectionHealthCheckLease).toHaveBeenCalledTimes(1);
    expect(responses.filter((response) => response.status === 202)).toHaveLength(4);
    expect(bodies.filter((body) => body.inProgress === true)).toHaveLength(4);
  });

  it.each([
    {
      reason: 'CACHED',
      status: 200,
      expected: { success: true, cached: true, throttled: false },
    },
    {
      reason: 'THROTTLED',
      status: 200,
      expected: { success: true, cached: true, throttled: true },
    },
    {
      reason: 'IN_PROGRESS',
      status: 202,
      expected: { success: true, inProgress: true },
    },
  ] as const)('$reason 결과는 저장 상태만 반환하고 공급자를 호출하지 않는다', async (testCase) => {
    mocks.claimConnectionHealthCheck.mockResolvedValue({
      claimed: false,
      reason: testCase.reason,
    });

    const response = await callRoute(testCase.reason !== 'CACHED');
    const body = await response.json();

    expect(response.status).toBe(testCase.status);
    expect(body).toMatchObject(testCase.expected);
    expect(JSON.stringify(body)).not.toContain(testCase.reason);
    expect(mocks.checkConnection).not.toHaveBeenCalled();
    expect(mocks.persistConnectionHealth).not.toHaveBeenCalled();
    expect(mocks.releaseConnectionHealthCheckLease).not.toHaveBeenCalled();
  });

  it('다른 사용자의 accountId는 존재 여부를 숨기고 404로 응답한다', async () => {
    mocks.claimConnectionHealthCheck.mockResolvedValue({
      claimed: false,
      reason: 'NOT_FOUND',
    });

    const response = await callRoute(true);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: '계정을 찾을 수 없습니다.' });
    expect(JSON.stringify(body)).not.toContain('NOT_FOUND');
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.checkConnection).not.toHaveBeenCalled();
  });

  it('INACTIVE claim 결과는 외부 공급자 호출과 저장을 생략한다', async () => {
    mocks.claimConnectionHealthCheck.mockResolvedValue({
      claimed: false,
      reason: 'INACTIVE',
    });
    mocks.findFirst.mockResolvedValue({ ...baseAccount, status: 'INACTIVE' });

    const response = await callRoute(true);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: false,
      displayState: 'NOT_IN_USE',
      checkable: false,
    });
    expect(JSON.stringify(body)).not.toContain('INACTIVE');
    expect(mocks.checkConnection).not.toHaveBeenCalled();
    expect(mocks.persistConnectionHealth).not.toHaveBeenCalled();
    expect(mocks.releaseConnectionHealthCheckLease).not.toHaveBeenCalled();
  });

  it('claim 직후 계정이 비활성화되어도 외부 호출 없이 소유 lease를 해제한다', async () => {
    mocks.findFirst.mockResolvedValue({ ...baseAccount, status: 'INACTIVE' });

    const response = await callRoute(true);

    expect(response.status).toBe(200);
    expect(mocks.checkConnection).not.toHaveBeenCalled();
    expect(mocks.persistConnectionHealth).not.toHaveBeenCalled();
    expect(mocks.releaseConnectionHealthCheckLease).toHaveBeenCalledTimes(1);
  });

  it('persist가 실패해도 finally에서 자신이 획득한 lease를 해제한다', async () => {
    mocks.persistConnectionHealth.mockRejectedValue(new Error('db failed'));

    await expect(callRoute(true)).rejects.toThrow('db failed');

    expect(mocks.checkConnection).toHaveBeenCalledTimes(1);
    expect(mocks.releaseConnectionHealthCheckLease).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      leaseToken: 'lease-token-must-not-leak',
    });
  });

  it('응답에는 lease·sequence·claim reason·공급자 내부 오류 정보를 노출하지 않는다', async () => {
    mocks.checkConnection.mockResolvedValue({
      status: 'AUTH_REQUIRED',
      rawCode: 'GW.AUTHN',
      rawMessage: 'invalid_client INTEGRATION_PROXY_BASE_URL debug.transport',
      checkedAt: new Date('2026-07-18T03:01:00.000Z'),
    });
    mocks.persistConnectionHealth.mockResolvedValue({
      ...effectiveHealthy,
      healthStatus: 'AUTH_REQUIRED',
      lastErrorCategory: 'AUTH_REQUIRED',
      consecutiveFailureCount: 1,
    });

    const response = await callRoute(true);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    for (const internalKey of [
      'leaseToken',
      'operationSequence',
      'healthOperationSequence',
      'healthAppliedOperationSequence',
      'healthCheckLeaseToken',
      'healthCheckLeaseUntil',
      'staleIgnored',
      'healthStatus',
      'lastErrorCategory',
      'lastErrorCode',
      'readiness',
      'consecutiveFailureCount',
    ]) {
      expect(body).not.toHaveProperty(internalKey);
    }
    for (const internalValue of [
      'lease-token-must-not-leak',
      '987654321',
      'GW.AUTHN',
      'invalid_client',
      'INTEGRATION_PROXY_BASE_URL',
      'debug.transport',
      'IN_PROGRESS',
      'THROTTLED',
      'CACHED',
    ]) {
      expect(serialized).not.toContain(internalValue);
    }
  });
});
