import type { ConfirmShipmentUploadMatchSuccessResponse } from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';
import type { ShipmentUploadBatchDetailResponse } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { mapShipmentMatchFetchError } from '@/app/lib/order-integration/shipments/shipment-match-ui';

export function buildShipmentUploadBatchDetailUrl(batchId: string): string {
  return `/api/order/integration/shipments/uploads/${encodeURIComponent(batchId)}`;
}

export function buildShipmentUploadMatchConfirmUrl(batchId: string, matchId: string): string {
  return `/api/order/integration/shipments/uploads/${encodeURIComponent(batchId)}/matches/${encodeURIComponent(matchId)}/confirm`;
}

export type ShipmentUploadBatchDetailFetchResult =
  | { ok: true; body: ShipmentUploadBatchDetailResponse }
  | { ok: false; status: number; error: string };

export type ShipmentUploadMatchConfirmFetchResult =
  | { ok: true; body: ConfirmShipmentUploadMatchSuccessResponse }
  | { ok: false; status: number; error: string };

export async function fetchShipmentUploadBatchDetail(
  batchId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShipmentUploadBatchDetailFetchResult> {
  const response = await fetchFn(buildShipmentUploadBatchDetailUrl(batchId));
  const json = (await response.json().catch(() => null)) as
    | ShipmentUploadBatchDetailResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    const errorBody =
      json && typeof json === 'object' && 'error' in json ? { error: json.error } : null;
    return {
      ok: false,
      status: response.status,
      error: mapShipmentMatchFetchError(response.status, errorBody),
    };
  }

  if (!json || !('success' in json) || !json.success) {
    return {
      ok: false,
      status: 500,
      error: '저장된 매칭 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
    };
  }

  return { ok: true, body: json };
}

export async function postShipmentUploadMatchConfirm(
  batchId: string,
  matchId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShipmentUploadMatchConfirmFetchResult> {
  const response = await fetchFn(buildShipmentUploadMatchConfirmUrl(batchId, matchId), {
    method: 'POST',
  });
  const json = (await response.json().catch(() => null)) as
    | ConfirmShipmentUploadMatchSuccessResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    const errorBody =
      json && typeof json === 'object' && 'error' in json ? { error: json.error } : null;
    return {
      ok: false,
      status: response.status,
      error: mapShipmentMatchFetchError(response.status, errorBody),
    };
  }

  if (!json || !('success' in json) || !json.success) {
    return {
      ok: false,
      status: 500,
      error: '매칭 확정 결과를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
    };
  }

  return { ok: true, body: json };
}
