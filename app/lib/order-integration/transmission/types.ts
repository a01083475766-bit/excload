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
 */
export type ShipmentTransmissionResponseSummary = {
  httpStatus?: number | null;
  providerStatusCode?: string | null;
  providerRequestId?: string | null;
  /** 비민감 상태 문구만. raw body / stack / header 금지 */
  message?: string | null;
};

export type ShipmentTransmissionAdapterResult = {
  success: boolean;
  provider: ShipmentTransmissionAdapterProvider;
  matchId: string;
  providerRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  responseSummary: ShipmentTransmissionResponseSummary | null;
};

export type ShipmentTransmissionAdapter = {
  readonly provider: ShipmentTransmissionAdapterProvider;
  /** 공통 DTO → provider payload (타입만; 실제 변환은 provider 모듈) */
  buildPayload(candidate: ShipmentTransmissionCandidate): unknown;
  /**
   * 전송 실행 자리. D-6b에서는 구현하지 않음.
   * 구현 시에도 credential을 candidate에 넣지 말 것.
   */
  transmit?(candidate: ShipmentTransmissionCandidate): Promise<ShipmentTransmissionAdapterResult>;
};
