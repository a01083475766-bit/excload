/**
 * Body parser for transmit dry-run (no DB I/O).
 */

export const SHIPMENT_TRANSMISSION_DRY_RUN_MAX_MATCH_IDS = 500;

export type TransmitDryRunBody = {
  /** undefined = evaluate all matches in batch; [] = zero selection */
  matchIds: string[] | undefined;
  retryFailed: boolean;
};

export type ParseTransmitDryRunBodyResult =
  | { ok: true; body: TransmitDryRunBody }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse dry-run JSON body.
 * - missing / empty body → full-batch evaluation (matchIds undefined)
 * - matchIds: [] → zero selection
 * - unknown fields ignored
 */
export function parseTransmitDryRunBody(raw: unknown): ParseTransmitDryRunBodyResult {
  if (raw === undefined || raw === null) {
    return { ok: true, body: { matchIds: undefined, retryFailed: false } };
  }

  if (!isPlainObject(raw)) {
    return { ok: false, error: '요청 본문 형식이 올바르지 않습니다.' };
  }

  let retryFailed = false;
  if ('retryFailed' in raw) {
    if (typeof raw.retryFailed !== 'boolean') {
      return { ok: false, error: 'retryFailed는 boolean이어야 합니다.' };
    }
    retryFailed = raw.retryFailed;
  }

  if (!('matchIds' in raw) || raw.matchIds === undefined) {
    return { ok: true, body: { matchIds: undefined, retryFailed } };
  }

  if (!Array.isArray(raw.matchIds)) {
    return { ok: false, error: 'matchIds는 문자열 배열이어야 합니다.' };
  }

  if (raw.matchIds.length > SHIPMENT_TRANSMISSION_DRY_RUN_MAX_MATCH_IDS) {
    return {
      ok: false,
      error: `matchIds는 최대 ${SHIPMENT_TRANSMISSION_DRY_RUN_MAX_MATCH_IDS}개까지 가능합니다.`,
    };
  }

  const matchIds: string[] = [];
  for (const item of raw.matchIds) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'matchIds는 문자열 배열이어야 합니다.' };
    }
    const trimmed = item.trim();
    if (!trimmed) {
      return { ok: false, error: 'matchIds에 빈 값이 포함되어 있습니다.' };
    }
    if (trimmed.length > 128) {
      return { ok: false, error: '유효하지 않은 matchId입니다.' };
    }
    matchIds.push(trimmed);
  }

  return { ok: true, body: { matchIds, retryFailed } };
}
