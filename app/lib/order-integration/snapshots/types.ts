import type { OrderIntegrationProvider } from '@prisma/client';

/**
 * DB persist 직전 in-memory DTO.
 * OrderSyncOrder 1건 = 송장 매칭·택배 양식 1행 단위.
 */
export type OrderSyncOrderSnapshotForPersist = {
  userId: string;
  provider: OrderIntegrationProvider | string;
  accountId?: string | null;
  batchId?: string | null;
  tempBatchKey?: string | null;
  fetchedAt: string;
  excloadOrderNo: string;
  mallOrderNo: string;
  mallOrderId?: string | null;
  mallLineItemIds?: string[];
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  productSummary: string;
  quantity: number;
  deliveryMemo?: string | null;
  orderedAt?: string | null;
  orderStatus?: string | null;
  rawPayloadJson?: unknown;
  normalizedPayloadJson: Record<string, unknown>;
  trackingNumber?: string | null;
};

export type BuildOrderSyncSnapshotsInput = {
  userId: string;
  provider: OrderIntegrationProvider | string;
  accountId?: string | null;
  batchId?: string | null;
  tempBatchKey?: string | null;
  fetchedAt: Date | string;
  rows: ReadonlyArray<Record<string, string>>;
  rawOrders?: ReadonlyArray<unknown>;
  /** excloadOrderNo 시퀀스 시작값 (기본 1) */
  excloadOrderNoStartSeq?: number;
};

export type OrderRowShipmentGroup = {
  groupKey: string;
  rows: Record<string, string>[];
  sourceRowIndexes: number[];
};

/**
 * 주문연동 UI 미리보기용 meta — 화면 표시·내부 추적.
 * 택배사 다운로드 파일에는 기본 포함하지 않는다.
 */
export type OrderPreviewDisplayMeta = {
  provider: string;
  providerLabel?: string;
  accountId?: string | null;
  accountLabel?: string | null;
  mallOrderNo?: string;
  excloadOrderNo: string;
};

/**
 * 미리보기 1행 = 화면용 meta + 택배사 다운로드용 exportRow.
 * 다운로드 시에는 exportRow만 사용한다.
 */
export type OrderPreviewDisplayRow = {
  meta: OrderPreviewDisplayMeta;
  exportRow: Record<string, string>;
};

export type BuildCourierExportRowOptions = {
  /**
   * 택배사 양식에 관리번호·비고·고객관리번호 등 허용 열이 있을 때만 true.
   * 기본 false — excloadOrderNo를 exportRow에 넣지 않음.
   */
  includeExcloadOrderNoInExport?: boolean;
};

export type BuildOrderPreviewDisplayRowOptions = BuildCourierExportRowOptions & {
  providerLabel?: string;
  accountLabel?: string | null;
};

export type BuildOrderPreviewDisplayRowsInput = BuildOrderPreviewDisplayRowOptions & {
  snapshots: ReadonlyArray<OrderSyncOrderSnapshotForPersist>;
};
