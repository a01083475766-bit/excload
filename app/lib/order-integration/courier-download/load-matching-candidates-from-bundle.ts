/**
 * 선택한 CourierDownloadBundle의 WorkItem → 송장 매칭 후보.
 * 사용자 전체 OrderSyncOrder를 섞지 않는다.
 */

import type { OrderIntegrationProvider } from '@prisma/client';

import { orderIntegrationProviderForMallId } from '@/app/lib/order-integration/mall-provider';
import { toOrderSyncSnapshot } from '@/app/lib/order-integration/snapshots/to-order-sync-snapshot';
import type {
  OrderSyncSnapshotLoadClient,
  PersistedOrderSyncOrderLike,
} from '@/app/lib/order-integration/snapshots/types';
import type { OrderSyncOrderSnapshot } from '@/app/lib/order-integration/shipments/types';

export type MatchingCandidateEmptyReason =
  | 'bundle_not_found'
  | 'bundle_forbidden'
  | 'bundle_expired'
  | 'bundle_no_candidates'
  | 'no_bundle';

export type LoadMatchingCandidatesFromBundleResult = {
  snapshots: OrderSyncOrderSnapshot[];
  emptyReason: MatchingCandidateEmptyReason | null;
  bundle: {
    id: string;
    expiresAt: string;
    workItemCount: number;
    expired: boolean;
  } | null;
};

export type CourierDownloadWorkItemForMatching = {
  id: string;
  userId: string;
  excloadOrderNo: string;
  inputSource: string;
  sourceMallKey: string | null;
  sourceMallLabel: string | null;
  mallOrderNo: string | null;
  orderSyncOrderId: string | null;
  matchFingerprintHmac: string | null;
  expiresAt: Date;
};

/**
 * PrismaClient·테스트 mock 공용.
 * method 문법(파라미터 bivariant)으로 실제 Prisma delegate와 호환.
 * findFirst 반환의 workItems는 include 시에만 채워지므로 optional.
 */
export type LoadMatchingCandidatesFromBundleClient = {
  courierDownloadBundle: {
    findFirst(args: {
      where?: Record<string, unknown>;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    }): Promise<{
      id: string;
      userId: string;
      expiresAt: Date;
      workItems?: CourierDownloadWorkItemForMatching[];
    } | null>;
  };
  orderSyncOrder: {
    findMany(args: {
      where?: Record<string, unknown>;
      select?: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      take?: number;
    }): Promise<PersistedOrderSyncOrderLike[]>;
  };
};

/** 송장 매칭·업로드에서 PrismaClient를 그대로 넘기기 위한 스냅샷+Bundle 조회 클라이언트 */
export type ShipmentMatchSnapshotClient = OrderSyncSnapshotLoadClient & {
  courierDownloadBundle?: LoadMatchingCandidatesFromBundleClient['courierDownloadBundle'];
};

function parseProviderFromSourceMallKey(
  sourceMallKey: string | null | undefined,
): OrderIntegrationProvider | string {
  const key = sourceMallKey?.trim();
  if (!key) return 'SMARTSTORE';
  const mallId = key.split('::')[0]?.trim() || key;
  return orderIntegrationProviderForMallId(mallId) ?? mallId.toUpperCase();
}

function parseAccountIdFromSourceMallKey(sourceMallKey: string | null | undefined): string | null {
  const key = sourceMallKey?.trim();
  if (!key || !key.includes('::')) return null;
  const accountId = key.slice(key.indexOf('::') + 2).trim();
  return accountId || null;
}

/**
 * WorkItem만으로 매칭 후보 DTO를 구성할 수 있는지.
 * mallOrderNo · excloadOrderNo · matchFingerprintHmac 중 하나 이상이면 충분.
 */
export function workItemHasMatchablePayload(item: {
  mallOrderNo?: string | null;
  excloadOrderNo?: string | null;
  matchFingerprintHmac?: string | null;
  orderSyncOrderId?: string | null;
}): boolean {
  if (item.orderSyncOrderId?.trim()) return true;
  if (item.mallOrderNo?.trim()) return true;
  if (item.excloadOrderNo?.trim()) return true;
  if (item.matchFingerprintHmac?.trim()) return true;
  return false;
}

