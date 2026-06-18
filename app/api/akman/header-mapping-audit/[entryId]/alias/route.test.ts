import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
  findEntry: vi.fn(),
  findAlias: vi.fn(),
  createAlias: vi.fn(),
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
    headerMappingAuditEntry: {
      findUnique: mocks.findEntry,
    },
    headerAlias: {
      findUnique: mocks.findAlias,
      create: mocks.createAlias,
    },
  },
}));

import { POST } from './route';

const confirmedEntry = {
  id: 'entry-1',
  originalHeader: '수취인명',
  baseHeader: '받는사람',
  adminSelectedBaseHeader: null,
  method: 'AI',
  adminStatus: 'CONFIRMED',
  auditLog: {
    expiresAt: new Date('2999-01-01T00:00:00.000Z'),
  },
};

const changedEntry = {
  ...confirmedEntry,
  baseHeader: '받는사람',
  adminSelectedBaseHeader: '상품명',
  adminStatus: 'CHANGED',
};

const aliasRow = {
  id: 'alias-1',
  alias: '수취인명',
  baseHeader: '받는사람',
  source: 'header-mapping-audit:entry-1',
  createdAt: new Date('2026-06-19T00:00:00.000Z'),
  updatedAt: new Date('2026-06-19T00:00:00.000Z'),
};

function request() {
  return new Request('http://localhost/api/akman/header-mapping-audit/entry-1/alias', {
    method: 'POST',
  }) as never;
}

function params(entryId = 'entry-1') {
  return { params: Promise.resolve({ entryId }) };
}

