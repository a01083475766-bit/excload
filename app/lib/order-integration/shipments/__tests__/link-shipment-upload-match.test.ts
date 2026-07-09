import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadShipmentUploadBatchDetail: vi.fn(),
}));

vi.mock('@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail')
  >('@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail');

  return {
    ...actual,
    loadShipmentUploadBatchDetail: mocks.loadShipmentUploadBatchDetail,
  };
});

import {
  evaluateShipmentMatchLinkEligibility,
  linkShipmentUploadMatch,
  validateShipmentMatchLinkOrderScope,
  validateShipmentMatchLinkOrderSyncOrderId,
  type LinkShipmentUploadMatchClient,
} from '@/app/lib/order-integration/shipments/link-shipment-upload-match';

function buildBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    provider: 'SMARTSTORE' as const,
    integrationAccountId: 'acc-1',
    ...overrides,
  };
}

function buildMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    uploadBatchId: 'batch-1',
    uploadRowId: 'row-1',
    userId: 'user-a',
    orderSyncOrderId: null,
    algorithmMatchStatus: 'NOT_MATCHED' as const,
    userConfirmationStatus: 'UNCONFIRMED' as const,
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    provider: 'SMARTSTORE' as const,
    integrationAccountId: 'acc-1',
    ...overrides,
  };
}

function buildDetailBody() {
  return {
    success: true as const,
    uploadBatch: {
      id: 'batch-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
      originalFileName: 'shipments.csv',
      fileSize: 100,
      fileType: 'text/csv',
      rowCount: 1,
      matchedConfidentCount: 0,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
      status: 'MATCHED' as const,
      createdAt: '2026-07-09T08:00:00.000Z',
    },
    rows: [
      {
        uploadRowId: 'row-1',
        matchId: 'match-1',
        originalRowIndex: 0,
        algorithmMatchStatus: 'NOT_MATCHED' as const,
        userConfirmationStatus: 'MANUALLY_LINKED' as const,
        transmissionStatus: 'NONE' as const,
        provider: '스마트스토어',
        excloadOrderNo: 'EXC-1',
        mallOrderNo: 'ORD-1',
        receiverName: '홍길동',
        receiverPhoneMasked: '010-****-5678',
        receiverAddressMasked: '서울시 ... 123',
        trackingNumberMasked: '1234****5678',
        productSummary: '티셔츠',
        carrierName: 'CJ대한통운',
        matchReason: 'manual link',
        matchScore: 0,
      },
    ],
    summary: {
      totalRows: 1,
      matchedConfidentCount: 0,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
    },
  };
}

function buildClient(input: {
  batch?: ReturnType<typeof buildBatch> | null;
  match?: ReturnType<typeof buildMatch> | null;
  order?: ReturnType<typeof buildOrder> | null;
}): LinkShipmentUploadMatchClient {
  return {
    shipmentUploadBatch: {
      findFirst: vi.fn().mockResolvedValue(input.batch ?? null),
    },
    shipmentUploadRow: {
      findMany: vi.fn(),
    },
    shipmentMatch: {
      findFirst: vi.fn().mockResolvedValue(input.match ?? null),
      update: vi.fn().mockResolvedValue(
        buildMatch({
          orderSyncOrderId: 'order-1',
          userConfirmationStatus: 'MANUALLY_LINKED',
        }),
      ),
    },
    orderSyncOrder: {
      findFirst: vi.fn().mockResolvedValue(input.order ?? null),
    },
  };
}

describe('validateShipmentMatchLinkOrderSyncOrderId', () => {
  it('rejects missing orderSyncOrderId', () => {
    expect(validateShipmentMatchLinkOrderSyncOrderId('')).toEqual({
      error: 'orderSyncOrderId가 필요합니다.',
    });
  });
});

describe('evaluateShipmentMatchLinkEligibility', () => {
  it('allows unconfirmed match to be linked', () => {
    expect(
      evaluateShipmentMatchLinkEligibility({
        userConfirmationStatus: 'UNCONFIRMED',
        currentOrderSyncOrderId: null,
        targetOrderSyncOrderId: 'order-1',
      }),
    ).toEqual({ ok: true, idempotent: false });
  });

  it('is idempotent when already linked to the same order', () => {
    expect(
      evaluateShipmentMatchLinkEligibility({
        userConfirmationStatus: 'MANUALLY_LINKED',
        currentOrderSyncOrderId: 'order-1',
        targetOrderSyncOrderId: 'order-1',
      }),
    ).toEqual({ ok: true, idempotent: true });
  });

  it('rejects relinking to a different order', () => {
    expect(
      evaluateShipmentMatchLinkEligibility({
        userConfirmationStatus: 'MANUALLY_LINKED',
        currentOrderSyncOrderId: 'order-1',
        targetOrderSyncOrderId: 'order-2',
      }),
    ).toEqual({ ok: false, error: '이미 다른 주문에 연결된 매칭입니다.' });
  });

  it('rejects confirmed and excluded matches', () => {
    expect(
      evaluateShipmentMatchLinkEligibility({
        userConfirmationStatus: 'CONFIRMED',
        currentOrderSyncOrderId: 'order-1',
        targetOrderSyncOrderId: 'order-1',
      }),
    ).toEqual({ ok: false, error: '확정된 매칭은 수동 연결할 수 없습니다.' });

    expect(
      evaluateShipmentMatchLinkEligibility({
        userConfirmationStatus: 'EXCLUDED',
        currentOrderSyncOrderId: null,
        targetOrderSyncOrderId: 'order-1',
      }),
    ).toEqual({ ok: false, error: '제외된 매칭은 수동 연결할 수 없습니다.' });

    expect(
      evaluateShipmentMatchLinkEligibility({
        userConfirmationStatus: 'EDITED',
        currentOrderSyncOrderId: 'order-1',
        targetOrderSyncOrderId: 'order-1',
      }),
    ).toEqual({ ok: false, error: '이미 처리된 매칭입니다.' });
  });
});

