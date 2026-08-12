import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const requireUserMock = vi.fn();
const getAccountMock = vi.fn();
const ensureTokenMock = vi.fn();
const runConfirmMock = vi.fn();
const isProxyMock = vi.fn();

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  isOrderIntegrationUserAuthFailure: (auth: { ok?: boolean }) => auth?.ok === false,
  requireOrderIntegrationUser: () => requireUserMock(),
}));

vi.mock('@/app/lib/integration-proxy/config', () => ({
  isIntegrationProxyConfigured: () => isProxyMock(),
}));

vi.mock('@/app/lib/order-integration/cafe24-account', () => ({
  getCafe24AccountForUser: (userId: string) => getAccountMock(userId),
  toCafe24Credentials: () => ({ mallId: 'demo', clientId: 'id', clientSecret: 'secret' }),
  ensureCafe24AccessToken: (account: unknown) => ensureTokenMock(account),
}));

vi.mock('@/app/lib/cafe24/cafe24-confirm', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/cafe24/cafe24-confirm')>(
    '@/app/lib/cafe24/cafe24-confirm',
  );
  return {
    ...actual,
    runCafe24Confirm: (input: unknown) => runConfirmMock(input),
  };
});

import { POST } from '@/app/api/order/integration/cafe24/confirm-orders/route';

describe('POST /api/order/integration/cafe24/confirm-orders', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    getAccountMock.mockReset();
    ensureTokenMock.mockReset();
    runConfirmMock.mockReset();
    isProxyMock.mockReset();
    isProxyMock.mockReturnValue(true);
    requireUserMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    getAccountMock.mockResolvedValue({ id: 'acct-owned' });
    ensureTokenMock.mockResolvedValue({
      accessToken: 'token',
      tokens: {
        accessToken: 'token',
        refreshToken: 'r',
        expiresAt: '2099-01-01T00:00:00+09:00',
        scopes: ['mall.read_order', 'mall.write_order', 'mall.read_shipping'],
      },
    });
    runConfirmMock.mockResolvedValue({
      requestedCount: 1,
      confirmedCount: 1,
      alreadyConfirmedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      putCallCount: 1,
      results: [
        {
          productOrderNo: 'I1',
          orderId: 'O1',
          orderItemCode: 'I1',
          shopNo: 1,
          status: 'CONFIRMED',
          message: 'ok',
        },
      ],
    });
  });

  it('rejects unauthenticated', async () => {
    requireUserMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'auth' }, { status: 401 }),
    });
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ items: [{ orderId: 'O1', orderStatus: 'N10' }] }),
      }),
    );
    expect(res.status).toBe(401);
    expect(runConfirmMock).not.toHaveBeenCalled();
  });

  it('blocks other users accountId', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acct-other',
          items: [{ orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(runConfirmMock).not.toHaveBeenCalled();
  });

  it('returns summary for owned account', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acct-owned',
          items: [{ orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.processStatus).toBe('prepare');
    expect(data.summary.confirmed).toBe(1);
    expect(runConfirmMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(data)).not.toMatch(/accessToken|Bearer/i);
  });

  it('rejects oversized order id', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acct-owned',
          items: [{ orderId: 'X'.repeat(65), orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(runConfirmMock).not.toHaveBeenCalled();
  });

  it('rejects empty items array', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'acct-owned', items: [] }),
      }),
    );
    expect(res.status).toBe(400);
    expect(runConfirmMock).not.toHaveBeenCalled();
  });

  it('rejects client-supplied accessToken in body', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acct-owned',
          accessToken: 'stolen',
          items: [{ orderId: 'O1', orderItemCode: 'I1', orderStatus: 'N10', shopNo: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(runConfirmMock).not.toHaveBeenCalled();
  });
});
