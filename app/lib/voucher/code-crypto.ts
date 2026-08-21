import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const ENV_SECRET = 'VOUCHER_CODE_HMAC_SECRET';

/** 사람이 읽기 쉬운 코드용 알파벳 (혼동 문자 제외) */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function getVoucherCodeHmacSecret(): string {
  const secret = process.env[ENV_SECRET]?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      `[voucher] ${ENV_SECRET} must be set to a secret of at least 32 characters`,
    );
  }
  return secret;
}

/** ≥128 bit entropy random code, groups of 4 */
export function generateVoucherCodePlaintext(groupCount = 4, groupLen = 4): string {
  const total = groupCount * groupLen;
  const bytes = randomBytes(total);
  const chars: string[] = [];
  for (let i = 0; i < total; i++) {
    chars.push(CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!);
  }
  const groups: string[] = [];
  for (let g = 0; g < groupCount; g++) {
    groups.push(chars.slice(g * groupLen, (g + 1) * groupLen).join(''));
  }
  return groups.join('-');
}

export function normalizeVoucherCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashVoucherCode(plaintext: string, secret?: string): string {
  const key = secret ?? getVoucherCodeHmacSecret();
  const normalized = normalizeVoucherCodeInput(plaintext);
  return createHmac('sha256', key).update(normalized, 'utf8').digest('hex');
}

export function voucherCodeLast4(plaintext: string): string {
  const normalized = normalizeVoucherCodeInput(plaintext);
  return normalized.slice(-4);
}

/** timing-safe hex compare */
export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
