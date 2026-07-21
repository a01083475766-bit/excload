/**
 * 택배양식 다운로드 시 주문 스냅샷 저장.
 *
 * 정책:
 * - 주문조회만으로는 DB에 저장하지 않음
 * - 엑클로드에서 택배 업로드 양식을 다운로드한 연동 주문만 저장
 * - API 원문(rawPayload) 미저장
 */

import { prisma } from '@/app/lib/prisma';
import { orderIntegrationProviderForMallId } from '@/app/lib/order-integration/mall-provider';
import {
  isOrderSyncSnapshotPersistEnabled,
  persistOrderSyncSnapshotsFromStandardRows,
  toSafePersistErrorMessage,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import type { OrderFetchSnapshotPersistResult } from '@/app/lib/order-integration/snapshots/types';

export type CourierDownloadSnapshotGroup = {
  mallId: string;
  accountId: string;
  rows: Array<Record<string, string>>;
};

export type PersistFromCourierDownloadInput = {
  userId: string;
  groups: CourierDownloadSnapshotGroup[];
  downloadedAt?: Date;
};

export type PersistFromCourierDownloadResult = {
  attempted: boolean;
  groupResults: Array<{
    mallId: string;
    accountId: string;
    result: OrderFetchSnapshotPersistResult;
  }>;
  savedOrderCount: number;
  skippedDuplicateOrEmpty: number;
};

function normalizeRows(rows: Array<Record<string, string>>): Array<Record<string, string>> {
  return rows.map((row) => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      next[key] = value == null ? '' : String(value);
    }
    return next;
  });
}

/**
 * 다운로드에 포함된 연동 주문 그룹을 스냅샷으로 저장합니다.
 * flag OFF면 attempted=false.
 */
export async function persistOrderSyncFromCourierDownload(
  input: PersistFromCourierDownloadInput,
): Promise<PersistFromCourierDownloadResult> {
  if (!isOrderSyncSnapshotPersistEnabled()) {
    return {
      attempted: false,
      groupResults: [],
      savedOrderCount: 0,
      skippedDuplicateOrEmpty: 0,
    };
  }

  const downloadedAt = input.downloadedAt ?? new Date();
  const groupResults: PersistFromCourierDownloadResult['groupResults'] = [];
  let savedOrderCount = 0;
  let skippedDuplicateOrEmpty = 0;

  for (const group of input.groups) {
    const provider = orderIntegrationProviderForMallId(group.mallId);
    if (!provider || !group.accountId.trim() || group.rows.length === 0) {
      skippedDuplicateOrEmpty += group.rows.length;
      continue;
    }

    const account = await prisma.orderIntegrationAccount.findFirst({
      where: {
        id: group.accountId,
        userId: input.userId,
      },
      select: { id: true, provider: true },
    });

    if (!account || account.provider !== provider) {
      groupResults.push({
        mallId: group.mallId,
        accountId: group.accountId,
        result: {
          persisted: false,
          reason: 'persist_failed',
          errorMessage: '연동 계정을 확인할 수 없습니다.',
        },
      });
      continue;
    }

    const result = await persistOrderSyncSnapshotsFromStandardRows({
      client: prisma,
      enabled: true,
      userId: input.userId,
      provider,
      integrationAccountId: account.id,
      orderStandardFile: { rows: normalizeRows(group.rows) },
      fetchedAt: downloadedAt,
      memo: 'courier-download',
    });

    groupResults.push({
      mallId: group.mallId,
      accountId: group.accountId,
      result,
    });

    if (result.persisted) {
      savedOrderCount += result.orderCount;
      const requested = group.rows.length;
      if (result.orderCount < requested) {
        skippedDuplicateOrEmpty += requested - result.orderCount;
      }
    }
  }

  return {
    attempted: true,
    groupResults,
    savedOrderCount,
    skippedDuplicateOrEmpty,
  };
}

export function toSafeDownloadPersistClientMessage(error: unknown): string {
  return toSafePersistErrorMessage(error);
}
