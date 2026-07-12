/**
 * Pure mock-transmit environment / batch / credential guard.
 * No DB I/O. No env mutation. Safe reason codes only.
 */

export const ORDER_TRANSMISSION_MOCK_ENABLED = 'ORDER_TRANSMISSION_MOCK_ENABLED';
export const ORDER_TRANSMISSION_MOCK_ALLOWED_USER_IDS =
  'ORDER_TRANSMISSION_MOCK_ALLOWED_USER_IDS';
export const ORDER_TRANSMISSION_MOCK_BATCH_PREFIX = 'ORDER_TRANSMISSION_MOCK_BATCH_PREFIX';

export const DEFAULT_ORDER_TRANSMISSION_MOCK_BATCH_PREFIX = 'shipment-transmission-it-';

export type MockTransmitGuardReasonCode =
  | 'MOCK_FEATURE_DISABLED'
  | 'MOCK_PRODUCTION_BLOCKED'
  | 'MOCK_USER_NOT_ALLOWED'
  | 'MOCK_TEST_BATCH_REQUIRED'
  | 'MOCK_CREDENTIAL_ACCOUNT_BLOCKED';

export type MockTransmitGuardResult = {
  allowed: boolean;
  reasonCode: MockTransmitGuardReasonCode | null;
  safeMessage: string;
};

export type MockTransmitGuardEnvInput = {
  nodeEnv?: string | null;
  vercelEnv?: string | null;
  /** e.g. EXCLOAD_ENV_PROFILE */
  envProfile?: string | null;
  featureEnabled?: string | null;
  allowedUserIds?: string | null;
  /** empty / missing → block all batches */
  batchPrefix?: string | null;
};

export type MockTransmitGuardBatchInput = {
  id: string;
  /** ShipmentUploadBatch.originalFileName */
  originalFileName?: string | null;
  integrationAccountId?: string | null;
};

export type MockTransmitGuardInput = {
  env: MockTransmitGuardEnvInput;
  authenticatedUserId: string;
  /** omit for pre-DB checks (production / feature / allowlist only) */
  batch?: MockTransmitGuardBatchInput | null;
  /**
   * true when any credential ciphertext marker is present on the linked account.
   * Caller must compute without decrypting. Prefer false for IT accounts with null ciphers.
   */
  credentialConfigured?: boolean;
};

function deny(
  reasonCode: MockTransmitGuardReasonCode,
  safeMessage: string,
): MockTransmitGuardResult {
  return { allowed: false, reasonCode, safeMessage };
}

function allow(): MockTransmitGuardResult {
  return { allowed: true, reasonCode: null, safeMessage: 'Mock transmit allowed.' };
}

export function isMockTransmitProductionBlocked(env: MockTransmitGuardEnvInput): boolean {
  const nodeEnv = String(env.nodeEnv ?? '').trim().toLowerCase();
  const vercelEnv = String(env.vercelEnv ?? '').trim().toLowerCase();
  const profile = String(env.envProfile ?? '').trim().toLowerCase();
  return (
    nodeEnv === 'production' ||
    vercelEnv === 'production' ||
    profile === 'production'
  );
}

export function parseMockTransmitAllowlist(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Non-sensitive ciphertext presence check — never pass cipher contents.
 */
export function isCredentialConfiguredFromMarkers(markers: {
  hasAccessKeyCiphertext?: boolean;
  hasSecretKeyCiphertext?: boolean;
  hasApiKeyCiphertext?: boolean;
}): boolean {
  return Boolean(
    markers.hasAccessKeyCiphertext ||
      markers.hasSecretKeyCiphertext ||
      markers.hasApiKeyCiphertext,
  );
}

export function isMockTestBatchFileName(
  originalFileName: string | null | undefined,
  batchPrefix: string,
): boolean {
  const name = String(originalFileName ?? '').trim();
  const prefix = batchPrefix.trim();
  if (!prefix || !name) return false;
  return name.startsWith(prefix);
}

/**
 * Evaluate mock transmit guard.
 *
 * Call without `batch` for pre-DB gates (production / feature / allowlist).
 * Call again with batch + credentialConfigured after minimal batch read.
 */
export function evaluateMockTransmitGuard(
  input: MockTransmitGuardInput,
): MockTransmitGuardResult {
  if (isMockTransmitProductionBlocked(input.env)) {
    return deny(
      'MOCK_PRODUCTION_BLOCKED',
      'Mock transmit is not available in this environment.',
    );
  }

  if (String(input.env.featureEnabled ?? '').trim() !== 'true') {
    return deny(
      'MOCK_FEATURE_DISABLED',
      'Mock transmit is disabled.',
    );
  }

  const allowlist = parseMockTransmitAllowlist(input.env.allowedUserIds);
  if (allowlist.length === 0) {
    return deny(
      'MOCK_USER_NOT_ALLOWED',
      'Mock transmit is not permitted for this user.',
    );
  }

  const userId = String(input.authenticatedUserId ?? '').trim();
  if (!userId || !allowlist.includes(userId)) {
    return deny(
      'MOCK_USER_NOT_ALLOWED',
      'Mock transmit is not permitted for this user.',
    );
  }

  // Pre-DB phase: stop after env/user gates
  if (input.batch == null) {
    return allow();
  }

  const prefix = String(input.env.batchPrefix ?? '').trim();
  if (!prefix) {
    return deny(
      'MOCK_TEST_BATCH_REQUIRED',
      'Mock transmit requires a configured test batch marker.',
    );
  }

  if (!isMockTestBatchFileName(input.batch.originalFileName, prefix)) {
    return deny(
      'MOCK_TEST_BATCH_REQUIRED',
      'Mock transmit is limited to designated test batches.',
    );
  }

  // Policy: block accounts that have any credential ciphertext configured.
  // Test IT accounts may have integrationAccountId without cipher fields.
  if (input.credentialConfigured === true) {
    return deny(
      'MOCK_CREDENTIAL_ACCOUNT_BLOCKED',
      'Mock transmit cannot run against credential-linked accounts.',
    );
  }

  return allow();
}

export function readMockTransmitGuardEnvFromProcess(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): MockTransmitGuardEnvInput {
  return {
    nodeEnv: env.NODE_ENV,
    vercelEnv: env.VERCEL_ENV,
    envProfile: env.EXCLOAD_ENV_PROFILE,
    featureEnabled: env[ORDER_TRANSMISSION_MOCK_ENABLED],
    allowedUserIds: env[ORDER_TRANSMISSION_MOCK_ALLOWED_USER_IDS],
    batchPrefix: env[ORDER_TRANSMISSION_MOCK_BATCH_PREFIX],
  };
}
