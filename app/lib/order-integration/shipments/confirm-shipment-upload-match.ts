import type {
  ShipmentAlgorithmMatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

import {
  loadShipmentUploadBatchDetail,
  type ShipmentUploadBatchDetailLoadClient,
  type ShipmentUploadBatchDetailResponse,
} from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { adaptShipmentUploadBatchDetailRowForDisplay } from '@/app/lib/order-integration/shipments/adapt-shipment-upload-batch-detail-for-ui';
import type { ShipmentMatchDisplayRow } from '@/app/lib/order-integration/shipments/shipment-match-ui';

export const CONFIRMABLE_ALGORITHM_STATUSES: ReadonlySet<ShipmentAlgorithmMatchStatus> =
  new Set(['MATCHED_CONFIDENT', 'MATCHED_WARNING']);

export const NON_CONFIRMABLE_ALGORITHM_STATUSES: ReadonlySet<ShipmentAlgorithmMatchStatus> =
  new Set([
    'NOT_MATCHED',
    'MULTIPLE_CANDIDATES',
    'DUPLICATE_TRACKING_NUMBER',
    'ALREADY_SHIPPED',
    'CANCELLED_OR_INVALID_ORDER',
  ]);

type LoadedShipmentMatch = {
  id: string;
  uploadBatchId: string;
  uploadRowId: string;
  userId: string;
  orderSyncOrderId: string | null;
  algorithmMatchStatus: ShipmentAlgorithmMatchStatus;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  confirmedAt: Date | null;
  confirmedByUserId: string | null;
};

export type ConfirmShipmentUploadMatchClient = ShipmentUploadBatchDetailLoadClient & {
  shipmentUploadBatch: ShipmentUploadBatchDetailLoadClient['shipmentUploadBatch'] & {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  shipmentMatch: {
    findFirst: (args: {
      where: { id: string; uploadBatchId: string; userId: string };
      select: Record<string, boolean>;
    }) => Promise<LoadedShipmentMatch | null>;
    update: (args: {
      where: { id: string };
      data: {
        userConfirmationStatus: 'CONFIRMED';
        confirmedAt: Date;
        confirmedByUserId: string;
      };
    }) => Promise<LoadedShipmentMatch>;
  };
  orderSyncOrder: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

export type ConfirmShipmentUploadMatchSuccessResponse = {
  success: true;
  confirmedMatchId: string;
  match: ShipmentMatchDisplayRow & {
    matchId: string;
    uploadRowId: string;
    userConfirmationStatus: ShipmentUserConfirmationStatus;
    transmissionStatus: string | null;
  };
  uploadBatch: ShipmentUploadBatchDetailResponse['uploadBatch'];
  rows: ShipmentUploadBatchDetailResponse['rows'];
  summary: ShipmentUploadBatchDetailResponse['summary'];
};

export function validateShipmentUploadMatchId(
  matchId: string | undefined | null,
): string | { error: string } {
  const trimmed = String(matchId ?? '').trim();
  if (!trimmed) {
    return { error: 'matchId가 필요합니다.' };
  }
  if (trimmed.length > 128) {
    return { error: '유효하지 않은 matchId입니다.' };
  }
  return trimmed;
}

export function isShipmentMatchAlreadyConfirmed(
  status: ShipmentUserConfirmationStatus,
): boolean {
  return status === 'CONFIRMED';
}

export function evaluateShipmentMatchConfirmEligibility(match: {
  algorithmMatchStatus: ShipmentAlgorithmMatchStatus;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  orderSyncOrderId: string | null;
}): { ok: true; idempotent: boolean } | { ok: false; error: string } {
  if (isShipmentMatchAlreadyConfirmed(match.userConfirmationStatus)) {
    return { ok: true, idempotent: true };
  }

  if (match.userConfirmationStatus === 'EXCLUDED') {
    return { ok: false, error: '제외된 매칭은 확정할 수 없습니다.' };
  }

  if (
    match.userConfirmationStatus === 'MANUALLY_LINKED' ||
    match.userConfirmationStatus === 'EDITED'
  ) {
    return { ok: false, error: '이미 처리된 매칭입니다.' };
  }

  if (NON_CONFIRMABLE_ALGORITHM_STATUSES.has(match.algorithmMatchStatus)) {
    return { ok: false, error: '이 알고리즘 매칭 상태는 확정할 수 없습니다.' };
  }

  if (!CONFIRMABLE_ALGORITHM_STATUSES.has(match.algorithmMatchStatus)) {
    return { ok: false, error: '확정할 수 없는 매칭 상태입니다.' };
  }

  if (!match.orderSyncOrderId?.trim()) {
    return { ok: false, error: '연결된 주문이 없어 확정할 수 없습니다.' };
  }

  return { ok: true, idempotent: false };
}

function buildConfirmedMatchResponse(
  detail: ShipmentUploadBatchDetailResponse,
  matchId: string,
): ConfirmShipmentUploadMatchSuccessResponse | null {
  const detailRow = detail.rows.find((row) => row.matchId === matchId);
  if (!detailRow) return null;

  const displayRow = adaptShipmentUploadBatchDetailRowForDisplay(detailRow);

  return {
    success: true,
    confirmedMatchId: matchId,
    match: {
      ...displayRow,
      matchId,
      uploadRowId: detailRow.uploadRowId,
      userConfirmationStatus: detailRow.userConfirmationStatus ?? 'CONFIRMED',
      transmissionStatus: detailRow.transmissionStatus,
    },
    uploadBatch: detail.uploadBatch,
    rows: detail.rows,
    summary: detail.summary,
  };
}

export async function confirmShipmentUploadMatch(
  client: ConfirmShipmentUploadMatchClient,
  input: { userId: string; batchId: string; matchId: string },
): Promise<
  | { success: false; status: 400 | 404; error: string }
  | { success: true; body: ConfirmShipmentUploadMatchSuccessResponse }
> {
  const batch = await client.shipmentUploadBatch.findFirst({
    where: {
      id: input.batchId,
      userId: input.userId,
    },
    select: { id: true },
  });

  if (!batch) {
    return { success: false, status: 404, error: '업로드 배치를 찾을 수 없습니다.' };
  }

  const match = await client.shipmentMatch.findFirst({
    where: {
      id: input.matchId,
      uploadBatchId: input.batchId,
      userId: input.userId,
    },
    select: {
      id: true,
      uploadBatchId: true,
      uploadRowId: true,
      userId: true,
      orderSyncOrderId: true,
      algorithmMatchStatus: true,
      userConfirmationStatus: true,
      confirmedAt: true,
      confirmedByUserId: true,
    },
  });

  if (!match) {
    return { success: false, status: 404, error: '매칭 결과를 찾을 수 없습니다.' };
  }

  const eligibility = evaluateShipmentMatchConfirmEligibility(match);
  if (!eligibility.ok) {
    return { success: false, status: 400, error: eligibility.error };
  }

  const linkedOrderId = match.orderSyncOrderId?.trim();
  if (!linkedOrderId) {
    return { success: false, status: 400, error: '연결된 주문이 없어 확정할 수 없습니다.' };
  }

  const linkedOrder = await client.orderSyncOrder.findFirst({
    where: {
      id: linkedOrderId,
      userId: input.userId,
    },
    select: { id: true },
  });

  if (!linkedOrder) {
    return { success: false, status: 404, error: '매칭 결과를 찾을 수 없습니다.' };
  }

  if (!eligibility.idempotent) {
    await client.shipmentMatch.update({
      where: { id: match.id },
      data: {
        userConfirmationStatus: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedByUserId: input.userId,
      },
    });
  }

  const detailResult = await loadShipmentUploadBatchDetail(client, {
    userId: input.userId,
    batchId: input.batchId,
  });

  if (!detailResult.success) {
    return { success: false, status: 404, error: detailResult.error };
  }

  const body = buildConfirmedMatchResponse(detailResult.body, match.id);
  if (!body) {
    return { success: false, status: 404, error: '매칭 결과를 찾을 수 없습니다.' };
  }

  return { success: true, body };
}
