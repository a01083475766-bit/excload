import {
  OrderIntegrationAccountStatus,
  OrderIntegrationProvider,
  type OrderIntegrationAccount,
} from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import type { GodomallCredentials } from '@/app/lib/godomall/client';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  type EncryptedField,
} from '@/app/lib/order-integration/encryption';
import { maskIntegrationSecret } from '@/app/lib/order-integration/mask-secret';
import { isGodomallPartnerKeyConfigured } from '@/app/lib/godomall/partner-key';
import {
  recordConnectionSyncResult,
  recordConnectionTestResult,
} from '@/app/lib/order-integration/connection-health/persist-health-result';
import type { ConnectionOperationResult } from '@/app/lib/order-integration/connection-health/types';
import { sanitizePublicOptionalIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export type GodomallAccountPublic = {
  id: string;
  accountName: string;
  mallDomain: string;
  mallSno: string;
  userKeyMasked: string;
  hasUserKey: boolean;
  hasPartnerKeyOverride: boolean;
  partnerKeyConfigured: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function mapStatus(status: OrderIntegrationAccountStatus): GodomallAccountPublic['status'] {
  switch (status) {
    case OrderIntegrationAccountStatus.ACTIVE:
      return 'active';
    case OrderIntegrationAccountStatus.ERROR:
      return 'error';
    default:
      return 'inactive';
  }
}

function toUserKeyEncryptedField(
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

function toPartnerKeyOverrideEncryptedField(
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

export function decryptGodomallUserKey(account: OrderIntegrationAccount): string {
  const field = toUserKeyEncryptedField(account);
  if (!field) throw new Error('user key가 저장되어 있지 않습니다.');
  return decryptIntegrationSecret(field);
}

export function decryptGodomallPartnerKeyOverride(account: OrderIntegrationAccount): string | null {
  const field = toPartnerKeyOverrideEncryptedField(account);
  if (!field) return null;
  return decryptIntegrationSecret(field);
}

function normalizeVendorId(mallDomain: string): string {
  const trimmed = mallDomain.trim().toLowerCase();
  if (!trimmed) throw new Error('쇼핑몰 도메인은 필수입니다.');
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function toGodomallAccountPublic(account: OrderIntegrationAccount): GodomallAccountPublic {
  let userKeyPlain = '';
  try {
    userKeyPlain = decryptGodomallUserKey(account);
  } catch {
    userKeyPlain = '';
  }

  const hasPartnerKeyOverride = Boolean(toPartnerKeyOverrideEncryptedField(account));

  return {
    id: account.id,
    accountName: account.accountName,
    mallDomain: account.vendorId ?? '',
    mallSno: account.sellerId ?? '',
    userKeyMasked: maskIntegrationSecret(userKeyPlain),
    hasUserKey: Boolean(userKeyPlain),
    hasPartnerKeyOverride,
    partnerKeyConfigured: isGodomallPartnerKeyConfigured() || hasPartnerKeyOverride,
    status: mapStatus(account.status),
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: sanitizePublicOptionalIntegrationErrorMessage(account.lastErrorMessage),
  };
}

export async function getGodomallAccountForUser(userId: string): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: {
      userId,
      provider: OrderIntegrationProvider.GODOMALL,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function saveGodomallAccount(input: {
  userId: string;
  accountName: string;
  userKey?: string;
  mallDomain: string;
  mallSno?: string;
  partnerKeyOverride?: string;
  clearPartnerKeyOverride?: boolean;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const vendorId = normalizeVendorId(input.mallDomain);
  const mallSno = input.mallSno?.trim() ?? '';

  if (!accountName) throw new Error('계정명은 필수입니다.');

  const existing = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.GODOMALL,
        vendorId,
      },
    },
  });

  const userKeyEncrypted =
    input.userKey && input.userKey.trim()
      ? encryptIntegrationSecret(input.userKey.trim())
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

  if (!userKeyEncrypted) {
    throw new Error('user key(사용자키)는 필수입니다.');
  }

  let partnerKeyEncrypted: EncryptedField | null = null;

  if (input.clearPartnerKeyOverride) {
    partnerKeyEncrypted = null;
  } else if (input.partnerKeyOverride && input.partnerKeyOverride.trim()) {
    partnerKeyEncrypted = encryptIntegrationSecret(input.partnerKeyOverride.trim());
  } else if (
    existing &&
    existing.accessKeyCiphertext &&
    existing.accessKeyIv &&
    existing.accessKeyAuthTag
  ) {
    partnerKeyEncrypted = {
      ciphertext: existing.accessKeyCiphertext,
      iv: existing.accessKeyIv,
      authTag: existing.accessKeyAuthTag,
      keyVersion: existing.encryptionKeyVersion,
    };
  }

  if (!isGodomallPartnerKeyConfigured() && !partnerKeyEncrypted) {
    throw new Error(
      '서버 GODOMALL_PARTNER_KEY가 설정되지 않았습니다. Vercel env 등록 후 저장하거나, 개발용 partner_key override를 입력하세요.',
    );
  }

  const commonData = {
    accountName,
    vendorId,
    sellerId: mallSno || null,
    apiKeyCiphertext: userKeyEncrypted.ciphertext,
    apiKeyIv: userKeyEncrypted.iv,
    apiKeyAuthTag: userKeyEncrypted.authTag,
    accessKeyCiphertext: partnerKeyEncrypted?.ciphertext ?? null,
    accessKeyIv: partnerKeyEncrypted?.iv ?? null,
    accessKeyAuthTag: partnerKeyEncrypted?.authTag ?? null,
    encryptionKeyVersion: userKeyEncrypted.keyVersion,
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
      provider: OrderIntegrationProvider.GODOMALL,
      ...commonData,
    },
  });
}

export async function deleteGodomallAccount(userId: string): Promise<boolean> {
  const account = await getGodomallAccountForUser(userId);
  if (!account) return false;
  await prisma.orderIntegrationAccount.delete({ where: { id: account.id } });
  return true;
}

export async function markGodomallAccountTestResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markGodomallAccountSyncResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}

export function toGodomallCredentials(account: OrderIntegrationAccount): GodomallCredentials {
  const partnerKeyOverride = decryptGodomallPartnerKeyOverride(account);

  return {
    userKey: decryptGodomallUserKey(account),
    partnerKey: partnerKeyOverride ?? undefined,
    mallSno: account.sellerId?.trim() || undefined,
  };
}
