/**
 * 주문 스냅샷 보관·PII 삭제 상수.
 * Production flag ON 전 TTL/삭제 job과 함께 사용합니다.
 */

/** 택배양식 다운로드 성공 시점부터 스냅샷 보관 기간 */
export const ORDER_SYNC_SNAPSHOT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** 전송 성공 후 PII 즉시 삭제 실패 시 cron이 다시 지우는 여유 */
export const ORDER_SYNC_PII_CLEAR_GRACE_MS = 24 * 60 * 60 * 1000;

export function computeOrderSyncSnapshotExpiresAt(
  downloadedAt: Date,
  ttlMs: number = ORDER_SYNC_SNAPSHOT_TTL_MS,
): Date {
  return new Date(downloadedAt.getTime() + ttlMs);
}
