import { describe, expect, it } from 'vitest';
import {
  buildSmartstoreQueryWindows,
  collectSmartstoreProductOrders,
  type SmartstoreApiRequestFn,
} from '@/app/lib/smartstore/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const LAG_MS = 5 * 1000;
const FIXED_NOW = new Date('2026-07-16T12:00:00.000+09:00');

function parseQuery(pathWithQuery: string): URLSearchParams {
  const queryString = pathWithQuery.split('?')[1] ?? '';
  return new URLSearchParams(queryString);
}

describe('buildSmartstoreQueryWindows', () => {
  it('7일 요청을 24시간 이하 구간 7개로 나눈다', () => {
    const windows = buildSmartstoreQueryWindows({ now: FIXED_NOW, days: 7 });

    expect(windows).toHaveLength(7);

    for (const win of windows) {
      const span = new Date(win.toIso).getTime() - new Date(win.fromIso).getTime();
      expect(span).toBeGreaterThan(0);
      expect(span).toBeLessThanOrEqual(DAY_MS);
    }

    // 첫 구간 시작 = now - 7일, 마지막 구간 종료 = now - 5초(전체 종료 시각을 넘지 않음)
    expect(new Date(windows[0].fromIso).getTime()).toBe(FIXED_NOW.getTime() - 7 * DAY_MS);
    expect(new Date(windows[windows.length - 1].toIso).getTime()).toBe(FIXED_NOW.getTime() - LAG_MS);

    // 구간이 서로 이어지고 겹치지 않는다
    for (let i = 1; i < windows.length; i += 1) {
      expect(new Date(windows[i].fromIso).getTime()).toBe(new Date(windows[i - 1].toIso).getTime());
    }
  });

  it('기본 7일과 최대 30일, 최소 1일을 모두 처리한다', () => {
    expect(buildSmartstoreQueryWindows({ now: FIXED_NOW, days: 1 })).toHaveLength(1);
    expect(buildSmartstoreQueryWindows({ now: FIXED_NOW, days: 7 })).toHaveLength(7);
    expect(buildSmartstoreQueryWindows({ now: FIXED_NOW, days: 30 })).toHaveLength(30);
  });
});

