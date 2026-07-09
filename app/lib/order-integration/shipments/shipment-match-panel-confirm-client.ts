import type { ConfirmShipmentUploadMatchSuccessResponse } from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';
import type { ExcludeShipmentUploadMatchSuccessResponse } from '@/app/lib/order-integration/shipments/exclude-shipment-upload-match';
import type { LinkShipmentUploadMatchSuccessResponse } from '@/app/lib/order-integration/shipments/link-shipment-upload-match';
import type { LinkableOrdersForShipmentUploadBatchResponse } from '@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch';
import { DEFAULT_LINKABLE_ORDERS_LIMIT } from '@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch';
import type { ShipmentUploadBatchDetailResponse } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import {
  buildShipmentUploadExportFileName,
  type ShipmentUploadExportFormat,
} from '@/app/lib/order-integration/shipments/render-shipment-upload-export-file';
import { mapShipmentMatchFetchError } from '@/app/lib/order-integration/shipments/shipment-match-ui';

export const DEFAULT_SHIPMENT_MATCH_EXCLUDE_REASON = 'USER_EXCLUDED_FROM_UI';

export function buildShipmentUploadBatchDetailUrl(batchId: string): string {
  return `/api/order/integration/shipments/uploads/${encodeURIComponent(batchId)}`;
}

export function buildShipmentUploadMatchConfirmUrl(batchId: string, matchId: string): string {
  return `/api/order/integration/shipments/uploads/${encodeURIComponent(batchId)}/matches/${encodeURIComponent(matchId)}/confirm`;
}

export function buildShipmentUploadMatchExcludeUrl(batchId: string, matchId: string): string {
  return `/api/order/integration/shipments/uploads/${encodeURIComponent(batchId)}/matches/${encodeURIComponent(matchId)}/exclude`;
}

export function buildShipmentUploadLinkableOrdersUrl(
  batchId: string,
  options: { q?: string | null; limit?: number } = {},
): string {
  const params = new URLSearchParams();
  const q = options.q?.trim();
  if (q) params.set('q', q);
  params.set('limit', String(options.limit ?? DEFAULT_LINKABLE_ORDERS_LIMIT));
  const query = params.toString();
  return `/api/order/integration/shipments/uploads/${encodeURIComponent(batchId)}/linkable-orders${query ? `?${query}` : ''}`;
}

export function buildShipmentUploadMatchLinkUrl(batchId: string, matchId: string): string {
  return `/api/order/integration/shipments/uploads/${encodeURIComponent(batchId)}/matches/${encodeURIComponent(matchId)}/link`;
}

export function buildShipmentUploadExportUrl(
  batchId: string,
  options: {
    format?: ShipmentUploadExportFormat;
    provider?: string | null;
    integrationAccountId?: string | null;
  } = {},
): string {
  const params = new URLSearchParams();
  params.set('format', options.format ?? 'xlsx');
  if (options.provider?.trim()) {
    params.set('provider', options.provider.trim());
  }
  if (options.integrationAccountId?.trim()) {
    params.set('integrationAccountId', options.integrationAccountId.trim());
  }
  return `/api/order/integration/shipments/uploads/${encodeURIComponent(batchId)}/export?${params.toString()}`;
}

export type ShipmentUploadBatchDetailFetchResult =
  | { ok: true; body: ShipmentUploadBatchDetailResponse }
  | { ok: false; status: number; error: string };

export type ShipmentUploadMatchConfirmFetchResult =
  | { ok: true; body: ConfirmShipmentUploadMatchSuccessResponse }
  | { ok: false; status: number; error: string };

export type ShipmentUploadMatchExcludeFetchResult =
  | { ok: true; body: ExcludeShipmentUploadMatchSuccessResponse }
  | { ok: false; status: number; error: string };

export type ShipmentUploadLinkableOrdersFetchResult =
  | { ok: true; body: LinkableOrdersForShipmentUploadBatchResponse }
  | { ok: false; status: number; error: string };

