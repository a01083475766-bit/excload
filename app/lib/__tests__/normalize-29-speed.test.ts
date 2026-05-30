import { describe, it, expect } from 'vitest';
import { getNormalize29AiCallParams } from '@/app/lib/normalize-29/ai-call-params';
import { TEXT_ORDER_PARCEL_HEADERS } from '@/app/lib/normalize-29/text-order-route';
import { buildNormalize29SystemPrompt } from '@/app/lib/normalize-29/prompts';

describe('normalize-29 단일 프롬프트', () => {
  it('TEXT_ORDER_PARCEL_HEADERS는 29개 필드', () => {
    expect(TEXT_ORDER_PARCEL_HEADERS).toHaveLength(29);
    expect(TEXT_ORDER_PARCEL_HEADERS).toContain('보내는사람');
    expect(TEXT_ORDER_PARCEL_HEADERS).toContain('받는사람');
  });

  it('buildNormalize29SystemPrompt는 parcel 필드·규칙 포함', () => {
    const prompt = buildNormalize29SystemPrompt();
    expect(prompt).toContain('보내는사람');
    expect(prompt).toContain('받는사람');
    expect(prompt).toContain('orders 배열');
    expect(prompt).toContain('탭');
    expect(prompt).not.toMatch(/core|full/i);
  });

  it('getNormalize29AiCallParams: max_tokens 기본 16384, 타임아웃 없음', () => {
    const params = getNormalize29AiCallParams();
    expect(params.maxTokens).toBe(16_384);
    expect(params).not.toHaveProperty('timeoutMs');
  });
});
