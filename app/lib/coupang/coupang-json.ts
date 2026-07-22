import { isLosslessNumber, isSafeNumber, LosslessNumber, parse, stringify } from 'lossless-json';
import type { LosslessNumber as LosslessNumberType } from 'lossless-json';

/** 쿠팡 API 응답에서 정밀도 보존이 필요한 외부 식별자 필드 */
const COUPANG_EXTERNAL_ID_KEYS = new Set(['shipmentBoxId', 'orderId', 'vendorItemId']);

const POSITIVE_INTEGER_STRING = /^[1-9][0-9]*$/;

/** 쿠팡 acknowledgement body용 양의 정수 ID 문자열 검증 */
export function isCoupangPositiveIntegerId(value: string): boolean {
  return POSITIVE_INTEGER_STRING.test(value.trim());
}

function losslessToPlain(key: string | null, value: LosslessNumberType): unknown {
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

/**
 * 상품준비중(acknowledgement) PATCH body — shipmentBoxIds는 JSON Number 토큰으로 직렬화.
 * 내부 ID는 string, LosslessNumber로 정밀도 보존.
 */
export function buildCoupangAcknowledgementBodyText(input: {
  vendorId: string;
  shipmentBoxIds: readonly string[];
}): string {
  const vendorId = input.vendorId.trim();
  const shipmentBoxIds = input.shipmentBoxIds.map((id) => {
    const trimmed = id.trim();
    if (!isCoupangPositiveIntegerId(trimmed)) {
      throw new Error('Invalid shipmentBoxId.');
    }
    return new LosslessNumber(trimmed);
  });

  return stringify({
    vendorId,
    shipmentBoxIds,
  }) as string;
}