export function workItemToOrderSyncSnapshot(
  item: CourierDownloadWorkItemForMatching,
): OrderSyncOrderSnapshot {
  return {
    id: item.id,
    userId: item.userId,
    provider: parseProviderFromSourceMallKey(item.sourceMallKey),
    accountId: parseAccountIdFromSourceMallKey(item.sourceMallKey),
    batchId: null,
    excloadOrderNo: item.excloadOrderNo,
    mallOrderNo: item.mallOrderNo?.trim() || '',
    mallOrderId: null,
    receiverName: null,
    receiverPhone: null,
    receiverAddress: null,
    productSummary: item.sourceMallLabel,
    quantity: null,
    orderStatus: null,
    existingTrackingNumber: null,
    exportedRowIndex: null,
    matchFingerprintHmac: item.matchFingerprintHmac,
    workItemCandidate: true,
    workItemId: item.id,
    inputSource: item.inputSource,
  };
}

export async function loadMatchingCandidatesFromBundle(
  client: LoadMatchingCandidatesFromBundleClient,
  input: {
    userId: string;
    downloadBundleId: string;
    now?: Date;
    /** 소유 검증만 (만료 Bundle도 meta 반환) */
    includeExpiredMeta?: boolean;
  },
): Promise<LoadMatchingCandidatesFromBundleResult> {
  const userId = input.userId.trim();
  const downloadBundleId = input.downloadBundleId.trim();
  const now = input.now ?? new Date();

  if (!userId || !downloadBundleId) {
    return { snapshots: [], emptyReason: 'no_bundle', bundle: null };
  }

  const bundle = await client.courierDownloadBundle.findFirst({
    where: { id: downloadBundleId },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      workItems: {
        select: {
          id: true,
          userId: true,
          excloadOrderNo: true,
          inputSource: true,
          sourceMallKey: true,
          sourceMallLabel: true,
          mallOrderNo: true,
          orderSyncOrderId: true,
          matchFingerprintHmac: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!bundle) {
    return { snapshots: [], emptyReason: 'bundle_not_found', bundle: null };
  }

  if (bundle.userId !== userId) {
    return { snapshots: [], emptyReason: 'bundle_forbidden', bundle: null };
  }

  const workItems = bundle.workItems ?? [];
  const expired = bundle.expiresAt < now;
  const bundleMeta = {
    id: bundle.id,
    expiresAt: bundle.expiresAt.toISOString(),
    workItemCount: workItems.length,
    expired,
  };

  if (expired) {
    return {
      snapshots: [],
      emptyReason: 'bundle_expired',
      bundle: bundleMeta,
    };
  }

  const linkedIds = [
    ...new Set(
      workItems
        .map((item) => item.orderSyncOrderId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const linkedOrders =
    linkedIds.length > 0
      ? await client.orderSyncOrder.findMany({
          where: {
            id: { in: linkedIds },
            userId,
            OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          },
        })
      : [];

  const linkedById = new Map(linkedOrders.map((order) => [order.id, order]));
  const snapshots: OrderSyncOrderSnapshot[] = [];

  for (const item of workItems) {
    const linkedId = item.orderSyncOrderId?.trim();
    const linked = linkedId ? linkedById.get(linkedId) : undefined;
    if (linked) {
      snapshots.push({
        ...toOrderSyncSnapshot(linked),
        matchFingerprintHmac: item.matchFingerprintHmac,
        workItemCandidate: false,
        workItemId: item.id,
        inputSource: item.inputSource,
      });
      continue;
    }

    if (!workItemHasMatchablePayload(item)) {
      continue;
    }

    snapshots.push(workItemToOrderSyncSnapshot(item));
  }

  if (snapshots.length === 0) {
    return {
      snapshots: [],
      emptyReason: 'bundle_no_candidates',
      bundle: bundleMeta,
    };
  }

  return {
    snapshots,
    emptyReason: null,
    bundle: bundleMeta,
  };
}
