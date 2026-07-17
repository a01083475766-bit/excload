import {
  OrderIntegrationAccountStatus,
  OrderIntegrationProvider,
  type OrderIntegrationAccount,
} from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  type EncryptedField,
} from '@/app/lib/order-integration/encryption';
import { maskIntegrationSecret } from '@/app/lib/order-integration/mask-secret';
import {
  recordConnectionSyncResult,
  recordConnectionTestResult,
} from '@/app/lib/order-integration/connection-health/persist-health-result';

export type CoupangCredentials = {
  vendorId: string;
  accessKey: string;
  secretKey: string;
};

export type CoupangAccountPublic = {
  id: string;
  accountName: string;
  vendorId: string;
  accessKeyMasked: string;
  secretKeyMasked: string;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  expiresAt: string | null;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): CoupangAccountPublic['status'] {
  switch (status) {
    case OrderIntegrationAccountStatus.ACTIVE:
      return 'active';
    case OrderIntegrationAccountStatus.ERROR:
      return 'error';
    default:
      return 'inactive';
  }
}

function toEncryptedField(
  account: Pick<
    OrderIntegrationAccount,
    'accessKeyCiphertext' | 'accessKeyIv' | 'accessKeyAuthTag' | 'encryptionKeyVersion'
  >,
): EncryptedField | null {
  if (!account.accessKeyCiphertext || !account.accessKeyIv || !account.accessKeyAuthTag) {
    return null;
  }
  return {
    ciphertext: account.accessKeyCiphertext,
    iv: account.accessKeyIv,
    authTag: account.accessKeyAuthTag,
    keyVersion: account.encryptionKeyVersion,
  };
}

function toSecretEncryptedField(
  account: Pick<
    OrderIntegrationAccount,
    'secretKeyCiphertext' | 'secretKeyIv' | 'secretKeyAuthTag' | 'encryptionKeyVersion'
  >,
): EncryptedField | null {
  if (!account.secretKeyCiphertext || !account.secretKeyIv || !account.secretKeyAuthTag) {
    return null;
  }
  return {
    ciphertext: account.secretKeyCiphertext,
    iv: account.secretKeyIv,
    authTag: account.secretKeyAuthTag,
    keyVersion: account.encryptionKeyVersion,
  };
}

export function decryptAccessKey(account: OrderIntegrationAccount): string {
  const field = toEncryptedField(account);
  if (!field) throw new Error('Access Key가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function decryptSecretKey(account: OrderIntegrationAccount): string {
  const field = toSecretEncryptedField(account);
  if (!field) throw new Error('Secret Key가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function toCoupangAccountPublic(account: OrderIntegrationAccount): CoupangAccountPublic {
  let accessKeyPlain = '';
  let secretKeyPlain = '';

  try {
    accessKeyPlain = decryptAccessKey(account);
  } catch {
    accessKeyPlain = '';
  }

  try {
    secretKeyPlain = decryptSecretKey(account);
  } catch {
    secretKeyPlain = '';
  }

  return {
    id: account.id,
    accountName: account.accountName,
    vendorId: account.vendorId ?? '',
    accessKeyMasked: maskIntegrationSecret(accessKeyPlain),
    secretKeyMasked: secretKeyPlain ? maskIntegrationSecret(secretKeyPlain) : '',
    hasAccessKey: Boolean(accessKeyPlain),
    hasSecretKey: Boolean(secretKeyPlain),
    expiresAt: account.expiresAt?.toISOString() ?? null,
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: account.lastErrorMessage,
  };
}

export async function getCoupangAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.COUPANG,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function saveCoupangAccount(input: {
  userId: string;
  accountName: string;
  vendorId: string;
  accessKey?: string;
  secretKey?: string;
  expiresAt?: Date | null;
}): Promise<OrderIntegrationAccount> {
  const vendorId = input.vendorId.trim();
  const accountName = input.accountName.trim();
  const accessKey = input.accessKey?.trim() ?? '';

  if (!vendorId || !accountName) {
    throw new Error('계정명과 업체코드는 필수입니다.');
  }

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.COUPANG,
        vendorId,
      },
    },
  });

  const accessEncrypted =
    accessKey
      ? encryptIntegrationSecret(accessKey)
      : existing &&
          existing.accessKeyCiphertext &&
          existing.accessKeyIv &&
          existing.accessKeyAuthTag
        ? {
            ciphertext: existing.accessKeyCiphertext,
            iv: existing.accessKeyIv,
            authTag: existing.accessKeyAuthTag,
            keyVersion: existing.encryptionKeyVersion,
          }
        : null;

  const secretEncrypted =
    input.secretKey && input.secretKey.trim()
      ? encryptIntegrationSecret(input.secretKey.trim())
      : existing &&
          existing.secretKeyCiphertext &&
          existing.secretKeyIv &&
          existing.secretKeyAuthTag
        ? {
            ciphertext: existing.secretKeyCiphertext,
            iv: existing.secretKeyIv,
            authTag: existing.secretKeyAuthTag,
            keyVersion: existing.encryptionKeyVersion,
          }
        : null;

  if (!accessEncrypted) {
    throw new Error('Access Key는 필수입니다.');
  }

  if (!existing && !secretEncrypted) {
    throw new Error('Secret Key는 필수입니다.');
  }

  if (existing) {
    return prisma.orderIntegrationAccount.update({
      where: { id: existing.id },
      data: {
        accountName,
        vendorId,
        accessKeyCiphertext: accessEncrypted.ciphertext,
        accessKeyIv: accessEncrypted.iv,
        accessKeyAuthTag: accessEncrypted.authTag,
        encryptionKeyVersion: accessEncrypted.keyVersion,
        ...(secretEncrypted
          ? {
              secretKeyCiphertext: secretEncrypted.ciphertext,
              secretKeyIv: secretEncrypted.iv,
              secretKeyAuthTag: secretEncrypted.authTag,
            }
          : {}),
        expiresAt: input.expiresAt ?? null,
        status: OrderIntegrationAccountStatus.INACTIVE,
        lastErrorMessage: null,
      },
    });
  }

  if (!secretEncrypted) {
    throw new Error('Secret Key는 필수입니다.');
  }

  return prisma.orderIntegrationAccount.create({
    data: {
      userId: input.userId,
      provider: OrderIntegrationProvider.COUPANG,
      accountName,
      vendorId,
      accessKeyCiphertext: accessEncrypted.ciphertext,
      accessKeyIv: accessEncrypted.iv,
      accessKeyAuthTag: accessEncrypted.authTag,
      secretKeyCiphertext: secretEncrypted.ciphertext,
      secretKeyIv: secretEncrypted.iv,
      secretKeyAuthTag: secretEncrypted.authTag,
      encryptionKeyVersion: accessEncrypted.keyVersion,
      expiresAt: input.expiresAt ?? null,
      status: OrderIntegrationAccountStatus.INACTIVE,
    },
  });
}

export async function deleteCoupangAccount(userId: string): Promise<boolean> {
  const account = await getCoupangAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markCoupangAccountTestResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markCoupangAccountSyncResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toCoupangCredentials(account: OrderIntegrationAccount): CoupangCredentials {
  const vendorId = account.vendorId?.trim();
  if (!vendorId) {
    throw new Error('쿠팡 업체코드가 저장되어 있지 않습니다.');
  }

  return {
    vendorId,
    accessKey: decryptAccessKey(account),
    secretKey: decryptSecretKey(account),
  };
}

export function isCoupangApiKeyExpired(expiresAt: Date | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < now.getTime();
}
