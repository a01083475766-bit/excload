/**
 * POST .../transmissions/verify body parser (no DB I/O).
 */

export type VerifyTransmissionBody = {
  attemptIds: string[];
};

export type ParseVerifyTransmissionBodyResult =
  | { ok: true; body: VerifyTransmissionBody }
  | { ok: false; error: string };

const MAX_ATTEMPT_IDS = 100;

export function parseVerifyTransmissionBody(raw: unknown): ParseVerifyTransmissionBodyResult {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const attemptIdsRaw = (raw as { attemptIds?: unknown }).attemptIds;
  if (!Array.isArray(attemptIdsRaw)) {
    return { ok: false, error: 'attemptIds must be an array of strings.' };
  }
  if (attemptIdsRaw.length === 0) {
    return { ok: false, error: 'attemptIds is required.' };
  }
  if (attemptIdsRaw.length > MAX_ATTEMPT_IDS) {
    return { ok: false, error: `attemptIds must be at most ${MAX_ATTEMPT_IDS}.` };
  }

  const attemptIds: string[] = [];
  const seen = new Set<string>();
  for (const value of attemptIdsRaw) {
    if (typeof value !== 'string' || !value.trim()) {
      return { ok: false, error: 'attemptIds must be an array of non-empty strings.' };
    }
    const id = value.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    attemptIds.push(id);
  }

  if (attemptIds.length === 0) {
    return { ok: false, error: 'attemptIds is required.' };
  }

  return { ok: true, body: { attemptIds } };
}
