import type { OrderIntegrationProvider } from '@prisma/client';
import type { ConnectionHealthAdapter, ProviderReadiness } from './types';

/**
 * provider별 연결 확인 어댑터 레지스트리.
 * 1단계에서는 비어 있으며, 다음 단계에서 스마트스토어부터 어댑터를 등록한다.
 */
const registry = new Map<OrderIntegrationProvider, ConnectionHealthAdapter>();

export function registerHealthAdapter(adapter: ConnectionHealthAdapter): void {
  registry.set(adapter.provider, adapter);
}

export function getHealthAdapter(
  provider: OrderIntegrationProvider,
): ConnectionHealthAdapter | undefined {
  return registry.get(provider);
}

export function hasHealthAdapter(provider: OrderIntegrationProvider): boolean {
  return registry.has(provider);
}

/** 공급자 준비 상태. 어댑터가 없으면 null. */
export function getProviderReadiness(
  provider: OrderIntegrationProvider,
): ProviderReadiness | null {
  return registry.get(provider)?.readiness ?? null;
}

/** 운영 자동 확인 대상인지(VERIFIED만 true). PROVISIONAL/DISABLED/미등록은 자동 확인하지 않는다. */
export function isProviderAutoCheckable(provider: OrderIntegrationProvider): boolean {
  return registry.get(provider)?.readiness === 'VERIFIED';
}

/** 테스트 격리용: 등록된 어댑터를 모두 제거한다. */
export function clearHealthAdaptersForTest(): void {
  registry.clear();
}

/** 자동 재확인 과호출 방지용 기본 TTL(10분). */
export const HEALTH_CHECK_FRESH_TTL_MS = 10 * 60 * 1000;

/**
 * 최근 확인 결과가 아직 신선한지(재검사 생략 대상인지) 판정한다.
 * lastCheckedAt이 없으면 신선하지 않음(확인 필요).
 */
export function isHealthCheckFresh(
  lastCheckedAt: Date | null | undefined,
  now: Date = new Date(),
  ttlMs: number = HEALTH_CHECK_FRESH_TTL_MS,
): boolean {
  if (!lastCheckedAt) return false;
  return now.getTime() - lastCheckedAt.getTime() < ttlMs;
}
