import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  DIAGNOSTIC_MESSAGE_MAX,
  USER_MESSAGE_MAX,
  persistConnectionHealth,
  recordConnectionSyncResult,
  sanitizeDiagnosticErrorMessage,
  sanitizeUserFacingErrorMessage,
} from './persist-health-result';

type TestRow = {
  id: string;
  healthStatus: string | null;
  lastErrorCategory: string | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastCheckedAt: Date | null;
  consecutiveFailureCount: number;
  healthAppliedOperationSequence: bigint;
  [key: string]: unknown;
};

let row: TestRow;

function lastUpdateData(): Record<string, unknown> {
  const call = mocks.update.mock.calls[mocks.update.mock.calls.length - 1];
  return call?.[0]?.data ?? {};
}

describe('persistConnectionHealth concurrency-safe persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    row = {
      id: 'account-1',
      healthStatus: 'HEALTHY',
      lastErrorCategory: null,
      lastSuccessAt: new Date('2026-07-17T00:00:00.000Z'),
      lastFailureAt: null,
      lastCheckedAt: new Date('2026-07-17T00:00:00.000Z'),
      consecutiveFailureCount: 0,
      healthAppliedOperationSequence: BigInt(0),
    };

    const tx = {
      $queryRaw: mocks.queryRaw,
      $executeRaw: mocks.executeRaw,
      orderIntegrationAccount: { update: mocks.update },
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.queryRaw.mockImplementation(async () => [{ ...row }]);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.update.mockImplementation(async ({ data }) => {
      Object.assign(row, data);
      return { ...row };
    });
  });

  it('stores the structured provider category without reclassifying the user message', async () => {
    await persistConnectionHealth({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(1),
      checkedAt: new Date('2026-07-18T00:00:00.000Z'),
      result: {
        success: false,
        category: 'AUTH_REQUIRED',
        errorCode: 'AUTH-401',
        userMessage: '조회 기간이 invalid라는 문구가 포함되어도 인증 오류입니다.',
      },
    });

    expect(lastUpdateData()).toMatchObject({
      healthStatus: 'AUTH_REQUIRED',
      lastErrorCategory: 'AUTH_REQUIRED',
      lastErrorCode: 'AUTH-401',
      healthAppliedOperationSequence: BigInt(1),
    });
    expect(mocks.update.mock.calls[0]?.[0]?.where).toEqual({
      id: 'account-1',
      userId: 'user-1',
    });
  });

  it('limits and sanitizes the persisted user and diagnostic messages', async () => {
    const secret = 'very-secret-token-value';
    const longTail = '오류 상세 '.repeat(200);
    const message = [
      '<html><body>연결 오류</body></html>',
      `Authorization: Bearer ${secret}`,
      `client_secret=${secret}`,
      'user@example.com 010-1234-5678 900101-1234567',
      'at handler (server.ts:10:2)',
      longTail,
    ].join('\n');

    await persistConnectionHealth({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(1),
      result: {
        success: false,
        category: 'AUTH_REQUIRED',
        errorCode: `signature=${secret} ${'X'.repeat(300)}`,
        userMessage: message,
        rawMessage: message,
      },
    });

    const data = lastUpdateData();
    expect(String(data.lastErrorMessage).length).toBeLessThanOrEqual(USER_MESSAGE_MAX);
    expect(String(data.lastErrorCode).length).toBeLessThanOrEqual(DIAGNOSTIC_MESSAGE_MAX);
    expect(data.lastErrorMessage).not.toContain(secret);
    expect(data.lastErrorCode).not.toContain(secret);
    expect(data.lastErrorMessage).not.toContain('<html>');
    expect(data.lastErrorMessage).not.toContain('server.ts');
    expect(data.lastErrorMessage).not.toContain('user@example.com');

    const diagnostic = sanitizeDiagnosticErrorMessage(message);
    expect(diagnostic?.length).toBeLessThanOrEqual(DIAGNOSTIC_MESSAGE_MAX);
    expect(diagnostic).not.toContain(secret);
  });

  it('keeps a newer success when an older failure finishes later', async () => {
    const newer = await persistConnectionHealth({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(11),
      result: { success: true },
    });
    const updateCount = mocks.update.mock.calls.length;

    const older = await persistConnectionHealth({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(10),
      leaseToken: 'own-old-lease',
      result: {
        success: false,
        category: 'TEMPORARY_ERROR',
        userMessage: '일시 오류',
      },
    });

    expect(newer.staleIgnored).toBe(false);
    expect(older.staleIgnored).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(updateCount);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(row.healthStatus).toBe('HEALTHY');
    expect(row.healthAppliedOperationSequence).toBe(BigInt(11));
  });

  it('serially applies failure counts 1, 2, 3 and degrades on the third soft failure', async () => {
    const states = [];
    for (const sequence of [BigInt(20), BigInt(21), BigInt(22)]) {
      states.push(
        await persistConnectionHealth({
          accountId: 'account-1',
          userId: 'user-1',
          operationSequence: sequence,
          result: {
            success: false,
            category: 'TEMPORARY_ERROR',
            userMessage: '일시 오류',
          },
        }),
      );
    }

    expect(states.map((state) => state.consecutiveFailureCount)).toEqual([1, 2, 3]);
    expect(states[0]?.healthStatus).toBe('HEALTHY');
    expect(states[1]?.healthStatus).toBe('HEALTHY');
    expect(states[2]?.healthStatus).toBe('TEMPORARY_ERROR');
    expect(row.healthAppliedOperationSequence).toBe(BigInt(22));
  });

  it('resets the failure count and error fields after a newer success', async () => {
    row.healthStatus = 'TEMPORARY_ERROR';
    row.lastErrorCategory = 'TEMPORARY_ERROR';
    row.consecutiveFailureCount = 3;
    row.healthAppliedOperationSequence = BigInt(30);

    const result = await persistConnectionHealth({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(31),
      result: { success: true },
    });

    expect(result).toMatchObject({
      healthStatus: 'HEALTHY',
      lastErrorCategory: null,
      consecutiveFailureCount: 0,
      staleIgnored: false,
    });
    expect(lastUpdateData()).toMatchObject({
      healthStatus: 'HEALTHY',
      lastErrorCategory: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      consecutiveFailureCount: 0,
    });
  });

  it('updates lastSyncedAt only for a successful sync result', async () => {
    await recordConnectionSyncResult({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(1),
      result: { success: true },
    });
    expect(lastUpdateData().lastSyncedAt).toBeInstanceOf(Date);

    await recordConnectionSyncResult({
      accountId: 'account-1',
      userId: 'user-1',
      operationSequence: BigInt(2),
      result: {
        success: false,
        category: 'TEMPORARY_ERROR',
        userMessage: '일시 오류',
      },
    });
    expect(lastUpdateData().lastSyncedAt).toBeUndefined();
  });
});

describe('error message sanitizers', () => {
  it('drops blank text and preserves a normal bounded user message', () => {
    expect(sanitizeUserFacingErrorMessage('   ')).toBeUndefined();
    expect(sanitizeUserFacingErrorMessage('잠시 후 다시 시도해 주세요.')).toBe(
      '잠시 후 다시 시도해 주세요.',
    );
  });
});
