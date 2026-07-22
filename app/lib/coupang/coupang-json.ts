import { isLosslessNumber, isSafeNumber, parse } from 'lossless-json';
import type { LosslessNumber } from 'lossless-json';

/** 쿠팡 API 응답에서 정밀도 보존이 필요한 외부 식별자 필드 */
const COUPANG_EXTERNAL_ID_KEYS = new Set(['shipmentBoxId', 'orderId', 'vendorItemId']);

function losslessToPlain(key: string | null, value: LosslessNumber): unknown {
  const raw = value.toString();
  if (key && COUPANG_EXTERNAL_ID_KEYS.has(key)) {
    return raw;
  }
  if (isSafeNumber(raw)) {
    if (/^-?[0-9]+$/.test(raw)) {
      return Number.parseInt(raw, 10);
    }
    return Number.parseFloat(raw);
  }
  return raw;
}

function normalizeNode(value: unknown, key: string | null): unknown {
  if (isLosslessNumber(value)) {
    return losslessToPlain(key, value);
  }
  if (typeof value === 'string' && key && COUPANG_EXTERNAL_ID_KEYS.has(key)) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNode(item, null));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(record)) {
      out[childKey] = normalizeNode(childValue, childKey);
    }
    return out;
  }
  return value;
}

/**
 * 쿠팡 API 응답 JSON 파서.
 * - lossless-json parse로 숫자 토큰 정밀도 보존
 * - shipmentBoxId / orderId / vendorItemId 는 항상 string
 * - 수량·금액 등 안전한 숫자는 number 유지
 */
export function parseCoupangJson(bodyText: string): unknown {
  const parsed = parse(bodyText);
  return normalizeNode(parsed, null);
}
