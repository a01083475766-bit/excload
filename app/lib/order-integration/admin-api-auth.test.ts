import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
  userFindUnique: vi.fn(),
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

import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';

describe('requireOrderIntegrationAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminEmail.mockReturnValue(false);
    mocks.userFindUnique.mockResolvedValue({ id: 'admin-user-id' });
  });

  it('returns 401 when the session is missing', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const result = await requireOrderIntegrationAdmin();

    expect(isAdminAuthFailure(result)).toBe(true);
    if (!isAdminAuthFailure(result)) throw new Error('Expected an auth failure');
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({ error: '로그인이 필요합니다.' });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('returns 403 for an authenticated non-admin user', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: 'user@example.com', isAdmin: false },
    });

    const result = await requireOrderIntegrationAdmin();

    expect(isAdminAuthFailure(result)).toBe(true);
    if (!isAdminAuthFailure(result)) throw new Error('Expected an auth failure');
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({ error: '관리자 권한이 필요합니다.' });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('allows an administrator recognized by the existing email rule', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: ' ADMIN@EXAMPLE.COM ', isAdmin: false },
    });
    mocks.isAdminEmail.mockReturnValue(true);

    const result = await requireOrderIntegrationAdmin();

    expect(mocks.isAdminEmail).toHaveBeenCalledWith('ADMIN@EXAMPLE.COM');
    expect(result).toEqual({ userId: 'admin-user-id', email: 'ADMIN@EXAMPLE.COM' });
  });

  it('allows session.user.isAdmin propagated from token.isAdmin', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: 'admin@example.com', isAdmin: true },
    });

    const result = await requireOrderIntegrationAdmin();

    expect(mocks.isAdminEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ userId: 'admin-user-id', email: 'admin@example.com' });
  });
});
