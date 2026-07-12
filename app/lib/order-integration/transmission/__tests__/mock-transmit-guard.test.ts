import { describe, expect, it } from 'vitest';

import {
  evaluateMockTransmitGuard,
  isCredentialConfiguredFromMarkers,
  isMockTestBatchFileName,
  parseMockTransmitAllowlist,
} from '@/app/lib/order-integration/transmission/mock-transmit-guard';

const BASE_ENV = {
  nodeEnv: 'development',
  vercelEnv: 'preview',
  envProfile: 'smoke',
  featureEnabled: 'true',
  allowedUserIds: 'user-a,user-b',
  batchPrefix: 'shipment-transmission-it-',
};

describe('evaluateMockTransmitGuard', () => {
  it('blocks when feature flag is not exact true', () => {
    for (const featureEnabled of ['false', 'TRUE', '', undefined]) {
      const result = evaluateMockTransmitGuard({
        env: { ...BASE_ENV, featureEnabled },
        authenticatedUserId: 'user-a',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('MOCK_FEATURE_DISABLED');
      expect(result.safeMessage).not.toMatch(/user-a|TRUE|ORDER_TRANSMISSION/);
    }
  });

  it('blocks production via NODE_ENV, VERCEL_ENV, or profile even if flag/allowlist ok', () => {
    const cases = [
      { nodeEnv: 'production' },
      { vercelEnv: 'production' },
      { envProfile: 'production' },
    ];
    for (const override of cases) {
      const result = evaluateMockTransmitGuard({
        env: { ...BASE_ENV, ...override },
        authenticatedUserId: 'user-a',
        batch: {
          id: 'b1',
          originalFileName: 'shipment-transmission-it-file.xlsx',
        },
        credentialConfigured: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('MOCK_PRODUCTION_BLOCKED');
      expect(result.safeMessage).not.toMatch(/production|user-a|shipment-transmission/i);
    }
  });

  it('blocks empty allowlist and users not listed', () => {
    expect(
      evaluateMockTransmitGuard({
        env: { ...BASE_ENV, allowedUserIds: '' },
        authenticatedUserId: 'user-a',
      }).reasonCode,
    ).toBe('MOCK_USER_NOT_ALLOWED');
    expect(
      evaluateMockTransmitGuard({
        env: BASE_ENV,
        authenticatedUserId: 'user-z',
      }).reasonCode,
    ).toBe('MOCK_USER_NOT_ALLOWED');
  });

  it('blocks when batch prefix missing or filename mismatch', () => {
    expect(
      evaluateMockTransmitGuard({
        env: { ...BASE_ENV, batchPrefix: '' },
        authenticatedUserId: 'user-a',
        batch: { id: 'b1', originalFileName: 'shipment-transmission-it-x.xlsx' },
        credentialConfigured: false,
      }).reasonCode,
    ).toBe('MOCK_TEST_BATCH_REQUIRED');

    expect(
      evaluateMockTransmitGuard({
        env: BASE_ENV,
        authenticatedUserId: 'user-a',
        batch: { id: 'b1', originalFileName: 'customer-upload.xlsx' },
        credentialConfigured: false,
      }).reasonCode,
    ).toBe('MOCK_TEST_BATCH_REQUIRED');
  });

  it('blocks credential-configured accounts', () => {
    const result = evaluateMockTransmitGuard({
      env: BASE_ENV,
      authenticatedUserId: 'user-a',
      batch: {
        id: 'b1',
        originalFileName: 'shipment-transmission-it-file.xlsx',
        integrationAccountId: 'acc-1',
      },
      credentialConfigured: true,
    });
    expect(result.reasonCode).toBe('MOCK_CREDENTIAL_ACCOUNT_BLOCKED');
    expect(JSON.stringify(result)).not.toMatch(/acc-1/);
  });

  it('allows when all gates pass (IT account id ok if no credential)', () => {
    const result = evaluateMockTransmitGuard({
      env: BASE_ENV,
      authenticatedUserId: 'user-a',
      batch: {
        id: 'b1',
        originalFileName: 'shipment-transmission-it-file.xlsx',
        integrationAccountId: 'acc-it',
      },
      credentialConfigured: false,
    });
    expect(result).toEqual({
      allowed: true,
      reasonCode: null,
      safeMessage: 'Mock transmit allowed.',
    });
  });

  it('pre-DB phase allows after env/user gates without batch', () => {
    const result = evaluateMockTransmitGuard({
      env: BASE_ENV,
      authenticatedUserId: 'user-a',
    });
    expect(result.allowed).toBe(true);
  });
});

describe('mock transmit guard helpers', () => {
  it('parses allowlist and test filename prefix', () => {
    expect(parseMockTransmitAllowlist(' a, b ,')).toEqual(['a', 'b']);
    expect(isMockTestBatchFileName('shipment-transmission-it-x.xlsx', 'shipment-transmission-it-')).toBe(
      true,
    );
    expect(isCredentialConfiguredFromMarkers({ hasAccessKeyCiphertext: true })).toBe(true);
    expect(
      isCredentialConfiguredFromMarkers({
        hasAccessKeyCiphertext: false,
        hasSecretKeyCiphertext: false,
        hasApiKeyCiphertext: false,
      }),
    ).toBe(false);
  });
});