describe('collectSmartstoreProductOrders', () => {
  it('한 구간 안에서 more가 있으면 moreFrom/moreSequence로 페이지네이션한다', async () => {
    const getCalls: string[] = [];
    let getCount = 0;

    const request = (async (req: { method: string; pathWithQuery: string; body?: string }) => {
      if (req.method === 'GET') {
        getCalls.push(req.pathWithQuery);
        getCount += 1;
        if (getCount === 1) {
          return {
            data: {
              lastChangeStatuses: [{ productOrderId: 'PO-1' }],
              more: { moreFrom: '2026-07-15T18:00:00.000+09:00', moreSequence: 'SEQ-1' },
            },
          };
        }
        return { data: { lastChangeStatuses: [{ productOrderId: 'PO-2' }] } };
      }
      const body = JSON.parse(req.body ?? '{}') as { productOrderIds: string[] };
      return { data: body.productOrderIds.map((id) => ({ productOrder: { productOrderId: id } })) };
    }) as SmartstoreApiRequestFn;

    const details = await collectSmartstoreProductOrders({ request, days: 1, now: FIXED_NOW });

    expect(getCalls).toHaveLength(2);

    const page1 = parseQuery(getCalls[0]);
    const page2 = parseQuery(getCalls[1]);

    // 두 번째 요청은 moreFrom을 lastChangedFrom으로, moreSequence를 그대로 사용
    expect(page1.get('moreSequence')).toBeNull();
    expect(page2.get('lastChangedFrom')).toBe('2026-07-15T18:00:00.000+09:00');
    expect(page2.get('moreSequence')).toBe('SEQ-1');
    // 페이지네이션 중 lastChangedTo(구간 종료)는 유지
    expect(page2.get('lastChangedTo')).toBe(page1.get('lastChangedTo'));

    expect(details.map((d) => d.productOrder?.productOrderId)).toEqual(['PO-1', 'PO-2']);
  });

  it('같은 커서가 반복되면 무한 루프 없이 중단한다', async () => {
    let getCount = 0;

    const request = (async (req: { method: string; pathWithQuery: string; body?: string }) => {
      if (req.method === 'GET') {
        getCount += 1;
        // 매번 동일한 커서를 반환 → 진행 없음으로 판단해 중단해야 한다
        return {
          data: {
            lastChangeStatuses: [{ productOrderId: 'PO-1' }],
            more: { moreFrom: '2026-07-15T18:00:00.000+09:00', moreSequence: 'SEQ-STUCK' },
          },
        };
      }
      const body = JSON.parse(req.body ?? '{}') as { productOrderIds: string[] };
      return { data: body.productOrderIds.map((id) => ({ productOrder: { productOrderId: id } })) };
    }) as SmartstoreApiRequestFn;

    const details = await collectSmartstoreProductOrders({ request, days: 1, now: FIXED_NOW });

    // 첫 페이지 + 동일 커서 감지 페이지 = 2회 이내로 멈춘다
    expect(getCount).toBeLessThanOrEqual(2);
    expect(details.map((d) => d.productOrder?.productOrderId)).toEqual(['PO-1']);
  });

  it('상세 조회는 300개 초과 시 여러 배치로 나눈다', async () => {
    const ids = Array.from({ length: 350 }, (_, i) => `PO-${i}`);
    const postSizes: number[] = [];

    const request = (async (req: { method: string; pathWithQuery: string; body?: string }) => {
      if (req.method === 'GET') {
        return { data: { lastChangeStatuses: ids.map((id) => ({ productOrderId: id })) } };
      }
      const body = JSON.parse(req.body ?? '{}') as { productOrderIds: string[] };
      postSizes.push(body.productOrderIds.length);
      return { data: body.productOrderIds.map((id) => ({ productOrder: { productOrderId: id } })) };
    }) as SmartstoreApiRequestFn;

    const details = await collectSmartstoreProductOrders({ request, days: 1, now: FIXED_NOW });

    expect(postSizes).toEqual([300, 50]);
    expect(details).toHaveLength(350);
  });

  it('구간 경계에서 중복된 productOrderId를 최종적으로 제거한다', async () => {
    const postBatches: string[][] = [];

    const request = (async (req: { method: string; pathWithQuery: string; body?: string }) => {
      if (req.method === 'GET') {
        // 2개 구간 모두 동일한 주문번호를 반환 → 중복
        return {
          data: {
            lastChangeStatuses: [{ productOrderId: 'PO-1' }, { productOrderId: 'PO-2' }],
          },
        };
      }
      const body = JSON.parse(req.body ?? '{}') as { productOrderIds: string[] };
      postBatches.push(body.productOrderIds);
      return { data: body.productOrderIds.map((id) => ({ productOrder: { productOrderId: id } })) };
    }) as SmartstoreApiRequestFn;

    const details = await collectSmartstoreProductOrders({ request, days: 2, now: FIXED_NOW });

    expect(postBatches).toHaveLength(1);
    expect([...postBatches[0]].sort()).toEqual(['PO-1', 'PO-2']);
    expect(details).toHaveLength(2);
  });

  it('조회 결과가 0건이면 실패가 아니라 정상 0건으로 처리한다', async () => {
    let postCount = 0;

    const request = (async (req: { method: string; pathWithQuery: string; body?: string }) => {
      if (req.method === 'GET') {
        return { data: { lastChangeStatuses: [] } };
      }
      postCount += 1;
      return { data: [] };
    }) as SmartstoreApiRequestFn;

    const details = await collectSmartstoreProductOrders({ request, days: 7, now: FIXED_NOW });

    expect(details).toEqual([]);
    // 주문번호가 없으므로 상세 조회는 호출되지 않는다
    expect(postCount).toBe(0);
  });

  it('변경내역 조회 실패 시 어느 구간/페이지에서 실패했는지 메시지에 담는다', async () => {
    const request = (async (req: { method: string }) => {
      if (req.method === 'GET') {
        throw new Error('조회 날짜가 유효하지 않습니다.');
      }
      return { data: [] };
    }) as SmartstoreApiRequestFn;

    await expect(
      collectSmartstoreProductOrders({ request, days: 7, now: FIXED_NOW }),
    ).rejects.toThrow(/구간 1\/7, 페이지 1.*조회 날짜가 유효하지 않습니다/);
  });

  it('상세 조회 실패 시 어느 배치에서 실패했는지 메시지에 담는다', async () => {
    const request = (async (req: { method: string; body?: string }) => {
      if (req.method === 'GET') {
        return { data: { lastChangeStatuses: [{ productOrderId: 'PO-1' }] } };
      }
      throw new Error('일시적인 서버 오류');
    }) as SmartstoreApiRequestFn;

    await expect(
      collectSmartstoreProductOrders({ request, days: 1, now: FIXED_NOW }),
    ).rejects.toThrow(/상세 배치 1\/1.*일시적인 서버 오류/);
  });
});
