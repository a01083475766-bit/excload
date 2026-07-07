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
import { ELEVEN_DEFAULT_VENDOR_ID, type ElevenCredentials } from '@/app/lib/eleven/client';

export type ElevenAccountPublic = {
  id: string;
  accountName: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): ElevenAccountPublic['status'] {
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

export function decryptOpenApiKey(account: OrderIntegrationAccount): string {
  const field = toApiKeyEncryptedField(account);
  if (!field) throw new Error('OPEN API KEY가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function toElevenAccountPublic(account: OrderIntegrationAccount): ElevenAccountPublic {
  let apiKeyPlain = '';
  try {
    apiKeyPlain = decryptOpenApiKey(account);
  } catch {
    apiKeyPlain = '';
  }

  return {
    id: account.id,
    accountName: account.accountName,
    apiKeyMasked: maskIntegrationSecret(apiKeyPlain),
    hasApiKey: Boolean(apiKeyPlain),
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: account.lastErrorMessage,
  };
}

export async function getElevenAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.ELEVEN,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function saveElevenAccount(input: {
  userId: string;
  accountName: string;
  openapikey?: string;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();

  if (!accountName) {
    throw new Error('접속별칭(계정명)은 필수입니다.');
  }

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.ELEVEN,
        vendorId: ELEVEN_DEFAULT_VENDOR_ID,
      },
    },
  });

  const apiKeyEncrypted =
    input.openapikey && input.openapikey.trim()
      ? encryptIntegrationSecret(input.openapikey.trim())
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
    throw new Error('OPEN API KEY는 필수입니다.');
  }

  const commonData = {
    accountName,
    vendorId: ELEVEN_DEFAULT_VENDOR_ID,
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
      provider: OrderIntegrationProvider.ELEVEN,
      ...commonData,
    },
  });
}

export async function deleteElevenAccount(userId: string): Promise<boolean> {
  const account = await getElevenAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markElevenAccountTestResult(input: {
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

export async function markElevenAccountSyncResult(input: {
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

export function toElevenCredentials(account: OrderIntegrationAccount): ElevenCredentials {
  return {
    openapikey: decryptOpenApiKey(account),
  };
}
