import { describe, expect, it } from 'vitest';

import {
  createShipmentTransmissionAdapterRegistry,
  normalizeShipmentTransmissionProviderKey,
  ShipmentTransmissionAdapterRegistry,
  ShipmentTransmissionAdapterRegistryError,
} from '@/app/lib/order-integration/transmission/adapter-registry';
import { createMockShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/mock-adapter';

describe('ShipmentTransmissionAdapterRegistry', () => {
  it('registers and gets adapter', () => {
    const registry = new ShipmentTransmissionAdapterRegistry();
    const adapter = createMockShipmentTransmissionAdapter({ provider: 'COUPANG' });
    registry.register(adapter);
    expect(registry.get('COUPANG')).toBe(adapter);
    expect(registry.has('coupang')).toBe(true);
  });

  it('returns null for unregistered provider', () => {
    const registry = createShipmentTransmissionAdapterRegistry();
    expect(registry.get('SMARTSTORE')).toBeNull();
  });

  it('rejects duplicate provider registration', () => {
    const registry = createShipmentTransmissionAdapterRegistry([
      createMockShipmentTransmissionAdapter({ provider: 'COUPANG' }),
    ]);
    expect(() =>
      registry.register(createMockShipmentTransmissionAdapter({ provider: 'COUPANG' })),
    ).toThrow(ShipmentTransmissionAdapterRegistryError);
  });

  it('keeps providers independent', () => {
    const coupang = createMockShipmentTransmissionAdapter({ provider: 'COUPANG' });
    const smartstore = createMockShipmentTransmissionAdapter({ provider: 'SMARTSTORE' });
    const registry = createShipmentTransmissionAdapterRegistry([coupang, smartstore]);
    expect(registry.get('COUPANG')).toBe(coupang);
    expect(registry.get('SMARTSTORE')).toBe(smartstore);
    expect(registry.listProviders()).toEqual(['COUPANG', 'SMARTSTORE']);
  });

  it('rejects empty or whitespace-only provider', () => {
    const registry = new ShipmentTransmissionAdapterRegistry();
    expect(() =>
      registry.register(createMockShipmentTransmissionAdapter({ provider: '' })),
    ).toThrow(ShipmentTransmissionAdapterRegistryError);
    expect(() =>
      registry.register(createMockShipmentTransmissionAdapter({ provider: '   ' })),
    ).toThrow(ShipmentTransmissionAdapterRegistryError);
  });

  it('treats normalized provider duplicates as already registered', () => {
    const registry = new ShipmentTransmissionAdapterRegistry();
    registry.register(createMockShipmentTransmissionAdapter({ provider: 'coupang' }));
    expect(() =>
      registry.register(createMockShipmentTransmissionAdapter({ provider: ' COUPANG ' })),
    ).toThrow(/이미 등록/);
  });

  it('normalizes provider keys', () => {
    expect(normalizeShipmentTransmissionProviderKey('  coupang ')).toBe('COUPANG');
  });
});
