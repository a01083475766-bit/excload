import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';
import { resolveConnectionHealthDisplay } from './display-status';
import { getHealthMessageForStatus } from './messages';
import {
  buildConnectionHelp,
  configErrorScopeFromCode,
  type ConnectionHelpView,
} from './provider-connection-help';
import type { HealthStatus, ProviderReadiness } from './types';

export type PublicConnectionHealthDisplayState =
  | 'CONNECTED'
  | 'ACTION_REQUIRED'
  | 'RETRY_LATER'
  | 'NOT_CHECKED'
  | 'CHECK_UNAVAILABLE'
  | 'NOT_IN_USE';

export type PublicConnectionHealthTone = 'success' | 'neutral' | 'warning' | 'danger';

/**
 * 브라우저에 전달하는 연결 상태 전용 DTO.
 * DB enum, 공급자 준비 상태, 외부 API 코드·원문은 의도적으로 포함하지 않는다.
 */
export type PublicConnectionHealthView = {
  displayState: PublicConnectionHealthDisplayState;
  label: string;
  tone: PublicConnectionHealthTone;
  checkedAt: string | null;
  checkable: boolean;
  help: ConnectionHelpView | null;
};

const HEALTH_STATUSES: ReadonlySet<string> = new Set<HealthStatus>([
  'HEALTHY',
  'AUTH_REQUIRED',
  'IP_NOT_ALLOWED',
  'PERMISSION_DENIED',
  'APPROVAL_REQUIRED',
  'RATE_LIMITED',
  'TEMPORARY_ERROR',
  'ACCOUNT_CONFIG_ERROR',
  'REQUEST_INVALID',
  'UNKNOWN',
]);

export function normalizeHealthStatusForPublicView(value: string | null | undefined): HealthStatus | null {
  return value && HEALTH_STATUSES.has(value) ? (value as HealthStatus) : null;
}

export function orderIntegrationMallIdForProvider(provider: string): OrderIntegrationMallId | null {
  switch (provider) {
    case 'COUPANG':
      return 'coupang';
    case 'ELEVEN':
      return 'eleven';
    case 'SMARTSTORE':
      return 'smartstore';
    case 'CAFE24':
      return 'cafe24';
    case 'LOTTEON':
      return 'lotteon';
    case 'SSG':
      return 'ssg';
    case 'CJONSTYLE':
      return 'cjonstyle';
    case 'SHOPBY':
      return 'shopby';
    case 'GODOMALL':
      return 'godomall';
    case 'MAKESHOP':
      return 'makeshop';
    default:
      return null;
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function publicTone(tone: 'ok' | 'info' | 'warn' | 'error'): PublicConnectionHealthTone {
  if (tone === 'ok') return 'success';
  if (tone === 'warn') return 'warning';
  if (tone === 'error') return 'danger';
  return 'neutral';
}

export function toPublicConnectionHealthView(input: {
  mallId: OrderIntegrationMallId | null;
  inactive: boolean;
  readiness: ProviderReadiness | null;
  healthStatus: HealthStatus | null;
  lastErrorCategory?: string | null;
  lastSuccessAt?: Date | string | null;
  lastFailureAt?: Date | string | null;
  lastCheckedAt?: Date | string | null;
  consecutiveFailureCount?: number | null;
  lastErrorCode?: string | null;
}): PublicConnectionHealthView {
  if (input.inactive) {
    return {
      displayState: 'NOT_IN_USE',
      label: '미사용',
      tone: 'neutral',
      checkedAt: null,
      checkable: false,
      help: null,
    };
  }

  // 어댑터가 운영 확인 가능 상태가 아니면 내부 준비 상태를 노출하지 않고 한 문구로 통일한다.
  if (input.readiness !== 'VERIFIED') {
    return {
      displayState: 'CHECK_UNAVAILABLE',
      label: '연결 확인 준비 중',
      tone: 'neutral',
      checkedAt: null,
      checkable: false,
      help: null,
    };
  }

  const resolved = resolveConnectionHealthDisplay({
    healthStatus: input.healthStatus,
    lastErrorCategory: input.lastErrorCategory,
    lastSuccessAt: input.lastSuccessAt,
    lastFailureAt: input.lastFailureAt,
    consecutiveFailureCount: input.consecutiveFailureCount,
  });

  if (!resolved.status) {
    return {
      displayState: 'NOT_CHECKED',
      label: '상태 미확인',
      tone: 'neutral',
      checkedAt: toIso(input.lastCheckedAt),
      checkable: true,
      help: null,
    };
  }

  const message = getHealthMessageForStatus(resolved.status);
  const isConnected = resolved.status === 'HEALTHY';
  let displayState: PublicConnectionHealthDisplayState = 'ACTION_REQUIRED';
  if (isConnected) displayState = 'CONNECTED';
  else if (resolved.soft) displayState = 'RETRY_LATER';
  const help =
    !isConnected && input.mallId
      ? buildConnectionHelp({
          mallId: input.mallId,
          status: resolved.status,
          configErrorScope:
            resolved.status === 'ACCOUNT_CONFIG_ERROR'
              ? configErrorScopeFromCode(input.lastErrorCode)
              : null,
        })
      : null;

  return {
    displayState,
    label: message.label,
    tone: publicTone(message.tone),
    checkedAt: toIso(input.lastCheckedAt),
    checkable: true,
    help,
  };
}
