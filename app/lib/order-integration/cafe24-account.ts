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
import { assertValidCafe24MallId } from '@/app/lib/cafe24/mall-id';
import {
  CAFE24_REAUTH_SCOPE_HINT,
  hasAllCafe24RequiredScopes,
  listMissingCafe24Scopes,
} from '@/app/lib/cafe24/scopes';
import {
  isCafe24AccessTokenExpired,
  parseCafe24TokenSet,
  refreshCafe24AccessToken,
  serializeCafe24TokenSet,
  type Cafe24ClientCredentials,
  type Cafe24TokenSet,
} from '@/app/lib/cafe24/client';

/** Client·mallId 변경 또는 레거시(공용앱) 계정 재등록 안내 */
export const CAFE24_CREDENTIALS_CHANGED_REAUTH_HINT =
  '연동 정보(쇼핑몰 ID 또는 Client ID/Secret)가 변경되어 카페24 연동을 다시 진행해 주세요.';

export const CAFE24_LEGACY_REREGISTER_HINT =
  '이전 공용 앱 연동은 더 이상 사용할 수 없습니다. Developers에서 발급한 Client ID/Secret을 저장한 뒤 「카페24 연동 시작」을 다시 진행해 주세요.';

export type Cafe24AccountPublic = {
  id: string;
  accountName: string;
  mallId: string;
  /** 화면 편집용. Secret이 아님 */
  clientId: string;
  clientIdMasked: string;
  /** 항상 빈 문자열 — Secret 원문·마스킹 모두 API에 실어 보내지 않음 */
  clientSecretMasked: string;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasOAuthTokens: boolean;
  /** 저장된 토큰 scope가 송장 전송 요건을 충족하는지 */
  hasRequiredScopes: boolean;
  missingScopes: string[];
  needsReauthForScopes: boolean;
  reauthMessage: string | null;
  /** 항상 false — 엑클로드 공용 앱 미사용(개인 Client만). 하위 호환 필드 */
  usesSharedApp: boolean;
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

function tryDecryptClientId(account: OrderIntegrationAccount): string {
  try {
    return decryptClientId(account);
  } catch {
    return '';
  }
}

function tryDecryptClientSecret(account: OrderIntegrationAccount): string {
  try {
    return decryptClientSecret(account);
  } catch {
    return '';
  }
}

function accountHasPersonalClientCredentials(account: OrderIntegrationAccount): boolean {
  return Boolean(toAccessEncryptedField(account) && toSecretEncryptedField(account));
}

/** 개인 Client가 저장된 계정인지 (레거시 공용앱 토큰만 있는 계정 구분) */
export function hasCafe24PersonalClientCredentials(account: OrderIntegrationAccount): boolean {
  return accountHasPersonalClientCredentials(account);
}

/** OAuth 토큰 컬럼 초기화 페이로드 (mallId/Client 변경 시) */
export function cafe24OAuthTokenClearData(message = CAFE24_CREDENTIALS_CHANGED_REAUTH_HINT) {
  return {
    apiKeyCiphertext: null,
    apiKeyIv: null,
    apiKeyAuthTag: null,
    expiresAt: null,
    status: OrderIntegrationAccountStatus.INACTIVE,
    lastErrorMessage: message,
  };
}

/** 계정에 암호화 저장된 개인 Client만 사용. CAFE24_CLIENT_* 공용 env는 사용하지 않는다. */
export function toCafe24Credentials(account: OrderIntegrationAccount): Cafe24ClientCredentials {
  const mallId = assertValidCafe24MallId(account.vendorId ?? '');

  if (!accountHasPersonalClientCredentials(account)) {
    throw new Error(CAFE24_LEGACY_REREGISTER_HINT);
  }

  return {
    mallId,
    clientId: decryptClientId(account),
    clientSecret: decryptClientSecret(account),
  };
}

export function toCafe24AccountPublic(account: OrderIntegrationAccount): Cafe24AccountPublic {
  const clientIdPlain = tryDecryptClientId(account);
  const hasClientSecret = Boolean(toSecretEncryptedField(account));
  const hasPersonal = accountHasPersonalClientCredentials(account);
  const hasStoredTokenBlob = Boolean(toApiKeyEncryptedField(account));
  const isLegacySharedTokenOnly = !hasPersonal && hasStoredTokenBlob;

  let hasOAuthTokens = false;
  let tokenScopes: string[] = [];

  // 개인 Client 없이 남은 공용앱 토큰은 "연결됨"으로 보지 않는다.
  if (hasPersonal) {
    try {
      const tokens = decryptCafe24TokenSet(account);
      hasOAuthTokens = true;
      tokenScopes = tokens.scopes ?? [];
    } catch {
      hasOAuthTokens = false;
    }
  }

  const missingScopes = hasOAuthTokens ? listMissingCafe24Scopes(tokenScopes) : [...listMissingCafe24Scopes([])];
  const hasRequiredScopes = hasOAuthTokens && hasAllCafe24RequiredScopes(tokenScopes);
  const needsReauthForScopes = hasOAuthTokens && !hasRequiredScopes;

  let reauthMessage: string | null = null;
  if (isLegacySharedTokenOnly || !hasPersonal) {
    reauthMessage = CAFE24_LEGACY_REREGISTER_HINT;
  } else if (needsReauthForScopes) {
    reauthMessage = CAFE24_REAUTH_SCOPE_HINT;
  }

  const sanitizedLastError = sanitizePublicOptionalIntegrationErrorMessage(account.lastErrorMessage);

  return {
    id: account.id,
    accountName: account.accountName,
    mallId: account.vendorId ?? '',
    clientId: clientIdPlain,
    clientIdMasked: maskIntegrationSecret(clientIdPlain),
    clientSecretMasked: '',
    hasClientId: Boolean(clientIdPlain),
    hasClientSecret,
    hasOAuthTokens,
    hasRequiredScopes,
    missingScopes,
    needsReauthForScopes,
    reauthMessage,
    usesSharedApp: false,
    tokenExpiresAt: hasOAuthTokens ? (account.expiresAt?.toISOString() ?? null) : null,
    // 레거시·미완 계정은 ACTIVE여도 화면상 재연동 필요로 표시
    status: hasPersonal && hasOAuthTokens ? mapStatus(account.status) : 'inactive',
    lastTestedAt: account.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastErrorMessage: sanitizedLastError ?? (isLegacySharedTokenOnly ? CAFE24_LEGACY_REREGISTER_HINT : null),
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
  clientId?: string;
  clientSecret?: string;
}): Promise<OrderIntegrationAccount> {
  const accountName = input.accountName.trim();
  const mallId = assertValidCafe24MallId(input.mallId);
  const incomingClientId = (input.clientId ?? '').trim();
  const incomingClientSecret = (input.clientSecret ?? '').trim();

  if (!accountName) {
    throw new Error('계정명은 필수입니다.');
  }

  const existingByMall = await prisma.orderIntegrationAccount.findUnique({
    where: {
      userId_provider_vendorId: {
        userId: input.userId,
        provider: OrderIntegrationProvider.CAFE24,
        vendorId: mallId,
      },
    },
  });

  // mallId가 바뀐 경우: 동일 사용자 최신 카페24 계정을 찾아 vendorId를 갱신한다.
  const previousForUser =
    existingByMall == null ? await getCafe24AccountForUser(input.userId) : null;
  const existing =
    existingByMall ??
    (previousForUser && previousForUser.vendorId !== mallId ? previousForUser : null);

  const mallIdChanged = Boolean(existing && (existing.vendorId ?? '') !== mallId);

  const existingClientId = existing ? tryDecryptClientId(existing) : '';
  const existingClientSecret = existing ? tryDecryptClientSecret(existing) : '';

  const nextClientId = incomingClientId || existingClientId;
  if (!nextClientId) {
    throw new Error('Client ID는 필수입니다.');
  }

  const nextClientSecret = incomingClientSecret || existingClientSecret;
  if (!nextClientSecret) {
    throw new Error('Client Secret은 필수입니다.');
  }

  const clientIdChanged = Boolean(existing) && nextClientId !== existingClientId;
  // 빈 Secret 입력 = 유지. 새 값이 있을 때만 교체·토큰 초기화 대상.
  const clientSecretChanged =
    Boolean(existing) && Boolean(incomingClientSecret) && nextClientSecret !== existingClientSecret;
  /** 신규·mallId/Client 변경·레거시(개인 Client 없음)면 기존 토큰과 섞지 않는다 */
  const credentialsChanged =
    !existing ||
    !accountHasPersonalClientCredentials(existing) ||
    mallIdChanged ||
    clientIdChanged ||
    clientSecretChanged;

  const accessEncrypted =
    incomingClientId || !existing || clientIdChanged
      ? encryptIntegrationSecret(nextClientId)
      : {
          ciphertext: existing!.accessKeyCiphertext!,
          iv: existing!.accessKeyIv!,
          authTag: existing!.accessKeyAuthTag!,
          keyVersion: existing!.encryptionKeyVersion,
        };

  const secretEncrypted =
    incomingClientSecret || !existing || !accountHasPersonalClientCredentials(existing)
      ? encryptIntegrationSecret(nextClientSecret)
      : {
          ciphertext: existing!.secretKeyCiphertext!,
          iv: existing!.secretKeyIv!,
          authTag: existing!.secretKeyAuthTag!,
          keyVersion: existing!.encryptionKeyVersion,
        };

  const credentialData = {
    accountName,
    vendorId: mallId,
    accessKeyCiphertext: accessEncrypted.ciphertext,
    accessKeyIv: accessEncrypted.iv,
    accessKeyAuthTag: accessEncrypted.authTag,
    secretKeyCiphertext: secretEncrypted.ciphertext,
    secretKeyIv: secretEncrypted.iv,
    secretKeyAuthTag: secretEncrypted.authTag,
    encryptionKeyVersion: accessEncrypted.keyVersion,
  };

  if (existing) {
    if (credentialsChanged) {
      return prisma.orderIntegrationAccount.update({
        where: { id: existing.id },
        data: {
          ...credentialData,
          ...cafe24OAuthTokenClearData(),
        },
      });
    }

    return prisma.orderIntegrationAccount.update({
      where: { id: existing.id },
      data: {
        ...credentialData,
        lastErrorMessage: null,
      },
    });
  }

  return prisma.orderIntegrationAccount.create({
    data: {
      userId: input.userId,
      provider: OrderIntegrationProvider.CAFE24,
      ...credentialData,
      status: OrderIntegrationAccountStatus.INACTIVE,
      lastErrorMessage: null,
    },
  });
}

export async function saveCafe24OAuthTokens(input: {
  accountId: string;
  tokens: Cafe24TokenSet;
}): Promise<OrderIntegrationAccount> {
  if (!hasAllCafe24RequiredScopes(input.tokens.scopes)) {
    const missing = listMissingCafe24Scopes(input.tokens.scopes);
    throw new Error(
      `필수 권한이 부족하여 연동할 수 없습니다: ${missing.join(', ')}. Developers 앱 Scope를 확인한 뒤 다시 연동해 주세요.`,
    );
  }

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
  // 레거시(개인 Client 없음)는 refresh·주문 API 진입 전에 차단한다.
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
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionTestResult(input);
}

export async function markCafe24AccountSyncResult(input: {
  accountId: string;
  userId: string;
  operationSequence: bigint;
  result: ConnectionOperationResult;
}): Promise<void> {
  await recordConnectionSyncResult(input);
}
