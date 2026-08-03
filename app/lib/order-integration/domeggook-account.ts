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
import type { DomeggookCredentials } from '@/app/lib/domeggook/client';
import {
  recordConnectionSyncResult,
  recordConnectionTestResult,
} from '@/app/lib/order-integration/connection-health/persist-health-result';
import type { ConnectionOperationResult } from '@/app/lib/order-integration/connection-health/types';
import { sanitizePublicOptionalIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export type DomeggookAccountPublic = {
  id: string;
  accountName: string;
  memberId: string;
  apiKeyMasked: string;
  passwordMasked: string;
  hasApiKey: boolean;
  hasPassword: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): DomeggookAccountPublic['status'] {
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

function toPasswordEncryptedField(
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

export function decryptDomeggookApiKey(account: OrderIntegrationAccount): string {
  const field = toApiKeyEncryptedField(account);
  if (!field) throw new Error('도매꾹 API Key가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function decryptDomeggookPassword(account: OrderIntegrationAccount): string {
  const field = toPasswordEncryptedField(account);
  if (!field) throw new Error('도매꾹 비밀번호가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function toDomeggookAccountPublic(account: OrderIntegrationAccount): DomeggookAccountPublic {
  let apiKeyPlain = '';
  let passwordPlain = '';
  try {
    apiKeyPlain = decryptDomeggookApiKey(account);
  } catch {
    apiKeyPlain = '';
  }
  try {
    passwordPlain = decryptDomeggookPassword(account);
  } catch {
    passwordPlain = '';
  }

  return {
    id: account.id,
    accountName: account.accountName,
    memberId: account.vendorId ?? account.sellerId ?? '',
    apiKeyMasked: maskIntegrationSecret(apiKeyPlain),
    passwordMasked: maskIntegrationSecret(passwordPlain),
    hasApiKey: Boolean(apiKeyPlain),
    hasPassword: Boolean(passwordPlain),
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: sanitizePublicOptionalIntegrationErrorMessage(account.lastErrorMessage),
  };
}

export async function getDomeggookAccountForUser(
  userId: string,
): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.DOMEGGOOK,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function saveDomeggookAccount(input: {
  userId: string;
  accountName: string;
  memberId: string;
  password?: string;
  apiKey?: string;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const memberId = input.memberId.trim();

  if (!accountName) {
    throw new Error('계정명은 필수입니다.');
  }
  if (!memberId) {
    throw new Error('도매꾹 회원 ID는 필수입니다.');
  }

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.DOMEGGOOK,
        vendorId: memberId,
      },
    },
  });

  // 동일 사용자가 회원 ID를 바꾼 경우 — 기존 계정(다른 vendorId)을 찾아 갱신
  const existingByUser =
    existing ??
    (await prisma.orderIntegrationAccount.findFirst({
      where: {
        userId: input.userId,
        provider: OrderIntegrationProvider.DOMEGGOOK,
      },
      orderBy: { updatedAt: 'desc' },
    }));

  const apiKeyEncrypted =
    input.apiKey && input.apiKey.trim()
      ? encryptIntegrationSecret(input.apiKey.trim())
      : existingByUser &&
          existingByUser.apiKeyCiphertext &&
          existingByUser.apiKeyIv &&
          existingByUser.apiKeyAuthTag
        ? {
            ciphertext: existingByUser.apiKeyCiphertext,
            iv: existingByUser.apiKeyIv,
            authTag: existingByUser.apiKeyAuthTag,
            keyVersion: existingByUser.encryptionKeyVersion,
          }
        : null;

  const passwordEncrypted =
    input.password && input.password.trim()
      ? encryptIntegrationSecret(input.password.trim())
      : existingByUser &&
          existingByUser.secretKeyCiphertext &&
          existingByUser.secretKeyIv &&
          existingByUser.secretKeyAuthTag
        ? {
            ciphertext: existingByUser.secretKeyCiphertext,
            iv: existingByUser.secretKeyIv,
            authTag: existingByUser.secretKeyAuthTag,
            keyVersion: existingByUser.encryptionKeyVersion,
          }
        : null;

  if (!apiKeyEncrypted) {
    throw new Error('도매꾹 API Key는 필수입니다.');
  }
  if (!passwordEncrypted) {
    throw new Error('도매꾹 비밀번호는 필수입니다.');
  }

  const commonData = {
    accountName,
    vendorId: memberId,
    sellerId: memberId,
    apiKeyCiphertext: apiKeyEncrypted.ciphertext,
    apiKeyIv: apiKeyEncrypted.iv,
    apiKeyAuthTag: apiKeyEncrypted.authTag,
    secretKeyCiphertext: passwordEncrypted.ciphertext,
    secretKeyIv: passwordEncrypted.iv,
    secretKeyAuthTag: passwordEncrypted.authTag,
    encryptionKeyVersion: apiKeyEncrypted.keyVersion,
    status: OrderIntegrationAccountStatus.INACTIVE,
    lastErrorMessage: null,
  };

  if (existingByUser) {
    return prisma.orderIntegrationAccount.update({
      where: { id: existingByUser.id },
      data: commonData,
    });
  }

  return prisma.orderIntegrationAccount.create({
    data: {
      userId: input.userId,
      provider: OrderIntegrationProvider.DOMEGGOOK,
      ...commonData,
    },
  });
}

export async function deleteDomeggookAccount(userId: string): Promise<boolean> {
  const account = await getDomeggookAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markDomeggookAccountTestResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markDomeggookAccountSyncResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toDomeggookCredentials(account: OrderIntegrationAccount): DomeggookCredentials {
  const memberId = (account.vendorId ?? account.sellerId ?? '').trim();
  if (!memberId) {
    throw new Error('도매꾹 회원 ID가 저장되어 있지 않습니다.');
  }
  return {
    memberId,
    password: decryptDomeggookPassword(account),
    apiKey: decryptDomeggookApiKey(account),
  };
}
