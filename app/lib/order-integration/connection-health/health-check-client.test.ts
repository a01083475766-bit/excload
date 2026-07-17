import { describe, expect, it } from 'vitest';
import { orderAccountIdsForCheck, runWithConcurrency } from './health-check-client';

describe('orderAccountIdsForCheck', () => {
  it('선택된 계정을 앞으로 정렬하고 원래 순서를 유지한다', () => {
    const all = ['a', 'b', 'c', 'd'];
    const selected = new Set(['c', 'b']);
    expect(orderAccountIdsForCheck(all, selected)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('선택이 없으면 원래 순서 그대로', () => {
    expect(orderAccountIdsForCheck(['a', 'b'], new Set())).toEqual(['a', 'b']);
  });
});

describe('runWithConcurrency', () => {
  it('동시 실행 수가 limit를 넘지 않는다', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    await runWithConcurrency(items, 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('모든 항목을 정확히 한 번씩 처리한다', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const seen: string[] = [];
    await runWithConcurrency(items, 2, async (item) => {
      seen.push(item);
    });
    expect(seen.sort()).toEqual([...items].sort());
  });

  it('개별 worker 예외가 전체를 중단시키지 않는다', async () => {
    const items = [1, 2, 3];
    const done: number[] = [];
    await runWithConcurrency(items, 2, async (item) => {
      if (item === 2) throw new Error('boom');
      done.push(item);
    });
    expect(done.sort()).toEqual([1, 3]);
  });
});
