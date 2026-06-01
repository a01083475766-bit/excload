import { describe, expect, it } from 'vitest';
import type { TemplateBridgeFile } from '../../template/types';
import {
  enrichFixedInputByTemplate,
  mergeDeliveryMessageValue,
  resolveFixedValueForColumn,
} from '../resolve-fixed-input';

describe('enrichFixedInputByTemplate', () => {
  const template: TemplateBridgeFile = {
    baseHeaders: ['배송메시지'],
    courierHeaders: ['배송요청사항', '받는사람'],
    mappedBaseHeaders: ['배송메시지', '받는사람'],
    unknownHeaders: [],
  };

  it('모달(택배 열)에 등록된 고정값만 같은 기준헤더 계열 열에 복제한다', () => {
    const enriched = enrichFixedInputByTemplate(
      { 배송요청사항: '문앞에두세요' },
      template,
    );
    expect(enriched['배송요청사항']).toBe('문앞에두세요');
  });

  it('모달에서 지운 뒤 남은 기준헤더 키만으로는 적용하지 않는다', () => {
    const enriched = enrichFixedInputByTemplate(
      { 배송메시지: '문앞에두세요' },
      template,
    );
    expect(enriched['배송요청사항']).toBeUndefined();
  });
});

describe('mergeDeliveryMessageValue', () => {
  it('주문에 배송방식 메타만 있으면 고정 배송메시지를 적용한다', () => {
    expect(
      mergeDeliveryMessageValue('택배, 등기, 소포 일반 배송', '문앞에두세요'),
    ).toBe('문앞에두세요');
  });

  it('주문에 실제 요청이 있으면 고정값으로 덮지 않는다', () => {
    expect(
      mergeDeliveryMessageValue('배송 전 연락 부탁', '문앞에두세요'),
    ).toBe('배송 전 연락 부탁');
  });

  it('주문이 비어 있으면 고정값을 쓴다', () => {
    expect(mergeDeliveryMessageValue('', '문앞에두세요')).toBe('문앞에두세요');
  });
});

describe('resolveFixedValueForColumn', () => {
  it('택배 헤더 키로만 조회한다', () => {
    expect(
      resolveFixedValueForColumn(
        { 배송요청사항: '문앞', 배송메시지: '무시됨' },
        '배송요청사항',
        '배송메시지',
      ),
    ).toBe('문앞');
  });
});
