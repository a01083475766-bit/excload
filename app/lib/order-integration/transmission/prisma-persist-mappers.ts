import type {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentTransmissionAttemptStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

import type {
  ShipmentTransmissionAttemptRow,
  ShipmentTransmissionMatchRow,
} from '@/app/lib/order-integration/transmission/repository';
import type { ShipmentTransmissionResponseSummary } from '@/app/lib/order-integration/transmission/types';

export const SHIPMENT_MATCH_PERSIST_SELECT = {
  id: true,
  userId: true,
  uploadBatchId: true,
  provider: true,
  integrationAccountId: true,
  orderSyncOrderId: true,
  transmissionStatus: true,
  transmissionLeaseToken: true,
  transmissionLeaseExpiresAt: true,
  lastTransmissionAttemptAt: true,
  transmissionErrorMessage: true,
} as const;

export const SHIPMENT_ATTEMPT_PERSIST_SELECT = {
  id: true,
  userId: true,
  shipmentMatchId: true,
  orderSyncOrderId: true,
  uploadBatchId: true,
  provider: true,
  integrationAccountId: true,
  mallOrderNo: true,
  excloadOrderNo: true,
  mallLineItemIdsJson: true,
  trackingNumberNormalized: true,
  courierCode: true,
  courierName: true,
  payloadFingerprint: true,
  fingerprintVersion: true,
  attemptNo: true,
  status: true,
  providerRequestId: true,
  responseSummaryJson: true,
  errorCode: true,
  errorMessage: true,
  retryable: true,
  executionToken: true,
  startedAt: true,
  dispatchedAt: true,
  completedAt: true,
} as const;

export type ShipmentMatchPersistSelected = {
  id: string;
  userId: string;
  uploadBatchId: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  orderSyncOrderId: string | null;
  transmissionStatus: OrderSyncTransmissionStatus;
  transmissionLeaseToken: string | null;
  transmissionLeaseExpiresAt: Date | null;
  lastTransmissionAttemptAt: Date | null;
  transmissionErrorMessage: string | null;
};

export type ShipmentAttemptPersistSelected = {
  id: string;
  userId: string;
  shipmentMatchId: string;
  orderSyncOrderId: string | null;
  uploadBatchId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  mallOrderNo: string;
  excloadOrderNo: string;
  mallLineItemIdsJson: Prisma.JsonValue | null;
  trackingNumberNormalized: string;
  courierCode: string | null;
  courierName: string | null;
  payloadFingerprint: string;
  fingerprintVersion: number;
  attemptNo: number;
  status: ShipmentTransmissionAttemptStatus;
  providerRequestId: string | null;
  responseSummaryJson: Prisma.JsonValue | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  executionToken: string;
  startedAt: Date;
  dispatchedAt: Date | null;
  completedAt: Date | null;
};

export function mapShipmentMatchPersistRow(
  row: ShipmentMatchPersistSelected,
): ShipmentTransmissionMatchRow {
  return { ...row };
}

export function mapShipmentAttemptPersistRow(
  row: ShipmentAttemptPersistSelected,
): ShipmentTransmissionAttemptRow {
  return {
    ...row,
    mallLineItemIdsJson: row.mallLineItemIdsJson,
    responseSummaryJson: row.responseSummaryJson,
  };
}

/**
 * mallLineItemIdsJson 정책:
 * - null/undefined/비배열 → SQL NULL (`Prisma.DbNull`) — “없음”
 * - [] → JSON 빈 배열 — “명시적 빈 목록”
 * - string[] → 그대로 저장 (비문자는 제거)
 * JSON literal null(`Prisma.JsonNull`)은 사용하지 않음.
 */
export function toMallLineItemIdsJsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value == null) return Prisma.DbNull;
  if (!Array.isArray(value)) return Prisma.DbNull;
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * responseSummaryJson 정책:
 * - null/undefined/비객체 → SQL NULL (`Prisma.DbNull`)
 * - allowlist 객체 → JSON object
 * - `Prisma.JsonNull`(JSON literal null) 미사용
 */
export function toResponseSummaryJsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value == null) return Prisma.DbNull;
  if (typeof value !== 'object' || Array.isArray(value)) return Prisma.DbNull;
  const summary = value as ShipmentTransmissionResponseSummary;
  const out: Record<string, unknown> = {};
  if ('httpStatus' in summary) out.httpStatus = summary.httpStatus ?? null;
  if ('providerStatusCode' in summary) {
    out.providerStatusCode = summary.providerStatusCode ?? null;
  }
  if ('providerRequestId' in summary) {
    out.providerRequestId = summary.providerRequestId ?? null;
  }
  if ('message' in summary) out.message = summary.message ?? null;
  if ('itemResults' in summary && Array.isArray(summary.itemResults)) {
    out.itemResults = summary.itemResults;
  }
  return Object.keys(out).length > 0
    ? (out as Prisma.InputJsonValue)
    : Prisma.DbNull;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return String(value);
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value instanceof Date ? value : undefined;
}

