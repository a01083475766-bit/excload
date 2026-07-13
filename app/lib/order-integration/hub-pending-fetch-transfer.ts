/**
 * 주문조회 → 허브 미리보기 전달용 sessionStorage 브리지.
 * (몰 계정이 있어 fetch-orders가 orderStandardFile을 줄 때 사용)
 */

import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export const HUB_PENDING_FETCH_STORAGE_KEY = 'excload_order_integration_hub_pending_fetch_v1';

export type HubPendingFetchTransfer = {
  source: 'order-fetch';
  createdAt: string;
  rows: StandardOrderRow[];
  mallSummaries: Array<{ mallId: string; name: string; count: number }>;
};

function parsePendingFetch(raw: string): HubPendingFetchTransfer | null {
  try {
    const parsed = JSON.parse(raw) as HubPendingFetchTransfer;
    if (
      !parsed ||
      parsed.source !== 'order-fetch' ||
      !Array.isArray(parsed.rows) ||
      parsed.rows.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeHubPendingFetchTransfer(payload: HubPendingFetchTransfer): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(HUB_PENDING_FETCH_STORAGE_KEY, JSON.stringify(payload));
}

/** 읽기만 — 성공 적용 전까지 남겨 새로고침·재시도에 대비 */
export function readHubPendingFetchTransfer(): HubPendingFetchTransfer | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY);
  if (!raw) return null;
  const parsed = parsePendingFetch(raw);
  if (!parsed) {
    sessionStorage.removeItem(HUB_PENDING_FETCH_STORAGE_KEY);
    return null;
  }
  return parsed;
}

export function clearHubPendingFetchTransfer(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(HUB_PENDING_FETCH_STORAGE_KEY);
}

/** 성공 확정 시 등 즉시 비울 때. 허브 적용은 read → 성공 시 clear 권장 */
export function consumeHubPendingFetchTransfer(): HubPendingFetchTransfer | null {
  const parsed = readHubPendingFetchTransfer();
  clearHubPendingFetchTransfer();
  return parsed;
}