describe('POST /api/akman/header-mapping-audit/[entryId]/alias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.findEntry.mockResolvedValue(confirmedEntry);
    mocks.findAlias.mockResolvedValue(null);
    mocks.createAlias.mockResolvedValue(aliasRow);
  });

  it('관리자가 아니면 403을 반환한다', async () => {
    mocks.isAdminEmail.mockReturnValue(false);

    const res = await POST(request(), params());

    expect(res.status).toBe(403);
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it('없는 entryId는 404를 반환한다', async () => {
    mocks.findEntry.mockResolvedValue(null);

    const res = await POST(request(), params('missing-entry'));

    expect(res.status).toBe(404);
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it('adminStatus가 CONFIRMED가 아니면 400을 반환한다', async () => {
    mocks.findEntry.mockResolvedValue({ ...confirmedEntry, adminStatus: 'PENDING' });

    const res = await POST(request(), params());

    expect(res.status).toBe(400);
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'HOLD', 'IGNORED'] as const)('%s 상태는 별칭 추가를 허용하지 않는다', async (adminStatus) => {
    mocks.findEntry.mockResolvedValue({ ...confirmedEntry, adminStatus });

    const res = await POST(request(), params());

    expect(res.status).toBe(400);
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it('baseHeader가 없으면 400을 반환한다', async () => {
    mocks.findEntry.mockResolvedValue({ ...confirmedEntry, baseHeader: null });

    const res = await POST(request(), params());

    expect(res.status).toBe(400);
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it('targetBaseHeader가 없으면 400을 반환한다', async () => {
    mocks.findEntry.mockResolvedValue({
      ...confirmedEntry,
      baseHeader: null,
      adminSelectedBaseHeader: null,
    });

    const res = await POST(request(), params());

    expect(res.status).toBe(400);
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it('BASE_HEADERS에 없는 baseHeader면 400을 반환한다', async () => {
    mocks.findEntry.mockResolvedValue({ ...confirmedEntry, baseHeader: '없는기준헤더' });

    const res = await POST(request(), params());

    expect(res.status).toBe(400);
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it('만료된 audit log의 entry면 400을 반환한다', async () => {
    mocks.findEntry.mockResolvedValue({
      ...confirmedEntry,
      auditLog: {
        expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      },
    });

    const res = await POST(request(), params());

    expect(res.status).toBe(400);
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it('기존 alias가 없으면 HeaderAlias를 생성한다', async () => {
    const res = await POST(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.createAlias).toHaveBeenCalledWith({
      data: {
        alias: '수취인명',
        baseHeader: '받는사람',
        source: 'header-mapping-audit:entry-1',
      },
    });
    expect(mocks.clearCache).toHaveBeenCalledTimes(1);
  });

  it('CHANGED 상태를 허용하고 adminSelectedBaseHeader로 HeaderAlias를 생성한다', async () => {
    mocks.findEntry.mockResolvedValue(changedEntry);

    const res = await POST(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.createAlias).toHaveBeenCalledWith({
      data: {
        alias: '수취인명',
        baseHeader: '상품명',
        source: 'header-mapping-audit:entry-1',
      },
    });
  });

  it('CHANGED 상태에서도 기존 baseHeader는 덮어쓰지 않는다', async () => {
    mocks.findEntry.mockResolvedValue(changedEntry);

    await POST(request(), params());

    const createData = mocks.createAlias.mock.calls[0]?.[0]?.data;
    expect(createData.baseHeader).toBe('상품명');
    expect(changedEntry.baseHeader).toBe('받는사람');
  });

  it('같은 alias와 같은 baseHeader가 있으면 alreadyExists 성공 처리한다', async () => {
    mocks.findAlias.mockResolvedValue(aliasRow);

    const res = await POST(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alreadyExists).toBe(true);
    expect(mocks.createAlias).not.toHaveBeenCalled();
    expect(mocks.clearCache).toHaveBeenCalledTimes(1);
  });

  it('CHANGED 상태에서 같은 alias와 같은 targetBaseHeader가 있으면 alreadyExists 처리한다', async () => {
    mocks.findEntry.mockResolvedValue(changedEntry);
    mocks.findAlias.mockResolvedValue({ ...aliasRow, baseHeader: '상품명' });

    const res = await POST(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alreadyExists).toBe(true);
    expect(mocks.createAlias).not.toHaveBeenCalled();
    expect(mocks.clearCache).toHaveBeenCalledTimes(1);
  });

  it('같은 alias와 다른 baseHeader가 있으면 409 Conflict를 반환한다', async () => {
    mocks.findAlias.mockResolvedValue({ ...aliasRow, baseHeader: '상품명' });

    const res = await POST(request(), params());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.conflict).toEqual({
      alias: '수취인명',
      existingBaseHeader: '상품명',
      requestedBaseHeader: '받는사람',
    });
    expect(mocks.createAlias).not.toHaveBeenCalled();
    expect(mocks.clearCache).not.toHaveBeenCalled();
  });

  it('CHANGED 상태에서 같은 alias와 다른 baseHeader가 있으면 409 Conflict를 반환한다', async () => {
    mocks.findEntry.mockResolvedValue(changedEntry);
    mocks.findAlias.mockResolvedValue({ ...aliasRow, baseHeader: '받는사람' });

    const res = await POST(request(), params());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.conflict).toEqual({
      alias: '수취인명',
      existingBaseHeader: '받는사람',
      requestedBaseHeader: '상품명',
    });
    expect(mocks.createAlias).not.toHaveBeenCalled();
    expect(mocks.clearCache).not.toHaveBeenCalled();
  });

  it('DB_ALIAS method는 별칭 추가 불필요로 처리한다', async () => {
    mocks.findEntry.mockResolvedValue({ ...confirmedEntry, method: 'DB_ALIAS' });

    const res = await POST(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alreadyDbAlias).toBe(true);
    expect(mocks.findAlias).not.toHaveBeenCalled();
    expect(mocks.createAlias).not.toHaveBeenCalled();
  });

  it('LOW_CONFIDENCE라도 CONFIRMED이고 baseHeader가 있으면 허용한다', async () => {
    mocks.findEntry.mockResolvedValue({ ...confirmedEntry, status: 'LOW_CONFIDENCE' });

    const res = await POST(request(), params());

    expect(res.status).toBe(200);
    expect(mocks.createAlias).toHaveBeenCalledTimes(1);
  });

  it('응답에 원본 rows/file/original sample이 없다', async () => {
    const res = await POST(request(), params());
    const json = await res.json();
    const serialized = JSON.stringify(json);

    expect(serialized).not.toContain('rows');
    expect(serialized).not.toContain('fileName');
    expect(serialized).not.toContain('originalFile');
    expect(serialized).not.toContain('originalSample');
    expect(serialized).not.toContain('maskedSamples');
  });
});
