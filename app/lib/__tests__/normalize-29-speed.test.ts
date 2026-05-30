import { describe, it, expect } from 'vitest';
import { BASE_HEADERS, BASE_HEADER_COUNT } from '@/app/pipeline/base/base-headers';
import { sanitizeNormalize29Order } from '@/app/lib/heuristic-korean-order-line';
import {
  classifyNormalize29PromptRoute,
  TEXT_ORDER_SIMPLE_CORE_HEADERS,
} from '@/app/lib/normalize-29/text-order-route';
import {
  buildNormalize29CoreSystemPrompt,
  buildNormalize29FullSystemPrompt,
} from '@/app/lib/normalize-29/prompts';
import { getNormalize29AiCallParams } from '@/app/lib/normalize-29/ai-call-params';

describe('classifyNormalize29PromptRoute', () => {
  it('한 줄 단순 주문 → core', () => {
    expect(
      classifyNormalize29PromptRoute('김영수 010-2222-3333 서울 강남구 테헤란로 123 2층 사과'),
    ).toBe('core');
  });

  it('탭 4열: 상품명|주소|전화|이름 → core', () => {
    expect(
      classifyNormalize29PromptRoute(
        '프리미엄 멜론 세트\t서울시 구로구 고척로 53길 23 302호\t010-5050-6060\t김성훈',
      ),
    ).toBe('core');
  });

  it('탭 5열 다건 목록(동일 형식) → core', () => {
    const line =
      'ljw890917@naver.com\t이재원\t010-4255-5556\t39629\t경북 김천시 부곡중앙1길 79 108동 504호';
    expect(classifyNormalize29PromptRoute(Array.from({ length: 17 }, () => line).join('\n'))).toBe(
      'core',
    );
  });

  it('쿠팡·상품주문번호·결제·운임 키워드 → full', () => {
    expect(
      classifyNormalize29PromptRoute(
        '상품주문번호 12345 받는분 홍길동 010-1234-5678 서울시 강남구',
      ),
    ).toBe('full');
    expect(classifyNormalize29PromptRoute('쿠팡 주문\n결제금액 15000\n받는분 김철수')).toBe('full');
    expect(
      classifyNormalize29PromptRoute('받는분 김철수 010-1111-2222 운임구분 선불 주문배송비 3000'),
    ).toBe('full');
    expect(classifyNormalize29PromptRoute('주문번호 998877 받는분 이영희')).toBe('full');
  });

  it('2500자 초과 → full', () => {
    expect(classifyNormalize29PromptRoute('a'.repeat(2501))).toBe('full');
    expect(classifyNormalize29PromptRoute('a'.repeat(2500))).toBe('core');
  });

  it('전화번호 6개 이상·자유 형식 → full', () => {
    const lines = Array.from(
      { length: 6 },
      (_, i) => `홍길동${i} 010-1000-${1000 + i} 서울시 강남구 테헤란로 ${i}`,
    );
    expect(classifyNormalize29PromptRoute(lines.join('\n'))).toBe('full');
  });

  it('탭 9열 이상 → full', () => {
    const line = Array.from({ length: 10 }, (_, i) => `col${i}`).join('\t');
    expect(classifyNormalize29PromptRoute(`${line}\n${line}`)).toBe('full');
  });
});

describe('buildNormalize29CoreSystemPrompt', () => {
  it('13개 코어 필드만 안내', () => {
    expect(TEXT_ORDER_SIMPLE_CORE_HEADERS).toHaveLength(13);
    const prompt = buildNormalize29CoreSystemPrompt();
    for (const header of TEXT_ORDER_SIMPLE_CORE_HEADERS) {
      expect(prompt).toContain(header);
    }
    expect(prompt).toContain('열 순서 가정 금지');
    expect(prompt).toContain('내용으로 판단');
    expect(prompt).toContain('orders에 여러 건');
    expect(prompt).toContain('추출한 필드만 포함해도 된다');
  });
});

describe('buildNormalize29FullSystemPrompt', () => {
  it('74필드 전체 규칙 포함', () => {
    const prompt = buildNormalize29FullSystemPrompt();
    expect(prompt).toContain(String(BASE_HEADER_COUNT));
    expect(prompt).toContain('모든 필드를 반드시 포함');
    expect(prompt).toContain('확장 필드 보수 추출');
  });
});

describe('sanitizeNormalize29Order (normalizeOrderObject 동일)', () => {
  it('core 부분 응답도 BASE_HEADERS 전체·빈 문자열 보정', () => {
    const partial = sanitizeNormalize29Order({
      받는사람: '김성훈',
      받는사람전화1: '010-5050-6060',
      받는사람주소1: '서울시 구로구',
      상품명: '멜론 세트',
    });
    expect(Object.keys(partial)).toHaveLength(BASE_HEADERS.length);
    expect(partial['받는사람']).toBe('김성훈');
    expect(partial['보내는사람']).toBe('');
    expect(partial['수량']).toBe('1');
  });

  it('null·undefined·숫자·객체를 문자열로 안전 변환', () => {
    const row = sanitizeNormalize29Order({
      받는사람: null,
      받는사람전화1: undefined,
      수량: 3 as unknown as string,
      상품명: { bad: true } as unknown as string,
    });
    expect(row['받는사람']).toBe('');
    expect(row['받는사람전화1']).toBe('');
    expect(row['수량']).toBe('3');
    expect(row['상품명']).toBe('[object Object]');
    for (const header of BASE_HEADERS) {
      expect(typeof row[header]).toBe('string');
    }
  });
});

describe('getNormalize29AiCallParams', () => {
  it('core: timeout 30s, max_tokens 2048', () => {
    expect(getNormalize29AiCallParams('core')).toEqual({
      timeoutMs: 30_000,
      maxTokens: 2048,
    });
  });

  it('full: timeout 45s, max_tokens 8192', () => {
    expect(getNormalize29AiCallParams('full')).toEqual({
      timeoutMs: 45_000,
      maxTokens: 8192,
    });
  });
});
