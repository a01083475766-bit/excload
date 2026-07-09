import type { OrderIntegrationProvider, PrismaClient } from '@prisma/client';

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

export type ReserveExcloadOrderNosInput = {
  count: number;
  date?: Date;
  dateKey?: string;
};

export type PersistOrderSyncBatchInput = {
  userId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId?: string | null;
  sourceType?: 'API' | 'EXCEL' | 'MANUAL';
  fetchedAt: Date | string;
  memo?: string | null;
  snapshots: ReadonlyArray<OrderSyncOrderSnapshotForPersist>;
};

export type PersistedOrderSyncBatchLike = {
  id: string;
  userId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  sourceType: 'API' | 'EXCEL' | 'MANUAL';
  fetchedAt: Date;
  orderCount: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'ERROR';
  memo: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedOrderSyncOrderLike = {
  id: string;
  batchId: string;
  userId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  excloadOrderNo: string;
  mallOrderNo: string;
  mallOrderId: string | null;
  mallLineItemIds: unknown;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  productSummary: string | null;
  quantity: number | null;
  deliveryMemo: string | null;
  orderedAt: Date | null;
  orderStatus: string | null;
  rawPayloadJson: unknown;
  normalizedPayloadJson: unknown;
  trackingNumber: string | null;
  carrierCode: string | null;
  shippedAt: Date | null;
  transmissionStatus: 'NONE' | 'READY' | 'SENT' | 'FAILED' | 'SKIPPED';
  createdAt: Date;
  updatedAt: Date;
};

export type PersistOrderSyncBatchResult = {
  batch: PersistedOrderSyncBatchLike;
  orders: PersistedOrderSyncOrderLike[];
  excloadOrderNos: string[];
};

export type OrderSyncPersistTransactionClient = {
  excloadOrderNoSequence: {
    upsert: (args: {
      where: { dateKey: string };
      create: { dateKey: string; lastNumber: number };
      update: { lastNumber: { increment: number } };
    }) => Promise<{ dateKey: string; lastNumber: number }>;
  };
  orderSyncBatch: {
    create: (args: { data: Record<string, unknown> }) => Promise<PersistedOrderSyncBatchLike>;
  };
  orderSyncOrder: {
    create: (args: { data: Record<string, unknown> }) => Promise<PersistedOrderSyncOrderLike>;
  };
};

export type OrderSyncPersistPrismaClient = {
  $transaction: <T>(fn: (tx: OrderSyncPersistTransactionClient) => Promise<T>) => Promise<T>;
};

export type OrderFetchStandardFileLike = {
  rows: ReadonlyArray<Record<string, unknown>>;
};

export type MaybePersistOrderFetchResultInput = {
  client: Pick<PrismaClient, '$transaction'> | OrderSyncPersistPrismaClient;
  /** `isOrderSyncSnapshotPersistEnabled()` 등 env 기반 플래그 */
  enabled: boolean;
  userId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string;
  orderStandardFile?: OrderFetchStandardFileLike | null;
  rawOrders?: unknown;
  fetchedAt?: Date;
};

export type OrderFetchSnapshotPersistResult =
  | {
      persisted: false;
      reason: 'disabled' | 'empty_rows' | 'missing_order_standard_file';
    }
  | {
      persisted: true;
      batchId: string;
      orderCount: number;
      excloadOrderNos: string[];
    }
  | {
      persisted: false;
      reason: 'persist_failed';
      errorMessage: string;
    };

/**
 * Phase C-3b fetch-orders 응답 확장 예정 필드.
 * 기존 success/message/count/previewRows/orderStandardFile 응답에 snapshotPersist를 추가합니다.
 */
export type OrderFetchWithSnapshotPersistResponse<TPreviewRow = unknown> = {
  success: true;
  message: string;
  count: number;
  previewRows: TPreviewRow[];
  orderStandardFile: OrderFetchStandardFileLike;
  snapshotPersist: OrderFetchSnapshotPersistResult;
};

export const DEFAULT_LOAD_ORDER_SYNC_SNAPSHOTS_FOR_MATCHING_LIMIT = 500;

export type LoadOrderSyncSnapshotsForMatchingInput = {
  userId: string;
  provider?: OrderIntegrationProvider;
  integrationAccountId?: string;
  batchId?: string;
  limit?: number;
};

export type OrderSyncSnapshotLoadClient = {
  orderSyncOrder: {
    findMany: (args: {
      where: {
        userId: string;
        provider?: OrderIntegrationProvider;
        integrationAccountId?: string;
        batchId?: string;
      };
      orderBy: { createdAt: 'desc' };
      take: number;
    }) => Promise<PersistedOrderSyncOrderLike[]>;
  };
};
