import { createHash } from 'node:crypto';

export const SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION = 1;

export type ShipmentTransmissionFingerprintInput = {
  fingerprintVersion?: number;
  userId: string;
  provider: string;
  integrationAccountId: string | null | undefined;
  shipmentMatchId: string;
  orderSyncOrderId: string | null | undefined;
  mallOrderNo: string;
  mallLineItemIds: ReadonlyArray<string> | null | undefined;
  trackingNumber: string;
  courierCode: string | null | undefined;
  courierName: string | null | undefined;
};

function trimOrEmpty(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export function normalizeFingerprintProvider(provider: string): string {
  return trimOrEmpty(provider).toUpperCase();
}

/** 송장번호: 공백·하이픈 제거 */
export function normalizeFingerprintTrackingNumber(trackingNumber: string): string {
  return trimOrEmpty(trackingNumber).replace(/[\s-]+/g, '');
}

export function normalizeFingerprintCourierCode(code: string | null | undefined): string {
  return trimOrEmpty(code).toUpperCase();
}

/** 택배사명 fallback: trim + 연속 공백 축소 + 소문자 */
export function normalizeFingerprintCourierName(name: string | null | undefined): string {
  return trimOrEmpty(name).replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeFingerprintMallLineItemIds(
  ids: ReadonlyArray<string> | null | undefined,
): string[] {
  if (!ids?.length) return [];
  return [...ids]
    .map((id) => trimOrEmpty(id))
    .filter((id) => id.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function resolveCourierCanonical(input: {
  courierCode: string | null | undefined;
  courierName: string | null | undefined;
}): string {
  const code = normalizeFingerprintCourierCode(input.courierCode);
  if (code) return `code:${code}`;
  const name = normalizeFingerprintCourierName(input.courierName);
  return name ? `name:${name}` : 'courier:';
}

/**
 * 명시적 canonical string → SHA-256 hex (64자).
 * PII·credential 입력 금지.
 */
export function buildShipmentTransmissionFingerprint(
  input: ShipmentTransmissionFingerprintInput,
): string {
  const version = input.fingerprintVersion ?? SHIPMENT_TRANSMISSION_FINGERPRINT_VERSION;
  const lineIds = normalizeFingerprintMallLineItemIds(input.mallLineItemIds);
  const parts = [
    `v=${version}`,
    `userId=${trimOrEmpty(input.userId)}`,
    `provider=${normalizeFingerprintProvider(input.provider)}`,
    `integrationAccountId=${trimOrEmpty(input.integrationAccountId)}`,
    `shipmentMatchId=${trimOrEmpty(input.shipmentMatchId)}`,
    `orderSyncOrderId=${trimOrEmpty(input.orderSyncOrderId)}`,
    `mallOrderNo=${trimOrEmpty(input.mallOrderNo)}`,
    `mallLineItemIds=${lineIds.join(',')}`,
    `trackingNumber=${normalizeFingerprintTrackingNumber(input.trackingNumber)}`,
    `courier=${resolveCourierCanonical(input)}`,
  ];
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}
