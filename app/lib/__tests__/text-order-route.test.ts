import { describe, it, expect } from 'vitest';
import { classifyNormalize29PromptRoute } from '../normalize-29/text-order-route';

describe('classifyNormalize29PromptRoute', () => {
  it('단순 한 줄·탭 주문은 core', () => {
    expect(
      classifyNormalize29PromptRoute(
        '프리미엄 멜론 세트\t서울시 구로구 고척로 53길 23 302호\t010-5050-6060\t김성훈',
      ),
    ).toBe('core');
    expect(
      classifyNormalize29PromptRoute('김영수 010-2222-3333 서울 강남구 테헤란로 123 2층 사과'),
    ).toBe('core');
  });

  it('쇼핑몰·주문번호 키워드는 full', () => {
    expect(
      classifyNormalize29PromptRoute(
        '상품주문번호 12345 받는분 홍길동 010-1234-5678 서울시 강남구',
      ),
    ).toBe('full');
    expect(classifyNormalize29PromptRoute('쿠팡 주문\n결제금액 15000\n받는분 김철수')).toBe('full');
  });

  it('전화 6건·자유 형식 붙여넣기는 full', () => {
    const lines = Array.from(
      { length: 6 },
      (_, i) => `홍길동${i} 010-1000-${1000 + i} 서울시 강남구 테헤란로 ${i}`,
    );
    expect(classifyNormalize29PromptRoute(lines.join('\n'))).toBe('full');
  });

  it('17건 탭 목록(일반 텍스트 주문)은 core', () => {
    const line =
      'ljw890917@naver.com\t이재원\t010-4255-5556\t39629\t경북 김천시 부곡중앙1길 79 108동 504호';
    expect(classifyNormalize29PromptRoute(line)).toBe('core');
    expect(classifyNormalize29PromptRoute(Array.from({ length: 17 }, () => line).join('\n'))).toBe(
      'core',
    );
  });
});
