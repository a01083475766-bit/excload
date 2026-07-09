import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildShipmentUploadExportGroupKey,
  buildShipmentUploadExportRows,
  buildShipmentUploadExportRowsFromMatches,
  evaluateShipmentUploadExportEligibility,
  groupShipmentUploadExportRows,
  isExportableShipmentMatchStatus,
  mapShipmentUploadExportRow,
  type BuildShipmentUploadExportRowsClient,
  type LoadedShipmentUploadExportMatch,
} from '@/app/lib/order-integration/shipments/build-shipment-upload-export-rows';

function buildUploadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    trackingNumber: '12345678901234',
    carrierName: 'CJ대한통운',
    mallOrderNo: 'ORD-1001',
    excloadOrderNo: 'EXC-1',
    receiverName: '홍길동',
    receiverPhone: '01012345678',
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    provider: 'SMARTSTORE' as const,
    integrationAccountId: 'acc-1',
    mallOrderNo: 'ORD-1001',
    excloadOrderNo: 'EXC-20260709-000001',
    receiverName: '홍길동',
    receiverPhone: '01012345678',
    ...overrides,
  };
}

function buildMatch(overrides: Record<string, unknown> = {}): LoadedShipmentUploadExportMatch {
  return {
    id: 'match-1',
    uploadRowId: 'row-1',
    userConfirmationStatus: 'CONFIRMED',
    orderSyncOrderId: 'order-1',
    provider: 'SMARTSTORE',
    integrationAccountId: 'acc-1',
    finalTrackingNumber: '12345678901234',
    finalCarrierName: 'CJ대한통운',
    uploadRow: buildUploadRow(),
    orderSyncOrder: buildOrder(),
    ...overrides,
  };
}

function buildClient(input: {
  batch?: {
    id: string;
    status: 'READY' | 'MATCHED';
    provider?: 'SMARTSTORE' | 'COUPANG' | null;
    integrationAccountId?: string | null;
  } | null;
  matches?: LoadedShipmentUploadExportMatch[];
}): BuildShipmentUploadExportRowsClient {
  return {
    shipmentUploadBatch: {
      findFirst: vi.fn().mockResolvedValue(input.batch ?? null),
    },
    shipmentMatch: {
      findMany: vi.fn().mockResolvedValue(input.matches ?? []),
    },
  };
}

describe('isExportableShipmentMatchStatus', () => {
  it('includes confirmed, manually linked, and edited statuses', () => {
    expect(isExportableShipmentMatchStatus('CONFIRMED')).toBe(true);
    expect(isExportableShipmentMatchStatus('MANUALLY_LINKED')).toBe(true);
    expect(isExportableShipmentMatchStatus('EDITED')).toBe(true);
    expect(isExportableShipmentMatchStatus('EXCLUDED')).toBe(false);
    expect(isExportableShipmentMatchStatus('UNCONFIRMED')).toBe(false);
  });
});

