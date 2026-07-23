import type {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentAlgorithmMatchStatus,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

import {
  maskShipmentAddress,
  maskShipmentPhone,
  maskShipmentTrackingNumber,
  resolveProviderLabel,
  type ShipmentMatchSummaryCounts,
} from '@/app/lib/order-integration/shipments/shipment-match-ui';

export type ShipmentUploadBatchDetailRow = {
  uploadRowId: string;
  matchId: string | null;
  originalRowIndex: number;
  algorithmMatchStatus: ShipmentAlgorithmMatchStatus | null;
  userConfirmationStatus: ShipmentUserConfirmationStatus | null;
  transmissionStatus: OrderSyncTransmissionStatus | null;
  provider: string | null;
  excloadOrderNo: string | null;
  mallOrderNo: string | null;
  receiverName: string | null;
  receiverPhoneMasked: string | null;
  receiverAddressMasked: string | null;
  trackingNumberMasked: string | null;
  trackingNumberValue: string | null;
  productSummary: string | null;
  carrierName: string | null;
  carrierCode: string | null;
  transmissionErrorMessage: string | null;
  matchReason: string | null;
  matchScore: number | null;
  /** 주문조회·저장 시점 remainQuantity. 없으면 null */
  remainQuantity: number | null;
  /** 서버가 원문 송장 존재 여부만 계산. 원문은 노출하지 않음 */
  hasTrackingNumber: boolean;
  /**
   * Dry-run eligibility와 동일: match → order.
   * 배치 값은 포함하지 않음(확인창에서 배치와 합쳐 해석).
   */
  integrationAccountId: string | null;
};

export type ShipmentUploadBatchDetailResponse = {
  success: true;
  uploadBatch: {
    id: string;
    provider: string | null;
    integrationAccountId: string | null;
    originalFileName: string;
    fileSize: number;
    fileType: string | null;
    rowCount: number;
    matchedConfidentCount: number;
    matchedWarningCount: number;
    multipleCandidatesCount: number;
    notMatchedCount: number;
    duplicateTrackingNumberCount: number;
    alreadyShippedCount: number;
    cancelledOrInvalidOrderCount: number;
    status: ShipmentUploadBatchStatus;
    createdAt: string;
  };
  rows: ShipmentUploadBatchDetailRow[];
  summary: ShipmentMatchSummaryCounts;
};

type LoadedOrderSyncOrder = {
  id: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  excloadOrderNo: string;
  mallOrderNo: string;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  productSummary: string | null;
  remainQuantity: number | null;
};

type LoadedShipmentMatch = {
  id: string;
  algorithmMatchStatus: ShipmentAlgorithmMatchStatus;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  transmissionStatus: OrderSyncTransmissionStatus;
  transmissionErrorMessage: string | null;
  finalTrackingNumber: string | null;
  finalCarrierCode: string | null;
  finalCarrierName: string | null;
  matchScore: number;
  matchReason: string | null;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  orderSyncOrder: LoadedOrderSyncOrder | null;
};

type LoadedShipmentUploadRow = {
  id: string;
  originalRowIndex: number;
  trackingNumber: string;
  carrierName: string | null;
  carrierCode: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  mallOrderNo: string | null;
  excloadOrderNo: string | null;
  productText: string | null;
  match: LoadedShipmentMatch | null;
};

type LoadedShipmentUploadBatch = {
  id: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  originalFileName: string;
  fileSize: number;
  fileType: string | null;
  rowCount: number;
  matchedConfidentCount: number;
  matchedWarningCount: number;
  multipleCandidatesCount: number;
  notMatchedCount: number;
  duplicateTrackingNumberCount: number;
  alreadyShippedCount: number;
  cancelledOrInvalidOrderCount: number;
  status: ShipmentUploadBatchStatus;
  createdAt: Date;
};

export type ShipmentUploadBatchDetailLoadClient = {
  shipmentUploadBatch: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: Record<string, boolean>;
    }) => Promise<LoadedShipmentUploadBatch | null>;
  };
  shipmentUploadRow: {
    findMany: (args: {
      where: { uploadBatchId: string; userId: string };
      orderBy: { originalRowIndex: 'asc' };
      select: Record<string, unknown>;
    }) => Promise<LoadedShipmentUploadRow[]>;
  };
};

export function validateShipmentUploadBatchId(
  batchId: string | undefined | null,
): string | { error: string } {
  const trimmed = String(batchId ?? '').trim();
  if (!trimmed) {
    return { error: 'batchId가 필요합니다.' };
  }
  if (trimmed.length > 128) {
    return { error: '유효하지 않은 batchId입니다.' };
  }
  return trimmed;
}

function buildSummaryFromBatch(batch: LoadedShipmentUploadBatch): ShipmentMatchSummaryCounts {
  return {
    totalRows: batch.rowCount,
    matchedConfidentCount: batch.matchedConfidentCount,
    matchedWarningCount: batch.matchedWarningCount,
    multipleCandidatesCount: batch.multipleCandidatesCount,
    notMatchedCount: batch.notMatchedCount,
    duplicateTrackingNumberCount: batch.duplicateTrackingNumberCount,
    alreadyShippedCount: batch.alreadyShippedCount,
    cancelledOrInvalidOrderCount: batch.cancelledOrInvalidOrderCount,
  };
}

function resolveProviderForRow(
  match: LoadedShipmentMatch | null,
  batchProvider: OrderIntegrationProvider | null,
): string | null {
  const provider =
    match?.orderSyncOrder?.provider ?? match?.provider ?? batchProvider ?? null;
  return resolveProviderLabel(provider);
}

