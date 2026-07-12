/**
 * Body parser for mock transmit (no DB I/O).
 * matchIds required — no full-batch auto transmit.
 */

export const SHIPMENT_TRANSMISSION_MOCK_MAX_MATCH_IDS = 500;

export type ParsedTransmitMockBody = {
  /** Unique trimmed matchIds in first-seen order */
  matchIds: string[];
  requestedCount: number;
  duplicateMatchIdCount: number;
};

export type ParseTransmitMockBodyResult =
  | { ok: true; body: ParsedTransmitMockBody }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse mock transmit JSON body.
 * - body object required
 * - matchIds required, min 1, max 500 (raw length)
 * - trim; empty after trim → 400
 * - duplicates collapsed; duplicateMatchIdCount counted
 * - unknown fields ignored
 */
export function parseTransmitMockBody(raw: unknown): ParseTransmitMockBodyResult {
  if (raw === undefined || raw === null) {
    return { ok: false, error: '요청 본문이 필요합니다.' };
  }

  if (!isPlainObject(raw)) {
    return { ok: false, error: '요청 본문 형식이 올바르지 않습니다.' };
  }

  if (!('matchIds' in raw) || raw.matchIds === undefined) {
    return { ok: false, error: 'matchIds가 필요합니다.' };
  }

  if (!Array.isArray(raw.matchIds)) {
    return { ok: false, error: 'matchIds는 문자열 배열이어야 합니다.' };
  }

  if (raw.matchIds.length === 0) {
    return { ok: false, error: 'matchIds는 최소 1개 필요합니다.' };
  }

  if (raw.matchIds.length > SHIPMENT_TRANSMISSION_MOCK_MAX_MATCH_IDS) {
    return {
      ok: false,
      error: `matchIds는 최대 ${SHIPMENT_TRANSMISSION_MOCK_MAX_MATCH_IDS}개까지 가능합니다.`,
    };
  }

  const matchIds: string[] = [];
  const seen = new Set<string>();
  let duplicateMatchIdCount = 0;

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
    if (seen.has(trimmed)) {
      duplicateMatchIdCount += 1;
      continue;
    }
    seen.add(trimmed);
    matchIds.push(trimmed);
  }

  return {
    ok: true,
    body: {
      matchIds,
      requestedCount: raw.matchIds.length,
      duplicateMatchIdCount,
    },
  };
}
