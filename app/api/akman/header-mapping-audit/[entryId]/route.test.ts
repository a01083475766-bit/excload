import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
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
    headerMappingAuditEntry: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

import { PATCH } from './route';

const activeExisting = {
  id: 'entry-1',
  baseHeader: '받는사람',
  auditLog: {
    expiresAt: new Date('2999-01-01T00:00:00.000Z'),
  },
};

const updatedEntry = {
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
  adminStatus: 'CONFIRMED',
  adminSelectedBaseHeader: null,
  adminSelectedAt: null,
  adminMemo: '확인 완료',
  reviewedAt: new Date('2026-06-19T01:00:00.000Z'),
  createdAt: new Date('2026-06-19T00:00:00.000Z'),
};

function request(body: unknown) {
  return new Request('http://localhost/api/akman/header-mapping-audit/entry-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as never;
}

function params(entryId = 'entry-1') {
  return { params: Promise.resolve({ entryId }) };
}

describe('PATCH /api/akman/header-mapping-audit/[entryId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
    mocks.findUnique.mockResolvedValue(activeExisting);
    mocks.update.mockResolvedValue(updatedEntry);
  });

  it('관리자가 아니면 접근할 수 없다', async () => {
    mocks.isAdminEmail.mockReturnValue(false);

    const res = await PATCH(request({ adminStatus: 'CONFIRMED' }), params());

    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(['CONFIRMED', 'IGNORED', 'HOLD'] as const)('%s 상태로 변경 가능하다', async (adminStatus) => {
    mocks.update.mockResolvedValue({ ...updatedEntry, adminStatus });

    const res = await PATCH(request({ adminStatus }), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.entry.adminStatus).toBe(adminStatus);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          adminStatus,
          reviewedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('adminMemo를 저장할 수 있다', async () => {
    await PATCH(request({ adminStatus: 'CONFIRMED', adminMemo: '검토 메모' }), params());

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminMemo: '검토 메모',
        }),
      }),
    );
  });

  it('유효한 adminSelectedBaseHeader를 저장할 수 있다', async () => {
    mocks.update.mockResolvedValue({
      ...updatedEntry,
      adminStatus: 'CHANGED',
      adminSelectedBaseHeader: '상품명',
      adminSelectedAt: new Date('2026-06-19T01:10:00.000Z'),
    });

    const res = await PATCH(request({ adminSelectedBaseHeader: '상품명', adminMemo: '관리자 선택' }), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.entry.adminSelectedBaseHeader).toBe('상품명');
    expect(json.entry.adminSelectedAt).toBe('2026-06-19T01:10:00.000Z');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminStatus: 'CHANGED',
          adminSelectedBaseHeader: '상품명',
          adminSelectedAt: expect.any(Date),
          adminMemo: '관리자 선택',
          reviewedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('adminSelectedBaseHeader가 BASE_HEADERS에 없으면 400을 반환한다', async () => {
    const res = await PATCH(request({ adminSelectedBaseHeader: '없는기준헤더' }), params());

    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('adminSelectedBaseHeader가 baseHeader와 같으면 CONFIRMED로 저장한다', async () => {
    await PATCH(request({ adminSelectedBaseHeader: '받는사람' }), params());

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminStatus: 'CONFIRMED',
          adminSelectedBaseHeader: '받는사람',
        }),
      }),
    );
  });

  it('adminSelectedBaseHeader가 baseHeader와 다르면 CHANGED로 저장한다', async () => {
    await PATCH(request({ adminSelectedBaseHeader: '상품명' }), params());

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminStatus: 'CHANGED',
          adminSelectedBaseHeader: '상품명',
        }),
      }),
    );
  });

  it('baseHeader가 null인 entry도 adminSelectedBaseHeader가 있으면 CHANGED로 저장한다', async () => {
    mocks.findUnique.mockResolvedValue({
      ...activeExisting,
      baseHeader: null,
    });

    await PATCH(request({ adminSelectedBaseHeader: '상품명' }), params());

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminStatus: 'CHANGED',
          adminSelectedBaseHeader: '상품명',
        }),
      }),
    );
  });

  it('기존 baseHeader는 덮어쓰지 않는다', async () => {
    await PATCH(request({ adminSelectedBaseHeader: '상품명' }), params());

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data.baseHeader).toBeUndefined();
  });

  it('reviewedAt을 현재 시간으로 저장한다', async () => {
    await PATCH(request({ adminStatus: 'CONFIRMED' }), params());

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data.reviewedAt).toBeInstanceOf(Date);
  });

  it('잘못된 adminStatus는 400을 반환한다', async () => {
    const res = await PATCH(request({ adminStatus: 'INVALID' }), params());

    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('CHANGED를 adminSelectedBaseHeader 없이 직접 요청하면 400을 반환한다', async () => {
    const res = await PATCH(request({ adminStatus: 'CHANGED' }), params());

    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('없는 entryId는 404를 반환한다', async () => {
    mocks.findUnique.mockResolvedValue(null);

    const res = await PATCH(request({ adminStatus: 'CONFIRMED' }), params('missing-entry'));

    expect(res.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('만료된 로그 entry는 수정할 수 없다', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'entry-1',
      baseHeader: '받는사람',
      auditLog: {
        expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      },
    });

    const res = await PATCH(request({ adminStatus: 'CONFIRMED' }), params());

    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('응답에 원본 rows/file/original sample이 없다', async () => {
    const res = await PATCH(request({ adminStatus: 'CONFIRMED' }), params());
    const json = await res.json();
    const serialized = JSON.stringify(json);

    expect(serialized).not.toContain('rows');
    expect(serialized).not.toContain('fileName');
    expect(serialized).not.toContain('originalFile');
    expect(serialized).not.toContain('originalSample');
    expect(json.entry.maskedSamples).toEqual(['[이름]']);
  });
});
