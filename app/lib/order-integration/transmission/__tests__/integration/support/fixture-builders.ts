/**
 * Pure fixture field builders (no Prisma / no DB).
 * Used by unit tests and by createReadyTransmissionFixture.
 */

import type { OrderIntegrationProvider } from '@prisma/client';

import {
  buildItAccountName,
  buildItEmail,
  buildItExcloadOrderNo,
  buildItFileName,
  buildItMallOrderNo,
  buildItName,
  buildItTrackingNumber,
  buildItVendorId,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/ids';

export const IT_PROVIDER: OrderIntegrationProvider = 'COUPANG';

/** Non-PII placeholder JSON only */
export const IT_EMPTY_JSON = {} as const;

export type ReadyFixtureSlot = {
  runId: string;
  slot: string;
};

export function buildUserCreateData(input: ReadyFixtureSlot) {
  return {
    email: buildItEmail(input.runId, input.slot),
    name: buildItName(input.runId, input.slot),
    phone: null as string | null,
    passwordHash: null as string | null,
  };
}

export function buildAccountCreateData(input: ReadyFixtureSlot & { userId: string }) {
  return {
    userId: input.userId,
    provider: IT_PROVIDER,
    accountName: buildItAccountName(input.runId),
    vendorId: buildItVendorId(input.runId),
    status: 'INACTIVE' as const,
    // No credential cipher fields — schema optional
    accessKeyCiphertext: null as string | null,
    secretKeyCiphertext: null as string | null,
    apiKeyCiphertext: null as string | null,
  };
}

export function buildOrderBatchCreateData(input: ReadyFixtureSlot & {
  userId: string;
  integrationAccountId: string;
}) {
  return {
    userId: input.userId,
    provider: IT_PROVIDER,
    integrationAccountId: input.integrationAccountId,
    sourceType: 'API' as const,
    orderCount: 1,
    status: 'ACTIVE' as const,
    memo: `it-${input.runId}-${input.slot}`,
  };
}

export function buildOrderCreateData(input: ReadyFixtureSlot & {
  userId: string;
  batchId: string;
  integrationAccountId: string;
}) {
  return {
    batchId: input.batchId,
    userId: input.userId,
    provider: IT_PROVIDER,
    integrationAccountId: input.integrationAccountId,
    excloadOrderNo: buildItExcloadOrderNo(input.runId, input.slot),
    mallOrderNo: buildItMallOrderNo(input.runId, input.slot),
    mallOrderId: null as string | null,
    mallLineItemIds: ['IT-LINE-1'],
    receiverName: null as string | null,
    receiverPhone: null as string | null,
    receiverAddress: null as string | null,
    productSummary: 'IT-PRODUCT',
    quantity: 1,
    deliveryMemo: null as string | null,
    rawPayloadJson: IT_EMPTY_JSON,
    normalizedPayloadJson: IT_EMPTY_JSON,
    transmissionStatus: 'NONE' as const,
  };
}

export function buildUploadBatchCreateData(input: ReadyFixtureSlot & {
  userId: string;
  integrationAccountId: string;
}) {
  return {
    userId: input.userId,
    provider: IT_PROVIDER,
    integrationAccountId: input.integrationAccountId,
    originalFileName: buildItFileName(input.runId, input.slot),
    fileSize: 32,
    fileType: 'text/csv',
    rowCount: 1,
    status: 'MATCHED' as const,
  };
}

export function buildUploadRowCreateData(input: ReadyFixtureSlot & {
  userId: string;
  uploadBatchId: string;
  mallOrderNo: string;
  excloadOrderNo: string;
}) {
  const tracking = buildItTrackingNumber(input.runId, input.slot);
  return {
    uploadBatchId: input.uploadBatchId,
    userId: input.userId,
    originalRowIndex: 0,
    rawRowJson: IT_EMPTY_JSON,
    trackingNumber: tracking,
    trackingNumberNormalized: tracking,
    carrierName: 'IT-CARRIER',
    carrierCode: 'CJ',
    receiverName: null as string | null,
    receiverPhone: null as string | null,
    receiverAddress: null as string | null,
    mallOrderNo: input.mallOrderNo,
    excloadOrderNo: input.excloadOrderNo,
    productText: 'IT-PRODUCT',
    warningsJson: undefined,
  };
}

export function buildReadyMatchCreateData(input: ReadyFixtureSlot & {
  userId: string;
  uploadBatchId: string;
  uploadRowId: string;
  orderSyncOrderId: string;
  integrationAccountId: string;
  trackingNumber: string;
}) {
  return {
    uploadBatchId: input.uploadBatchId,
    uploadRowId: input.uploadRowId,
    userId: input.userId,
    orderSyncOrderId: input.orderSyncOrderId,
    provider: IT_PROVIDER,
    integrationAccountId: input.integrationAccountId,
    algorithmMatchStatus: 'MATCHED_CONFIDENT' as const,
    userConfirmationStatus: 'CONFIRMED' as const,
    transmissionStatus: 'READY' as const,
    matchScore: 100,
    matchReason: 'it-fixture',
    finalTrackingNumber: input.trackingNumber,
    finalCarrierCode: 'CJ',
    finalCarrierName: 'IT-CARRIER',
    confirmedAt: new Date('2026-07-10T00:00:00.000Z'),
    transmissionLeaseToken: null as string | null,
    transmissionLeaseExpiresAt: null as Date | null,
    transmissionErrorMessage: null as string | null,
  };
}

/** Detect accidental non-null PII / credential values in fixture payloads (unit tests). */
export function fixturePayloadLooksSensitive(payload: unknown): boolean {
  const walk = (value: unknown, keyHint: string): boolean => {
    if (value == null) return false;
    if (typeof value === 'string') {
      const k = keyHint.toLowerCase();
      if (
        (k.includes('phone') || k.includes('address') || k.includes('receiver')) &&
        value.trim().length > 0
      ) {
        return true;
      }
      if (
        (k.includes('cipher') || k.includes('secret') || k.includes('password') || k.includes('credential')) &&
        value.trim().length > 0
      ) {
        return true;
      }
      return false;
    }
    if (Array.isArray(value)) {
      return value.some((item, i) => walk(item, `${keyHint}[${i}]`));
    }
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).some(([k, v]) =>
        walk(v, k),
      );
    }
    return false;
  };
  return walk(payload, 'root');
}
