import { describe, expect, it } from 'vitest';
import { partitionUnknownHeadersForDisplay } from './UnknownHeadersWarningBanner';

describe('partitionUnknownHeadersForDisplay', () => {
  it('예시값이 있는 헤더만 분리하고 빈 열 개수를 계산한다', () => {
    const result = partitionUnknownHeadersForDisplay(
      ['이름', '중량(kg)', '메모'],
      {
        이름: ['홍*동'],
        '중량(kg)': [],
        메모: ['문*에'],
      },
    );

    expect(result.headersWithSamples).toEqual(['이름', '메모']);
    expect(result.emptyHeaderCount).toBe(1);
  });

  it('모든 헤더에 예시값이 없으면 빈 배열을 반환한다', () => {
    const result = partitionUnknownHeadersForDisplay(
      ['중량(kg)', '부피(cm)'],
      {
        '중량(kg)': [],
        '부피(cm)': [],
      },
    );

    expect(result.headersWithSamples).toEqual([]);
    expect(result.emptyHeaderCount).toBe(2);
  });
});
