import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirstMock = vi.fn();
const countMock = vi.fn();

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    orderIntegrationAccount: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      count: (...args: unknown[]) => countMock(...args),
    },
  },
}));

import {
  getOwnedSmartstoreAccount,
  resolveSmartstoreAccountForRequest,
} from '@/app/lib/order-integration/smartstore-account';

describe('SMARTSTORE-C1 account resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads owned SMARTSTORE account by userId+accountId (no arbitrary findFirst)', async () => {
    findFirstMock.mockResolvedValue({ id: 'acc-2', userId: 'user-1' });
    const account = await getOwnedSmartstoreAccount({
      userId: 'user-1',
      accountId: 'acc-2',
    });
    expect(account?.id).toBe('acc-2');
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        id: 'acc-2',
        userId: 'user-1',
        provider: 'SMARTSTORE',
      },
    });
  });

  it('blocks accountId that is not owned by userId', async () => {
    findFirstMock.mockResolvedValue(null);
    const resolved = await resolveSmartstoreAccountForRequest({
      userId: 'user-1',
      accountId: 'other-user-acc',
    });
    expect(resolved).toEqual({
      ok: false,
      status: 404,
      error: expect.stringContaining('계정을 찾을 수 없습니다'),
    });
  });

  it('blocks non-SMARTSTORE provider via ownership query (findFirst returns null)', async () => {
    findFirstMock.mockResolvedValue(null);
    const resolved = await resolveSmartstoreAccountForRequest({
      userId: 'user-1',
      accountId: 'coupang-acc',
    });
    expect(resolved.ok).toBe(false);
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: 'SMARTSTORE' }),
      }),
    );
  });

  it('blocks missing accountId when multiple SMARTSTORE accounts exist (no findFirst fallback)', async () => {
    countMock.mockResolvedValue(2);
    const resolved = await resolveSmartstoreAccountForRequest({
      userId: 'user-1',
      accountId: null,
    });
    expect(resolved).toEqual({
      ok: false,
      status: 400,
      error: expect.stringContaining('여러 개'),
    });
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('allows missing accountId only when exactly one SMARTSTORE account exists', async () => {
    countMock.mockResolvedValue(1);
    findFirstMock.mockResolvedValue({ id: 'only-acc', userId: 'user-1' });
    const resolved = await resolveSmartstoreAccountForRequest({
      userId: 'user-1',
      accountId: null,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.account.id).toBe('only-acc');
  });
});
