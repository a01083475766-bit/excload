import {
  OrderIntegrationAccountStatus,
  OrderIntegrationProvider,
  type OrderIntegrationAccount,
} from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import type { MakeshopCredentials } from '@/app/lib/makeshop/client';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  type EncryptedField,
} from '@/app/lib/order-integration/encryption';
import { isMakeshopOAuthConfigured } from '@/app/lib/makeshop/oauth-credentials';
import {
  recordConnectionSyncResult,
  recordConnectionTestResult,
} from '@/app/lib/order-integration/connection-health/persist-health-result';
import type { ConnectionOperationResult } from '@/app/lib/order-integration/connection-health/types';
import { sanitizePublicOptionalIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export type MakeshopAccountPublic = {
  id: string;
  accountName: string;
  shopId: string;
  mallDomain: string;
  oauthConfigured: boolean;
  hasClientIdOverride: boolean;
  hasClientSecretOverride: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): MakeshopAccountPublic['status'] {
  switch (status) {
    case OrderIntegrationAccountStatus.ACTIVE:
      return 'active';
    case OrderIntegrationAccountStatus.ERROR:
      return 'error';
    default:
      return 'inactive';
  }
}

function toClientIdOverrideField(
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

function toClientSecretOverrideField(
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

export function decryptMakeshopClientIdOverride(account: OrderIntegrationAccount): string | null {
  const field = toClientIdOverrideField(account);
  if (!field) return null;
  return decryptIntegrationSecret(field);
}

export function decryptMakeshopClientSecretOverride(account: OrderIntegrationAccount): string | null {
  const field = toClientSecretOverrideField(account);
  if (!field) return null;
  return decryptIntegrationSecret(field);
}

function normalizeShopId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('shop_uid(상점 ID)는 필수입니다.');
  return trimmed;
}

function normalizeVendorId(shopId: string, mallDomain?: string): string {
  const domain = mallDomain?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (domain) return domain;
  return shopId.trim().toLowerCase();
}

export function toMakeshopAccountPublic(account: OrderIntegrationAccount): MakeshopAccountPublic {
  const hasClientIdOverride = Boolean(toClientIdOverrideField(account));
  const hasClientSecretOverride = Boolean(toClientSecretOverrideField(account));

  return {
    id: account.id,
    accountName: account.accountName,
    shopId: account.sellerId ?? '',
    mallDomain: account.vendorId === account.sellerId?.toLowerCase() ? '' : (account.vendorId ?? ''),
    oauthConfigured: isMakeshopOAuthConfigured() || (hasClientIdOverride && hasClientSecretOverride),
    hasClientIdOverride,
    hasClientSecretOverride,
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: sanitizePublicOptionalIntegrationErrorMessage(account.lastErrorMessage),
  };
}

export async function getMakeshopAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.MAKESHOP,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function saveMakeshopAccount(input: {
  userId: string;
  accountName: string;
  shopId: string;
  mallDomain?: string;
  clientIdOverride?: string;
  clientSecretOverride?: string;
  clearOAuthOverride?: boolean;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const shopId = normalizeShopId(input.shopId);
  const vendorId = normalizeVendorId(shopId, input.mallDomain);

  if (!accountName) throw new Error('계정명은 필수입니다.');

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.MAKESHOP,
        vendorId,
      },
    },
  });

  let clientIdEncrypted: EncryptedField | null = null;
  let clientSecretEncrypted: EncryptedField | null = null;

  if (input.clearOAuthOverride) {
    clientIdEncrypted = null;
    clientSecretEncrypted = null;
  } else {
    if (input.clientIdOverride && input.clientIdOverride.trim()) {
      clientIdEncrypted = encryptIntegrationSecret(input.clientIdOverride.trim());
    } else if (
      existing &&
      existing.accessKeyCiphertext &&
      existing.accessKeyIv &&
      existing.accessKeyAuthTag
    ) {
      clientIdEncrypted = {
        ciphertext: existing.accessKeyCiphertext,
        iv: existing.accessKeyIv,
        authTag: existing.accessKeyAuthTag,
        keyVersion: existing.encryptionKeyVersion,
      };
    }

    if (input.clientSecretOverride && input.clientSecretOverride.trim()) {
      clientSecretEncrypted = encryptIntegrationSecret(input.clientSecretOverride.trim());
    } else if (
      existing &&
      existing.secretKeyCiphertext &&
      existing.secretKeyIv &&
      existing.secretKeyAuthTag
    ) {
      clientSecretEncrypted = {
        ciphertext: existing.secretKeyCiphertext,
        iv: existing.secretKeyIv,
        authTag: existing.secretKeyAuthTag,
        keyVersion: existing.encryptionKeyVersion,
      };
    }
  }

  if (!isMakeshopOAuthConfigured() && !(clientIdEncrypted && clientSecretEncrypted)) {
    throw new Error(
      '서버 MAKESHOP_CLIENT_ID/MAKESHOP_CLIENT_SECRET이 설정되지 않았습니다. Vercel env 등록 후 저장하거나, 개발용 OAuth override를 입력하세요.',
    );
  }

  const encryptionKeyVersion = clientIdEncrypted?.keyVersion ?? clientSecretEncrypted?.keyVersion ?? 1;

  const commonData = {
    accountName,
    vendorId,
    sellerId: shopId,
    accessKeyCiphertext: clientIdEncrypted?.ciphertext ?? null,
    accessKeyIv: clientIdEncrypted?.iv ?? null,
    accessKeyAuthTag: clientIdEncrypted?.authTag ?? null,
    secretKeyCiphertext: clientSecretEncrypted?.ciphertext ?? null,
    secretKeyIv: clientSecretEncrypted?.iv ?? null,
    secretKeyAuthTag: clientSecretEncrypted?.authTag ?? null,
    encryptionKeyVersion,
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
      provider: OrderIntegrationProvider.MAKESHOP,
      ...commonData,
    },
  });
}

export async function deleteMakeshopAccount(userId: string): Promise<boolean> {
  const account = await getMakeshopAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markMakeshopAccountTestResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markMakeshopAccountSyncResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toMakeshopCredentials(account: OrderIntegrationAccount): MakeshopCredentials {
  return {
    shopId: account.sellerId?.trim() ?? '',
    clientId: decryptMakeshopClientIdOverride(account) ?? undefined,
    clientSecret: decryptMakeshopClientSecretOverride(account) ?? undefined,
  };
}
