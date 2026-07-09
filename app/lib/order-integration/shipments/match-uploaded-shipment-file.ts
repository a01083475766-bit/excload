import type { OrderIntegrationProvider } from '@prisma/client';

import { loadOrderSyncSnapshotsForMatching } from '@/app/lib/order-integration/snapshots/load-order-sync-snapshots-for-matching';
import type { OrderSyncSnapshotLoadClient } from '@/app/lib/order-integration/snapshots/types';
import { matchShipmentRows } from '@/app/lib/order-integration/shipments/match-shipment-row';
import {
  buildShipmentMatchDisplayRows,
  type ShipmentMatchDisplayRow,
} from '@/app/lib/order-integration/shipments/shipment-match-ui';
import {
  extractNormalizedShipmentRows,
  parseShipmentCsv,
  parseShipmentWorkbook,
} from '@/app/lib/order-integration/shipments/parse-shipment-file';
import type {
  ShipmentMatchResult,
  ShipmentParseResult,
  ShipmentParseWarning,
} from '@/app/lib/order-integration/shipments/types';

export const MAX_SHIPMENT_UPLOAD_FILE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_SHIPMENT_MATCH_ORDER_SNAPSHOT_LIMIT = 1000;

const PII_PATTERNS: ReadonlyArray<RegExp> = [
  /\b010[-\s]?\d{4}[-\s]?\d{4}\b/g,
  /\b\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}\b/g,
  /\b\d{10,12}\b/g,
  /\bEXC-\d{8}-\d{6}\b/gi,
  /\b\d{12,14}\b/g,
];

export type UploadedShipmentFileInput = {
  name: string;
  type: string;
  size: number;
  buffer: ArrayBuffer;
};

export type ShipmentMatchUploadScope = {
  userId: string;
  provider?: OrderIntegrationProvider;
  integrationAccountId?: string;
  batchId?: string;
};

export type ShipmentMatchUploadSuccessResponse = {
  success: true;
  file: {
    name: string;
    type: string;
    size: number;
  };
  parse: {
    ok: true;
    rowCount: number;
    warningCount: number;
    warnings: ShipmentParseWarning[];
  };
  orders: {
    loadedCount: number;
    scope: {
      provider?: string;
      integrationAccountId?: string;
      batchId?: string;
    };
  };
  match: {
    totalRows: number;
    matchedConfidentCount: number;
    matchedWarningCount: number;
    multipleCandidatesCount: number;
    notMatchedCount: number;
    duplicateTrackingNumberCount: number;
    alreadyShippedCount: number;
    cancelledOrInvalidOrderCount: number;
    rows: ShipmentMatchResult[];
    displayRows: ShipmentMatchDisplayRow[];
  };
};

export type ParseUploadedShipmentFileFailure = {
  ok: false;
  error: string;
  status: 400 | 413;
};

export function toSafeShipmentMatchLogMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '송장 매칭 처리 중 오류가 발생했습니다.';

  let sanitized = raw;
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[redacted]');
  }

  if (sanitized.length > 200) {
    sanitized = `${sanitized.slice(0, 200)}...`;
  }

  return sanitized || '송장 매칭 처리 중 오류가 발생했습니다.';
}

export function detectShipmentUploadFormat(
  fileName: string,
): 'csv' | 'xlsx' | 'xls' | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  return null;
}

export function parseUploadedShipmentFile(
  file: UploadedShipmentFileInput,
): ShipmentParseResult | ParseUploadedShipmentFileFailure {
  if (!file.name?.trim()) {
    return { ok: false, error: '파일 이름이 없습니다.', status: 400 };
  }

  if (file.size > MAX_SHIPMENT_UPLOAD_FILE_BYTES) {
    return {
      ok: false,
      error: '파일 크기는 5MB 이하여야 합니다.',
      status: 413,
    };
  }

  const format = detectShipmentUploadFormat(file.name);
  if (!format) {
    return {
      ok: false,
      error: '지원하지 않는 파일 형식입니다. csv, xlsx, xls만 업로드할 수 있습니다.',
      status: 400,
    };
  }

  if (format === 'csv') {
    const csvText = new TextDecoder('utf-8').decode(file.buffer);
    return parseShipmentCsv(csvText);
  }

  return parseShipmentWorkbook(file.buffer, format);
}

