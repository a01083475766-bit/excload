import type { OrderSyncOrderSnapshot } from '@/app/lib/order-integration/shipments/types';
import { toOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/to-order-sync-snapshot';
import type {
  LoadOrderSyncSnapshotsForMatchingInput,
  OrderSyncSnapshotLoadClient,
} from '@/app/lib/order-integration/snapshots/types';
import {
  DEFAULT_LOAD_ORDER_SYNC_SNAPSHOTS_FOR_MATCHING_LIMIT,
} from '@/app/lib/order-integration/snapshots/types';

function assertValidUserId(userId: string | undefined): asserts userId is string {
  if (!userId?.trim()) {
    throw new Error('userId는 필수입니다.');
  }
}

function assertValidLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('limit는 1 이상의 정수여야 합니다.');
  }
}

/**
 * OrderSyncOrder 조회 where 절을 구성합니다.
 * userId는 필수이며, provider / integrationAccountId / batchId는 선택적으로 좁힙니다.
 */
export function buildLoadOrderSyncSnapshotsForMatchingWhere(
  input: LoadOrderSyncSnapshotsForMatchingInput,
) {
  assertValidUserId(input.userId);

  const where: {
    userId: string;
    provider?: LoadOrderSyncSnapshotsForMatchingInput['provider'];
    integrationAccountId?: string;
    batchId?: string;
  } = {
    userId: input.userId.trim(),
  };

  if (input.provider) {
    where.provider = input.provider;
  }

  if (input.integrationAccountId?.trim()) {
    where.integrationAccountId = input.integrationAccountId.trim();
  }

  if (input.batchId?.trim()) {
    where.batchId = input.batchId.trim();
  }

  return where;
}

/**
 * DB에 저장된 OrderSyncOrder를 송장 매칭용 DTO로 조회합니다.
 * 반드시 userId 기준으로만 조회합니다.
 */
export async function loadOrderSyncSnapshotsForMatching(
  client: OrderSyncSnapshotLoadClient,
  input: LoadOrderSyncSnapshotsForMatchingInput,
): Promise<OrderSyncOrderSnapshot[]> {
  assertValidUserId(input.userId);

  const limit = input.limit ?? DEFAULT_LOAD_ORDER_SYNC_SNAPSHOTS_FOR_MATCHING_LIMIT;
  assertValidLimit(limit);

  const orders = await client.orderSyncOrder.findMany({
    where: buildLoadOrderSyncSnapshotsForMatchingWhere(input),
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return toOrderSyncSnapshots(orders);
}
