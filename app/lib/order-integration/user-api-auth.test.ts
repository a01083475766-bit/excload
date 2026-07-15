import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
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

import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';

describe('requireOrderIntegrationUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const result = await requireOrderIntegrationUser();

    expect(isOrderIntegrationUserAuthFailure(result)).toBe(true);
    if (!isOrderIntegrationUserAuthFailure(result)) throw new Error('Expected auth failure');
    expect(result.response.status).toBe(401);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('allows an authenticated regular user and returns only that DB userId', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: ' user@example.com ', isAdmin: false },
    });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-1' });

    const result = await requireOrderIntegrationUser();

    expect(isOrderIntegrationUserAuthFailure(result)).toBe(false);
    expect(result).toEqual({ userId: 'user-1', email: 'user@example.com' });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      select: { id: true },
    });
  });

  it('allows an administrator through the same user-scoped result', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: 'admin@example.com', isAdmin: true },
    });
    mocks.userFindUnique.mockResolvedValue({ id: 'admin-1' });

    await expect(requireOrderIntegrationUser()).resolves.toEqual({
      userId: 'admin-1',
      email: 'admin@example.com',
    });
  });

  it('returns 401 when the session email has no DB user', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { email: 'missing@example.com' } });
    mocks.userFindUnique.mockResolvedValue(null);

    const result = await requireOrderIntegrationUser();

    expect(isOrderIntegrationUserAuthFailure(result)).toBe(true);
    if (!isOrderIntegrationUserAuthFailure(result)) throw new Error('Expected auth failure');
    expect(result.response.status).toBe(401);
  });
});
