import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionAdapterProvider,
} from '@/app/lib/order-integration/transmission/types';

export class ShipmentTransmissionAdapterRegistryError extends Error {
  readonly code: 'ADAPTER_ALREADY_REGISTERED' | 'ADAPTER_NOT_REGISTERED';

  constructor(
    code: 'ADAPTER_ALREADY_REGISTERED' | 'ADAPTER_NOT_REGISTERED',
    message: string,
  ) {
    super(message);
    this.name = 'ShipmentTransmissionAdapterRegistryError';
    this.code = code;
  }
}

/** provider 키 정규화 — Prisma enum 문자열과 맞춤 */
export function normalizeShipmentTransmissionProviderKey(
  provider: ShipmentTransmissionAdapterProvider,
): string {
  return String(provider ?? '')
    .trim()
    .toUpperCase();
}

/**
 * provider → adapter 등록소.
 * 전역 singleton 아님 — 호출측에서 인스턴스를 생성·주입.
 */
export class ShipmentTransmissionAdapterRegistry {
  private readonly adapters = new Map<string, ShipmentTransmissionAdapter>();

  register(adapter: ShipmentTransmissionAdapter): void {
    const key = normalizeShipmentTransmissionProviderKey(adapter.provider);
    if (!key) {
      throw new ShipmentTransmissionAdapterRegistryError(
        'ADAPTER_NOT_REGISTERED',
        'adapter.provider 가 비어 있습니다.',
      );
    }
    if (this.adapters.has(key)) {
      throw new ShipmentTransmissionAdapterRegistryError(
        'ADAPTER_ALREADY_REGISTERED',
        `provider ${key} 는 이미 등록되어 있습니다.`,
      );
    }
    this.adapters.set(key, adapter);
  }

  get(provider: ShipmentTransmissionAdapterProvider): ShipmentTransmissionAdapter | null {
    const key = normalizeShipmentTransmissionProviderKey(provider);
    if (!key) return null;
    return this.adapters.get(key) ?? null;
  }

  has(provider: ShipmentTransmissionAdapterProvider): boolean {
    return this.get(provider) != null;
  }

  listProviders(): string[] {
    return [...this.adapters.keys()].sort();
  }
}

export function createShipmentTransmissionAdapterRegistry(
  adapters: ReadonlyArray<ShipmentTransmissionAdapter> = [],
): ShipmentTransmissionAdapterRegistry {
  const registry = new ShipmentTransmissionAdapterRegistry();
  for (const adapter of adapters) {
    registry.register(adapter);
  }
  return registry;
}
