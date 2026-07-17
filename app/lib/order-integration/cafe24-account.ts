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
import { assertValidCafe24MallId } from '@/app/lib/cafe24/mall-id';
import {
  isCafe24AccessTokenExpired,
  parseCafe24TokenSet,
  refreshCafe24AccessToken,
  serializeCafe24TokenSet,
  type Cafe24ClientCredentials,
  type Cafe24TokenSet,
} from '@/app/lib/cafe24/client';

export type Cafe24AccountPublic = {
  id: string;
  accountName: string;
  mallId: string;
  clientIdMasked: string;
  clientSecretMasked: string;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasOAuthTokens: boolean;
  tokenExpiresAt: string | null;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): Cafe24AccountPublic['status'] {
  switch (status) {
    case OrderIntegrationAccountStatus.ACTIVE:
      return 'active';
    case OrderIntegrationAccountStatus.ERROR:
      return 'error';
    default:
      return 'inactive';
  }
}

function toAccessEncryptedField(
  account: Pick<
    OrderIntegrationAccount,
    'accessKeyCiphertext' | 'accessKeyIv' | 'accessKeyAuthTag' | 'encryptionKeyVersion'
  >,
): EncryptedField | null {
  if (!account.accessKeyCiphertext || !account.accessKeyIv || !account.accessKeyAuthTag) return null;
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
  if (!account.secretKeyCiphertext || !account.secretKeyIv || !account.secretKeyAuthTag) return null;
  return {
    ciphertext: account.secretKeyCiphertext,
    iv: account.secretKeyIv,
    authTag: account.secretKeyAuthTag,
    keyVersion: account.encryptionKeyVersion,
  };
}

function toApiKeyEncryptedField(
  account: Pick<
    OrderIntegrationAccount,
    'apiKeyCiphertext' | 'apiKeyIv' | 'apiKeyAuthTag' | 'encryptionKeyVersion'
  >,
): EncryptedField | null {
  if (!account.apiKeyCiphertext || !account.apiKeyIv || !account.apiKeyAuthTag) return null;
  return {
    ciphertext: account.apiKeyCiphertext,
    iv: account.apiKeyIv,
    authTag: account.apiKeyAuthTag,
    keyVersion: account.encryptionKeyVersion,
  };
}

export function decryptClientId(account: OrderIntegrationAccount): string {
  const field = toAccessEncryptedField(account);
  if (!field) throw new Error('Client ID가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function decryptClientSecret(account: OrderIntegrationAccount): string {
  const field = toSecretEncryptedField(account);
  if (!field) throw new Error('Client Secret이 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function decryptCafe24TokenSet(account: OrderIntegrationAccount): Cafe24TokenSet {
  const field = toApiKeyEncryptedField(account);
  if (!field) throw new Error('OAuth 토큰이 저장되어 있지 않습니다. 카페24 연동을 먼저 완료해 주세요.');
  return parseCafe24TokenSet(decryptIntegrationSecret(field));
}

export function toCafe24Credentials(account: OrderIntegrationAccount): Cafe24ClientCredentials {
  const mallId = assertValidCafe24MallId(account.vendorId ?? '');
  return {
    mallId,
    clientId: decryptClientId(account),
    clientSecret: decryptClientSecret(account),
  };
}

export function toCafe24AccountPublic(account: OrderIntegrationAccount): Cafe24AccountPublic {
  let clientIdPlain = '';
  let clientSecretPlain = '';
  let hasOAuthTokens = false;

  try {
    clientIdPlain = decryptClientId(account);
  } catch {
    clientIdPlain = '';
  }

  try {
    clientSecretPlain = decryptClientSecret(account);
  } catch {
    clientSecretPlain = '';
  }

  try {
    decryptCafe24TokenSet(account);
    hasOAuthTokens = true;
  } catch {
    hasOAuthTokens = false;
  }

  return {
    id: account.id,
    accountName: account.accountName,
    mallId: account.vendorId ?? '',
    clientIdMasked: maskIntegrationSecret(clientIdPlain),
    clientSecretMasked: clientSecretPlain ? maskIntegrationSecret(clientSecretPlain) : '',
    hasClientId: Boolean(clientIdPlain),
    hasClientSecret: Boolean(clientSecretPlain),
    hasOAuthTokens,
    tokenExpiresAt: account.expiresAt?.toISOString() ?? null,
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: account.lastErrorMessage,
  };
}

export async function getCafe24AccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.CAFE24,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getCafe24AccountById(input: {
  userId: string;
  accountId: string;
}): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      id: input.accountId,
      userId: input.userId,
      provider: OrderIntegrationProvider.CAFE24,
    },
  });
}