/**
 * Attempt create — 허용 필드만 명시 구성. 추가 key는 전달되지 않음.
 */
export function toAttemptCreateData(
  data: Record<string, unknown>,
): Prisma.ShipmentTransmissionAttemptUncheckedCreateInput {
  return {
    ...(typeof data.id === 'string' ? { id: data.id } : {}),
    userId: String(data.userId),
    shipmentMatchId: String(data.shipmentMatchId),
    orderSyncOrderId: optionalString(data.orderSyncOrderId) ?? null,
    uploadBatchId: String(data.uploadBatchId),
    provider: data.provider as OrderIntegrationProvider,
    integrationAccountId: optionalString(data.integrationAccountId) ?? null,
    mallOrderNo: String(data.mallOrderNo),
    excloadOrderNo: String(data.excloadOrderNo),
    mallLineItemIdsJson: toMallLineItemIdsJsonValue(data.mallLineItemIdsJson),
    trackingNumberNormalized: String(data.trackingNumberNormalized),
    courierCode: optionalString(data.courierCode) ?? null,
    courierName: optionalString(data.courierName) ?? null,
    payloadFingerprint: String(data.payloadFingerprint),
    fingerprintVersion:
      typeof data.fingerprintVersion === 'number' ? data.fingerprintVersion : 1,
    attemptNo: Number(data.attemptNo),
    status: data.status as ShipmentTransmissionAttemptStatus,
    providerRequestId: optionalString(data.providerRequestId) ?? null,
    responseSummaryJson: toResponseSummaryJsonValue(data.responseSummaryJson),
    errorCode: optionalString(data.errorCode) ?? null,
    errorMessage: optionalString(data.errorMessage) ?? null,
    retryable: Boolean(data.retryable),
    executionToken: String(data.executionToken),
    startedAt: data.startedAt instanceof Date ? data.startedAt : new Date(),
    dispatchedAt: optionalDate(data.dispatchedAt) ?? null,
    completedAt: optionalDate(data.completedAt) ?? null,
  };
}

/**
 * Attempt updateMany data — 키가 있을 때만 포함 (미포함 = 필드 미변경).
 * responseSummaryJson: null → DbNull(SQL NULL). 키 없음 → 생략.
 */
export function toAttemptUpdateData(
  data: Record<string, unknown>,
): Prisma.ShipmentTransmissionAttemptUncheckedUpdateManyInput {
  const out: Prisma.ShipmentTransmissionAttemptUncheckedUpdateManyInput = {};

  if ('status' in data) {
    out.status = data.status as ShipmentTransmissionAttemptStatus;
  }
  if ('providerRequestId' in data) {
    out.providerRequestId = optionalString(data.providerRequestId) ?? null;
  }
  if ('responseSummaryJson' in data) {
    out.responseSummaryJson = toResponseSummaryJsonValue(data.responseSummaryJson);
  }
  if ('mallLineItemIdsJson' in data) {
    out.mallLineItemIdsJson = toMallLineItemIdsJsonValue(data.mallLineItemIdsJson);
  }
  if ('errorCode' in data) out.errorCode = optionalString(data.errorCode) ?? null;
  if ('errorMessage' in data) {
    out.errorMessage = optionalString(data.errorMessage) ?? null;
  }
  if ('retryable' in data) out.retryable = Boolean(data.retryable);
  if ('executionToken' in data) out.executionToken = String(data.executionToken);
  if ('dispatchedAt' in data) out.dispatchedAt = optionalDate(data.dispatchedAt) ?? null;
  if ('completedAt' in data) out.completedAt = optionalDate(data.completedAt) ?? null;
  if ('startedAt' in data && data.startedAt instanceof Date) {
    out.startedAt = data.startedAt;
  }

  return out;
}

function mapLeaseExpiryClause(
  clause: Record<string, unknown>,
): Prisma.ShipmentMatchWhereInput | null {
  if (!Object.prototype.hasOwnProperty.call(clause, 'transmissionLeaseExpiresAt')) {
    return null;
  }
  const v = clause.transmissionLeaseExpiresAt;
  if (v === null) return { transmissionLeaseExpiresAt: null };
  if (v && typeof v === 'object' && 'lt' in v && (v as { lt: unknown }).lt instanceof Date) {
    return { transmissionLeaseExpiresAt: { lt: (v as { lt: Date }).lt } };
  }
  return null;
}