describe('validateShipmentMatchLinkOrderScope', () => {
  it('rejects order outside batch provider scope', () => {
    expect(
      validateShipmentMatchLinkOrderScope({
        batchProvider: 'SMARTSTORE',
        batchIntegrationAccountId: 'acc-1',
        orderProvider: 'COUPANG',
        orderIntegrationAccountId: 'acc-1',
      }),
    ).toEqual({ ok: false, error: '배치 범위와 일치하지 않는 주문입니다.' });
  });
});

describe('linkShipmentUploadMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadShipmentUploadBatchDetail.mockResolvedValue({
      success: true,
      body: buildDetailBody(),
    });
  });

  it('links unconfirmed match to owned order and returns latest detail without raw json', async () => {
    const client = buildClient({
      batch: buildBatch(),
      match: buildMatch(),
      order: buildOrder(),
    });

    const result = await linkShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      orderSyncOrderId: 'order-1',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(client.shipmentMatch.update).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      data: {
        orderSyncOrderId: 'order-1',
        userConfirmationStatus: 'MANUALLY_LINKED',
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-1',
      },
    });
    expect(result.body.linkedMatchId).toBe('match-1');
    expect(result.body.orderSyncOrderId).toBe('order-1');
    expect(result.body.match.userConfirmationStatus).toBe('MANUALLY_LINKED');
    expect(JSON.stringify(result.body)).not.toContain('rawRowJson');
    expect(JSON.stringify(result.body)).not.toContain('candidateOrdersJson');
  });

  it('returns 404 when batch belongs to another user', async () => {
    const client = buildClient({ batch: null });

    const result = await linkShipmentUploadMatch(client, {
      userId: 'user-b',
      batchId: 'batch-1',
      matchId: 'match-1',
      orderSyncOrderId: 'order-1',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
  });

  it('returns 404 when match is not in the batch', async () => {
    const client = buildClient({
      batch: buildBatch(),
      match: null,
    });

    const result = await linkShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'missing-match',
      orderSyncOrderId: 'order-1',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '매칭 결과를 찾을 수 없습니다.',
    });
  });

  it('returns 404 when order belongs to another user', async () => {
    const client = buildClient({
      batch: buildBatch(),
      match: buildMatch(),
      order: null,
    });

    const result = await linkShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      orderSyncOrderId: 'order-other',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '연결할 주문을 찾을 수 없습니다.',
    });
  });

  it('returns 400 when match is already confirmed', async () => {
    const client = buildClient({
      batch: buildBatch(),
      match: buildMatch({ userConfirmationStatus: 'CONFIRMED', orderSyncOrderId: 'order-1' }),
      order: buildOrder(),
    });

    const result = await linkShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      orderSyncOrderId: 'order-1',
    });

    expect(result).toEqual({
      success: false,
      status: 400,
      error: '확정된 매칭은 수동 연결할 수 없습니다.',
    });
  });

  it('returns 400 when relinking to a different order', async () => {
    const client = buildClient({
      batch: buildBatch(),
      match: buildMatch({
        userConfirmationStatus: 'MANUALLY_LINKED',
        orderSyncOrderId: 'order-1',
      }),
      order: buildOrder({ id: 'order-2' }),
    });

    const result = await linkShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      orderSyncOrderId: 'order-2',
    });

    expect(result).toEqual({
      success: false,
      status: 400,
      error: '이미 다른 주문에 연결된 매칭입니다.',
    });
  });

  it('is idempotent when already manually linked to the same order', async () => {
    const client = buildClient({
      batch: buildBatch(),
      match: buildMatch({
        userConfirmationStatus: 'MANUALLY_LINKED',
        orderSyncOrderId: 'order-1',
      }),
      order: buildOrder(),
    });

    const result = await linkShipmentUploadMatch(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchId: 'match-1',
      orderSyncOrderId: 'order-1',
    });

    expect(result.success).toBe(true);
    expect(client.shipmentMatch.update).not.toHaveBeenCalled();
  });
});
