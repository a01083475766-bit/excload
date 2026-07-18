import type { OrderIntegrationAccount } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  createRealShipmentTransmissionAdapterRegistry,
  type RealShipmentAdapterAccountLoader,
} from '@/app/lib/order-integration/transmission/real-adapters';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

function candidate(overrides: Partial<ShipmentTransmissionCandidate> = {}): ShipmentTransmissionCandidate {
  return {
    provider: 'SMARTSTORE',
    integrationAccountId: 'acct-1',
    uploadBatchId: 'batch-1',
    matchId: 'match-1',
    orderSyncOrderId: 'order-1',
    mallOrderNo: 'ORD-1',
    excloadOrderNo: 'EXC-1',
    mallLineItemIds: ['PO-1'],
    trackingNumber: '123456789012',
    courierCode: 'CJ',
    courierName: 'CJ대한통운',
    ...overrides,
  };
}

function account(provider = 'SMARTSTORE'): OrderIntegrationAccount {
  return {
    id: 'acct-1',
    userId: 'user-1',
    provider: provider as OrderIntegrationAccount['provider'],
    accountName: 'test',
    vendorId: 'vendor-1',
    sellerId: 'seller-1',
    accessKeyCiphertext: null,
    accessKeyIv: null,
    accessKeyAuthTag: null,
    secretKeyCiphertext: null,
    secretKeyIv: null,
    secretKeyAuthTag: null,
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

function registry(input: { loadAccount?: RealShipmentAdapterAccountLoader } = {}) {
  return createRealShipmentTransmissionAdapterRegistry({
    userId: 'user-1',
    loadAccount: input.loadAccount ?? (async ({ provider }) => account(provider)),
    resolveAccountSecrets: (loaded) => ({
      accountId: loaded.id,
      vendorId: loaded.vendorId,
      sellerId: loaded.sellerId,
      accessKey: loaded.accessKeyCiphertext ? 'access-key' : null,
      secretKey: loaded.secretKeyCiphertext ? 'secret-key' : null,
      apiKey: loaded.apiKeyCiphertext ? 'api-key' : null,
    }),
  });
}

describe('real shipment transmission adapters', () => {
  it('registers every provider behind safe adapters', () => {
    expect(registry().listProviders()).toEqual([
      'CAFE24',
      'CJONSTYLE',
      'COUPANG',
      'ELEVEN',
      'GODOMALL',
      'LOTTEON',
      'MAKESHOP',
      'SHOPBY',
      'SHOPIFY',
      'SMARTSTORE',
      'SSG',
    ]);
  });

  it('returns NOT_CONFIGURED before any provider request when account is missing', async () => {
    const adapter = registry({ loadAccount: async () => null }).get('SMARTSTORE')!;

    const result = await adapter.transmit(candidate());

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_CONFIGURED');
  });

  it('returns NOT_CONFIGURED when account credentials are missing', async () => {
    const adapter = registry().get('SMARTSTORE')!;

    const result = await adapter.transmit(candidate());

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_CONFIGURED');
  });

  it('keeps shipment send blocked when official provider spec is incomplete', async () => {
    const adapter = registry({
      loadAccount: async ({ provider }) => ({
        ...account(provider),
        apiKeyCiphertext: 'x',
      }),
    }).get('SMARTSTORE')!;

    const result = await adapter.transmit(candidate());

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PROVIDER_SPEC_INCOMPLETE');
    expect(result.responseSummary?.message).toContain('not confirmed');
  });

  it('keeps cjonstyle deferred until official shipment endpoint is confirmed', async () => {
    const adapter = registry({
      loadAccount: async ({ provider }) => ({
        ...account(provider),
        apiKeyCiphertext: 'x',
      }),
    }).get('CJONSTYLE')!;

    const result = await adapter.transmit(candidate({ provider: 'CJONSTYLE' }));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PROVIDER_SPEC_INCOMPLETE');
  });
});
