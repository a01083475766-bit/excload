import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({
    user: { email: 'user@example.com', id: 'u1' },
  })),
}));

vi.mock('@/app/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/app/lib/admin-auth', () => ({
  isAdminEmail: (email: string) => email === 'admin@excload.com',
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { getServerSession } from 'next-auth';
import { isAdminEmail } from '@/app/lib/admin-auth';

describe('requireAkmanAdmin for voucher email APIs', () => {
  it('blocks non-admin users', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: 'user@example.com', id: 'u1' },
    } as never);
    expect(isAdminEmail('user@example.com')).toBe(false);
    const result = await requireAkmanAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it('allows admin users', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: 'admin@excload.com', id: 'admin1' },
    } as never);
    const result = await requireAkmanAdmin();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe('admin@excload.com');
    }
  });
});
