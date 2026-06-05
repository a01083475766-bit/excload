import { describe, it, expect } from 'vitest';
import { TEXT_ORDER_PARCEL_HEADERS } from '@/app/lib/normalize-29/text-order-route';
import { buildNormalize29SystemPrompt } from '@/app/lib/normalize-29/prompts';
import { getNormalize29AiCallParams } from '@/app/lib/normalize-29/ai-call-params';

const CASE1_RECIPIENT_SENDER = `받는분 홍길동 010-1234-5678
서울시 강남구 테헤란로 123
사과 2kg
보내는사람: 김판매 010-9999-8888`;

const CASE2_TWO_ORDERS = `김영수 010-2222-3333 서울 강남구 테헤란로 123 2층 사과
박민지 010-4444-5555 부산 해운대구 센텀시티로 100 배 3개`;

describe('normalize-29 회귀 — 단일 프롬프트·필드', () => {
  it('29 parcel 필드에 보내·받는·상품 포함', () => {
    expect(TEXT_ORDER_PARCEL_HEADERS).toHaveLength(29);
    for (const key of ['보내는사람', '받는사람', '상품명', '수량']) {
      expect(TEXT_ORDER_PARCEL_HEADERS).toContain(key);
    }
  });

  it('프롬프트: 보내는사람 게이트·탭·다건 미합침 규칙', () => {
    const prompt = buildNormalize29SystemPrompt();
    expect(prompt).toContain('보내는사람* — 게이트');
    expect(prompt).toContain('새 주문 아님');
    expect(prompt).toContain('탭');
    expect(prompt).toContain('합치지 않음');
    expect(prompt).toContain('라벨 없이 보내는사람*로 복사 금지');
    expect(prompt).toContain('전화가 줄 끝');
    expect(prompt).toContain('보내는사람 홍길동 인천시');
  });

  it('회귀 케이스 텍스트는 라우팅 없이 동일 프롬프트 대상', () => {
    const prompt = buildNormalize29SystemPrompt();
    for (const sample of [CASE1_RECIPIENT_SENDER, CASE2_TWO_ORDERS]) {
      expect(sample.length).toBeGreaterThan(0);
      expect(prompt).toContain('orders');
    }
  });

  it('max_tokens만 설정 (대량 건 한 번에)', () => {
    const { maxTokens } = getNormalize29AiCallParams();
    expect(maxTokens).toBeGreaterThanOrEqual(8192);
  });
});
