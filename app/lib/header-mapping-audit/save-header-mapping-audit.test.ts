import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HeaderMappingAuditEntry } from './build-header-mapping-audit';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  buildHeaderMappingAuditSummary,
  saveHeaderMappingAuditLog,
} from './save-header-mapping-audit';

const entries: HeaderMappingAuditEntry[] = [
  {
    originalHeader: '수취인',
    baseHeader: '받는사람',
    status: 'AUTO_MATCHED',
    method: 'STATIC_ALIAS',
    confidenceReason: '정적 별칭',
    sampleValueType: 'NAME',
    maskedSamples: ['[이름]'],
    sampleCount: 1,
    hasMaskedSamples: true,
  },
  {
    originalHeader: '쿠폰번호',
    baseHeader: null,
    status: 'UNMAPPED',
    method: 'UNMAPPED',
    confidenceReason: '매핑 실패',
    sampleValueType: 'CODE',
    maskedSamples: ['CPN*****001'],
    sampleCount: 1,
    hasMaskedSamples: true,
  },
  {
    originalHeader: '검토필요',
    baseHeader: null,
    status: 'NEEDS_REVIEW',
    method: 'REFINED',
    confidenceReason: '후처리 보정',
    sampleValueType: 'EMPTY',
    maskedSamples: [],
    sampleCount: 0,
    hasMaskedSamples: false,
  },
];

function setupSuccessfulTransaction(id = 'audit-log-id') {
  mocks.create.mockResolvedValue({ id });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      headerMappingAuditLog: {
        create: mocks.create,
      },
    }),
  );
}

describe('saveHeaderMappingAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulTransaction();
  });

  it('audit log 1건과 entry 여러 건을 transaction으로 저장한다', async () => {
    const result = await saveHeaderMappingAuditLog({
      entries,
      summary: buildHeaderMappingAuditSummary(entries),
      userId: 'user-id',
      fileHash: 'hash-value',
      source: 'order_upload',
    });

    expect(result).toEqual({ ok: true, id: 'audit-log-id', entryCount: 3 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-id',
          fileHash: 'hash-value',
          source: 'order_upload',
          totalHeaders: 3,
          autoMatchedCount: 1,
          unmappedCount: 1,
          needsReviewCount: 1,
          entries: {
            create: expect.arrayContaining([
              expect.objectContaining({
                originalHeader: '수취인',
                baseHeader: '받는사람',
                status: 'AUTO_MATCHED',
                method: 'STATIC_ALIAS',
                maskedSamples: ['[이름]'],
              }),
              expect.objectContaining({
                originalHeader: '검토필요',
                maskedSamples: [],
                hasMaskedSamples: false,
              }),
            ]),
          },
        }),
        select: { id: true },
      }),
    );
  });

  it('entries가 0건이면 저장하지 않는다', async () => {
    const result = await saveHeaderMappingAuditLog({
      entries: [],
      summary: buildHeaderMappingAuditSummary([]),
    });

    expect(result).toEqual({ ok: false, skipped: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('userId, fileHash, source가 없어도 null로 저장 가능하다', async () => {
    await saveHeaderMappingAuditLog({
      entries,
      summary: buildHeaderMappingAuditSummary(entries),
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          fileHash: null,
          source: null,
        }),
      }),
    );
  });

  it('expiresAt 기본값을 생성한다', async () => {
    await saveHeaderMappingAuditLog({
      entries,
      summary: buildHeaderMappingAuditSummary(entries),
    });

    const createArg = mocks.create.mock.calls[0]?.[0];
    const expiresAt = createArg?.data?.expiresAt;

    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('maskedSamples Json을 저장 데이터에 포함한다', async () => {
    await saveHeaderMappingAuditLog({
      entries,
      summary: buildHeaderMappingAuditSummary(entries),
    });

    const createArg = mocks.create.mock.calls[0]?.[0];
    const createdEntries = createArg?.data?.entries?.create;

    expect(createdEntries[1].maskedSamples).toEqual(['CPN*****001']);
  });

  it('저장 실패를 결과 객체로 반환해 호출자가 파이프라인을 계속 진행할 수 있다', async () => {
    const error = new Error('save failed');
    mocks.transaction.mockRejectedValue(error);

    const result = await saveHeaderMappingAuditLog({
      entries,
      summary: buildHeaderMappingAuditSummary(entries),
    });

    expect(result).toEqual({ ok: false, skipped: false, error });
  });

  it('throwOnError가 true면 저장 실패를 throw한다', async () => {
    const error = new Error('save failed');
    mocks.transaction.mockRejectedValue(error);

    await expect(
      saveHeaderMappingAuditLog({
        entries,
        summary: buildHeaderMappingAuditSummary(entries),
        throwOnError: true,
      }),
    ).rejects.toThrow('save failed');
  });
});
