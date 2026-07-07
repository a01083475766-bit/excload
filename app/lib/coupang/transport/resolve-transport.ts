import { DirectCoupangTransport } from '@/app/lib/coupang/transport/direct-transport';
import { ProxyCoupangTransport } from '@/app/lib/coupang/transport/proxy-transport';
import {
  getCoupangTransportInfo,
  resolveCoupangTransportMode,
} from '@/app/lib/coupang/transport/config';
import type { CoupangTransport } from '@/app/lib/coupang/transport/types';

let cachedTransport: CoupangTransport | null = null;
let cachedMode: ReturnType<typeof resolveCoupangTransportMode> | null = null;

export function resolveCoupangTransport(): CoupangTransport {
  const mode = resolveCoupangTransportMode();
  if (cachedTransport && cachedMode === mode) {
    return cachedTransport;
  }

  cachedMode = mode;
  cachedTransport = mode === 'proxy' ? new ProxyCoupangTransport() : new DirectCoupangTransport();
  return cachedTransport;
}

export function resetCoupangTransportCacheForTests(): void {
  cachedTransport = null;
  cachedMode = null;
}

export { getCoupangTransportInfo };
