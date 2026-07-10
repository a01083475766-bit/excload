import { beforeEach, describe, expect, it } from 'vitest';

import type { OrderIntegrationProvider } from '@prisma/client';

import { createMemoryTransmissionPersistClient } from '@/app/lib/order-integration/transmission/__tests__/support/memory-persist-client';
import {
  completeTransmissionAttemptFailure,
  completeTransmissionAttemptSuccess,
  completeTransmissionAttemptUnknown,
  markTransmissionAttemptDispatched,
  recoverStalePendingAttempt,
  recoverStaleProcessingAttempt,
  reserveTransmissionAttempt,
  sanitizeTransmissionErrorMessage,
  toPersistedResponseSummaryJson,
  type ShipmentTransmissionMatchRow,
} from '@/app/lib/order-integration/transmission/repository';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

const CANDIDATE: ShipmentTransmissionCandidate = {
  provider: 'COUPANG',
  integrationAccountId: 'acc-1',
  uploadBatchId: 'batch-1',
  matchId: 'match-1',
  orderSyncOrderId: 'order-1',
  mallOrderNo: 'MALL-1',
  excloadOrderNo: 'EXC-1',
  mallLineItemIds: ['PO-1'],
  trackingNumber: '012345678901',
  courierCode: 'CJ',
  courierName: 'CJ대한통운',
};

function readyMatch(
  overrides: Partial<ShipmentTransmissionMatchRow> = {},
): ShipmentTransmissionMatchRow {
  return {
    id: 'match-1',
    userId: 'user-a',
    uploadBatchId: 'batch-1',
    provider: 'COUPANG' as OrderIntegrationProvider,
    integrationAccountId: 'acc-1',
    orderSyncOrderId: 'order-1',
    transmissionStatus: 'READY',
    transmissionLeaseToken: null,
    transmissionLeaseExpiresAt: null,
    lastTransmissionAttemptAt: null,
    transmissionErrorMessage: null,
    ...overrides,
  };
}

