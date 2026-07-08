import type {
  BuildCourierExportRowOptions,
  BuildOrderPreviewDisplayRowOptions,
  BuildOrderPreviewDisplayRowsInput,
  OrderPreviewDisplayRow,
  OrderSyncOrderSnapshotForPersist,
} from '@/app/lib/order-integration/snapshots/types';

/** 택배사 다운로드 exportRow에 기본 포함하지 않는 내부 추적 키 */
export const INTERNAL_TRACKING_EXPORT_KEYS = [
  'provider',
  'accountId',
  'mallOrderNo',
  'excloadOrderNo',
  '엑클로드관리번호',
  '내부관리번호',
  '쇼핑몰',
  '연동계정',
] as const;

/**
 * OrderSyncOrder snapshot → 택배사 양식 다운로드용 exportRow.
 * provider/accountId/mallOrderNo/excloadOrderNo는 기본 제외.
 */
export function buildCourierExportRowFromSnapshot(
  snapshot: OrderSyncOrderSnapshotForPersist,
  options?: BuildCourierExportRowOptions,
): Record<string, string> {
  const row: Record<string, string> = {
    받는사람: snapshot.receiverName,
    받는사람전화1: snapshot.receiverPhone,
    받는사람주소1: snapshot.receiverAddress,
    상품명: snapshot.productSummary,
    수량: String(snapshot.quantity),
    배송메시지: snapshot.deliveryMemo ?? '',
  };

  const tracking = snapshot.trackingNumber?.trim();
  if (tracking) {
    row['운송장번호'] = tracking;
  }

  if (options?.includeExcloadOrderNoInExport) {
    row['엑클로드관리번호'] = snapshot.excloadOrderNo;
  }

  return row;
}

export function buildOrderPreviewDisplayRow(
  snapshot: OrderSyncOrderSnapshotForPersist,
  options?: BuildOrderPreviewDisplayRowOptions,
): OrderPreviewDisplayRow {
  return {
    meta: {
      provider: String(snapshot.provider),
      providerLabel: options?.providerLabel,
      accountId: snapshot.accountId ?? null,
      accountLabel: options?.accountLabel ?? null,
      mallOrderNo: snapshot.mallOrderNo,
      excloadOrderNo: snapshot.excloadOrderNo,
    },
    exportRow: buildCourierExportRowFromSnapshot(snapshot, {
      includeExcloadOrderNoInExport: options?.includeExcloadOrderNoInExport,
    }),
  };
}

export function buildOrderPreviewDisplayRows(
  input: BuildOrderPreviewDisplayRowsInput,
): OrderPreviewDisplayRow[] {
  return input.snapshots.map((snapshot) =>
    buildOrderPreviewDisplayRow(snapshot, {
      providerLabel: input.providerLabel,
      accountLabel: input.accountLabel,
      includeExcloadOrderNoInExport: input.includeExcloadOrderNoInExport,
    }),
  );
}

export function exportRowContainsInternalTrackingKeys(exportRow: Record<string, string>): boolean {
  const keys = new Set(Object.keys(exportRow));
  return INTERNAL_TRACKING_EXPORT_KEYS.some((key) => keys.has(key));
}
