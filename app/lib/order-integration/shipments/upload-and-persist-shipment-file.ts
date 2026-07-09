import type { OrderIntegrationProvider } from '@prisma/client';

import { loadOrderSyncSnapshotsForMatching } from '@/app/lib/order-integration/snapshots/load-order-sync-snapshots-for-matching';
import type { OrderSyncSnapshotLoadClient } from '@/app/lib/order-integration/snapshots/types';
import {
  DEFAULT_SHIPMENT_MATCH_ORDER_SNAPSHOT_LIMIT,
  matchUploadedShipmentFile,
  parseUploadedShipmentFile,
  type ShipmentMatchUploadScope,
  type ShipmentMatchUploadSuccessResponse,
  type UploadedShipmentFileInput,
} from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import {
  buildPersistShipmentUploadBatchInputFromMatchBody,
  persistShipmentUploadBatch,
  type ShipmentUploadPersistPrismaClient,
} from '@/app/lib/order-integration/shipments/persist-shipment-upload-batch';

export type ShipmentUploadPersistSuccessResponse = {
  success: true;
  uploadBatch: {
    id: string;
    rowCount: number;
    matchCount: number;
  };
  file: ShipmentMatchUploadSuccessResponse['file'];
  parse: ShipmentMatchUploadSuccessResponse['parse'];
  orders: ShipmentMatchUploadSuccessResponse['orders'];
  match: ShipmentMatchUploadSuccessResponse['match'];
};

export async function uploadAndPersistShipmentFile(input: {
  file: UploadedShipmentFileInput;
  scope: ShipmentMatchUploadScope;
  snapshotClient: OrderSyncSnapshotLoadClient;
  persistClient: ShipmentUploadPersistPrismaClient;
  orderSnapshotLimit?: number;
  fileHash?: string | null;
  matchUploadedShipmentFileFn?: typeof matchUploadedShipmentFile;
  loadSnapshots?: typeof loadOrderSyncSnapshotsForMatching;
  persistShipmentUploadBatchFn?: typeof persistShipmentUploadBatch;
}): Promise<
  | { success: false; status: number; error: string }
  | { success: true; body: ShipmentUploadPersistSuccessResponse }
> {
  const matchFn = input.matchUploadedShipmentFileFn ?? matchUploadedShipmentFile;
  const loadSnapshots = input.loadSnapshots ?? loadOrderSyncSnapshotsForMatching;
  const persistFn = input.persistShipmentUploadBatchFn ?? persistShipmentUploadBatch;

  const matchOutcome = await matchFn({
    file: input.file,
    scope: input.scope,
    client: input.snapshotClient,
    orderSnapshotLimit: input.orderSnapshotLimit,
    loadSnapshots,
  });

  if (!matchOutcome.success) {
    return matchOutcome;
  }

  const parseOutcome = parseUploadedShipmentFile(input.file);
  if ('status' in parseOutcome) {
    return { success: false, status: parseOutcome.status, error: parseOutcome.error };
  }
  if (!parseOutcome.ok) {
    return {
      success: false,
      status: 400,
      error: parseOutcome.error ?? '송장 파일을 파싱할 수 없습니다.',
    };
  }

  const orderSnapshots = await loadSnapshots(input.snapshotClient, {
    userId: input.scope.userId,
    provider: input.scope.provider as OrderIntegrationProvider | undefined,
    integrationAccountId: input.scope.integrationAccountId,
    batchId: input.scope.batchId,
    limit: input.orderSnapshotLimit ?? DEFAULT_SHIPMENT_MATCH_ORDER_SNAPSHOT_LIMIT,
  });

  const persistInput = buildPersistShipmentUploadBatchInputFromMatchBody({
    userId: input.scope.userId,
    provider: input.scope.provider,
    integrationAccountId: input.scope.integrationAccountId,
    file: {
      name: input.file.name,
      type: input.file.type,
      size: input.file.size,
      hash: input.fileHash ?? null,
    },
    parseResult: parseOutcome,
    matchBody: matchOutcome.body.match,
    orderSnapshots,
  });

  if ('error' in persistInput) {
    return { success: false, status: 400, error: persistInput.error };
  }

  try {
    const persisted = await persistFn(input.persistClient, persistInput);

    return {
      success: true,
      body: {
        success: true,
        uploadBatch: {
          id: persisted.batch.id,
          rowCount: persisted.rowCount,
          matchCount: persisted.matchCount,
        },
        file: matchOutcome.body.file,
        parse: matchOutcome.body.parse,
        orders: matchOutcome.body.orders,
        match: matchOutcome.body.match,
      },
    };
  } catch {
    return {
      success: false,
      status: 500,
      error: '송장 업로드 결과를 저장하는 중 오류가 발생했습니다.',
    };
  }
}
