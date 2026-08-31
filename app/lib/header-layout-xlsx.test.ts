import { describe, expect, it } from 'vitest';
import {
  buildDummySampleCellFromHeader,
  buildHeaderLayoutDownloadFileName,
  buildHeaderLayoutSheetRows,
  parseLayoutHeadersFromLog,
} from '@/app/lib/header-layout-xlsx';
import {
  buildOrderFileHeaderLogPayload,
  buildTemplateHeaderLogPayload,
  countNonEmptyLayoutHeaders,
  sanitizeHeaderArray,
  sanitizeHeaderArrayForLayout,
} from '@/app/lib/template-header-log';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';

describe('sanitizeHeaderArrayForLayout', () => {
  it('열 순서와 중복 헤더명을 유지한다', () => {
    expect(sanitizeHeaderArrayForLayout(['상품명', '수량', '상품명', ' 수량 '])).toEqual([
      '상품명',
      '수량',
      '상품명',
      '수량',
    ]);
  });

  it('빈 헤더 열 위치를 유지한다', () => {
    expect(sanitizeHeaderArrayForLayout(['주문번호', '', '수취인'])).toEqual([
      '주문번호',
      '',
      '수취인',
    ]);
  });
});

describe('sanitizeHeaderArray (stats)', () => {
  it('빈 헤더 열은 제거하지만 중복 헤더명은 유지한다', () => {
    expect(sanitizeHeaderArray(['상품명', '', '상품명', '수량'])).toEqual([
      '상품명',
      '상품명',
      '수량',
    ]);
  });
});

describe('buildHeaderLayoutSheetRows', () => {
  it('헤더 1행과 더미 1행을 생성한다', () => {
    const rows = buildHeaderLayoutSheetRows(['주문번호', '휴대폰', '상품명']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['주문번호', '휴대폰', '상품명']);
    expect(rows[1][0]).toBe('ORD-****');
    expect(rows[1][1]).toBe('010-****-1234');
    expect(rows[1][2]).toBe('[상품정보]');
  });

  it('includeDummyRow=false면 헤더 1행만 생성한다', () => {
    expect(buildHeaderLayoutSheetRows(['A', 'B'], { includeDummyRow: false })).toEqual([['A', 'B']]);
  });
});

describe('buildHeaderLayoutDownloadFileName', () => {
  it('개인정보 없이 날짜·구분·택배사를 파일명에 넣는다', () => {
    expect(
      buildHeaderLayoutDownloadFileName({
        createdAt: '2026-08-31T12:00:00.000Z',
        source: 'template_upload',
        courierName: '로젠택배',
      }),
    ).toBe('20260831_로젠택배_택배양식_headers.xlsx');
  });

  it('주문파일은 주문파일 라벨을 사용한다', () => {
    expect(
      buildHeaderLayoutDownloadFileName({
        createdAt: '2026-08-31T15:00:00+09:00',
        source: 'order_upload',
      }),
    ).toBe('20260831_주문파일_headers.xlsx');
  });
});

describe('buildDummySampleCellFromHeader', () => {
  it('헤더명 기반 더미만 반환하고 실제 PII는 넣지 않는다', () => {
    expect(buildDummySampleCellFromHeader('수취인명')).toBe('[이름]');
    expect(buildDummySampleCellFromHeader('')).toBe('');
  });
});

describe('header log payload layout vs stats', () => {
  it('order_upload payload는 layout headers를 보존하고 headerCount는 비어있지 않은 헤더 수다', () => {
    const payload = buildOrderFileHeaderLogPayload(
      ['상품명', '수량', '상품명'],
      {
        mappedBaseHeaders: ['상품', '수량', '상품'],
        unknownHeaders: [],
      },
      { page: 'order-convert' },
    );

    expect(payload.headers).toEqual(['상품명', '수량', '상품명']);
    expect(payload.headerCount).toBe(countNonEmptyLayoutHeaders(payload.headers));
    expect(payload.headerCount).toBe(3);
  });

  it('template_upload payload도 layout headers 순서를 유지한다', () => {
    const bridge: TemplateBridgeFile = {
      baseHeaders: [],
      courierHeaders: ['받는분', '받는분', '전화'],
      mappedBaseHeaders: ['이름', '이름', '전화번호1'],
      unknownHeaders: [],
    };

    const payload = buildTemplateHeaderLogPayload(bridge, { page: 'order-convert' });
    expect(payload.headers).toEqual(['받는분', '받는분', '전화']);
    expect(payload.mappedHeaders).toHaveLength(3);
  });
});
