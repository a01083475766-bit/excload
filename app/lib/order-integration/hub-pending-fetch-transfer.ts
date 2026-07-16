/**
 * 주문조회 → 허브 미리보기 전달용 sessionStorage 브리지.
 *
 * 안전장치:
 * - version 스키마, 10분 TTL(createdAt/expiresAt), 사용자 격리(accountScope)
 * - 소비 시 파싱/검증 성공 여부와 무관하게 항상 삭제(consume)
 * - 저장 전 직렬화 크기 확인(초과 시 저장하지 않음, 일부만 잘라 저장 금지)
 * - 인증정보(Client ID/Secret/토큰)와 개인정보는 payload/로그에 포함하지 않음
 *   (rows는 택배 양식용 주문 표준행이며 인증정보를 담지 않는다)
 */

import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export const HUB_PENDING_FETCH_STORAGE_KEY = 'excload_order_integration_hub_pending_fetch_v1';
/** payload 스키마 버전. 미지원 버전은 소비 시 삭제한다. */
export const HUB_PENDING_FETCH_VERSION = 1;
/** 전달 유효시간 10분. */
export const HUB_PENDING_FETCH_TTL_MS = 10 * 60 * 1000;
/**
 * 직렬화 문자열 길이 상한(문자 수). sessionStorage 한도(브라우저별 ~5MB) 보호용.
 * 초과 시 저장하지 않고 사용자에게 나누어 담도록 안내한다.
 */
export const HUB_PENDING_FETCH_MAX_CHARS = 2_000_000;

export type HubPendingMallSummary = { mallId: string; name: string; count: number };

export type HubPendingFetchTransfer = {
  version: number;
  source: 'order-fetch';
  /** 사용자 격리용 불투명 스코프(프로젝트 userId). 이메일 등 개인정보 원문 미사용. */
  accountScope: string;
  createdAt: string;
  expiresAt: string;
  rows: StandardOrderRow[];
  mallSummaries: HubPendingMallSummary[];
};

export type WriteHubPendingFetchInput = {
  accountScope: string;
  rows: StandardOrderRow[];
  mallSummaries: HubPendingMallSummary[];
  now?: Date;
};

export type WriteHubPendingFetchResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'no_scope' | 'too_large' | 'unavailable' };

/**
 * 명시적 담기 동작에서만 호출. 선택 저장이면 선택된 rows만 전달한다.
 * 성공 시에만 { ok: true } 반환.
 */
export function writeHubPendingFetchTransfer(
  input: WriteHubPendingFetchInput,
): WriteHubPendingFetchResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unavailable' };
  if (!input.accountScope) return { ok: false, reason: 'no_scope' };
  if (!input.rows || input.rows.length === 0) return { ok: false, reason: 'empty' };

  const now = input.now ?? new Date();
  const payload: HubPendingFetchTransfer = {
    version: HUB_PENDING_FETCH_VERSION,
    source: 'order-fetch',
    accountScope: input.accountScope,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HUB_PENDING_FETCH_TTL_MS).toISOString(),
    rows: input.rows,
    mallSummaries: input.mallSummaries ?? [],
  };

  const serialized = JSON.stringify(payload);
  // 용량 보호: 상한 초과 시 저장하지 않는다(일부만 잘라 저장 금지).
  if (serialized.length > HUB_PENDING_FETCH_MAX_CHARS) {
    return { ok: false, reason: 'too_large' };
  }

  try {
    sessionStorage.setItem(HUB_PENDING_FETCH_STORAGE_KEY, serialized);
  } catch {
    // QuotaExceededError 등: 저장 실패 → 나누어 담도록 안내
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true };
}

export type ConsumeHubPendingFetchResult =
  | { status: 'empty' }
  | { status: 'ok'; transfer: HubPendingFetchTransfer }
  | { status: 'expired' }
  | { status: 'account_mismatch' }
  | { status: 'unsupported_version' }
  | { status: 'invalid' };

/**
 * 전달 데이터를 읽고 검증한다.
 * 파싱 성공 여부·만료·버전·사용자 불일치와 무관하게 finally에서 항상 삭제한다.
 * → 정상 소비 후 새로고침 시 같은 주문이 자동으로 다시 담기지 않는다.
 */
export function consumeHubPendingFetchTransfer(input: {
  accountScope: string;
  now?: Date;
}): ConsumeHubPendingFetchResult {
  if (typeof window === 'undefined') return { status: 'empty' };
  const raw = sessionStorage.getItem(HUB_PENDING_FETCH_STORAGE_KEY);
  if (raw == null) return { status: 'empty' };

  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'invalid' };
    }
    if (!parsed || typeof parsed !== 'object') return { status: 'invalid' };

    const p = parsed as Partial<HubPendingFetchTransfer>;
    if (p.version !== HUB_PENDING_FETCH_VERSION) return { status: 'unsupported_version' };
    if (
      p.source !== 'order-fetch' ||
      typeof p.accountScope !== 'string' ||
      typeof p.expiresAt !== 'string' ||
      !Array.isArray(p.rows) ||
      p.rows.length === 0
    ) {
      return { status: 'invalid' };
    }
    if (p.accountScope !== input.accountScope) return { status: 'account_mismatch' };

    const now = input.now ?? new Date();
    const expiresMs = Date.parse(p.expiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) {
      return { status: 'expired' };
    }

    return {
      status: 'ok',
      transfer: {
        version: p.version,
        source: 'order-fetch',
        accountScope: p.accountScope,
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
        expiresAt: p.expiresAt,
        rows: p.rows,
        mallSummaries: Array.isArray(p.mallSummaries) ? p.mallSummaries : [],
      },
    };
  } finally {
    sessionStorage.removeItem(HUB_PENDING_FETCH_STORAGE_KEY);
  }
}

export function clearHubPendingFetchTransfer(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(HUB_PENDING_FETCH_STORAGE_KEY);
}

/**
 * Strict Mode 리마운트/재시도용 인메모리 캐시를 재사용해도 되는지 판정.
 * 다른 사용자(accountScope)·만료·미지원 버전 캐시는 재사용하지 않는다.
 * (sessionStorage뿐 아니라 모듈 캐시로도 이전 계정 개인정보가 재적용되지 않도록 보장)
 */
export function isPendingFetchCacheReusable(
  cache: HubPendingFetchTransfer | null,
  input: { accountScope: string; now?: Date },
): boolean {
  if (!cache) return false;
  if (cache.version !== HUB_PENDING_FETCH_VERSION) return false;
  if (cache.source !== 'order-fetch') return false;
  if (!input.accountScope || cache.accountScope !== input.accountScope) return false;
  if (!Array.isArray(cache.rows) || cache.rows.length === 0) return false;
  const now = input.now ?? new Date();
  const expiresMs = Date.parse(cache.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) return false;
  return true;
}
