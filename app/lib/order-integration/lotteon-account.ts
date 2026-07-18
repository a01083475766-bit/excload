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
import type { LotteonCredentials } from '@/app/lib/lotteon/client';

export type LotteonAccountPublic = {
  id: string;
  accountName: string;
  sellerId: string;
  trNo: string;
  shopId: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): LotteonAccountPublic['status'] {
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

function toShopIdEncryptedField(
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

export function decryptLotteonApiKey(account: OrderIntegrationAccount): string {
  const field = toApiKeyEncryptedField(account);
  if (!field) throw new Error('API KEY가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function decryptLotteonShopId(account: OrderIntegrationAccount): string {
  const field = toShopIdEncryptedField(account);
  if (!field) return '';
  return decryptIntegrationSecret(field);
}

export function toLotteonAccountPublic(account: OrderIntegrationAccount): LotteonAccountPublic {
  let apiKeyPlain = '';
  try {
    apiKeyPlain = decryptLotteonApiKey(account);
  } catch {
    apiKeyPlain = '';
  }

  return {
    id: account.id,
    accountName: account.accountName,
    sellerId: account.sellerId ?? '',
    trNo: account.vendorId ?? '',
    shopId: decryptLotteonShopId(account),
    apiKeyMasked: maskIntegrationSecret(apiKeyPlain),
    hasApiKey: Boolean(apiKeyPlain),
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: sanitizePublicOptionalIntegrationErrorMessage(account.lastErrorMessage),
  };
}

export async function getLotteonAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.LOTTEON,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

function normalizeTrNo(value: string): string {
  return value.trim().toUpperCase();
}

export async function saveLotteonAccount(input: {
  userId: string;
  accountName: string;
  sellerId: string;
  trNo: string;
  apiKey?: string;
  shopId?: string;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const sellerId = input.sellerId.trim();
  const trNo = normalizeTrNo(input.trNo);

  if (!accountName) throw new Error('접속별칭(계정명)은 필수입니다.');
  if (!sellerId) throw new Error('판매자 ID는 필수입니다.');
  if (!trNo) throw new Error('거래처번호(tr_no)는 필수입니다.');

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.LOTTEON,
        vendorId: trNo,
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
    throw new Error('API KEY는 필수입니다.');
  }

  const shopIdPlain = input.shopId?.trim() ?? '';
  const shopIdEncrypted =
    shopIdPlain.length > 0
      ? encryptIntegrationSecret(shopIdPlain)
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

  const commonData = {
    accountName,
    sellerId,
    vendorId: trNo,
    apiKeyCiphertext: apiKeyEncrypted.ciphertext,
    apiKeyIv: apiKeyEncrypted.iv,
    apiKeyAuthTag: apiKeyEncrypted.authTag,
    accessKeyCiphertext: shopIdEncrypted?.ciphertext ?? null,
    accessKeyIv: shopIdEncrypted?.iv ?? null,
    accessKeyAuthTag: shopIdEncrypted?.authTag ?? null,
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
      provider: OrderIntegrationProvider.LOTTEON,
      ...commonData,
    },
  });
}

export async function deleteLotteonAccount(userId: string): Promise<boolean> {
  const account = await getLotteonAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markLotteonAccountTestResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markLotteonAccountSyncResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toLotteonCredentials(account: OrderIntegrationAccount): LotteonCredentials {
  const shopId = decryptLotteonShopId(account);
  return {
    apiKey: decryptLotteonApiKey(account),
    trNo: account.vendorId ?? '',
    shopId: shopId || undefined,
  };
}
