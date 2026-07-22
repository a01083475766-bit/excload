import type { OrderIntegrationProvider, OrderSyncTransmissionStatus } from '@prisma/client';

/**
 * 쇼핑몰 API 송장전송 공통 DTO.
 * - credential / secret 금지
 * - 수취인 PII(이름·전화·주소) 금지
 * - normalizedPayloadJson 원문 금지
 */
export type ShipmentTransmissionCandidate = {
  provider: OrderIntegrationProvider;
  integrationAccountId: string;
  uploadBatchId: string;
  matchId: string;
  orderSyncOrderId: string;
  mallOrderNo: string;
  excloadOrderNo: string;
  /** 몰 line item 식별자만. 없으면 null */
  mallLineItemIds: string[] | null;
  trackingNumber: string;
  /** 엑클로드 정규화 코드 (CJ, HANJIN …). provider 전용 코드 아님 */
  courierCode: string | null;
  courierName: string | null;
};

export type ShipmentTransmissionEligibilityReasonCode =
  | 'BATCH_NOT_READY'
  | 'CONFIRMATION_NOT_ELIGIBLE'
  | 'ORDER_NOT_LINKED'
  | 'ORDER_NOT_FOUND'
  | 'PROVIDER_MISSING'
  | 'PROVIDER_MISMATCH'
  | 'INTEGRATION_ACCOUNT_MISSING'
  | 'INTEGRATION_ACCOUNT_MISMATCH'
  | 'MALL_ORDER_NO_MISSING'
  | 'EXCLOAD_ORDER_NO_MISSING'
  | 'TRACKING_NUMBER_MISSING'
  | 'COURIER_MISSING'
  | 'COURIER_UNSUPPORTED'
  | 'ALREADY_SENT'
  | 'RETRY_NOT_REQUESTED'
  | 'TRANSMISSION_SKIPPED'
  | 'USER_MISMATCH'
  | 'MATCH_BATCH_MISMATCH';

export type ShipmentTransmissionEligibilityResult =
  | {
      eligible: true;
      candidate: ShipmentTransmissionCandidate;
      reasonCode: null;
      reasonMessage: null;
    }
  | {
      eligible: false;
      candidate: null;
      reasonCode: ShipmentTransmissionEligibilityReasonCode;
      reasonMessage: string;
    };

export type ShipmentTransmissionEligibilityOptions = {
  /** FAILED 재전송 허용. 기본 false */
  retryFailed?: boolean;
};

/** Match 전송 상태 전이 (OrderSyncTransmissionStatus 재사용) */
export type ShipmentMatchTransmissionStatus = OrderSyncTransmissionStatus;

export type ShipmentTransmissionTransitionReasonCode =
  | 'TRANSITION_NOT_ALLOWED'
  | 'RETRY_NOT_REQUESTED'
  | 'POLICY_SKIP_NOT_REQUESTED';

export type ShipmentTransmissionTransitionOptions = {
  /** FAILED → READY 허용 */
  retryRequested?: boolean;
  /** READY → SKIPPED 허용 */
  policySkip?: boolean;
};

export type ShipmentTransmissionTransitionResult =
  | {
      ok: true;
      from: ShipmentMatchTransmissionStatus;
      to: ShipmentMatchTransmissionStatus;
      reasonCode: null;
      reasonMessage: null;
    }
  | {
      ok: false;
      from: ShipmentMatchTransmissionStatus;
      to: ShipmentMatchTransmissionStatus;
      reasonCode: ShipmentTransmissionTransitionReasonCode;
      reasonMessage: string;
    };

/**
 * Provider adapter 계약 (구현체·네트워크 호출 없음).
 * credential은 입력에 포함하지 않음 — 호출 측이 accountId로 로드.
 */
export type ShipmentTransmissionAdapterProvider = OrderIntegrationProvider | string;

/**
 * adapter 결과용 정제 요약.
 * - 외부 API 응답 원문 전체 저장 용도 아님
 * - credential / Authorization / access token / secret 금지
 * - 수취인 이름·전화·주소 등 PII 금지
 * - 허용: request id, HTTP status, provider status code, 비민감 메시지
 * - SMARTSTORE: productOrderId별 itemResults (원문·PII 금지)
 */
export type ShipmentTransmissionItemResultStatus =
  | 'SUCCESS'
  | 'ALREADY_DISPATCHED'
  | 'ORDER_CONFIRMATION_REQUIRED'
  | 'STATE_NOT_ELIGIBLE'
  | 'CARRIER_MAPPING_REQUIRED'
  | 'QUANTITY_UNCLEAR'
  | 'CONFLICT'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'NOT_ATTEMPTED';