export function summarizeShipmentMatchResults(rows: ShipmentMatchResult[]) {
  return {
    totalRows: rows.length,
    matchedConfidentCount: rows.filter((row) => row.matchStatus === 'MATCHED_CONFIDENT').length,
    matchedWarningCount: rows.filter((row) => row.matchStatus === 'MATCHED_WARNING').length,
    multipleCandidatesCount: rows.filter((row) => row.matchStatus === 'MULTIPLE_CANDIDATES')
      .length,
    notMatchedCount: rows.filter((row) => row.matchStatus === 'NOT_MATCHED').length,
    duplicateTrackingNumberCount: rows.filter(
      (row) => row.matchStatus === 'DUPLICATE_TRACKING_NUMBER',
    ).length,
    alreadyShippedCount: rows.filter((row) => row.matchStatus === 'ALREADY_SHIPPED').length,
    cancelledOrInvalidOrderCount: rows.filter(
      (row) => row.matchStatus === 'CANCELLED_OR_INVALID_ORDER',
    ).length,
    rows,
  };
}

export async function matchUploadedShipmentFile(input: {
  file: UploadedShipmentFileInput;
  scope: ShipmentMatchUploadScope;
  client: OrderSyncSnapshotLoadClient;
  orderSnapshotLimit?: number;
  loadSnapshots?: typeof loadOrderSyncSnapshotsForMatching;
}): Promise<
  | { success: false; status: number; error: string }
  | { success: true; body: ShipmentMatchUploadSuccessResponse }
> {
  const parseOutcome = parseUploadedShipmentFile(input.file);
  if ('status' in parseOutcome) {
    return { success: false, status: parseOutcome.status, error: parseOutcome.error };
  }

  const parseResult = parseOutcome;
  if (!parseResult.ok) {
    return {
      success: false,
      status: 400,
      error: parseResult.error ?? '송장 파일을 파싱할 수 없습니다.',
    };
  }

  const shipmentRows = extractNormalizedShipmentRows(parseResult);
  const loadSnapshots = input.loadSnapshots ?? loadOrderSyncSnapshotsForMatching;
  const orderSnapshots = await loadSnapshots(input.client, {
    userId: input.scope.userId,
    provider: input.scope.provider,
    integrationAccountId: input.scope.integrationAccountId,
    batchId: input.scope.batchId,
    limit: input.orderSnapshotLimit ?? DEFAULT_SHIPMENT_MATCH_ORDER_SNAPSHOT_LIMIT,
  });

  const matchRows = matchShipmentRows({
    shipments: shipmentRows,
    orders: orderSnapshots,
    scope: {
      userId: input.scope.userId,
      provider: input.scope.provider,
      accountId: input.scope.integrationAccountId ?? null,
    },
  });
  const displayRows = buildShipmentMatchDisplayRows({
    shipments: shipmentRows,
    orders: orderSnapshots,
    matchRows,
  });

  return {
    success: true,
    body: {
      success: true,
      file: {
        name: input.file.name,
        type: input.file.type,
        size: input.file.size,
      },
      parse: {
        ok: true,
        rowCount: shipmentRows.length,
        warningCount: parseResult.warnings.length,
        warnings: parseResult.warnings,
      },
      orders: {
        loadedCount: orderSnapshots.length,
        scope: {
          provider: input.scope.provider,
          integrationAccountId: input.scope.integrationAccountId,
          batchId: input.scope.batchId,
        },
      },
      match: {
        ...summarizeShipmentMatchResults(matchRows),
        displayRows,
      },
    },
  };
}

export function parseShipmentMatchUploadScope(input: {
  userId: string;
  provider?: string | null;
  integrationAccountId?: string | null;
  batchId?: string | null;
  allowedProviders: ReadonlyArray<OrderIntegrationProvider>;
}): ShipmentMatchUploadScope | { error: string } {
  if (!input.userId.trim()) {
    return { error: 'userId는 필수입니다.' };
  }

  const scope: ShipmentMatchUploadScope = {
    userId: input.userId.trim(),
  };

  const provider = String(input.provider ?? '').trim();
  if (provider) {
    if (!input.allowedProviders.includes(provider as OrderIntegrationProvider)) {
      return { error: '유효하지 않은 provider 값입니다.' };
    }
    scope.provider = provider as OrderIntegrationProvider;
  }

  const integrationAccountId = String(input.integrationAccountId ?? '').trim();
  if (integrationAccountId) {
    scope.integrationAccountId = integrationAccountId;
  }

  const batchId = String(input.batchId ?? '').trim();
  if (batchId) {
    scope.batchId = batchId;
  }

  return scope;
}
