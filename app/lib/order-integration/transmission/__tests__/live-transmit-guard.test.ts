import { describe, expect, it } from 'vitest';

import {
  evaluateLiveTransmitAccountStatus,
  evaluateLiveTransmitAllowlistsConfigured,
  evaluateLiveTransmitCandidateAllowlist,
  isLiveTransmitAccountStatusActive,
  ORDER_TRANSMISSION_ALLOWED_INTEGRATION_ACCOUNT_IDS,
  ORDER_TRANSMISSION_ALLOWED_PROVIDERS,
  parseLiveTransmitAllowlist,
  readLiveTransmitAllowlistsFromEnv,
} from '@/app/lib/order-integration/transmission/live-transmit-guard';

describe('live-transmit-guard', () => {
  it('parses comma allowlists and treats empty as none', () => {
    expect(parseLiveTransmitAllowlist(undefined)).toEqual([]);
    expect(parseLiveTransmitAllowlist('')).toEqual([]);
    expect(parseLiveTransmitAllowlist(' SMARTSTORE , COUPANG ')).toEqual([
      'SMARTSTORE',
      'COUPANG',
    ]);
  });

  it('blocks when either allowlist is missing', () => {
    expect(
      evaluateLiveTransmitAllowlistsConfigured({
        allowedProvidersRaw: '',
        allowedAccountIdsRaw: 'acc-1',
      }).allowed,
    ).toBe(false);
    expect(
      evaluateLiveTransmitAllowlistsConfigured({
        allowedProvidersRaw: 'SMARTSTORE',
        allowedAccountIdsRaw: null,
      }).reasonCode,
    ).toBe('LIVE_ALLOWLIST_NOT_CONFIGURED');
  });

  it('allows only listed SMARTSTORE account and blocks COUPANG / other account', () => {
    const providers = ['SMARTSTORE'];
    const accounts = ['acc-allowed-1'];

    expect(
      evaluateLiveTransmitCandidateAllowlist({
        allowedProviders: providers,
        allowedAccountIds: accounts,
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-allowed-1',
      }).allowed,
    ).toBe(true);

    expect(
      evaluateLiveTransmitCandidateAllowlist({
        allowedProviders: providers,
        allowedAccountIds: accounts,
        provider: 'COUPANG',
        integrationAccountId: 'acc-allowed-1',
      }).reasonCode,
    ).toBe('LIVE_PROVIDER_NOT_ALLOWED');

    expect(
      evaluateLiveTransmitCandidateAllowlist({
        allowedProviders: providers,
        allowedAccountIds: accounts,
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-other',
      }).reasonCode,
    ).toBe('LIVE_ACCOUNT_NOT_ALLOWED');
  });

  it('reads env keys without exposing values in assertions beyond presence', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      [ORDER_TRANSMISSION_ALLOWED_PROVIDERS]: 'SMARTSTORE',
      [ORDER_TRANSMISSION_ALLOWED_INTEGRATION_ACCOUNT_IDS]: 'acc-1',
    };
    const parsed = readLiveTransmitAllowlistsFromEnv(env);
    expect(parsed.allowedProviders).toEqual(['SMARTSTORE']);
    expect(parsed.allowedAccountIds).toHaveLength(1);
  });

  it('allows only ACTIVE account status for live transmit', () => {
    expect(isLiveTransmitAccountStatusActive('ACTIVE')).toBe(true);
    expect(isLiveTransmitAccountStatusActive('INACTIVE')).toBe(false);
    expect(isLiveTransmitAccountStatusActive('ERROR')).toBe(false);
    expect(isLiveTransmitAccountStatusActive(null)).toBe(false);

    expect(evaluateLiveTransmitAccountStatus('ACTIVE').allowed).toBe(true);
    expect(evaluateLiveTransmitAccountStatus('INACTIVE').reasonCode).toBe('ACCOUNT_NOT_ACTIVE');
    expect(evaluateLiveTransmitAccountStatus('ERROR').reasonCode).toBe('ACCOUNT_NOT_ACTIVE');
    expect(evaluateLiveTransmitAccountStatus('INACTIVE').safeMessage).toMatch(/비활성/);
  });
});
