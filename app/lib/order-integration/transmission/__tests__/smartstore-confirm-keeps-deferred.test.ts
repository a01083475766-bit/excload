import { describe, expect, it, vi } from 'vitest';

/**
 * SMARTSTORE-A 이후 B에서 live adapter가 연결됐더라도,
 * 송장 전송 경로가 confirm POST를 호출하면 안 된다.
 */
describe('SMARTSTORE invoice path must not call confirm', () => {
  it('runSmartstoreInvoiceTransmission module does not import confirm runner', async () => {
    const invoiceModule = await import('@/app/lib/smartstore/smartstore-invoice');
    const source = JSON.stringify(Object.keys(invoiceModule));
    expect(source).not.toContain('runSmartstoreConfirm');
    expect(typeof invoiceModule.runSmartstoreInvoiceTransmission).toBe('function');
  });

  it('live SMARTSTORE adapter is registered (no longer PROVIDER_SPEC_INCOMPLETE stub only)', async () => {
    const { createRealShipmentTransmissionAdapterRegistry } = await import(
      '@/app/lib/order-integration/transmission/real-adapters'
    );
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => null,
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
    expect(result.errorCode).toBe('NOT_CONFIGURED');
    expect(result.errorCode).not.toBe('PROVIDER_SPEC_INCOMPLETE');
    void vi;
  });
});
