import { OrderIntegrationProvider } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import {
  isOrderSyncSnapshotPersistEnabled,
  maybePersistOrderFetchResult,
  toSafePersistErrorMessage,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import { persistOrderSyncBatch } from '@/app/lib/order-integration/snapshots/persist-order-sync-batch';
import type { OrderSyncPersistPrismaClient } from '@/app/lib/order-integration/snapshots/types';

vi.mock('@/app/lib/order-integration/snapshots/build-order-sync-snapshots', () => ({
  buildOrderSyncSnapshots: vi.fn(() => [
    {
      userId: 'user-a',
      provider: 'SMARTSTORE',
      accountId: 'acc-1',
      fetchedAt: '2026-07-09T00:00:00.000Z',
      excloadOrderNo: 'EXC-20260709-000001',
      mallOrderNo: 'ORD-1',
      receiverName: '홍길동',
      receiverPhone: '010-1234-5678',
      receiverAddress: '서울시 강남구',
      productSummary: '상품 x1',
      quantity: 1,
      normalizedPayloadJson: { mallLineItemIds: ['PO-1'] },
    },
  ]),
}));

vi.mock('@/app/lib/order-integration/snapshots/persist-order-sync-batch', () => ({
  persistOrderSyncBatch: vi.fn(),
}));

const mockedBuildOrderSyncSnapshots = vi.mocked(buildOrderSyncSnapshots);
const mockedPersistOrderSyncBatch = vi.mocked(persistOrderSyncBatch);

const ENV_KEY = 'ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED';

const sampleRows = [
  {
    주문번호: 'ORD-1',
    상품주문번호: 'PO-1',
    받는사람: '홍길동',
    받는사람전화1: '010-1234-5678',
    받는사람주소1: '서울시 강남구',
    상품명: '상품',
    수량: '1',
  },
];

function createMockClient(): OrderSyncPersistPrismaClient {
  return {
    $transaction: vi.fn(),
  };
}

function buildInput(
  overrides: Partial<Parameters<typeof maybePersistOrderFetchResult>[0]> = {},
) {
  return {
    client: createMockClient(),
    enabled: true,
    userId: 'user-a',
    provider: OrderIntegrationProvider.SMARTSTORE,
    integrationAccountId: 'acc-1',
    orderStandardFile: { rows: sampleRows },
    rawOrders: [{ id: 'raw-1' }],
    fetchedAt: new Date('2026-07-09T00:00:00.000Z'),
    ...overrides,
  };
}

describe('isOrderSyncSnapshotPersistEnabled', () => {
  const originalValue = process.env[ENV_KEY];

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalValue;
    }
  });

  it('returns false by default', () => {
    delete process.env[ENV_KEY];
    expect(isOrderSyncSnapshotPersistEnabled()).toBe(false);
  });

  it('returns true only when env is exactly true', () => {
    process.env[ENV_KEY] = 'true';
    expect(isOrderSyncSnapshotPersistEnabled()).toBe(true);

    process.env[ENV_KEY] = 'false';
    expect(isOrderSyncSnapshotPersistEnabled()).toBe(false);
  });
});

describe('toSafePersistErrorMessage', () => {
  it('redacts phone numbers and tracking-like values from error messages', () => {
    const message = toSafePersistErrorMessage(
      new Error('failed for 010-1234-5678 at 서울시 강남구 tracking 12345678901234'),
    );

    expect(message).not.toContain('010-1234-5678');
    expect(message).not.toContain('12345678901234');
    expect(message).toContain('[redacted]');
  });
});

describe('maybePersistOrderFetchResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPersistOrderSyncBatch.mockResolvedValue({
      batch: {
        id: 'batch-1',
        userId: 'user-a',
        provider: OrderIntegrationProvider.SMARTSTORE,
        integrationAccountId: 'acc-1',
        sourceType: 'API',
        fetchedAt: new Date('2026-07-09T00:00:00.000Z'),
        orderCount: 1,
        status: 'ACTIVE',
        memo: null,
        errorMessage: null,
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      },
      orders: [],
      excloadOrderNos: ['EXC-20260709-000001'],
    });
  });

  it('does not call persist when enabled is false', async () => {
    const result = await maybePersistOrderFetchResult(buildInput({ enabled: false }));

    expect(result).toEqual({ persisted: false, reason: 'disabled' });
    expect(mockedBuildOrderSyncSnapshots).not.toHaveBeenCalled();
    expect(mockedPersistOrderSyncBatch).not.toHaveBeenCalled();
  });

  it('returns missing_order_standard_file when orderStandardFile is absent', async () => {
    const result = await maybePersistOrderFetchResult(
      buildInput({ orderStandardFile: undefined }),
    );

    expect(result).toEqual({ persisted: false, reason: 'missing_order_standard_file' });
    expect(mockedPersistOrderSyncBatch).not.toHaveBeenCalled();
  });

  it('returns empty_rows without DB access when rows are empty', async () => {
    const result = await maybePersistOrderFetchResult(
      buildInput({ orderStandardFile: { rows: [] } }),
    );

    expect(result).toEqual({ persisted: false, reason: 'empty_rows' });
    expect(mockedBuildOrderSyncSnapshots).not.toHaveBeenCalled();
    expect(mockedPersistOrderSyncBatch).not.toHaveBeenCalled();
  });

  it('calls buildOrderSyncSnapshots and persistOrderSyncBatch when enabled', async () => {
    const input = buildInput();
    const result = await maybePersistOrderFetchResult(input);

    expect(mockedBuildOrderSyncSnapshots).toHaveBeenCalledWith({
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      accountId: 'acc-1',
      fetchedAt: input.fetchedAt,
      rows: [
        {
          주문번호: 'ORD-1',
          상품주문번호: 'PO-1',
          받는사람: '홍길동',
          받는사람전화1: '010-1234-5678',
          받는사람주소1: '서울시 강남구',
          상품명: '상품',
          수량: '1',
        },
      ],
      rawOrders: [{ id: 'raw-1' }],
    });

    expect(mockedPersistOrderSyncBatch).toHaveBeenCalledWith(input.client, {
      userId: 'user-a',
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: 'acc-1',
      sourceType: 'API',
      fetchedAt: input.fetchedAt,
      snapshots: mockedBuildOrderSyncSnapshots.mock.results[0]?.value,
    });

    expect(result).toEqual({
      persisted: true,
      batchId: 'batch-1',
      orderCount: 1,
      excloadOrderNos: ['EXC-20260709-000001'],
    });
  });

  it('returns persist_failed without throwing when persist fails', async () => {
    mockedPersistOrderSyncBatch.mockRejectedValueOnce(
      new Error('persist failed for 010-9999-8888 tracking 12345678901234'),
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await maybePersistOrderFetchResult(buildInput());

    expect(result).toEqual({
      persisted: false,
      reason: 'persist_failed',
      errorMessage: expect.not.stringContaining('010-9999-8888'),
    });
    expect((result as { errorMessage?: string }).errorMessage).not.toContain('12345678901234');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[OrderSyncSnapshotPersist] failed:',
      expect.not.stringContaining('010-9999-8888'),
    );

    consoleSpy.mockRestore();
  });

  it('passes rawOrders array when rawOrders input is already an array', async () => {
    const rawOrders = [{ id: 'raw-1' }, { id: 'raw-2' }];
    await maybePersistOrderFetchResult(buildInput({ rawOrders }));

    expect(mockedBuildOrderSyncSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ rawOrders }),
    );
  });
});