describe('evaluateShipmentUploadExportEligibility', () => {
  it('requires READY status and no unconfirmed matches', () => {
    expect(
      evaluateShipmentUploadExportEligibility({
        batchStatus: 'READY',
        matches: [{ userConfirmationStatus: 'CONFIRMED' }],
      }),
    ).toEqual({ ok: true });

    expect(
      evaluateShipmentUploadExportEligibility({
        batchStatus: 'MATCHED',
        matches: [{ userConfirmationStatus: 'CONFIRMED' }],
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: 'READY 상태의 배치만 보낼 수 있습니다.',
    });

    expect(
      evaluateShipmentUploadExportEligibility({
        batchStatus: 'READY',
        matches: [{ userConfirmationStatus: 'UNCONFIRMED' }],
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: '아직 처리되지 않은 매칭이 있어 보낼 수 없습니다.',
    });

    expect(
      evaluateShipmentUploadExportEligibility({
        batchStatus: 'READY',
        matches: [],
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: '보낼 매칭 결과가 없습니다.',
    });
  });
});

describe('mapShipmentUploadExportRow', () => {
  it('maps export row with masked recipient fields and upload fields', () => {
    const mapped = mapShipmentUploadExportRow({
      match: buildMatch(),
      batchProvider: 'SMARTSTORE',
      batchIntegrationAccountId: 'acc-1',
    });

    expect(mapped).toEqual({
      row: {
        orderSyncOrderId: 'order-1',
        shipmentMatchId: 'match-1',
        shipmentUploadRowId: 'row-1',
        mallOrderNo: 'ORD-1001',
        excloadOrderNo: 'EXC-20260709-000001',
        trackingNumber: '12345678901234',
        carrierName: 'CJ대한통운',
        recipientNameMasked: '홍*동',
        recipientPhoneMasked: '010-****-5678',
      },
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
    });
    expect(JSON.stringify(mapped)).not.toContain('rawRowJson');
    expect(JSON.stringify(mapped)).not.toContain('candidateOrdersJson');
    expect(JSON.stringify(mapped)).not.toContain('01012345678');
  });

  it('rejects exportable match without linked order', () => {
    expect(
      mapShipmentUploadExportRow({
        match: buildMatch({ orderSyncOrderId: null, orderSyncOrder: null }),
        batchProvider: 'SMARTSTORE',
        batchIntegrationAccountId: 'acc-1',
      }),
    ).toEqual({ error: '연결된 주문이 없어 보낼 수 없습니다.' });
  });
});

describe('groupShipmentUploadExportRows', () => {
  it('groups rows by provider and integrationAccountId', () => {
    const groups = groupShipmentUploadExportRows([
      {
        provider: 'COUPANG',
        integrationAccountId: 'acc-2',
        row: {
          orderSyncOrderId: 'order-2',
          shipmentMatchId: 'match-2',
          shipmentUploadRowId: 'row-2',
          mallOrderNo: 'ORD-2',
          excloadOrderNo: 'EXC-2',
          trackingNumber: '222233334444',
          carrierName: '한진택배',
          recipientNameMasked: '김*수',
          recipientPhoneMasked: '010-****-9999',
        },
      },
      {
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-1',
        row: {
          orderSyncOrderId: 'order-1',
          shipmentMatchId: 'match-1',
          shipmentUploadRowId: 'row-1',
          mallOrderNo: 'ORD-1',
          excloadOrderNo: 'EXC-1',
          trackingNumber: '12345678901234',
          carrierName: 'CJ대한통운',
          recipientNameMasked: '홍*동',
          recipientPhoneMasked: '010-****-5678',
        },
      },
      {
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-1',
        row: {
          orderSyncOrderId: 'order-3',
          shipmentMatchId: 'match-3',
          shipmentUploadRowId: 'row-3',
          mallOrderNo: 'ORD-3',
          excloadOrderNo: 'EXC-3',
          trackingNumber: '555566667777',
          carrierName: 'CJ대한통운',
          recipientNameMasked: '이*영',
          recipientPhoneMasked: '010-****-1111',
        },
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(buildShipmentUploadExportGroupKey(groups[0]!)).toBe('COUPANG::acc-2');
    expect(buildShipmentUploadExportGroupKey(groups[1]!)).toBe('SMARTSTORE::acc-1');
    expect(groups[1]?.rows).toHaveLength(2);
  });
});

describe('buildShipmentUploadExportRowsFromMatches', () => {
  it('includes confirmed, manually linked, and edited rows and counts excluded', () => {
    const result = buildShipmentUploadExportRowsFromMatches({
      batchId: 'batch-1',
      batchProvider: 'SMARTSTORE',
      batchIntegrationAccountId: 'acc-1',
      matches: [
        buildMatch({ id: 'match-1', userConfirmationStatus: 'CONFIRMED' }),
        buildMatch({
          id: 'match-2',
          uploadRowId: 'row-2',
          userConfirmationStatus: 'MANUALLY_LINKED',
          orderSyncOrderId: 'order-2',
          orderSyncOrder: buildOrder({
            id: 'order-2',
            mallOrderNo: 'ORD-2001',
            excloadOrderNo: 'EXC-2',
          }),
          uploadRow: buildUploadRow({
            id: 'row-2',
            trackingNumber: '999988887777',
          }),
        }),
        buildMatch({
          id: 'match-3',
          uploadRowId: 'row-3',
          userConfirmationStatus: 'EDITED',
          orderSyncOrderId: 'order-3',
          orderSyncOrder: buildOrder({
            id: 'order-3',
            mallOrderNo: 'ORD-3001',
            excloadOrderNo: 'EXC-3',
          }),
          uploadRow: buildUploadRow({
            id: 'row-3',
            trackingNumber: '111122223333',
          }),
        }),
        buildMatch({
          id: 'match-4',
          uploadRowId: 'row-4',
          userConfirmationStatus: 'EXCLUDED',
        }),
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.body.status).toBe('READY');
    expect(result.body.excludedCount).toBe(1);
    expect(result.body.groups).toHaveLength(1);
    expect(result.body.groups[0]?.rows).toHaveLength(3);
    expect(JSON.stringify(result.body)).not.toContain('rawRowJson');
    expect(JSON.stringify(result.body)).not.toContain('candidateOrdersJson');
  });

  it('returns 400 when exportable match has no linked order', () => {
    const result = buildShipmentUploadExportRowsFromMatches({
      batchId: 'batch-1',
      batchProvider: 'SMARTSTORE',
      batchIntegrationAccountId: 'acc-1',
      matches: [
        buildMatch({
          userConfirmationStatus: 'MANUALLY_LINKED',
          orderSyncOrderId: null,
          orderSyncOrder: null,
        }),
      ],
    });

    expect(result).toEqual({
      success: false,
      status: 400,
      error: '연결된 주문이 없어 보낼 수 없습니다.',
    });
  });
});

describe('buildShipmentUploadExportRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds export rows for READY batch', async () => {
    const client = buildClient({
      batch: {
        id: 'batch-1',
        status: 'READY',
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-1',
      },
      matches: [buildMatch()],
    });

    const result = await buildShipmentUploadExportRows(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(client.shipmentUploadBatch.findFirst).toHaveBeenCalledWith({
      where: { id: 'batch-1', userId: 'user-a' },
      select: {
        id: true,
        status: true,
        provider: true,
        integrationAccountId: true,
      },
    });
    expect(result.body.batchId).toBe('batch-1');
    expect(result.body.groups[0]?.provider).toBe('SMARTSTORE');
    expect(result.body.groups[0]?.rows[0]?.trackingNumber).toBe('12345678901234');
  });

  it('returns 404 for another user batch', async () => {
    const client = buildClient({ batch: null });

    const result = await buildShipmentUploadExportRows(client, {
      userId: 'user-b',
      batchId: 'batch-1',
    });

    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
    expect(client.shipmentMatch.findMany).not.toHaveBeenCalled();
  });

  it('returns 409 when batch is not READY', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'MATCHED' },
      matches: [buildMatch()],
    });

    const result = await buildShipmentUploadExportRows(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result).toEqual({
      success: false,
      status: 409,
      error: 'READY 상태의 배치만 보낼 수 있습니다.',
    });
  });

  it('returns 409 when unconfirmed match remains', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'READY' },
      matches: [buildMatch({ userConfirmationStatus: 'UNCONFIRMED' })],
    });

    const result = await buildShipmentUploadExportRows(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result).toEqual({
      success: false,
      status: 409,
      error: '아직 처리되지 않은 매칭이 있어 보낼 수 없습니다.',
    });
  });

  it('returns 409 when batch has zero matches', async () => {
    const client = buildClient({
      batch: { id: 'batch-1', status: 'READY' },
      matches: [],
    });

    const result = await buildShipmentUploadExportRows(client, {
      userId: 'user-a',
      batchId: 'batch-1',
    });

    expect(result).toEqual({
      success: false,
      status: 409,
      error: '보낼 매칭 결과가 없습니다.',
    });
  });
});