export type ShipmentUploadMatchLinkFetchResult =
  | { ok: true; body: LinkShipmentUploadMatchSuccessResponse }
  | { ok: false; status: number; error: string };

export type ShipmentUploadExportDownloadResult =
  | { ok: true; fileName: string }
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

export async function postShipmentUploadMatchExclude(
  batchId: string,
  matchId: string,
  options: { reason?: string | null } = {},
  fetchFn: typeof fetch = fetch,
): Promise<ShipmentUploadMatchExcludeFetchResult> {
  const reason = options.reason?.trim() || DEFAULT_SHIPMENT_MATCH_EXCLUDE_REASON;
  const response = await fetchFn(buildShipmentUploadMatchExcludeUrl(batchId, matchId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const json = (await response.json().catch(() => null)) as
    | ExcludeShipmentUploadMatchSuccessResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    const errorBody =
      json && typeof json === 'object' && 'error' in json ? { error: json.error } : null;
    return {
      ok: false,
      status: response.status,
      error:
        mapShipmentMatchFetchError(response.status, errorBody) ||
        '제외 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  if (!json || !('success' in json) || !json.success) {
    return {
      ok: false,
      status: 500,
      error: '제외 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  return { ok: true, body: json };
}

export async function fetchShipmentUploadLinkableOrders(
  batchId: string,
  options: { q?: string | null; limit?: number } = {},
  fetchFn: typeof fetch = fetch,
): Promise<ShipmentUploadLinkableOrdersFetchResult> {
  const response = await fetchFn(buildShipmentUploadLinkableOrdersUrl(batchId, options));
  const json = (await response.json().catch(() => null)) as
    | LinkableOrdersForShipmentUploadBatchResponse
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
      error: '연결 가능한 주문 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
    };
  }

  return { ok: true, body: json };
}

export async function postShipmentUploadMatchLink(
  batchId: string,
  matchId: string,
  orderSyncOrderId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShipmentUploadMatchLinkFetchResult> {
  const response = await fetchFn(buildShipmentUploadMatchLinkUrl(batchId, matchId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderSyncOrderId }),
  });
  const json = (await response.json().catch(() => null)) as
    | LinkShipmentUploadMatchSuccessResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    const errorBody =
      json && typeof json === 'object' && 'error' in json ? { error: json.error } : null;
    return {
      ok: false,
      status: response.status,
      error:
        mapShipmentMatchFetchError(response.status, errorBody) ||
        '주문 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  if (!json || !('success' in json) || !json.success) {
    return {
      ok: false,
      status: 500,
      error: '주문 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  return { ok: true, body: json };
}

export function parseContentDispositionFileName(
  contentDisposition: string | null | undefined,
): string | null {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1]?.trim() || null;
}

export function resolveShipmentUploadExportDownloadFileName(input: {
  batchId: string;
  format: ShipmentUploadExportFormat;
  contentDisposition?: string | null;
}): string {
  return (
    parseContentDispositionFileName(input.contentDisposition) ??
    buildShipmentUploadExportFileName({
      format: input.format,
      batchId: input.batchId,
    })
  );
}

export async function downloadShipmentUploadExportFile(
  batchId: string,
  options: { format?: ShipmentUploadExportFormat } = {},
  fetchFn: typeof fetch = fetch,
): Promise<ShipmentUploadExportDownloadResult> {
  const format = options.format ?? 'xlsx';
  const response = await fetchFn(buildShipmentUploadExportUrl(batchId, { format }));

  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as { error?: string } | null;
    const errorBody =
      json && typeof json === 'object' && 'error' in json ? { error: json.error } : null;
    return {
      ok: false,
      status: response.status,
      error:
        mapShipmentMatchFetchError(response.status, errorBody) ||
        '파일 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  const blob = await response.blob();
  const fileName = resolveShipmentUploadExportDownloadFileName({
    batchId,
    format,
    contentDisposition: response.headers.get('Content-Disposition'),
  });

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return { ok: true, fileName };
}
