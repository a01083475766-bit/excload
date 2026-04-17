import { describe, expect, it } from 'vitest';
import { sanitizeDeliveryMessage } from '../sanitize-delivery-message';

describe('sanitizeDeliveryMessage', () => {
  it('앱 메타 토큰을 제거한다', () => {
    expect(sanitizeDeliveryMessage('문 앞 전달 / 안드로이드앱')).toBe('문 앞 전달');
  });

  it('배송방식 나열 메타를 제거한다', () => {
    expect(sanitizeDeliveryMessage('택배, 등기, 소포 일반 배송')).toBe('');
  });

  it('숫자 코드 단독 토큰을 제거한다', () => {
    expect(sanitizeDeliveryMessage('101906 / 문 앞에 놓아주세요')).toBe(
      '문 앞에 놓아주세요',
    );
  });

  it('모호한 문장은 유지한다', () => {
    expect(sanitizeDeliveryMessage('부재 시 문앞에 두고 문자 부탁드려요')).toBe(
      '부재 시 문앞에 두고 문자 부탁드려요',
    );
  });
});