export async function saveCafe24Account(input: {
  userId: string;
  accountName: string;
  mallId: string;
  clientId: string;
  clientSecret?: string;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const mallId = assertValidCafe24MallId(input.mallId);
  const clientId = input.clientId.trim();

  if (!accountName || !clientId) {
    throw new Error('계정명과 Client ID는 필수입니다.');
  }

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.CAFE24,
        vendorId: mallId,
      },
    },
  });

  const accessEncrypted =
    clientId
      ? encryptIntegrationSecret(clientId)
      : existing?.accessKeyCiphertext && existing.accessKeyIv && existing.accessKeyAuthTag
        ? {
            ciphertext: existing.accessKeyCiphertext,
            iv: existing.accessKeyIv,
            authTag: existing.accessKeyAuthTag,
            keyVersion: existing.encryptionKeyVersion,
          }
        : null;

  const secretEncrypted =
    input.clientSecret && input.clientSecret.trim()
      ? encryptIntegrationSecret(input.clientSecret.trim())
      : existing?.secretKeyCiphertext && existing.secretKeyIv && existing.secretKeyAuthTag
        ? {
            ciphertext: existing.secretKeyCiphertext,
            iv: existing.secretKeyIv,
            authTag: existing.secretKeyAuthTag,
            keyVersion: existing.encryptionKeyVersion,
          }
        : null;

  if (!accessEncrypted) throw new Error('Client ID는 필수입니다.');
  if (!existing && !secretEncrypted) throw new Error('Client Secret은 필수입니다.');

  const commonData = {
    accountName,
    vendorId: mallId,
    accessKeyCiphertext: accessEncrypted.ciphertext,
    accessKeyIv: accessEncrypted.iv,
    accessKeyAuthTag: accessEncrypted.authTag,
    encryptionKeyVersion: accessEncrypted.keyVersion,
    status: OrderIntegrationAccountStatus.INACTIVE,
    lastErrorMessage: null,
  };

  if (existing) {
    return prisma.orderIntegrationAccount.update({
      where: { id: existing.id },
      data: {
        ...commonData,
        ...(secretEncrypted
          ? {
              secretKeyCiphertext: secretEncrypted.ciphertext,
              secretKeyIv: secretEncrypted.iv,
              secretKeyAuthTag: secretEncrypted.authTag,
            }
          : {}),
      },
    });
  }

  if (!secretEncrypted) throw new Error('Client Secret은 필수입니다.');

  return prisma.orderIntegrationAccount.create({
    data: {
      userId: input.userId,
      provider: OrderIntegrationProvider.CAFE24,
      ...commonData,
      secretKeyCiphertext: secretEncrypted.ciphertext,
      secretKeyIv: secretEncrypted.iv,
      secretKeyAuthTag: secretEncrypted.authTag,
    },
  });
}

export async function saveCafe24OAuthTokens(input: {
  accountId: string;
  tokens: Cafe24TokenSet;
}): Promise<OrderIntegrationAccount> {
  const encrypted = encryptIntegrationSecret(serializeCafe24TokenSet(input.tokens));
  const expiresAt = new Date(input.tokens.expiresAt);

  return prisma.orderIntegrationAccount.update({
    where: { id: input.accountId },
    data: {
      apiKeyCiphertext: encrypted.ciphertext,
      apiKeyIv: encrypted.iv,
      apiKeyAuthTag: encrypted.authTag,
      encryptionKeyVersion: encrypted.keyVersion,
      expiresAt: Number.isNaN(expiresAt.getTime()) ? null : expiresAt,
      status: OrderIntegrationAccountStatus.ACTIVE,
      lastErrorMessage: null,
    },
  });
}

export async function ensureCafe24AccessToken(
  account: OrderIntegrationAccount,
): Promise<{ account: OrderIntegrationAccount; accessToken: string; tokens: Cafe24TokenSet }> {
  const credentials = toCafe24Credentials(account);
  let tokens = decryptCafe24TokenSet(account);

  if (!isCafe24AccessTokenExpired(tokens.expiresAt)) {
    return { account, accessToken: tokens.accessToken, tokens };
  }

  tokens = await refreshCafe24AccessToken({
    credentials,
    refreshToken: tokens.refreshToken,
  });

  const updated = await saveCafe24OAuthTokens({ accountId: account.id, tokens });
  return { account: updated, accessToken: tokens.accessToken, tokens };
}

export async function deleteCafe24Account(userId: string): Promise<boolean> {
  const account = await getCafe24AccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markCafe24AccountTestResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markCafe24AccountSyncResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}
