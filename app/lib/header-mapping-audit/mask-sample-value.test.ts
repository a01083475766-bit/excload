import { describe, expect, it } from 'vitest';

import { inferSampleValueType } from './infer-sample-value-type';
import { maskSampleValue } from './mask-sample-value';

describe('header mapping audit sample masking', () => {
  it('전화번호는 가운데 번호를 마스킹한다', () => {
    expect(maskSampleValue('010-1234-5678').value).toBe('010-****-5678');
    expect(maskSampleValue('0212345678', { header: '받는사람전화1' }).value).toBe('02-****-5678');
  });

  it('주소는 시/도와 시/군/구 정도만 남긴다', () => {
    const masked = maskSampleValue('서울특별시 강남구 테헤란로 123 101동 202호');

    expect(masked).toEqual(
      expect.objectContaining({
        value: '서울특별시 강남구 [주소]',
        type: 'ADDRESS',
        masked: true,
        shouldStore: true,
      }),
    );
  });

  it('이름은 원문을 저장하지 않는다', () => {
    expect(maskSampleValue('홍길동', { header: '받는사람' })).toEqual(
      expect.objectContaining({
        value: '[이름]',
        type: 'NAME',
        masked: true,
      }),
    );
  });

  it('배송메시지는 원문을 저장하지 않는다', () => {
    expect(maskSampleValue('부재시 문앞에 놓아주세요', { header: '배송메시지' })).toEqual(
      expect.objectContaining({
        value: '[배송메시지]',
        type: 'MESSAGE',
        masked: true,
      }),
    );
  });

  it('금액, 날짜, 상태값은 유지한다', () => {
    expect(maskSampleValue('12,300원', { header: '판매가' })).toEqual(
      expect.objectContaining({ value: '12,300원', type: 'MONEY', masked: false }),
    );
    expect(maskSampleValue('2026-06-19', { header: '취소일' })).toEqual(
      expect.objectContaining({ value: '2026-06-19', type: 'DATE', masked: false }),
    );
    expect(maskSampleValue('배송완료', { header: '주문상태' })).toEqual(
      expect.objectContaining({ value: '배송완료', type: 'STATUS', masked: false }),
    );
  });

  it('코드성 값은 일부만 남기고 중간을 마스킹한다', () => {
    const masked = maskSampleValue('CPN-2026-ABCDEF', { header: '쿠폰번호' });

    expect(masked.type).toBe('CODE');
    expect(masked.masked).toBe(true);
    expect(masked.value).toMatch(/^CPN\*+DEF$/);
  });

  it('빈 값은 저장 대상에서 제외한다', () => {
    expect(maskSampleValue('   ')).toEqual({
      value: '',
      type: 'EMPTY',
      masked: false,
      shouldStore: false,
    });
  });

  it('값과 헤더를 기준으로 타입을 추정한다', () => {
    expect(inferSampleValueType('01012345678')).toBe('PHONE');
    expect(inferSampleValueType('경기도 성남시 분당구 판교역로 1')).toBe('ADDRESS');
    expect(inferSampleValueType('취소완료')).toBe('STATUS');
    expect(inferSampleValueType('ABC-12345')).toBe('CODE');
    expect(inferSampleValueType('', { header: '주문번호' })).toBe('EMPTY');
  });
});
