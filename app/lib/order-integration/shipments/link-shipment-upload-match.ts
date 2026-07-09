import type {
  OrderIntegrationProvider,
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

type LoadedShipmentMatch = {
  id: string;
  uploadBatchId: string;
  uploadRowId: string;
  userId: string;
  orderSyncOrderId: string | null;
  algorithmMatchStatus: ShipmentAlgorithmMatchStatus;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
};

type LoadedShipmentUploadBatch = {
  id: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
};

type LoadedOrderSyncOrder = {
  id: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
};

export type LinkShipmentUploadMatchClient = ShipmentUploadBatchDetailLoadClient & {
  shipmentUploadBatch: ShipmentUploadBatchDetailLoadClient['shipmentUploadBatch'] & {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: { id: true; provider: true; integrationAccountId: true };
    }) => Promise<LoadedShipmentUploadBatch | null>;
  };
  shipmentMatch: {
    findFirst: (args: {
      where: { id: string; uploadBatchId: string; userId: string };
      select: Record<string, boolean>;
    }) => Promise<LoadedShipmentMatch | null>;
    update: (args: {
      where: { id: string };
      data: {
        orderSyncOrderId: string;
        userConfirmationStatus: 'MANUALLY_LINKED';
        provider: OrderIntegrationProvider;
        integrationAccountId: string | null;
      };
    }) => Promise<LoadedShipmentMatch>;
  };
  orderSyncOrder: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: { id: true; provider: true; integrationAccountId: true };
    }) => Promise<LoadedOrderSyncOrder | null>;
  };
};

export type LinkShipmentUploadMatchSuccessResponse = {
  success: true;
  linkedMatchId: string;
  orderSyncOrderId: string;
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

export function validateShipmentMatchLinkOrderSyncOrderId(
  orderSyncOrderId: unknown,
): string | { error: string } {
  const trimmed = String(orderSyncOrderId ?? '').trim();
  if (!trimmed) {
    return { error: 'orderSyncOrderId가 필요합니다.' };
  }
  if (trimmed.length > 128) {
    return { error: '유효하지 않은 orderSyncOrderId입니다.' };
  }
  return trimmed;
}

export function validateShipmentMatchLinkOrderScope(input: {
  batchProvider: OrderIntegrationProvider | null;
  batchIntegrationAccountId: string | null;
  orderProvider: OrderIntegrationProvider;
  orderIntegrationAccountId: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (input.batchProvider && input.orderProvider !== input.batchProvider) {
    return { ok: false, error: '배치 범위와 일치하지 않는 주문입니다.' };
  }

  if (
    input.batchIntegrationAccountId &&
    input.orderIntegrationAccountId &&
    input.orderIntegrationAccountId !== input.batchIntegrationAccountId
  ) {
    return { ok: false, error: '배치 범위와 일치하지 않는 주문입니다.' };
  }

  return { ok: true };
}

export function evaluateShipmentMatchLinkEligibility(input: {
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  currentOrderSyncOrderId: string | null;
  targetOrderSyncOrderId: string;
}): { ok: true; idempotent: boolean } | { ok: false; error: string } {
  if (input.userConfirmationStatus === 'MANUALLY_LINKED') {
    const currentOrderId = input.currentOrderSyncOrderId?.trim();
    if (currentOrderId === input.targetOrderSyncOrderId) {
      return { ok: true, idempotent: true };
    }
    return { ok: false, error: '이미 다른 주문에 연결된 매칭입니다.' };
  }

  if (input.userConfirmationStatus === 'CONFIRMED') {
    return { ok: false, error: '확정된 매칭은 수동 연결할 수 없습니다.' };
  }

  if (input.userConfirmationStatus === 'EXCLUDED') {
    return { ok: false, error: '제외된 매칭은 수동 연결할 수 없습니다.' };
  }

  if (input.userConfirmationStatus === 'EDITED') {
    return { ok: false, error: '이미 처리된 매칭입니다.' };
  }

  if (input.userConfirmationStatus !== 'UNCONFIRMED') {
    return { ok: false, error: '수동 연결할 수 없는 매칭 상태입니다.' };
  }

  return { ok: true, idempotent: false };
}

function buildLinkedMatchResponse(
  detail: ShipmentUploadBatchDetailResponse,
  matchId: string,
  orderSyncOrderId: string,
): LinkShipmentUploadMatchSuccessResponse | null {
  const detailRow = detail.rows.find((row) => row.matchId === matchId);
  if (!detailRow) return null;

  const displayRow = adaptShipmentUploadBatchDetailRowForDisplay(detailRow);

  return {
    success: true,
    linkedMatchId: matchId,
    orderSyncOrderId,
    match: {
      ...displayRow,
      matchId,
      uploadRowId: detailRow.uploadRowId,
      userConfirmationStatus: detailRow.userConfirmationStatus ?? 'MANUALLY_LINKED',
      transmissionStatus: detailRow.transmissionStatus,
    },
    uploadBatch: detail.uploadBatch,
    rows: detail.rows,
    summary: detail.summary,
  };
}

export async function linkShipmentUploadMatch(
  client: LinkShipmentUploadMatchClient,
  input: { userId: string; batchId: string; matchId: string; orderSyncOrderId: string },
): Promise<
  | { success: false; status: 400 | 404; error: string }
  | { success: true; body: LinkShipmentUploadMatchSuccessResponse }
> {
  const batch = await client.shipmentUploadBatch.findFirst({
    where: {
      id: input.batchId,
      userId: input.userId,
    },
    select: {
      id: true,
      provider: true,
      integrationAccountId: true,
    },
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
    },
  });

  if (!match) {
    return { success: false, status: 404, error: '매칭 결과를 찾을 수 없습니다.' };
  }

  const eligibility = evaluateShipmentMatchLinkEligibility({
    userConfirmationStatus: match.userConfirmationStatus,
    currentOrderSyncOrderId: match.orderSyncOrderId,
    targetOrderSyncOrderId: input.orderSyncOrderId,
  });
  if (!eligibility.ok) {
    return { success: false, status: 400, error: eligibility.error };
  }

  const order = await client.orderSyncOrder.findFirst({
    where: {
      id: input.orderSyncOrderId,
      userId: input.userId,
    },
    select: {
      id: true,
      provider: true,
      integrationAccountId: true,
    },
  });

  if (!order) {
    return { success: false, status: 404, error: '연결할 주문을 찾을 수 없습니다.' };
  }

  const scopeResult = validateShipmentMatchLinkOrderScope({
    batchProvider: batch.provider,
    batchIntegrationAccountId: batch.integrationAccountId,
    orderProvider: order.provider,
    orderIntegrationAccountId: order.integrationAccountId,
  });
  if (!scopeResult.ok) {
    return { success: false, status: 400, error: scopeResult.error };
  }

  if (!eligibility.idempotent) {
    await client.shipmentMatch.update({
      where: { id: match.id },
      data: {
        orderSyncOrderId: order.id,
        userConfirmationStatus: 'MANUALLY_LINKED',
        provider: order.provider,
        integrationAccountId: order.integrationAccountId,
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

  const body = buildLinkedMatchResponse(detailResult.body, match.id, order.id);
  if (!body) {
    return { success: false, status: 404, error: '매칭 결과를 찾을 수 없습니다.' };
  }

  return { success: true, body };
}
