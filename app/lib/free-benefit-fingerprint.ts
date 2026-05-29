import { createHash } from 'crypto';
import { prisma } from '@/app/lib/prisma';

const FINGERPRINT_TYPES = ['EMAIL', 'PHONE', 'DEVICE'] as const;
type FingerprintType = (typeof FINGERPRINT_TYPES)[number];

function fingerprintSalt(): string {
  return process.env.FREE_BENEFIT_SALT ?? process.env.TRIAL_IP_SALT ?? 'excload-free-benefit-v1';
}

function hashIdentifier(type: FingerprintType, value: string): string {
  const normalized = value.trim().toLowerCase();
  return createHash('sha256').update(`${fingerprintSalt()}:${type}:${normalized}`).digest('hex');
}

export interface FreeBenefitIdentifiers {
  email?: string | null;
  phone?: string | null;
  deviceId?: string | null;
}

function collectFingerprintEntries(
  identifiers: FreeBenefitIdentifiers,
): Array<{ type: FingerprintType; hash: string }> {
  const entries: Array<{ type: FingerprintType; hash: string }> = [];

  if (identifiers.email?.trim()) {
    entries.push({
      type: 'EMAIL',
      hash: hashIdentifier('EMAIL', identifiers.email.trim().toLowerCase()),
    });
  }
  if (identifiers.phone?.trim()) {
    entries.push({
      type: 'PHONE',
      hash: hashIdentifier('PHONE', identifiers.phone.trim()),
    });
  }
  if (identifiers.deviceId?.trim()) {
    entries.push({
      type: 'DEVICE',
      hash: hashIdentifier('DEVICE', identifiers.deviceId.trim()),
    });
  }

  return entries;
}

/** 가입 보너스(5000)를 이미 받았거나, 동일 식별자로 재가입한 경우 */
export async function isSignupBonusBlocked(
  identifiers: FreeBenefitIdentifiers,
): Promise<boolean> {
  const entries = collectFingerprintEntries(identifiers);
  if (entries.length === 0) return false;

  for (const entry of entries) {
    const found = await prisma.freeBenefitFingerprint.findUnique({
      where: { type_hash: { type: entry.type, hash: entry.hash } },
    });
    if (found?.signupBonusUsed) return true;
  }
  return false;
}

/** 탈퇴 이력이 있는 식별자 → 월간 무료 지급 차단 */
export async function isMonthlyFreeGrantBlocked(
  identifiers: FreeBenefitIdentifiers,
): Promise<boolean> {
  const entries = collectFingerprintEntries(identifiers);
  if (entries.length === 0) return false;

  for (const entry of entries) {
    const found = await prisma.freeBenefitFingerprint.findUnique({
      where: { type_hash: { type: entry.type, hash: entry.hash } },
    });
    if (found?.blockedAfterWithdraw) return true;
  }
  return false;
}

/** 최초 무료 가입 보너스 수령 시 식별자 기록 */
export async function recordSignupBonusFingerprints(
  identifiers: FreeBenefitIdentifiers,
): Promise<void> {
  const entries = collectFingerprintEntries(identifiers);
  const now = new Date();

  for (const entry of entries) {
    await prisma.freeBenefitFingerprint.upsert({
      where: { type_hash: { type: entry.type, hash: entry.hash } },
      create: {
        type: entry.type,
        hash: entry.hash,
        signupBonusUsed: true,
        blockedAfterWithdraw: false,
        firstClaimedAt: now,
      },
      update: {
        signupBonusUsed: true,
      },
    });
  }
}

/** 탈퇴 시 식별자를 무료 혜택 재수령 불가 상태로 표시 (계정 삭제 후에도 유지) */
export async function markFingerprintsBlockedOnWithdraw(
  identifiers: FreeBenefitIdentifiers,
): Promise<void> {
  const entries = collectFingerprintEntries(identifiers);
  const now = new Date();

  for (const entry of entries) {
    await prisma.freeBenefitFingerprint.upsert({
      where: { type_hash: { type: entry.type, hash: entry.hash } },
      create: {
        type: entry.type,
        hash: entry.hash,
        signupBonusUsed: true,
        blockedAfterWithdraw: true,
        firstClaimedAt: now,
        lastWithdrawnAt: now,
        withdrawCount: 1,
      },
      update: {
        signupBonusUsed: true,
        blockedAfterWithdraw: true,
        lastWithdrawnAt: now,
        withdrawCount: { increment: 1 },
      },
    });
  }
}
