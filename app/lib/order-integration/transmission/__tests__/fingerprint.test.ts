import { describe, expect, it } from 'vitest';

import {
  buildShipmentTransmissionFingerprint,
  normalizeFingerprintMallLineItemIds,
  normalizeFingerprintTrackingNumber,
} from '@/app/lib/order-integration/transmission/fingerprint';

const BASE = {
  userId: 'user-a',
  provider: 'COUPANG',
  integrationAccountId: 'acc-1',
  shipmentMatchId: 'match-1',
  orderSyncOrderId: 'order-1',
  mallOrderNo: 'MALL-1',
  mallLineItemIds: ['PO-2', 'PO-1'] as string[],
  trackingNumber: '012-345 678',
  courierCode: 'cj',
  courierName: 'CJ 대한통운',
};

describe('buildShipmentTransmissionFingerprint', () => {
  it('returns stable 64-char hex for same input', () => {
    const a = buildShipmentTransmissionFingerprint(BASE);
    const b = buildShipmentTransmissionFingerprint(BASE);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('ignores mallLineItemIds order', () => {
    const a = buildShipmentTransmissionFingerprint(BASE);
    const b = buildShipmentTransmissionFingerprint({
      ...BASE,
      mallLineItemIds: ['PO-1', 'PO-2'],
    });
    expect(a).toBe(b);
    expect(normalizeFingerprintMallLineItemIds(['b', 'a'])).toEqual(['a', 'b']);
  });

  it('changes when tracking changes', () => {
    const a = buildShipmentTransmissionFingerprint(BASE);
    const b = buildShipmentTransmissionFingerprint({
      ...BASE,
      trackingNumber: '999',
    });
    expect(a).not.toBe(b);
  });

  it('normalizes tracking spaces and hyphens', () => {
    expect(normalizeFingerprintTrackingNumber('01-2 3')).toBe('0123');
    const spaced = buildShipmentTransmissionFingerprint({
      ...BASE,
      trackingNumber: '012-345678',
    });
    const plain = buildShipmentTransmissionFingerprint({
      ...BASE,
      trackingNumber: '012345678',
    });
    expect(spaced).toBe(plain);
  });

  it('changes when courier changes; prefers courierCode', () => {
    const withCode = buildShipmentTransmissionFingerprint(BASE);
    const otherCode = buildShipmentTransmissionFingerprint({
      ...BASE,
      courierCode: 'HANJIN',
    });
    expect(withCode).not.toBe(otherCode);

    const nameOnlyA = buildShipmentTransmissionFingerprint({
      ...BASE,
      courierCode: null,
      courierName: 'CJ 대한통운',
    });
    const nameOnlyB = buildShipmentTransmissionFingerprint({
      ...BASE,
      courierCode: '',
      courierName: 'CJ   대한통운',
    });
    expect(nameOnlyA).toBe(nameOnlyB);
  });

  it('changes when provider/account/match/order change', () => {
    const base = buildShipmentTransmissionFingerprint(BASE);
    expect(
      buildShipmentTransmissionFingerprint({ ...BASE, provider: 'SMARTSTORE' }),
    ).not.toBe(base);
    expect(
      buildShipmentTransmissionFingerprint({ ...BASE, integrationAccountId: 'acc-2' }),
    ).not.toBe(base);
    expect(
      buildShipmentTransmissionFingerprint({ ...BASE, shipmentMatchId: 'match-2' }),
    ).not.toBe(base);
    expect(
      buildShipmentTransmissionFingerprint({ ...BASE, orderSyncOrderId: 'order-2' }),
    ).not.toBe(base);
  });

  it('input type has no PII fields', () => {
    const keys = Object.keys(BASE);
    expect(keys.join(',')).not.toMatch(/receiver|phone|address|secret|credential/i);
  });
});
