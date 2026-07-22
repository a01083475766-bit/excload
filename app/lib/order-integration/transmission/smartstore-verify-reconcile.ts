/**
 * SMARTSTORE 읽기 전용 상태확인 — 송장 fingerprint 대조·itemResults 부분 보존.
 * confirm/dispatch 호출 없음. 원문 송장·네이버 원문 응답 저장 금지.
 */

import { buildSmartstoreItemShipmentFingerprint } from '@/app/lib/smartstore/smartstore-batch-dispatch';
import type { SmartstoreProductOrderDetail } from '@/app/lib/smartstore/client';
import type {
  ShipmentTransmissionItemResultStatus,
  ShipmentTransmissionItemResultSummary,
} from '@/app/lib/order-integration/transmission/types';
import type { RecentTransmitVerificationStatus } from '@/app/lib/order-integration/transmission/recent-transmit-result-view';

const SHIPPED_STATUSES = new Set(['DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED']);
const PENDING_STATUSES = new Set(['PAYED', 'PAY_WAITING', 'PAYMENT_WAITING']);
const ATTENTION_STATUSES = new Set([
  'CANCELED',
  'CANCELLED',
  'RETURNED',
  'EXCHANGED',
  'CANCELED_BY_NOPAYMENT',
]);

const PRESERVED_OK = new Set<ShipmentTransmissionItemResultStatus>([
  'SUCCESS',
  'ALREADY_DISPATCHED',
]);

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function asTrimmed(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export type SmartstoreVerifyItemKind =
  | 'CONFIRMED'
  | 'PENDING'
  | 'CONFLICT'
  | 'MISSING_SHIPMENT_INFO'
  | 'ATTENTION'
  | 'CHECK_FAILED';

export type SmartstoreVerifyItemDecision = {
  kind: SmartstoreVerifyItemKind;
  message: string;
  nextStatus: ShipmentTransmissionItemResultStatus;
};

/** 네이버 상세의 delivery 필드로 동일 송장 fingerprint 대조 */
export function classifySmartstoreVerifyItem(input: {
  userId: string;
  integrationAccountId: string;
  productOrderId: string;
  expectedFingerprint: string;
  detail: SmartstoreProductOrderDetail | null | undefined;
}): SmartstoreVerifyItemDecision {
  const detail = input.detail;
  if (!detail) {
    return {
      kind: 'CHECK_FAILED',
      message: '조회 실패 — 전송 여부 확인이 필요합니다.',
      nextStatus: 'UNCERTAIN',
    };
  }

  const status = normalizeStatus(detail.productOrder?.productOrderStatus);
  if (!status) {
    return {
      kind: 'CHECK_FAILED',
      message: '조회 실패 — 전송 여부 확인이 필요합니다.',
      nextStatus: 'UNCERTAIN',
    };
  }

  if (ATTENTION_STATUSES.has(status)) {
    return {
      kind: 'ATTENTION',
      message: '취소·반품·교환 등 확인이 필요한 상태입니다.',
      nextStatus: 'UNCERTAIN',
    };
  }

  if (PENDING_STATUSES.has(status)) {
    return {
      kind: 'PENDING',
      message:
        '아직 네이버에 반영되지 않음 — 자동 재전송하지 말고 잠시 후 다시 확인하세요.',
      nextStatus: 'UNCERTAIN',
    };
  }

  if (!SHIPPED_STATUSES.has(status)) {
    return {
      kind: 'PENDING',
      message:
        '아직 네이버에 반영되지 않음 — 자동 재전송하지 말고 잠시 후 다시 확인하세요.',
      nextStatus: 'UNCERTAIN',
    };
  }

  const remoteCompany = asTrimmed(detail.delivery?.deliveryCompanyCode).toUpperCase();
  const remoteTracking = asTrimmed(detail.delivery?.trackingNumber);
  if (!remoteCompany || !remoteTracking) {
    return {
      kind: 'MISSING_SHIPMENT_INFO',
      message: '네이버 응답에서 송장정보를 확인할 수 없습니다.',
      nextStatus: 'UNCERTAIN',
    };
  }

  if (!input.expectedFingerprint.trim()) {
    return {
      kind: 'MISSING_SHIPMENT_INFO',
      message: '네이버 응답에서 송장정보를 확인할 수 없습니다.',
      nextStatus: 'UNCERTAIN',
    };
  }

  const remoteFingerprint = buildSmartstoreItemShipmentFingerprint({
    userId: input.userId,
    integrationAccountId: input.integrationAccountId,
    productOrderId: input.productOrderId,
    deliveryCompanyCode: remoteCompany,
    trackingNumber: remoteTracking,
  });

  if (remoteFingerprint === input.expectedFingerprint) {
    return {
      kind: 'CONFIRMED',
      message: '송장 반영 확인 완료',
      nextStatus: 'SUCCESS',
    };
  }

  return {
    kind: 'CONFLICT',
    message: '송장번호 또는 택배사가 다름 — 재전송 금지',
    nextStatus: 'CONFLICT',
  };
}

/**
 * 기존 SUCCESS/ALREADY_DISPATCHED는 유지하고 UNCERTAIN(및 재확인 대상)만 갱신.
 */
export function mergeSmartstoreVerifyItemResults(input: {
  userId: string;
  integrationAccountId: string;
  priorItems: ReadonlyArray<ShipmentTransmissionItemResultSummary>;
  detailsByProductOrderId: Map<string, SmartstoreProductOrderDetail>;
}): {
  itemResults: ShipmentTransmissionItemResultSummary[];
  decisions: SmartstoreVerifyItemDecision[];
} {
  const itemResults: ShipmentTransmissionItemResultSummary[] = [];
  const decisions: SmartstoreVerifyItemDecision[] = [];

  for (const prior of input.priorItems) {
    if (PRESERVED_OK.has(prior.status) || prior.status === 'NOT_ATTEMPTED') {
      itemResults.push({ ...prior });
      if (PRESERVED_OK.has(prior.status)) {
        decisions.push({
          kind: 'CONFIRMED',
          message: prior.message ?? '송장 반영 확인 완료',
          nextStatus: prior.status,
        });
      }
      continue;
    }

    if (prior.status === 'CONFLICT') {
      itemResults.push({ ...prior });
      decisions.push({
        kind: 'CONFLICT',
        message: prior.message ?? '송장번호 또는 택배사가 다름 — 재전송 금지',
        nextStatus: 'CONFLICT',
      });
      continue;
    }

    // UNCERTAIN 및 그 외 재확인 가능 상태
    const decision = classifySmartstoreVerifyItem({
      userId: input.userId,
      integrationAccountId: input.integrationAccountId,
      productOrderId: prior.productOrderId,
      expectedFingerprint: prior.shipmentFingerprint,
      detail: input.detailsByProductOrderId.get(prior.productOrderId),
    });
    decisions.push(decision);
    itemResults.push({
      ...prior,
      status: decision.nextStatus,
      message: decision.message,
      providerCode: prior.providerCode ?? null,
    });
  }

  return { itemResults, decisions };
}

export function summarizeSmartstoreVerifyDecisions(input: {
  itemResults: ReadonlyArray<ShipmentTransmissionItemResultSummary>;
  decisions: ReadonlyArray<SmartstoreVerifyItemDecision>;
}): {
  status: RecentTransmitVerificationStatus;
  mallStatusCode: string | null;
  message: string;
  confirmedItems: number;
  totalItems: number;
  allConfirmed: boolean;
  hasConflict: boolean;
  hasUncertain: boolean;
} {
  const relevant = input.itemResults.filter((row) => row.status !== 'NOT_ATTEMPTED');
  const totalItems = relevant.length;
  const confirmedItems = relevant.filter(
    (row) => row.status === 'SUCCESS' || row.status === 'ALREADY_DISPATCHED',
  ).length;
  const hasConflict = relevant.some((row) => row.status === 'CONFLICT');
  const hasUncertain = relevant.some(
    (row) =>
      row.status === 'UNCERTAIN' ||
      row.status === 'FAILED' ||
      row.status === 'STATE_NOT_ELIGIBLE' ||
      row.status === 'QUANTITY_UNCLEAR' ||
      row.status === 'ORDER_CONFIRMATION_REQUIRED' ||
      row.status === 'CARRIER_MAPPING_REQUIRED',
  );
  const allConfirmed = totalItems > 0 && confirmedItems === totalItems && !hasConflict;

  if (hasConflict) {
    return {
      status: 'ATTENTION',
      mallStatusCode: 'CONFLICT',
      message: '송장번호 또는 택배사가 다름 — 재전송 금지',
      confirmedItems,
      totalItems,
      allConfirmed: false,
      hasConflict: true,
      hasUncertain,
    };
  }

  const anyMissing = input.decisions.some((d) => d.kind === 'MISSING_SHIPMENT_INFO');
  const anyFailed = input.decisions.some((d) => d.kind === 'CHECK_FAILED');
  const anyAttention = input.decisions.some((d) => d.kind === 'ATTENTION');

  if (anyFailed && confirmedItems === 0) {
    return {
      status: 'CHECK_FAILED',
      mallStatusCode: null,
      message: '조회 실패 — 전송 여부 확인이 필요합니다.',
      confirmedItems,
      totalItems,
      allConfirmed: false,
      hasConflict: false,
      hasUncertain: true,
    };
  }

  if (anyMissing && confirmedItems === 0) {
    return {
      status: 'PENDING',
      mallStatusCode: null,
      message: '네이버 응답에서 송장정보를 확인할 수 없습니다.',
      confirmedItems,
      totalItems,
      allConfirmed: false,
      hasConflict: false,
      hasUncertain: true,
    };
  }

  if (anyAttention) {
    return {
      status: 'ATTENTION',
      mallStatusCode: 'ATTENTION',
      message: '취소·반품·교환 등 확인이 필요한 상태입니다.',
      confirmedItems,
      totalItems,
      allConfirmed: false,
      hasConflict: false,
      hasUncertain: true,
    };
  }

  if (allConfirmed) {
    return {
      status: 'CONFIRMED',
      mallStatusCode: 'CONFIRMED',
      message: '송장 반영 확인 완료',
      confirmedItems,
      totalItems,
      allConfirmed: true,
      hasConflict: false,
      hasUncertain: false,
    };
  }

  if (confirmedItems > 0 && hasUncertain) {
    return {
      status: 'PARTIAL',
      mallStatusCode: 'PARTIAL',
      message: `${confirmedItems}/${totalItems}건만 반영이 확인되었습니다.`,
      confirmedItems,
      totalItems,
      allConfirmed: false,
      hasConflict: false,
      hasUncertain: true,
    };
  }

  const pendingMsg =
    input.decisions.find((d) => d.kind === 'PENDING')?.message ??
    '아직 네이버에 반영되지 않음 — 자동 재전송하지 말고 잠시 후 다시 확인하세요.';

  return {
    status: 'PENDING',
    mallStatusCode: 'PENDING',
    message: pendingMsg,
    confirmedItems,
    totalItems,
    allConfirmed: false,
    hasConflict: false,
    hasUncertain: true,
  };
}

export function isSmartstoreVerifiableAttemptStatus(input: {
  status: string;
  dispatchedAt: Date | string | null | undefined;
}): boolean {
  if (input.status === 'SUCCESS') return true;
  if (input.status === 'UNKNOWN' && input.dispatchedAt != null) return true;
  return false;
}

export function buildFallbackVerifyItemsFromProductOrderIds(input: {
  userId: string;
  integrationAccountId: string;
  productOrderIds: readonly string[];
  deliveryCompanyCode: string;
  trackingNumber: string;
}): ShipmentTransmissionItemResultSummary[] {
  return input.productOrderIds.map((productOrderId) => ({
    productOrderId,
    status: 'UNCERTAIN' as const,
    providerCode: null,
    message: null,
    shipmentFingerprint: buildSmartstoreItemShipmentFingerprint({
      userId: input.userId,
      integrationAccountId: input.integrationAccountId,
      productOrderId,
      deliveryCompanyCode: input.deliveryCompanyCode,
      trackingNumber: input.trackingNumber,
    }),
  }));
}
