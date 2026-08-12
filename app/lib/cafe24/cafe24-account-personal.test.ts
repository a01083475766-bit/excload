import { OrderIntegrationAccountStatus, OrderIntegrationProvider, type OrderIntegrationAccount } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAFE24_OAUTH_SCOPES } from '@/app/lib/cafe24/constants';
import {
  encryptIntegrationSecret,
} from '@/app/lib/order-integration/encryption';
import { serializeCafe24TokenSet } from '@/app/lib/cafe24/client';
import {
  CAFE24_CREDENTIALS_CHANGED_REAUTH_HINT,
  decryptClientId,
  decryptClientSecret,
  saveCafe24Account,
  toCafe24AccountPublic,
  toCafe24Credentials,
} from '@/app/lib/order-integration/cafe24-account';
import { prisma } from '@/app/lib/prisma';

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    orderIntegrationAccount: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

async function withEncryptionKey<T>(fn: () => T | Promise<T>): Promise<T> {
  const prev = process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
  const prevId = process.env.CAFE24_CLIENT_ID;
  const prevSecret = process.env.CAFE24_CLIENT_SECRET;
  process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  delete process.env.CAFE24_CLIENT_ID;
  delete process.env.CAFE24_CLIENT_SECRET;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
    else process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = prev;
    if (prevId === undefined) delete process.env.CAFE24_CLIENT_ID;
    else process.env.CAFE24_CLIENT_ID = prevId;
    if (prevSecret === undefined) delete process.env.CAFE24_CLIENT_SECRET;
    else process.env.CAFE24_CLIENT_SECRET = prevSecret;
  }
}

function baseAccount(
  overrides: Partial<OrderIntegrationAccount> & {
    access?: ReturnType<typeof encryptIntegrationSecret>;
    secret?: ReturnType<typeof encryptIntegrationSecret>;
    tokens?: ReturnType<typeof encryptIntegrationSecret>;
  } = {},
): OrderIntegrationAccount {
  const { access, secret, tokens, ...rest } = overrides;
  return {
    id: 'acc-1',
    userId: 'user-a',
    provider: OrderIntegrationProvider.CAFE24,
    accountName: 'mall-a',
    vendorId: 'demomall',
    sellerId: null,
    accessKeyCiphertext: access?.ciphertext ?? null,
    accessKeyIv: access?.iv ?? null,
    accessKeyAuthTag: access?.authTag ?? null,
    secretKeyCiphertext: secret?.ciphertext ?? null,
    secretKeyIv: secret?.iv ?? null,
    secretKeyAuthTag: secret?.authTag ?? null,
    apiKeyCiphertext: tokens?.ciphertext ?? null,
    apiKeyIv: tokens?.iv ?? null,
    apiKeyAuthTag: tokens?.authTag ?? null,
    encryptionKeyVersion: access?.keyVersion ?? secret?.keyVersion ?? tokens?.keyVersion ?? 1,
    expiresAt: tokens ? new Date(Date.now() + 3600_000) : null,
    status: tokens ? OrderIntegrationAccountStatus.ACTIVE : OrderIntegrationAccountStatus.INACTIVE,
    lastTestedAt: null,
    lastSyncedAt: null,
    lastErrorMessage: null,
    healthStatus: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorCategory: null,
    lastErrorCode: null,
    consecutiveFailureCount: 0,
    healthOperationSequence: BigInt(0),
    healthAppliedOperationSequence: BigInt(0),
    healthCheckLeaseToken: null,
    healthCheckLeaseUntil: null,
    authorizationPeriodStart: null,
    authorizationPeriodEnd: null,
    domeggookDeliWithTax: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
  } as OrderIntegrationAccount;
}

afterEach(() => {
  vi.clearAllMocks();
});

function mockAccountUpdate(existing: OrderIntegrationAccount) {
  vi.mocked(prisma.orderIntegrationAccount.update).mockImplementation(((args: { data: object }) =>
    Promise.resolve({
      ...existing,
      ...args.data,
      updatedAt: new Date(),
    } as OrderIntegrationAccount)
  ) as unknown as typeof prisma.orderIntegrationAccount.update);
}

