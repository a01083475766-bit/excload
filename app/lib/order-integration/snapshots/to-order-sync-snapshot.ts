import type { OrderSyncOrderSnapshot } from '@/app/lib/order-integration/shipments/types';
import type { PersistedOrderSyncOrderLike } from '@/app/lib/order-integration/snapshots/types';

export function toOrderSyncSnapshot(order: PersistedOrderSyncOrderLike): OrderSyncOrderSnapshot {
  return {
    id: order.id,
    userId: order.userId,
    provider: order.provider,
    accountId: order.integrationAccountId,
    batchId: order.batchId,
    excloadOrderNo: order.excloadOrderNo,
    mallOrderNo: order.mallOrderNo,
    mallOrderId: order.mallOrderId,
    receiverName: order.receiverName,
    receiverPhone: order.receiverPhone,
    receiverAddress: order.receiverAddress,
    productSummary: order.productSummary,
    quantity: order.quantity,
    orderStatus: order.orderStatus,
    existingTrackingNumber: order.trackingNumber,
    exportedRowIndex: null,
  };
}

export function toOrderSyncSnapshots(
  orders: ReadonlyArray<PersistedOrderSyncOrderLike>,
): OrderSyncOrderSnapshot[] {
  return orders.map((order) => toOrderSyncSnapshot(order));
}
