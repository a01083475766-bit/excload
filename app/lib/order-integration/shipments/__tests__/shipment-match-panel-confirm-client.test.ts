import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildShipmentUploadMatchConfirmUrl,
  buildShipmentUploadMatchExcludeUrl,
  postShipmentUploadMatchConfirm,
  postShipmentUploadMatchExclude,
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
