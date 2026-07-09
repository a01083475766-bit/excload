import type {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentAlgorithmMatchStatus,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

import type { ShipmentMatchUploadSuccessResponse } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { summarizeShipmentMatchResults } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import type {
  NormalizedShipmentRow,
  OrderSyncOrderSnapshot,
  ParsedShipmentRow,
  ShipmentMatchCandidate,
  ShipmentMatchResult,
  ShipmentMatchStatus,
  ShipmentParseResult,
} from '@/app/lib/order-integration/shipments/types';

export type ShipmentUploadPersistOrderRef = {
  userId: string;
  provider?: OrderIntegrationProvider | string;
  integrationAccountId?: string | null;
};

export type PersistShipmentUploadBatchInput = {
  userId: string;
  provider?: OrderIntegrationProvider;
  integrationAccountId?: string;
  file: {
    name: string;
    type: string;
    size: number;
    hash?: string | null;
  };
  parseResult: ShipmentParseResult;
  normalizedShipmentRows: NormalizedShipmentRow[];
  parsedShipmentRows?: ParsedShipmentRow[];
  matchResults: ShipmentMatchResult[];
  knownOrdersById?: ReadonlyMap<string, ShipmentUploadPersistOrderRef>;
};

export type PersistedShipmentUploadBatch = {
  id: string;
  userId: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  originalFileName: string;
  fileHash: string | null;
  fileSize: number;
  fileType: string | null;
  rowCount: number;
  matchedConfidentCount: number;
  matchedWarningCount: number;
  multipleCandidatesCount: number;
  notMatchedCount: number;
  duplicateTrackingNumberCount: number;
  alreadyShippedCount: number;
  cancelledOrInvalidOrderCount: number;
  status: ShipmentUploadBatchStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedShipmentUploadRow = {
  id: string;
  uploadBatchId: string;
  userId: string;
  originalRowIndex: number;
  rawRowJson: unknown;
  trackingNumber: string;
  trackingNumberNormalized: string;
  carrierName: string | null;
  carrierCode: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverPhoneNormalized: string | null;
  receiverAddress: string | null;
  mallOrderNo: string | null;
  excloadOrderNo: string | null;
  productText: string | null;
  warningsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedShipmentMatch = {
  id: string;
  uploadBatchId: string;
  uploadRowId: string;
  userId: string;
  orderSyncOrderId: string | null;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  algorithmMatchStatus: ShipmentAlgorithmMatchStatus;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  transmissionStatus: OrderSyncTransmissionStatus;
  matchScore: number;
  matchReason: string | null;
  mismatchFieldsJson: unknown;
  candidateOrdersJson: unknown;
  finalTrackingNumber: string | null;
  finalCarrierCode: string | null;
  finalCarrierName: string | null;
  excludedAt: Date | null;
  excludeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistShipmentUploadBatchResult = {
  batch: PersistedShipmentUploadBatch;
  rows: PersistedShipmentUploadRow[];
  matches: PersistedShipmentMatch[];
  rowCount: number;
  matchCount: number;
};

export type ShipmentUploadPersistTransactionClient = {
  shipmentUploadBatch: {
    create: (args: { data: Record<string, unknown> }) => Promise<PersistedShipmentUploadBatch>;
  };
  shipmentUploadRow: {
    create: (args: { data: Record<string, unknown> }) => Promise<PersistedShipmentUploadRow>;
  };
  shipmentMatch: {
    create: (args: { data: Record<string, unknown> }) => Promise<PersistedShipmentMatch>;
  };
};

export type ShipmentUploadPersistPrismaClient = {
  $transaction: <T>(
    fn: (tx: ShipmentUploadPersistTransactionClient) => Promise<T>,
  ) => Promise<T>;
};

const AUTO_EXCLUDED_STATUSES: ReadonlySet<ShipmentMatchStatus> = new Set([
  'DUPLICATE_TRACKING_NUMBER',
  'ALREADY_SHIPPED',
  'CANCELLED_OR_INVALID_ORDER',
]);

const STATUSES_WITHOUT_ORDER_LINK: ReadonlySet<ShipmentMatchStatus> = new Set([
  'NOT_MATCHED',
  'MULTIPLE_CANDIDATES',
  ...AUTO_EXCLUDED_STATUSES,
]);

export function toShipmentAlgorithmMatchStatus(
  status: ShipmentMatchStatus,
): ShipmentAlgorithmMatchStatus {
  return status as ShipmentAlgorithmMatchStatus;
}

export function resolveInitialUserConfirmationStatus(
  algorithmMatchStatus: ShipmentMatchStatus,
): ShipmentUserConfirmationStatus {
  if (AUTO_EXCLUDED_STATUSES.has(algorithmMatchStatus)) {
    return 'EXCLUDED';
  }
  return 'UNCONFIRMED';
}

export function resolvePersistedOrderSyncOrderId(input: {
  matchResult: ShipmentMatchResult;
  userId: string;
  provider?: OrderIntegrationProvider;
  integrationAccountId?: string;
  knownOrdersById?: ReadonlyMap<string, ShipmentUploadPersistOrderRef>;
}): string | null {
  const { matchResult } = input;
  if (STATUSES_WITHOUT_ORDER_LINK.has(matchResult.matchStatus)) {
    return null;
  }

  const orderId = matchResult.matchedOrderId?.trim();
  if (!orderId) return null;

  if (input.knownOrdersById) {
    const order = input.knownOrdersById.get(orderId);
    if (!order || order.userId !== input.userId) {
      return null;
    }
    if (input.provider && order.provider && order.provider !== input.provider) {
      return null;
    }
    if (
      input.integrationAccountId &&
      order.integrationAccountId &&
      order.integrationAccountId !== input.integrationAccountId
    ) {
      return null;
    }
  }

  return orderId;
}

export function serializeCandidateOrdersJson(
  candidates: ShipmentMatchCandidate[],
): Array<{
  orderId: string;
  score: number;
  reasons: string[];
  mismatchFields: string[];
}> {
  return candidates.map((candidate) => ({
    orderId: candidate.orderId,
    score: candidate.score,
    reasons: candidate.reasons,
    mismatchFields: candidate.mismatchFields,
  }));
}

function buildBatchStatus(rowCount: number): ShipmentUploadBatchStatus {
  return rowCount > 0 ? 'MATCHED' : 'PARSED';
}

function indexParsedRowsByOriginalIndex(
  parsedShipmentRows: ParsedShipmentRow[] | undefined,
): Map<number, ParsedShipmentRow> {
  const map = new Map<number, ParsedShipmentRow>();
  for (const row of parsedShipmentRows ?? []) {
    map.set(row.originalRowIndex, row);
  }
  return map;
}

function buildWarningsJson(
  parsedRow: ParsedShipmentRow | undefined,
  normalizedRow: NormalizedShipmentRow,
) {
  if (parsedRow?.warnings?.length) {
    return parsedRow.warnings;
  }
  if (normalizedRow.parseWarnings.length === 0) {
    return undefined;
  }
  return normalizedRow.parseWarnings.map((message) => ({
    code: 'PARSE_WARNING',
    message,
    rowIndex: normalizedRow.originalRowIndex,
  }));
}

function resolveExcludeMetadata(algorithmMatchStatus: ShipmentMatchStatus): {
  excludedAt: Date | null;
  excludeReason: string | null;
} {
  if (!AUTO_EXCLUDED_STATUSES.has(algorithmMatchStatus)) {
    return { excludedAt: null, excludeReason: null };
  }

  const reasonByStatus: Partial<Record<ShipmentMatchStatus, string>> = {
    DUPLICATE_TRACKING_NUMBER: '동일 업로드 파일 내 송장번호 중복',
    ALREADY_SHIPPED: '이미 송장이 등록된 주문',
    CANCELLED_OR_INVALID_ORDER: '취소 또는 전송 불가 주문',
  };

  return {
    excludedAt: new Date(),
    excludeReason: reasonByStatus[algorithmMatchStatus] ?? '자동 제외',
  };
}

export function buildKnownOrdersByIdFromSnapshots(
  snapshots: ReadonlyArray<OrderSyncOrderSnapshot>,
): Map<string, ShipmentUploadPersistOrderRef> {
  const map = new Map<string, ShipmentUploadPersistOrderRef>();
  for (const snapshot of snapshots) {
    map.set(snapshot.id, {
      userId: snapshot.userId,
      provider: snapshot.provider,
      integrationAccountId: snapshot.accountId ?? null,
    });
  }
  return map;
}

export function buildPersistShipmentUploadBatchInput(input: {
  userId: string;
  provider?: OrderIntegrationProvider;
  integrationAccountId?: string;
  file: {
    name: string;
    type: string;
    size: number;
    hash?: string | null;
  };
  parseResult: ShipmentParseResult;
  matchResults: ShipmentMatchResult[];
  orderSnapshots?: ReadonlyArray<OrderSyncOrderSnapshot>;
}): PersistShipmentUploadBatchInput | { error: string } {
  if (!input.parseResult.ok) {
    return { error: input.parseResult.error ?? '송장 파일 파싱 결과가 유효하지 않습니다.' };
  }

  return {
    userId: input.userId,
    provider: input.provider,
    integrationAccountId: input.integrationAccountId,
    file: input.file,
    parseResult: input.parseResult,
    normalizedShipmentRows: input.parseResult.file?.rows.map((row) => row.normalized) ?? [],
    parsedShipmentRows: input.parseResult.file?.rows,
    matchResults: input.matchResults,
    knownOrdersById: input.orderSnapshots
      ? buildKnownOrdersByIdFromSnapshots(input.orderSnapshots)
      : undefined,
  };
}

export function buildPersistShipmentUploadBatchInputFromMatchBody(input: {
  userId: string;
  provider?: OrderIntegrationProvider;
  integrationAccountId?: string;
  file: {
    name: string;
    type: string;
    size: number;
    hash?: string | null;
  };
  parseResult: ShipmentParseResult;
  matchBody: ShipmentMatchUploadSuccessResponse['match'];
  orderSnapshots?: ReadonlyArray<OrderSyncOrderSnapshot>;
}): PersistShipmentUploadBatchInput | { error: string } {
  return buildPersistShipmentUploadBatchInput({
    userId: input.userId,
    provider: input.provider,
    integrationAccountId: input.integrationAccountId,
    file: input.file,
    parseResult: input.parseResult,
    matchResults: input.matchBody.rows,
    orderSnapshots: input.orderSnapshots,
  });
}

/**
 * 송장 업로드·매칭 결과를 ShipmentUploadBatch / Row / Match에 저장합니다.
 *
 * 빈 rows 정책:
 * - batch는 생성하고 row/match는 0건을 반환합니다.
 * - status는 PARSED, rowCount=0입니다.
 */
export async function persistShipmentUploadBatch(
  client: ShipmentUploadPersistPrismaClient,
  input: PersistShipmentUploadBatchInput,
): Promise<PersistShipmentUploadBatchResult> {
  if (!input.userId.trim()) {
    throw new Error('userId는 필수입니다.');
  }
  if (!input.parseResult.ok) {
    throw new Error(input.parseResult.error ?? '송장 파일 파싱 결과가 유효하지 않습니다.');
  }

  const summary = summarizeShipmentMatchResults(input.matchResults);
  const parsedRowsByIndex = indexParsedRowsByOriginalIndex(input.parsedShipmentRows);
  const matchResultsByRowIndex = new Map(
    input.matchResults.map((match) => [match.shipmentRowIndex, match]),
  );

  return client.$transaction(async (tx) => {
    const batch = await tx.shipmentUploadBatch.create({
      data: {
        userId: input.userId,
        provider: input.provider ?? null,
        integrationAccountId: input.integrationAccountId ?? null,
        originalFileName: input.file.name,
        fileHash: input.file.hash ?? null,
        fileSize: input.file.size,
        fileType: input.file.type || null,
        rowCount: input.normalizedShipmentRows.length,
        matchedConfidentCount: summary.matchedConfidentCount,
        matchedWarningCount: summary.matchedWarningCount,
        multipleCandidatesCount: summary.multipleCandidatesCount,
        notMatchedCount: summary.notMatchedCount,
        duplicateTrackingNumberCount: summary.duplicateTrackingNumberCount,
        alreadyShippedCount: summary.alreadyShippedCount,
        cancelledOrInvalidOrderCount: summary.cancelledOrInvalidOrderCount,
        status: buildBatchStatus(input.normalizedShipmentRows.length),
      },
    });

    const rows: PersistedShipmentUploadRow[] = [];
    const matches: PersistedShipmentMatch[] = [];

    for (const normalizedRow of input.normalizedShipmentRows) {
      const parsedRow = parsedRowsByIndex.get(normalizedRow.originalRowIndex);
      const warningsJson = buildWarningsJson(parsedRow, normalizedRow);

      const uploadRow = await tx.shipmentUploadRow.create({
        data: {
          uploadBatchId: batch.id,
          userId: input.userId,
          originalRowIndex: normalizedRow.originalRowIndex,
          rawRowJson: parsedRow?.rawRow ?? {},
          trackingNumber: normalizedRow.trackingNumber,
          trackingNumberNormalized: normalizedRow.trackingNumberNormalized,
          carrierName: normalizedRow.carrierName || null,
          carrierCode: normalizedRow.standardCarrierCode || null,
          receiverName: normalizedRow.receiverName || null,
          receiverPhone: normalizedRow.receiverPhone || null,
          receiverPhoneNormalized: normalizedRow.receiverPhoneNormalized || null,
          receiverAddress: normalizedRow.receiverAddress || null,
          mallOrderNo: normalizedRow.mallOrderNo || null,
          excloadOrderNo: normalizedRow.excloadOrderNo || null,
          productText: normalizedRow.productText || null,
          warningsJson: warningsJson ?? undefined,
        },
      });
      rows.push(uploadRow);

      const matchResult = matchResultsByRowIndex.get(normalizedRow.originalRowIndex);
      if (!matchResult) {
        continue;
      }

      const algorithmMatchStatus = toShipmentAlgorithmMatchStatus(matchResult.matchStatus);
      const userConfirmationStatus = resolveInitialUserConfirmationStatus(matchResult.matchStatus);
      const orderSyncOrderId = resolvePersistedOrderSyncOrderId({
        matchResult,
        userId: input.userId,
        provider: input.provider,
        integrationAccountId: input.integrationAccountId,
        knownOrdersById: input.knownOrdersById,
      });
      const excludeMetadata = resolveExcludeMetadata(matchResult.matchStatus);

      const shipmentMatch = await tx.shipmentMatch.create({
        data: {
          uploadBatchId: batch.id,
          uploadRowId: uploadRow.id,
          userId: input.userId,
          orderSyncOrderId,
          provider: input.provider ?? null,
          integrationAccountId: input.integrationAccountId ?? null,
          algorithmMatchStatus,
          userConfirmationStatus,
          transmissionStatus: 'NONE',
          matchScore: matchResult.matchScore,
          matchReason: matchResult.matchReason || null,
          mismatchFieldsJson:
            matchResult.mismatchFields.length > 0 ? matchResult.mismatchFields : undefined,
          candidateOrdersJson:
            matchResult.candidates.length > 0
              ? serializeCandidateOrdersJson(matchResult.candidates)
              : undefined,
          finalTrackingNumber: normalizedRow.trackingNumber,
          finalCarrierCode: normalizedRow.standardCarrierCode || null,
          finalCarrierName: normalizedRow.carrierName || null,
          excludedAt: excludeMetadata.excludedAt,
          excludeReason: excludeMetadata.excludeReason,
        },
      });
      matches.push(shipmentMatch);
    }

    return {
      batch,
      rows,
      matches,
      rowCount: rows.length,
      matchCount: matches.length,
    };
  });
}
