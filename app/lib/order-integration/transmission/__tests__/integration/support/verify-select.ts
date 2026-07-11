/** Minimal selects for integration assertions — no PII / raw JSON / credentials. */

export const IT_MATCH_VERIFY_SELECT = {
  id: true,
  userId: true,
  transmissionStatus: true,
  transmissionLeaseToken: true,
  transmissionLeaseExpiresAt: true,
  transmissionErrorMessage: true,
} as const;

export const IT_ATTEMPT_VERIFY_SELECT = {
  id: true,
  shipmentMatchId: true,
  attemptNo: true,
  status: true,
  payloadFingerprint: true,
  executionToken: true,
  dispatchedAt: true,
  completedAt: true,
  errorCode: true,
  errorMessage: true,
  retryable: true,
} as const;

export const IT_ORDER_VERIFY_SELECT = {
  id: true,
  transmissionStatus: true,
} as const;
