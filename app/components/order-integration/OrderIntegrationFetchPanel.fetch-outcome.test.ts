import { describe, expect, it } from 'vitest';
import { buildFetchOutcomeNotice } from '@/app/components/order-integration/OrderIntegrationFetchPanel';

describe('buildFetchOutcomeNotice', () => {
  it('summarizes partial mall failures without claiming empty success-only', () => {
    expect(
      buildFetchOutcomeNotice({
        failed: [{ name: '11번가', message: '[-1] 인증키 오류' }],
        okCount: 4,
        okOrderCount: 0,
      }),
    ).toBe('11번가 조회 실패 / 나머지 4개 쇼핑몰 조회 완료 · 0건');
  });

  it('returns null when all malls succeeded', () => {
    expect(buildFetchOutcomeNotice({ failed: [], okCount: 4, okOrderCount: 0 })).toBeNull();
  });
});
