import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildShipmentUploadExportUrl,
  buildShipmentUploadLinkableOrdersUrl,
  buildShipmentUploadMatchConfirmUrl,
  buildShipmentUploadMatchExcludeUrl,
  buildShipmentUploadMatchLinkUrl,
  downloadShipmentUploadExportFile,
  fetchShipmentUploadLinkableOrders,
  parseContentDispositionFileName,
  postShipmentUploadMatchConfirm,
  postShipmentUploadMatchExclude,
  postShipmentUploadMatchLink,
  resolveShipmentUploadExportDownloadFileName,
} from '@/app/lib/order-integration/shipments/shipment-match-panel-confirm-client';

describe('buildShipmentUploadMatchConfirmUrl', () => {
  it('builds nested confirm route url', () => {
    expect(buildShipmentUploadMatchConfirmUrl('batch-1', 'match-1')).toBe(
      '/api/order/integration/shipments/uploads/batch-1/matches/match-1/confirm',
    );
  });
});

describe('buildShipmentUploadMatchExcludeUrl', () => {
  it('builds nested exclude route url', () => {
    expect(buildShipmentUploadMatchExcludeUrl('batch-1', 'match-1')).toBe(
      '/api/order/integration/shipments/uploads/batch-1/matches/match-1/exclude',
    );
  });
});

describe('postShipmentUploadMatchConfirm', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to confirm API and returns latest detail payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        confirmedMatchId: 'match-1',
        match: {
          matchId: 'match-1',
          userConfirmationStatus: 'CONFIRMED',
        },
        uploadBatch: { id: 'batch-1', rowCount: 1 },
        rows: [],
        summary: { totalRows: 1 },
      }),
    });

    const result = await postShipmentUploadMatchConfirm('batch-1', 'match-1', fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/order/integration/shipments/uploads/batch-1/matches/match-1/confirm',
      { method: 'POST' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.confirmedMatchId).toBe('match-1');
    expect(JSON.stringify(result.body)).not.toContain('rawRowJson');
    expect(JSON.stringify(result.body)).not.toContain('candidateOrdersJson');
  });

  it('returns mapped error when confirm fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '연결된 주문이 없어 확정할 수 없습니다.' }),
    });

    const result = await postShipmentUploadMatchConfirm('batch-1', 'match-1', fetchMock);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: '연결된 주문이 없어 확정할 수 없습니다.',
    });
  });
});

describe('postShipmentUploadMatchExclude', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to exclude API with default reason and returns latest detail payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        excludedMatchId: 'match-1',
        match: {
          matchId: 'match-1',
          userConfirmationStatus: 'EXCLUDED',
        },
        uploadBatch: { id: 'batch-1', rowCount: 1 },
        rows: [],
        summary: { totalRows: 1 },
      }),
    });

    const result = await postShipmentUploadMatchExclude('batch-1', 'match-1', {}, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/order/integration/shipments/uploads/batch-1/matches/match-1/exclude',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'USER_EXCLUDED_FROM_UI' }),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.excludedMatchId).toBe('match-1');
    expect(JSON.stringify(result.body)).not.toContain('rawRowJson');
    expect(JSON.stringify(result.body)).not.toContain('candidateOrdersJson');
  });

  it('returns mapped error when exclude fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '확정된 매칭은 제외할 수 없습니다.' }),
    });

    const result = await postShipmentUploadMatchExclude('batch-1', 'match-1', {}, fetchMock);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: '확정된 매칭은 제외할 수 없습니다.',
    });
  });
});

describe('buildShipmentUploadLinkableOrdersUrl', () => {
  it('builds linkable orders url with q and limit', () => {
    expect(buildShipmentUploadLinkableOrdersUrl('batch-1', { q: '홍길동', limit: 30 })).toBe(
      '/api/order/integration/shipments/uploads/batch-1/linkable-orders?q=%ED%99%8D%EA%B8%B8%EB%8F%99&limit=30',
    );
    expect(buildShipmentUploadLinkableOrdersUrl('batch-1')).toBe(
      '/api/order/integration/shipments/uploads/batch-1/linkable-orders?limit=30',
    );
  });
});

