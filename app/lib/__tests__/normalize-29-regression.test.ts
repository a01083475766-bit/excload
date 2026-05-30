import { describe, it, expect } from 'vitest';
import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { normalizeNormalize29Order } from '@/app/lib/normalize-29/normalize-order-object';
import {
  classifyNormalize29PromptRoute,
  TEXT_ORDER_SIMPLE_CORE_HEADERS,
} from '@/app/lib/normalize-29/text-order-route';
import {
  buildNormalize29CoreSystemPrompt,
  buildNormalize29FullSystemPrompt,
} from '@/app/lib/normalize-29/prompts';
import { getNormalize29AiCallParams } from '@/app/lib/normalize-29/ai-call-params';

/** 회귀 케이스 1: 수취 + 보내는사람 */
const CASE1_RECIPIENT_SENDER = [
  '김영수 010-2222-3333 서울 강남구 테헤란로 123 2층 사시미 2팩',
  '보내는사람 박대균 010-4508-5766 인천시 미추홀구 인주대로 94번길2 903호',
].join('\n');

/** 회귀 케이스 2: 진짜 2건 */
const CASE2_TWO_ORDERS = [
  '김영수 010-1111-1111 서울 강남구 테헤란로 100 사과 1박스',
  '박민지 010-2222-2222 부산 해운대구 센텀로 200 배 1박스',
].join('\n');

/** 회귀 케이스 3: 보내는사람 먼저 */
const CASE3_SENDER_FIRST = [
  '보내는사람 박대균 010-3333-3333 인천시 미추홀구 인주대로 94번길2 903호',
  '받는사람 김영수 010-1111-1111 서울 강남구 테헤란로 123 2층 사과 1박스',
].join('\n');

describe('normalize-29 회귀 — promptRoute (core/full)', () => {
  it('1. 수취+보내는사람 2줄 → core', () => {
    expect(classifyNormalize29PromptRoute(CASE1_RECIPIENT_SENDER)).toBe('core');
  });

  it('2. 진짜 2건(다른 수취인 2줄) → core (다건 분리는 AI·프롬프트)', () => {
    expect(classifyNormalize29PromptRoute(CASE2_TWO_ORDERS)).toBe('core');
  });

  it('3. 보내는사람 먼저 → core', () => {
    expect(classifyNormalize29PromptRoute(CASE3_SENDER_FIRST)).toBe('core');
  });

  it('4. 탭 17건 목록 → core', () => {
    const line =
      'ljw890917@naver.com\t이재원\t010-4255-5556\t39629\t경북 김천시 부곡중앙1길 79 108동 504호';
    expect(classifyNormalize29PromptRoute(Array.from({ length: 17 }, () => line).join('\n'))).toBe(
      'core',
    );
  });

  it('5. 쿠팡·상품주문번호·배송비·결제금액 → full', () => {
    expect(
      classifyNormalize29PromptRoute('쿠팡 주문\n결제금액 15000\n받는분 김철수'),
    ).toBe('full');
    expect(
      classifyNormalize29PromptRoute('상품주문번호 12345 받는분 홍길동 010-1234-5678'),
    ).toBe('full');
    expect(
      classifyNormalize29PromptRoute('받는분 김철수 010-1111-2222 배송비 3000'),
    ).toBe('full');
  });
});

describe('normalize-29 회귀 — core 프롬프트·필드', () => {
  it('core 29필드가 BASE_HEADERS 부분집합', () => {
    expect(TEXT_ORDER_SIMPLE_CORE_HEADERS).toHaveLength(29);
    for (const h of TEXT_ORDER_SIMPLE_CORE_HEADERS) {
      expect(BASE_HEADERS as readonly string[]).toContain(h);
    }
  });

  it('발송인·1건 유지 규칙이 core prompt에 포함', () => {
    const prompt = buildNormalize29CoreSystemPrompt();
    expect(prompt).toContain('보내는사람');
    expect(prompt).toContain('새 주문(orders 추가)으로 분리하지 않는다');
    expect(prompt).toContain('한 줄이 곧 한 주문이 아니다');
    expect(prompt).not.toContain('줄마다 다른 수취인');
  });

  it('AI partial + 서버 74 보정 — 발송인 필드 키 유지', () => {
    const row = normalizeNormalize29Order({
      받는사람: '김영수',
      보내는사람: '박대균',
      보내는사람전화1: '010-4508-5766',
      보내는사람주소1: '인천시 미추홀구',
    });
    expect(Object.keys(row)).toHaveLength(BASE_HEADERS.length);
    expect(row['보내는사람']).toBe('박대균');
    expect(row['보내는사람전화1']).toBe('010-4508-5766');
    expect(row['보내는사람주소1']).toBe('인천시 미추홀구');
  });
});

describe('normalize-29 회귀 — core 속도 파라미터', () => {
  it('core timeout·max_tokens는 확장 전보다 여유 있게 (60s / 2048)', () => {
    expect(getNormalize29AiCallParams('core')).toEqual({
      timeoutMs: 60_000,
      maxTokens: 2048,
    });
  });

  it('core prompt는 full보다 짧게 유지', () => {
    const coreLen = buildNormalize29CoreSystemPrompt().length;
    const fullLen = buildNormalize29FullSystemPrompt().length;
    expect(coreLen).toBeLessThan(fullLen);
    expect(coreLen).toBeLessThan(2200);
  });
});
