/**
 * Prisma loader for transmission verify (B).
 */

import type { OrderIntegrationProvider, PrismaClient } from '@prisma/client';

import type {
  VerifyTransmissionAttemptRecord,
  VerifyTransmissionServiceDeps,
} from '@/app/lib/order-integration/transmission/verify-transmission-status';

type VerifyPrismaClient = Pick<PrismaClient, 'shipmentTransmissionAttempt' | 'orderIntegrationAccount'>;

export function createVerifyTransmissionFindAttempts(
  client: VerifyPrismaClient,
): VerifyTransmissionServiceDeps['findAttempts'] {
  return async ({ userId, batchId, attemptIds }) => {
    const rows = await client.shipmentTransmissionAttempt.findMany({
      where: {
        userId,
        uploadBatchId: batchId,
        id: { in: attemptIds },
      },
      select: {
        id: true,
        userId: true,
        uploadBatchId: true,
        provider: true,
        integrationAccountId: true,
        status: true,
        mallOrderNo: true,
        mallLineItemIdsJson: true,
        trackingNumberNormalized: true,
        orderSyncOrder: {
          select: {
            mallLineItemIds: true,
            normalizedPayloadJson: true,
          },
        },
      },
    });

    return rows as VerifyTransmissionAttemptRecord[];
  };
}

export function createVerifyTransmissionAccountLoader(
  client: VerifyPrismaClient,
): VerifyTransmissionServiceDeps['loadAccount'] {
  return ({ userId, accountId, provider }) =>
    client.orderIntegrationAccount.findFirst({
      where: {
        id: accountId,
        userId,
        provider: provider as OrderIntegrationProvider,
      },
    });
}
