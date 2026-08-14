import {
  OrderIntegrationAccountStatus,
  OrderIntegrationProvider,
  type OrderIntegrationAccount,
} from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import type { ShopbyCredentials } from '@/app/lib/shopby/client';
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
import type { ConnectionOperationResult } from '@/app/lib/order-integration/connection-health/types';
import { sanitizePublicOptionalIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export type ShopbyAccountPublic = {
  id: string;
  accountName: string;
  mallDomain: string;
  mallKeyMasked: string;
  systemKeyMasked: string;
  hasMallKey: boolean;
  hasSystemKey: boolean;
  status: 'active' | 'inactive' | 'error';
  healthStatus: string | null;
  lastTestedAt: string | null;
  lastSuccessAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): ShopbyAccountPublic['status'] {
  switch (status) {
    case OrderIntegrationAccountStatus.ACTIVE:
      return 'active';
    case OrderIntegrationAccountStatus.ERROR:
      return 'error';
    default:
      return 'inactive';
  }
}

function toMallKeyEncryptedField(
  account: Pick<
    OrderIntegrationAccount,
    'apiKeyCiphertext' | 'apiKeyIv' | 'apiKeyAuthTag' | 'encryptionKeyVersion'
  >,
): EncryptedField | null {
  if (!account.apiKeyCiphertext || !account.apiKeyIv || !account.apiKeyAuthTag) {
    return null;
  }
  return {
    ciphertext: account.apiKeyCiphertext,
    iv: account.apiKeyIv,
    authTag: account.apiKeyAuthTag,
    keyVersion: account.encryptionKeyVersion,
  };
}

function toSystemKeyEncryptedField(
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

export function decryptShopbyMallKey(account: OrderIntegrationAccount): string {
  const field = toMallKeyEncryptedField(account);
  if (!field) throw new Error('mallKey가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function decryptShopbySystemKey(account: OrderIntegrationAccount): string {
  const field = toSystemKeyEncryptedField(account);
  if (!field) throw new Error('systemKey가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

function normalizeVendorId(mallDomain?: string): string {
  const trimmed = mallDomain?.trim().toLowerCase() ?? '';
  if (!trimmed) return 'default';
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function toShopbyAccountPublic(account: OrderIntegrationAccount): ShopbyAccountPublic {
  let mallKeyPlain = '';
  let systemKeyPlain = '';

  try {
    mallKeyPlain = decryptShopbyMallKey(account);
  } catch {
    mallKeyPlain = '';
  }

  try {
    systemKeyPlain = decryptShopbySystemKey(account);
  } catch {
    systemKeyPlain = '';
  }

  return {
    id: account.id,
    accountName: account.accountName,
    mallDomain: account.vendorId === 'default' ? '' : (account.vendorId ?? ''),
    mallKeyMasked: maskIntegrationSecret(mallKeyPlain),
    systemKeyMasked: maskIntegrationSecret(systemKeyPlain),
    hasMallKey: Boolean(mallKeyPlain),
    hasSystemKey: Boolean(systemKeyPlain),
    status: mapStatus(account.status),
    healthStatus: account.healthStatus,
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSuccessAt: account.lastSuccessAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: sanitizePublicOptionalIntegrationErrorMessage(account.lastErrorMessage),
  };
}

export async function getShopbyAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.SHOPBY,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function saveShopbyAccount(input: {
  userId: string;
  accountName: string;
  mallKey?: string;
  systemKey?: string;
  mallDomain?: string;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const vendorId = normalizeVendorId(input.mallDomain);

  if (!accountName) throw new Error('접속별칭(계정명)은 필수입니다.');

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.SHOPBY,
        vendorId,
      },
    },
  });

  let existingMallKey = '';
  let existingSystemKey = '';
  if (existing) {
    try {
      existingMallKey = decryptShopbyMallKey(existing);
    } catch {
      existingMallKey = '';
    }
    try {
      existingSystemKey = decryptShopbySystemKey(existing);
    } catch {
      existingSystemKey = '';
    }
  }

  const incomingMallKey = input.mallKey?.trim() ?? '';
  const incomingSystemKey = input.systemKey?.trim() ?? '';
  const mallKeyChanged = Boolean(existing && incomingMallKey && incomingMallKey !== existingMallKey);
  const systemKeyChanged = Boolean(
    existing && incomingSystemKey && incomingSystemKey !== existingSystemKey,
  );
  const credentialsChanged = mallKeyChanged || systemKeyChanged;

  const mallKeyEncrypted =
    incomingMallKey
      ? encryptIntegrationSecret(incomingMallKey)
      : existing &&
          existing.apiKeyCiphertext &&
          existing.apiKeyIv &&
          existing.apiKeyAuthTag
        ? {
            ciphertext: existing.apiKeyCiphertext,
            iv: existing.apiKeyIv,
            authTag: existing.apiKeyAuthTag,
            keyVersion: existing.encryptionKeyVersion,
          }
        : null;

  if (!mallKeyEncrypted) {
    throw new Error('mallKey(외부 연동키)는 필수입니다.');
  }

  const systemKeyEncrypted =
    incomingSystemKey
      ? encryptIntegrationSecret(incomingSystemKey)
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

  if (!systemKeyEncrypted) {
    throw new Error('systemKey(워크스페이스 앱)는 필수입니다.');
  }

  const credentialData = {
    accountName,
    vendorId,
    apiKeyCiphertext: mallKeyEncrypted.ciphertext,
    apiKeyIv: mallKeyEncrypted.iv,
    apiKeyAuthTag: mallKeyEncrypted.authTag,
    secretKeyCiphertext: systemKeyEncrypted.ciphertext,
    secretKeyIv: systemKeyEncrypted.iv,
    secretKeyAuthTag: systemKeyEncrypted.authTag,
    encryptionKeyVersion: mallKeyEncrypted.keyVersion,
  };

  if (existing) {
    return prisma.orderIntegrationAccount.update({
      where: { id: existing.id },
      data: credentialsChanged
        ? {
            ...credentialData,
            status: OrderIntegrationAccountStatus.INACTIVE,
            healthStatus: null,
            lastTestedAt: null,
            lastSuccessAt: null,
            lastFailureAt: null,
            lastCheckedAt: null,
            lastErrorCategory: null,
            lastErrorCode: null,
            consecutiveFailureCount: 0,
            lastErrorMessage: null,
          }
        : {
            ...credentialData,
            lastErrorMessage: null,
          },
    });
  }

  return prisma.orderIntegrationAccount.create({
    data: {
      userId: input.userId,
      provider: OrderIntegrationProvider.SHOPBY,
      ...credentialData,
      status: OrderIntegrationAccountStatus.INACTIVE,
      lastErrorMessage: null,
    },
  });
}

export async function deleteShopbyAccount(userId: string): Promise<boolean> {
  const account = await getShopbyAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markShopbyAccountTestResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markShopbyAccountSyncResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toShopbyCredentials(account: OrderIntegrationAccount): ShopbyCredentials {
  return {
    systemKey: decryptShopbySystemKey(account),
    mallKey: decryptShopbyMallKey(account),
  };
}
