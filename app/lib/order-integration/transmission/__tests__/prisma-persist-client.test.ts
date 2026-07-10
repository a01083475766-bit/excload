import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '@prisma/client';

import {
  createPrismaShipmentTransmissionPersistClient,
  type PrismaTransmissionClientLike,
} from '@/app/lib/order-integration/transmission/prisma-persist-client';
import { classifyPrismaPersistFailure } from '@/app/lib/order-integration/transmission/prisma-persist-error';
import {
  toAttemptCreateData,
  toAttemptUpdateData,
  toMallLineItemIdsJsonValue,
  toMatchWhereInput,
  toResponseSummaryJsonValue,
} from '@/app/lib/order-integration/transmission/prisma-persist-mappers';

type SpyFn = ReturnType<typeof vi.fn>;

function createSplitPrisma() {
  const rootMatchUpdate = vi.fn(async () => ({ count: 1 }));
  const txMatchUpdate = vi.fn(async () => ({ count: 1 }));
  const txMatchFindFirst = vi.fn(async () => null);
  const txMatchFindMany = vi.fn(async () => [] as Array<{ transmissionStatus: string }>);
  const txAttemptCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'att-1',
    ...data,
    orderSyncOrderId: data.orderSyncOrderId ?? null,
    integrationAccountId: data.integrationAccountId ?? null,
    courierCode: data.courierCode ?? null,
    courierName: data.courierName ?? null,
    providerRequestId: data.providerRequestId ?? null,
    responseSummaryJson: data.responseSummaryJson ?? null,
    errorCode: data.errorCode ?? null,
    errorMessage: data.errorMessage ?? null,
    retryable: data.retryable ?? false,
    fingerprintVersion: data.fingerprintVersion ?? 1,
    dispatchedAt: data.dispatchedAt ?? null,
    completedAt: data.completedAt ?? null,
    mallLineItemIdsJson: data.mallLineItemIdsJson ?? null,
  }));
  const txAttemptFindFirst = vi.fn(async () => null);
  const txAttemptUpdate = vi.fn(async () => ({ count: 1 }));
  const txOrderUpdate = vi.fn(async () => ({ count: 1 }));

  const txDelegate = {
    shipmentMatch: {
      updateMany: txMatchUpdate,
      findFirst: txMatchFindFirst,
      findMany: txMatchFindMany,
    },
    shipmentTransmissionAttempt: {
      create: txAttemptCreate,
      findFirst: txAttemptFindFirst,
      updateMany: txAttemptUpdate,
    },
    orderSyncOrder: { updateMany: txOrderUpdate },
  };

  const rootDelegate = {
    shipmentMatch: {
      updateMany: rootMatchUpdate,
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    shipmentTransmissionAttempt: {
      create: vi.fn(async () => {
        throw new Error('root create should not run');
      }),
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    orderSyncOrder: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };

  const $transaction = vi.fn(async (fn: (tx: typeof txDelegate) => Promise<unknown>) =>
    fn(txDelegate),
  );

  const prisma = {
    ...rootDelegate,
    $transaction,
  } as unknown as PrismaTransmissionClientLike;

  return {
    prisma,
    spies: {
      rootMatchUpdate,
      txMatchUpdate,
      txMatchFindFirst,
      txMatchFindMany,
      txAttemptCreate,
      txAttemptFindFirst,
      txAttemptUpdate,
      txOrderUpdate,
      $transaction,
    },
  };
}

function firstCallArg(spy: SpyFn): Record<string, unknown> {
  const calls = spy.mock.calls as unknown as Array<[Record<string, unknown>]>;
  const arg = calls[0]?.[0];
  if (!arg) throw new Error('expected spy call');
  return arg;
}

describe('createPrismaShipmentTransmissionPersistClient', () => {
  let fake: ReturnType<typeof createSplitPrisma>;

  beforeEach(() => {
    fake = createSplitPrisma();
  });

  it('does not connect on factory alone', () => {
    createPrismaShipmentTransmissionPersistClient(fake.prisma);
    expect(fake.spies.$transaction).not.toHaveBeenCalled();
  });

  it('uses tx delegates only — root write spies stay idle', async () => {
    const client = createPrismaShipmentTransmissionPersistClient(fake.prisma);
    await client.$transaction(async (tx) => {
      await tx.shipmentMatch.updateMany({
        where: { id: 'm', userId: 'u', transmissionStatus: 'READY' },
        data: { transmissionStatus: 'PROCESSING' },
      });
      await tx.shipmentTransmissionAttempt.create({
        data: {
          userId: 'u',
          shipmentMatchId: 'm',
          uploadBatchId: 'b',
          provider: 'COUPANG',
          mallOrderNo: 'M',
          excloadOrderNo: 'E',
          trackingNumberNormalized: '1',
          payloadFingerprint: 'a'.repeat(64),
          attemptNo: 1,
          status: 'PENDING',
          executionToken: 't',
          startedAt: new Date(),
          retryable: false,
        },
      });
    });
    expect(fake.spies.txMatchUpdate).toHaveBeenCalled();
    expect(fake.spies.txAttemptCreate).toHaveBeenCalled();
    expect(fake.spies.rootMatchUpdate).not.toHaveBeenCalled();
  });

  it('rejects transaction failures without swallowing', async () => {
    const client = createPrismaShipmentTransmissionPersistClient(fake.prisma);
    fake.spies.txMatchUpdate.mockRejectedValueOnce(new Error('tx failed'));
    await expect(
      client.$transaction(async (tx) =>
        tx.shipmentMatch.updateMany({ where: { id: 'm' }, data: { transmissionStatus: 'SENT' } }),
      ),
    ).rejects.toThrow('tx failed');
  });

  it('strips extra/PII keys from Prisma create args', async () => {
    const client = createPrismaShipmentTransmissionPersistClient(fake.prisma);
    await client.$transaction(async (tx) => {
      await tx.shipmentTransmissionAttempt.create({
        data: {
          userId: 'u',
          shipmentMatchId: 'm',
          uploadBatchId: 'b',
          provider: 'COUPANG',
          integrationAccountId: null,
          mallOrderNo: 'M',
          excloadOrderNo: 'E',
          mallLineItemIdsJson: ['L1'],
          trackingNumberNormalized: '1',
          payloadFingerprint: 'a'.repeat(64),
          attemptNo: 1,
          status: 'PENDING',
          executionToken: 't',
          startedAt: new Date(),
          retryable: false,
          receiverPhone: '010',
          credential: 'x',
          rawRowJson: { a: 1 },
          normalizedPayloadJson: {},
        },
      });
    });
    const data = firstCallArg(fake.spies.txAttemptCreate).data as Record<string, unknown>;
    expect(data).not.toHaveProperty('receiverPhone');
    expect(data).not.toHaveProperty('credential');
    expect(data).not.toHaveProperty('rawRowJson');
    expect(data).not.toHaveProperty('normalizedPayloadJson');
    expect(data.integrationAccountId).toBeNull();
  });

  it('maps reserve where with scope AND lease OR', async () => {
    const client = createPrismaShipmentTransmissionPersistClient(fake.prisma);
    const now = new Date('2026-07-11T00:00:00.000Z');
    await client.$transaction(async (tx) => {
      await tx.shipmentMatch.updateMany({
        where: {
          id: 'match-1',
          userId: 'user-a',
          uploadBatchId: 'batch-1',
          provider: 'COUPANG',
          integrationAccountId: 'acc-1',
          transmissionStatus: 'READY',
          OR: [
            { transmissionLeaseExpiresAt: null },
            { transmissionLeaseExpiresAt: { lt: now } },
          ],
          rawRowJson: 'should-drop',
        },
        data: {
          transmissionStatus: 'PROCESSING',
          transmissionLeaseToken: 'tok',
          transmissionLeaseExpiresAt: now,
          secret: 'nope',
        },
      });
    });
    const arg = firstCallArg(fake.spies.txMatchUpdate);
    expect(arg.where).toEqual({
      id: 'match-1',
      userId: 'user-a',
      uploadBatchId: 'batch-1',
      provider: 'COUPANG',
      integrationAccountId: 'acc-1',
      transmissionStatus: 'READY',
      OR: [
        { transmissionLeaseExpiresAt: null },
        { transmissionLeaseExpiresAt: { lt: now } },
      ],
    });
    expect(arg.data).not.toHaveProperty('secret');
    expect(arg.data).toMatchObject({
      transmissionStatus: 'PROCESSING',
      transmissionLeaseToken: 'tok',
    });
  });

  it('completion where has no lease expiry; clears lease tokens', async () => {
    const client = createPrismaShipmentTransmissionPersistClient(fake.prisma);
    await client.$transaction(async (tx) => {
      await tx.shipmentTransmissionAttempt.updateMany({
        where: {
          id: 'att',
          userId: 'u',
          status: 'PROCESSING',
          executionToken: 'tok',
        },
        data: { status: 'SUCCESS', responseSummaryJson: null, completedAt: new Date() },
      });
      await tx.shipmentMatch.updateMany({
        where: {
          id: 'm',
          userId: 'u',
          transmissionStatus: 'PROCESSING',
          transmissionLeaseToken: 'tok',
        },
        data: {
          transmissionStatus: 'SENT',
          transmissionLeaseToken: null,
          transmissionLeaseExpiresAt: null,
        },
      });
    });
    const attemptWhere = firstCallArg(fake.spies.txAttemptUpdate).where as Record<
      string,
      unknown
    >;
    expect(attemptWhere).not.toHaveProperty('transmissionLeaseExpiresAt');
    expect(JSON.stringify(attemptWhere)).not.toMatch(/lt/);
    const matchData = firstCallArg(fake.spies.txMatchUpdate).data as Record<string, unknown>;
    expect(matchData.transmissionLeaseToken).toBeNull();
    expect(matchData.transmissionLeaseExpiresAt).toBeNull();
  });

  it('order summary scoped by userId + orderSyncOrderId', async () => {
    const client = createPrismaShipmentTransmissionPersistClient(fake.prisma);
    await client.$transaction(async (tx) => {
      await tx.shipmentMatch.findMany({
        where: { userId: 'user-a', orderSyncOrderId: 'order-1' },
      });
      await tx.orderSyncOrder.updateMany({
        where: { id: 'order-1', userId: 'user-a' },
        data: { transmissionStatus: 'SENT' },
      });
    });
    expect(firstCallArg(fake.spies.txMatchFindMany).where).toEqual({
      userId: 'user-a',
      orderSyncOrderId: 'order-1',
    });
    expect(firstCallArg(fake.spies.txOrderUpdate).where).toEqual({
      id: 'order-1',
      userId: 'user-a',
    });
  });
});

describe('JSON null / allowlist mappers', () => {
  it('responseSummary: missing → DbNull, present → object, omit on update', () => {
    expect(toResponseSummaryJsonValue(null)).toBe(Prisma.DbNull);
    expect(toResponseSummaryJsonValue(undefined)).toBe(Prisma.DbNull);
    expect(toResponseSummaryJsonValue({ httpStatus: 200, message: 'ok' })).toEqual({
      httpStatus: 200,
      message: 'ok',
    });
    expect(toResponseSummaryJsonValue({ httpStatus: 200, raw: 'x' } as never)).toEqual({
      httpStatus: 200,
    });
    const updateOmit = toAttemptUpdateData({ status: 'SUCCESS' });
    expect(updateOmit).not.toHaveProperty('responseSummaryJson');
    const updateNull = toAttemptUpdateData({ responseSummaryJson: null });
    expect(updateNull.responseSummaryJson).toBe(Prisma.DbNull);
  });

  it('mallLineItemIds: null / empty / strings / non-array', () => {
    expect(toMallLineItemIdsJsonValue(null)).toBe(Prisma.DbNull);
    expect(toMallLineItemIdsJsonValue([])).toEqual([]);
    expect(toMallLineItemIdsJsonValue(['a', 'b'])).toEqual(['a', 'b']);
    expect(toMallLineItemIdsJsonValue(['a', 1 as unknown as string])).toEqual(['a']);
    expect(toMallLineItemIdsJsonValue({ phone: '010' })).toBe(Prisma.DbNull);
  });

  it('never uses JsonNull for these fields', () => {
    expect(toResponseSummaryJsonValue(null)).not.toBe(Prisma.JsonNull);
    expect(toMallLineItemIdsJsonValue(null)).not.toBe(Prisma.JsonNull);
  });

  it('create strips unsafe keys', () => {
    const data = toAttemptCreateData({
      userId: 'u',
      shipmentMatchId: 'm',
      uploadBatchId: 'b',
      provider: 'COUPANG',
      mallOrderNo: 'M',
      excloadOrderNo: 'E',
      trackingNumberNormalized: '1',
      payloadFingerprint: 'f'.repeat(64),
      attemptNo: 1,
      status: 'PENDING',
      executionToken: 't',
      startedAt: new Date(),
      retryable: false,
      receiverName: '홍',
      secretKey: 'x',
    });
    expect(data).not.toHaveProperty('receiverName');
    expect(data).not.toHaveProperty('secretKey');
  });
});

describe('integrationAccountId / lease where mapping', () => {
  it('maps null and string account equality distinctly', () => {
    expect(toMatchWhereInput({ integrationAccountId: null })).toEqual({
      integrationAccountId: null,
    });
    expect(toMatchWhereInput({ integrationAccountId: 'acc-1' })).toEqual({
      integrationAccountId: 'acc-1',
    });
    const nullWhere = toMatchWhereInput({
      id: 'm',
      userId: 'u',
      integrationAccountId: null,
      transmissionStatus: 'READY',
    });
    const strWhere = toMatchWhereInput({
      id: 'm',
      userId: 'u',
      integrationAccountId: 'acc-1',
      transmissionStatus: 'READY',
    });
    expect(nullWhere.integrationAccountId).toBeNull();
    expect(strWhere.integrationAccountId).toBe('acc-1');
    expect(nullWhere).not.toEqual(strWhere);
  });

  it('keeps lease OR nested under scope AND', () => {
    const now = new Date('2026-07-11T00:00:00.000Z');
    const where = toMatchWhereInput({
      id: 'match-1',
      userId: 'user-a',
      uploadBatchId: 'batch-1',
      provider: 'COUPANG',
      integrationAccountId: 'acc-1',
      transmissionStatus: 'READY',
      OR: [
        { transmissionLeaseExpiresAt: null },
        { transmissionLeaseExpiresAt: { lt: now } },
      ],
    });
    expect(where).toEqual({
      id: 'match-1',
      userId: 'user-a',
      uploadBatchId: 'batch-1',
      provider: 'COUPANG',
      integrationAccountId: 'acc-1',
      transmissionStatus: 'READY',
      OR: [
        { transmissionLeaseExpiresAt: null },
        { transmissionLeaseExpiresAt: { lt: now } },
      ],
    });
  });
});

describe('classifyPrismaPersistFailure', () => {
  it('handles official P2002, duck-typed P2002, generic Error, other codes safely', () => {
    const official = new Prisma.PrismaClientKnownRequestError('Unique ... host=x', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(classifyPrismaPersistFailure(official)).toEqual({
      reasonCode: 'ATTEMPT_NUMBER_CONFLICT',
      safeMessage: 'attempt number conflict',
      prismaCode: 'P2002',
    });

    expect(classifyPrismaPersistFailure({ code: 'P2002', name: 'PrismaClientKnownRequestError' })).toEqual({
      reasonCode: 'ATTEMPT_NUMBER_CONFLICT',
      safeMessage: 'attempt number conflict',
      prismaCode: 'P2002',
    });

    const generic = classifyPrismaPersistFailure(new Error('postgresql://u:p@host/db boom'));
    expect(generic.reasonCode).toBe('PERSISTENCE_ERROR');
    expect(generic.safeMessage).toBe('persistence error');
    expect(generic.safeMessage).not.toMatch(/postgresql|host/);

    const other = classifyPrismaPersistFailure(
      new Prisma.PrismaClientKnownRequestError('conn', { code: 'P1001', clientVersion: 't' }),
    );
    expect(other.reasonCode).toBe('PERSISTENCE_ERROR');
    expect(other.safeMessage).toBe('persistence error');
  });
});
