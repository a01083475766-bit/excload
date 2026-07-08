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
import { SHOPIFY_OAUTH_SCOPES, normalizeShopifyShopDomain } from '@/app/lib/shopify/shop-domain';

export type ShopifyCredentialMeta = {
  scope: string;
  refreshTokenExpiresAt?: string | null;
};

export type ShopifyAccountPublic = {
  id: string;
  accountName: string;
  shopDomain: string;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  scope: string | null;
  tokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

export type ShopifyAccountCredentials = {
  shopDomain: string;
  accessToken: string | null;
  refreshToken: string | null;
  scope: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): ShopifyAccountPublic['status'] {
  switch (status) {
    case OrderIntegrationAccountStatus.ACTIVE:
      return 'active';
    case OrderIntegrationAccountStatus.ERROR:
      return 'error';
    default:
      return 'inactive';
  }
}

function toAccessKeyEncryptedField(
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

function toSecretKeyEncryptedField(
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

function parseDateInput(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function serializeShopifyCredentialMeta(meta: ShopifyCredentialMeta): string {
  return JSON.stringify({
    scope: meta.scope.trim(),
    refreshTokenExpiresAt: meta.refreshTokenExpiresAt ?? null,
  });
}

export function parseShopifyCredentialMeta(raw: string): ShopifyCredentialMeta {
  const parsed = JSON.parse(raw) as Partial<ShopifyCredentialMeta>;
  if (!parsed.scope || typeof parsed.scope !== 'string') {
    throw new Error('Shopify credential meta에 scope가 없습니다.');
  }
  return {
    scope: parsed.scope.trim(),
    refreshTokenExpiresAt:
      typeof parsed.refreshTokenExpiresAt === 'string' ? parsed.refreshTokenExpiresAt : null,
  };
}

function decryptShopifyCredentialMeta(account: OrderIntegrationAccount): ShopifyCredentialMeta | null {
  const field = toAccessKeyEncryptedField(account);
  if (!field) return null;
  return parseShopifyCredentialMeta(decryptIntegrationSecret(field));
}

export function decryptShopifyAccountCredentials(
  account: OrderIntegrationAccount,
): ShopifyAccountCredentials {
  const shopDomain = account.vendorId ?? '';
  const meta = decryptShopifyCredentialMeta(account);

  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  const accessField = toApiKeyEncryptedField(account);
  if (accessField) {
    accessToken = decryptIntegrationSecret(accessField);
  }

  const refreshField = toSecretKeyEncryptedField(account);
  if (refreshField) {
    refreshToken = decryptIntegrationSecret(refreshField);
  }

  return {
    shopDomain,
    accessToken,
    refreshToken,
    scope: meta?.scope ?? null,
    tokenExpiresAt: account.expiresAt ?? null,
    refreshTokenExpiresAt: meta?.refreshTokenExpiresAt
      ? parseDateInput(meta.refreshTokenExpiresAt)
      : null,
  };
}

export function toShopifyAccountPublic(account: OrderIntegrationAccount): ShopifyAccountPublic {
  let scope: string | null = null;
  let refreshTokenExpiresAt: string | null = null;

  try {
    const meta = decryptShopifyCredentialMeta(account);
    scope = meta?.scope ?? null;
    refreshTokenExpiresAt = meta?.refreshTokenExpiresAt ?? null;
  } catch {
    scope = null;
    refreshTokenExpiresAt = null;
  }

  return {
    id: account.id,
    accountName: account.accountName,
    shopDomain: account.vendorId ?? '',
    hasAccessToken: Boolean(toApiKeyEncryptedField(account)),
    hasRefreshToken: Boolean(toSecretKeyEncryptedField(account)),
    scope,
    tokenExpiresAt: account.expiresAt?.toISOString() ?? null,
    refreshTokenExpiresAt,
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: account.lastErrorMessage,
  };
}

export async function getShopifyAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.SHOPIFY,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getShopifyAccountByShopDomain(input: {
  userId: string;
  shopDomain: string;
}): Promise<OrderIntegrationAccount | null> {
  const vendorId = normalizeShopifyShopDomain(input.shopDomain);
  return prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.SHOPIFY,
        vendorId,
      },
    },
  });
}

