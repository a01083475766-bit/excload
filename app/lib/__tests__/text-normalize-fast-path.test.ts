import { describe, it, expect } from 'vitest';
import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { tryTextNormalizeWithoutAi } from '../text-normalize-fast-path';

describe('tryTextNormalizeWithoutAi', () => {
  it('단순 한 줄 주문은 AI 없이 행을 만든다', () => {
    const result = tryTextNormalizeWithoutAi(
      '김철수 서울시 강남구 테헤란로 123 010-1234-5678 사과 1kg',
    );
    expect(result).not.toBeNull();
    expect(result?.rows).toHaveLength(1);
    const nameIdx = BASE_HEADERS.indexOf('받는사람');
    expect(result?.rows[0][nameIdx]).toBe('김철수');
    expect(result?.normalizeMeta.usedFallback).toBe(false);
  });

  it('전화번호가 2개면 null (AI 경로)', () => {
    const result = tryTextNormalizeWithoutAi(
      '김철수 010-1111-2222 서울시 강남구\n이영희 010-3333-4444 부산시 해운대구 사과',
    );
    expect(result).toBeNull();
  });
});
