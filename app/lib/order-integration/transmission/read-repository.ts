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
    updateMany?: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
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

/**
 * 확정·연결만 되고 transmissionStatus가 NONE인 행을 실전송 직전에 READY로 승격.
 * (확정 API가 READY를 못 올린 기존 배치·MANUALLY_LINKED 등 대비)
 */
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
