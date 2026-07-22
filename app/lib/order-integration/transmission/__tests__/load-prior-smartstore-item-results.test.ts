import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import {
  createPrismaPriorSmartstoreItemResultsLoader,
  type PriorSmartstoreItemResultsPrismaClient,
} from '@/app/lib/order-integration/transmission/load-prior-smartstore-item-results';

type PriorFindMany = PriorSmartstoreItemResultsPrismaClient['shipmentTransmissionAttempt']['findMany'];

function loaderWithFindMany(findMany: PriorFindMany) {
  return createPrismaPriorSmartstoreItemResultsLoader({
    shipmentTransmissionAttempt: { findMany },
  });
}

describe('createPrismaPriorSmartstoreItemResultsLoader', () => {
  it('keeps PrismaClient assignable to the loader client type', () => {
    type Assignable = PrismaClient extends PriorSmartstoreItemResultsPrismaClient ? true : false;
    const assignable: Assignable = true;
    expect(assignable).toBe(true);
  });

  it('isolates by integrationAccountId and merges SUCCESS/ALREADY_DISPATCHED only', async () => {
    const findMany = vi.fn(async () => [
      {
        shipmentMatchId: 'match-a',
        attemptNo: 2,
        responseSummaryJson: {
          itemResults: [
            {
              productOrderId: 'PO-1',
              status: 'SUCCESS',
              shipmentFingerprint: 'fp-1',
              message: 'ok',
            },
            {
              productOrderId: 'PO-2',
              status: 'UNCERTAIN',
              shipmentFingerprint: 'fp-2',
              message: 'uncertain',
            },
          ],
        },
      },
      {
        shipmentMatchId: 'match-b',
        attemptNo: 1,
        responseSummaryJson: {
          itemResults: [
            {
              productOrderId: 'PO-3',
              status: 'ALREADY_DISPATCHED',
              shipmentFingerprint: 'fp-3',
              message: 'already',
            },
          ],
        },
      },
    ]) as unknown as PriorFindMany;

    const loader = loaderWithFindMany(findMany);

    const result = await loader({
      userId: 'user-1',
      matchIds: ['match-a', 'match-b'],
      integrationAccountId: 'acc-1',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          integrationAccountId: 'acc-1',
          status: { in: ['SUCCESS', 'FAILED', 'UNKNOWN'] },
        }),
        select: {
          shipmentMatchId: true,
          attemptNo: true,
          responseSummaryJson: true,
        },
      }),
    );

    const matchA = result.get('match-a') ?? [];
    expect(matchA.some((row) => row.productOrderId === 'PO-1' && row.status === 'SUCCESS')).toBe(
      true,
    );
    expect(matchA.some((row) => row.productOrderId === 'PO-2' && row.status === 'UNCERTAIN')).toBe(
      true,
    );
    expect(matchA.some((row) => row.productOrderId === 'PO-3')).toBe(true);

    const matchB = result.get('match-b') ?? [];
    expect(matchB.some((row) => row.status === 'ALREADY_DISPATCHED')).toBe(true);
  });

  it('scopes by matchIds when integrationAccountId is omitted', async () => {
    const findMany = vi.fn(async () => []) as unknown as PriorFindMany;
    const loader = loaderWithFindMany(findMany);

    await loader({ userId: 'user-1', matchIds: ['m1', 'm2'] });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          shipmentMatchId: { in: ['m1', 'm2'] },
          status: { in: ['SUCCESS', 'FAILED', 'UNKNOWN'] },
        },
      }),
    );
  });

  it('returns empty map without querying when matchIds is empty', async () => {
    const findMany = vi.fn(async () => []) as unknown as PriorFindMany;
    const loader = loaderWithFindMany(findMany);

    const result = await loader({ userId: 'user-1', matchIds: [] });
    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
