import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getHeaderAliasDictionaryMock: vi.fn(),
  findFirstMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock('@/app/lib/header-alias-cache', () => ({
  getHeaderAliasDictionary: mocks.getHeaderAliasDictionaryMock,
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    aiHeaderMappingLog: {
      findFirst: mocks.findFirstMock,
      create: mocks.createMock,
    },
  },
}));

import { mapTemplateToBase } from './map-template-to-base';

describe('mapTemplateToBase mappingDetails', () => {
  beforeEach(() => {
    mocks.getHeaderAliasDictionaryMock.mockResolvedValue({
      DB별칭헤더: '받는사람전화1',
    });
    mocks.findFirstMock.mockResolvedValue(null);
    mocks.createMock.mockResolvedValue({});
  });

  it('원본 헤더별 매핑 방식과 상태를 반환한다', async () => {
    const result = await mapTemplateToBase(
      ['주문번호', 'DB별칭헤더', '인수자', 'AI헤더', '미상헤더'],
      async () => ({ AI헤더: '상품명' }),
      'mapping-detail-test',
    );

    expect(result.mappedBaseHeaders).toEqual([
      '주문번호',
      '받는사람전화1',
      '받는사람',
      '상품명',
      null,
    ]);
    expect(result.mappingDetails).toEqual([
      expect.objectContaining({
        originalHeader: '주문번호',
        baseHeader: '주문번호',
        status: 'AUTO_MATCHED',
        method: 'BASE_HEADER',
      }),
      expect.objectContaining({
        originalHeader: 'DB별칭헤더',
        baseHeader: '받는사람전화1',
        status: 'AUTO_MATCHED',
        method: 'DB_ALIAS',
      }),
      expect.objectContaining({
        originalHeader: '인수자',
        baseHeader: '받는사람',
        status: 'AUTO_MATCHED',
        method: 'STATIC_ALIAS',
      }),
      expect.objectContaining({
        originalHeader: 'AI헤더',
        baseHeader: '상품명',
        status: 'LOW_CONFIDENCE',
        method: 'AI',
      }),
      expect.objectContaining({
        originalHeader: '미상헤더',
        baseHeader: null,
        status: 'UNMAPPED',
        method: 'UNMAPPED',
      }),
    ]);
  });

  it('후처리 보정으로 변경된 헤더는 REFINED/NEEDS_REVIEW로 표시한다', async () => {
    const result = await mapTemplateToBase(
      ['받는사람', '수령자'],
      async () => ({}),
      'mapping-refine-test',
    );

    expect(result.mappedBaseHeaders).toEqual(['받는사람', null]);
    expect(result.mappingDetails?.[1]).toEqual(
      expect.objectContaining({
        originalHeader: '수령자',
        baseHeader: null,
        status: 'NEEDS_REVIEW',
        method: 'REFINED',
      }),
    );
  });
});
