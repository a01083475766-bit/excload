import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  runShipmentTransmissionDryRun: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/app/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock('@/app/lib/order-integration/transmission/dry-run', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/transmission/dry-run')
  >('@/app/lib/order-integration/transmission/dry-run');
  return {
    ...actual,
    runShipmentTransmissionDryRun: mocks.runShipmentTransmissionDryRun,
  };
});

import { POST } from '../route';

function buildRequest(body?: unknown) {
  if (body === undefined) {
    return new Request(
      'http://localhost/api/order/integration/shipments/uploads/batch-1/transmit/dry-run',
      { method: 'POST' },
    );
  }
  return new Request(
    'http://localhost/api/order/integration/shipments/uploads/batch-1/transmit/dry-run',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
  );
}

const successBody = {
  dryRun: true as const,
  batch: {
    batchId: 'batch-1',
    provider: 'COUPANG',
    integrationAccountId: 'acc-1',
    status: 'READY',
  },
  summary: {
    requestedCount: 1,
    evaluatedCount: 1,
    eligibleCount: 1,
    ineligibleCount: 0,
    duplicateMatchIdCount: 0,
    missingMatchIdCount: 0,
  },
  results: [
    {
      matchId: 'match-1',
      eligible: true,
      requiresRetryPreparation: false,
      reasonCode: null,
      reasonMessage: null,
      candidate: {
        provider: 'COUPANG',
        integrationAccountId: 'acc-1',
        uploadBatchId: 'batch-1',
        matchId: 'match-1',
        orderSyncOrderId: 'order-1',
        mallOrderNo: 'MALL-1',
        excloadOrderNo: 'EXC-1',
        mallLineItemIds: null,
        trackingNumber: '012345678901',
        courierCode: 'CJ',
        courierName: 'CJ대한통운',
      },
    },
  ],
};

describe('POST .../transmit/dry-run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.runShipmentTransmissionDryRun.mockResolvedValue({
      success: true,
      body: successBody,
    });
  });

  const params = { params: Promise.resolve({ batchId: 'batch-1' }) };

  it('returns 401 when unauthenticated', async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const res = await POST(buildRequest({}), params);
    expect(res.status).toBe(401);
    expect(mocks.runShipmentTransmissionDryRun).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(buildRequest('{'), params);
    expect(res.status).toBe(400);
    expect(mocks.runShipmentTransmissionDryRun).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid matchIds type', async () => {
    const res = await POST(buildRequest({ matchIds: 'nope' }), params);
    expect(res.status).toBe(400);
  });

  it('returns 400 when matchIds exceed max', async () => {
    const res = await POST(
      buildRequest({ matchIds: Array.from({ length: 501 }, (_, i) => `m${i}`) }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-boolean retryFailed', async () => {
    const res = await POST(buildRequest({ retryFailed: 1 }), params);
    expect(res.status).toBe(400);
  });

  it('returns 404 from service for foreign/missing batch', async () => {
    mocks.runShipmentTransmissionDryRun.mockResolvedValue({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
    const res = await POST(buildRequest({}), params);
    expect(res.status).toBe(404);
  });

  it('returns 409 when batch not READY', async () => {
    mocks.runShipmentTransmissionDryRun.mockResolvedValue({
      success: false,
      status: 409,
      error: 'READY 상태의 배치만 송장전송 dry-run을 실행할 수 있습니다.',
    });
    const res = await POST(buildRequest({}), params);
    expect(res.status).toBe(409);
  });

  it('returns 200 dry-run body and scopes userId+batchId', async () => {
    const res = await POST(
      buildRequest({ matchIds: ['match-1'], retryFailed: true }),
      params,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(json.results[0].candidate).not.toHaveProperty('userId');
    expect(JSON.stringify(json)).not.toMatch(/credential|decrypt|password/i);
    expect(mocks.runShipmentTransmissionDryRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-a',
        batchId: 'batch-1',
        matchIds: ['match-1'],
        retryFailed: true,
      }),
    );
  });

  it('passes empty matchIds through as zero selection', async () => {
    await POST(buildRequest({ matchIds: [] }), params);
    expect(mocks.runShipmentTransmissionDryRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ matchIds: [], retryFailed: false }),
    );
  });

  it('treats missing body as full-batch evaluation', async () => {
    await POST(buildRequest(), params);
    expect(mocks.runShipmentTransmissionDryRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ matchIds: undefined, retryFailed: false }),
    );
  });

  it('treats Content-Length 0 empty POST as full-batch evaluation', async () => {
    const req = new Request(
      'http://localhost/api/order/integration/shipments/uploads/batch-1/transmit/dry-run',
      { method: 'POST', headers: { 'Content-Length': '0' } },
    );
    await POST(req, params);
    expect(mocks.runShipmentTransmissionDryRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ matchIds: undefined, retryFailed: false }),
    );
  });

  it('treats {} body as full-batch evaluation', async () => {
    await POST(buildRequest({}), params);
    expect(mocks.runShipmentTransmissionDryRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ matchIds: undefined, retryFailed: false }),
    );
  });

  it('passes trimmed matchIds from body parser', async () => {
    await POST(buildRequest({ matchIds: [' match-1 ', 'match-1'] }), params);
    expect(mocks.runShipmentTransmissionDryRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ matchIds: ['match-1', 'match-1'] }),
    );
  });

  it('returns 500 with sanitized client message on unexpected throw', async () => {
    mocks.runShipmentTransmissionDryRun.mockRejectedValue(
      new Error('prisma explode host=db.example secret=x'),
    );
    const res = await POST(buildRequest({}), params);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('송장전송 dry-run 처리 중 오류가 발생했습니다.');
    expect(JSON.stringify(json)).not.toMatch(/prisma explode|db\.example|secret=/);
  });
});
