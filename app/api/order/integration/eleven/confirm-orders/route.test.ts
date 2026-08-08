import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const requireUserMock = vi.fn();
const getAccountMock = vi.fn();
const runConfirmMock = vi.fn();
const isProxyMock = vi.fn();

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  isOrderIntegrationUserAuthFailure: (auth: { ok?: boolean }) => auth?.ok === false,
  requireOrderIntegrationUser: () => requireUserMock(),
}));

vi.mock('@/app/lib/integration-proxy/config', () => ({
  isIntegrationProxyConfigured: () => isProxyMock(),
}));

vi.mock('@/app/lib/order-integration/eleven-account', () => ({
  getElevenAccountForUser: (userId: string) => getAccountMock(userId),
  toElevenCredentials: () => ({ openapikey: 'masked' }),
}));

vi.mock('@/app/lib/eleven/client', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/eleven/client')>(
    '@/app/lib/eleven/client',
  );
  return {
    ...actual,
    elevenReqPackaging: vi.fn(),
    toUserFacingElevenErrorMessage: (e: unknown) =>
      e instanceof Error ? e.message : 'error',
  };
});

vi.mock('@/app/lib/eleven/eleven-confirm', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/eleven/eleven-confirm')>(
    '@/app/lib/eleven/eleven-confirm',
  );
  return {
    ...actual,
    runElevenConfirm: (input: unknown) => runConfirmMock(input),
    callElevenReqPackagingForLine: vi.fn(),
  };
});

import { POST } from '@/app/api/order/integration/eleven/confirm-orders/route';

describe('POST /api/order/integration/eleven/confirm-orders', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    getAccountMock.mockReset();
    runConfirmMock.mockReset();
    isProxyMock.mockReset();
    isProxyMock.mockReturnValue(true);
    requireUserMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    getAccountMock.mockResolvedValue({ id: 'acct-owned' });
    runConfirmMock.mockResolvedValue({
      requestedCount: 1,
      confirmedCount: 1,
      alreadyConfirmedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [
        {
          productOrderNo: '1-1',
          ordNo: '1',
          ordPrdSeq: '1',
          dlvNo: 'D1',
          status: 'CONFIRMED',
          message: 'ok',
        },
      ],
    });
  });

  it('blocks other users accountId', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acct-other',
          items: [{ ordNo: '1', ordPrdSeq: '1', dlvNo: 'D1', ordStat: '101', ordStatNm: '결제완료' }],
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(runConfirmMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated', async () => {
    requireUserMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'auth' }, { status: 401 }),
    });
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ items: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
