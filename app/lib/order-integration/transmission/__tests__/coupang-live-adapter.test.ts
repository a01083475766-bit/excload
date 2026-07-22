import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderIntegrationAccount } from '@prisma/client';

const fetchByBoxMock = vi.fn();
const postInvoicesMock = vi.fn();

vi.mock('@/app/lib/coupang/client', () => ({
  fetchCoupangOrderSheetByShipmentBoxId: (input: unknown) => fetchByBoxMock(input),
  postCoupangOrderInvoices: (input: unknown) => postInvoicesMock(input),
}));

import { createRealShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/real-adapters';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

const BOX = '123456789012345678';
const ORDER = '400001946946012345';
const ITEM = '382383989912345678';
const INVOICE = '001234567890';

function candidate(overrides: Partial<ShipmentTransmissionCandidate> = {}): ShipmentTransmissionCandidate {
  return {
    provider: 'COUPANG',
    integrationAccountId: 'acct-1',
    uploadBatchId: 'batch-1',
    matchId: 'match-1',
    orderSyncOrderId: 'order-1',
    mallOrderNo: ORDER,
    excloadOrderNo: 'EXC-1',
    mallLineItemIds: [`bundle:${BOX}`],
    trackingNumber: INVOICE,
    courierCode: 'CJ',
    courierName: 'CJ대한통운',
    ...overrides,
  };
}

function account(provider = 'COUPANG'): OrderIntegrationAccount {
  return {
    id: 'acct-1',
    userId: 'user-1',
    provider: provider as OrderIntegrationAccount['provider'],
    accountName: 'test',
    vendorId: 'A00012345',
    sellerId: null,
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

describe('COUPANG live shipment transmission adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchByBoxMock
      .mockResolvedValueOnce({
        shipmentBoxId: BOX,
        orderId: ORDER,
        status: 'INSTRUCT',
        shipmentType: 'THIRD_PARTY',
        splitShipping: false,
        ableSplitShipping: true,
        invoiceNumber: '',
        orderItems: [{ vendorItemId: ITEM, shippingCount: 1 }],
      })
      .mockResolvedValueOnce({
        shipmentBoxId: BOX,
        orderId: ORDER,
        status: 'DEPARTURE',
        shipmentType: 'THIRD_PARTY',
        invoiceNumber: INVOICE,
        orderItems: [{ vendorItemId: ITEM, shippingCount: 1 }],
      });
    postInvoicesMock.mockResolvedValue({
      httpStatus: 200,
      bodyText: `{"responseCode":0,"responseList":[{"shipmentBoxId":${BOX},"succeed":true,"resultCode":"OK","retryRequired":false}]}`,
    });
  });

  it('posts invoice with server vendorId and marks success after refetch', async () => {
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async ({ userId, accountId, provider }) => {
        if (userId !== 'user-1' || accountId !== 'acct-1' || provider !== 'COUPANG') return null;
        return account();
      },
      resolveAccountSecrets: () => ({
        accountId: 'acct-1',
        vendorId: 'A00012345',
        sellerId: null,
        accessKey: 'access',
        secretKey: 'secret',
        apiKey: null,
      }),
    });

    const result = await registry.get('COUPANG')!.transmit(candidate());
    expect(result.success).toBe(true);
    expect(result.outcomeKind).toBe('success');
    expect(postInvoicesMock).toHaveBeenCalledTimes(1);
    const postInput = postInvoicesMock.mock.calls[0]?.[0] as {
      vendorId: string;
      bodyText: string;
    };
    expect(postInput.vendorId).toBe('A00012345');
    expect(postInput.bodyText).toContain('"vendorId":"A00012345"');
    expect(fetchByBoxMock.mock.calls.every((call) => call[0]?.vendorId === 'A00012345')).toBe(true);
  });

  it('blocks other users account ownership via loadAccount', async () => {
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => null,
      resolveAccountSecrets: () => ({
        accountId: 'acct-1',
        vendorId: 'A00012345',
        sellerId: null,
        accessKey: 'access',
        secretKey: 'secret',
        apiKey: null,
      }),
    });

    const result = await registry.get('COUPANG')!.transmit(candidate());
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_CONFIGURED');
    expect(postInvoicesMock).not.toHaveBeenCalled();
  });

  it('keeps SMARTSTORE live while Coupang path is unchanged', async () => {
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async ({ provider }) => account(provider),
      resolveAccountSecrets: () => ({
        accountId: 'acct-1',
        vendorId: 'A00012345',
        sellerId: null,
        accessKey: 'access',
        secretKey: 'secret',
        apiKey: null,
      }),
    });

    expect(registry.get('SMARTSTORE')).toBeTruthy();
    // SMARTSTORE live uses toSmartstoreCredentials — missing ciphertext → NOT_CONFIGURED, not deferred.
    const smartstoreResult = await registry.get('SMARTSTORE')!.transmit({
      ...candidate({ provider: 'SMARTSTORE', mallLineItemIds: ['PO-1'] }),
    });
    expect(smartstoreResult.errorCode).toBe('NOT_CONFIGURED');
    expect(smartstoreResult.errorCode).not.toBe('PROVIDER_SPEC_INCOMPLETE');
    expect(postInvoicesMock).not.toHaveBeenCalled();
  });
});