describe('Cafe24 personal app credentials', () => {
  it('toCafe24Credentials uses per-account Client and ignores env even if set', async () => {
    await withEncryptionKey(() => {
      process.env.CAFE24_CLIENT_ID = 'env-shared-id';
      process.env.CAFE24_CLIENT_SECRET = 'env-shared-secret';
      const access = encryptIntegrationSecret('user-client-id');
      const secret = encryptIntegrationSecret('user-client-secret');
      const account = baseAccount({ access, secret });

      const creds = toCafe24Credentials(account);
      expect(creds.clientId).toBe('user-client-id');
      expect(creds.clientSecret).toBe('user-client-secret');
      expect(creds.mallId).toBe('demomall');
    });
  });

  it('toCafe24Credentials fails without personal Client even when env is set', async () => {
    await withEncryptionKey(() => {
      process.env.CAFE24_CLIENT_ID = 'env-shared-id';
      process.env.CAFE24_CLIENT_SECRET = 'env-shared-secret';
      expect(() => toCafe24Credentials(baseAccount())).toThrow(/개인 연동 앱|Client ID\/Secret|다시 진행/);
    });
  });

  it('legacy shared-app tokens are not treated as connected', async () => {
    await withEncryptionKey(() => {
      const tokens = encryptIntegrationSecret(
        serializeCafe24TokenSet({
          accessToken: 'legacy-access',
          refreshToken: 'legacy-refresh',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          scopes: CAFE24_OAUTH_SCOPES.split(/\s+/),
        }),
      );
      const pub = toCafe24AccountPublic(
        baseAccount({
          tokens,
          status: OrderIntegrationAccountStatus.ACTIVE,
        }),
      );
      expect(pub.hasOAuthTokens).toBe(false);
      expect(pub.status).toBe('inactive');
      expect(pub.reauthMessage).toMatch(/개인 연동 앱|다시 진행/);
      expect(JSON.stringify(pub)).not.toContain('legacy-access');
    });
  });

  it('public DTO never returns clientSecret and does not leak tokens', async () => {
    await withEncryptionKey(() => {
      const access = encryptIntegrationSecret('visible-client-id');
      const secret = encryptIntegrationSecret('super-secret-value');
      const tokens = encryptIntegrationSecret(
        serializeCafe24TokenSet({
          accessToken: 'access-token-value',
          refreshToken: 'refresh-token-value',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          scopes: CAFE24_OAUTH_SCOPES.split(/\s+/),
        }),
      );
      const pub = toCafe24AccountPublic(baseAccount({ access, secret, tokens }));
      const json = JSON.stringify(pub);

      expect(pub.clientId).toBe('visible-client-id');
      expect(pub.hasClientSecret).toBe(true);
      expect(pub.clientSecretMasked).toBe('');
      expect(pub.hasOAuthTokens).toBe(true);
      expect(json).not.toContain('super-secret-value');
      expect(json).not.toContain('access-token-value');
      expect(json).not.toContain('refresh-token-value');
      expect(pub).not.toHaveProperty('clientSecret');
    });
  });

  it('saveCafe24Account clears OAuth tokens when Client ID changes', async () => {
    await withEncryptionKey(async () => {
      const access = encryptIntegrationSecret('old-client-id');
      const secret = encryptIntegrationSecret('same-secret');
      const tokens = encryptIntegrationSecret(
        serializeCafe24TokenSet({
          accessToken: 'old-access',
          refreshToken: 'old-refresh',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          scopes: CAFE24_OAUTH_SCOPES.split(/\s+/),
        }),
      );
      const existing = baseAccount({ access, secret, tokens });

      vi.mocked(prisma.orderIntegrationAccount.findUnique).mockResolvedValue(existing);
      mockAccountUpdate(existing);

      await saveCafe24Account({
        userId: 'user-a',
        accountName: 'mall-a',
        mallId: 'demomall',
        clientId: 'new-client-id',
      });

      expect(prisma.orderIntegrationAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            apiKeyCiphertext: null,
            apiKeyIv: null,
            apiKeyAuthTag: null,
            expiresAt: null,
            status: OrderIntegrationAccountStatus.INACTIVE,
            lastErrorMessage: CAFE24_CREDENTIALS_CHANGED_REAUTH_HINT,
          }),
        }),
      );

      const updateArg = vi.mocked(prisma.orderIntegrationAccount.update).mock.calls[0]![0];
      const saved = {
        ...existing,
        ...updateArg.data,
      } as OrderIntegrationAccount;
      expect(decryptClientId(saved)).toBe('new-client-id');
      expect(decryptClientSecret(saved)).toBe('same-secret');
    });
  });

  it('saveCafe24Account clears OAuth tokens when Client Secret changes', async () => {
    await withEncryptionKey(async () => {
      const access = encryptIntegrationSecret('same-client-id');
      const secret = encryptIntegrationSecret('old-secret');
      const tokens = encryptIntegrationSecret(
        serializeCafe24TokenSet({
          accessToken: 'old-access',
          refreshToken: 'old-refresh',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          scopes: CAFE24_OAUTH_SCOPES.split(/\s+/),
        }),
      );
      const existing = baseAccount({ access, secret, tokens });

      vi.mocked(prisma.orderIntegrationAccount.findUnique).mockResolvedValue(existing);
      mockAccountUpdate(existing);

      await saveCafe24Account({
        userId: 'user-a',
        accountName: 'mall-a',
        mallId: 'demomall',
        clientId: 'same-client-id',
        clientSecret: 'brand-new-secret',
      });

      expect(prisma.orderIntegrationAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            apiKeyCiphertext: null,
            status: OrderIntegrationAccountStatus.INACTIVE,
            lastErrorMessage: CAFE24_CREDENTIALS_CHANGED_REAUTH_HINT,
          }),
        }),
      );
    });
  });

  it('saveCafe24Account clears OAuth tokens when mallId (vendorId) changes', async () => {
    await withEncryptionKey(async () => {
      const access = encryptIntegrationSecret('same-client-id');
      const secret = encryptIntegrationSecret('same-secret');
      const tokens = encryptIntegrationSecret(
        serializeCafe24TokenSet({
          accessToken: 'old-access',
          refreshToken: 'old-refresh',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          scopes: CAFE24_OAUTH_SCOPES.split(/\s+/),
        }),
      );
      const existing = baseAccount({
        access,
        secret,
        tokens,
        vendorId: 'oldmall',
      });

      vi.mocked(prisma.orderIntegrationAccount.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.orderIntegrationAccount.findFirst).mockResolvedValue(existing);
      mockAccountUpdate(existing);

      await saveCafe24Account({
        userId: 'user-a',
        accountName: 'mall-a',
        mallId: 'newmall',
        clientId: 'same-client-id',
      });

      expect(prisma.orderIntegrationAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: expect.objectContaining({
            vendorId: 'newmall',
            apiKeyCiphertext: null,
            status: OrderIntegrationAccountStatus.INACTIVE,
            lastErrorMessage: CAFE24_CREDENTIALS_CHANGED_REAUTH_HINT,
          }),
        }),
      );
    });
  });

  it('empty clientSecret keeps existing secret and tokens when Client ID unchanged', async () => {
    await withEncryptionKey(async () => {
      const access = encryptIntegrationSecret('same-client-id');
      const secret = encryptIntegrationSecret('same-secret');
      const tokens = encryptIntegrationSecret(
        serializeCafe24TokenSet({
          accessToken: 'keep-access',
          refreshToken: 'keep-refresh',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          scopes: CAFE24_OAUTH_SCOPES.split(/\s+/),
        }),
      );
      const existing = baseAccount({ access, secret, tokens });

      vi.mocked(prisma.orderIntegrationAccount.findUnique).mockResolvedValue(existing);
      mockAccountUpdate(existing);

      await saveCafe24Account({
        userId: 'user-a',
        accountName: 'renamed-again',
        mallId: 'demomall',
        clientId: 'same-client-id',
        // clientSecret omitted / empty → keep
      });

      const updateData = vi.mocked(prisma.orderIntegrationAccount.update).mock.calls[0]![0].data as Record<
        string,
        unknown
      >;
      expect(updateData.apiKeyCiphertext).toBeUndefined();
      expect(updateData.secretKeyCiphertext).toBe(existing.secretKeyCiphertext);
      expect(decryptClientSecret({ ...existing, ...updateData } as OrderIntegrationAccount)).toBe(
        'same-secret',
      );
    });
  });

  it('ensureCafe24AccessToken refresh path uses account-stored Client credentials', async () => {
    await withEncryptionKey(() => {
      const access = encryptIntegrationSecret('refresh-client-id');
      const secret = encryptIntegrationSecret('refresh-client-secret');
      const creds = toCafe24Credentials(baseAccount({ access, secret }));
      expect(creds.clientId).toBe('refresh-client-id');
      expect(creds.clientSecret).toBe('refresh-client-secret');
    });
  });

  it('getCafe24AccountById scopes lookup to userId (ownership)', async () => {
    vi.mocked(prisma.orderIntegrationAccount.findFirst).mockResolvedValue(null);

    const { getCafe24AccountById } = await import('@/app/lib/order-integration/cafe24-account');
    await getCafe24AccountById({ userId: 'user-b', accountId: 'acc-1' });

    expect(prisma.orderIntegrationAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'acc-1',
        userId: 'user-b',
        provider: OrderIntegrationProvider.CAFE24,
      },
    });
  });
});
