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
import type { SmartstoreAuthType, SmartstoreCredentials } from '@/app/lib/smartstore/client';
import { formatAuthorizationDate } from '@/app/lib/order-integration/authorization-period';

export type SmartstoreAccountPublic = {
  id: string;
  accountName: string;
  clientId: string;
  clientIdMasked: string;
  clientSecretMasked: string;
  authType: SmartstoreAuthType;
  hasClientId: boolean;
  hasClientSecret: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
  /** 사용자가 직접 등록한 네이버 인증기간(YYYY-MM-DD, KST). 미등록이면 null. */
  authorizationPeriodStart: string | null;
  authorizationPeriodEnd: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): SmartstoreAccountPublic['status'] {
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

export function toSmartstoreAccountPublic(account: OrderIntegrationAccount): SmartstoreAccountPublic {
  let clientIdPlain = '';
  let clientSecretPlain = '';

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

  const authType = (account.sellerId?.trim() || 'SELF') as SmartstoreAuthType;

  return {
    id: account.id,
    accountName: account.accountName,
    clientId: clientIdPlain,
    clientIdMasked: maskIntegrationSecret(clientIdPlain),
    clientSecretMasked: clientSecretPlain ? maskIntegrationSecret(clientSecretPlain) : '',
    authType: authType === 'SELLER' ? 'SELLER' : 'SELF',
    hasClientId: Boolean(clientIdPlain),
    hasClientSecret: Boolean(clientSecretPlain),
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: sanitizePublicOptionalIntegrationErrorMessage(account.lastErrorMessage),
    authorizationPeriodStart: formatAuthorizationDate(account.authorizationPeriodStart),
    authorizationPeriodEnd: formatAuthorizationDate(account.authorizationPeriodEnd),
  };
}

export async function getSmartstoreAccountForUser(
  userId: string,
): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.SMARTSTORE,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

/** userId + accountId + SMARTSTORE 소유권 검증 로드 (임의 findFirst 금지). */
export async function getOwnedSmartstoreAccount(input: {
  userId: string;
  accountId: string;
}): Promise<OrderIntegrationAccount | null> {
  const accountId = input.accountId.trim();
  if (!accountId) return null;
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      id: accountId,
      userId: input.userId,
      provider: OrderIntegrationProvider.SMARTSTORE,
    },
  });
}

export async function countSmartstoreAccountsForUser(userId: string): Promise<number> {
  return prisma.orderIntegrationAccount.count({
    where: {
      userId,
      provider: OrderIntegrationProvider.SMARTSTORE,
    },
  });
}

export type ResolveSmartstoreAccountFailure = {
  ok: false;
  status: 400 | 404;
  error: string;
};

export type ResolveSmartstoreAccountSuccess = {
  ok: true;
  account: OrderIntegrationAccount;
};

/**
 * 운영 호출용 계정 해석.
 * - accountId가 있으면 소유권·provider 재검증
 * - 없으면 계정이 정확히 1개일 때만 허용 (복수면 400, 자동 대체 금지)
 */
export async function resolveSmartstoreAccountForRequest(input: {
  userId: string;
  accountId?: string | null;
}): Promise<ResolveSmartstoreAccountSuccess | ResolveSmartstoreAccountFailure> {
  const requestedId =
    typeof input.accountId === 'string' ? input.accountId.trim() : '';

  if (requestedId) {
    const account = await getOwnedSmartstoreAccount({
      userId: input.userId,
      accountId: requestedId,
    });
    if (!account) {
      return {
        ok: false,
        status: 404,
        error: '스마트스토어 연동 계정을 찾을 수 없습니다. 계정 선택을 확인해 주세요.',
      };
    }
    return { ok: true, account };
  }

  const count = await countSmartstoreAccountsForUser(input.userId);
  if (count === 0) {
    return {
      ok: false,
      status: 404,
      error: '저장된 스마트스토어 연동 정보가 없습니다. 먼저 저장해 주세요.',
    };
  }
  if (count > 1) {
    return {
      ok: false,
      status: 400,
      error: '스마트스토어 계정이 여러 개입니다. 계정을 정확히 선택해 주세요.',
    };
  }

  const only = await prisma.orderIntegrationAccount.findFirst({
    where: {
      userId: input.userId,
      provider: OrderIntegrationProvider.SMARTSTORE,
    },
  });
  if (!only) {
    return {
      ok: false,
      status: 404,
      error: '저장된 스마트스토어 연동 정보가 없습니다. 먼저 저장해 주세요.',
    };
  }
  return { ok: true, account: only };
}

export function extractAccountIdFromRequestBody(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).accountId;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function saveSmartstoreAccount(input: {
  userId: string;
  accountName: string;
  clientId: string;
  clientSecret?: string;
  authType?: SmartstoreAuthType;
}): Promise<OrderIntegrationAccount> {
  const clientId = input.clientId.trim();
  const accountName = input.accountName.trim();
  const authType = input.authType ?? 'SELF';

  if (!clientId || !accountName) {
    throw new Error('계정명과 Client ID는 필수입니다.');
  }

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.SMARTSTORE,
        vendorId: clientId,
      },
    },
  });

  const accessEncrypted =
    clientId
      ? encryptIntegrationSecret(clientId)
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
    input.clientSecret && input.clientSecret.trim()
      ? encryptIntegrationSecret(input.clientSecret.trim())
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
    throw new Error('Client ID는 필수입니다.');
  }

  if (!existing && !secretEncrypted) {
    throw new Error('Client Secret은 필수입니다.');
  }

  const commonData = {
    accountName,
    vendorId: clientId,
    sellerId: authType,
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

  if (!secretEncrypted) {
    throw new Error('Client Secret은 필수입니다.');
  }

  return prisma.orderIntegrationAccount.create({
    data: {
      userId: input.userId,
      provider: OrderIntegrationProvider.SMARTSTORE,
      ...commonData,
      secretKeyCiphertext: secretEncrypted.ciphertext,
      secretKeyIv: secretEncrypted.iv,
      secretKeyAuthTag: secretEncrypted.authTag,
    },
  });
}

export async function deleteSmartstoreAccount(
  userId: string,
  accountId?: string | null,
): Promise<boolean> {
  const resolved = await resolveSmartstoreAccountForRequest({ userId, accountId });
  if (!resolved.ok) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: resolved.account.id } });
  return true;
}

export async function markSmartstoreAccountTestResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markSmartstoreAccountSyncResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toSmartstoreCredentials(account: OrderIntegrationAccount): SmartstoreCredentials {
  const authType = (account.sellerId?.trim() || 'SELF') as SmartstoreAuthType;
  return {
    clientId: decryptClientId(account),
    clientSecret: decryptClientSecret(account),
    authType: authType === 'SELLER' ? 'SELLER' : 'SELF',
  };
}