/** Match where — 허용 키만. OR는 lease expiry 전용으로만 매핑. */
export function toMatchWhereInput(
  where: Record<string, unknown>,
): Prisma.ShipmentMatchWhereInput {
  const out: Prisma.ShipmentMatchWhereInput = {};
  if ('id' in where) out.id = String(where.id);
  if ('userId' in where) out.userId = String(where.userId);
  if ('uploadBatchId' in where) out.uploadBatchId = String(where.uploadBatchId);
  if ('provider' in where) {
    out.provider = where.provider as OrderIntegrationProvider | null;
  }
  if ('integrationAccountId' in where) {
    // null → IS NULL, string → equality (undefined 키는 넣지 않음)
    out.integrationAccountId =
      where.integrationAccountId == null
        ? null
        : String(where.integrationAccountId);
  }
  if ('orderSyncOrderId' in where) {
    out.orderSyncOrderId =
      where.orderSyncOrderId == null ? null : String(where.orderSyncOrderId);
  }
  if ('transmissionStatus' in where) {
    out.transmissionStatus = where.transmissionStatus as OrderSyncTransmissionStatus;
  }
  if ('transmissionLeaseToken' in where) {
    out.transmissionLeaseToken =
      where.transmissionLeaseToken == null
        ? null
        : String(where.transmissionLeaseToken);
  }
  if (Array.isArray(where.OR)) {
    const or = (where.OR as Record<string, unknown>[])
      .map(mapLeaseExpiryClause)
      .filter((c): c is Prisma.ShipmentMatchWhereInput => c != null);
    if (or.length > 0) out.OR = or;
  }
  return out;
}

export function toMatchUpdateData(
  data: Record<string, unknown>,
): Prisma.ShipmentMatchUpdateManyMutationInput {
  const out: Prisma.ShipmentMatchUpdateManyMutationInput = {};
  if ('transmissionStatus' in data) {
    out.transmissionStatus = data.transmissionStatus as OrderSyncTransmissionStatus;
  }
  if ('transmissionLeaseToken' in data) {
    out.transmissionLeaseToken =
      data.transmissionLeaseToken == null
        ? null
        : String(data.transmissionLeaseToken);
  }
  if ('transmissionLeaseExpiresAt' in data) {
    out.transmissionLeaseExpiresAt = optionalDate(data.transmissionLeaseExpiresAt) ?? null;
  }
  if ('lastTransmissionAttemptAt' in data) {
    out.lastTransmissionAttemptAt =
      optionalDate(data.lastTransmissionAttemptAt) ?? null;
  }
  if ('transmissionErrorMessage' in data) {
    out.transmissionErrorMessage =
      data.transmissionErrorMessage == null
        ? null
        : String(data.transmissionErrorMessage);
  }
  return out;
}

export function toAttemptWhereInput(
  where: Record<string, unknown>,
): Prisma.ShipmentTransmissionAttemptWhereInput {
  const out: Prisma.ShipmentTransmissionAttemptWhereInput = {};
  if ('id' in where) out.id = String(where.id);
  if ('userId' in where) out.userId = String(where.userId);
  if ('shipmentMatchId' in where) out.shipmentMatchId = String(where.shipmentMatchId);
  if ('status' in where) {
    out.status = where.status as ShipmentTransmissionAttemptStatus;
  }
  if ('executionToken' in where) out.executionToken = String(where.executionToken);
  if ('dispatchedAt' in where) {
    out.dispatchedAt =
      where.dispatchedAt === null
        ? null
        : where.dispatchedAt instanceof Date
          ? where.dispatchedAt
          : undefined;
  }
  return out;
}

export function toOrderWhereInput(
  where: Record<string, unknown>,
): Prisma.OrderSyncOrderWhereInput {
  const out: Prisma.OrderSyncOrderWhereInput = {};
  if ('id' in where) out.id = String(where.id);
  if ('userId' in where) out.userId = String(where.userId);
  if ('transmissionStatus' in where) {
    out.transmissionStatus = where.transmissionStatus as OrderSyncTransmissionStatus;
  }
  if ('piiClearedAt' in where) {
    out.piiClearedAt = where.piiClearedAt === null ? null : (where.piiClearedAt as Date);
  }
  return out;
}

export function toOrderUpdateData(
  data: Record<string, unknown>,
): Prisma.OrderSyncOrderUpdateManyMutationInput {
  const out: Prisma.OrderSyncOrderUpdateManyMutationInput = {};
  if ('transmissionStatus' in data) {
    out.transmissionStatus = data.transmissionStatus as OrderSyncTransmissionStatus;
  }
  if ('receiverName' in data) {
    out.receiverName = data.receiverName === null ? null : String(data.receiverName);
  }
  if ('receiverPhone' in data) {
    out.receiverPhone = data.receiverPhone === null ? null : String(data.receiverPhone);
  }
  if ('receiverAddress' in data) {
    out.receiverAddress = data.receiverAddress === null ? null : String(data.receiverAddress);
  }
  if ('deliveryMemo' in data) {
    out.deliveryMemo = data.deliveryMemo === null ? null : String(data.deliveryMemo);
  }
  if ('productSummary' in data) {
    out.productSummary = data.productSummary === null ? null : String(data.productSummary);
  }
  if ('rawPayloadJson' in data) {
    out.rawPayloadJson =
      data.rawPayloadJson === null ? Prisma.DbNull : (data.rawPayloadJson as Prisma.InputJsonValue);
  }
  if ('piiClearedAt' in data) {
    out.piiClearedAt = data.piiClearedAt === null ? null : (data.piiClearedAt as Date);
  }
  return out;
}