export async function getShopifyAccountById(input: {
  userId: string;
  accountId: string;
}): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      id: input.accountId,
      userId: input.userId,
      provider: OrderIntegrationProvider.SHOPIFY,
    },
  });
}

type UpsertShopifyAccountInput = {
  userId: string;
  accountName?: string;
  shopDomain: string;
  accessToken?: string;
  refreshToken?: string | null;
  scope?: string;
  tokenExpiresAt?: Date | string | null;
  refreshTokenExpiresAt?: Date | string | null;
  status?: OrderIntegrationAccountStatus;
};

function buildEncryptedTokenFields(input: {
  accessToken?: string;
  refreshToken?: string | null;
  scope?: string;
  refreshTokenExpiresAt?: Date | string | null;
  existing?: OrderIntegrationAccount | null;
}): {
  accessKeyEncrypted: EncryptedField | null;
  secretKeyEncrypted: EncryptedField | null;
  apiKeyEncrypted: EncryptedField | null;
  encryptionKeyVersion: number;
} {
  const scope = (input.scope?.trim() || SHOPIFY_OAUTH_SCOPES).trim();
  if (scope.split(',').some((item) => item.trim() === 'read_all_orders')) {
    throw new Error('read_all_orders는 1차 Shopify scope에 포함할 수 없습니다.');
  }

  let accessKeyEncrypted: EncryptedField | null = null;
  if (input.scope !== undefined || input.refreshTokenExpiresAt !== undefined) {
    accessKeyEncrypted = encryptIntegrationSecret(
      serializeShopifyCredentialMeta({
        scope,
        refreshTokenExpiresAt: parseDateInput(input.refreshTokenExpiresAt)?.toISOString() ?? null,
      }),
    );
  } else if (input.existing) {
    accessKeyEncrypted = toAccessKeyEncryptedField(input.existing);
  }

  let apiKeyEncrypted: EncryptedField | null = null;
  if (input.accessToken?.trim()) {
    apiKeyEncrypted = encryptIntegrationSecret(input.accessToken.trim());
  } else if (input.existing) {
    apiKeyEncrypted = toApiKeyEncryptedField(input.existing);
  }

  let secretKeyEncrypted: EncryptedField | null = null;
  if (input.refreshToken?.trim()) {
    secretKeyEncrypted = encryptIntegrationSecret(input.refreshToken.trim());
  } else if (input.refreshToken === null) {
    secretKeyEncrypted = null;
  } else if (input.existing) {
    secretKeyEncrypted = toSecretKeyEncryptedField(input.existing);
  }

  const encryptionKeyVersion =
    accessKeyEncrypted?.keyVersion ??
    apiKeyEncrypted?.keyVersion ??
    secretKeyEncrypted?.keyVersion ??
    input.existing?.encryptionKeyVersion ??
    1;

  return {
    accessKeyEncrypted,
    secretKeyEncrypted,
    apiKeyEncrypted,
    encryptionKeyVersion,
  };
}