export function mapShipmentUploadBatchDetailRow(input: {
  row: LoadedShipmentUploadRow;
  batchProvider: OrderIntegrationProvider | null;
}): ShipmentUploadBatchDetailRow {
  const { row, batchProvider } = input;
  const match = row.match;
  const order = match?.orderSyncOrder ?? null;

  const receiverPhone = order?.receiverPhone ?? row.receiverPhone;
  const receiverAddress = order?.receiverAddress ?? row.receiverAddress;
  const productSummary = order?.productSummary ?? row.productText;
  const trackingRaw =
    match?.finalTrackingNumber?.trim() || row.trackingNumber?.trim() || '';

  return {
    uploadRowId: row.id,
    matchId: match?.id ?? null,
    originalRowIndex: row.originalRowIndex,
    algorithmMatchStatus: match?.algorithmMatchStatus ?? null,
    userConfirmationStatus: match?.userConfirmationStatus ?? null,
    transmissionStatus: match?.transmissionStatus ?? null,
    provider: resolveProviderForRow(match, batchProvider),
    excloadOrderNo: order?.excloadOrderNo ?? row.excloadOrderNo,
    mallOrderNo: order?.mallOrderNo ?? row.mallOrderNo,
    receiverName: order?.receiverName ?? row.receiverName,
    receiverPhoneMasked: maskShipmentPhone(receiverPhone),
    receiverAddressMasked: maskShipmentAddress(receiverAddress),
    trackingNumberMasked: maskShipmentTrackingNumber(
      match?.finalTrackingNumber?.trim() || row.trackingNumber,
    ),
    trackingNumberValue: null,
    productSummary: productSummary?.trim() || null,
    carrierName: match?.finalCarrierName?.trim() || row.carrierName?.trim() || null,
    carrierCode: match?.finalCarrierCode?.trim() || row.carrierCode?.trim() || null,
    transmissionErrorMessage: match?.transmissionErrorMessage ?? null,
    matchReason: match?.matchReason ?? null,
    matchScore: match?.matchScore ?? null,
    remainQuantity:
      typeof order?.remainQuantity === 'number' && Number.isFinite(order.remainQuantity)
        ? order.remainQuantity
        : null,
    hasTrackingNumber: trackingRaw.length > 0,
    integrationAccountId:
      match?.integrationAccountId?.trim() ||
      order?.integrationAccountId?.trim() ||
      null,
  };
}

export async function loadShipmentUploadBatchDetail(
  client: ShipmentUploadBatchDetailLoadClient,
  input: { userId: string; batchId: string },
): Promise<
  | { success: false; status: 404; error: string }
  | { success: true; body: ShipmentUploadBatchDetailResponse }
> {
  if (!input.userId.trim()) {
    return { success: false, status: 404, error: '업로드 배치를 찾을 수 없습니다.' };
  }

  const batch = await client.shipmentUploadBatch.findFirst({
    where: {
      id: input.batchId,
      userId: input.userId,
    },
    select: {
      id: true,
      provider: true,
      integrationAccountId: true,
      originalFileName: true,
      fileSize: true,
      fileType: true,
      rowCount: true,
      matchedConfidentCount: true,
      matchedWarningCount: true,
      multipleCandidatesCount: true,
      notMatchedCount: true,
      duplicateTrackingNumberCount: true,
      alreadyShippedCount: true,
      cancelledOrInvalidOrderCount: true,
      status: true,
      createdAt: true,
    },
  });

  if (!batch) {
    return { success: false, status: 404, error: '업로드 배치를 찾을 수 없습니다.' };
  }

  const rows = await client.shipmentUploadRow.findMany({
    where: {
      uploadBatchId: input.batchId,
      userId: input.userId,
    },
    orderBy: { originalRowIndex: 'asc' },
    select: {
      id: true,
      originalRowIndex: true,
      trackingNumber: true,
      carrierName: true,
      carrierCode: true,
      receiverName: true,
      receiverPhone: true,
      receiverAddress: true,
      mallOrderNo: true,
      excloadOrderNo: true,
      productText: true,
      match: {
        select: {
          id: true,
          algorithmMatchStatus: true,
          userConfirmationStatus: true,
          transmissionStatus: true,
          transmissionErrorMessage: true,
          finalTrackingNumber: true,
          finalCarrierCode: true,
          finalCarrierName: true,
          matchScore: true,
          matchReason: true,
          provider: true,
          integrationAccountId: true,
          orderSyncOrder: {
            select: {
              id: true,
              provider: true,
              integrationAccountId: true,
              excloadOrderNo: true,
              mallOrderNo: true,
              receiverName: true,
              receiverPhone: true,
              receiverAddress: true,
              productSummary: true,
              remainQuantity: true,
            },
          },
        },
      },
    },
  });

  return {
    success: true,
    body: {
      success: true,
      uploadBatch: {
        id: batch.id,
        provider: batch.provider,
        integrationAccountId: batch.integrationAccountId,
        originalFileName: batch.originalFileName,
        fileSize: batch.fileSize,
        fileType: batch.fileType,
        rowCount: batch.rowCount,
        matchedConfidentCount: batch.matchedConfidentCount,
        matchedWarningCount: batch.matchedWarningCount,
        multipleCandidatesCount: batch.multipleCandidatesCount,
        notMatchedCount: batch.notMatchedCount,
        duplicateTrackingNumberCount: batch.duplicateTrackingNumberCount,
        alreadyShippedCount: batch.alreadyShippedCount,
        cancelledOrInvalidOrderCount: batch.cancelledOrInvalidOrderCount,
        status: batch.status,
        createdAt: batch.createdAt.toISOString(),
      },
      rows: rows.map((row) =>
        mapShipmentUploadBatchDetailRow({
          row,
          batchProvider: batch.provider,
        }),
      ),
      summary: buildSummaryFromBatch(batch),
    },
  };
}
