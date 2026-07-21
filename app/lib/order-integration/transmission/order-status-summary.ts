import type { OrderSyncTransmissionStatus } from '@prisma/client';

/**
 * 한 Order에 연결된 Match들의 transmissionStatus → Order 요약.
 * ShipmentMatch가 SSOT. 우선순위는 설계 문서와 동일.
 *
 * SENT는 **연결된 모든 Match가 종료(SENT|SKIPPED)** 일 때만.
 * 일부만 SENT이고 나머지 NONE 등이면 미완료로 본다.
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

  // 부분 전송(SENT + NONE 등)은 완료로 보지 않음 → PII 조기 삭제 방지
  if (hasNone && hasSent) return 'NONE';
  if (hasNone && set.size === 1) return 'NONE';
  if (hasNone) return 'NONE';

  if (hasSent) return 'SENT';
  if (hasSkipped && set.size === 1) return 'SKIPPED';
  if (hasSkipped) return 'SKIPPED';

  return 'NONE';
}

/** 수취인 PII를 지워도 되는 완전 전송 완료 여부 */
export function isOrderFullyTransmittedForPiiClear(
  matchStatuses: ReadonlyArray<OrderSyncTransmissionStatus | string>,
): boolean {
  if (matchStatuses.length === 0) return false;
  return matchStatuses.every((status) => {
    const s = String(status);
    return s === 'SENT' || s === 'SKIPPED';
  });
}
