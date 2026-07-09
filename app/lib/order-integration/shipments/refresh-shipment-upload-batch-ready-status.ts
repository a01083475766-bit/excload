import type {
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

export const COMPLETED_SHIPMENT_USER_CONFIRMATION_STATUSES: ReadonlySet<ShipmentUserConfirmationStatus> =
  new Set(['CONFIRMED', 'EXCLUDED', 'MANUALLY_LINKED', 'EDITED']);

export const SHIPMENT_UPLOAD_BATCH_READY_STATUS: ShipmentUploadBatchStatus = 'READY';

export type ShipmentUploadBatchReadinessEvaluation = {
  matchCount: number;
  unconfirmedCount: number;
  isComplete: boolean;
  shouldPromoteToReady: boolean;
};

export type RefreshShipmentUploadBatchReadyStatusClient = {
  shipmentUploadBatch: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: { id: true; status: true };
    }) => Promise<{ id: string; status: ShipmentUploadBatchStatus } | null>;
    update: (args: {
      where: { id: string };
      data: { status: ShipmentUploadBatchStatus };
    }) => Promise<{ id: string; status: ShipmentUploadBatchStatus }>;
  };
  shipmentMatch: {
    findMany: (args: {
      where: { uploadBatchId: string; userId: string };
      select: { userConfirmationStatus: true };
    }) => Promise<Array<{ userConfirmationStatus: ShipmentUserConfirmationStatus }>>;
  };
};

export type RefreshShipmentUploadBatchReadyStatusResult =
  | { success: false; status: 404; error: string }
  | {
      success: true;
      batchId: string;
      previousStatus: ShipmentUploadBatchStatus;
      currentStatus: ShipmentUploadBatchStatus;
      promoted: boolean;
      evaluation: ShipmentUploadBatchReadinessEvaluation;
    };

export function isShipmentMatchUserConfirmationComplete(
  status: ShipmentUserConfirmationStatus,
): boolean {
  return COMPLETED_SHIPMENT_USER_CONFIRMATION_STATUSES.has(status);
}

export function evaluateShipmentUploadBatchReadiness(input: {
  batchStatus: ShipmentUploadBatchStatus;
  matches: Array<{ userConfirmationStatus: ShipmentUserConfirmationStatus }>;
}): ShipmentUploadBatchReadinessEvaluation {
  const matchCount = input.matches.length;
  const unconfirmedCount = input.matches.filter(
    (match) => match.userConfirmationStatus === 'UNCONFIRMED',
  ).length;

  const isComplete =
    matchCount >= 1 &&
    input.matches.every((match) =>
      isShipmentMatchUserConfirmationComplete(match.userConfirmationStatus),
    );

  const shouldPromoteToReady =
    isComplete &&
    input.batchStatus !== SHIPMENT_UPLOAD_BATCH_READY_STATUS &&
    input.batchStatus !== 'CANCELLED';

  return {
    matchCount,
    unconfirmedCount,
    isComplete,
    shouldPromoteToReady,
  };
}

export async function refreshShipmentUploadBatchReadyStatus(
  client: RefreshShipmentUploadBatchReadyStatusClient,
  input: { userId: string; batchId: string },
): Promise<RefreshShipmentUploadBatchReadyStatusResult> {
  const batch = await client.shipmentUploadBatch.findFirst({
    where: {
      id: input.batchId,
      userId: input.userId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!batch) {
    return { success: false, status: 404, error: '업로드 배치를 찾을 수 없습니다.' };
  }

  const matches = await client.shipmentMatch.findMany({
    where: {
      uploadBatchId: input.batchId,
      userId: input.userId,
    },
    select: {
      userConfirmationStatus: true,
    },
  });

  const evaluation = evaluateShipmentUploadBatchReadiness({
    batchStatus: batch.status,
    matches,
  });

  if (!evaluation.shouldPromoteToReady) {
    return {
      success: true,
      batchId: batch.id,
      previousStatus: batch.status,
      currentStatus: batch.status,
      promoted: false,
      evaluation,
    };
  }

  const updated = await client.shipmentUploadBatch.update({
    where: { id: batch.id },
    data: { status: SHIPMENT_UPLOAD_BATCH_READY_STATUS },
  });

  return {
    success: true,
    batchId: updated.id,
    previousStatus: batch.status,
    currentStatus: updated.status,
    promoted: true,
    evaluation,
  };
}
