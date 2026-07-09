import type {
  ShipmentUploadBatchDetailResponse,
  ShipmentUploadBatchDetailRow,
} from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import type {
  ShipmentMatchDisplayRow,
  ShipmentMatchSummaryCounts,
} from '@/app/lib/order-integration/shipments/shipment-match-ui';
import type { ShipmentMatchStatus } from '@/app/lib/order-integration/shipments/types';
import type { ShipmentUploadPersistSuccessResponse } from '@/app/lib/order-integration/shipments/upload-and-persist-shipment-file';

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
  displayRows: ShipmentMatchDisplayRow[];
};

export function toShipmentMatchStatus(
  value: ShipmentUploadBatchDetailRow['algorithmMatchStatus'],
): ShipmentMatchStatus {
  if (!value) return 'NOT_MATCHED';
  return value as ShipmentMatchStatus;
}

export function adaptShipmentUploadBatchDetailRowForDisplay(
  row: ShipmentUploadBatchDetailRow,
): ShipmentMatchDisplayRow {
  return {
    shipmentRowIndex: row.originalRowIndex,
    matchStatus: toShipmentMatchStatus(row.algorithmMatchStatus),
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
  };
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
