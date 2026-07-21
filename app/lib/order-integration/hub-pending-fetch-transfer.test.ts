import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeHubPendingFetchTransfer,
  HUB_PENDING_FETCH_MAX_CHARS,
  HUB_PENDING_FETCH_STORAGE_KEY,
  HUB_PENDING_FETCH_VERSION,
  isPendingFetchCacheReusable,
  writeHubPendingFetchTransfer,
  type HubPendingFetchTransfer,
} from '@/app/lib/order-integration/hub-pending-fetch-transfer';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

const SCOPE = 'user-123';
const OTHER_SCOPE = 'user-999';

function createMemorySessionStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

function makeRows(count: number): StandardOrderRow[] {
  return Array.from({ length: count }, (_, i) => ({ 주문번호: `A-${i}` }) as never);
}

describe('hub-pending-fetch-transfer 안전장치', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', createMemorySessionStorage());
    vi.stubGlobal('window', { sessionStorage: globalThis.sessionStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('정상 payload를 저장하고 소비한다', () => {
    const write = writeHubPendingFetchTransfer({
      accountScope: SCOPE,
      rows: makeRows(2),
      mallSummaries: [{ mallId: 'smartstore', name: '스마트스토어', count: 2 }],
    });
    expect(write).toEqual({ ok: true });

    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.transfer.rows).toHaveLength(2);
      expect(result.transfer.version).toBe(HUB_PENDING_FETCH_VERSION);
      expect(result.transfer.mallSummaries[0]?.mallId).toBe('smartstore');
    }
  });

  it('소비 직후 sessionStorage 항목을 삭제한다(재소비 시 empty)', () => {
    writeHubPendingFetchTransfer({ accountScope: SCOPE, rows: makeRows(1), mallSummaries: [] });

    const first = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(first.status).toBe('ok');
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeNull();

    const second = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(second.status).toBe('empty');
  });

  it('선택 저장 시 전달한 행만 저장한다', () => {
    writeHubPendingFetchTransfer({
      accountScope: SCOPE,
      rows: [{ 주문번호: 'SEL-1' } as never],
      mallSummaries: [],
    });
    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.transfer.rows).toHaveLength(1);
      expect(result.transfer.rows[0]?.['주문번호']).toBe('SEL-1');
    }
  });

  it('만료된 payload는 삭제하고 expired를 반환한다', () => {
    const past = new Date('2026-07-01T00:00:00.000Z');
    writeHubPendingFetchTransfer({
      accountScope: SCOPE,
      rows: makeRows(1),
      mallSummaries: [],
      now: past,
    });
    // 만료 이후 시점에 소비
    const later = new Date('2026-07-01T00:20:00.000Z');
    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE, now: later });
    expect(result.status).toBe('expired');
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeNull();
  });

  it('accountScope가 다르면 사용하지 않고 삭제한다', () => {
    writeHubPendingFetchTransfer({ accountScope: SCOPE, rows: makeRows(1), mallSummaries: [] });
    const result = consumeHubPendingFetchTransfer({ accountScope: OTHER_SCOPE });
    expect(result.status).toBe('account_mismatch');
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeNull();
  });

  it('잘못된 JSON은 invalid로 처리하고 삭제한다', () => {
    sessionStorage.setItem(HUB_PENDING_FETCH_STORAGE_KEY, '{not json');
    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(result.status).toBe('invalid');
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeNull();
  });

  it('지원하지 않는 version은 삭제한다', () => {
    sessionStorage.setItem(
      HUB_PENDING_FETCH_STORAGE_KEY,
      JSON.stringify({
        version: 999,
        source: 'order-fetch',
        accountScope: SCOPE,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        rows: makeRows(1),
        mallSummaries: [],
      }),
    );
    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(result.status).toBe('unsupported_version');
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeNull();
  });

  it('용량 상한 초과 시 저장하지 않고 too_large를 반환한다', () => {
    const bigValue = 'x'.repeat(HUB_PENDING_FETCH_MAX_CHARS);
    const result = writeHubPendingFetchTransfer({
      accountScope: SCOPE,
      rows: [{ 주문번호: bigValue } as never],
      mallSummaries: [],
    });
    expect(result).toEqual({ ok: false, reason: 'too_large' });
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeNull();
  });

  it('빈 rows는 저장하지 않는다', () => {
    const result = writeHubPendingFetchTransfer({ accountScope: SCOPE, rows: [], mallSummaries: [] });
    expect(result).toEqual({ ok: false, reason: 'empty' });
  });

  it('accountScope가 없으면 저장하지 않는다(인증정보 미포함 보장 전제)', () => {
    const result = writeHubPendingFetchTransfer({ accountScope: '', rows: makeRows(1), mallSummaries: [] });
    expect(result).toEqual({ ok: false, reason: 'no_scope' });
  });

  it('payload에 인증정보 필드를 포함하지 않는다', () => {
    writeHubPendingFetchTransfer({ accountScope: SCOPE, rows: makeRows(1), mallSummaries: [] });
    const raw = sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY) ?? '';
    expect(raw).not.toMatch(/clientSecret|client_secret|accessToken|access_token|clientId/i);
  });
  it('v2 sourceEntries는 rows와 1:1로 저장하고 행 본문은 복제하지 않는다', () => {
    const rows = makeRows(2);
    const write = writeHubPendingFetchTransfer({
      accountScope: SCOPE,
      rows,
      mallSummaries: [
        { mallId: 'smartstore', name: '스마트스토어', count: 1, accountId: 'acc-ss' },
        { mallId: 'coupang', name: '쿠팡', count: 1, accountId: 'acc-cp' },
      ],
      sourceEntries: [
        { mallId: 'smartstore', accountId: 'acc-ss' },
        { mallId: 'coupang', accountId: 'acc-cp' },
      ],
    });
    expect(write).toEqual({ ok: true });
    const raw = sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY) ?? '';
    expect(raw).not.toMatch(/"row"\s*:/);
    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.transfer.sourceEntries).toEqual([
        { mallId: 'smartstore', accountId: 'acc-ss' },
        { mallId: 'coupang', accountId: 'acc-cp' },
      ]);
      expect(result.transfer.rows).toHaveLength(2);
    }
  });

  it('sourceEntries 길이가 rows와 다르면 저장하지 않는다', () => {
    const result = writeHubPendingFetchTransfer({
      accountScope: SCOPE,
      rows: makeRows(2),
      mallSummaries: [],
      sourceEntries: [{ mallId: 'smartstore', accountId: 'acc-1' }],
    });
    expect(result).toEqual({ ok: false, reason: 'source_mismatch' });
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeNull();
  });

  it('소비 시 sourceEntries 길이 불일치면 출처 메타만 버리고 rows는 유지한다', () => {
    sessionStorage.setItem(
      HUB_PENDING_FETCH_STORAGE_KEY,
      JSON.stringify({
        version: HUB_PENDING_FETCH_VERSION,
        source: 'order-fetch',
        accountScope: SCOPE,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        rows: makeRows(2),
        mallSummaries: [],
        sourceEntries: [{ mallId: 'smartstore', accountId: 'acc-1' }],
      }),
    );
    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.transfer.rows).toHaveLength(2);
      expect(result.transfer.sourceEntries).toBeUndefined();
    }
  });

  it('v1 payload도 소비할 수 있다(sourceEntries 없음)', () => {
    sessionStorage.setItem(
      HUB_PENDING_FETCH_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        source: 'order-fetch',
        accountScope: SCOPE,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        rows: makeRows(1),
        mallSummaries: [],
      }),
    );
    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.transfer.version).toBe(1);
      expect(result.transfer.sourceEntries).toBeUndefined();
    }
  });

  it('빈 rows payload는 invalid로 처리한다', () => {
    sessionStorage.setItem(
      HUB_PENDING_FETCH_STORAGE_KEY,
      JSON.stringify({
        version: HUB_PENDING_FETCH_VERSION,
        source: 'order-fetch',
        accountScope: SCOPE,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        rows: [],
        mallSummaries: [],
      }),
    );
    const result = consumeHubPendingFetchTransfer({ accountScope: SCOPE });
    expect(result.status).toBe('invalid');
  });
});

