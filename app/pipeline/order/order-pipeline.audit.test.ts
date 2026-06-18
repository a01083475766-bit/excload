import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HeaderMappingDetail, MappingResult } from '../template/map-template-to-base';

const mocks = vi.hoisted(() => ({
  saveHeaderMappingAuditLog: vi.fn(),
}));

vi.mock('@/app/lib/header-mapping-audit/save-header-mapping-audit', () => ({
  buildHeaderMappingAuditSummary: (
    entries: Array<{ status: string; hasMaskedSamples: boolean }>,
  ) => ({
    totalHeaders: entries.length,
    autoMatchedCount: entries.filter((entry) => entry.status === 'AUTO_MATCHED').length,
    unmappedCount: entries.filter((entry) => entry.status === 'UNMAPPED').length,
    lowConfidenceCount: entries.filter((entry) => entry.status === 'LOW_CONFIDENCE').length,
    needsReviewCount: entries.filter((entry) => entry.status === 'NEEDS_REVIEW').length,
    entriesWithMaskedSamplesCount: entries.filter((entry) => entry.hasMaskedSamples).length,
  }),
  saveHeaderMappingAuditLog: mocks.saveHeaderMappingAuditLog,
}));

import { run } from './order-pipeline';

const headers = ['받는사람', '받는사람전화', '미매핑헤더'];

const mappingDetails: HeaderMappingDetail[] = [
  {
    originalHeader: '받는사람',
    baseHeader: '받는사람',
    status: 'AUTO_MATCHED',
    method: 'BASE_HEADER',
    confidenceReason: '직접 일치',
  },
  {
    originalHeader: '받는사람전화',
    baseHeader: '받는사람전화1',
    status: 'AUTO_MATCHED',
    method: 'STATIC_ALIAS',
    confidenceReason: '정적 별칭',
  },
  {
    originalHeader: '미매핑헤더',
    baseHeader: null,
    status: 'UNMAPPED',
    method: 'UNMAPPED',
    confidenceReason: '매핑 실패',
  },
];

const reuseHeaderMapping: MappingResult = {
  mappedBaseHeaders: ['받는사람', '받는사람전화1', null],
  unknownHeaders: ['미매핑헤더'],
  mappingDetails,
};

describe('order-pipeline header mapping audit connection', () => {
  const originalAuditEnabled = process.env.HEADER_MAPPING_AUDIT_ENABLED;

  beforeEach(() => {
    delete process.env.HEADER_MAPPING_AUDIT_ENABLED;
    mocks.saveHeaderMappingAuditLog.mockResolvedValue({
      ok: true,
      id: 'audit-log-id',
      entryCount: 3,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    if (originalAuditEnabled == null) {
      delete process.env.HEADER_MAPPING_AUDIT_ENABLED;
    } else {
      process.env.HEADER_MAPPING_AUDIT_ENABLED = originalAuditEnabled;
    }
  });

  it('HEADER_MAPPING_AUDIT_ENABLED가 미설정이면 저장 함수를 호출하지 않는다', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await run(
      {
        headers,
        rows: [
          ['테스트이름A', '010-1234-5678', 'ABC-12345'],
          ['테스트이름B', '010-9999-0000', 'XYZ-98765'],
        ],
        sourceType: 'excel',
      },
      'audit-connection-test',
      { reuseHeaderMapping },
    );

    expect(result.rows[0]?.받는사람).toBe('테스트이름A');
    expect(result.rows[0]?.받는사람전화1).toBe('010-1234-5678');
    expect(result.unknownHeaders).toEqual(['미매핑헤더']);
    expect(Object.prototype.hasOwnProperty.call(result, 'headerMappingAudit')).toBe(false);
    expect(result._reuseHeaderMapping).toBeUndefined();
    expect(mocks.saveHeaderMappingAuditLog).not.toHaveBeenCalled();

    expect(infoSpy).toHaveBeenCalledWith(
      '[Stage2] Header Mapping Audit Summary:',
      {
        totalHeaders: 3,
        autoMatchedCount: 2,
        unmappedCount: 1,
        lowConfidenceCount: 0,
        needsReviewCount: 0,
        entriesWithMaskedSamplesCount: 3,
      },
    );
  });

  it('HEADER_MAPPING_AUDIT_ENABLED가 false이면 저장 함수를 호출하지 않는다', async () => {
    process.env.HEADER_MAPPING_AUDIT_ENABLED = 'false';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await run(
      {
        headers,
        rows: [['테스트이름A', '010-1234-5678', 'ABC-12345']],
        sourceType: 'excel',
      },
      'audit-disabled-test',
      { reuseHeaderMapping },
    );

    expect(mocks.saveHeaderMappingAuditLog).not.toHaveBeenCalled();
  });

  it('HEADER_MAPPING_AUDIT_ENABLED가 true이면 저장 함수를 호출한다', async () => {
    process.env.HEADER_MAPPING_AUDIT_ENABLED = 'true';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await run(
      {
        headers,
        rows: [['테스트이름A', '010-1234-5678', 'ABC-12345']],
        sourceType: 'excel',
      },
      'audit-enabled-test',
      { reuseHeaderMapping },
    );

    expect(mocks.saveHeaderMappingAuditLog).toHaveBeenCalledTimes(1);
    expect(mocks.saveHeaderMappingAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ originalHeader: '받는사람' }),
          expect.objectContaining({ originalHeader: '받는사람전화' }),
          expect.objectContaining({ originalHeader: '미매핑헤더' }),
        ]),
        summary: {
          totalHeaders: 3,
          autoMatchedCount: 2,
          unmappedCount: 1,
          lowConfidenceCount: 0,
          needsReviewCount: 0,
          entriesWithMaskedSamplesCount: 3,
        },
        userId: null,
        fileHash: null,
        source: 'excel',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('maskedSamples');
  });

  it('저장 실패해도 주문 변환은 실패하지 않는다', async () => {
    process.env.HEADER_MAPPING_AUDIT_ENABLED = 'true';
    mocks.saveHeaderMappingAuditLog.mockRejectedValue(new Error('save failed'));
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await run(
      {
        headers,
        rows: [['테스트이름A', '010-1234-5678', 'ABC-12345']],
        sourceType: 'excel',
      },
      'audit-save-failure-test',
      { reuseHeaderMapping },
    );

    expect(result.rows[0]?.받는사람).toBe('테스트이름A');
    expect(result.unknownHeaders).toEqual(['미매핑헤더']);
  });

  it('응답과 저장 입력에 audit payload 원본 rows나 파일 정보가 노출되지 않는다', async () => {
    process.env.HEADER_MAPPING_AUDIT_ENABLED = 'true';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await run(
      {
        headers,
        rows: [['테스트이름A', '010-1234-5678', 'ABC-12345']],
        sourceType: 'excel',
      },
      'audit-no-leak-test',
      { reuseHeaderMapping },
    );

    const saveInput = mocks.saveHeaderMappingAuditLog.mock.calls[0]?.[0] ?? {};
    expect(Object.prototype.hasOwnProperty.call(saveInput, 'rows')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(saveInput, 'fileName')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(saveInput, 'originalFile')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('maskedSamples');
    expect(Object.prototype.hasOwnProperty.call(result, 'headerMappingAudit')).toBe(false);
  });
});
