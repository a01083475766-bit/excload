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
import type { ConnectionOperationResult } from '@/app/lib/order-integration/connection-health/types';
import { sanitizePublicOptionalIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import type { SsgCredentials } from '@/app/lib/ssg/client';

export type SsgAccountPublic = {
  id: string;
  accountName: string;
  vendorCode: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): SsgAccountPublic['status'] {
  switch (status) {
    case OrderIntegrationAccountStatus.ACTIVE:
      return 'active';
    case OrderIntegrationAccountStatus.ERROR:
      return 'error';
    default:
      return 'inactive';
  }
}

function toApiKeyEncryptedField(
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

export function decryptSsgApiKey(account: OrderIntegrationAccount): string {
  const field = toApiKeyEncryptedField(account);
  if (!field) throw new Error('API 인증키가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function toSsgAccountPublic(account: OrderIntegrationAccount): SsgAccountPublic {
  let apiKeyPlain = '';
  try {
    apiKeyPlain = decryptSsgApiKey(account);
  } catch {
    apiKeyPlain = '';
  }

  return {
    id: account.id,
    accountName: account.accountName,
    vendorCode: account.vendorId ?? '',
    apiKeyMasked: maskIntegrationSecret(apiKeyPlain),
    hasApiKey: Boolean(apiKeyPlain),
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: sanitizePublicOptionalIntegrationErrorMessage(account.lastErrorMessage),
  };
}

export async function getSsgAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.SSG,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

function normalizeVendorCode(value: string): string {
  return value.trim();
}

export async function saveSsgAccount(input: {
  userId: string;
  accountName: string;
  vendorCode: string;
  apiKey?: string;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const vendorCode = normalizeVendorCode(input.vendorCode);

  if (!accountName) throw new Error('접속별칭(계정명)은 필수입니다.');
  if (!vendorCode) throw new Error('협력사코드(로그인 ID)는 필수입니다.');

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.SSG,
        vendorId: vendorCode,
      },
    },
  });

  const apiKeyEncrypted =
    input.apiKey && input.apiKey.trim()
      ? encryptIntegrationSecret(input.apiKey.trim())
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

  if (!apiKeyEncrypted) {
    throw new Error('API 인증키는 필수입니다.');
  }

  const commonData = {
    accountName,
    vendorId: vendorCode,
    apiKeyCiphertext: apiKeyEncrypted.ciphertext,
    apiKeyIv: apiKeyEncrypted.iv,
    apiKeyAuthTag: apiKeyEncrypted.authTag,
    encryptionKeyVersion: apiKeyEncrypted.keyVersion,
    status: OrderIntegrationAccountStatus.INACTIVE,
    lastErrorMessage: null,
  };

  if (existing) {
    return prisma.orderIntegrationAccount.update({
      where: { id: existing.id },
      data: commonData,
    });
  }

  return prisma.orderIntegrationAccount.create({
    data: {
      userId: input.userId,
      provider: OrderIntegrationProvider.SSG,
      ...commonData,
    },
  });
}

export async function deleteSsgAccount(userId: string): Promise<boolean> {
  const account = await getSsgAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markSsgAccountTestResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markSsgAccountSyncResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toSsgCredentials(account: OrderIntegrationAccount): SsgCredentials {
  return {
    apiKey: decryptSsgApiKey(account),
  };
}
