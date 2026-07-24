import { describe, expect, it, vi } from 'vitest';

import {
  prepareShipmentMatchForTransmit,
  type ShipmentTransmissionReadPrismaClient,
} from '@/app/lib/order-integration/transmission/read-repository';

type MatchRow = {
  id: string;
  userId: string;
  uploadBatchId: string;
  orderSyncOrderId: string | null;
  provider: 'SMARTSTORE' | 'COUPANG' | null;
  integrationAccountId: string | null;
  transmissionStatus: string;
};

type OrderRow = {
  id: string;
  userId: string;
  provider: 'SMARTSTORE' | 'COUPANG';
  integrationAccountId: string | null;
};

function buildClient(input: {
  match?: MatchRow | null;
  order?: OrderRow | null;
}): {
  client: ShipmentTransmissionReadPrismaClient;
  updateMany: ReturnType<typeof vi.fn>;
} {
  const updateMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const match = input.match;
    if (!match) return { count: 0 };
    const where = args.where;
    if (where.id !== match.id) return { count: 0 };
    if (where.userId !== match.userId) return { count: 0 };
    if (where.uploadBatchId !== match.uploadBatchId) return { count: 0 };
    const statuses = (where.transmissionStatus as { in: string[] } | undefined)?.in;
    if (statuses && !statuses.includes(match.transmissionStatus)) return { count: 0 };

    const and = where.AND as Array<Record<string, unknown>> | undefined;
    if (and) {
      for (const clause of and) {
        const or = clause.OR as Array<Record<string, unknown>>;
        const ok = or.some((entry) => {
          if ('provider' in entry) {
            return entry.provider === null
              ? match.provider == null
              : match.provider === entry.provider;
          }
          if ('integrationAccountId' in entry) {
            return entry.integrationAccountId === null
              ? match.integrationAccountId == null
              : match.integrationAccountId === entry.integrationAccountId;
          }
          return false;
        });
        if (!ok) return { count: 0 };
      }
    }

    match.provider = 'SMARTSTORE';
    match.integrationAccountId = 'acc-1';
    match.transmissionStatus = 'READY';
    return { count: 1 };
  });

  const client = {
    shipmentUploadBatch: { findFirst: vi.fn() },
    shipmentMatch: {
      findMany: vi.fn(),
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const match = input.match;
        if (!match) return null;
        if (args.where.id !== match.id) return null;
        if (args.where.userId !== match.userId) return null;
        if (args.where.uploadBatchId !== match.uploadBatchId) return null;
        return { ...match };
      }),
      updateMany,
    },
    orderSyncOrder: {
      findFirst: vi.fn(async (args: { where: { id: string; userId: string } }) => {
        const order = input.order;
        if (!order) return null;
        if (args.where.id !== order.id || args.where.userId !== order.userId) return null;
        return { ...order };
      }),
    },
    orderIntegrationAccount: { findFirst: vi.fn() },
  } as unknown as ShipmentTransmissionReadPrismaClient;

  return { client, updateMany };
}

const baseMatch = (overrides: Partial<MatchRow> = {}): MatchRow => ({
  id: 'match-1',
  userId: 'user-a',
  uploadBatchId: 'batch-1',
  orderSyncOrderId: 'order-1',
  provider: null,
  integrationAccountId: null,
  transmissionStatus: 'READY',
  ...overrides,
});

const baseOrder = (overrides: Partial<OrderRow> = {}): OrderRow => ({
  id: 'order-1',
  userId: 'user-a',
  provider: 'SMARTSTORE',
  integrationAccountId: 'acc-1',
  ...overrides,
});

describe('prepareShipmentMatchForTransmit', () => {
  it('fills null provider/account from candidate and promotes READY', async () => {
    const match = baseMatch({ transmissionStatus: 'NONE' });
    const { client, updateMany } = buildClient({ match, order: baseOrder() });

    const result = await prepareShipmentMatchForTransmit(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
    });

    expect(result).toEqual({ ok: true, reasonCode: null });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(match.transmissionStatus).toBe('READY');
    expect(match.provider).toBe('SMARTSTORE');
    expect(match.integrationAccountId).toBe('acc-1');
  });

  it('keeps matching existing provider/account without conflict', async () => {
    const match = baseMatch({
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
      transmissionStatus: 'READY',
    });
    const { client, updateMany } = buildClient({ match, order: baseOrder() });

    const result = await prepareShipmentMatchForTransmit(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
    });

    expect(result.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('blocks when existing provider differs (no overwrite)', async () => {
    const match = baseMatch({
      provider: 'COUPANG',
      integrationAccountId: 'acc-1',
    });
    const { client, updateMany } = buildClient({
      match,
      order: baseOrder({ provider: 'SMARTSTORE' }),
    });

    const result = await prepareShipmentMatchForTransmit(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
    });

    expect(result).toEqual({ ok: false, reasonCode: 'SCOPE_CONFLICT' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(match.provider).toBe('COUPANG');
  });

  it('blocks when existing account differs (no overwrite)', async () => {
    const match = baseMatch({
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-other',
    });
    const { client, updateMany } = buildClient({ match, order: baseOrder() });

    const result = await prepareShipmentMatchForTransmit(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
    });

    expect(result).toEqual({ ok: false, reasonCode: 'SCOPE_CONFLICT' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(match.integrationAccountId).toBe('acc-other');
  });

  it('blocks other user data', async () => {
    const match = baseMatch({ userId: 'user-a' });
    const { client, updateMany } = buildClient({ match, order: baseOrder() });

    const result = await prepareShipmentMatchForTransmit(client, {
      userId: 'user-b',
      batchId: 'batch-1',
      matchId: 'match-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
    });

    expect(result).toEqual({ ok: false, reasonCode: 'MATCH_NOT_FOUND' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not change SENT / PROCESSING / UNKNOWN', async () => {
    for (const status of ['SENT', 'PROCESSING', 'UNKNOWN'] as const) {
      const match = baseMatch({
        transmissionStatus: status,
        provider: null,
        integrationAccountId: null,
      });
      const { client, updateMany } = buildClient({ match, order: baseOrder() });

      const result = await prepareShipmentMatchForTransmit(client, {
        userId: 'user-a',
        batchId: 'batch-1',
        matchId: 'match-1',
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-1',
      });

      expect(result).toEqual({ ok: false, reasonCode: 'STATUS_NOT_PREPARABLE' });
      expect(updateMany).not.toHaveBeenCalled();
      expect(match.transmissionStatus).toBe(status);
      expect(match.provider).toBeNull();
    }
  });
});
