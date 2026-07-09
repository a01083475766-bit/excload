import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildShipmentUploadMatchConfirmUrl,
  postShipmentUploadMatchConfirm,
} from '@/app/lib/order-integration/shipments/shipment-match-panel-confirm-client';

describe('buildShipmentUploadMatchConfirmUrl', () => {
  it('builds nested confirm route url', () => {
    expect(buildShipmentUploadMatchConfirmUrl('batch-1', 'match-1')).toBe(
      '/api/order/integration/shipments/uploads/batch-1/matches/match-1/confirm',
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
