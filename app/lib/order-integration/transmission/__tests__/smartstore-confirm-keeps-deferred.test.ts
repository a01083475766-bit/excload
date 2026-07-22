import type { OrderIntegrationAccount } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { createRealShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/real-adapters';

describe('SMARTSTORE live adapter remains deferred after confirm work', () => {
  it('still returns PROVIDER_SPEC_INCOMPLETE for SMARTSTORE transmit', async () => {
    const account = {
      id: 'acc',
      userId: 'user-1',
      provider: 'SMARTSTORE',
      vendorId: 'vendor-1',
      sellerId: 'seller-1',
      apiKeyCiphertext: 'x',
    } as OrderIntegrationAccount;

    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => account,
      resolveAccountSecrets: (loaded) => ({
        accountId: loaded.id,
        vendorId: loaded.vendorId,
        sellerId: loaded.sellerId,
        accessKey: null,
        secretKey: null,
        apiKey: loaded.apiKeyCiphertext ? 'api-key' : null,
      }),
    });

    const adapter = registry.get('SMARTSTORE');
    expect(adapter).toBeTruthy();

    const result = await adapter!.transmit({
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc',
      uploadBatchId: 'batch',
      matchId: 'match-1',
      orderSyncOrderId: 'order-1',
      mallOrderNo: 'ORDER-1',
      excloadOrderNo: 'EX-1',
      mallLineItemIds: ['PO-1'],
      trackingNumber: '123456789012',
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PROVIDER_SPEC_INCOMPLETE');
  });
});
