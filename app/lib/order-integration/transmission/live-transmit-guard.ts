/**
 * Real (live) shipment transmission allowlist guard.
 * Master switch ORDER_TRANSMISSION_ENABLED remains separate.
 * Empty allowlists → deny all live external transmits.
 * No DB I/O. Never logs secrets or account ciphertext.
 */

export const ORDER_TRANSMISSION_ALLOWED_PROVIDERS =
  'ORDER_TRANSMISSION_ALLOWED_PROVIDERS';
export const ORDER_TRANSMISSION_ALLOWED_INTEGRATION_ACCOUNT_IDS =
  'ORDER_TRANSMISSION_ALLOWED_INTEGRATION_ACCOUNT_IDS';

export type LiveTransmitAllowlistReasonCode =
  | 'LIVE_ALLOWLIST_NOT_CONFIGURED'
  | 'LIVE_PROVIDER_NOT_ALLOWED'
  | 'LIVE_ACCOUNT_NOT_ALLOWED';

export type LiveTransmitAccountStatusReasonCode = 'ACCOUNT_NOT_ACTIVE';

export type LiveTransmitAllowlistResult =
  | { allowed: true; reasonCode: null; safeMessage: string }
  | {
      allowed: false;
      reasonCode: LiveTransmitAllowlistReasonCode;
      safeMessage: string;
    };

export type LiveTransmitAccountStatusResult =
  | { allowed: true; reasonCode: null; safeMessage: string }
  | {
      allowed: false;
      reasonCode: LiveTransmitAccountStatusReasonCode;
      safeMessage: string;
    };

/** Live 송장 전송은 계정 status가 정확히 ACTIVE일 때만 허용한다. */
export function isLiveTransmitAccountStatusActive(
  status: string | null | undefined,
): boolean {
  return status === 'ACTIVE';
}

/**
 * INACTIVE·ERROR 등 비활성 계정은 외부 API 호출 전에 차단한다.
 * healthStatus·soft failure 정책과는 무관하다.
 */
export function evaluateLiveTransmitAccountStatus(
  status: string | null | undefined,
): LiveTransmitAccountStatusResult {
  if (isLiveTransmitAccountStatusActive(status)) {
    return {
      allowed: true,
      reasonCode: null,
      safeMessage: 'Integration account is active for live transmission.',
    };
  }
  return {
    allowed: false,
    reasonCode: 'ACCOUNT_NOT_ACTIVE',
    safeMessage:
      'Integration account is not active. Activate the account before transmitting. No external request was sent.',
  };
}

/** Comma-separated tokens; trim; drop empties. Case preserved for account IDs. */
export function parseLiveTransmitAllowlist(
  raw: string | null | undefined,
): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Providers compared case-insensitively after trim/upper. */
export function normalizeLiveTransmitProviderToken(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Both allowlists must be non-empty. Used when master switch is already ON.
 */
export function evaluateLiveTransmitAllowlistsConfigured(input: {
  allowedProvidersRaw: string | null | undefined;
  allowedAccountIdsRaw: string | null | undefined;
}): LiveTransmitAllowlistResult {
  const providers = parseLiveTransmitAllowlist(input.allowedProvidersRaw);
  const accounts = parseLiveTransmitAllowlist(input.allowedAccountIdsRaw);
  if (providers.length === 0 || accounts.length === 0) {
    return {
      allowed: false,
      reasonCode: 'LIVE_ALLOWLIST_NOT_CONFIGURED',
      safeMessage:
        'Live shipment transmission allowlist is not configured. No external request was sent.',
    };
  }
  return {
    allowed: true,
    reasonCode: null,
    safeMessage: 'Live transmission allowlists are configured.',
  };
}

/**
 * Candidate must match both provider and integrationAccountId allowlists.
 */
export function evaluateLiveTransmitCandidateAllowlist(input: {
  allowedProviders: ReadonlyArray<string>;
  allowedAccountIds: ReadonlyArray<string>;
  provider: string;
  integrationAccountId: string;
}): LiveTransmitAllowlistResult {
  if (input.allowedProviders.length === 0 || input.allowedAccountIds.length === 0) {
    return {
      allowed: false,
      reasonCode: 'LIVE_ALLOWLIST_NOT_CONFIGURED',
      safeMessage:
        'Live shipment transmission allowlist is not configured. No external request was sent.',
    };
  }

  const provider = normalizeLiveTransmitProviderToken(input.provider);
  const allowedProviders = new Set(
    input.allowedProviders.map(normalizeLiveTransmitProviderToken),
  );
  if (!provider || !allowedProviders.has(provider)) {
    return {
      allowed: false,
      reasonCode: 'LIVE_PROVIDER_NOT_ALLOWED',
      safeMessage:
        'Provider is not allowed for live shipment transmission. No external request was sent.',
    };
  }

  const accountId = input.integrationAccountId.trim();
  const allowedAccounts = new Set(
    input.allowedAccountIds.map((id) => id.trim()).filter((id) => id.length > 0),
  );
  if (!accountId || !allowedAccounts.has(accountId)) {
    return {
      allowed: false,
      reasonCode: 'LIVE_ACCOUNT_NOT_ALLOWED',
      safeMessage:
        'Integration account is not allowed for live shipment transmission. No external request was sent.',
    };
  }

  return {
    allowed: true,
    reasonCode: null,
    safeMessage: 'Live transmission candidate is allowlisted.',
  };
}

export function readLiveTransmitAllowlistsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): {
  allowedProviders: string[];
  allowedAccountIds: string[];
} {
  return {
    allowedProviders: parseLiveTransmitAllowlist(
      env[ORDER_TRANSMISSION_ALLOWED_PROVIDERS],
    ),
    allowedAccountIds: parseLiveTransmitAllowlist(
      env[ORDER_TRANSMISSION_ALLOWED_INTEGRATION_ACCOUNT_IDS],
    ),
  };
}
