import type { ShipmentUserConfirmationStatus, ShipmentUploadBatchStatus } from '@prisma/client';

import type {
  ShipmentUploadBatchDetailResponse,
  ShipmentUploadBatchDetailRow,
} from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { CONFIRMABLE_ALGORITHM_STATUSES } from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';
import type { ConfirmShipmentUploadMatchSuccessResponse } from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';
import type { ExcludeShipmentUploadMatchSuccessResponse } from '@/app/lib/order-integration/shipments/exclude-shipment-upload-match';
import type { LinkShipmentUploadMatchSuccessResponse } from '@/app/lib/order-integration/shipments/link-shipment-upload-match';
import type {
  ShipmentMatchDisplayRow,
  ShipmentMatchSummaryCounts,
} from '@/app/lib/order-integration/shipments/shipment-match-ui';
import type { ShipmentMatchStatus } from '@/app/lib/order-integration/shipments/types';
import type { ShipmentUploadPersistSuccessResponse } from '@/app/lib/order-integration/shipments/upload-and-persist-shipment-file';
import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';

export const LINKABLE_ALGORITHM_STATUSES: ReadonlySet<ShipmentMatchStatus> = new Set([
  'NOT_MATCHED',
  'MULTIPLE_CANDIDATES',
  'MATCHED_WARNING',
]);

export type ShipmentMatchPanelDisplayRow = ShipmentMatchDisplayRow & {
  matchId: string | null;
  userConfirmationStatus: ShipmentUserConfirmationStatus | null;
  hasLinkedOrder: boolean;
  transmissionStatus: ShipmentUploadBatchDetailRow['transmissionStatus'];
  transmissionErrorMessage: string | null;
  trackingNumberValue: string | null;
  carrierCode: string | null;
  remainQuantity: number | null;
  hasTrackingNumber: boolean;
  /** match/order SSOT. 표에 원문 노출하지 않음 — 실제 전송 확인용 */
  integrationAccountId: string | null;
};

export type ShipmentMatchPanelViewState = {
  uploadBatchId: string;
  batchStatus: ShipmentUploadBatchStatus;
  /** 배치 provider enum (SMARTSTORE 등). 표시용 한글 라벨과 구분 */
  batchProvider: string | null;
  integrationAccountId: string | null;
  file: {
    name: string;
    size: number;
  };
  parse: {
    rowCount: number;
    warningCount: number;
  };
  ordersLoadedCount: number;
  ordersEmptyReason?: string | null;
  ordersBundle?: {
    id: string;
    expiresAt: string;
    workItemCount: number;
    expired: boolean;
  } | null;
  summary: ShipmentMatchSummaryCounts;
  displayRows: ShipmentMatchPanelDisplayRow[];
};

export function toShipmentMatchStatus(
  value: ShipmentUploadBatchDetailRow['algorithmMatchStatus'],
): ShipmentMatchStatus {
  if (!value) return 'NOT_MATCHED';
  return value as ShipmentMatchStatus;
}

export function adaptShipmentUploadBatchDetailRowForDisplay(
  row: ShipmentUploadBatchDetailRow,
): ShipmentMatchPanelDisplayRow {
  const matchStatus = toShipmentMatchStatus(row.algorithmMatchStatus);
  const hasLinkedOrder = Boolean(row.excloadOrderNo?.trim() || row.mallOrderNo?.trim());

  return {
    shipmentRowIndex: row.originalRowIndex,
    matchStatus,
    matchReason: row.matchReason ?? '',
    providerLabel: row.provider,
    mallOrderNo: row.mallOrderNo,
    excloadOrderNo: row.excloadOrderNo,
    receiverName: row.receiverName,
    receiverPhoneMasked: row.receiverPhoneMasked,
    receiverAddressMasked: row.receiverAddressMasked,
    productSummary: row.productSummary,
    carrierName: row.carrierName,
    trackingNumberMasked: row.trackingNumberMasked,
    trackingNumberValue: row.trackingNumberValue,
    carrierCode: row.carrierCode,
    matchId: row.matchId,
    userConfirmationStatus: row.userConfirmationStatus,
    transmissionStatus: row.transmissionStatus,
    transmissionErrorMessage: row.transmissionErrorMessage,
    hasLinkedOrder,
    remainQuantity: row.remainQuantity ?? null,
    hasTrackingNumber: row.hasTrackingNumber === true,
    integrationAccountId: row.integrationAccountId ?? null,
  };
}

export function canShowShipmentMatchConfirmButton(row: ShipmentMatchPanelDisplayRow): boolean {
  if (!row.matchId?.trim()) return false;
  if (row.userConfirmationStatus !== 'UNCONFIRMED') return false;
  if (!CONFIRMABLE_ALGORITHM_STATUSES.has(row.matchStatus)) return false;
  return row.hasLinkedOrder;
}

export function isShipmentMatchPanelRowConfirmed(row: ShipmentMatchPanelDisplayRow): boolean {
  return row.userConfirmationStatus === 'CONFIRMED';
}

export function isShipmentMatchPanelRowExcluded(row: ShipmentMatchPanelDisplayRow): boolean {
  return row.userConfirmationStatus === 'EXCLUDED';
}

