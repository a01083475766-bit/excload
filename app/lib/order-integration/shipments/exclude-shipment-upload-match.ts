import type { ShipmentUserConfirmationStatus } from '@prisma/client';

import {
  loadShipmentUploadBatchDetail,
  type ShipmentUploadBatchDetailLoadClient,
  type ShipmentUploadBatchDetailResponse,
} from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { adaptShipmentUploadBatchDetailRowForDisplay } from '@/app/lib/order-integration/shipments/adapt-shipment-upload-batch-detail-for-ui';
import type { ShipmentMatchDisplayRow } from '@/app/lib/order-integration/shipments/shipment-match-ui';

type LoadedShipmentMatch = {
  id: string;
  uploadBatchId: string;
  uploadRowId: string;
  userId: string;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  excludedAt: Date | null;
  excludeReason: string | null;
};

export type ExcludeShipmentUploadMatchClient = ShipmentUploadBatchDetailLoadClient & {
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
        userConfirmationStatus: 'EXCLUDED';
        excludedAt: Date;
        excludeReason: string | null;
      };
    }) => Promise<LoadedShipmentMatch>;
  };
};

export type ExcludeShipmentUploadMatchSuccessResponse = {
  success: true;
  excludedMatchId: string;
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

export function isShipmentMatchAlreadyExcluded(
  status: ShipmentUserConfirmationStatus,
): boolean {
  return status === 'EXCLUDED';
}

export function evaluateShipmentMatchExcludeEligibility(match: {
  userConfirmationStatus: ShipmentUserConfirmationStatus;
}): { ok: true; idempotent: boolean } | { ok: false; error: string } {
  if (isShipmentMatchAlreadyExcluded(match.userConfirmationStatus)) {
    return { ok: true, idempotent: true };
  }

  if (match.userConfirmationStatus === 'CONFIRMED') {
    return { ok: false, error: '확정된 매칭은 제외할 수 없습니다.' };
  }

  if (
    match.userConfirmationStatus === 'MANUALLY_LINKED' ||
    match.userConfirmationStatus === 'EDITED'
  ) {
    return { ok: false, error: '이미 처리된 매칭입니다.' };
  }

  if (match.userConfirmationStatus !== 'UNCONFIRMED') {
    return { ok: false, error: '제외할 수 없는 매칭 상태입니다.' };
  }

  return { ok: true, idempotent: false };
}

function buildExcludedMatchResponse(
  detail: ShipmentUploadBatchDetailResponse,
  matchId: string,
): ExcludeShipmentUploadMatchSuccessResponse | null {
  const detailRow = detail.rows.find((row) => row.matchId === matchId);
  if (!detailRow) return null;

  const displayRow = adaptShipmentUploadBatchDetailRowForDisplay(detailRow);

  return {
    success: true,
    excludedMatchId: matchId,
    match: {
      ...displayRow,
      matchId,
      uploadRowId: detailRow.uploadRowId,
      userConfirmationStatus: detailRow.userConfirmationStatus ?? 'EXCLUDED',
      transmissionStatus: detailRow.transmissionStatus,
    },
    uploadBatch: detail.uploadBatch,
    rows: detail.rows,
    summary: detail.summary,
  };
}

export async function excludeShipmentUploadMatch(
  client: ExcludeShipmentUploadMatchClient,
  input: { userId: string; batchId: string; matchId: string; reason?: string | null },
): Promise<
  | { success: false; status: 400 | 404; error: string }
  | { success: true; body: ExcludeShipmentUploadMatchSuccessResponse }
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
      userConfirmationStatus: true,
      excludedAt: true,
      excludeReason: true,
    },
  });

  if (!match) {
    return { success: false, status: 404, error: '매칭 결과를 찾을 수 없습니다.' };
  }

  const eligibility = evaluateShipmentMatchExcludeEligibility(match);
  if (!eligibility.ok) {
    return { success: false, status: 400, error: eligibility.error };
  }

  if (!eligibility.idempotent) {
    const reason = input.reason?.trim() || null;
    await client.shipmentMatch.update({
      where: { id: match.id },
      data: {
        userConfirmationStatus: 'EXCLUDED',
        excludedAt: new Date(),
        excludeReason: reason,
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

  const body = buildExcludedMatchResponse(detailResult.body, match.id);
  if (!body) {
    return { success: false, status: 404, error: '매칭 결과를 찾을 수 없습니다.' };
  }

  return { success: true, body };
}
