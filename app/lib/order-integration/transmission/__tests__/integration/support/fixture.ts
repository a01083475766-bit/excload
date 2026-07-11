import type { Prisma, PrismaClient } from '@prisma/client';

import {
  buildAccountCreateData,
  buildOrderBatchCreateData,
  buildOrderCreateData,
  buildReadyMatchCreateData,
  buildUploadBatchCreateData,
  buildUploadRowCreateData,
  buildUserCreateData,
  IT_PROVIDER,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/fixture-builders';
import {
  createEmptyItIds,
  type ShipmentTransmissionItIds,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';
import { createShipmentTransmissionItRunId } from '@/app/lib/order-integration/transmission/__tests__/integration/support/ids';
import { assertIntegrationMutationAllowed } from '@/app/lib/order-integration/transmission/__tests__/integration/support/mutation-gate';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

export type ReadyTransmissionFixture = {
  ids: ShipmentTransmissionItIds;
  userId: string;
  accountId: string;
  orderBatchId: string;
  orderId: string;
  uploadBatchId: string;
  uploadRowId: string;
  matchId: string;
  mallOrderNo: string;
  excloadOrderNo: string;
  trackingNumber: string;
  candidate: ShipmentTransmissionCandidate;
};

/**
 * Creates User + minimal inactive account (no credentials) + READY Match graph.
 * Does not create Attempt (repository creates it).
 */
export async function createReadyTransmissionFixture(
  prisma: PrismaClient,
  options?: { runId?: string; slot?: string; ids?: ShipmentTransmissionItIds },
): Promise<ReadyTransmissionFixture> {
  assertIntegrationMutationAllowed();

  const runId = options?.runId ?? createShipmentTransmissionItRunId();
  const slot = options?.slot ?? 'a';
  const ids = options?.ids ?? createEmptyItIds(runId);

  const userData = buildUserCreateData({ runId, slot });
  const user = await prisma.user.create({ data: userData });
  ids.userId = user.id;
  ids.userEmail = user.email;

  const account = await prisma.orderIntegrationAccount.create({
    data: buildAccountCreateData({ runId, slot, userId: user.id }),
  });
  ids.accountId = account.id;

  const orderBatch = await prisma.orderSyncBatch.create({
    data: buildOrderBatchCreateData({
      runId,
      slot,
      userId: user.id,
      integrationAccountId: account.id,
    }),
  });
  ids.orderBatchIds.push(orderBatch.id);

  const orderData = buildOrderCreateData({
    runId,
    slot,
    userId: user.id,
    batchId: orderBatch.id,
    integrationAccountId: account.id,
  });
  const order = await prisma.orderSyncOrder.create({
    data: orderData as Prisma.OrderSyncOrderUncheckedCreateInput,
  });
  ids.orderIds.push(order.id);

  const uploadBatch = await prisma.shipmentUploadBatch.create({
    data: buildUploadBatchCreateData({
      runId,
      slot,
      userId: user.id,
      integrationAccountId: account.id,
    }),
  });
  ids.uploadBatchIds.push(uploadBatch.id);

  const rowData = buildUploadRowCreateData({
    runId,
    slot,
    userId: user.id,
    uploadBatchId: uploadBatch.id,
    mallOrderNo: order.mallOrderNo,
    excloadOrderNo: order.excloadOrderNo,
  });
  const row = await prisma.shipmentUploadRow.create({
    data: rowData as Prisma.ShipmentUploadRowUncheckedCreateInput,
  });
  ids.uploadRowIds.push(row.id);

  const match = await prisma.shipmentMatch.create({
    data: buildReadyMatchCreateData({
      runId,
      slot,
      userId: user.id,
      uploadBatchId: uploadBatch.id,
      uploadRowId: row.id,
      orderSyncOrderId: order.id,
      integrationAccountId: account.id,
      trackingNumber: row.trackingNumberNormalized,
    }) as Prisma.ShipmentMatchUncheckedCreateInput,
  });
  ids.matchIds.push(match.id);

  const candidate: ShipmentTransmissionCandidate = {
    provider: IT_PROVIDER,
    integrationAccountId: account.id,
    uploadBatchId: uploadBatch.id,
    matchId: match.id,
    orderSyncOrderId: order.id,
    mallOrderNo: order.mallOrderNo,
    excloadOrderNo: order.excloadOrderNo,
    mallLineItemIds: ['IT-LINE-1'],
    trackingNumber: row.trackingNumberNormalized,
    courierCode: 'CJ',
    courierName: 'IT-CARRIER',
  };

  return {
    ids,
    userId: user.id,
    accountId: account.id,
    orderBatchId: orderBatch.id,
    orderId: order.id,
    uploadBatchId: uploadBatch.id,
    uploadRowId: row.id,
    matchId: match.id,
    mallOrderNo: order.mallOrderNo,
    excloadOrderNo: order.excloadOrderNo,
    trackingNumber: row.trackingNumberNormalized,
    candidate,
  };
}

/**
 * Additional READY Match under the same user/account (separate order/row).
 */
export async function createAdditionalReadyMatch(
  prisma: PrismaClient,
  base: ReadyTransmissionFixture,
  slot: string,
): Promise<{
  orderId: string;
  uploadBatchId: string;
  uploadRowId: string;
  matchId: string;
  candidate: ShipmentTransmissionCandidate;
}> {
  assertIntegrationMutationAllowed();
  const { runId, ids, userId, accountId } = {
    runId: base.ids.runId,
    ids: base.ids,
    userId: base.userId,
    accountId: base.accountId,
  };

  const orderBatch = await prisma.orderSyncBatch.create({
    data: buildOrderBatchCreateData({
      runId,
      slot,
      userId,
      integrationAccountId: accountId,
    }),
  });
  ids.orderBatchIds.push(orderBatch.id);

  const orderData = buildOrderCreateData({
    runId,
    slot,
    userId,
    batchId: orderBatch.id,
    integrationAccountId: accountId,
  });
  const order = await prisma.orderSyncOrder.create({
    data: orderData as Prisma.OrderSyncOrderUncheckedCreateInput,
  });
  ids.orderIds.push(order.id);

  const uploadBatch = await prisma.shipmentUploadBatch.create({
    data: buildUploadBatchCreateData({
      runId,
      slot,
      userId,
      integrationAccountId: accountId,
    }),
  });
  ids.uploadBatchIds.push(uploadBatch.id);

  const rowData = buildUploadRowCreateData({
    runId,
    slot,
    userId,
    uploadBatchId: uploadBatch.id,
    mallOrderNo: order.mallOrderNo,
    excloadOrderNo: order.excloadOrderNo,
  });
  const row = await prisma.shipmentUploadRow.create({
    data: rowData as Prisma.ShipmentUploadRowUncheckedCreateInput,
  });
  ids.uploadRowIds.push(row.id);

  const match = await prisma.shipmentMatch.create({
    data: buildReadyMatchCreateData({
      runId,
      slot,
      userId,
      uploadBatchId: uploadBatch.id,
      uploadRowId: row.id,
      orderSyncOrderId: order.id,
      integrationAccountId: accountId,
      trackingNumber: row.trackingNumberNormalized,
    }) as Prisma.ShipmentMatchUncheckedCreateInput,
  });
  ids.matchIds.push(match.id);

  return {
    orderId: order.id,
    uploadBatchId: uploadBatch.id,
    uploadRowId: row.id,
    matchId: match.id,
    candidate: {
      provider: IT_PROVIDER,
      integrationAccountId: accountId,
      uploadBatchId: uploadBatch.id,
      matchId: match.id,
      orderSyncOrderId: order.id,
      mallOrderNo: order.mallOrderNo,
      excloadOrderNo: order.excloadOrderNo,
      mallLineItemIds: ['IT-LINE-1'],
      trackingNumber: row.trackingNumberNormalized,
      courierCode: 'CJ',
      courierName: 'IT-CARRIER',
    },
  };
}