export type ShipmentTransmissionItemResultSummary = {
  productOrderId: string;
  status: ShipmentTransmissionItemResultStatus;
  /** 정제된 provider code (실패 코드 등). 시크릿·PII 금지 */
  providerCode?: string | null;
  /** 사용자 노출 가능한 정제 메시지 */
  message?: string | null;
  /**
   * 계정·productOrderId·택배사·정규화 송장 동일성 판정용 fingerprint.
   * 원문 송장·주소를 저장하지 않음.
   */
  shipmentFingerprint: string;
};

export type ShipmentTransmissionResponseSummary = {
  httpStatus?: number | null;
  providerStatusCode?: string | null;
  providerRequestId?: string | null;
  /** 비민감 상태 문구만. raw body / stack / header 금지 */
  message?: string | null;
  /** SMARTSTORE 등 — productOrderId별 결과 (allowlist) */
  itemResults?: ShipmentTransmissionItemResultSummary[] | null;
};

export type ShipmentTransmissionAdapterOutcomeKind = 'success' | 'failure' | 'unknown';

export type ShipmentTransmissionAdapterResult = {
  success: boolean;
  provider: ShipmentTransmissionAdapterProvider;
  matchId: string;
  providerRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  responseSummary: ShipmentTransmissionResponseSummary | null;
  /**
   * 결과 분류. 미지정 시 success=true → success, false → failure.
   * 타임아웃 등 결과 불명은 'unknown' (dispatch 이후만 의미 있음).
   */
  outcomeKind?: ShipmentTransmissionAdapterOutcomeKind;
};

export type ShipmentTransmissionAccountBatchEntry = {
  candidate: ShipmentTransmissionCandidate;
  priorItemResults: ShipmentTransmissionItemResultSummary[];
};

/** SMARTSTORE 계정 배치 전송의 Match별 결과 (lease/attempt 재연결용) */
export type ShipmentTransmissionAccountBatchMatchResult = {
  matchId: string;
  success: boolean;
  outcomeKind: ShipmentTransmissionAdapterOutcomeKind;
  errorCode: string | null;
  errorMessage: string | null;
  providerRequestId: string | null;
  retryable: boolean;
  responseSummary: ShipmentTransmissionResponseSummary | null;
  /** 네이버 dispatch POST 본문에 이 Match 관련 ID가 포함됐는지 */
  externallyPosted?: boolean;
};

export type ShipmentTransmissionAdapter = {
  readonly provider: ShipmentTransmissionAdapterProvider;
  /** 공통 DTO → provider payload (타입만; 실제 변환은 provider 모듈) */
  buildPayload(candidate: ShipmentTransmissionCandidate): unknown;
  /**
   * 전송 실행. credential은 candidate에 넣지 말 것.
   * mock / 실 adapter 모두 이 계약을 구현.
   */
  transmit(candidate: ShipmentTransmissionCandidate): Promise<ShipmentTransmissionAdapterResult>;
  /**
   * SMARTSTORE 전용(선택). 같은 integrationAccountId의 여러 Match를
   * productOrderId 기준으로 묶어 최대 30건씩 순차 dispatch한다.
   * 다른 provider는 구현하지 않는다.
   */
  transmitAccountBatch?: (input: {
    integrationAccountId: string;
    entries: ShipmentTransmissionAccountBatchEntry[];
  }) => Promise<ShipmentTransmissionAccountBatchMatchResult[]>;
};

/** executor 전용 오류 코드 (eligibility reasonCode 와 별도) */
export type ShipmentTransmissionExecutorErrorCode =
  | 'ADAPTER_NOT_REGISTERED'
  | 'ADAPTER_EXECUTION_ERROR'
  | 'TRANSMISSION_NOT_ALLOWED'
  | 'DUPLICATE_MATCH_ID'
  | 'MOCK_RETRYABLE_FAILURE'
  | 'MOCK_NON_RETRYABLE_FAILURE';

/**
 * 단건 전송 실행 결과 (DB 미반영 — persist 힌트만).
 */
export type ShipmentTransmissionExecutionResult = {
  success: boolean;
  provider: ShipmentTransmissionAdapterProvider;
  matchId: string;
  previousStatus: ShipmentMatchTransmissionStatus;
  nextStatus: ShipmentMatchTransmissionStatus;
  adapterCalled: boolean;
  providerRequestId: string | null;
  errorCode: ShipmentTransmissionExecutorErrorCode | string | null;
  errorMessage: string | null;
  retryable: boolean;
  responseSummary: ShipmentTransmissionResponseSummary | null;
};

export type ShipmentTransmissionBatchExecutionResult = {
  totalCount: number;
  successCount: number;
  failureCount: number;
  /** 실행 불가·스킵·중복 등 adapter 미호출 또는 전송 미시도 */
  skippedCount: number;
  retryableFailureCount: number;
  results: ShipmentTransmissionExecutionResult[];
};
