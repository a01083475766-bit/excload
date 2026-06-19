import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  deleteLog: vi.fn(),
  findHeaderAliases: vi.fn(),
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
    headerMappingAuditLog: {
      count: mocks.count,
      findMany: mocks.findMany,
      delete: mocks.deleteLog,
    },
    headerAlias: {
      findMany: mocks.findHeaderAliases,
    },
  },
}));

import { DELETE, GET } from './route';

const activeLog = {
  id: 'log-1',
  fileHash: 'hash-1',
  source: 'excel',
  totalHeaders: 2,
  autoMatchedCount: 1,
  unmappedCount: 1,
  lowConfidenceCount: 0,
  needsReviewCount: 0,
  entriesWithMaskedSamplesCount: 2,
  createdAt: new Date('2026-06-19T00:00:00.000Z'),
  expiresAt: new Date('2026-07-19T00:00:00.000Z'),
  entries: [
    {
      id: 'entry-1',
      originalHeader: '수취인',
      baseHeader: '받는사람',
      status: 'AUTO_MATCHED',
      method: 'STATIC_ALIAS',
      confidenceReason: '정적 별칭',
      sampleValueType: 'NAME',
      maskedSamples: ['[이름]'],
      sampleCount: 1,
      hasMaskedSamples: true,
      adminStatus: 'PENDING',
      adminSelectedBaseHeader: null,
      adminSelectedAt: null,
      adminMemo: null,
      reviewedAt: null,
      createdAt: new Date('2026-06-19T00:00:01.000Z'),
    },
    {
      id: 'entry-2',
      originalHeader: '미매핑헤더',
      baseHeader: null,
      status: 'UNMAPPED',
      method: 'UNMAPPED',
      confidenceReason: '매핑 실패',
      sampleValueType: 'CODE',
      maskedSamples: ['CPN*****001'],
      sampleCount: 1,
      hasMaskedSamples: true,
      adminStatus: 'PENDING',
      adminSelectedBaseHeader: null,
      adminSelectedAt: null,
      adminMemo: null,
      reviewedAt: null,
      createdAt: new Date('2026-06-19T00:00:02.000Z'),
    },
    {
      id: 'entry-3',
      originalHeader: '이미등록',
      baseHeader: '상품명',
      status: 'AUTO_MATCHED',
      method: 'STATIC_ALIAS',
      confidenceReason: '정적 별칭',
      sampleValueType: 'TEXT',
      maskedSamples: ['[텍스트]'],
      sampleCount: 1,
      hasMaskedSamples: true,
      adminStatus: 'PENDING',
      adminSelectedBaseHeader: null,
      adminSelectedAt: null,
      adminMemo: null,
      reviewedAt: null,
      createdAt: new Date('2026-06-19T00:00:03.000Z'),
    },
    {
      id: 'entry-4',
      originalHeader: '충돌헤더',
      baseHeader: '상품명',
      status: 'AUTO_MATCHED',
      method: 'STATIC_ALIAS',
      confidenceReason: '정적 별칭',
      sampleValueType: 'TEXT',
      maskedSamples: ['[텍스트]'],
      sampleCount: 1,
      hasMaskedSamples: true,
      adminStatus: 'PENDING',
      adminSelectedBaseHeader: null,
      adminSelectedAt: null,
      adminMemo: null,
      reviewedAt: null,
      createdAt: new Date('2026-06-19T00:00:04.000Z'),
    },
    {
      id: 'entry-5',
      originalHeader: 'DB별칭헤더',
      baseHeader: '받는사람',
      status: 'AUTO_MATCHED',
      method: 'DB_ALIAS',
      confidenceReason: 'DB 별칭',
      sampleValueType: 'NAME',
      maskedSamples: ['[이름]'],
      sampleCount: 1,
      hasMaskedSamples: true,
      adminStatus: 'PENDING',
      adminSelectedBaseHeader: null,
      adminSelectedAt: null,
      adminMemo: null,
      reviewedAt: null,
      createdAt: new Date('2026-06-19T00:00:05.000Z'),
    },
    {
      id: 'entry-6',
      originalHeader: '관리자선택',
      baseHeader: '받는사람',
      status: 'LOW_CONFIDENCE',
      method: 'AI',
      confidenceReason: '관리자 변경',
      sampleValueType: 'TEXT',
      maskedSamples: ['[텍스트]'],
      sampleCount: 1,
      hasMaskedSamples: true,
      adminStatus: 'CHANGED',
      adminSelectedBaseHeader: '상품명',
      adminSelectedAt: new Date('2026-06-19T00:10:00.000Z'),
      adminMemo: null,
      reviewedAt: null,
      createdAt: new Date('2026-06-19T00:00:06.000Z'),
    },
    {
      id: 'entry-7',
      originalHeader: '관리자충돌',
      baseHeader: '상품명',
      status: 'LOW_CONFIDENCE',
      method: 'AI',
      confidenceReason: '관리자 변경',
      sampleValueType: 'TEXT',
      maskedSamples: ['[텍스트]'],
      sampleCount: 1,
      hasMaskedSamples: true,
      adminStatus: 'CHANGED',
      adminSelectedBaseHeader: '받는사람',
      adminSelectedAt: new Date('2026-06-19T00:11:00.000Z'),
      adminMemo: null,
      reviewedAt: null,
      createdAt: new Date('2026-06-19T00:00:07.000Z'),
    },
  ],
};

