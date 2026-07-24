import type { OrderIntegrationProvider } from '@prisma/client';

import type {
  MockTransmitBatchRecord,
  MockTransmitMatchRecord,
  MockTransmitReadRepository,
} from '@/app/lib/order-integration/transmission/mock-transmit-service';

export type ShipmentTransmissionReadPrismaClient = {
  shipmentUploadBatch: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: Record<string, boolean>;
    }) => Promise<MockTransmitBatchRecord | null>;
  };
  shipmentMatch: {
    findMany: (args: {
      where: { uploadBatchId: string; userId: string; id: { in: string[] } };
      select: Record<string, unknown>;
    }) => Promise<MockTransmitMatchRecord[]>;
    findFirst?: (args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }) => Promise<{
      id: string;
      userId: string;
      uploadBatchId: string;
      orderSyncOrderId: string | null;
      provider: OrderIntegrationProvider | null;
      integrationAccountId: string | null;
      transmissionStatus: string;
    } | null>;
    updateMany?: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  orderSyncOrder?: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: Record<string, boolean>;
    }) => Promise<{
      id: string;
      userId: string;
      provider: OrderIntegrationProvider;
      integrationAccountId: string | null;
    } | null>;
  };
  orderIntegrationAccount: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: Record<string, boolean>;
    }) => Promise<{
      accessKeyCiphertext: string | null;
      apiKeyCiphertext: string | null;
      secretKeyCiphertext: string | null;
    } | null>;
  };
};

export function createShipmentTransmissionReadRepository(
  client: ShipmentTransmissionReadPrismaClient,
): MockTransmitReadRepository {
  return {
    async findBatchForMockTransmit(input) {
      return client.shipmentUploadBatch.findFirst({
        where: { id: input.batchId, userId: input.userId },
        select: {
          id: true,
          userId: true,
          provider: true,
          integrationAccountId: true,
          status: true,
          originalFileName: true,
        },
      });
    },
    async findMatchesForMockTransmit(input) {
      return client.shipmentMatch.findMany({
        where: {
          uploadBatchId: input.batchId,
          userId: input.userId,
          id: { in: input.matchIds },
        },
        select: {
          id: true,
          userId: true,
          uploadBatchId: true,
          provider: true,
          integrationAccountId: true,
          userConfirmationStatus: true,
          transmissionStatus: true,
          orderSyncOrderId: true,
          finalTrackingNumber: true,
          finalCarrierCode: true,
          finalCarrierName: true,
          uploadRow: {
            select: {
              trackingNumber: true,
              carrierCode: true,
              carrierName: true,
            },
          },
          orderSyncOrder: {
            select: {
              id: true,
              userId: true,
              provider: true,
              integrationAccountId: true,
              mallOrderNo: true,
              excloadOrderNo: true,
              mallLineItemIds: true,
            },
          },
        },
      });
    },
    async resolveCredentialConfigured(input) {
      const account = await client.orderIntegrationAccount.findFirst({
        where: { id: input.integrationAccountId, userId: input.userId },
        select: {
          accessKeyCiphertext: true,
          apiKeyCiphertext: true,
          secretKeyCiphertext: true,
        },
      });
      return Boolean(
        account?.accessKeyCiphertext ||
          account?.apiKeyCiphertext ||
          account?.secretKeyCiphertext,
      );
    },
  };
}

export async function prepareFailedShipmentMatchRetry(
  client: ShipmentTransmissionReadPrismaClient,
  input: { userId: string; batchId: string; matchId: string },
): Promise<boolean> {
  const updated = await client.shipmentMatch.updateMany?.({
    where: {
      id: input.matchId,
      userId: input.userId,
      uploadBatchId: input.batchId,
      transmissionStatus: 'FAILED',
    },
    data: {
      transmissionStatus: 'READY',
      transmissionErrorMessage: null,
      transmissionLeaseToken: null,
      transmissionLeaseExpiresAt: null,
    },
  });
  return updated?.count === 1;
}

export type PrepareShipmentMatchForTransmitReasonCode =
  | 'MATCH_NOT_FOUND'
  | 'STATUS_NOT_PREPARABLE'
  | 'SCOPE_CONFLICT'
  | 'ORDER_NOT_LINKED'
  | 'ORDER_SCOPE_MISMATCH'
  | 'UPDATE_FAILED';

export type PrepareShipmentMatchForTransmitResult =
  | { ok: true; reasonCode: null }
  | { ok: false; reasonCode: PrepareShipmentMatchForTransmitReasonCode };

function sameNullableScope(
  existing: string | null | undefined,
  expected: string,
): boolean {
  const left = existing?.trim() || '';
  if (!left) return true;
  return left === expected.trim();
}

/**
 * 실전송 직전 Match scope 준비.
 * - null provider/account만 candidate로 보완
 * - 기존 값이 candidate와 같으면 유지(READY 승격만)
 * - 기존 값이 다르면 덮어쓰지 않고 차단
 * - SENT/PROCESSING/UNKNOWN 등 변경 금지
 * - updateMany where로 null|equal 원자 조건 적용
 */
