import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildLinkableOrdersWhere,
  loadLinkableOrdersForShipmentUploadBatch,
  mapLinkableOrderListItem,
  maskRecipientName,
  parseLinkableOrdersLimit,
  parseLinkableOrdersQuery,
  type LinkableOrdersLoadClient,
} from '@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch';

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    provider: 'SMARTSTORE' as const,
    integrationAccountId: 'acc-1',
    mallOrderNo: 'ORD-1001',
    excloadOrderNo: 'EXC-20260709-000001',
    receiverName: '홍길동',
    receiverPhone: '01012345678',
    receiverAddress: '인천 미추홀구 주안동 101호',
    orderedAt: new Date('2026-07-08T10:00:00.000Z'),
    createdAt: new Date('2026-07-08T09:00:00.000Z'),
    ...overrides,
  };
}

function buildClient(input: {
  batch?: {
    id: string;
    provider: 'SMARTSTORE' | null;
    integrationAccountId: string | null;
  } | null;
  orders?: ReturnType<typeof buildOrder>[];
  matches?: Array<{ orderSyncOrderId: string | null }>;
}): LinkableOrdersLoadClient {
  return {
    shipmentUploadBatch: {
      findFirst: vi.fn().mockResolvedValue(input.batch ?? null),
    },
    orderSyncOrder: {
      findMany: vi.fn().mockResolvedValue(input.orders ?? []),
    },
    shipmentMatch: {
      findMany: vi.fn().mockResolvedValue(input.matches ?? []),
    },
  };
}

describe('parseLinkableOrdersLimit', () => {
  it('defaults to 30 and caps at 100', () => {
    expect(parseLinkableOrdersLimit(null)).toBe(30);
    expect(parseLinkableOrdersLimit('50')).toBe(50);
    expect(parseLinkableOrdersLimit('200')).toBe(100);
  });

  it('rejects invalid limit', () => {
    expect(parseLinkableOrdersLimit('0')).toEqual({
      error: 'limit는 1 이상의 정수여야 합니다.',
    });
  });
});

describe('buildLinkableOrdersWhere', () => {
  it('scopes by userId, provider, and integrationAccountId', () => {
    expect(
      buildLinkableOrdersWhere({
        userId: 'user-a',
        batchProvider: 'SMARTSTORE',
        batchIntegrationAccountId: 'acc-1',
      }),
    ).toEqual({
      userId: 'user-a',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
    });
  });

  it('adds search OR filters for q', () => {
    expect(
      buildLinkableOrdersWhere({
        userId: 'user-a',
        batchProvider: null,
        batchIntegrationAccountId: null,
        q: '홍길동',
      }),
    ).toEqual({
      userId: 'user-a',
      OR: [
        { excloadOrderNo: { contains: '홍길동', mode: 'insensitive' } },
        { mallOrderNo: { contains: '홍길동', mode: 'insensitive' } },
        { receiverName: { contains: '홍길동', mode: 'insensitive' } },
        { receiverPhone: { contains: '홍길동' } },
        { receiverAddress: { contains: '홍길동', mode: 'insensitive' } },
      ],
    });
  });
});

describe('mapLinkableOrderListItem', () => {
  it('masks recipient fields and omits raw values', () => {
    const mapped = mapLinkableOrderListItem({
      order: buildOrder(),
      usedOrderIds: new Set(['order-1']),
    });

    expect(mapped.recipientName).toBe('홍*동');
    expect(mapped.recipientPhone).toBe('010-****-5678');
    expect(mapped.address).toContain('...');
    expect(mapped.usedInShipmentMatch).toBe(true);
    expect(JSON.stringify(mapped)).not.toContain('01012345678');
    expect(JSON.stringify(mapped)).not.toContain('주안동 101호');
    expect(JSON.stringify(mapped)).not.toContain('rawRowJson');
    expect(JSON.stringify(mapped)).not.toContain('candidateOrdersJson');
  });
});

describe('maskRecipientName', () => {
  it('masks short names', () => {
    expect(maskRecipientName('홍길동')).toBe('홍*동');
  });
});

describe('loadLinkableOrdersForShipmentUploadBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns linkable orders for owned batch with scope filters', async () => {
    const client = buildClient({
      batch: {
        id: 'batch-1',
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-1',
      },
      orders: [buildOrder()],
      matches: [{ orderSyncOrderId: 'order-1' }],
    });

    const result = await loadLinkableOrdersForShipmentUploadBatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      q: 'ORD-1001',
      limit: 30,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(client.shipmentUploadBatch.findFirst).toHaveBeenCalledWith({
      where: { id: 'batch-1', userId: 'user-a' },
      select: { id: true, provider: true, integrationAccountId: true },
    });
    expect(client.orderSyncOrder.findMany).toHaveBeenCalledWith({
      where: buildLinkableOrdersWhere({
        userId: 'user-a',
        batchProvider: 'SMARTSTORE',
        batchIntegrationAccountId: 'acc-1',
        q: 'ORD-1001',
      }),
      orderBy: [{ orderedAt: 'desc' }, { createdAt: 'desc' }],
      take: 30,
      select: expect.any(Object),
    });
    expect(result.body.batchId).toBe('batch-1');
    expect(result.body.orders).toHaveLength(1);
    expect(result.body.orders[0].mallOrderNo).toBe('ORD-1001');
  });

  it('returns 404 when batch belongs to another user', async () => {
    const client = buildClient({ batch: null });

    const result = await loadLinkableOrdersForShipmentUploadBatch(client, {
      userId: 'user-b',
      batchId: 'batch-1',
      limit: 30,
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
    expect(client.orderSyncOrder.findMany).not.toHaveBeenCalled();
  });
});

describe('parseLinkableOrdersQuery', () => {
  it('trims and limits query length', () => {
    expect(parseLinkableOrdersQuery('  홍길동 ')).toBe('홍길동');
    expect(parseLinkableOrdersQuery('')).toBeNull();
  });
});
