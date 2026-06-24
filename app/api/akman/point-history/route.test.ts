import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
  deleteMany: vi.fn(),
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
    pointHistory: {
      deleteMany: mocks.deleteMany,
    },
  },
}));

vi.mock('@/app/lib/point-history-filter', () => ({
  grantsOnlyPointHistoryFilter: vi.fn(() => ({})),
}));

import { DELETE } from './route';

function deleteRequest(body: unknown) {
  return new Request('http://localhost/api/akman/point-history', {
    method: 'DELETE',
    body: JSON.stringify(body),
  }) as never;
}

describe('DELETE /api/akman/point-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.deleteMany.mockResolvedValue({ count: 2 });
  });

  it('관리자가 아니면 삭제할 수 없다', async () => {
    mocks.isAdminEmail.mockReturnValue(false);

    const res = await DELETE(deleteRequest({ ids: ['point-history-1'] }));

    expect(res.status).toBe(403);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('선택한 사용량 이력을 일괄 삭제한다', async () => {
    const res = await DELETE(deleteRequest({ ids: ['point-history-1', 'point-history-2', 'point-history-1', ''] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.deletedCount).toBe(2);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['point-history-1', 'point-history-2'] } },
    });
  });

  it('삭제할 ID가 없으면 400을 반환한다', async () => {
    const res = await DELETE(deleteRequest({ ids: ['', null] }));

    expect(res.status).toBe(400);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
