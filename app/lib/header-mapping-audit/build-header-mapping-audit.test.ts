import { describe, expect, it } from 'vitest';

import type { HeaderMappingDetail } from '@/app/pipeline/template/map-template-to-base';

import { buildHeaderMappingAuditEntries } from './build-header-mapping-audit';

const headers = [
  '받는사람',
  '받는사람전화',
  '받는사람주소',
  '배송메시지',
  '판매가',
  '취소일',
  '주문상태',
  '미매핑헤더',
] as const;

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
    originalHeader: '받는사람주소',
    baseHeader: '받는사람주소1',
    status: 'AUTO_MATCHED',
    method: 'STATIC_ALIAS',
    confidenceReason: '정적 별칭',
  },
  {
    originalHeader: '배송메시지',
    baseHeader: '배송메시지',
    status: 'AUTO_MATCHED',
    method: 'BASE_HEADER',
    confidenceReason: '직접 일치',
  },
  {
    originalHeader: '판매가',
    baseHeader: '옵션판매가',
    status: 'LOW_CONFIDENCE',
    method: 'AI',
    confidenceReason: 'AI 매핑',
  },
  {
    originalHeader: '취소일',
    baseHeader: null,
    status: 'NEEDS_REVIEW',
    method: 'UNMAPPED',
    confidenceReason: '신규 기준헤더 후보',
  },
  {
    originalHeader: '주문상태',
    baseHeader: '주문상태',
    status: 'AUTO_MATCHED',
    method: 'BASE_HEADER',
    confidenceReason: '직접 일치',
  },
  {
    originalHeader: '미매핑헤더',
    baseHeader: null,
    status: 'UNMAPPED',
    method: 'UNMAPPED',
    confidenceReason: '매핑 실패',
  },
];

const rows = [
  ['홍길동', '010-1234-5678', '서울특별시 강남구 테헤란로 1', '문앞에 놓아주세요', '12,300원', '2026-06-19', '배송완료', 'ABC-12345'],
  ['홍길동', '010-1234-5678', '서울특별시 강남구 테헤란로 1', '문앞에 놓아주세요', '12,300원', '2026-06-19', '배송완료', 'ABC-12345'],
  ['김영희', '010-9999-0000', '경기도 성남시 분당구 판교역로 2', '경비실 보관', '22,000원', '2026-06-20', '취소완료', 'XYZ-98765'],
  ['', '', '', '', '', '', '', ''],
  ['박철수', '0212345678', '부산광역시 해운대구 센텀로 3', '부재시 연락', '33,000원', '2026-06-21', '배송중', 'LMN-55555'],
  ['최민수', '010-1111-2222', '대구광역시 수성구 달구벌대로 4', '파손주의', '44,000원', '2026-06-22', '주문완료', 'QWE-22222'],
] as unknown[][];

function entryOf(header: string) {
  const entries = buildHeaderMappingAuditEntries([...headers], rows, mappingDetails, {
    maxSamplesPerHeader: 3,
  });
  const entry = entries.find((item) => item.originalHeader === header);
  if (!entry) throw new Error(`entry not found: ${header}`);
  return entry;
}

describe('buildHeaderMappingAuditEntries', () => {
  it('성공 매핑 헤더도 audit entry에 포함한다', () => {
    expect(entryOf('판매가')).toEqual(
      expect.objectContaining({
        originalHeader: '판매가',
        baseHeader: '옵션판매가',
        status: 'LOW_CONFIDENCE',
        method: 'AI',
      }),
    );
  });

  it('미매핑 헤더도 audit entry에 포함한다', () => {
    expect(entryOf('미매핑헤더')).toEqual(
      expect.objectContaining({
        baseHeader: null,
        status: 'UNMAPPED',
        method: 'UNMAPPED',
      }),
    );
  });

  it('전화번호가 마스킹된다', () => {
    const entry = entryOf('받는사람전화');

    expect(entry.sampleValueType).toBe('PHONE');
    expect(entry.maskedSamples).toContain('010-****-5678');
    expect(entry.maskedSamples.join(' ')).not.toContain('1234');
  });

  it('주소가 마스킹된다', () => {
    const entry = entryOf('받는사람주소');

    expect(entry.sampleValueType).toBe('ADDRESS');
    expect(entry.maskedSamples[0]).toBe('서울특별시 강남구 [주소]');
    expect(entry.maskedSamples.join(' ')).not.toContain('테헤란로');
  });

  it('배송메시지는 원문 저장되지 않는다', () => {
    const entry = entryOf('배송메시지');

    expect(entry.sampleValueType).toBe('MESSAGE');
    expect(entry.maskedSamples).toEqual(['[배송메시지]']);
  });

  it('이름은 원문 저장되지 않는다', () => {
    const entry = entryOf('받는사람');

    expect(entry.sampleValueType).toBe('NAME');
    expect(entry.maskedSamples).toEqual(['[이름]']);
  });

  it('금액, 날짜, 상태값은 검토 가능한 형태로 유지된다', () => {
    expect(entryOf('판매가')).toEqual(
      expect.objectContaining({
        sampleValueType: 'MONEY',
        maskedSamples: ['12,300원', '22,000원', '33,000원'],
      }),
    );
    expect(entryOf('취소일')).toEqual(
      expect.objectContaining({
        sampleValueType: 'DATE',
        maskedSamples: ['2026-06-19', '2026-06-20', '2026-06-21'],
      }),
    );
    expect(entryOf('주문상태')).toEqual(
      expect.objectContaining({
        sampleValueType: 'STATUS',
        maskedSamples: ['배송완료', '취소완료', '배송중'],
      }),
    );
  });

  it('빈 값과 중복 값은 제외된다', () => {
    const entry = entryOf('미매핑헤더');

    expect(entry.sampleCount).toBe(3);
    expect(new Set(entry.maskedSamples).size).toBe(entry.maskedSamples.length);
    expect(entry.maskedSamples).not.toContain('');
  });

  it('최대 샘플 개수가 제한된다', () => {
    expect(entryOf('판매가').sampleCount).toBe(3);
    expect(entryOf('판매가').maskedSamples).toHaveLength(3);
  });
});