function request(url: string) {
  return new Request(url) as never;
}

describe('GET /api/akman/header-mapping-audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([activeLog]);
    mocks.deleteLog.mockResolvedValue(activeLog);
    mocks.findHeaderAliases.mockResolvedValue([]);
  });

  it('관리자가 아니면 접근할 수 없다', async () => {
    mocks.isAdminEmail.mockReturnValue(false);

    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));

    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('목록 조회가 가능하고 maskedSamples만 반환한다', async () => {
    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0]).toEqual(
      expect.objectContaining({
        id: 'log-1',
        fileHash: 'hash-1',
        source: 'excel',
        totalHeaders: 2,
      }),
    );
    expect(json.data[0].entries[0]).toEqual(
      expect.objectContaining({
        originalHeader: '수취인',
        baseHeader: '받는사람',
        adminSelectedBaseHeader: null,
        adminSelectedAt: null,
        effectiveBaseHeader: '받는사람',
        maskedSamples: ['[이름]'],
        aliasStatus: 'NOT_REGISTERED',
        existingAliasBaseHeader: null,
      }),
    );
    expect(JSON.stringify(json)).not.toContain('rows');
    expect(JSON.stringify(json)).not.toContain('fileName');
    expect(JSON.stringify(json)).not.toContain('originalFile');
  });

  it('필터 조회 조건을 Prisma where에 반영한다', async () => {
    await GET(
      request(
        'http://localhost/api/akman/header-mapping-audit?status=UNMAPPED&method=UNMAPPED&sampleValueType=CODE&adminStatus=PENDING&originalHeader=%EB%AF%B8%EB%A7%A4%ED%95%91&baseHeader=%EB%B0%9B%EB%8A%94&source=excel',
      ),
    );

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: { contains: 'excel', mode: 'insensitive' },
          entries: {
            some: expect.objectContaining({
              status: 'UNMAPPED',
              method: 'UNMAPPED',
              sampleValueType: 'CODE',
              adminStatus: 'PENDING',
              originalHeader: { contains: '미매핑', mode: 'insensitive' },
              baseHeader: { contains: '받는', mode: 'insensitive' },
            }),
          },
        }),
        include: {
          entries: expect.objectContaining({
            where: expect.objectContaining({
              status: 'UNMAPPED',
              method: 'UNMAPPED',
            }),
            take: 20,
          }),
        },
      }),
    );
  });

  it('같은 alias와 같은 baseHeader면 REGISTERED_SAME을 반환한다', async () => {
    mocks.findHeaderAliases.mockResolvedValue([{ alias: '이미등록', baseHeader: '상품명' }]);

    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();
    const entry = json.data[0].entries.find((item: { originalHeader: string }) => item.originalHeader === '이미등록');

    expect(entry.aliasStatus).toBe('REGISTERED_SAME');
    expect(entry.existingAliasBaseHeader).toBe('상품명');
  });

  it('effectiveBaseHeader는 adminSelectedBaseHeader를 우선한다', async () => {
    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();
    const entry = json.data[0].entries.find((item: { originalHeader: string }) => item.originalHeader === '관리자선택');

    expect(entry.baseHeader).toBe('받는사람');
    expect(entry.adminSelectedBaseHeader).toBe('상품명');
    expect(entry.adminSelectedAt).toBe('2026-06-19T00:10:00.000Z');
    expect(entry.effectiveBaseHeader).toBe('상품명');
  });

  it('adminSelectedBaseHeader가 없으면 effectiveBaseHeader는 baseHeader를 사용한다', async () => {
    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();
    const entry = json.data[0].entries.find((item: { originalHeader: string }) => item.originalHeader === '수취인');

    expect(entry.adminSelectedBaseHeader).toBeNull();
    expect(entry.effectiveBaseHeader).toBe('받는사람');
  });

  it('aliasStatus는 effectiveBaseHeader 기준으로 REGISTERED_SAME을 반환한다', async () => {
    mocks.findHeaderAliases.mockResolvedValue([{ alias: '관리자선택', baseHeader: '상품명' }]);

    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();
    const entry = json.data[0].entries.find((item: { originalHeader: string }) => item.originalHeader === '관리자선택');

    expect(entry.baseHeader).toBe('받는사람');
    expect(entry.effectiveBaseHeader).toBe('상품명');
    expect(entry.aliasStatus).toBe('REGISTERED_SAME');
    expect(entry.existingAliasBaseHeader).toBe('상품명');
  });

  it('aliasStatus는 effectiveBaseHeader 기준으로 CONFLICT를 반환한다', async () => {
    mocks.findHeaderAliases.mockResolvedValue([{ alias: '관리자충돌', baseHeader: '상품명' }]);

    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();
    const entry = json.data[0].entries.find((item: { originalHeader: string }) => item.originalHeader === '관리자충돌');

    expect(entry.baseHeader).toBe('상품명');
    expect(entry.effectiveBaseHeader).toBe('받는사람');
    expect(entry.aliasStatus).toBe('CONFLICT');
    expect(entry.existingAliasBaseHeader).toBe('상품명');
  });

  it('같은 alias와 다른 baseHeader면 CONFLICT를 반환한다', async () => {
    mocks.findHeaderAliases.mockResolvedValue([{ alias: '충돌헤더', baseHeader: '받는사람' }]);

    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();
    const entry = json.data[0].entries.find((item: { originalHeader: string }) => item.originalHeader === '충돌헤더');

    expect(entry.aliasStatus).toBe('CONFLICT');
    expect(entry.existingAliasBaseHeader).toBe('받는사람');
  });

  it('method가 DB_ALIAS면 DB_ALIAS_SOURCE를 반환한다', async () => {
    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();
    const entry = json.data[0].entries.find((item: { originalHeader: string }) => item.originalHeader === 'DB별칭헤더');

    expect(entry.aliasStatus).toBe('DB_ALIAS_SOURCE');
    expect(entry.existingAliasBaseHeader).toBe('받는사람');
  });

  it('originalHeader 또는 baseHeader가 부족하면 NOT_ELIGIBLE을 반환한다', async () => {
    const res = await GET(request('http://localhost/api/akman/header-mapping-audit'));
    const json = await res.json();
    const entry = json.data[0].entries.find((item: { originalHeader: string }) => item.originalHeader === '미매핑헤더');

    expect(entry.aliasStatus).toBe('NOT_ELIGIBLE');
    expect(entry.existingAliasBaseHeader).toBeNull();
  });

  it('페이지네이션을 적용한다', async () => {
    await GET(request('http://localhost/api/akman/header-mapping-audit?page=3&pageSize=10&entryLimit=5'));

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        include: {
          entries: expect.objectContaining({
            take: 5,
          }),
        },
      }),
    );
  });

  it('만료 로그는 기본 조회에서 제외한다', async () => {
    await GET(request('http://localhost/api/akman/header-mapping-audit'));

    expect(mocks.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });
});

describe('DELETE /api/akman/header-mapping-audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.deleteLog.mockResolvedValue(activeLog);
  });

  it('관리자가 아니면 삭제할 수 없다', async () => {
    mocks.isAdminEmail.mockReturnValue(false);

    const res = await DELETE(
      new Request('http://localhost/api/akman/header-mapping-audit', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'log-1' }),
      }) as never,
    );

    expect(res.status).toBe(403);
    expect(mocks.deleteLog).not.toHaveBeenCalled();
  });

  it('로그 묶음을 삭제한다', async () => {
    const res = await DELETE(
      new Request('http://localhost/api/akman/header-mapping-audit', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'log-1' }),
      }) as never,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocks.deleteLog).toHaveBeenCalledWith({ where: { id: 'log-1' } });
  });

  it('삭제할 로그 ID가 없으면 400을 반환한다', async () => {
    const res = await DELETE(
      new Request('http://localhost/api/akman/header-mapping-audit', {
        method: 'DELETE',
        body: JSON.stringify({ id: '' }),
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(mocks.deleteLog).not.toHaveBeenCalled();
  });
});
