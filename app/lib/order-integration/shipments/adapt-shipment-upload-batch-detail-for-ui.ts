import type { ShipmentUserConfirmationStatus } from '@prisma/client';

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

export const LINKABLE_ALGORITHM_STATUSES: ReadonlySet<ShipmentMatchStatus> = new Set([
  'NOT_MATCHED',
  'MULTIPLE_CANDIDATES',
  'MATCHED_WARNING',
]);

export type ShipmentMatchPanelDisplayRow = ShipmentMatchDisplayRow & {
  matchId: string | null;
  userConfirmationStatus: ShipmentUserConfirmationStatus | null;
  hasLinkedOrder: boolean;
};

export type ShipmentMatchPanelViewState = {
  uploadBatchId: string;
  file: {
    name: string;
    size: number;
  };
  parse: {
    rowCount: number;
    warningCount: number;
  };
  ordersLoadedCount: number;
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
    matchId: row.matchId,
    userConfirmationStatus: row.userConfirmationStatus,
    hasLinkedOrder,
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

export function adaptShipmentUploadBatchDetailForUi(
  detail: ShipmentUploadBatchDetailResponse,
  context: {
    ordersLoadedCount: number;
    parseWarningCount?: number;
  },
): ShipmentMatchPanelViewState {
  return {
    uploadBatchId: detail.uploadBatch.id,
    file: {
      name: detail.uploadBatch.originalFileName,
      size: detail.uploadBatch.fileSize,
    },
    parse: {
      rowCount: detail.uploadBatch.rowCount,
      warningCount: context.parseWarningCount ?? 0,
    },
    ordersLoadedCount: context.ordersLoadedCount,
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
    },
  );
}