export async function prepareShipmentMatchForTransmit(
  client: ShipmentTransmissionReadPrismaClient,
  input: {
    userId: string;
    batchId: string;
    matchId: string;
    provider: OrderIntegrationProvider;
    integrationAccountId: string;
  },
): Promise<PrepareShipmentMatchForTransmitResult> {
  const provider = input.provider;
  const integrationAccountId = input.integrationAccountId.trim();
  if (!integrationAccountId) {
    return { ok: false, reasonCode: 'SCOPE_CONFLICT' };
  }

  const match = await client.shipmentMatch.findFirst?.({
    where: {
      id: input.matchId,
      userId: input.userId,
      uploadBatchId: input.batchId,
    },
    select: {
      id: true,
      userId: true,
      uploadBatchId: true,
      orderSyncOrderId: true,
      provider: true,
      integrationAccountId: true,
      transmissionStatus: true,
    },
  });

  if (!match) {
    return { ok: false, reasonCode: 'MATCH_NOT_FOUND' };
  }

  if (match.transmissionStatus !== 'NONE' && match.transmissionStatus !== 'READY') {
    return { ok: false, reasonCode: 'STATUS_NOT_PREPARABLE' };
  }

  if (!sameNullableScope(match.provider, provider)) {
    return { ok: false, reasonCode: 'SCOPE_CONFLICT' };
  }
  if (!sameNullableScope(match.integrationAccountId, integrationAccountId)) {
    return { ok: false, reasonCode: 'SCOPE_CONFLICT' };
  }

  const orderId = match.orderSyncOrderId?.trim() || '';
  if (!orderId) {
    return { ok: false, reasonCode: 'ORDER_NOT_LINKED' };
  }

  const order = await client.orderSyncOrder?.findFirst({
    where: { id: orderId, userId: input.userId },
    select: {
      id: true,
      userId: true,
      provider: true,
      integrationAccountId: true,
    },
  });

  if (!order) {
    return { ok: false, reasonCode: 'ORDER_NOT_LINKED' };
  }

  if (order.provider !== provider) {
    return { ok: false, reasonCode: 'ORDER_SCOPE_MISMATCH' };
  }
  if (
    order.integrationAccountId?.trim() &&
    order.integrationAccountId.trim() !== integrationAccountId
  ) {
    return { ok: false, reasonCode: 'ORDER_SCOPE_MISMATCH' };
  }

  const updated = await client.shipmentMatch.updateMany?.({
    where: {
      id: input.matchId,
      userId: input.userId,
      uploadBatchId: input.batchId,
      transmissionStatus: { in: ['NONE', 'READY'] },
      AND: [
        { OR: [{ provider: null }, { provider }] },
        {
          OR: [
            { integrationAccountId: null },
            { integrationAccountId },
          ],
        },
      ],
    },
    data: {
      provider,
      integrationAccountId,
      transmissionStatus: 'READY',
      transmissionErrorMessage: null,
      transmissionLeaseToken: null,
      transmissionLeaseExpiresAt: null,
    },
  });

  if (updated?.count !== 1) {
    return { ok: false, reasonCode: 'UPDATE_FAILED' };
  }

  return { ok: true, reasonCode: null };
}

/** @deprecated use prepareShipmentMatchForTransmit */
export async function prepareNoneShipmentMatchForTransmit(
  client: ShipmentTransmissionReadPrismaClient,
  input: { userId: string; batchId: string; matchId: string },
): Promise<boolean> {
  const updated = await client.shipmentMatch.updateMany?.({
    where: {
      id: input.matchId,
      userId: input.userId,
      uploadBatchId: input.batchId,
      transmissionStatus: 'NONE',
    },
    data: {
      transmissionStatus: 'READY',
      transmissionErrorMessage: null,
      transmissionLeaseToken: null,
      transmissionLeaseExpiresAt: null,
    },
  });
  return updated?.count === 1;
}

export type ShipmentTransmissionAttemptQueryClient = {
  shipmentTransmissionAttempt: {
    findMany: (args: {
      where: { userId: string; uploadBatchId: string };
      orderBy: { startedAt: 'desc' };
      take: number;
      select: Record<string, boolean>;
    }) => Promise<
      Array<{
        id: string;
        shipmentMatchId: string;
        provider: OrderIntegrationProvider;
        attemptNo: number;
        status: string;
        errorCode: string | null;
        errorMessage: string | null;
        retryable: boolean;
        providerRequestId: string | null;
        startedAt: Date;
        completedAt: Date | null;
      }>
    >;
  };
};

export async function loadShipmentTransmissionAttemptResults(
  client: ShipmentTransmissionAttemptQueryClient,
  input: { userId: string; batchId: string; limit?: number },
) {
  const rows = await client.shipmentTransmissionAttempt.findMany({
    where: { userId: input.userId, uploadBatchId: input.batchId },
    orderBy: { startedAt: 'desc' },
    take: Math.min(Math.max(input.limit ?? 100, 1), 500),
    select: {
      id: true,
      shipmentMatchId: true,
      provider: true,
      attemptNo: true,
      status: true,
      errorCode: true,
      errorMessage: true,
      retryable: true,
      providerRequestId: true,
      startedAt: true,
      completedAt: true,
    },
  });

  return {
    success: true as const,
    batchId: input.batchId,
    attempts: rows.map((row) => ({
      ...row,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
  };
}