describe('buildShipmentUploadMatchLinkUrl', () => {
  it('builds nested link route url', () => {
    expect(buildShipmentUploadMatchLinkUrl('batch-1', 'match-1')).toBe(
      '/api/order/integration/shipments/uploads/batch-1/matches/match-1/link',
    );
  });
});

describe('fetchShipmentUploadLinkableOrders', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches linkable orders with q and limit', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        batchId: 'batch-1',
        orders: [
          {
            id: 'order-1',
            provider: 'SMARTSTORE',
            integrationAccountId: 'acc-1',
            mallOrderNo: 'ORD-1',
            excloadOrderNo: 'EXC-1',
            recipientName: '홍*동',
            recipientPhone: '010-****-5678',
            address: '서울 ... 101',
            orderedAt: '2026-07-08T10:00:00.000Z',
            usedInShipmentMatch: false,
          },
        ],
      }),
    });

    const result = await fetchShipmentUploadLinkableOrders(
      'batch-1',
      { q: 'ORD-1', limit: 30 },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/order/integration/shipments/uploads/batch-1/linkable-orders?q=ORD-1&limit=30',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.orders).toHaveLength(1);
    expect(JSON.stringify(result.body)).not.toContain('rawRowJson');
    expect(JSON.stringify(result.body)).not.toContain('candidateOrdersJson');
  });
});

describe('postShipmentUploadMatchLink', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to link API with orderSyncOrderId and returns latest detail payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        linkedMatchId: 'match-1',
        orderSyncOrderId: 'order-1',
        match: {
          matchId: 'match-1',
          userConfirmationStatus: 'MANUALLY_LINKED',
        },
        uploadBatch: { id: 'batch-1', rowCount: 1 },
        rows: [],
        summary: { totalRows: 1 },
      }),
    });

    const result = await postShipmentUploadMatchLink('batch-1', 'match-1', 'order-1', fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/order/integration/shipments/uploads/batch-1/matches/match-1/link',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderSyncOrderId: 'order-1' }),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.linkedMatchId).toBe('match-1');
    expect(JSON.stringify(result.body)).not.toContain('rawRowJson');
    expect(JSON.stringify(result.body)).not.toContain('candidateOrdersJson');
  });

  it('returns mapped error when link fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '확정된 매칭은 수동 연결할 수 없습니다.' }),
    });

    const result = await postShipmentUploadMatchLink('batch-1', 'match-1', 'order-1', fetchMock);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: '확정된 매칭은 수동 연결할 수 없습니다.',
    });
  });
});

describe('buildShipmentUploadExportUrl', () => {
  it('builds export download url with default xlsx format', () => {
    expect(buildShipmentUploadExportUrl('batch-1')).toBe(
      '/api/order/integration/shipments/uploads/batch-1/export?format=xlsx',
    );
  });
});

describe('parseContentDispositionFileName', () => {
  it('extracts filename from Content-Disposition header', () => {
    expect(
      parseContentDispositionFileName('attachment; filename="excload-shipment-upload-batch-1.xlsx"'),
    ).toBe('excload-shipment-upload-batch-1.xlsx');
  });
});

describe('resolveShipmentUploadExportDownloadFileName', () => {
  it('falls back to default export filename when header is missing', () => {
    expect(
      resolveShipmentUploadExportDownloadFileName({
        batchId: 'batch-1',
        format: 'xlsx',
        contentDisposition: null,
      }),
    ).toBe('excload-shipment-upload-batch-1.xlsx');
  });
});

describe('downloadShipmentUploadExportFile', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches export blob and returns resolved filename', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-disposition'
            ? 'attachment; filename="excload-shipment-upload-batch-1.xlsx"'
            : null,
      },
      blob: async () => new Blob(['xlsx'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    });

    const result = await downloadShipmentUploadExportFile('batch-1', { format: 'xlsx' }, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/order/integration/shipments/uploads/batch-1/export?format=xlsx',
    );
    expect(result).toEqual({
      ok: true,
      fileName: 'excload-shipment-upload-batch-1.xlsx',
    });
  });

  it('returns mapped error when export download fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'READY 상태의 배치만 보낼 수 있습니다.' }),
    });

    const result = await downloadShipmentUploadExportFile('batch-1', { format: 'xlsx' }, fetchMock);

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'READY 상태의 배치만 보낼 수 있습니다.',
    });
  });
});