export async function upsertShopifyAccount(input: UpsertShopifyAccountInput): Promise<OrderIntegrationAccount> {
  const vendorId = normalizeShopifyShopDomain(input.shopDomain);
  const accountName = (input.accountName?.trim() || vendorId).trim();
  if (!accountName) {
    throw new Error('계정명은 필수입니다.');
  }

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.SHOPIFY,
        vendorId,
      },
    },
  });

  const encrypted = buildEncryptedTokenFields({
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    scope: input.scope,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt,
    existing,
  });

  const tokenExpiresAt = parseDateInput(input.tokenExpiresAt);
  const status =
    input.status ??
    (encrypted.apiKeyEncrypted ? OrderIntegrationAccountStatus.ACTIVE : OrderIntegrationAccountStatus.INACTIVE);

  const commonData = {
    accountName,
    vendorId,
    accessKeyCiphertext: encrypted.accessKeyEncrypted?.ciphertext ?? null,
    accessKeyIv: encrypted.accessKeyEncrypted?.iv ?? null,
    accessKeyAuthTag: encrypted.accessKeyEncrypted?.authTag ?? null,
    secretKeyCiphertext: encrypted.secretKeyEncrypted?.ciphertext ?? null,
    secretKeyIv: encrypted.secretKeyEncrypted?.iv ?? null,
    secretKeyAuthTag: encrypted.secretKeyEncrypted?.authTag ?? null,
    apiKeyCiphertext: encrypted.apiKeyEncrypted?.ciphertext ?? null,
    apiKeyIv: encrypted.apiKeyEncrypted?.iv ?? null,
    apiKeyAuthTag: encrypted.apiKeyEncrypted?.authTag ?? null,
    encryptionKeyVersion: encrypted.encryptionKeyVersion,
    expiresAt: tokenExpiresAt,
    status,
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
      provider: OrderIntegrationProvider.SHOPIFY,
      ...commonData,
    },
  });
}

export async function saveShopifyOAuthTokens(input: {
  accountId: string;
  accessToken: string;
  refreshToken?: string | null;
  scope?: string;
  tokenExpiresAt?: Date | string | null;
  refreshTokenExpiresAt?: Date | string | null;
}): Promise<OrderIntegrationAccount> {
  const account = await prisma.orderIntegrationAccount.findFirst({
    where: {
      id: input.accountId,
      provider: OrderIntegrationProvider.SHOPIFY,
    },
  });
  if (!account) {
    throw new Error('Shopify 연동 계정을 찾을 수 없습니다.');
  }

  return upsertShopifyAccount({
    userId: account.userId,
    accountName: account.accountName,
    shopDomain: account.vendorId ?? '',
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    scope: input.scope,
    tokenExpiresAt: input.tokenExpiresAt,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt,
    status: OrderIntegrationAccountStatus.ACTIVE,
  });
}

export async function markShopifyAccountDisconnected(input: {
  accountId: string;
  errorMessage?: string | null;
}): Promise<void> {
  await prisma.orderIntegrationAccount.update({
    where: { id: input.accountId },
    data: {
      apiKeyCiphertext: null,
      apiKeyIv: null,
      apiKeyAuthTag: null,
      secretKeyCiphertext: null,
      secretKeyIv: null,
      secretKeyAuthTag: null,
      accessKeyCiphertext: null,
      accessKeyIv: null,
      accessKeyAuthTag: null,
      expiresAt: null,
      status: OrderIntegrationAccountStatus.INACTIVE,
      lastErrorMessage: input.errorMessage ?? 'Shopify 연동이 해제되었습니다.',
    },
  });
}

export async function setShopifyAccountError(input: {
  accountId: string;
  errorMessage: string;
}): Promise<void> {
  await prisma.orderIntegrationAccount.update({
    where: { id: input.accountId },
    data: {
      status: OrderIntegrationAccountStatus.ERROR,
      lastErrorMessage: input.errorMessage,
    },
  });
}

export async function markShopifyAccountTestResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  await prisma.orderIntegrationAccount.update({
    where: { id: input.accountId },
    data: {
      lastTestedAt: new Date(),
      status: input.success
        ? OrderIntegrationAccountStatus.ACTIVE
        : OrderIntegrationAccountStatus.ERROR,
      lastErrorMessage: input.success ? null : (input.errorMessage ?? '연결 테스트에 실패했습니다.'),
    },
  });
}

export async function markShopifyAccountSyncResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  await prisma.orderIntegrationAccount.update({
    where: { id: input.accountId },
    data: {
      lastSyncedAt: input.success ? new Date() : undefined,
      status: input.success
        ? OrderIntegrationAccountStatus.ACTIVE
        : OrderIntegrationAccountStatus.ERROR,
      lastErrorMessage: input.success ? null : (input.errorMessage ?? '주문 수집에 실패했습니다.'),
    },
  });
}
