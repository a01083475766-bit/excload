import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { persistOrderSyncBatch } from '@/app/lib/order-integration/snapshots/persist-order-sync-batch';
import type {
  MaybePersistOrderFetchResultInput,
  OrderFetchSnapshotPersistResult,
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

function normalizeRawOrders(rawOrders?: unknown): ReadonlyArray<unknown> | undefined {
  if (rawOrders == null) return undefined;
  if (Array.isArray(rawOrders)) return rawOrders;
  return [rawOrders];
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
 * fetch-orders 결과(orderStandardFile.rows)를 snapshot 저장 레이어에 연결합니다.
 *
 * - enabled=false: DB 접근 없음
 * - rows 빈 배열: DB 접근 없음 (`empty_rows`)
 * - 저장 실패: throw하지 않고 `persist_failed` 반환
 */
export async function maybePersistOrderFetchResult(
  input: MaybePersistOrderFetchResultInput,
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
    const snapshots = buildOrderSyncSnapshots({
      userId: input.userId,
      provider: input.provider,
      accountId: input.integrationAccountId,
      fetchedAt,
      rows: normalizeOrderStandardRows(rows),
      rawOrders: normalizeRawOrders(input.rawOrders),
    });

    const result = await persistOrderSyncBatch(input.client, {
      userId: input.userId,
      provider: input.provider,
      integrationAccountId: input.integrationAccountId,
      sourceType: 'API',
      fetchedAt,
      snapshots,
    });

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
