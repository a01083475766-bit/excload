import type { OrderIntegrationProvider } from '@prisma/client';

/** 송장 행 ↔ 주문 스냅샷 매칭 결과 상태 */
export type ShipmentMatchStatus =
  | 'MATCHED_CONFIDENT'
  | 'MATCHED_WARNING'
  | 'MULTIPLE_CANDIDATES'
  | 'NOT_MATCHED'
  | 'DUPLICATE_TRACKING_NUMBER'
  | 'ALREADY_SHIPPED'
  | 'CANCELLED_OR_INVALID_ORDER';

/** 향후 API 송장전송 단계용 — 이번 Phase A에서는 NOT_READY/READY만 사용 */
export type ShipmentTransmissionStatus =
  | 'NOT_READY'
  | 'READY'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED';

/**
 * 주문조회 스냅샷 1건 (in-memory DTO).
 * DB 모델 도입 전 Phase A 테스트·매칭용.
 */
export type OrderSyncOrderSnapshot = {
  id: string;
  userId: string;
  provider: OrderIntegrationProvider | string;
  accountId?: string | null;
  batchId?: string | null;
  excloadOrderNo: string;
  mallOrderNo: string;
  mallOrderId?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  receiverAddress?: string | null;
  productSummary?: string | null;
  quantity?: number | null;
  orderStatus?: string | null;
  /** 이미 송장이 등록된 주문 — non-empty면 ALREADY_SHIPPED 후보 */
  existingTrackingNumber?: string | null;
  /** 택배 양식 다운로드 시 행 번호 — 단독 자동 확정 금지 */
  exportedRowIndex?: number | null;
  /** WorkItem 비교용 HMAC (평문 PII 아님) */
  matchFingerprintHmac?: string | null;
  /** true면 OrderSyncOrder FK로 persist하지 않는 WorkItem 후보 */
  workItemCandidate?: boolean;
  workItemId?: string | null;
  inputSource?: string | null;
};

/** 송장파일 1행 정규화 결과 */
export type NormalizedShipmentRow = {
  originalRowIndex: number;
  trackingNumber: string;
  trackingNumberNormalized: string;
  carrierName: string;
  standardCarrierCode: string;
  excloadOrderNo: string;
  mallOrderNo: string;
  receiverName: string;
  receiverPhone: string;
  receiverPhoneNormalized: string;
  receiverAddress: string;
  receiverAddressNormalized: string;
  productText: string;
  shippedAt: string;
  parseWarnings: string[];
};

export type ShipmentMatchCandidate = {
  orderId: string;
  score: number;
  reasons: string[];
  mismatchFields: string[];
};

export type ShipmentMatchResult = {
  shipmentRowIndex: number;
  matchStatus: ShipmentMatchStatus;
  matchScore: number;
  matchReason: string;
  mismatchFields: string[];
  matchedOrderId: string | null;
  candidates: ShipmentMatchCandidate[];
  transmissionStatus: ShipmentTransmissionStatus;
};

export type ShipmentMatchScope = {
  userId: string;
  /** 미지정 시 동일 userId의 여러 provider 주문을 한꺼번에 후보로 사용 (통합 UX) */
  provider?: OrderIntegrationProvider | string;
  accountId?: string | null;
};

export type ShipmentFileFormat = 'csv' | 'xlsx' | 'xls' | 'sheet';

export type ShipmentParseWarningCode =
  | 'EMPTY_FILE'
  | 'NO_HEADER'
  | 'NO_DATA_ROWS'
  | 'MISSING_TRACKING_NUMBER'
  | 'SHORT_TRACKING_NUMBER'
  | 'LONG_TRACKING_NUMBER';

export type ShipmentParseWarning = {
  code: ShipmentParseWarningCode | string;
  message: string;
  /** 원본 파일 기준 0-based 행 번호 */
  rowIndex?: number;
};

export type ParsedShipmentRow = {
  originalRowIndex: number;
  rawRow: Record<string, string>;
  normalized: NormalizedShipmentRow;
  warnings: ShipmentParseWarning[];
};

export type ParsedShipmentFile = {
  format: ShipmentFileFormat;
  headerRowIndex: number;
  headers: string[];
  rows: ParsedShipmentRow[];
};

export type ShipmentParseResult = {
  ok: boolean;
  error?: string;
  file?: ParsedShipmentFile;
  warnings: ShipmentParseWarning[];
};
