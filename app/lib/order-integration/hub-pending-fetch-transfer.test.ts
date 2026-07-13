import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HUB_PENDING_FETCH_STORAGE_KEY,
  clearHubPendingFetchTransfer,
  consumeHubPendingFetchTransfer,
  readHubPendingFetchTransfer,
  writeHubPendingFetchTransfer,
} from '@/app/lib/order-integration/hub-pending-fetch-transfer';

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

describe('hub-pending-fetch-transfer', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', createMemorySessionStorage());
    vi.stubGlobal('window', { sessionStorage: globalThis.sessionStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads without removing, clears only when asked', () => {
    writeHubPendingFetchTransfer({
      source: 'order-fetch',
      createdAt: '2026-07-14T00:00:00.000Z',
      rows: [{ 주문번호: 'A-1' } as never],
      mallSummaries: [{ mallId: 'coupang', name: '쿠팡', count: 1 }],
    });

    const first = readHubPendingFetchTransfer();
    expect(first?.rows).toHaveLength(1);
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeTruthy();

    const second = readHubPendingFetchTransfer();
    expect(second?.mallSummaries[0]?.mallId).toBe('coupang');

    clearHubPendingFetchTransfer();
    expect(readHubPendingFetchTransfer()).toBeNull();
  });

  it('writes and consumes pending rows once', () => {
    writeHubPendingFetchTransfer({
      source: 'order-fetch',
      createdAt: '2026-07-14T00:00:00.000Z',
      rows: [{ 주문번호: 'A-1' } as never],
      mallSummaries: [{ mallId: 'coupang', name: '쿠팡', count: 1 }],
    });

    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeTruthy();

    const first = consumeHubPendingFetchTransfer();
    expect(first?.rows).toHaveLength(1);
    expect(first?.mallSummaries[0]?.mallId).toBe('coupang');
    expect(sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY)).toBeNull();

    expect(consumeHubPendingFetchTransfer()).toBeNull();
  });

  it('returns null for empty rows payload', () => {
    sessionStorage.setItem(
      HUB_PENDING_FETCH_STORAGE_KEY,
      JSON.stringify({
        source: 'order-fetch',
        createdAt: '2026-07-14T00:00:00.000Z',
        rows: [],
        mallSummaries: [],
      }),
    );
    expect(consumeHubPendingFetchTransfer()).toBeNull();
  });
});
