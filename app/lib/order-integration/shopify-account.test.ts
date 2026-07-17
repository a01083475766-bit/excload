import { OrderIntegrationAccountStatus, OrderIntegrationProvider } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from '@/app/lib/order-integration/encryption';
import {
  decryptShopifyAccountCredentials,
  getShopifyAccountById,
  parseShopifyCredentialMeta,
  serializeShopifyCredentialMeta,
  upsertShopifyAccount,
} from '@/app/lib/order-integration/shopify-account';
import { prisma } from '@/app/lib/prisma';
import { normalizeShopifyShopDomain } from '@/app/lib/shopify/shop-domain';

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

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64');

function withEncryptionKey<T>(fn: () => T): T {
  const prev = process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
  process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
    } else {
      process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = prev;
    }
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('OrderIntegrationProvider.SHOPIFY', () => {
  it('is available in Prisma enum', () => {
    expect(OrderIntegrationProvider.SHOPIFY).toBe('SHOPIFY');
  });
});

describe('getShopifyAccountById', () => {
  it('scopes an account id lookup to the logged-in user and returns null for another user', async () => {
    vi.mocked(prisma.orderIntegrationAccount.findFirst).mockResolvedValue(null);

    const account = await getShopifyAccountById({
      userId: 'user-b',
      accountId: 'account-a',
    });

    expect(account).toBeNull();
    expect(prisma.orderIntegrationAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-a',
        userId: 'user-b',
        provider: OrderIntegrationProvider.SHOPIFY,
      },
    });
  });
});

describe('shopify credential meta', () => {
  it('serializes scope and refreshTokenExpiresAt', () => {
    const raw = serializeShopifyCredentialMeta({
      scope: 'read_orders',
      refreshTokenExpiresAt: '2026-10-01T00:00:00.000Z',
    });
    const parsed = parseShopifyCredentialMeta(raw);
    expect(parsed.scope).toBe('read_orders');
    expect(parsed.refreshTokenExpiresAt).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('upsertShopifyAccount', () => {
  it('stores shopDomain as vendorId and encrypts tokens', async () => {
    await withEncryptionKey(async () => {
      vi.mocked(prisma.orderIntegrationAccount.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.orderIntegrationAccount.create).mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'acc-shopify-1',
          userId: data.userId,
          provider: data.provider,
          accountName: data.accountName,
          vendorId: data.vendorId,
          sellerId: null,
          accessKeyCiphertext: data.accessKeyCiphertext,
          accessKeyIv: data.accessKeyIv,
          accessKeyAuthTag: data.accessKeyAuthTag,
          secretKeyCiphertext: data.secretKeyCiphertext,
          secretKeyIv: data.secretKeyIv,
          secretKeyAuthTag: data.secretKeyAuthTag,
          apiKeyCiphertext: data.apiKeyCiphertext,
          apiKeyIv: data.apiKeyIv,
          apiKeyAuthTag: data.apiKeyAuthTag,
          encryptionKeyVersion: data.encryptionKeyVersion,
          expiresAt: data.expiresAt ?? null,
          status: data.status,
          lastTestedAt: null,
          lastSyncedAt: null,
          lastErrorMessage: data.lastErrorMessage ?? null,
          createdAt: new Date('2026-07-08T10:00:00.000Z'),
          updatedAt: new Date('2026-07-08T10:00:00.000Z'),
        }) as ReturnType<typeof prisma.orderIntegrationAccount.create>,
      );

      const account = await upsertShopifyAccount({
        userId: 'user-1',
        shopDomain: 'mystore',
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        scope: 'read_orders',
        tokenExpiresAt: '2026-07-08T11:00:00.000Z',
        refreshTokenExpiresAt: '2026-10-01T00:00:00.000Z',
      });

      expect(account.vendorId).toBe('mystore.myshopify.com');
      expect(account.apiKeyCiphertext).not.toBe('fake-access-token');
      expect(account.secretKeyCiphertext).not.toBe('fake-refresh-token');
      expect(account.accessKeyCiphertext).not.toContain('read_orders');

      const credentials = decryptShopifyAccountCredentials(account);
      expect(credentials.shopDomain).toBe('mystore.myshopify.com');
      expect(credentials.accessToken).toBe('fake-access-token');
      expect(credentials.refreshToken).toBe('fake-refresh-token');
      expect(credentials.scope).toBe('read_orders');
      expect(credentials.tokenExpiresAt?.toISOString()).toBe('2026-07-08T11:00:00.000Z');
      expect(credentials.refreshTokenExpiresAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });
  });

  it('updates existing account instead of creating duplicate', async () => {
    await withEncryptionKey(async () => {
      const existing = {
        id: 'acc-existing',
        userId: 'user-1',
        provider: OrderIntegrationProvider.SHOPIFY,
        accountName: 'mystore.myshopify.com',
        vendorId: 'mystore.myshopify.com',
        sellerId: null,
        accessKeyCiphertext: null,
        accessKeyIv: null,
        accessKeyAuthTag: null,
        secretKeyCiphertext: null,
        secretKeyIv: null,
        secretKeyAuthTag: null,
        apiKeyCiphertext: null,
        apiKeyIv: null,
        apiKeyAuthTag: null,
        encryptionKeyVersion: 1,
        expiresAt: null,
        status: OrderIntegrationAccountStatus.INACTIVE,
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
        authorizationPeriodStart: null,
        authorizationPeriodEnd: null,
        createdAt: new Date('2026-07-08T09:00:00.000Z'),
        updatedAt: new Date('2026-07-08T09:00:00.000Z'),
      };

      vi.mocked(prisma.orderIntegrationAccount.findUnique).mockResolvedValue(existing);
      vi.mocked(prisma.orderIntegrationAccount.update).mockResolvedValue({
        ...existing,
        accountName: 'My Shopify Store',
      });

      await upsertShopifyAccount({
        userId: 'user-1',
        accountName: 'My Shopify Store',
        shopDomain: 'mystore.myshopify.com',
      });

      expect(prisma.orderIntegrationAccount.create).not.toHaveBeenCalled();
      expect(prisma.orderIntegrationAccount.update).toHaveBeenCalledTimes(1);
      expect(prisma.orderIntegrationAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-existing' },
        }),
      );
    });
  });

  it('rejects invalid shopDomain', async () => {
    await withEncryptionKey(async () => {
      await expect(
        upsertShopifyAccount({
          userId: 'user-1',
          shopDomain: 'evil-myshopify.com',
          accessToken: 'fake-access-token',
        }),
      ).rejects.toThrow();

      expect(prisma.orderIntegrationAccount.findUnique).not.toHaveBeenCalled();
    });
  });
});

describe('shopify encryption round-trip', () => {
  it('does not persist plaintext secrets in encrypted fields', () => {
    withEncryptionKey(() => {
      const encrypted = encryptIntegrationSecret('fake-token-value');
      expect(encrypted.ciphertext).not.toContain('fake-token-value');
      expect(decryptIntegrationSecret(encrypted)).toBe('fake-token-value');
    });
  });

  it('normalizes shop domain for vendorId storage', () => {
    expect(normalizeShopifyShopDomain('https://mystore.myshopify.com')).toBe('mystore.myshopify.com');
  });
});
