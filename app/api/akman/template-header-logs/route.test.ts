import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
  findMany: vi.fn(),
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
    templateHeaderLog: {
      findMany: mocks.findMany,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import { DELETE, GET } from './route';

function deleteRequest(body: unknown) {
  return new Request('http://localhost/api/akman/template-header-logs', {
    method: 'DELETE',
    body: JSON.stringify(body),
  }) as never;
}

describe('DELETE /api/akman/template-header-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([]);
    mocks.deleteMany.mockResolvedValue({ count: 2 });
  });

  it('관리자가 아니면 삭제할 수 없다', async () => {
    mocks.isAdminEmail.mockReturnValue(false);

    const res = await DELETE(deleteRequest({ ids: ['log-1'] }));

    expect(res.status).toBe(403);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('선택한 수집 로그를 일괄 삭제한다', async () => {
    const res = await DELETE(deleteRequest({ ids: ['log-1', 'log-2', 'log-1', ''] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.deletedCount).toBe(2);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['log-1', 'log-2'] } },
    });
  });

  it('최근 30일 헤더 사용 TOP 원천 로그를 초기화한다', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'log-1', headers: ['주문번호'], unknownHeaders: [] },
      { id: 'log-2', headers: ['수량'], unknownHeaders: [] },
    ]);

    const res = await DELETE(deleteRequest({ reset: 'usageTop30', headerSearch: '주문' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['log-1'] } },
    });
  });

  it('최근 30일 미매핑 TOP 원천 로그를 초기화한다', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'log-1', headers: ['주문번호'], unknownHeaders: [] },
      { id: 'log-2', headers: ['미확인'], unknownHeaders: ['미확인'] },
    ]);

    const res = await DELETE(deleteRequest({ reset: 'unknownTop30' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['log-2'] } },
    });
  });

  it('삭제 대상이 없으면 400을 반환한다', async () => {
    const res = await DELETE(deleteRequest({ ids: ['', null] }));

    expect(res.status).toBe(400);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});

function getRequest(query = '') {
  return new Request(`http://localhost/api/akman/template-header-logs${query}`) as never;
}

describe('GET /api/akman/template-header-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
  });

  it('업로드 파일별 flat 목록에서 headers 순서·userId를 반환한다', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'log-1',
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
        page: 'order-convert',
        templateName: null,
        courierName: '로젠택배',
        headerCount: 3,
        mappingSuccessRate: 1,
        headers: ['상품명', '수량', '상품명'],
        unknownHeaders: [],
        mappedHeaders: [],
        fileSessionId: null,
        templateId: null,
        source: 'order_upload',
        userId: 'user-1',
        user: { id: 'user-1', email: 'abc@naver.com' },
      },
    ]);

    const res = await GET(getRequest('?limit=10'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.grouped).toBe(false);
    expect(json.data[0].headers).toEqual(['상품명', '수량', '상품명']);
    expect(json.data[0].userId).toBe('user-1');
    expect(json.data[0].layoutColumnCount).toBe(3);
  });
});