describe('isPendingFetchCacheReusable (Strict Mode 모듈 캐시 격리)', () => {
  function makeCache(overrides: Partial<HubPendingFetchTransfer> = {}): HubPendingFetchTransfer {
    return {
      version: HUB_PENDING_FETCH_VERSION,
      source: 'order-fetch',
      accountScope: SCOPE,
      createdAt: '2026-07-17T00:00:00.000Z',
      expiresAt: new Date('2026-07-17T00:00:00.000Z').toISOString(),
      rows: makeRows(1),
      mallSummaries: [],
      ...overrides,
    };
  }

  const beforeExpiry = new Date('2026-07-17T00:05:00.000Z');
  const afterExpiry = new Date('2026-07-17T00:20:00.000Z');

  it('null 캐시는 재사용하지 않는다', () => {
    expect(isPendingFetchCacheReusable(null, { accountScope: SCOPE })).toBe(false);
  });

  it('같은 사용자·유효기간 내 캐시는 재사용 가능', () => {
    const cache = makeCache({ expiresAt: new Date('2026-07-17T00:10:00.000Z').toISOString() });
    expect(isPendingFetchCacheReusable(cache, { accountScope: SCOPE, now: beforeExpiry })).toBe(true);
  });

  it('다른 accountScope 캐시는 재사용하지 않는다(계정 전환 시 이전 rows 차단)', () => {
    const cache = makeCache({ expiresAt: new Date('2026-07-17T00:10:00.000Z').toISOString() });
    expect(isPendingFetchCacheReusable(cache, { accountScope: OTHER_SCOPE, now: beforeExpiry })).toBe(
      false,
    );
  });

  it('만료된 캐시는 재사용하지 않는다', () => {
    const cache = makeCache({ expiresAt: new Date('2026-07-17T00:10:00.000Z').toISOString() });
    expect(isPendingFetchCacheReusable(cache, { accountScope: SCOPE, now: afterExpiry })).toBe(false);
  });

  it('미지원 version 캐시는 재사용하지 않는다', () => {
    const cache = makeCache({ version: 999, expiresAt: new Date('2026-07-17T00:10:00.000Z').toISOString() });
    expect(isPendingFetchCacheReusable(cache, { accountScope: SCOPE, now: beforeExpiry })).toBe(false);
  });

  it('accountScope가 비어 있으면 재사용하지 않는다', () => {
    const cache = makeCache({ expiresAt: new Date('2026-07-17T00:10:00.000Z').toISOString() });
    expect(isPendingFetchCacheReusable(cache, { accountScope: '', now: beforeExpiry })).toBe(false);
  });

  it('source가 order-fetch가 아니면 재사용하지 않는다', () => {
    const cache = makeCache({
      source: 'other' as never,
      expiresAt: new Date('2026-07-17T00:10:00.000Z').toISOString(),
    });
    expect(isPendingFetchCacheReusable(cache, { accountScope: SCOPE, now: beforeExpiry })).toBe(
      false,
    );
  });

  it('빈 rows 캐시는 재사용하지 않는다', () => {
    const cache = makeCache({
      rows: [],
      expiresAt: new Date('2026-07-17T00:10:00.000Z').toISOString(),
    });
    expect(isPendingFetchCacheReusable(cache, { accountScope: SCOPE, now: beforeExpiry })).toBe(
      false,
    );
  });
});
