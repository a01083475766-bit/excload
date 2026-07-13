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

export function writeHubPendingFetchTransfer(payload: HubPendingFetchTransfer): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(HUB_PENDING_FETCH_STORAGE_KEY, JSON.stringify(payload));
}

export function consumeHubPendingFetchTransfer(): HubPendingFetchTransfer | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(HUB_PENDING_FETCH_STORAGE_KEY);
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
