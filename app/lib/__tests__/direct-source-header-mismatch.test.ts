import { describe, expect, it } from 'vitest';
import {
  findMissingDirectSourceHeaders,
  getMappedDirectSourceHeaders,
} from '@/app/lib/direct-source-header-mismatch';

describe('getMappedDirectSourceHeaders', () => {
  it('비워두기와 중복을 제외한다', () => {
    expect(
      getMappedDirectSourceHeaders({
        거래날짜: '거래일시',
        No: 'No.',
        비고: null,
        적요: ' 적요 ',
        복사: '거래일시',
      }),
    ).toEqual(['거래일시', 'No.', ' 적요 ']);
  });
});

describe('findMissingDirectSourceHeaders', () => {
  it('trim 일치면 누락으로 보지 않는다', () => {
    expect(
      findMissingDirectSourceHeaders(['거래일시', 'No.'], ['거래일시', ' No. ']),
    ).toEqual([]);
  });

  it('없는 헤더만 반환한다', () => {
    expect(
      findMissingDirectSourceHeaders(['이름', '주소'], ['거래일시', 'No.', '이름']),
    ).toEqual(['거래일시', 'No.']);
  });
});
