/**
 * WorkItem 비교용 HMAC 지문 — 서버 전용 (node:crypto).
 * 클라이언트 번들에 import 하지 마세요. 재료 추출은 match-fingerprint-material.ts 사용.
 * 형식: v1|p:<hex>|n:<hex>|a:<hex>
 */

import { createHmac } from 'crypto';

import type {
  MatchFingerprintMaterial,
  ParsedMatchFingerprint,
} from '@/app/lib/order-integration/courier-download/match-fingerprint-material';
import {
  normalizeAddressForMatch,
  normalizePhoneDigits,
  normalizeReceiverName,
} from '@/app/lib/order-integration/shipments/normalize-shipment-row';

export type {
  MatchFingerprintMaterial,
  ParsedMatchFingerprint,
} from '@/app/lib/order-integration/courier-download/match-fingerprint-material';
export {
  extractMatchFingerprintMaterialFromRow,
  parseMatchFingerprintHmac,
} from '@/app/lib/order-integration/courier-download/match-fingerprint-material';

function resolveFingerprintSecret(): string | null {
  const dedicated = process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET?.trim();
  if (dedicated) return dedicated;
  const fallback = process.env.NEXTAUTH_SECRET?.trim();
  return fallback || null;
}

export function hmacMatchNormalizedValue(normalized: string, secret: string): string {
  return createHmac('sha256', secret).update(normalized, 'utf8').digest('hex');
}

export function buildMatchFingerprintHmac(
  material: MatchFingerprintMaterial,
  secret: string = resolveFingerprintSecret() ?? '',
): string | null {
  if (!secret) return null;
  const parts: string[] = ['v1'];
  const phone = normalizePhoneDigits(material.receiverPhone ?? '');
  if (phone) parts.push(`p:${hmacMatchNormalizedValue(phone, secret)}`);
  const name = normalizeReceiverName(material.receiverName ?? '');
  if (name) parts.push(`n:${hmacMatchNormalizedValue(name, secret)}`);
  const address = normalizeAddressForMatch(material.receiverAddress ?? '');
  if (address) parts.push(`a:${hmacMatchNormalizedValue(address, secret)}`);
  if (parts.length === 1) return null;
  return parts.join('|');
}

export function fingerprintMatchesPhone(
  fingerprint: ParsedMatchFingerprint | null,
  shipmentPhoneNormalized: string,
  secret: string = resolveFingerprintSecret() ?? '',
): boolean | null {
  if (!fingerprint?.phone || !shipmentPhoneNormalized || !secret) return null;
  return fingerprint.phone === hmacMatchNormalizedValue(shipmentPhoneNormalized, secret);
}

export function fingerprintMatchesName(
  fingerprint: ParsedMatchFingerprint | null,
  shipmentName: string,
  secret: string = resolveFingerprintSecret() ?? '',
): boolean | null {
  const name = normalizeReceiverName(shipmentName);
  if (!fingerprint?.name || !name || !secret) return null;
  return fingerprint.name === hmacMatchNormalizedValue(name, secret);
}

export function fingerprintMatchesAddress(
  fingerprint: ParsedMatchFingerprint | null,
  shipmentAddress: string,
  secret: string = resolveFingerprintSecret() ?? '',
): boolean | null {
  const address = normalizeAddressForMatch(shipmentAddress);
  if (!fingerprint?.address || !address || !secret) return null;
  return fingerprint.address === hmacMatchNormalizedValue(address, secret);
}