describe('transmission repository', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');
  const leaseExpiresAt = new Date('2026-07-10T12:05:00.000Z');
  let mem: ReturnType<typeof createMemoryTransmissionPersistClient>;

  beforeEach(() => {
    mem = createMemoryTransmissionPersistClient();
    mem.seedMatch(readyMatch());
    mem.seedOrder({ id: 'order-1', userId: 'user-a', transmissionStatus: 'NONE' });
  });

  it('reserves READY match and creates PENDING attemptNo 1', async () => {
    const result = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    expect(result.success).toBe(true);
    expect(result.attemptNo).toBe(1);
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('PROCESSING');
    expect(mem.getAttempt(result.attemptId!)?.status).toBe('PENDING');
    expect(JSON.stringify(mem.getAttempt(result.attemptId!))).not.toMatch(
      /secret|receiverPhone|credential/i,
    );
  });

  it('increments attemptNo', async () => {
    await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    mem.seedMatch(
      readyMatch({
        transmissionLeaseExpiresAt: new Date('2026-07-10T11:00:00.000Z'),
      }),
    );
    const second = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-2',
      now,
      leaseExpiresAt,
    });
    expect(second.attemptNo).toBe(2);
  });

  it('blocks SENT / PROCESSING / UNKNOWN / FAILED reserve', async () => {
    for (const status of ['SENT', 'PROCESSING', 'UNKNOWN', 'FAILED'] as const) {
      mem.seedMatch(readyMatch({ transmissionStatus: status }));
      const result = await reserveTransmissionAttempt(mem.client, {
        userId: 'user-a',
        candidate: CANDIDATE,
        payloadFingerprint: 'a'.repeat(64),
        executionToken: 't',
        now,
        leaseExpiresAt,
      });
      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe('MATCH_NOT_READY');
    }
  });

  it('blocks active unexpired lease', async () => {
    mem.seedMatch(
      readyMatch({
        transmissionLeaseToken: 'busy',
        transmissionLeaseExpiresAt: new Date('2026-07-10T12:10:00.000Z'),
      }),
    );
    const result = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 't',
      now,
      leaseExpiresAt,
    });
    expect(result.reasonCode).toBe('LEASE_NOT_ACQUIRED');
  });

  it('dispatches PENDING → PROCESSING', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    const dispatched = await markTransmissionAttemptDispatched(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    expect(dispatched.success).toBe(true);
    expect(mem.getAttempt(reserved.attemptId!)?.dispatchedAt).toEqual(now);
  });

  it('blocks dispatch on token mismatch', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    const result = await markTransmissionAttemptDispatched(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'wrong',
      now,
    });
    expect(result.reasonCode).toBe('LEASE_TOKEN_MISMATCH');
  });

  it('completes success / failure / unknown', async () => {
    async function prepare() {
      mem = createMemoryTransmissionPersistClient();
      mem.seedMatch(readyMatch());
      mem.seedOrder({ id: 'order-1', userId: 'user-a', transmissionStatus: 'NONE' });
      const reserved = await reserveTransmissionAttempt(mem.client, {
        userId: 'user-a',
        candidate: CANDIDATE,
        payloadFingerprint: 'a'.repeat(64),
        executionToken: 'token-1',
        now,
        leaseExpiresAt,
      });
      await markTransmissionAttemptDispatched(mem.client, {
        userId: 'user-a',
        shipmentMatchId: 'match-1',
        attemptId: reserved.attemptId!,
        executionToken: 'token-1',
        now,
      });
      return reserved.attemptId!;
    }

    const successId = await prepare();
    await completeTransmissionAttemptSuccess(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: successId,
      executionToken: 'token-1',
      now,
      providerRequestId: 'req-1',
      responseSummary: { httpStatus: 200, message: 'ok' },
    });
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('SENT');
    expect(mem.getOrder('order-1')?.transmissionStatus).toBe('SENT');
    expect(mem.getAttempt(successId)?.responseSummaryJson).toEqual({
      httpStatus: 200,
      message: 'ok',
    });

    const failId = await prepare();
    await completeTransmissionAttemptFailure(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: failId,
      executionToken: 'token-1',
      now,
      errorCode: 'X',
      errorMessage: 'Bearer abcdef failure',
      retryable: true,
      responseSummary: null,
    });
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('FAILED');
    expect(mem.getAttempt(failId)?.errorMessage).toContain('[REDACTED]');

    const unknownId = await prepare();
    await completeTransmissionAttemptUnknown(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: unknownId,
      executionToken: 'token-1',
      now,
      errorCode: 'TIMEOUT',
      errorMessage: 'timeout',
    });
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('UNKNOWN');
  });

  it('blocks stale writer on complete', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    await markTransmissionAttemptDispatched(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    const blocked = await completeTransmissionAttemptSuccess(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'other',
      now,
      providerRequestId: null,
      responseSummary: null,
    });
    expect(blocked.reasonCode).toBe('LEASE_TOKEN_MISMATCH');
  });

  it('recovers stale PENDING and PROCESSING', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    mem.seedMatch({
      ...mem.getMatch('match-1')!,
      transmissionLeaseExpiresAt: new Date('2026-07-10T11:00:00.000Z'),
    });
    const recovered = await recoverStalePendingAttempt(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    expect(recovered.reasonCode).toBe('STALE_PENDING_RECOVERED');
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('READY');

    mem.seedMatch(readyMatch());
    const r2 = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'b'.repeat(64),
      executionToken: 'token-2',
      now,
      leaseExpiresAt,
    });
    await markTransmissionAttemptDispatched(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: r2.attemptId!,
      executionToken: 'token-2',
      now,
    });
    mem.seedMatch({
      ...mem.getMatch('match-1')!,
      transmissionLeaseExpiresAt: new Date('2026-07-10T11:00:00.000Z'),
    });
    const unk = await recoverStaleProcessingAttempt(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: r2.attemptId!,
      executionToken: 'token-2',
      now,
    });
    expect(unk.reasonCode).toBe('STALE_PROCESSING_MARKED_UNKNOWN');
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('UNKNOWN');
  });

  it('does not recover PENDING with dispatchedAt set', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    await mem.client.$transaction(async (tx) => {
      await tx.shipmentTransmissionAttempt.updateMany({
        where: { id: reserved.attemptId },
        data: { status: 'PENDING', dispatchedAt: now },
      });
    });
    mem.seedMatch({
      ...mem.getMatch('match-1')!,
      transmissionLeaseExpiresAt: new Date('2026-07-10T11:00:00.000Z'),
    });
    const result = await recoverStalePendingAttempt(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    expect(result.reasonCode).toBe('STALE_RECOVERY_NOT_ALLOWED');
  });

  it('sanitizes messages and allowlists response summary', () => {
    expect(sanitizeTransmissionErrorMessage('Bearer xyz')!).toContain('[REDACTED]');
    expect(sanitizeTransmissionErrorMessage('Authorization: secret-token')!).toContain(
      '[REDACTED]',
    );
    expect(sanitizeTransmissionErrorMessage('apiKey=abc123 failure')!).toContain('[REDACTED]');
    expect(sanitizeTransmissionErrorMessage('secret: s3cr3t value')!).toContain('[REDACTED]');
    expect(sanitizeTransmissionErrorMessage('x'.repeat(600))!.length).toBe(500);
    expect(toPersistedResponseSummaryJson({ httpStatus: 200, message: 'ok' })).toEqual({
      httpStatus: 200,
      message: 'ok',
    });
  });

  it('completes SUCCESS even when lease time already expired', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    await markTransmissionAttemptDispatched(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    mem.seedMatch({
      ...mem.getMatch('match-1')!,
      transmissionLeaseExpiresAt: new Date('2026-07-10T11:00:00.000Z'),
    });
    const lateNow = new Date('2026-07-10T12:10:00.000Z');
    const completed = await completeTransmissionAttemptSuccess(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now: lateNow,
      providerRequestId: 'req-late',
      responseSummary: { httpStatus: 200 },
    });
    expect(completed.success).toBe(true);
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('SENT');
    expect(mem.getAttempt(reserved.attemptId!)?.status).toBe('SUCCESS');
  });

  it('blocks late SUCCESS after stale PROCESSING recovery', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    await markTransmissionAttemptDispatched(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    mem.seedMatch({
      ...mem.getMatch('match-1')!,
      transmissionLeaseExpiresAt: new Date('2026-07-10T11:00:00.000Z'),
    });
    const recovered = await recoverStaleProcessingAttempt(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    expect(recovered.reasonCode).toBe('STALE_PROCESSING_MARKED_UNKNOWN');

    const late = await completeTransmissionAttemptSuccess(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
      providerRequestId: null,
      responseSummary: null,
    });
    expect(late.success).toBe(false);
    expect(late.reasonCode).toMatch(/ATTEMPT_NOT_PROCESSING|LEASE_TOKEN_MISMATCH/);
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('UNKNOWN');
    expect(mem.getAttempt(reserved.attemptId!)?.status).toBe('UNKNOWN');
  });

  it('blocks stale recovery after SUCCESS completion', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    await markTransmissionAttemptDispatched(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    await completeTransmissionAttemptSuccess(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
      providerRequestId: 'req-1',
      responseSummary: null,
    });
    mem.seedMatch({
      ...mem.getMatch('match-1')!,
      transmissionLeaseExpiresAt: new Date('2026-07-10T11:00:00.000Z'),
      transmissionLeaseToken: 'token-1',
      transmissionStatus: 'SENT',
    });
    const recovered = await recoverStaleProcessingAttempt(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });
    expect(recovered.success).toBe(false);
    expect(recovered.reasonCode).toMatch(/STALE_RECOVERY_NOT_ALLOWED|LEASE_TOKEN_MISMATCH/);
    expect(mem.getAttempt(reserved.attemptId!)?.status).toBe('SUCCESS');
  });

  it('does not create Attempt when lease acquisition fails', async () => {
    mem.seedMatch(readyMatch({ transmissionStatus: 'SENT' }));
    const result = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    expect(result.success).toBe(false);
    expect(result.attemptId).toBeNull();
    expect(mem.getAttempt('any')).toBeNull();
    // no attempts created — scan via second reserve on READY would be attemptNo 1
    mem.seedMatch(readyMatch());
    const next = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-2',
      now,
      leaseExpiresAt,
    });
    expect(next.attemptNo).toBe(1);
  });

  it('rolls back Match PROCESSING when Attempt create fails', async () => {
    const failingClient = {
      $transaction: async <T>(
        fn: Parameters<typeof mem.client.$transaction>[0],
      ): Promise<T> =>
        mem.client.$transaction(async (tx) =>
          fn({
            ...tx,
            shipmentTransmissionAttempt: {
              ...tx.shipmentTransmissionAttempt,
              create: async () => {
                throw new Error('Unique constraint failed on attemptNo');
              },
            },
          }) as Promise<T>,
        ),
    };
    const result = await reserveTransmissionAttempt(failingClient, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('ATTEMPT_NUMBER_CONFLICT');
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('READY');
    expect(mem.getMatch('match-1')?.transmissionLeaseToken).toBeNull();
  });

  it('returns ATTEMPT_NUMBER_CONFLICT once without retry loop', async () => {
    let createCalls = 0;
    const failingClient = {
      $transaction: async <T>(
        fn: Parameters<typeof mem.client.$transaction>[0],
      ): Promise<T> =>
        mem.client.$transaction(async (tx) =>
          fn({
            ...tx,
            shipmentTransmissionAttempt: {
              ...tx.shipmentTransmissionAttempt,
              create: async () => {
                createCalls += 1;
                throw new Error('Unique constraint failed on attemptNo');
              },
            },
          }) as Promise<T>,
        ),
    };
    const result = await reserveTransmissionAttempt(failingClient, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    expect(result.reasonCode).toBe('ATTEMPT_NUMBER_CONFLICT');
    expect(createCalls).toBe(1);
  });

  it('rolls back Attempt SUCCESS when Match update fails', async () => {
    const reserved = await reserveTransmissionAttempt(mem.client, {
      userId: 'user-a',
      candidate: CANDIDATE,
      payloadFingerprint: 'a'.repeat(64),
      executionToken: 'token-1',
      now,
      leaseExpiresAt,
    });
    await markTransmissionAttemptDispatched(mem.client, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
    });

    const failingClient = {
      $transaction: async <T>(
        fn: Parameters<typeof mem.client.$transaction>[0],
      ): Promise<T> =>
        mem.client.$transaction(async (tx) =>
          fn({
            ...tx,
            shipmentMatch: {
              ...tx.shipmentMatch,
              updateMany: async () => ({ count: 0 }),
            },
          }) as Promise<T>,
        ),
    };

    const result = await completeTransmissionAttemptSuccess(failingClient, {
      userId: 'user-a',
      shipmentMatchId: 'match-1',
      attemptId: reserved.attemptId!,
      executionToken: 'token-1',
      now,
      providerRequestId: null,
      responseSummary: null,
    });
    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('LEASE_TOKEN_MISMATCH');
    expect(mem.getAttempt(reserved.attemptId!)?.status).toBe('PROCESSING');
    expect(mem.getMatch('match-1')?.transmissionStatus).toBe('PROCESSING');
  });
});
