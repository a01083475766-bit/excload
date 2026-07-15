import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  isAdminEmail: vi.fn(),
  buildShipmentUploadExportRows: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/app/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/app/lib/admin-auth', () => ({
  isAdminEmail: mocks.isAdminEmail,
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock('@/app/lib/order-integration/shipments/build-shipment-upload-export-rows', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/build-shipment-upload-export-rows')
  >('@/app/lib/order-integration/shipments/build-shipment-upload-export-rows');

  return {
    ...actual,
    buildShipmentUploadExportRows: mocks.buildShipmentUploadExportRows,
  };
});

import { GET } from '../route';

function buildExportBody() {
  return {
    batchId: 'batch-1',
    status: 'READY' as const,
    excludedCount: 1,
    groups: [
      {
        provider: 'SMARTSTORE' as const,
        integrationAccountId: 'acc-1',
        rows: [
          {
            orderSyncOrderId: 'order-1',
            shipmentMatchId: 'match-1',
            shipmentUploadRowId: 'row-1',
            mallOrderNo: 'ORD-1001',
            excloadOrderNo: 'EXC-1',
            trackingNumber: '12345678901234',
            carrierName: 'CJ대한통운',
            recipientNameMasked: '홍*동',
            recipientPhoneMasked: '010-****-5678',
          },
        ],
      },
      {
        provider: 'COUPANG' as const,
        integrationAccountId: 'acc-2',
        rows: [
          {
            orderSyncOrderId: 'order-2',
            shipmentMatchId: 'match-2',
            shipmentUploadRowId: 'row-2',
            mallOrderNo: 'ORD-2001',
            excloadOrderNo: 'EXC-2',
            trackingNumber: '999988887777',
            carrierName: '한진택배',
            recipientNameMasked: '김*수',
            recipientPhoneMasked: '010-****-9999',
          },
        ],
      },
    ],
  };
}

function buildRequest(query = '') {
  return new Request(
    `http://localhost/api/order/integration/shipments/uploads/batch-1/export${query}`,
    { method: 'GET' },
  );
}

describe('GET /api/order/integration/shipments/uploads/[batchId]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.buildShipmentUploadExportRows.mockResolvedValue({
      success: true,
      body: buildExportBody(),
    });
  });

  it('returns 401 when user is not logged in', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 403 for authenticated non-admin users', async () => {
    mocks.isAdminEmail.mockReturnValueOnce(false);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.buildShipmentUploadExportRows).not.toHaveBeenCalled();
  });

  it('downloads xlsx for READY batch', async () => {
    const response = await GET(buildRequest('?format=xlsx'), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers.get('Content-Disposition')).toContain(
      'attachment; filename="excload-shipment-upload-batch-1.xlsx"',
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('downloads csv when provider and integrationAccountId are specified', async () => {
    const response = await GET(
      buildRequest('?format=csv&provider=SMARTSTORE&integrationAccountId=acc-1'),
      {
        params: Promise.resolve({ batchId: 'batch-1' }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain(
      'attachment; filename="excload-shipment-upload-SMARTSTORE-batch-1.csv"',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const text = new TextDecoder('utf-8').decode(bytes);
    expect(text).toContain('ORD-1001');
    expect(text).not.toContain('rawRowJson');
    expect(text).not.toContain('candidateOrdersJson');
    expect(text).not.toContain('홍*동');
  });

  it('returns 400 for csv when multiple groups exist without provider filter', async () => {
    const response = await GET(buildRequest('?format=csv'), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'CSV 다운로드는 쇼핑몰(provider)를 지정해 주세요.',
    });
  });

  it('returns 409 when batch is not READY', async () => {
    mocks.buildShipmentUploadExportRows.mockResolvedValueOnce({
      success: false,
      status: 409,
      error: 'READY 상태의 배치만 보낼 수 있습니다.',
    });

    const response = await GET(buildRequest('?format=xlsx'), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });

    expect(response.status).toBe(409);
  });

  it('returns 404 for another user batch', async () => {
    mocks.buildShipmentUploadExportRows.mockResolvedValueOnce({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });

    const response = await GET(buildRequest('?format=xlsx'), {
      params: Promise.resolve({ batchId: 'batch-1' }),
    });

    expect(response.status).toBe(404);
  });
});
