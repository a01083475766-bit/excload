import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderIntegrationAccount } from '@prisma/client';

const fetchByIdsMock = vi.fn();
const dispatchMock = vi.fn();
const confirmMock = vi.fn();
const toCredentialsMock = vi.fn();

vi.mock('@/app/lib/smartstore/client', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/smartstore/client')>(
    '@/app/lib/smartstore/client',
  );
  return {
    ...actual,
    fetchSmartstoreProductOrdersByIds: (input: unknown) => fetchByIdsMock(input),
    postSmartstoreProductOrdersDispatch: (input: unknown) => dispatchMock(input),
    postSmartstoreProductOrdersConfirm: (input: unknown) => confirmMock(input),
  };
});

vi.mock('@/app/lib/order-integration/smartstore-account', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/smartstore-account')
  >('@/app/lib/order-integration/smartstore-account');
  return {
    ...actual,
    toSmartstoreCredentials: (account: unknown) => toCredentialsMock(account),
  };
});

import { createRealShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/real-adapters';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

function candidate(overrides: Partial<ShipmentTransmissionCandidate> = {}): ShipmentTransmissionCandidate {
  return {
    provider: 'SMARTSTORE',
    integrationAccountId: 'acct-1',
    uploadBatchId: 'batch-1',
    matchId: 'match-1',
    orderSyncOrderId: 'order-1',
    mallOrderNo: 'ORDER-1',
    excloadOrderNo: 'EXC-1',
    mallLineItemIds: ['PO-1'],
    trackingNumber: '123456789012',
    courierCode: 'LOTTE',
    courierName: '롯데택배',
    ...overrides,
  };
}

function account(): OrderIntegrationAccount {
  return {
    id: 'acct-1',
    userId: 'user-1',
    provider: 'SMARTSTORE',
    accountName: 'test',
    vendorId: 'client-id',
    sellerId: 'SELF',
    accessKeyCiphertext: 'x',
    accessKeyIv: 'x',
    accessKeyAuthTag: 'x',
    secretKeyCiphertext: 'x',
    secretKeyIv: 'x',
    secretKeyAuthTag: 'x',
    apiKeyCiphertext: null,
    apiKeyIv: null,
    apiKeyAuthTag: null,
    encryptionKeyVersion: 1,
    expiresAt: null,
    status: 'ACTIVE',
    lastTestedAt: null,
    lastSyncedAt: null,
    lastErrorMessage: null,
    healthStatus: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorCategory: null,
    lastErrorCode: null,
    consecutiveFailureCount: 0,
    healthOperationSequence: BigInt(0),
    healthAppliedOperationSequence: BigInt(0),
    healthCheckLeaseToken: null,
    healthCheckLeaseUntil: null,
    authorizationPeriodStart: null,
    authorizationPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('SMARTSTORE live shipment transmission adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toCredentialsMock.mockReturnValue({
      clientId: 'client',
      clientSecret: 'secret',
      authType: 'SELF',
    });
    fetchByIdsMock.mockImplementation(async (input: { productOrderIds: string[] }) =>
      input.productOrderIds.map((productOrderId) => ({
        order: { orderId: 'ORDER-1' },
        productOrder: {
          productOrderId,
          productOrderStatus: 'PAYED',
          placeOrderStatus: 'OK',
          remainQuantity: 1,
        },
      })),
    );
    dispatchMock.mockResolvedValue({
      httpStatus: 200,
      bodyText: JSON.stringify({
        data: {
          successProductOrderIds: ['PO-1'],
          failProductOrderInfos: [],
        },
      }),
    });
  });

  it('registers SMARTSTORE live adapter and posts HYUNDAI dispatch', async () => {
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async ({ userId, accountId, provider }) => {
        if (userId !== 'user-1' || accountId !== 'acct-1' || provider !== 'SMARTSTORE') return null;
        return account();
      },
    });

    const result = await registry.get('SMARTSTORE')!.transmit(candidate());
    expect(result.success).toBe(true);
    expect(result.outcomeKind).toBe('success');
    expect(result.errorCode).not.toBe('PROVIDER_SPEC_INCOMPLETE');
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(confirmMock).not.toHaveBeenCalled();

    const body = dispatchMock.mock.calls[0]?.[0] as {
      dispatchProductOrders: Array<{
        productOrderId: string;
        deliveryCompanyCode: string;
        deliveryMethod: string;
      }>;
    };
    expect(body.dispatchProductOrders[0]?.productOrderId).toBe('PO-1');
    expect(body.dispatchProductOrders[0]?.deliveryCompanyCode).toBe('HYUNDAI');
    expect(body.dispatchProductOrders[0]?.deliveryMethod).toBe('DELIVERY');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('blocks other-user ownership via loadAccount and does not dispatch', async () => {
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => null,
    });

    const result = await registry.get('SMARTSTORE')!.transmit(candidate());
    expect(result.errorCode).toBe('NOT_CONFIGURED');
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('keeps other deferred providers incomplete', async () => {
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async ({ provider }) => ({ ...account(), provider }),
      resolveAccountSecrets: () => ({
        accountId: 'acct-1',
        vendorId: null,
        sellerId: null,
        accessKey: null,
        secretKey: null,
        apiKey: 'api',
      }),
    });

    const eleven = await registry.get('ELEVEN')!.transmit({
      ...candidate({ provider: 'ELEVEN' }),
    });
    expect(eleven.errorCode).toBe('PROVIDER_SPEC_INCOMPLETE');
  });

  it('does not call confirm API on ORDER_CONFIRMATION_REQUIRED', async () => {
    fetchByIdsMock.mockResolvedValue([
      {
        order: { orderId: 'ORDER-1' },
        productOrder: {
          productOrderId: 'PO-1',
          productOrderStatus: 'PAYED',
          placeOrderStatus: 'NOT_YET',
          remainQuantity: 1,
        },
      },
    ]);

    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => account(),
    });

    const result = await registry.get('SMARTSTORE')!.transmit(candidate());
    expect(result.errorCode).toBe('ORDER_CONFIRMATION_REQUIRED');
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });
});
