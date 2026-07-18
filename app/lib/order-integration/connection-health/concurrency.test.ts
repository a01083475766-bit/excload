import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
  },
}));

import {
  AUTOMATIC_HEALTH_CHECK_FRESH_MS,
  beginConnectionHealthOperation,
  claimConnectionHealthCheck,
  CONNECTION_HEALTH_LEASE_TTL_MS,
  MANUAL_HEALTH_CHECK_THROTTLE_MS,
  releaseConnectionHealthCheckLease,
} from './concurrency';

type CapturedSql = { sql: string; values: unknown[] };

function capturedQuery(mock: typeof mocks.queryRaw | typeof mocks.executeRaw): CapturedSql {
  return mock.mock.calls.at(-1)?.[0] as CapturedSql;
}

function compactSql(query: CapturedSql): string {
  return query.sql.replace(/\s+/g, ' ').trim();
}

describe('connection health concurrency repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('beginConnectionHealthOperation', () => {
    it('소유자·활성 계정의 작업 순번을 UPDATE RETURNING으로 원자 발급한다', async () => {
      mocks.queryRaw.mockResolvedValue([
        { outcome: 'STARTED', operationSequence: BigInt(12), source: 'fetch_orders' },
      ]);

      await expect(
        beginConnectionHealthOperation({
          accountId: 'account-1',
          userId: 'user-1',
          source: 'fetch_orders',
        }),
      ).resolves.toEqual({ started: true, operationSequence: BigInt(12) });

      const query = capturedQuery(mocks.queryRaw);
      const sql = compactSql(query);
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain('SET "healthOperationSequence" = account."healthOperationSequence" + 1');
      expect(sql).toContain('RETURNING account."healthOperationSequence" AS "operationSequence"');
      expect(sql).toContain('account."id" = ?');
      expect(sql).toContain('account."userId" = ?');
      expect(query.values).toEqual(['account-1', 'user-1', false, 'fetch_orders']);
    });

    it.each([
      ['NOT_FOUND', 'NOT_FOUND'],
      ['INACTIVE', 'INACTIVE'],
    ] as const)('%s 결과를 내부 reason으로 구분한다', async (outcome, reason) => {
      mocks.queryRaw.mockResolvedValue([{ outcome, operationSequence: null, source: 'transport' }]);

      await expect(
        beginConnectionHealthOperation({
          accountId: 'account-1',
          userId: 'user-1',
          source: 'transport',
        }),
      ).resolves.toEqual({ started: false, reason });
    });

    it('allows only the explicit connection test to verify a saved INACTIVE account', async () => {
      mocks.queryRaw.mockResolvedValue([
        { outcome: 'STARTED', operationSequence: BigInt(3), source: 'connection_test' },
      ]);

      await beginConnectionHealthOperation({
        accountId: 'pending-account',
        userId: 'user-1',
        source: 'connection_test',
      });

      const query = capturedQuery(mocks.queryRaw);
      expect(compactSql(query)).toContain('target."status"::text <> \'INACTIVE\' OR ?');
      expect(query.values).toEqual([
        'pending-account',
        'user-1',
        true,
        'connection_test',
      ]);
    });

    it('계정·사용자·source 값을 SQL 문자열에 삽입하지 않고 모두 바인딩한다', async () => {
      const malicious = `account' OR 1=1 --`;
      mocks.queryRaw.mockResolvedValue([{ outcome: 'NOT_FOUND', operationSequence: null }]);

      await beginConnectionHealthOperation({
        accountId: malicious,
        userId: `${malicious}:user`,
        source: 'save_validation',
      });

      const query = capturedQuery(mocks.queryRaw);
      expect(query.sql).not.toContain(malicious);
      expect(query.values).toContain(malicious);
      expect(query.values).toContain(`${malicious}:user`);
      expect(query.values).toContain('save_validation');
    });

    it('repository mock: 같은 계정의 병렬 begin 호출은 서로 다른 sequence 결과를 전달한다', async () => {
      mocks.queryRaw
        .mockResolvedValueOnce([
          { outcome: 'STARTED', operationSequence: BigInt(101), source: 'fetch_orders' },
        ])
        .mockResolvedValueOnce([
          { outcome: 'STARTED', operationSequence: BigInt(102), source: 'connection_test' },
        ]);

      const [fetchOperation, testOperation] = await Promise.all([
        beginConnectionHealthOperation({
          accountId: 'same-account',
          userId: 'user-1',
          source: 'fetch_orders',
        }),
        beginConnectionHealthOperation({
          accountId: 'same-account',
          userId: 'user-1',
          source: 'connection_test',
        }),
      ]);

      expect(fetchOperation).toEqual({ started: true, operationSequence: BigInt(101) });
      expect(testOperation).toEqual({ started: true, operationSequence: BigInt(102) });
      expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
      expect((mocks.queryRaw.mock.calls[0][0] as CapturedSql).values[0]).toBe('same-account');
      expect((mocks.queryRaw.mock.calls[1][0] as CapturedSql).values[0]).toBe('same-account');
    });

    it('repository mock: 다른 계정의 병렬 begin 호출은 각 accountId로 독립 쿼리된다', async () => {
      mocks.queryRaw.mockImplementation(async (query: CapturedSql) => {
        const accountId = query.values[0];
        return [
          {
            outcome: 'STARTED',
            operationSequence: accountId === 'account-a' ? BigInt(1) : BigInt(7),
            source: query.values[3],
          },
        ];
      });

      const [accountA, accountB] = await Promise.all([
        beginConnectionHealthOperation({
          accountId: 'account-a',
          userId: 'user-1',
          source: 'transport',
        }),
        beginConnectionHealthOperation({
          accountId: 'account-b',
          userId: 'user-1',
          source: 'save_validation',
        }),
      ]);

      expect(accountA).toEqual({ started: true, operationSequence: BigInt(1) });
      expect(accountB).toEqual({ started: true, operationSequence: BigInt(7) });
      expect(mocks.queryRaw.mock.calls.map((call) => (call[0] as CapturedSql).values[0])).toEqual([
        'account-a',
        'account-b',
      ]);
    });
  });

  describe('claimConnectionHealthCheck', () => {
    it('automatic 모드에서 DB NOW·45초 lease·10분 캐시 조건과 순번을 한 UPDATE에 적용한다', async () => {
      mocks.queryRaw.mockResolvedValue([{ outcome: 'CLAIMED', operationSequence: BigInt(21) }]);

      await expect(
        claimConnectionHealthCheck({
          accountId: 'account-1',
          userId: 'user-1',
          mode: 'automatic',
        }),
      ).resolves.toEqual({
        claimed: true,
        leaseToken: '00000000-0000-4000-8000-000000000001',
        operationSequence: BigInt(21),
      });

      const query = capturedQuery(mocks.queryRaw);
      const sql = compactSql(query);
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain('UPDATE "OrderIntegrationAccount" AS account');
      expect(sql).toContain('"healthCheckLeaseUntil" = NOW() +');
      expect(sql).toContain('target."healthCheckLeaseUntil" <= NOW()');
      expect(sql).toContain('target."lastCheckedAt" <= NOW() -');
      expect(sql).toContain('"healthOperationSequence" = account."healthOperationSequence" + 1');
      expect(sql).toContain('RETURNING account."healthOperationSequence" AS "operationSequence"');
      expect(query.values).toEqual([
        'account-1',
        'user-1',
        '00000000-0000-4000-8000-000000000001',
        CONNECTION_HEALTH_LEASE_TTL_MS,
        AUTOMATIC_HEALTH_CHECK_FRESH_MS,
        'CACHED',
      ]);
    });

    it('manual 모드에는 30초 제한과 THROTTLED 분류를 바인딩한다', async () => {
      mocks.queryRaw.mockResolvedValue([{ outcome: 'THROTTLED', operationSequence: null }]);

      await expect(
        claimConnectionHealthCheck({
          accountId: 'account-2',
          userId: 'user-2',
          mode: 'manual',
        }),
      ).resolves.toEqual({ claimed: false, reason: 'THROTTLED' });

      const query = capturedQuery(mocks.queryRaw);
      expect(query.values).toContain(MANUAL_HEALTH_CHECK_THROTTLE_MS);
      expect(query.values).toContain('THROTTLED');
      expect(query.values).not.toContain(AUTOMATIC_HEALTH_CHECK_FRESH_MS);
    });

    it.each([
      'NOT_FOUND',
      'INACTIVE',
      'CACHED',
      'THROTTLED',
      'IN_PROGRESS',
    ] as const)('%s 비획득 결과를 구분한다', async (reason) => {
      mocks.queryRaw.mockResolvedValue([{ outcome: reason, operationSequence: null }]);

      await expect(
        claimConnectionHealthCheck({
          accountId: 'account-1',
          userId: 'user-1',
          mode: reason === 'THROTTLED' ? 'manual' : 'automatic',
        }),
      ).resolves.toEqual({ claimed: false, reason });
    });

    it('계정·사용자·lease token을 파라미터로만 전달한다', async () => {
      const malicious = `x'; DROP TABLE "OrderIntegrationAccount"; --`;
      mocks.queryRaw.mockResolvedValue([{ outcome: 'NOT_FOUND', operationSequence: null }]);

      await claimConnectionHealthCheck({
        accountId: malicious,
        userId: `${malicious}:user`,
        mode: 'automatic',
      });

      const query = capturedQuery(mocks.queryRaw);
      expect(query.sql).not.toContain(malicious);
      expect(query.values).toContain(malicious);
      expect(query.values).toContain(`${malicious}:user`);
      expect(query.values).toContain('00000000-0000-4000-8000-000000000001');
    });

    it('repository mock: lease 만료 전 IN_PROGRESS 뒤 만료 조건 충족 시 CLAIMED로 재획득한다', async () => {
      mocks.queryRaw
        .mockResolvedValueOnce([{ outcome: 'IN_PROGRESS', operationSequence: null }])
        .mockResolvedValueOnce([{ outcome: 'CLAIMED', operationSequence: BigInt(32) }]);

      const beforeExpiry = await claimConnectionHealthCheck({
        accountId: 'account-lease',
        userId: 'user-1',
        mode: 'automatic',
      });
      const afterExpiry = await claimConnectionHealthCheck({
        accountId: 'account-lease',
        userId: 'user-1',
        mode: 'automatic',
      });

      expect(beforeExpiry).toEqual({ claimed: false, reason: 'IN_PROGRESS' });
      expect(afterExpiry).toEqual({
        claimed: true,
        leaseToken: '00000000-0000-4000-8000-000000000001',
        operationSequence: BigInt(32),
      });
      expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
      for (const [query] of mocks.queryRaw.mock.calls) {
        expect(compactSql(query as CapturedSql)).toContain(
          'target."healthCheckLeaseUntil" <= NOW()',
        );
      }
    });
  });

  describe('releaseConnectionHealthCheckLease', () => {
    it('정확한 lease token이 일치해 1행을 해제하면 true를 반환한다', async () => {
      mocks.executeRaw.mockResolvedValue(1);

      await expect(
        releaseConnectionHealthCheckLease({
          accountId: 'account-1',
          userId: 'user-1',
          leaseToken: 'lease-1',
        }),
      ).resolves.toBe(true);

      const query = capturedQuery(mocks.executeRaw);
      const sql = compactSql(query);
      expect(sql).toContain('"healthCheckLeaseToken" = NULL');
      expect(sql).toContain('"healthCheckLeaseUntil" = NULL');
      expect(sql).toContain('AND "healthCheckLeaseToken" = ?');
      expect(query.values).toEqual(['account-1', 'user-1', 'lease-1']);
    });

    it('잘못된 lease token으로 affectedRows=0이면 다른 lease를 해제하지 않고 false를 반환한다', async () => {
      mocks.executeRaw.mockResolvedValue(0);

      await expect(
        releaseConnectionHealthCheckLease({
          accountId: 'account-1',
          userId: 'user-1',
          leaseToken: 'wrong-lease-token',
        }),
      ).resolves.toBe(false);

      const query = capturedQuery(mocks.executeRaw);
      expect(compactSql(query)).toContain('AND "healthCheckLeaseToken" = ?');
      expect(query.values).toEqual(['account-1', 'user-1', 'wrong-lease-token']);
    });
  });
});
