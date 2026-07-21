/**
 * 전송 완료 후 수취인 PII 제거 — OrderSyncOrder + 연관 업로드 행·매칭 후보 JSON.
 */

import { ORDER_SYNC_ORDER_PII_CLEAR_DATA } from '@/app/lib/order-integration/snapshots/clear-order-sync-order-pii';
import {
  SHIPMENT_MATCH_PII_CLEAR_DATA,
  SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA,
} from '@/app/lib/order-integration/snapshots/scrub-linked-shipment-pii';
import { isOrderFullyTransmittedForPiiClear } from '@/app/lib/order-integration/transmission/order-status-summary';

export type ClearTransmittedOrderPiiClient = {
  shipmentMatch: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }) => Promise<
      Array<{
        id: string;
        uploadRowId: string;
        transmissionStatus: string;
      }>
    >;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  shipmentUploadRow?: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  shipmentTransmissionAttempt?: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  orderSyncOrder: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

export type ClearTransmittedOrderPiiResult = {
  clearedOrder: boolean;
  clearedUploadRows: number;
  clearedMatches: number;
  clearedAttempts: number;
  skippedIncomplete: boolean;
};

/**
 * 주문에 연결된 Match가 모두 SENT|SKIPPED 일 때만 PII를 지웁니다.
 */
export async function clearTransmittedOrderPiiIfComplete(
  client: ClearTransmittedOrderPiiClient,
  input: { userId: string; orderSyncOrderId: string; now?: Date },
): Promise<ClearTransmittedOrderPiiResult> {
  const now = input.now ?? new Date();
  const matches = await client.shipmentMatch.findMany({
    where: {
      userId: input.userId,
      orderSyncOrderId: input.orderSyncOrderId,
    },
    select: {
      id: true,
      uploadRowId: true,
      transmissionStatus: true,
    },
  });

  if (!isOrderFullyTransmittedForPiiClear(matches.map((m) => m.transmissionStatus))) {
    return {
      clearedOrder: false,
      clearedUploadRows: 0,
      clearedMatches: 0,
      clearedAttempts: 0,
      skippedIncomplete: true,
    };
  }

  const orderUpdated = await client.orderSyncOrder.updateMany({
    where: {
      id: input.orderSyncOrderId,
      userId: input.userId,
      piiClearedAt: null,
    },
    data: {
      ...ORDER_SYNC_ORDER_PII_CLEAR_DATA,
      piiClearedAt: now,
    },
  });

  const matchIds = matches.map((m) => m.id);
  const rowIds = [...new Set(matches.map((m) => m.uploadRowId))];

  let clearedMatches = 0;
  if (matchIds.length > 0) {
    const matchResult = await client.shipmentMatch.updateMany({
      where: {
        id: { in: matchIds },
        userId: input.userId,
      },
      data: { ...SHIPMENT_MATCH_PII_CLEAR_DATA },
    });
    clearedMatches = matchResult.count;
  }

  let clearedUploadRows = 0;
  if (rowIds.length > 0 && client.shipmentUploadRow) {
    const rowResult = await client.shipmentUploadRow.updateMany({
      where: {
        id: { in: rowIds },
        userId: input.userId,
      },
      data: { ...SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA },
    });
    clearedUploadRows = rowResult.count;
  }

  let clearedAttempts = 0;
  if (matchIds.length > 0 && client.shipmentTransmissionAttempt) {
    const attemptResult = await client.shipmentTransmissionAttempt.updateMany({
      where: {
        shipmentMatchId: { in: matchIds },
        userId: input.userId,
        status: 'SUCCESS',
      },
      data: {
        responseSummaryJson: null,
      },
    });
    clearedAttempts = attemptResult.count;
  }

  return {
    clearedOrder: orderUpdated.count === 1,
    clearedUploadRows,
    clearedMatches,
    clearedAttempts,
    skippedIncomplete: false,
  };
}
