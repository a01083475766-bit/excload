import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
  clearCache: vi.fn(),
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

vi.mock('@/app/lib/header-alias-cache', () => ({
  clearHeaderAliasDictionaryCache: mocks.clearCache,
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    headerAlias: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      findMany: mocks.findMany,
    },
  },
}));

import { GET, POST } from './route';

const aliasRow = {
  id: 'alias-1',
  alias: '수취인명',
  baseHeader: '받는사람',
  source: 'admin',
  createdAt: new Date('2026-06-19T00:00:00.000Z'),
  updatedAt: new Date('2026-06-19T00:00:00.000Z'),
};

function postRequest(body: unknown) {
  return new Request('http://localhost/api/akman/header-alias', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never;
}

function getRequest(url = 'http://localhost/api/akman/header-alias') {
  return new Request(url) as never;
}

describe('/api/akman/header-alias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue(aliasRow);
    mocks.findMany.mockResolvedValue([aliasRow]);
  });

  it('정상 alias/baseHeader 생성이 가능하다', async () => {
    const res = await POST(postRequest({ alias: '수취인명', baseHeader: '받는사람' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.alias).toBe('수취인명');
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        alias: '수취인명',
        baseHeader: '받는사람',
        source: 'admin',
      },
    });
    expect(mocks.clearCache).toHaveBeenCalledTimes(1);
  });

  it('BASE_HEADERS에 없는 baseHeader는 400을 반환한다', async () => {
    const res = await POST(postRequest({ alias: '수취인명', baseHeader: '없는기준헤더' }));

    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('빈 alias는 400을 반환한다', async () => {
    const res = await POST(postRequest({ alias: '   ', baseHeader: '받는사람' }));

    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('빈 baseHeader는 400을 반환한다', async () => {
    const res = await POST(postRequest({ alias: '수취인명', baseHeader: '' }));

    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('같은 alias와 같은 baseHeader는 이미 등록됨으로 성공 처리한다', async () => {
    mocks.findUnique.mockResolvedValue(aliasRow);

    const res = await POST(postRequest({ alias: '수취인명', baseHeader: '받는사람' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.alreadyExists).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.clearCache).toHaveBeenCalledTimes(1);
  });

  it('같은 alias와 다른 baseHeader는 409를 반환하고 기존 데이터를 덮어쓰지 않는다', async () => {
    mocks.findUnique.mockResolvedValue(aliasRow);

    const res = await POST(postRequest({ alias: '수취인명', baseHeader: '상품명' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.conflict).toEqual({
      alias: '수취인명',
      existingBaseHeader: '받는사람',
      requestedBaseHeader: '상품명',
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.clearCache).not.toHaveBeenCalled();
  });

  it('GET 기존 조회 동작을 유지한다', async () => {
    const res = await GET(getRequest('http://localhost/api/akman/header-alias?alias=%EC%88%98%EC%B7%A8'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.count).toBe(1);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        alias: {
          contains: '수취',
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});
