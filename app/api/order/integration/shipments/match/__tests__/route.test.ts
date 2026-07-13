import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  isAdminEmail: vi.fn(),
  matchUploadedShipmentFile: vi.fn(),
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

vi.mock('@/app/lib/order-integration/shipments/match-uploaded-shipment-file', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/shipments/match-uploaded-shipment-file')
  >('@/app/lib/order-integration/shipments/match-uploaded-shipment-file');

  return {
    ...actual,
    matchUploadedShipmentFile: mocks.matchUploadedShipmentFile,
  };
});

import { POST } from '../route';

function buildRequest(formData: FormData) {
  return new Request('http://localhost/api/order/integration/shipments/match', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/order/integration/shipments/match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'user@example.com' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.matchUploadedShipmentFile.mockResolvedValue({
      success: true,
      body: {
        success: true,
        file: { name: 'shipments.csv', type: 'text/csv', size: 10 },
        parse: { ok: true, rowCount: 1, warningCount: 0, warnings: [] },
        orders: { loadedCount: 1, scope: {} },
        match: {
          totalRows: 1,
          matchedConfidentCount: 1,
          matchedWarningCount: 0,
          multipleCandidatesCount: 0,
          notMatchedCount: 0,
          duplicateTrackingNumberCount: 0,
          alreadyShippedCount: 0,
          cancelledOrInvalidOrderCount: 0,
          rows: [],
          displayRows: [],
        },
      },
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

  it('returns 403 when user is not admin', async () => {
    mocks.isAdminEmail.mockReturnValueOnce(false);

    const formData = new FormData();
    formData.append('file', new File(['송장번호\n1'], 'shipments.csv', { type: 'text/csv' }));

    const response = await POST(buildRequest(formData));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('관리자 권한이 필요합니다.');
  });

  it('returns 400 when file is missing', async () => {
    const response = await POST(buildRequest(new FormData()));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('업로드할 송장 파일이 필요합니다.');
  });

  it('delegates matching to helper with session userId', async () => {
    const formData = new FormData();
    formData.append('file', new File(['송장번호\n1'], 'shipments.csv', { type: 'text/csv' }));
    formData.append('provider', 'SMARTSTORE');
    formData.append('integrationAccountId', 'acc-1');
    formData.append('batchId', 'batch-1');

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(200);
    expect(mocks.matchUploadedShipmentFile).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          userId: 'user-a',
          provider: 'SMARTSTORE',
          integrationAccountId: 'acc-1',
          batchId: 'batch-1',
        }),
      }),
    );
  });
});
