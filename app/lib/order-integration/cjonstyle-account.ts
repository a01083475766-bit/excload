import {
  OrderIntegrationAccountStatus,
  OrderIntegrationProvider,
  type OrderIntegrationAccount,
} from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import { resolveCjonstyleDeliveryMethodCodes, type CjonstyleCredentials } from '@/app/lib/cjonstyle/client';
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

export type CjonstyleAccountPublic = {
  id: string;
  accountName: string;
  vendorCode: string;
  deliveryMethodCodes: string[];
  authenticationKeyMasked: string;
  hasAuthenticationKey: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): CjonstyleAccountPublic['status'] {
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

function toDeliveryMethodEncryptedField(
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

export function decryptCjonstyleAuthenticationKey(account: OrderIntegrationAccount): string {
  const field = toApiKeyEncryptedField(account);
  if (!field) throw new Error('authenticationKey가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function decryptCjonstyleDeliveryMethodCodes(account: OrderIntegrationAccount): string[] {
  const field = toDeliveryMethodEncryptedField(account);
  if (!field) return [];
  const plain = decryptIntegrationSecret(field);
  return resolveCjonstyleDeliveryMethodCodes(
    plain
      .split(/[,;\s]+/)
      .map((code) => code.trim())
      .filter(Boolean),
  );
}

function normalizeVendorCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeDeliveryMethodInput(value?: string): string {
  const codes = resolveCjonstyleDeliveryMethodCodes(
    value
      ?.split(/[,;\s]+/)
      .map((code) => code.trim())
      .filter(Boolean),
  );
  return codes.join(',');
}

export function toCjonstyleAccountPublic(account: OrderIntegrationAccount): CjonstyleAccountPublic {
  let authenticationKeyPlain = '';
  try {
    authenticationKeyPlain = decryptCjonstyleAuthenticationKey(account);
  } catch {
    authenticationKeyPlain = '';
  }

  const deliveryMethodCodes = decryptCjonstyleDeliveryMethodCodes(account);

  return {
    id: account.id,
    accountName: account.accountName,
    vendorCode: account.vendorId ?? '',
    deliveryMethodCodes,
    authenticationKeyMasked: maskIntegrationSecret(authenticationKeyPlain),
    hasAuthenticationKey: Boolean(authenticationKeyPlain),
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: account.lastErrorMessage,
  };
}

export async function getCjonstyleAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.CJONSTYLE,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function saveCjonstyleAccount(input: {
  userId: string;
  accountName: string;
  vendorCode: string;
  authenticationKey?: string;
  deliveryMethodCode?: string;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const vendorCode = normalizeVendorCode(input.vendorCode);

  if (!accountName) throw new Error('접속별칭(계정명)은 필수입니다.');
  if (!vendorCode) throw new Error('vendorCode(협력업체코드)는 필수입니다.');
  if (vendorCode.length !== 6) {
    throw new Error('vendorCode는 6자 협력업체코드여야 합니다.');
  }

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.CJONSTYLE,
        vendorId: vendorCode,
      },
    },
  });

  const apiKeyEncrypted =
    input.authenticationKey && input.authenticationKey.trim()
      ? encryptIntegrationSecret(input.authenticationKey.trim())
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
    throw new Error('authenticationKey는 필수입니다.');
  }

  const deliveryPlain =
    input.deliveryMethodCode !== undefined
      ? normalizeDeliveryMethodInput(input.deliveryMethodCode)
      : existing && existing.accessKeyCiphertext
        ? null
        : normalizeDeliveryMethodInput('');

  const deliveryEncrypted =
    deliveryPlain !== null
      ? encryptIntegrationSecret(deliveryPlain)
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
        : encryptIntegrationSecret(normalizeDeliveryMethodInput(''));

  const commonData = {
    accountName,
    vendorId: vendorCode,
    apiKeyCiphertext: apiKeyEncrypted.ciphertext,
    apiKeyIv: apiKeyEncrypted.iv,
    apiKeyAuthTag: apiKeyEncrypted.authTag,
    accessKeyCiphertext: deliveryEncrypted.ciphertext,
    accessKeyIv: deliveryEncrypted.iv,
    accessKeyAuthTag: deliveryEncrypted.authTag,
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
      provider: OrderIntegrationProvider.CJONSTYLE,
      ...commonData,
    },
  });
}

export async function deleteCjonstyleAccount(userId: string): Promise<boolean> {
  const account = await getCjonstyleAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markCjonstyleAccountTestResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markCjonstyleAccountSyncResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toCjonstyleCredentials(account: OrderIntegrationAccount): CjonstyleCredentials {
  return {
    vendorCode: account.vendorId ?? '',
    authenticationKey: decryptCjonstyleAuthenticationKey(account),
    deliveryMethodCodes: decryptCjonstyleDeliveryMethodCodes(account),
  };
}
