import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { persistOrderSyncBatch } from '@/app/lib/order-integration/snapshots/persist-order-sync-batch';
import {
  normalizeRemainQuantityForPersist,
  stripExcloadRemainQuantityFromRows,
} from '@/app/lib/order-integration/snapshots/remain-quantity';
import type {
  MaybePersistOrderFetchResultInput,
  OrderFetchSnapshotPersistResult,
  OrderSyncPersistPrismaClient,
} from '@/app/lib/order-integration/snapshots/types';

const PII_PATTERNS: ReadonlyArray<RegExp> = [
  /\b010[-\s]?\d{4}[-\s]?\d{4}\b/g,
  /\b\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}\b/g,
  /\b\d{10,12}\b/g,
  /\bEXC-\d{8}-\d{6}\b/gi,
  /\b\d{12,14}\b/g,
];

/**
 * 운영 DB migration 적용 전 기본 OFF.
 * true일 때만 snapshot DB 저장을 시도합니다.
 */
export function isOrderSyncSnapshotPersistEnabled(): boolean {
  return process.env.ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED === 'true';
}

function normalizeOrderStandardRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): Record<string, string>[] {
  return rows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value == null ? '' : String(value);
    }
    return normalized;
  });
}

export function toSafePersistErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'snapshot 저장 중 오류가 발생했습니다.';

  let sanitized = raw;
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[redacted]');
  }

  if (sanitized.length > 200) {
    sanitized = `${sanitized.slice(0, 200)}...`;
  }

  return sanitized || 'snapshot 저장 중 오류가 발생했습니다.';
}

/**
 * 표준 주문행 → OrderSync 스냅샷 저장.
 * 택배양식 다운로드 등 **명시적 출고 의도**에서만 호출합니다.
 * rawOrders는 운영 저장에 쓰지 않습니다(원문 PII 지양).
 */
export async function persistOrderSyncSnapshotsFromStandardRows(
  input: MaybePersistOrderFetchResultInput & {
    memo?: string | null;
  },
): Promise<OrderFetchSnapshotPersistResult> {
  if (!input.enabled) {
    return { persisted: false, reason: 'disabled' };
  }

  if (!input.orderStandardFile) {
    return { persisted: false, reason: 'missing_order_standard_file' };
  }

  const rows = input.orderStandardFile.rows ?? [];
  if (rows.length === 0) {
    return { persisted: false, reason: 'empty_rows' };
  }

  try {
    const fetchedAt = input.fetchedAt ?? new Date();
    const cleanedRows = stripExcloadRemainQuantityFromRows(normalizeOrderStandardRows(rows));
    const remainQuantities = (input.remainQuantities ?? cleanedRows.map(() => null)).map((value) =>
      normalizeRemainQuantityForPersist(value),
    );
    const snapshots = buildOrderSyncSnapshots({
      userId: input.userId,
      provider: input.provider,
      accountId: input.integrationAccountId,
      fetchedAt,
      rows: cleanedRows,
      // 운영: API 원문 미저장
      rawOrders: undefined,
      remainQuantities,
    });

    const result = await persistOrderSyncBatch(
      input.client as unknown as OrderSyncPersistPrismaClient,
      {
        userId: input.userId,
        provider: input.provider,
        integrationAccountId: input.integrationAccountId,
        sourceType: 'API',
        fetchedAt,
        memo: input.memo ?? null,
        snapshots,
      },
    );

    return {
      persisted: true,
      batchId: result.batch.id,
      orderCount: result.batch.orderCount,
      excloadOrderNos: result.excloadOrderNos,
    };
  } catch (error) {
    const errorMessage = toSafePersistErrorMessage(error);
    console.error('[OrderSyncSnapshotPersist] failed:', errorMessage);
    return {
      persisted: false,
      reason: 'persist_failed',
      errorMessage,
    };
  }
}

/**
 * fetch-orders 훅용. **주문조회 시점에는 저장하지 않습니다.**
 * (정책: 엑클로드 택배양식 다운로드 시에만 스냅샷 저장)
 * 라우트 호환을 위해 시그니처는 유지하고 항상 disabled를 반환합니다.
 */
export async function maybePersistOrderFetchResult(
  _input: MaybePersistOrderFetchResultInput,
): Promise<OrderFetchSnapshotPersistResult> {
  void _input;
  return { persisted: false, reason: 'disabled' };
}
