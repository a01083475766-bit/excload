import type { OrderSyncTransmissionStatus } from '@prisma/client';

/**
 * 한 Order에 연결된 Match들의 transmissionStatus → Order 요약.
 * ShipmentMatch가 SSOT. 우선순위는 설계 문서와 동일.
 */
export function summarizeOrderSyncTransmissionStatus(
  matchStatuses: ReadonlyArray<OrderSyncTransmissionStatus | string>,
): OrderSyncTransmissionStatus {
  if (matchStatuses.length === 0) return 'NONE';

  const set = new Set(matchStatuses.map((s) => String(s)));

  if (set.has('UNKNOWN')) return 'UNKNOWN';
  if (set.has('PROCESSING')) return 'PROCESSING';
  if (set.has('FAILED')) return 'FAILED';
  if (set.has('READY')) return 'READY';

  const hasSent = set.has('SENT');
  const hasSkipped = set.has('SKIPPED');
  const hasNone = set.has('NONE');

  if (hasSent) return 'SENT';
  if (hasSkipped && !hasNone && set.size === 1) return 'SKIPPED';
  if (hasSkipped && !hasSent && !hasNone) return 'SKIPPED';
  if (hasNone && set.size === 1) return 'NONE';
  if (hasNone) return 'NONE';

  return 'NONE';
}
