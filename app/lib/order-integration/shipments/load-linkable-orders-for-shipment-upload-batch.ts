import type { OrderIntegrationProvider } from '@prisma/client';

import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import {
  maskShipmentAddress,
  maskShipmentPhone,
} from '@/app/lib/order-integration/shipments/shipment-match-ui';

export const DEFAULT_LINKABLE_ORDERS_LIMIT = 30;
export const MAX_LINKABLE_ORDERS_LIMIT = 100;

type LoadedOrderSyncOrder = {
  id: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  mallOrderNo: string;
  excloadOrderNo: string;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  orderedAt: Date | null;
  createdAt: Date;
};

export type LinkableOrderListItem = {
  id: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  mallOrderNo: string;
  excloadOrderNo: string;
  recipientName: string | null;
  recipientPhone: string | null;
  address: string | null;
  orderedAt: string | null;
  usedInShipmentMatch: boolean;
};

export type LinkableOrdersForShipmentUploadBatchResponse = {
  success: true;
  batchId: string;
  orders: LinkableOrderListItem[];
};

export type LinkableOrdersLoadClient = {
  shipmentUploadBatch: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: { id: true; provider: true; integrationAccountId: true };
    }) => Promise<{
      id: string;
      provider: OrderIntegrationProvider | null;
      integrationAccountId: string | null;
    } | null>;
  };
  orderSyncOrder: {
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy: Array<{ orderedAt?: 'desc'; createdAt?: 'desc' }>;
      take: number;
      select: Record<string, boolean>;
    }) => Promise<LoadedOrderSyncOrder[]>;
  };
  shipmentMatch: {
    findMany: (args: {
      where: { uploadBatchId: string; userId: string; orderSyncOrderId: { not: null } };
      select: { orderSyncOrderId: true };
    }) => Promise<Array<{ orderSyncOrderId: string | null }>>;
  };
};

export function parseLinkableOrdersLimit(
  value: string | null | undefined,
): number | { error: string } {
  if (value == null || value.trim() === '') {
    return DEFAULT_LINKABLE_ORDERS_LIMIT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { error: 'limit는 1 이상의 정수여야 합니다.' };
  }

  return Math.min(parsed, MAX_LINKABLE_ORDERS_LIMIT);
}

export function parseLinkableOrdersQuery(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 100);
}

export function maskRecipientName(value?: string | null): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length === 1) return '*';
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}

export function buildLinkableOrdersWhere(input: {
  userId: string;
  batchProvider: OrderIntegrationProvider | null;
  batchIntegrationAccountId: string | null;
  q?: string | null;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {
    userId: input.userId,
  };

  if (input.batchProvider) {
    where.provider = input.batchProvider;
  }

  if (input.batchIntegrationAccountId) {
    where.integrationAccountId = input.batchIntegrationAccountId;
  }

  const q = input.q?.trim();
  if (q) {
    where.OR = [
      { excloadOrderNo: { contains: q, mode: 'insensitive' } },
      { mallOrderNo: { contains: q, mode: 'insensitive' } },
      { receiverName: { contains: q, mode: 'insensitive' } },
      { receiverPhone: { contains: q } },
      { receiverAddress: { contains: q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export function mapLinkableOrderListItem(input: {
  order: LoadedOrderSyncOrder;
  usedOrderIds: ReadonlySet<string>;
}): LinkableOrderListItem {
  const { order } = input;

  return {
    id: order.id,
    provider: order.provider,
    integrationAccountId: order.integrationAccountId,
    mallOrderNo: order.mallOrderNo,
    excloadOrderNo: order.excloadOrderNo,
    recipientName: maskRecipientName(order.receiverName),
    recipientPhone: maskShipmentPhone(order.receiverPhone),
    address: maskShipmentAddress(order.receiverAddress),
    orderedAt: order.orderedAt?.toISOString() ?? null,
    usedInShipmentMatch: input.usedOrderIds.has(order.id),
  };
}

export async function loadLinkableOrdersForShipmentUploadBatch(
  client: LinkableOrdersLoadClient,
  input: { userId: string; batchId: string; q?: string | null; limit: number },
): Promise<
  | { success: false; status: 404; error: string }
  | { success: true; body: LinkableOrdersForShipmentUploadBatchResponse }
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

  const [orders, matches] = await Promise.all([
    client.orderSyncOrder.findMany({
      where: buildLinkableOrdersWhere({
        userId: input.userId,
        batchProvider: batch.provider,
        batchIntegrationAccountId: batch.integrationAccountId,
        q: input.q,
      }),
      orderBy: [{ orderedAt: 'desc' }, { createdAt: 'desc' }],
      take: input.limit,
      select: {
        id: true,
        provider: true,
        integrationAccountId: true,
        mallOrderNo: true,
        excloadOrderNo: true,
        receiverName: true,
        receiverPhone: true,
        receiverAddress: true,
        orderedAt: true,
        createdAt: true,
      },
    }),
    client.shipmentMatch.findMany({
      where: {
        uploadBatchId: input.batchId,
        userId: input.userId,
        orderSyncOrderId: { not: null },
      },
      select: {
        orderSyncOrderId: true,
      },
    }),
  ]);

  const usedOrderIds = new Set(
    matches
      .map((match) => match.orderSyncOrderId?.trim())
      .filter((orderId): orderId is string => Boolean(orderId)),
  );

  return {
    success: true,
    body: {
      success: true,
      batchId: batch.id,
      orders: orders.map((order) =>
        mapLinkableOrderListItem({
          order,
          usedOrderIds,
        }),
      ),
    },
  };
}

export function validateLinkableOrdersBatchId(
  batchId: string | undefined | null,
): string | { error: string } {
  return validateShipmentUploadBatchId(batchId);
}