export function canShowShipmentMatchExcludeButton(row: ShipmentMatchPanelDisplayRow): boolean {
  if (!row.matchId?.trim()) return false;
  if (row.userConfirmationStatus !== 'UNCONFIRMED') return false;
  return true;
}

export function canShowShipmentMatchLinkButton(row: ShipmentMatchPanelDisplayRow): boolean {
  if (!row.matchId?.trim()) return false;
  if (row.userConfirmationStatus !== 'UNCONFIRMED') return false;
  return LINKABLE_ALGORITHM_STATUSES.has(row.matchStatus);
}

export function isShipmentMatchPanelRowManuallyLinked(row: ShipmentMatchPanelDisplayRow): boolean {
  return row.userConfirmationStatus === 'MANUALLY_LINKED';
}

export function isShipmentMatchPanelBatchReady(
  viewState: Pick<ShipmentMatchPanelViewState, 'batchStatus'>,
): boolean {
  return viewState.batchStatus === SHIPMENT_UPLOAD_BATCH_READY_STATUS;
}

export function adaptShipmentUploadBatchDetailForUi(
  detail: ShipmentUploadBatchDetailResponse,
  context: {
    ordersLoadedCount: number;
    parseWarningCount?: number;
    ordersEmptyReason?: string | null;
    ordersBundle?: ShipmentMatchPanelViewState['ordersBundle'];
  },
): ShipmentMatchPanelViewState {
  return {
    uploadBatchId: detail.uploadBatch.id,
    batchStatus: detail.uploadBatch.status,
    batchProvider: detail.uploadBatch.provider ?? null,
    integrationAccountId: detail.uploadBatch.integrationAccountId ?? null,
    file: {
      name: detail.uploadBatch.originalFileName,
      size: detail.uploadBatch.fileSize,
    },
    parse: {
      rowCount: detail.uploadBatch.rowCount,
      warningCount: context.parseWarningCount ?? 0,
    },
    ordersLoadedCount: context.ordersLoadedCount,
    ordersEmptyReason: context.ordersEmptyReason ?? null,
    ordersBundle: context.ordersBundle ?? null,
    summary: detail.summary,
    displayRows: detail.rows.map(adaptShipmentUploadBatchDetailRowForDisplay),
  };
}

export function buildShipmentMatchPanelViewStateFromUpload(
  uploadBody: ShipmentUploadPersistSuccessResponse,
  detail: ShipmentUploadBatchDetailResponse,
): ShipmentMatchPanelViewState {
  return adaptShipmentUploadBatchDetailForUi(detail, {
    ordersLoadedCount: uploadBody.orders.loadedCount,
    parseWarningCount: uploadBody.parse.warningCount,
    ordersEmptyReason: uploadBody.orders.emptyReason,
    ordersBundle: uploadBody.orders.bundle,
  });
}

export function buildShipmentMatchPanelViewStateFromConfirmResponse(
  response: ConfirmShipmentUploadMatchSuccessResponse,
  previous: ShipmentMatchPanelViewState,
): ShipmentMatchPanelViewState {
  return adaptShipmentUploadBatchDetailForUi(
    {
      success: true,
      uploadBatch: response.uploadBatch,
      rows: response.rows,
      summary: response.summary,
    },
    {
      ordersLoadedCount: previous.ordersLoadedCount,
      parseWarningCount: previous.parse.warningCount,
      ordersEmptyReason: previous.ordersEmptyReason,
      ordersBundle: previous.ordersBundle,
    },
  );
}

export function buildShipmentMatchPanelViewStateFromExcludeResponse(
  response: ExcludeShipmentUploadMatchSuccessResponse,
  previous: ShipmentMatchPanelViewState,
): ShipmentMatchPanelViewState {
  return adaptShipmentUploadBatchDetailForUi(
    {
      success: true,
      uploadBatch: response.uploadBatch,
      rows: response.rows,
      summary: response.summary,
    },
    {
      ordersLoadedCount: previous.ordersLoadedCount,
      parseWarningCount: previous.parse.warningCount,
      ordersEmptyReason: previous.ordersEmptyReason,
      ordersBundle: previous.ordersBundle,
    },
  );
}

export function buildShipmentMatchPanelViewStateFromLinkResponse(
  response: LinkShipmentUploadMatchSuccessResponse,
  previous: ShipmentMatchPanelViewState,
): ShipmentMatchPanelViewState {
  return adaptShipmentUploadBatchDetailForUi(
    {
      success: true,
      uploadBatch: response.uploadBatch,
      rows: response.rows,
      summary: response.summary,
    },
    {
      ordersLoadedCount: previous.ordersLoadedCount,
      parseWarningCount: previous.parse.warningCount,
      ordersEmptyReason: previous.ordersEmptyReason,
      ordersBundle: previous.ordersBundle,
    },
  );
}

export function buildShipmentMatchPanelViewStateFromDetailResponse(
  response: ShipmentUploadBatchDetailResponse,
  previous: ShipmentMatchPanelViewState,
): ShipmentMatchPanelViewState {
  return adaptShipmentUploadBatchDetailForUi(response, {
    ordersLoadedCount: previous.ordersLoadedCount,
    parseWarningCount: previous.parse.warningCount,
    ordersEmptyReason: previous.ordersEmptyReason,
    ordersBundle: previous.ordersBundle,
  });
}
