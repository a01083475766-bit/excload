import { describe, expect, it } from 'vitest';
import { CAFE24_OAUTH_SCOPES } from '@/app/lib/cafe24/constants';
import type { OrderIntegrationAccount } from '@prisma/client';
import { encryptIntegrationSecret } from '@/app/lib/order-integration/encryption';
import { serializeCafe24TokenSet } from '@/app/lib/cafe24/client';
import { toCafe24AccountPublic } from '@/app/lib/order-integration/cafe24-account';

describe('Cafe24 public account safety', () => {
  it('does not expose client secret or tokens for personal-app accounts', () => {
    const prevEnc = process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
    const prevId = process.env.CAFE24_CLIENT_ID;
    const prevSecret = process.env.CAFE24_CLIENT_SECRET;
    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    delete process.env.CAFE24_CLIENT_ID;
    delete process.env.CAFE24_CLIENT_SECRET;

    try {
      const access = encryptIntegrationSecret('personal-client-id');
      const secret = encryptIntegrationSecret('personal-client-secret-value');
      const tokenBundle = serializeCafe24TokenSet({
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        scopes: CAFE24_OAUTH_SCOPES.split(/\s+/),
      });
      const enc = encryptIntegrationSecret(tokenBundle);
      const account = {
        id: 'a1',
        userId: 'u1',
        provider: 'CAFE24',
        accountName: 'mall',
        vendorId: 'demo',
        sellerId: null,
        accessKeyCiphertext: access.ciphertext,
        accessKeyIv: access.iv,
        accessKeyAuthTag: access.authTag,
        secretKeyCiphertext: secret.ciphertext,
        secretKeyIv: secret.iv,
        secretKeyAuthTag: secret.authTag,
        apiKeyCiphertext: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyAuthTag: enc.authTag,
        encryptionKeyVersion: enc.keyVersion,
        expiresAt: new Date(),
        status: 'ACTIVE',
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
        createdAt: new Date(),
        updatedAt: new Date(),
      } as OrderIntegrationAccount;

      const pub = toCafe24AccountPublic(account);
      const json = JSON.stringify(pub);
      expect(json).not.toContain('personal-client-secret-value');
      expect(json).not.toContain('access-token-value');
      expect(json).not.toContain('refresh-token-value');
      expect(pub.clientId).toBe('personal-client-id');
      expect(pub.clientSecretMasked).toBe('');
      expect(pub.hasClientSecret).toBe(true);
      expect(pub.usesSharedApp).toBe(false);
      expect(pub.hasRequiredScopes).toBe(true);
      expect(pub.needsReauthForScopes).toBe(false);
    } finally {
      process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = prevEnc;
      if (prevId === undefined) delete process.env.CAFE24_CLIENT_ID;
      else process.env.CAFE24_CLIENT_ID = prevId;
      if (prevSecret === undefined) delete process.env.CAFE24_CLIENT_SECRET;
      else process.env.CAFE24_CLIENT_SECRET = prevSecret;
    }
  });

  it('marks read-only stored scopes as needing reauth', () => {
    const prevEnc = process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
    const prevId = process.env.CAFE24_CLIENT_ID;
    const prevSecret = process.env.CAFE24_CLIENT_SECRET;
    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    delete process.env.CAFE24_CLIENT_ID;
    delete process.env.CAFE24_CLIENT_SECRET;

    try {
      const access = encryptIntegrationSecret('legacy-client-id');
      const secret = encryptIntegrationSecret('legacy-client-secret');
      const tokens = encryptIntegrationSecret(
        serializeCafe24TokenSet({
          accessToken: 'a',
          refreshToken: 'r',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          scopes: ['mall.read_order'],
        }),
      );
      const account = {
        id: 'a1',
        userId: 'u1',
        provider: 'CAFE24',
        accountName: 'mall',
        vendorId: 'demo',
        sellerId: null,
        accessKeyCiphertext: access.ciphertext,
        accessKeyIv: access.iv,
        accessKeyAuthTag: access.authTag,
        secretKeyCiphertext: secret.ciphertext,
        secretKeyIv: secret.iv,
        secretKeyAuthTag: secret.authTag,
        apiKeyCiphertext: tokens.ciphertext,
        apiKeyIv: tokens.iv,
        apiKeyAuthTag: tokens.authTag,
        encryptionKeyVersion: tokens.keyVersion,
        expiresAt: new Date(),
        status: 'ACTIVE',
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
        createdAt: new Date(),
        updatedAt: new Date(),
      } as OrderIntegrationAccount;

      const pub = toCafe24AccountPublic(account);
      expect(pub.needsReauthForScopes).toBe(true);
      expect(pub.hasRequiredScopes).toBe(false);
      expect(JSON.stringify(pub)).not.toContain('legacy-client-secret');
    } finally {
      process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = prevEnc;
      if (prevId === undefined) delete process.env.CAFE24_CLIENT_ID;
      else process.env.CAFE24_CLIENT_ID = prevId;
      if (prevSecret === undefined) delete process.env.CAFE24_CLIENT_SECRET;
      else process.env.CAFE24_CLIENT_SECRET = prevSecret;
    }
  });
});
