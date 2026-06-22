import { describe, expect, it } from 'vitest';

import { ALIAS_DICTIONARY } from './alias-dictionary';

describe('보고된 AI 매핑 헤더 별칭', () => {
  it('의미가 분명한 헤더만 기준헤더로 매핑한다', () => {
    expect(ALIAS_DICTIONARY['사은품내역']).toBe('추가상품');
    expect(ALIAS_DICTIONARY['전하는말']).toBe('배송메시지');
    expect(ALIAS_DICTIONARY['고객메시지']).toBe('배송메시지');
    expect(ALIAS_DICTIONARY['인수자']).toBe('받는사람');
    expect(ALIAS_DICTIONARY['수하인']).toBe('받는사람');
    expect(ALIAS_DICTIONARY['인수자 HP']).toBe('받는사람전화1');
    expect(ALIAS_DICTIONARY['수령인휴대전화']).toBe('받는사람전화1');
    expect(ALIAS_DICTIONARY['인수자 주소']).toBe('받는사람주소1');
    expect(ALIAS_DICTIONARY['해외배송지']).toBe('받는사람주소1');
    expect(ALIAS_DICTIONARY['받는곳']).toBe('받는사람주소1');
    expect(ALIAS_DICTIONARY['배송지']).toBe('받는사람주소1');
    expect(ALIAS_DICTIONARY['주문자휴대전화']).toBe('주문자연락처');
    expect(ALIAS_DICTIONARY['출고수량']).toBe('수량');
    expect(ALIAS_DICTIONARY['희망배송메시지']).toBe('배송메시지');
    expect(ALIAS_DICTIONARY['출고요청번호']).toBe('출고번호');
    expect(ALIAS_DICTIONARY['설치상품']).toBe('상품명');
    expect(ALIAS_DICTIONARY['속성명']).toBe('상품옵션');
    expect(ALIAS_DICTIONARY['합포장번호']).toBe('묶음배송번호');
    expect(ALIAS_DICTIONARY['출고확정일']).toBe('출고발송일');
    expect(ALIAS_DICTIONARY['취소']).toBe('주문상태');
    expect(ALIAS_DICTIONARY['진행단계']).toBe('주문상태');
    expect(ALIAS_DICTIONARY['통관용수취인전화번호']).toBe('통관용구매자전화번호');
  });

  it('충돌하거나 기준헤더 의미와 어긋나는 헤더는 매핑하지 않는다', () => {
    expect(ALIAS_DICTIONARY['배송형태']).toBeUndefined();
    expect(ALIAS_DICTIONARY['사은품기간']).toBeUndefined();
    expect(ALIAS_DICTIONARY['취소일']).toBeUndefined();
    expect(ALIAS_DICTIONARY['순번']).toBeUndefined();
    expect(ALIAS_DICTIONARY['발행쿠폰번호']).toBeUndefined();
  });
});
