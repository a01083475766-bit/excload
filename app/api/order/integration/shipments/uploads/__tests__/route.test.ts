import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  isAdminEmail: vi.fn(),
  uploadAndPersistShipmentFile: vi.fn(),
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

vi.mock('@/app/lib/order-integration/shipments/upload-and-persist-shipment-file', () => ({
  uploadAndPersistShipmentFile: mocks.uploadAndPersistShipmentFile,
}));

import { POST } from '../route';

function buildRequest(formData: FormData) {
  return new Request('http://localhost/api/order/integration/shipments/uploads', {
    method: 'POST',
    body: formData,
  });
}

function buildSuccessBody(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    uploadBatch: {
      id: 'upload-batch-1',
      rowCount: 1,
      matchCount: 1,
    },
    file: { name: 'shipments.csv', type: 'text/csv', size: 10 },
    parse: { ok: true, rowCount: 1, warningCount: 0, warnings: [] },
    orders: { loadedCount: 0, scope: {} },
    match: {
      totalRows: 1,
      matchedConfidentCount: 0,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
      rows: [],
      displayRows: [],
    },
    ...overrides,
  };
}

describe('POST /api/order/integration/shipments/uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.uploadAndPersistShipmentFile.mockResolvedValue({
      success: true,
      body: buildSuccessBody(),
    });
  });

  it('returns 401 when user is not logged in', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.append('file', new File(['송장번호\n1'], 'shipments.csv', { type: 'text/csv' }));

    const response = await POST(buildRequest(formData));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('로그인이 필요합니다.');
  });

  it('allows authenticated non-admin users', async () => {
    mocks.isAdminEmail.mockReturnValueOnce(false);

    const formData = new FormData();
    formData.append('file', new File(['송장번호\n1'], 'shipments.csv', { type: 'text/csv' }));

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(200);
    expect(mocks.uploadAndPersistShipmentFile).toHaveBeenCalled();
  });

  it('returns 400 when file is missing', async () => {
    const response = await POST(buildRequest(new FormData()));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('업로드할 송장 파일이 필요합니다.');
  });

  it('delegates csv upload to uploadAndPersistShipmentFile with session userId', async () => {
    const formData = new FormData();
    formData.append('file', new File(['송장번호\n1'], 'shipments.csv', { type: 'text/csv' }));
    formData.append('provider', 'SMARTSTORE');
    formData.append('integrationAccountId', 'acc-1');
    formData.append('batchId', 'batch-1');

    const response = await POST(buildRequest(formData));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.uploadAndPersistShipmentFile).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          userId: 'user-a',
          provider: 'SMARTSTORE',
          integrationAccountId: 'acc-1',
          batchId: 'batch-1',
        }),
        file: expect.objectContaining({
          name: 'shipments.csv',
        }),
      }),
    );
    expect(json.uploadBatch).toEqual({
      id: 'upload-batch-1',
      rowCount: 1,
      matchCount: 1,
    });
  });

  it('delegates xlsx upload to uploadAndPersistShipmentFile', async () => {
    const formData = new FormData();
    formData.append(
      'file',
      new File(['binary'], 'shipments.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(200);
    expect(mocks.uploadAndPersistShipmentFile).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: 'shipments.xlsx' }),
      }),
    );
  });

  it('returns persist failure as safe error response', async () => {
    mocks.uploadAndPersistShipmentFile.mockResolvedValueOnce({
      success: false,
      status: 500,
      error: '송장 업로드 결과를 저장하는 중 오류가 발생했습니다.',
    });

    const formData = new FormData();
    formData.append('file', new File(['송장번호\n1'], 'shipments.csv', { type: 'text/csv' }));

    const response = await POST(buildRequest(formData));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('송장 업로드 결과를 저장하는 중 오류가 발생했습니다.');
  });

  it('returns success when order snapshots are empty', async () => {
    mocks.uploadAndPersistShipmentFile.mockResolvedValueOnce({
      success: true,
      body: buildSuccessBody({
        orders: { loadedCount: 0, scope: {} },
        match: {
          totalRows: 1,
          matchedConfidentCount: 0,
          matchedWarningCount: 0,
          multipleCandidatesCount: 0,
          notMatchedCount: 1,
          duplicateTrackingNumberCount: 0,
          alreadyShippedCount: 0,
          cancelledOrInvalidOrderCount: 0,
          rows: [
            {
              shipmentRowIndex: 0,
              matchStatus: 'NOT_MATCHED',
              matchScore: 0,
              matchReason: '점수 미달',
              mismatchFields: [],
              matchedOrderId: null,
              candidates: [],
              transmissionStatus: 'NOT_READY',
            },
          ],
          displayRows: [],
        },
      }),
    });

    const formData = new FormData();
    formData.append('file', new File(['송장번호\n1'], 'shipments.csv', { type: 'text/csv' }));

    const response = await POST(buildRequest(formData));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.orders.loadedCount).toBe(0);
    expect(json.uploadBatch.id).toBe('upload-batch-1');
  });
});
